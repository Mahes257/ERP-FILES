/* eslint-disable no-console */
// Browser-based ERP verification: UI rows vs API response counts vs DB counts.
// Captures Network (method/url/status) + response-body summaries per route.
// Usage: node scripts/verify-erp-browser.mjs [sales|marketing|production|all]
import { spawn } from 'node:child_process';
import { accessSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';

const BASE = 'http://localhost:5173';
const PORT = 9366;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ROUTES = {
  sales: [
    { path: '/clients', name: 'Customers' },
    { path: '/sales-orders', name: 'Sales Orders (CPO list)', probe: 'cpo' },
    { path: '/sales-orders/94', name: 'SO detail (id 94)' },
    { path: '/quotations', name: 'Quotations' },
    { path: '/sales-contracts', name: 'Sales Contracts' },
    { path: '/invoices', name: 'Invoices' },
    { path: '/payment-receipts', name: 'Payment Receipts' },
    { path: '/delivery-challans', name: 'Delivery Challans' },
    { path: '/credit-notes', name: 'Credit Notes' },
    { path: '/proforma-invoices', name: 'Proforma Invoices' },
  ],
  marketing: [
    { path: '/leads', name: 'Leads' },
    { path: '/marketing', name: 'Marketing Hub' },
    { path: '/marketing/visits', name: 'Visit Summary' },
    { path: '/marketing/follow-ups', name: 'Marketing Follow-ups' },
    { path: '/followups', name: 'CRM Follow-ups' },
    { path: '/marketing/travel-planners', name: 'Travel Planners' },
    { path: '/marketing/q-forms', name: 'Questionnaire Forms' },
    { path: '/marketing/expenses', name: 'Marketing Expenses' },
  ],
  production: [
    { path: '/production', name: 'Production Dashboard' },
    { path: '/production/orders', name: 'Production Orders' },
    { path: '/production/technical-verification', name: 'Technical Verification' },
    { path: '/production/drawings', name: 'Drawings' },
    { path: '/production/models', name: 'Models' },
    { path: '/production/casting', name: 'Casting' },
    { path: '/production/fabrication', name: 'Fabrication' },
    { path: '/production/assembly', name: 'Assembly' },
    { path: '/production/quality', name: 'Quality' },
    { path: '/production/packing', name: 'Packing' },
    { path: '/production/dispatch', name: 'Dispatch' },
  ],
};

const exe = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  (process.env.LOCALAPPDATA || '') + '\\Google\\Chrome\\Application\\chrome.exe',
].find((p) => { try { accessSync(p); return true; } catch { return false; } });
const OUT = mkdtempSync(join(tmpdir(), 'erp-verify-'));
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
    if (r.exceptionDetails) return { err: JSON.stringify(r.exceptionDetails).slice(0, 200) };
    return r.result?.value;
  }
}

function summarize(raw) {
  try {
    const j = JSON.parse(raw);
    const findArr = (o, depth = 0) => {
      if (depth > 4) return null;
      if (Array.isArray(o)) return o;
      if (o && typeof o === 'object') {
        for (const k of Object.keys(o)) {
          const v = findArr(o[k], depth + 1);
          if (v) return v;
        }
      }
      return null;
    };
    const arr = findArr(j);
    if (arr && arr.length >= 0) {
      const sample = arr.slice(0, 1).map((o) => {
        const s = JSON.stringify(o);
        return s.length > 150 ? s.slice(0, 150) + '…' : s;
      });
      return { kind: 'list', count: arr.length, sample };
    }
    return { kind: 'obj', excerpt: raw.slice(0, 130) };
  } catch {
    return { kind: 'text', excerpt: raw.slice(0, 130) };
  }
}

