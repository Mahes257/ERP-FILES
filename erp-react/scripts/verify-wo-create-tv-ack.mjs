// E2E: create a Work Order through the UI and verify the Technical Verification
// and Acknowledgement side-effect POSTs now succeed (were 400) and persist rows.
// Afterwards the created Work Order + TV + Ack records are deleted via the API.
import { spawn } from 'node:child_process';
import { accessSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';

const PORT = 9342;
const BASE = 'http://localhost:5173';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const exe = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  (process.env.LOCALAPPDATA || '') + '\\Google\\Chrome\\Application\\chrome.exe']
  .find((p) => { try { accessSync(p); return true; } catch { return false; } });
const OUT = mkdtempSync(join(tmpdir(), 'wo-tv-ack-'));
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

const results = [];
function check(name, ok, detail) {
  results.push({ check: name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${JSON.stringify(detail)}`);
}

async function apiLogin() {
  const r = await fetch('http://localhost:8080/v1/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@vishaktech.com', password: 'Admin@123' }),
  });
  return (await r.json()).data.token;
}

async function main() {
  const c = new C(await ws());
  await c.open();

  // ---- login in the browser ----
  await c.send('Page.navigate', { url: BASE + '/signin' });
  await sleep(2200);
  await c.eval(`(async () => {
    const r = await fetch('/v1/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@vishaktech.com', password: 'Admin@123' }) });
    const d = (await r.json()).data;
    localStorage.setItem('authToken', d.token);
    localStorage.setItem('refreshToken', d.refreshToken || '');
    return 'ok';
  })()`);
  await sleep(800);

  // ---- capture TV + Ack request methods + response statuses ----
  const posts = [];
  const reqMethods = new Map();
  await c.send('Network.enable');
  c.w.on('message', (raw) => {
    const m = JSON.parse(raw.toString());
    if (m.method === 'Network.requestWillBeSent') {
      reqMethods.set(m.params.requestId, m.params.request.method);
    }
    if (m.method === 'Network.responseReceived' && (m.params?.response?.url?.includes('/technical-verifications') || m.params?.response?.url?.includes('/acknowledgements'))) {
      posts.push({
        url: m.params.response.url.replace(/^.*?\/v1/, '/v1'),
        status: m.params.response.status,
        method: reqMethods.get(m.params.requestId) || 'GET',
      });
    }
  });

  // ---- baseline counts ----
  const token = await apiLogin();
  const countRows = async (url) => {
    const r = await fetch('http://localhost:8080/v1' + url, { headers: { Authorization: 'Bearer ' + token } });
    const j = await r.json();
    return j.totalElements ?? j.data?.totalElements ?? j.data?.content?.length ?? (Array.isArray(j.data) ? j.data.length : null);
  };
  const tvBefore = await countRows('/technical-verifications?size=200');
  const ackBefore = await countRows('/acknowledgements?size=200');

  // ---- open Create Work Order ----
  await c.send('Page.navigate', { url: BASE + '/production/orders/new' });
  await sleep(4500);

  // Select CPO-2026-000024 from the dropdown
  const cpoSel = await c.eval(`(() => {
    const sel = document.querySelector('select[aria-label="CPO Reference"]');
    if (!sel) return { ok: false, reason: 'no select' };
    const opts = [...sel.options].filter((o) => o.value);
    if (opts.length === 0) return { ok: false, reason: 'no options', text: sel.textContent.slice(0, 120) };
    const target = opts.find((o) => o.textContent.includes('CPO-2026-000024')) || opts[0];
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
    setter.call(sel, target.value);
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return { ok: true, value: target.value, label: target.textContent.slice(0, 80), optCount: opts.length };
  })()`);
  check('CWO: CPO dropdown has real CPOs', cpoSel?.ok && cpoSel?.optCount > 0, cpoSel);
  check('CWO: selected a CPO option', cpoSel?.ok && Boolean(cpoSel?.value), cpoSel?.label);

  // Fill dates + fill the form's existing (first) production item.
  // NOTE: the form already contains one item card — do NOT click "Add Item"
  // or a second empty card will fail validation.
  const fill = await c.eval(`(() => {
    const setInput = (labelText, value) => {
      const label = [...document.querySelectorAll('span.form-label')].find((x) => x.textContent.trim().startsWith(labelText));
      if (!label) return false;
      const input = label.closest('label')?.querySelector('input');
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    };
    const ok1 = setInput('Start Date', '2026-09-03');
    const ok2 = setInput('Due Date', '2026-09-30');
    return { ok1, ok2 };
  })()`);
  await sleep(400);
  check('CWO: Start/Due dates set', fill?.ok1 && fill?.ok2, fill);

  const item = await c.eval(`(() => {
    const card = document.querySelector('.wo-item-card');
    if (!card) return { ok: false, reason: 'no item card' };
    const setInput = (labelText, value, tag) => {
      const label = [...card.querySelectorAll('span.form-label')].find((x) => x.textContent.trim().startsWith(labelText));
      if (!label) return false;
      const el = label.closest('label')?.querySelector(tag || 'input');
      if (!el) return false;
      const proto = tag === 'select' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
      setter.call(el, value);
      el.dispatchEvent(new Event(tag === 'select' ? 'change' : 'input', { bubbles: true }));
      return true;
    };
    const a = setInput('Order Description', 'E2E TV/Ack Test Item');
    const b = setInput('Production Type', 'Casting', 'select');
    const cq = setInput('Quantity', '5');
    return { ok: a && b && cq, a, b, cq };
  })()`);
  await sleep(400);
  check('CWO: item filled (desc/type/qty)', item?.ok, item);

  // Save
  await c.eval(`(() => {
    const btn = [...document.querySelectorAll('.wo-form-page-actions button')].find((b) => /Save/.test(b.textContent));
    if (btn) btn.click();
    return Boolean(btn);
  })()`);
  await sleep(5000);

  const after = await c.eval(`(() => ({ path: location.pathname, body: (document.body.innerText || '').slice(0, 200) }))()`);
  check('CWO: navigated back to the list after save', after?.path === '/production/orders', after?.path);

  const tvPosts = posts.filter((p) => p.url.includes('/technical-verifications') && p.method === 'POST');
  const ackPosts = posts.filter((p) => p.url.includes('/acknowledgements') && p.method === 'POST');
  check('CWO: POST /technical-verifications returns 200', tvPosts.length > 0 && tvPosts.every((p) => p.status === 200), tvPosts);
  check('CWO: POST /acknowledgements returns 200', ackPosts.length > 0 && ackPosts.every((p) => p.status === 200), ackPosts);

  // ---- verify DB records for the new Work Order ----
  const token2 = await apiLogin();
  const poList = await (await fetch('http://localhost:8080/v1/production-orders?size=50', { headers: { Authorization: 'Bearer ' + token2 } })).json();
  const orders = poList.content || poList.data?.content || [];
  const created = orders.find((o) => o.workOrder === 'WO-0008');
  check('CWO: WO-0008 created with CPO link', Boolean(created), created ? { so: created.salesOrderNumber, sid: created.salesOrderId } : 'not found');
  check('CWO: WO-0008 linked to real sales_orders.id', Boolean(created?.salesOrderId), created?.salesOrderId);

  const tvAfter = await countRows('/technical-verifications?size=200');
  check(`CWO: technical_verifications grew ${tvBefore} -> ${tvAfter}`, tvAfter === tvBefore + 1, { tvBefore, tvAfter });
  // No list endpoint exists for acknowledgements — verify the created row is
  // retrievable by work order (proves it persisted in MySQL).
  const ackGet = await fetch('http://localhost:8080/v1/acknowledgements/work-order/WO-0008', { headers: { Authorization: 'Bearer ' + token2 } });
  const ackBody = await ackGet.json();
  const ackRow = ackBody?.data;
  check('CWO: acknowledgement persisted (GET by WO returns row)', ackGet.status === 200 && ackRow?.id != null, ackRow ? { id: ackRow.id, status: ackRow.status, wo: ackRow.workOrderId } : ackBody);

  // ---- cleanup: delete the created WO + TV + Ack ----
  if (created?.backendId || created?.id) {
    const delId = created.backendId || created.id;
    const r1 = await fetch('http://localhost:8080/v1/production-orders/' + delId, { method: 'DELETE', headers: { Authorization: 'Bearer ' + token2 } });
    console.log('cleanup WO delete:', r1.status);
  }
  const r2 = await fetch('http://localhost:8080/v1/technical-verifications/work-order/WO-0008', { method: 'DELETE', headers: { Authorization: 'Bearer ' + token2 } });
  const r3 = await fetch('http://localhost:8080/v1/acknowledgements/work-order/WO-0008', { method: 'DELETE', headers: { Authorization: 'Bearer ' + token2 } });
  console.log('cleanup TV/Ack delete:', r2.status, r3.status);
  const tvFinal = await countRows('/technical-verifications?size=200');
  check('CLEANUP: DB restored (TV back to baseline)', tvFinal === tvBefore, { tvBefore, tvFinal });
  const ackGone = await fetch('http://localhost:8080/v1/acknowledgements/work-order/WO-0008', { headers: { Authorization: 'Bearer ' + token2 } });
  check('CLEANUP: acknowledgement deleted', ackGone.status === 200 && (await ackGone.json())?.data?.id == null, ackGone.status);

  const fails = results.filter((r) => !r.ok);
  console.log(`\n==== ${results.length - fails.length}/${results.length} PASS ====`);
  proc.kill();
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => { console.error(e); proc.kill(); process.exit(1); });