/* eslint-disable no-console */
// Dev-only helper: logs into the running ERP (Vite :5173 -> backend :8080),
// opens Production -> Production Orders, opens the Create Work Order form and
// verifies the CPO Reference dropdown (real CPO numbers from Sales, constrained
// layout, loading/empty/error handling) plus the relabelled list columns.
// Usage: node scripts/verify-cpo-workorder.mjs
import { spawn } from 'node:child_process';
import { accessSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';

const BASE = 'http://localhost:5173';
const OUT_DIR = mkdtempSync(join(tmpdir(), 'erp-cpo-wo-'));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function chromePath() {
  return [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    (process.env.LOCALAPPDATA || '') + '\\Google\\Chrome\\Application\\chrome.exe',
  ].filter(Boolean);
}

function launchChrome() {
  const exe = chromePath().find((p) => {
    try { accessSync(p); return true; } catch { return false; }
  });
  if (!exe) throw new Error('Chrome not found — set CHROME_PATH');
  const proc = spawn(exe, [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--no-proxy-server',
    '--window-size=1680,1400',
    '--hide-scrollbars',
    '--remote-debugging-port=9344',
    '--user-data-dir=' + OUT_DIR.replace(/\\/g, '/') + '/profile',
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  proc.stderr.on('data', (d) => process.stderr.write('[chrome] ' + d.toString()));
  proc.on('error', (e) => process.stderr.write('[chrome spawn error] ' + e.message + '\n'));
  return proc;
}

async function getPageWs() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch('http://127.0.0.1:9344/json');
      const targets = await res.json();
      const page = targets.find((t) => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* retry */ }
    await sleep(300);
  }
  throw new Error('CDP not reachable');
}

class Cdp {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 0;
    this.pending = new Map();
  }
  async open() {
    await new Promise((resolve, reject) => {
      this.ws.on('open', resolve);
      this.ws.on('error', reject);
    });
    this.ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async eval(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (res.exceptionDetails) {
      throw new Error('page JS error: ' + JSON.stringify(res.exceptionDetails).slice(0, 500));
    }
    return res.result?.value;
  }
}

async function pollEval(cdp, expr, { timeoutMs = 30000, intervalMs = 400, label = 'condition' } = {}) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    try {
      last = await cdp.eval(expr);
      if (last) return last;
    } catch { /* page may be navigating */ }
    await sleep(intervalMs);
  }
  throw new Error('timeout waiting for ' + label + ' (last=' + JSON.stringify(last) + ')');
}

