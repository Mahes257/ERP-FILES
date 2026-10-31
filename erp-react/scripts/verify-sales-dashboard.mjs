/* eslint-disable no-console */
// Dev-only helper: logs into the running ERP (Vite :5173 -> backend :8080),
// seeds the JWT in localStorage, opens /sales/dashboard and screenshots it.
// Usage: node scripts/verify-sales-dashboard.mjs
import { spawn } from 'node:child_process';
import { accessSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';

const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = 'http://localhost:5173';
const OUT_DIR = mkdtempSync(join(tmpdir(), 'erp-sdash-'));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function chromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    (process.env.LOCALAPPDATA || '') + '\\Google\\Chrome\\Application\\chrome.exe',
  ].filter(Boolean);
  return candidates;
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
    '--remote-debugging-port=9341',
    '--user-data-dir=' + OUT_DIR.replace(/\\/g, '/') + '/profile',
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  proc.stderr.on('data', (d) => process.stderr.write('[chrome] ' + d.toString()));
  proc.on('error', (e) => process.stderr.write('[chrome spawn error] ' + e.message + '\n'));
  proc.on('exit', (code) => process.stderr.write('[chrome exited] code=' + code + '\n'));
  return proc;
}

async function getPageWs() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch('http://127.0.0.1:9341/json');
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
  waitEvent(method, timeoutMs = 20000) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('timeout waiting ' + method)), timeoutMs);
      const check = () => {
        const idx = this.events.findIndex((e) => e.method === method);
        if (idx >= 0) {
          const ev = this.events[idx];
          this.events.splice(idx, 1);
          clearTimeout(t);
          resolve(ev);
        }
      };
      this.ws.on('message', check);
      check();
    });
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
  cdp.ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      const text = (msg.params.args || []).map((a) => a.value ?? a.description ?? '').join(' ');
      if (!text.includes('favicon')) consoleErrors.push(text);
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      consoleErrors.push('EXCEPTION: ' + JSON.stringify(msg.params.exceptionDetails).slice(0, 300));
    }
  });

  // 1. Load the origin so localStorage is scoped correctly
  await cdp.send('Page.navigate', { url: BASE + '/login' });
  await pollEval(cdp, 'document.readyState === "complete"', { label: 'login page load' });
  await sleep(1500);

  // 2. Login via the same-origin Vite proxy and seed tokens
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

  // 3. Navigate to the Sales Dashboard (SPA route, so poll for rendered content)
  await cdp.send('Page.navigate', { url: BASE + '/sales/dashboard' });
  await pollEval(cdp,
    'document.readyState === "complete" && !!document.querySelector("h1")',
    { label: 'dashboard mount' });
  await pollEval(cdp,
    `!document.querySelector('.sd-skeleton')
      && !document.querySelector('.sd-error-state')
      && document.querySelectorAll('.qtn-kpi-count').length >= 8
      && Array.from(document.querySelectorAll('.qtn-kpi-count')).some(e => e.textContent.trim() !== '0')`,
    { timeoutMs: 40000, label: 'real dashboard data render' });
  await sleep(1500); // allow charts/tables to settle

  // 4. Capture page state + screenshot
  const state = await cdp.eval(`(() => {
    const bodyText = document.body ? document.body.innerText : '';
    const h1s = Array.from(document.querySelectorAll('h1')).map(h => h.innerText);
    const kpiLabels = Array.from(document.querySelectorAll('.qtn-kpi-label')).map(e => e.innerText);
    const kpiCounts = Array.from(document.querySelectorAll('.qtn-kpi-count')).map(e => e.innerText);
    return {
      url: location.href,
      h1s,
      kpiLabels,
      kpiCounts,
      hasErrorBanner: /cpr-error-banner/.test(document.body.className) || !!document.querySelector('.cpr-error-banner'),
      bodySnippet: bodyText.slice(0, 400),
      tableCount: document.querySelectorAll('table.pr-table').length,
      sectionTitles: Array.from(document.querySelectorAll('h3')).map(h => h.innerText),
    };
  })()`);
  console.log('page state:', JSON.stringify(state, null, 2));

  const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  const { writeFileSync } = await import('node:fs');
  writeFileSync(OUT_DIR + '/sales-dashboard.png', Buffer.from(shot.data, 'base64'));
  console.log('screenshot saved:', OUT_DIR + '/sales-dashboard.png');

  console.log('console errors:', consoleErrors.length ? consoleErrors : '(none)');
  proc.kill();
  process.exit(state.hasErrorBanner || consoleErrors.length ? 1 : 0);
}

main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
