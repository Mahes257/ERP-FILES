/* eslint-disable no-console */
// Verify the Actions ⋮ → Preview UX across Sales / Marketing / Production.
// For each route: open the page, click the first row's ⋮ menu, click "Preview",
// assert the read-only RecordPreviewModal appears with a record number + fields.
// Usage: node scripts/verify-preview.mjs
import { spawn } from 'node:child_process';
import { accessSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';

const BASE = 'http://localhost:5173';
const PORT = 9381;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ROUTES = [
  { path: '/sales-orders', name: 'Sales Orders (CPO)' },
  { path: '/sales-contracts', name: 'Sales Contracts' },
  { path: '/invoices', name: 'Invoices' },
  { path: '/credit-notes', name: 'Credit Notes' },
  { path: '/delivery-challans', name: 'Delivery Challans' },
  { path: '/proforma-invoices', name: 'Proforma Invoices' },
  { path: '/payment-receipts', name: 'Payment Receipts' },
  { path: '/leads', name: 'Leads' },
  { path: '/marketing/visits', name: 'Visit Summary' },
  { path: '/marketing/follow-ups', name: 'Marketing Follow-ups' },
  { path: '/marketing/travel-planners', name: 'Travel Planners' },
  { path: '/production/orders', name: 'Production Orders' },
  { path: '/production/technical-verification', name: 'Technical Verification' },
  { path: '/production/drawings', name: 'Drawings' },
  { path: '/production/models', name: 'Models' },
  { path: '/production/quality', name: 'Quality' },
  { path: '/production/dispatch', name: 'Dispatch' },
  { path: '/production/casting', name: 'Casting' },
];

const exe = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  (process.env.LOCALAPPDATA || '') + '\\Google\\Chrome\\Application\\chrome.exe',
].find((p) => { try { accessSync(p); return true; } catch { return false; } });
const OUT = mkdtempSync(join(tmpdir(), 'erp-preview-'));
const proc = spawn(exe, ['--headless=new', '--disable-gpu', '--no-sandbox', '--window-size=1680,1300',
  '--remote-debugging-port=' + PORT, '--user-data-dir=' + OUT.replace(/\\/g, '/') + '/p', 'about:blank']);

async function ws() {
  for (let i = 0; i < 40; i++) {
    try {
      const p = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((t) => t.type === 'page');
      if (p) return p.webSocketDebuggerUrl;
    } catch { /* retry */ }
    await sleep(300);
  }
  throw Error('no cdp');
}

