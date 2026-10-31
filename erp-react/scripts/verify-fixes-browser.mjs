// Browser verification of the verified-issue fixes (read-only).
// 1. /marketing/visits            -> renders 8 visits (was blank)
// 2. /marketing/follow-ups        -> shows 11 marketing_followups + extensions (was 2 activities)
// 3. /production/orders           -> phantom CPOs shown as "(not linked)", never CPO-2026-10x
// 4. /production/fabrication      -> explicit "awaiting … no entries recorded yet" state
// 5. /production/quality          -> orphan inspections flagged, not clickable links
// 6. /production/dispatch         -> DISP-013 WO-0008 shown as "(not found)"
// 7. /marketing/travel-planners   -> KPI cards still filter (Total Plans -> 4 rows)
import { spawn } from 'node:child_process';
import { accessSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';

const PORT = 9341;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const exe = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  (process.env.LOCALAPPDATA || '') + '\\Google\\Chrome\\Application\\chrome.exe']
  .find((p) => { try { accessSync(p); return true; } catch { return false; } });
const OUT = mkdtempSync(join(tmpdir(), 'fixes-verify-'));
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

async function main() {
  const c = new C(await ws());
  await c.open();

  await c.send('Page.navigate', { url: 'http://localhost:5173/signin' });
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

  // ============ 1. VISIT SUMMARY ============
  await c.send('Page.navigate', { url: 'http://localhost:5173/marketing/visits' });
  await sleep(5000);
  const vs = await c.eval(`(() => {
    const t = document.body.innerText || '';
    return {
      h1: document.querySelector('h1')?.textContent.trim() || '',
      rowCount: document.querySelectorAll('.po-table tbody tr').length,
      kpiCards: document.querySelectorAll('.pr-kpi-card[data-filter]').length,
      totalVisitsCard: [...document.querySelectorAll('.qtn-kpi-label')].find((x) => x.textContent.trim() === 'Total Visits')?.parentElement?.querySelector('.qtn-kpi-count')?.textContent.trim()
    };
  })()`);
  check('VS: page renders with heading', vs?.h1 === 'Visit Summary', vs?.h1);
  check('VS: 8 visits rendered (DB=8)', vs?.rowCount === 8, vs?.rowCount);
  check('VS: 4 clickable KPI cards', vs?.kpiCards === 4, vs?.kpiCards);

  // ============ 2. MARKETING FOLLOW-UPS ============
  await c.send('Page.navigate', { url: 'http://localhost:5173/marketing/follow-ups' });
  await sleep(5000);
  const fu = await c.eval(`(() => {
    const subtitle = document.querySelector('.vfue-subtitle')?.textContent.trim() || '';
    const refs = [...document.querySelectorAll('.vfue-ref-link')].map((x) => x.textContent.trim());
    const rows = document.querySelectorAll('.vfue-row').length;
    return { subtitle, refs, rows };
  })()`);
  check('FU: subtitle shows 11 follow-ups', /11 follow-ups/.test(fu?.subtitle || ''), fu?.subtitle);
  check('FU: page 1 has 10 rows (paginated)', fu?.rows === 10, fu?.rows);
  check('FU: FU-13 (real record) present on page 1', fu?.refs?.includes('FU-13'), fu?.refs?.slice(0, 12));
  // Page 2 holds FU-1 + the extension
  await c.eval(`(() => {
    const btns = [...document.querySelectorAll('button')];
    const next = btns.find((b) => b.textContent.trim() === 'Next');
    if (next) next.click();
  })()`);
  await sleep(1200);
  const fu2 = await c.eval(`(() => ({
    refs: [...document.querySelectorAll('.vfue-ref-link')].map((x) => x.textContent.trim()),
  }))()`);
  check('FU: page 2 has FU-1 + extension', fu2?.refs?.includes('FU-1') && fu2?.refs?.some((r) => r.startsWith('EXT-')), fu2?.refs);

  // ============ 3. PRODUCTION ORDERS — PHANTOM CPO ============
  await c.send('Page.navigate', { url: 'http://localhost:5173/production/orders' });
  await sleep(5000);
  const po = await c.eval(`(() => {
    const t = document.body.innerText || '';
    return {
      hasPhantomCpo: /CPO-2026-10[0-9]/.test(t),
      hasNotLinked: /SO-2026-10[0-9][\\s\\S]{0,20}not linked/.test(t),
      cpoCellCount: document.querySelectorAll('.cpo-linked').length,
    };
  })()`);
  check('PO: no phantom CPO-2026-10x shown', !po?.hasPhantomCpo, po);
  check('PO: unlinked refs marked "(not linked)"', po?.hasNotLinked, po);

  // Detail page of a TEST-PO order
  await c.send('Page.navigate', { url: 'http://localhost:5173/production/orders/TEST-PO-001' });
  await sleep(4000);
  const det = await c.eval(`(() => {
    const t = document.body.innerText || '';
    return {
      hasNotLinked: /not linked/.test(t),
      hasViewCpo: /View CPO/.test(t),
      h2: document.querySelector('h2')?.textContent.trim() || '',
    };
  })()`);
  check('PO-detail: TEST-PO-001 shows "(not linked)"', det?.hasNotLinked && det?.h2 === 'TEST-PO-001', det);
  check('PO-detail: no View CPO button for unlinked', !det?.hasViewCpo, det);

  // ============ 4. FABRICATION BOARD ============
  await c.send('Page.navigate', { url: 'http://localhost:5173/production/fabrication' });
  await sleep(5000);
  const fab = await c.eval(`(() => {
    const subtitle = document.querySelector('.sf-board-subtitle')?.textContent.trim() || '';
    const noEntries = document.querySelectorAll('[title*="No stage entries recorded"]').length;
    return { subtitle, noEntries };
  })()`);
  check('FAB: subtitle flags awaiting Fabrication + no entries', /awaiting Fabrication/.test(fab?.subtitle || '') && /no entries recorded yet/.test(fab?.subtitle || ''), fab?.subtitle);
  check('FAB: "no entries" hints on zero-entry rows', fab?.noEntries > 0, fab?.noEntries);

  // ============ 5. QUALITY ORPHANS ============
  await c.send('Page.navigate', { url: 'http://localhost:5173/production/quality' });
  await sleep(5000);
  const q = await c.eval(`(() => {
    const t = document.body.innerText || '';
    return {
      hasNoWo: /no Work Order/.test(t),
      hasUnlinked: /unlinked/.test(t),
      hasRealWo: /WO-0001/.test(t),
      orphanCells: document.querySelectorAll('[title*="not linked to a valid Work Order"], [title*="does not exist"]').length,
    };
  })()`);
  check('QUAL: orphan inspections flagged "(no Work Order)"/"(unlinked)"', q?.hasNoWo && q?.hasUnlinked, q);
  check('QUAL: real linked inspections still render (WO-0001)', q?.hasRealWo, q);

  // ============ 6. DISPATCH ORPHAN ============
  await c.send('Page.navigate', { url: 'http://localhost:5173/production/dispatch' });
  await sleep(5000);
  const d = await c.eval(`(() => {
    const t = document.body.innerText || '';
    return {
      hasWo8NotFound: /WO-0008[\\s\\S]{0,20}not found/.test(t),
    };
  })()`);
  check('DISP: WO-0008 shown as "(not found)"', d?.hasWo8NotFound, d);

  // ============ 7. TRAVEL PLANNERS KPI FILTER ============
  await c.send('Page.navigate', { url: 'http://localhost:5173/marketing/travel-planners' });
  await sleep(5000);
  const kpi = await c.eval(`(() => {
    const cards = [...document.querySelectorAll('.pr-kpi-card[data-filter]')].map((el) => ({
      label: el.querySelector('.qtn-kpi-label')?.textContent.trim(),
      value: el.querySelector('.qtn-kpi-count')?.textContent.trim(),
    }));
    return { cards };
  })()`);
  const total = kpi?.cards?.find((x) => x.label === 'Total Plans')?.value;
  await c.eval(`(() => {
    const el = [...document.querySelectorAll('.pr-kpi-card[data-filter]')].find((x) => x.querySelector('.qtn-kpi-label')?.textContent.trim() === 'Total Plans');
    if (el) el.click();
  })()`);
  await sleep(3500);
  const kpiAfter = await c.eval(`(() => ({
    countLabel: document.querySelector('.toolbar-count')?.textContent.trim() || '',
    active: [...document.querySelectorAll('.pr-kpi-card.active')].map((x) => x.getAttribute('data-filter')),
  }))()`);
  check(`KPI: Total Plans (${total}) click shows ${kpiAfter?.countLabel}`, new RegExp(`^${total} plan`).test(kpiAfter?.countLabel || ''), kpiAfter);
  check('KPI: card marked active', kpiAfter?.active?.includes('totalPlans'), kpiAfter?.active);

  const fails = results.filter((r) => !r.ok);
  console.log(`\n==== ${results.length - fails.length}/${results.length} PASS ====`);
  proc.kill();
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => { console.error(e); proc.kill(); process.exit(1); });