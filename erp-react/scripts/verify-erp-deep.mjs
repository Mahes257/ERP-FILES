/* eslint-disable no-console */
// Deep browser verification: raw API shapes, KPI sources, CPO dropdown + create cycle.
// Create flow uses a REAL CPO; the created work order is deleted afterwards via API (cleanup).
import { spawn } from 'node:child_process';
import { accessSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';

const BASE = 'http://localhost:5173';
const PORT = 9367;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const exe = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  (process.env.LOCALAPPDATA || '') + '\\Google\\Chrome\\Application\\chrome.exe',
].find((p) => { try { accessSync(p); return true; } catch { return false; } });
const OUT = mkdtempSync(join(tmpdir(), 'erp-deep-'));
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
    if (r.exceptionDetails) return { err: JSON.stringify(r.exceptionDetails).slice(0, 250) };
    return r.result?.value;
  }
}

// helpers inside the page
const fetchJson = (path) => `(async () => {
  const h = { Authorization: 'Bearer ' + localStorage.getItem('authToken') };
  const r = await fetch('/v1' + ${JSON.stringify(path)}, { headers: h });
  let body = null; try { body = await r.json(); } catch {}
  const arr = (o, d = 0) => { if (d > 5) return null; if (Array.isArray(o)) return o;
    if (o && typeof o === 'object') { for (const k of Object.keys(o)) { const v = arr(o[k], d + 1); if (v) return v; } } return null; };
  const a = body ? arr(body) : null;
  const first = a && a.length ? JSON.stringify(a[0]).slice(0, 260) : null;
  const total = body && body.data && typeof body.data.totalElements !== 'undefined' ? body.data.totalElements : null;
  return { status: r.status, arrLen: a ? a.length : null, total, firstKeys: a && a.length ? Object.keys(a[0]).slice(0, 14) : null, first };
})()`;