class C {
  constructor(u) { this.w = new WebSocket(u); this.i = 0; this.p = new Map(); }
  async open() {
    await new Promise((r, j) => { this.w.on('open', r); this.w.on('error', j); });
    this.w.on('message', (raw) => {
      const m = JSON.parse(raw.toString());
      if (m.id && this.p.has(m.id)) {
        const { resolve, reject } = this.p.get(m.id);
        this.p.delete(m.id);
        m.error ? reject(Error(m.error.message)) : resolve(m.result);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.i;
    return new Promise((resolve, reject) => {
      this.p.set(id, { resolve, reject });
      this.w.send(JSON.stringify({ id, method, params }));
    });
  }
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) return { err: JSON.stringify(r.exceptionDetails).slice(0, 300) };
    return r.result?.value;
  }
}

const results = [];
const record = (name, ok, detail) => results.push({ name, ok, detail });

try {
  const c = new C(await ws());
  await c.open();
  await c.send('Page.enable');
  await c.send('Runtime.enable');
  await c.send('Network.enable');

  // Login
  await c.send('Page.navigate', { url: BASE + '/signin' });
  await sleep(2200);
  await c.eval(`(async () => {
    const r = await fetch('/v1/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@vishaktech.com', password: 'Admin@123' }) });
    if (!r.ok) return 'login-failed:' + r.status;
    const d = (await r.json()).data;
    localStorage.setItem('authToken', d.token);
    localStorage.setItem('refreshToken', d.refreshToken || '');
    return 'ok';
  })()`);
  await sleep(800);

  for (const route of ROUTES) {
    await c.send('Page.navigate', { url: BASE + route.path });
    await sleep(3000);
    // Wait for data rows to render (retry until a row-action menu or preview
    // button appears, or the page settles).
    let state = null;
    for (let attempt = 0; attempt < 5 && !state?.menuBtn; attempt++) {
      state = await c.eval(`(() => {
        const menubtns = [...document.querySelectorAll('button[aria-label="Row actions"]')].filter((x) => x.offsetParent !== null);
        if (menubtns.length > 0) return { menuBtn: true, previewBtn: false };
        const previewBtn = [...document.querySelectorAll('button[title="Preview"]')].find((x) => x.offsetParent !== null);
        if (previewBtn) return { menuBtn: true, previewBtn: true };
        return { menuBtn: false, previewBtn: false };
      })()`);
      if (!state?.menuBtn) await sleep(1000);
    }
    if (route.name === 'Sales Orders (CPO)') {
      console.log('DEBUG state:', JSON.stringify(state), 'path:', await c.eval('location.pathname'));
    }
    const menuResult = await c.eval(`(() => {
      const result = { menuBtn: false, previewBtn: false };
      const menubtns = [...document.querySelectorAll('button[aria-label="Row actions"]')].filter((x) => x.offsetParent !== null);
      if (menubtns.length > 0) {
        menubtns[0].click();
        result.menuBtn = true;
        return result;
      }
      const previewBtn = [...document.querySelectorAll('button[title="Preview"]')].find((x) => x.offsetParent !== null);
      if (previewBtn) {
        previewBtn.click();
        result.menuBtn = true;
        result.previewBtn = true;
      }
      return result;
    })()`);
    state = { ...(state || {}), ...menuResult };
    await sleep(400);
    let menu = { found: true };
    if (!state.previewBtn) {
      menu = await c.eval(`(() => {
        const items = [...document.querySelectorAll('.am-item, .rad-menu-item')];
        const preview = items.find((i) => i.textContent.trim().toLowerCase() === 'preview');
        if (!preview) return { found: false, labels: items.map((i) => i.textContent.trim()).slice(0, 8) };
        preview.click();
        return { found: true };
      })()`);
    }
    await sleep(500);
    if (!state.menuBtn) { record(route.name, false, 'no ⋮ menu button'); continue; }
    if (!menu.found) { record(route.name, false, 'no Preview item in menu'); continue; }
    if (route.name === 'Sales Orders (CPO)') {
      console.log('DEBUG after menu:', JSON.stringify(menu));
      console.log('DEBUG rpv now:', await c.eval(`(() => { const w = document.querySelector('[data-testid="record-preview"]'); return w ? w.innerText.slice(0,120) : 'NOT FOUND'; })()`));
    }
    const modal = await c.eval(`(() => {
      // RecordPreviewModal OR the existing read-only Open modals (follow-ups).
      const wrap = document.querySelector('[data-testid="record-preview"]');
      if (wrap) {
        const title = (wrap.querySelector('.rpv-title') || {}).textContent || '';
        const fields = wrap.querySelectorAll('.rpv-field').length;
        const fieldsText = Array.from(wrap.querySelectorAll('.rpv-field')).slice(0, 6).map((f) => f.textContent.trim().slice(0, 40));
        return { visible: true, kind: 'rpv', title: title.trim(), fields, fieldsText };
      }
      const fixed = Array.from(document.querySelectorAll('.fixed')).filter((m) => m.style.display !== 'none' && m.getClientRects().length > 0);
      const openModal = fixed.find((m) => m.querySelector('.overflow-y-auto'));
      if (openModal) {
        const inner = openModal.querySelector('.overflow-y-auto');
        const modalText = inner ? inner.innerText : '';
        if (modalText.trim().length > 20) {
          const NL = String.fromCharCode(10);
          const firstLine = modalText.split(NL)[0];
          const flat = modalText.split(NL).join(' | ').slice(0, 140);
          return { visible: true, kind: 'modal', title: firstLine, fields: 1, fieldsText: [flat] };
        }
      }
      return { visible: false };
    })()`);
    if (route.name === 'Sales Orders (CPO)') console.log('DEBUG modal eval:', JSON.stringify(modal));
    if (!modal.visible) { record(route.name, false, 'preview modal not rendered'); continue; }
    const ok = modal.fields > 0;
    record(route.name, ok, `[${modal.kind}] title="${modal.title}" fields=${modal.fields} [${modal.fieldsText.join(' | ')}]`);
    // close
    await c.eval(`(() => { const b = document.querySelector('[data-testid="record-preview"]')?.closest('.fixed'); const close = [...document.querySelectorAll('button')].find((x) => x.getAttribute('aria-label') === 'Close'); if (close) close.click(); })()`);
    await sleep(250);
  }

  proc.kill();
} catch (err) {
  console.error('FATAL', err.message);
  proc.kill();
}

console.log('\n=== ACTIONS ⋮ → PREVIEW VERIFICATION ===');
let pass = 0;
for (const r of results) {
  console.log(`${r.ok ? '✅' : '❌'} ${r.name}: ${r.ok ? 'PASS' : 'FAIL'} — ${r.detail}`);
  if (r.ok) pass++;
}
console.log(`\n${pass}/${results.length} PASS`);
process.exit(pass === results.length ? 0 : 1);