/* eslint-disable no-console */
// Dev-only helper: logs into the running ERP (Vite :5173 -> backend :8080),
// opens the main /dashboard page and asserts the Marketing KPI cards render
// the real backend values (not 0).
// Usage: node scripts/verify-main-dashboard.mjs
import { spawn } from 'node:child_process';
import { accessSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';

const BASE = 'http://localhost:5173';
const OUT_DIR = mkdtempSync(join(tmpdir(), 'erp-mdash-'));

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
    '--window-size=1680,2200',
    '--hide-scrollbars',
    '--remote-debugging-port=9342',
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
      const res = await fetch('http://127.0.0.1:9342/json');
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
    this.events = [];
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
      } else if (msg.method) {
        this.events.push(msg);
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
  const apiResponses = [];
  cdp.ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      const text = (msg.params.args || []).map((a) => a.value ?? a.description ?? '').join(' ');
      if (!text.includes('favicon')) consoleErrors.push(text);
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      consoleErrors.push('EXCEPTION: ' + JSON.stringify(msg.params.exceptionDetails).slice(0, 300));
    }
    if (msg.method === 'Network.responseReceived' && msg.params.response.url.includes('/v1/marketing/dashboard')) {
      apiResponses.push({ url: msg.params.response.url, status: msg.params.response.status });
    }
  });

  // 1. Load origin + login
  await cdp.send('Page.navigate', { url: BASE + '/login' });
  await pollEval(cdp, 'document.readyState === "complete"', { label: 'login page load' });
  await sleep(1500);

  const loginOk = await cdp.eval(`(async () => {
    try {
      const res = await fetch('/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'admin@vishaktech.com', password: 'Admin@123' }),
      });
      const body = await res.json();
      if (!res.ok) return 'login HTTP ' + res.status + ': ' + JSON.stringify(body).slice(0, 300);
      const d = body.data || body;
      if (!d.token) return 'no token in response: ' + JSON.stringify(body).slice(0, 300);
      localStorage.setItem('authToken', d.token);
      localStorage.setItem('refreshToken', d.refreshToken || '');
      localStorage.setItem('authUser', JSON.stringify(d.user || { email: 'admin@vishaktech.com' }));
      return 'OK';
    } catch (e) { return 'login threw: ' + e.message; }
  })()`);
  console.log('login:', loginOk);
  if (loginOk !== 'OK') process.exit(1);

  // 2. Open the main Dashboard
  await cdp.send('Page.navigate', { url: BASE + '/dashboard' });
  await pollEval(cdp,
    'document.readyState === "complete" && !!document.querySelector("h1")',
    { label: 'dashboard mount' });
  await pollEval(cdp,
    `document.querySelectorAll('.qtn-kpi-count').length >= 24
      && !document.body.innerText.includes('Loading dashboard')`,
    { timeoutMs: 40000, label: 'KPI cards rendered' });
  await sleep(1200);

  // 3. Read all KPI cards (label -> value)
  const cards = await cdp.eval(`(() => {
    const labels = Array.from(document.querySelectorAll('.qtn-kpi-label')).map(e => e.innerText.trim());
    const values = Array.from(document.querySelectorAll('.qtn-kpi-count')).map(e => e.innerText.trim());
    return labels.map((label, i) => ({ label, value: values[i] }));
  })()`);
  console.log('KPI cards:');
  for (const c of cards) console.log('  ' + c.label.padEnd(24) + c.value);

  // 4. Assertions
  const map = Object.fromEntries(cards.map((c) => [c.label, c.value]));
  const expect = {
    'Total Visits': '8',
    "Today's Visits": '0',
    'Upcoming Visits': '0',
    'Overdue Follow-ups': '1',
    'Travel Plans': '4',
    'Q Forms': '27',
    'Marketing Expenses': '₹30,970',
    // Production KPIs (from GET /dashboard/stats — production_orders table)
    'Total Production Orders': '17',
    'Pending Approval': '3',
    'In Progress': '1',
    'On Hold': '0',
    'Completed': '1',
    'Average Progress': '0%',
  };
  let failures = 0;
  for (const [label, expected] of Object.entries(expect)) {
    const actual = map[label];
    const ok = actual === expected;
    if (!ok) failures++;
    console.log((ok ? 'PASS' : 'FAIL') + '  ' + label + ' = ' + JSON.stringify(actual) + ' (expected ' + JSON.stringify(expected) + ')');
  }
  // Marketing cards must NOT all be zero — the regression this fix targets
  if (['Total Visits', 'Travel Plans', 'Q Forms', 'Marketing Expenses'].every((l) => map[l] === '0')) {
    console.log('FAIL  Marketing KPIs are all zero — fix did not take effect');
    failures++;
  }
  // 5. Sales Workflow + Production Workflow — exact stage order, all present
  const stageTitles = await cdp.eval(`(() => {
    const read = (heading) => {
      const h3 = Array.from(document.querySelectorAll('h3')).find((h) => h.innerText.trim() === heading);
      const section = h3 ? h3.closest('.pr-table-card') : null;
      if (!section) return null;
      // Column headers are single-line buttons (row buttons contain label + count on two lines).
      return Array.from(section.querySelectorAll('button'))
        .map((b) => b.innerText.trim())
        .filter((t) => t && !t.includes(String.fromCharCode(10)));
    };
    return { sales: read('Sales Workflow'), production: read('Production Workflow') };
  })()`);
  const EXPECTED_SALES = ['Leads', 'Clients', 'Follow-ups', 'CPR', 'CPR TV', 'Cost Workout', 'Profit Workout', 'Quotations', 'Sales Contracts', 'CPO', 'Production', 'QC', 'Packing', 'Dispatch', 'Proforma Invoices', 'Delivery Challans', 'Invoices', 'Credit Notes', 'Payment Receipts'];
  const EXPECTED_PROD = ['Production Dashboard', 'Production Orders', 'Technical Verification', 'Drawings', 'Models', 'Casting', 'Fabrication', 'Assembly', 'Quality', 'Packing', 'Dispatch'];
  console.log('Sales Workflow stages:', JSON.stringify(stageTitles?.sales));
  console.log('Production Workflow stages:', JSON.stringify(stageTitles?.production));
  const same = (a, b) => !!a && a.length === b.length && a.every((v, i) => v.toUpperCase() === b[i].toUpperCase());
  if (!same(stageTitles?.sales, EXPECTED_SALES)) { console.log('FAIL  Sales Workflow order mismatch'); failures++; }
  else console.log('PASS  Sales Workflow has all 19 stages in exact order');
  if (!same(stageTitles?.production, EXPECTED_PROD)) { console.log('FAIL  Production Workflow order mismatch'); failures++; }
  else console.log('PASS  Production Workflow has all 11 stages in exact sidebar order');

  console.log('marketing/dashboard API responses:', JSON.stringify(apiResponses));
  console.log('console errors:', consoleErrors.length ? consoleErrors : '(none)');
  if (apiResponses.length && !apiResponses.every((r) => r.status >= 200 && r.status < 300)) failures++;

  const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  const { writeFileSync } = await import('node:fs');
  writeFileSync(OUT_DIR + '/main-dashboard.png', Buffer.from(shot.data, 'base64'));
  console.log('screenshot saved:', OUT_DIR + '/main-dashboard.png');

  proc.kill();
  process.exit(failures || consoleErrors.length ? 1 : 0);
}

main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });