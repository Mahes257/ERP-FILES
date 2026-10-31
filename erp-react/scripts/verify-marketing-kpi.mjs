// Verify Marketing KPI-card filtering fixes (read-only, no data changes).
// 1. Travel Planners: clicking a KPI card applies the matching status tab filter
//    (count on card === rows shown; 0-count cards show the empty state).
// 2. Visit Summary: clicking a KPI card filters the table to that dataset.
// 3. Marketing Dashboard: clicking a KPI card opens its destination in a new tab.
import { spawn } from 'node:child_process';
import { accessSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';

const PORT = 9337;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const exe = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  (process.env.LOCALAPPDATA || '') + '\\Google\\Chrome\\Application\\chrome.exe',
].find((p) => { try { accessSync(p); return true; } catch { return false; } });
const OUT = mkdtempSync(join(tmpdir(), 'mkt-kpi-'));
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
  await c.send('Network.enable');

  // ---- Listen for travel-plans API responses (no interception — that would stall requests) ----
  const api = { summary: null, lists: [] };
  c.w.on('message', (raw) => {
    const m = JSON.parse(raw.toString());
    if (m.method === 'Network.responseReceived' && m.params?.response?.url?.includes('travel-plans')) {
      const u = m.params.response.url;
      if (u.includes('/summary')) {
        c.send('Network.getResponseBody', { requestId: m.params.requestId })
          .then((b) => { try { api.summary = JSON.parse(b.body).data; } catch { /* ignore */ } })
          .catch(() => {});
      } else if (u.includes('?page=') || u.includes('travel-plans?')) {
        c.send('Network.getResponseBody', { requestId: m.params.requestId })
          .then((b) => { try { const j = JSON.parse(b.body); api.lists.push({ url: u, total: j.totalElements ?? j.total ?? (j.content || []).length }); } catch { /* ignore */ } })
          .catch(() => {});
      }
    }
  });

  // ---- login (same mechanism as the other verify scripts) ----
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
  await c.send('Network.enable');

  // ============ 1. TRAVEL PLANNERS ============
  await c.send('Page.navigate', { url: 'http://localhost:5173/marketing/travel-planners' });
  await sleep(6000);
  const tp = await c.eval(`(() => {
    const cards = [...document.querySelectorAll('.pr-kpi-card[data-filter]')].map((el) => ({
      key: el.getAttribute('data-filter'),
      label: el.querySelector('.qtn-kpi-label')?.textContent.trim(),
      value: el.querySelector('.qtn-kpi-count')?.textContent.trim(),
      active: el.classList.contains('active')
    }));
    const activeTab = document.querySelector('.pr-tab.active')?.textContent.trim() || '';
    return { cards, activeTab };
  })()`);
  check('TP: summary KPI cards rendered', Array.isArray(tp?.cards) && tp.cards.length === 7, tp);
  check('TP: default tab My Plans (Total Plans dataset)', tp?.activeTab === 'My Plans', tp?.activeTab);

  // Click "Pending Approval" (0 per the known dataset) -> table must show 0 rows
  const pendingVal = tp?.cards?.find((c) => c.label === 'Pending Approval')?.value;
  await c.eval(`(() => {
    const el = [...document.querySelectorAll('.pr-kpi-card[data-filter]')].find((x) => x.querySelector('.qtn-kpi-label')?.textContent.trim() === 'Pending Approval');
    if (el) el.click();
  })()`);
  await sleep(3500);
  const tpPending = await c.eval(`(() => ({
    activeTab: document.querySelector('.pr-tab.active')?.textContent.trim() || '',
    activeKpi: [...document.querySelectorAll('.pr-kpi-card.active')].map((x) => x.getAttribute('data-filter')),
    emptyText: [...document.querySelectorAll('.me-empty')].map((x) => x.textContent.trim()).join(' | '),
    rows: document.querySelectorAll('.pr-table tbody tr:not(:has(.me-empty))').length
  }))()`);
  check('TP: Pending Approval card marked active', tpPending?.activeKpi?.includes('pendingApproval'), tpPending?.activeKpi);
  check('TP: Pending Approval tab selected', tpPending?.activeTab === 'Pending Approval', tpPending?.activeTab);
  check(`TP: Pending Approval (${pendingVal}) shows 0 rows`, tpPending?.rows === 0 && /No travel plans found/.test(tpPending?.emptyText || ''), tpPending);

  // Click "Total Plans" (4) -> table must show exactly 4 rows
  const totalVal = tp?.cards?.find((c) => c.label === 'Total Plans')?.value;
  await c.eval(`(() => {
    const el = [...document.querySelectorAll('.pr-kpi-card[data-filter]')].find((x) => x.querySelector('.qtn-kpi-label')?.textContent.trim() === 'Total Plans');
    if (el) el.click();
  })()`);
  await sleep(3500);
  const tpTotal = await c.eval(`(() => ({
    activeTab: document.querySelector('.pr-tab.active')?.textContent.trim() || '',
    rows: document.querySelectorAll('.pr-table tbody tr').length,
    countLabel: document.querySelector('.toolbar-count')?.textContent.trim() || ''
  }))()`);
  const totalRows = tpTotal?.countLabel?.match(/\d+/)?.[0];
  check(`TP: Total Plans (${totalVal}) shows all plans (${totalRows})`, String(totalRows) === String(totalVal), tpTotal);

  // Click "Upcoming" (0 per dataset) -> tab Upcoming Trips, 0 rows
  const upcomingVal = tp?.cards?.find((c) => c.label === 'Upcoming')?.value;
  await c.eval(`(() => {
    const el = [...document.querySelectorAll('.pr-kpi-card[data-filter]')].find((x) => x.querySelector('.qtn-kpi-label')?.textContent.trim() === 'Upcoming');
    if (el) el.click();
  })()`);
  await sleep(3500);
  const tpUp = await c.eval(`(() => ({
    activeTab: document.querySelector('.pr-tab.active')?.textContent.trim() || '',
    emptyText: [...document.querySelectorAll('.me-empty')].map((x) => x.textContent.trim()).join(' | '),
    rows: document.querySelectorAll('.pr-table tbody tr:not(:has(.me-empty))').length
  }))()`);
  check('TP: Upcoming tab selected', tpUp?.activeTab === 'Upcoming Trips', tpUp?.activeTab);
  check(`TP: Upcoming (${upcomingVal}) shows 0 rows`, tpUp?.rows === 0 && /No travel plans found/.test(tpUp?.emptyText || ''), tpUp);

  // ============ 2. VISIT SUMMARY ============
  await c.send('Page.navigate', { url: 'http://localhost:5173/marketing/visits' });
  await sleep(5000);
  const vs = await c.eval(`(() => {
    const cards = [...document.querySelectorAll('.pr-kpi-card[data-filter]')].map((el) => ({
      key: el.getAttribute('data-filter'),
      label: el.querySelector('.qtn-kpi-label')?.textContent.trim(),
      value: el.querySelector('.qtn-kpi-count')?.textContent.trim()
    }));
    return { cards };
  })()`);
  check('VS: KPI cards rendered as clickable filters', Array.isArray(vs?.cards) && vs.cards.length === 4, vs);

  const completedVal = vs?.cards?.find((c) => c.label === 'Completed')?.value;
  await c.eval(`(() => {
    const el = [...document.querySelectorAll('.pr-kpi-card[data-filter]')].find((x) => x.querySelector('.qtn-kpi-label')?.textContent.trim() === 'Completed');
    if (el) el.click();
  })()`);
  await sleep(1500);
  const vsComp = await c.eval(`(() => {
    const rows = document.querySelectorAll('.po-table tbody tr').length;
    const info = document.querySelector('.po-page-info, .toolbar-count')?.textContent.trim() || '';
    return { rows, info, active: [...document.querySelectorAll('.pr-kpi-card.active')].map((x) => x.getAttribute('data-filter')) };
  })()`);
  const shown = vsComp?.info?.match(/of (\d+)/)?.[1];
  check(`VS: Completed (${completedVal}) -> ${shown} rows shown`, shown !== undefined && String(shown) === String(completedVal), vsComp);

  // Click "With Outcome" then verify rows match that card's count
  const outcomeVal = vs?.cards?.find((c) => c.label === 'With Outcome')?.value;
  await c.eval(`(() => {
    const el = [...document.querySelectorAll('.pr-kpi-card[data-filter]')].find((x) => x.querySelector('.qtn-kpi-label')?.textContent.trim() === 'With Outcome');
    if (el) el.click();
  })()`);
  await sleep(1500);
  const vsOut = await c.eval(`(() => {
    const rows = document.querySelectorAll('.po-table tbody tr').length;
    const info = document.querySelector('.po-page-info, .toolbar-count')?.textContent.trim() || '';
    return { rows, info };
  })()`);
  const shown2 = vsOut?.info?.match(/of (\d+)/)?.[1];
  check(`VS: With Outcome (${outcomeVal}) -> ${shown2} rows shown`, shown2 !== undefined && String(shown2) === String(outcomeVal), vsOut);

  // ============ 3. MARKETING DASHBOARD ============
  await c.send('Page.navigate', { url: 'http://localhost:5173/marketing/dashboard' });
  await sleep(4000);
  const md = await c.eval(`(() => {
    window.__opened = [];
    const orig = window.open;
    window.open = (u, t) => { window.__opened.push(u); return null; };
    return { cards: [...document.querySelectorAll('.pr-kpi-card[data-filter]')].map((x) => x.getAttribute('data-filter')) };
  })()`);
  await c.eval(`(() => {
    const el = [...document.querySelectorAll('.pr-kpi-card[data-filter]')].find((x) => x.getAttribute('data-filter') === 'totalVisits');
    if (el) el.click();
  })()`);
  await sleep(800);
  const mdOpen = await c.eval(`window.__opened`);
  check('MD: Total Visits card opens /marketing?view=today', mdOpen?.includes('/marketing?view=today'), mdOpen);
  await c.eval(`(() => {
    const el = [...document.querySelectorAll('.pr-kpi-card[data-filter]')].find((x) => x.getAttribute('data-filter') === 'qFormsFilled');
    if (el) el.click();
  })()`);
  await sleep(800);
  const mdOpen2 = await c.eval(`window.__opened`);
  check('MD: Q Forms card opens /marketing/q-forms', mdOpen2?.includes('/marketing/q-forms'), mdOpen2);

  const fails = results.filter((r) => !r.ok);
  console.log(`\n==== ${results.length - fails.length}/${results.length} PASS ====`);
  proc.kill();
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => { console.error(e); proc.kill(); process.exit(1); });