async function main() {
  const cdp = new C(await ws());
  await cdp.open();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Network.enable');

  // request tracking incl. POST payloads
  const reqs = new Map(); // id -> {method,url,postData}
  const api = []; // entries since last flush
  cdp.w.on('message', (raw) => {
    const m = JSON.parse(raw.toString());
    if (m.method === 'Network.requestWillBeSent') {
      const { requestId, request } = m.params;
      if (/\/v1\//.test(request.url) && !/\/auth\//.test(request.url)) {
        reqs.set(requestId, { method: request.method, url: request.url, postData: request.postData || null });
      }
    }
    if (m.method === 'Network.responseReceived') {
      const { requestId, response } = m.params;
      const info = reqs.get(requestId);
      if (info) api.push({ id: requestId, method: info.method, url: info.url.split('?')[0], status: response.status, postData: info.postData });
    }
  });

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

  // ---- A. Raw API shapes (customers/leads/followups/q-forms/expenses) ----
  for (const p of ['/customers?page=0&size=10', '/leads?page=0&size=10', '/followups?page=0&size=10',
    '/marketing/q-forms?page=0&size=50', '/marketing/expenses?page=0&size=50', '/marketing/visits?page=0&size=50']) {
    console.log('RAW', p, JSON.stringify(await cdp.eval(fetchJson(p))));
  }

  // ---- B. Visit Summary page ----
  await cdp.send('Page.navigate', { url: BASE + '/marketing/visits' });
  await sleep(4500);
  const visitsDom = await cdp.eval(`(() => ({
    h1: document.querySelector('h1')?.textContent.trim() || '',
    rows: document.querySelectorAll('tbody tr').length,
    hasABC: document.body.textContent.includes('ABC Industries'),
    hasUltra: document.body.textContent.includes('UltraTech'),
    bodySnippet: document.body.textContent.replace(/\\s+/g,' ').slice(0, 200),
  }))()`);
  console.log('VISITS_PAGE', JSON.stringify(visitsDom));
  const visitsApi = api.splice(0).filter((e) => !/axiosInstance|notifications|exchange|approvals|auth/.test(e.url));
  console.log('VISITS_API', JSON.stringify(visitsApi.map((e) => ({ m: e.method, u: e.url, s: e.status }))));

  // ---- C. Marketing follow-ups page (where do marketing_followups rows appear?) ----
  await cdp.send('Page.navigate', { url: BASE + '/marketing/follow-ups' });
  await sleep(4500);
  const fuDom = await cdp.eval(`(() => {
    const rows = [...document.querySelectorAll('tbody tr')].map((r) => r.textContent.replace(/\\s+/g,' ').trim().slice(0,70));
    return { rows: rows.slice(0, 12), bodyHasPending: document.body.textContent.includes('Pending') };
  })()`);
  console.log('MKT_FU_PAGE', JSON.stringify(fuDom));
  const fuApi = api.splice(0).filter((e) => !/axiosInstance|notifications|exchange|approvals|auth/.test(e.url));
  console.log('MKT_FU_API', JSON.stringify(fuApi.map((e) => ({ m: e.method, u: e.url, s: e.status }))));

  // ---- D. Production Orders page: which WOs on page 1, CPO column for TEST-PO ----
  await cdp.send('Page.navigate', { url: BASE + '/production/orders' });
  await sleep(5000);
  const poDom = await cdp.eval(`(() => {
    const rows = [...document.querySelectorAll('tbody tr')].map((r) => r.textContent.replace(/\\s+/g,' ').trim().slice(0,80));
    return { rows: rows.slice(0, 12), pageInfo: (document.body.textContent.match(/Showing[^\\n]{0,60}/) || [''])[0] };
  })()`);
  console.log('PO_PAGE1', JSON.stringify(poDom));

  // ---- E. Technical Verification page source + dashboard KPI ----
  await cdp.send('Page.navigate', { url: BASE + '/production/technical-verification' });
  await sleep(5000);
  const tvDom = await cdp.eval(`(() => {
    const rows = [...document.querySelectorAll('tbody tr')].map((r) => r.textContent.replace(/\\s+/g,' ').trim().slice(0,70));
    return { rows: rows.slice(0, 12), h1: document.querySelector('h1')?.textContent.trim() || '' };
  })()`);
  console.log('TV_PAGE', JSON.stringify(tvDom));
  const tvApi = api.splice(0).filter((e) => !/axiosInstance|notifications|exchange|approvals|auth/.test(e.url));
  console.log('TV_API', JSON.stringify(tvApi.map((e) => ({ m: e.method, u: e.url, s: e.status }))));

  await cdp.send('Page.navigate', { url: BASE + '/production' });
  await sleep(6500);
  const dashApi = api.splice(0).filter((e) => !/axiosInstance|notifications|exchange|approvals|auth/.test(e.url));
  console.log('DASH_API', JSON.stringify(dashApi.map((e) => ({ m: e.method, u: e.url, s: e.status }))));
  const tvKpi = await cdp.eval(`(() => {
    const els = [...document.querySelectorAll('*')].filter((el) => el.children.length === 0 &&
      /technical verification/i.test(el.textContent) && el.textContent.length < 40);
    return els.map((el) => el.parentElement.textContent.replace(/\\s+/g,' ').trim().slice(0, 60));
  })()`);
  console.log('DASH_TV_KPI', JSON.stringify(tvKpi));

  // ---- F. Dispatch orphan row ----
  await cdp.send('Page.navigate', { url: BASE + '/production/dispatch' });
  await sleep(4500);
  const dispRow = await cdp.eval(`(() => {
    const rows = [...document.querySelectorAll('tbody tr')].map((r) => r.textContent.replace(/\\s+/g,' ').trim().slice(0,80));
    return rows.filter((r) => r.includes('WO-0008') || r.includes('DISP-013'));
  })()`);
  console.log('DISPATCH_ORPHAN_ROW', JSON.stringify(dispRow));

  // ---- G. CPO dropdown + create cycle with a REAL CPO (SO-2026-000024 / id 126) ----
  await cdp.send('Page.navigate', { url: BASE + '/production/orders/new' });
  await sleep(5000);
  const dd = await cdp.eval(`(() => {
    const sel = document.querySelector('#production-order-form select');
    if (!sel) return { noSelect: true };
    const opts = [...sel.options].map((o) => ({ v: o.value, t: o.textContent }));
    const cpos = opts.filter((o) => o.t.includes('CPO-'));
    return { totalOpts: opts.length, cpoOpts: cpos.length, sample: cpos.slice(0, 3), hasOne: cpos.some((o) => o.t.includes('CPO-2026-000001')), has24: cpos.some((o) => o.t.includes('CPO-2026-000024')) };
  })()`);
  console.log('CPO_DROPDOWN', JSON.stringify(dd));
  const ddApi = api.splice(0).filter((e) => /sales-orders|production-orders/.test(e.url));
  console.log('CPO_DROPDOWN_API', JSON.stringify(ddApi.map((e) => ({ m: e.method, u: e.url, s: e.status, post: e.postData ? e.postData.slice(0, 120) : null }))));

  // select CPO-2026-000024, fill dates + item, save, capture POST
  const created = await cdp.eval(`(async () => {
    const sel = document.querySelector('#production-order-form select');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
    setter.call(sel, '126');
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 300));
    const form = document.querySelector('#production-order-form');
    const ins = [...form.querySelectorAll('input')];
    const setIn = (el, v) => { const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; s.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
    const desc = ins.find((i) => (i.placeholder || '').includes('Item name'));
    const qty = ins.find((i) => (i.placeholder || '').includes('0') && i.type === 'number') || ins.find((i) => i.type === 'number');
    const dates = [...form.querySelectorAll('input[type=date]')];
    setIn(desc, 'Verify Browser CPO Product');
    setIn(qty, '3');
    const iso = (d) => d.toISOString().slice(0, 10);
    setIn(dates[0], iso(new Date()));
    setIn(dates[1], iso(new Date(Date.now() + 10 * 86400000)));
    return { selValue: sel.value, selText: sel.selectedOptions[0]?.textContent.slice(0, 60), customer: (form.textContent.match(/Select a CPO[^\\n]*/) || [])[0] };
  })()`);
  console.log('CREATE_PREFILL', JSON.stringify(created));
  await sleep(600);
  // capture POST
  api.length = 0;
  await cdp.eval(`(() => { const s = [...document.querySelectorAll('button')].find((b) => /^\\s*Save\\s*$/.test(b.textContent)); if (s) s.click(); return !!s; })()`);
  await sleep(4500);
  const post = api.filter((e) => e.method === 'POST');
  console.log('CREATE_POST', JSON.stringify(post.map((e) => ({ u: e.url, s: e.status, body: e.postData ? e.postData.slice(0, 400) : null }))));
  console.log('AFTER_SAVE_PATH', JSON.stringify(await cdp.eval(`location.pathname`)));

  // verify created in DB via GET, then cleanup delete
  const verify = await cdp.eval(`(async () => {
    const h = { Authorization: 'Bearer ' + localStorage.getItem('authToken') };
    const r = await fetch('/v1/production-orders?size=500', { headers: h });
    const d = (await r.json()).data || {};
    const all = d.content || d || [];
    const found = all.filter((o) => (o.items || []).some((it) => (it.productName || '') === 'Verify Browser CPO Product'));
    return found.map((o) => ({ workOrder: o.workOrder, backendId: o.backendId || o.id2, customer: o.customer, salesOrderId: o.salesOrderId, salesOrderNumber: o.salesOrderNumber, status: o.status }));
  })()`);
  console.log('CREATED_IN_DB', JSON.stringify(verify));
  if (verify && verify.length === 1) {
    const del = await cdp.eval(`(async () => {
      const h = { Authorization: 'Bearer ' + localStorage.getItem('authToken') };
      const r = await fetch('/v1/production-orders/' + ${JSON.stringify(String(verify[0].backendId || verify[0].workOrder))}, { method: 'DELETE', headers: h });
      return r.status;
    })()`);
    console.log('CLEANUP_DELETE', del);
  }

  process.exit(0);
}
main().catch((e) => { console.error('ERR', e.message); process.exit(1); });