async function main() {
  const which = (process.argv[2] || 'all').toLowerCase();
  const routes = which === 'all' ? [...ROUTES.sales, ...ROUTES.marketing, ...ROUTES.production]
    : ROUTES[which] || ROUTES.all;
  if (!routes) { console.error('unknown module'); process.exit(1); }

  const cdp = new C(await ws());
  await cdp.open();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Network.enable');

  const api = []; // entries since last flush
  cdp.w.on('message', (raw) => {
    const m = JSON.parse(raw.toString());
    if (m.method === 'Network.responseReceived') {
      const { requestId, response } = m.params;
      const url = response.url || '';
      if (/\/v1\/|\/api\//.test(url) && !/\/auth\//.test(url)) {
        api.push({ id: requestId, url: url.split('?')[0], status: response.status, method: null });
      }
    }
  });

  // login
  await cdp.send('Page.navigate', { url: BASE + '/signin' });
  await sleep(2200);
  await cdp.eval(`(async () => {
    const r = await fetch('/v1/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@vishaktech.com', password: 'Admin@123' }) });
    const d = (await r.json()).data;
    localStorage.setItem('authToken', d.token);
    localStorage.setItem('refreshToken', d.refreshToken || '');
    return 'ok';
  })()`);
  await sleep(800);

  const report = [];
  for (const route of routes) {
    api.length = 0;
    await cdp.send('Page.navigate', { url: BASE + route.path });
    await sleep(route.path === '/production' ? 7000 : 4500);

    // get response bodies for collected requests
    const calls = [];
    for (const e of api) {
      let body = null;
      try {
        const b = await cdp.send('Network.getResponseBody', { requestId: e.id });
        body = b && b.body ? summarize(b.body) : null;
      } catch { body = { kind: 'unavailable' }; }
      calls.push({ url: e.url, status: e.status, body });
    }

    const dom = await cdp.eval(`(() => {
      const q = (s) => document.querySelector(s);
      const rowSel = ['tbody tr', 'table tbody tr', '.data-table tbody tr', '.table tbody tr'];
      let rows = 0, sel = null;
      for (const s of rowSel) { const n = document.querySelectorAll(s).length; if (n > 0) { rows = n; sel = s; break; } }
      const h1 = q('h1')?.textContent.trim() || q('.page-title')?.textContent.trim() || '';
      const body = document.body.textContent;
      const probe = {};
      if (location.pathname === '/sales-orders') {
        probe.cpoShown = body.includes('CPO-2026-000001');
        probe.soShown = body.includes('SO-2026-000001');
        const row = q('tbody tr')?.textContent.replace(/\\s+/g, ' ').trim().slice(0, 90) || null;
        probe.firstRow = row;
      }
      if (location.pathname === '/production') {
        probe.tvKpi = (body.match(/Technical Verification[^0-9]{0,40}([0-9,]+)/i) || [])[1] || null;
        probe.tvKpi2 = (body.match(/([0-9,]+)[^0-9]{0,40}Technical Verification/i) || [])[1] || null;
        probe.hasOrdersKpi = body.includes('Production Orders');
      }
      if (location.pathname === '/production/orders') {
        probe.hasWO1 = body.includes('WO-0001');
        probe.hasTestPO = body.includes('TEST-PO-001');
      }
      if (location.pathname === '/production/technical-verification') {
        probe.firstRow = q('tbody tr')?.textContent.replace(/\\s+/g, ' ').trim().slice(0, 80) || null;
      }
      if (location.pathname === '/production/dispatch') {
        probe.hasWO0008 = body.includes('WO-0008');
        probe.hasDISP013 = body.includes('DISP-013');
      }
      if (location.pathname === '/production/drawings' || location.pathname === '/production/models') {
        const cards = document.querySelectorAll('[class*=card]').length;
        probe.cards = cards;
        const names = (body.match(/DWG-TEST-\\d{3}|MODEL-TEST-\\d{3}/g) || []).slice(0, 3);
        probe.sampleNames = names;
      }
      if (location.pathname === '/production') {
        const kv = [];
        document.querySelectorAll('*').forEach((el) => {
          if (el.children.length === 0) {
            const t = el.textContent.trim();
            if (/^(\\d[\\d,]*)$/.test(t) && el.parentElement && el.parentElement.textContent.length < 60) {
              kv.push(el.parentElement.textContent.replace(/\\s+/g, ' ').trim().slice(0, 50));
            }
          }
        });
        probe.kpiPairs = kv.slice(0, 24);
      }
      return { h1, rows, rowsSel: sel, probe };
    })()`);

    report.push({
      module: which,
      path: route.path,
      name: route.name,
      heading: dom.h1,
      uiRows: dom.rows,
      uiRowsSel: dom.rowsSel,
      probe: dom.probe,
      api: calls,
    });
  }

  // Condensed output
  for (const r of report) {
    console.log(`\n=== ${r.name} (${r.path}) | h1: "${r.heading || '-'}" | UI rows: ${r.uiRows}${r.uiRowsSel ? ' (' + r.uiRowsSel + ')' : ''}`);
    if (r.probe && Object.keys(r.probe).length) console.log('   probe:', JSON.stringify(r.probe));
    for (const c of r.api.slice(0, 8)) {
      let extra = '';
      if (c.body && c.body.kind === 'list') extra = ` count=${c.body.count}` + (c.body.sample && c.body.sample[0] ? ` first=${c.body.sample[0]}` : '');
      else if (c.body && c.body.excerpt) extra = ` ${c.body.excerpt}`;
      console.log(`   ${c.status} ${c.url}${extra}`);
    }
    if (r.api.length > 8) console.log(`   … +${r.api.length - 8} more API calls`);
  }
  process.exit(0);
}
main().catch((e) => { console.error('ERR', e.message); process.exit(1); });