async function main() {
  const proc = launchChrome();
  const wsUrl = await getPageWs();
  const cdp = new Cdp(wsUrl);
  await cdp.open();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Network.enable');

  const consoleErrors = [];
  const cpoApi = [];
  cdp.ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      const text = (msg.params.args || []).map((a) => a.value ?? a.description ?? '').join(' ');
      if (!text.includes('favicon')) consoleErrors.push(text);
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      consoleErrors.push('EXCEPTION: ' + JSON.stringify(msg.params.exceptionDetails).slice(0, 300));
    }
    if (msg.method === 'Network.responseReceived') {
      const u = msg.params.response.url;
      if (u.includes('/v1/sales-orders') || u.includes('/v1/production-orders')) {
        cpoApi.push({ url: u.split('?')[0], status: msg.params.response.status });
      }
    }
  });

  let failures = 0;
  const check = (ok, label, detail = '') => {
    if (!ok) failures++;
    console.log((ok ? 'PASS' : 'FAIL') + '  ' + label + (detail ? ' — ' + detail : ''));
  };

  // 1. Load origin + login
  await cdp.send('Page.navigate', { url: BASE + '/login' });
  await pollEval(cdp, 'document.readyState === "complete"', { label: 'login page load' });
  await sleep(1200);
  const loginOk = await cdp.eval(`(async () => {
    try {
      const res = await fetch('/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'admin@vishaktech.com', password: 'Admin@123' }),
      });
      const body = await res.json();
      if (!res.ok) return 'login HTTP ' + res.status;
      const d = body.data || body;
      if (!d.token) return 'no token';
      localStorage.setItem('authToken', d.token);
      localStorage.setItem('refreshToken', d.refreshToken || '');
      localStorage.setItem('authUser', JSON.stringify(d.user || { email: 'admin@vishaktech.com' }));
      return 'OK';
    } catch (e) { return 'login threw: ' + e.message; }
  })()`);
  check(loginOk === 'OK', 'login', loginOk);
  if (loginOk !== 'OK') { proc.kill(); process.exit(1); }

  // 2. Production Orders page
  await cdp.send('Page.navigate', { url: BASE + '/production/orders' });
  await pollEval(cdp, 'document.readyState === "complete" && !!document.querySelector(".po-prod-title")',
    { label: 'orders page mount' });
  await sleep(1200);

  // Table headers should now say CPO Reference (not Sales Order)
  const headers = await cdp.eval(`Array.from(document.querySelectorAll('th')).map((th) => th.innerText.trim().toUpperCase())`);
  check(headers.includes('CPO REFERENCE'), 'Orders table has CPO Reference column', headers.join(', '));
  check(!headers.includes('SALES ORDER'), 'Orders table no longer has "Sales Order" column');

  // 3. Open Create Work Order
  await cdp.eval(`(() => {
    const btn = Array.from(document.querySelectorAll('button')).find((b) => b.innerText.includes('Create Work Order'));
    if (btn) btn.click();
    return !!btn;
  })()`);
  await pollEval(cdp, '!!document.querySelector("#production-order-form")', { label: 'work order form open' });
  await sleep(1500);

  // 4. Layout — form must be a constrained centered card, not full width
  const layout = await cdp.eval(`(() => {
    const form = document.querySelector('#production-order-form');
    const r = form.getBoundingClientRect();
    const select = document.querySelector('select[aria-label="CPO Reference"]');
    const sr = select ? select.getBoundingClientRect() : null;
    return {
      formWidth: Math.round(r.width),
      formLeft: Math.round(r.left),
      viewport: Math.round(window.innerWidth),
      selectHeight: sr ? Math.round(sr.height) : null,
    };
  })()`);
  console.log('layout:', JSON.stringify(layout));
  check(layout.formWidth <= 1250, 'form width constrained (<=1250px)', layout.formWidth + 'px');
  check(layout.formWidth < layout.viewport - 150, 'form does not span ~full content width',
    layout.formWidth + ' vs viewport ' + layout.viewport);
  check(layout.selectHeight != null && layout.selectHeight < 60, 'CPO select is a normal field height', layout.selectHeight + 'px');

  // 5. Label / placeholder / options
  const labelText = await cdp.eval(`(() => {
    const lbl = Array.from(document.querySelectorAll('#production-order-form .form-label'))
      .find((l) => l.innerText.includes('CPO Reference'));
    return lbl ? lbl.innerText.trim() : null;
  })()`);
  check(labelText === 'CPO Reference *', 'field label is "CPO Reference *"', JSON.stringify(labelText));

  const aria = await cdp.eval(`document.querySelector('select[aria-label="CPO Reference"]') ? 'ok' : null`);
  check(aria === 'ok', 'select aria-label is "CPO Reference"');

  // Wait for real CPO options to load from /v1/sales-orders
  await pollEval(cdp, `(() => {
    const sel = document.querySelector('select[aria-label="CPO Reference"]');
    if (!sel) return false;
    return Array.from(sel.options).some((o) => o.textContent.includes('CPO-2026-0000'));
  })()`, { timeoutMs: 30000, label: 'CPO options loaded from Sales API' });

  const opts = await cdp.eval(`(() => {
    const sel = document.querySelector('select[aria-label="CPO Reference"]');
    const opts = Array.from(sel.options).map((o) => o.textContent.trim());
    return {
      placeholder: opts[0],
      count: opts.length - 1,
      sample: opts.slice(1, 4),
      has024: opts.some((t) => t.startsWith('CPO-2026-000024')),
      has023: opts.some((t) => t.startsWith('CPO-2026-000023')),
    };
  })()`);
  console.log('options:', JSON.stringify(opts, null, 1));
  check(opts.placeholder.includes('Select a CPO (Customer Purchase Order)...'),
    'placeholder is "Select a CPO (Customer Purchase Order)..."', opts.placeholder);
  check(opts.count >= 20, 'CPO options come from real Sales data (24 total)', opts.count + ' options');
  check(opts.has024 && opts.has023, 'options display CPO numbers (CPO-2026-000024/23)', '');
  check(opts.sample.every((t) => t.includes('·') && t.includes('item')),
    'options show item counts', opts.sample.join(' | '));
  check(opts.sample.some((t) => t.includes('PO:')), 'options show PO date', '');
  check(opts.sample.some((t) => /CPO-2026-00002\d · 1 item · [A-Za-z]/.test(t)),
    'options show customer name', '');

  // 6. Select CPO-2026-000023 → customer auto-fills from the CPO
  const selected = await cdp.eval(`(() => {
    const sel = document.querySelector('select[aria-label="CPO Reference"]');
    const target = Array.from(sel.options).find((o) => o.textContent.startsWith('CPO-2026-000023'));
    if (!target) return 'not found';
    sel.value = target.value;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return target.textContent.trim();
  })()`);
  await sleep(600);
  const custVal = await cdp.eval(`(() => {
    const inputs = Array.from(document.querySelectorAll('#production-order-form .form-input'));
    const cust = inputs.find((i) => i.placeholder === 'Customer name');
    return cust ? cust.value : null;
  })()`);
  console.log('selected:', selected, '| customer autofilled:', JSON.stringify(custVal));
  check(/^Acme Trading 10$/.test(custVal || ''), 'customer auto-fills from linked CPO', JSON.stringify(custVal));

  // 7. Selected-CPO info line appears under the dropdown
  const info = await cdp.eval(`(() => {
    const el = document.querySelector('#production-order-form .cpo-select-info');
    return el ? el.innerText.trim() : null;
  })()`);
  console.log('cpo info line:', JSON.stringify(info));
  check(!!info && info.includes('CPO-2026-000023') && info.includes('Acme Trading 10'),
    'selected CPO summary shown below dropdown', JSON.stringify(info));

  // 8. Existing orders still render (list shows real records)
  const woNumbers = await cdp.eval(`Array.from(document.querySelectorAll('tbody tr')).slice(0, 3)
    .map((tr) => tr.innerText.split('\\n')[0])`);
  check(woNumbers.some((w) => /WO-\d+/.test(w)), 'existing Work Orders still listed', woNumbers.join(', '));

  // 9. console errors + API auth
  check(consoleErrors.length === 0, 'no console errors', consoleErrors.length ? consoleErrors.join(' | ') : '(none)');
  check(cpoApi.every((r) => r.status >= 200 && r.status < 300) && cpoApi.length >= 2,
    'authenticated /sales-orders + /production-orders API calls', JSON.stringify(cpoApi));

  const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  const { writeFileSync } = await import('node:fs');
  writeFileSync(OUT_DIR + '/create-work-order.png', Buffer.from(shot.data, 'base64'));
  console.log('screenshot saved:', OUT_DIR + '/create-work-order.png');

  proc.kill();
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
