/* eslint-disable no-console */
// Dev-only helper: audits the running Sales Dashboard (Vite :5173 -> backend :8080).
// Checks: 1) no horizontal page overflow at 1366/1024/768px, 2) record link opens
// the Existing Page / New Tab / Cancel modal, 3) Quick Actions open creation pages
// in a NEW browser tab. Usage: node .verify/sdash-audit.mjs
import { spawn } from 'node:child_process';
import { accessSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';

const BASE = 'http://localhost:5173';
const OUT_DIR = mkdtempSync(join(tmpdir(), 'erp-sdash-audit-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const EXE = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
].filter(Boolean).find((p) => { try { accessSync(p); return true; } catch { return false; } });

if (!EXE) throw new Error('Chrome not found');

const proc = spawn(EXE, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--no-proxy-server',
  '--window-size=1366,1200', '--hide-scrollbars', '--remote-debugging-port=9342',
  '--user-data-dir=' + OUT_DIR.replace(/\\/g, '/') + '/profile', 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });
proc.stderr.on('data', () => {});

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
  constructor(wsUrl) { this.ws = new WebSocket(wsUrl); this.id = 0; this.pending = new Map(); }
  async open() {
    await new Promise((res, rej) => { this.ws.on('open', res); this.ws.on('error', rej); });
    this.ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.id && this.pending.has(msg.id)) {
        const { res, rej } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? rej(new Error(msg.error.message)) : res(msg.result);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((res, rej) => {
      this.pending.set(id, { res, rej });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error('page JS: ' + JSON.stringify(r.exceptionDetails).slice(0, 400));
    return r.result?.value;
  }
}

async function poll(cdp, expr, { timeoutMs = 30000, label = 'cond' } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { const v = await cdp.eval(expr); if (v) return v; } catch { /* navigating */ }
    await sleep(350);
  }
  throw new Error('timeout: ' + label);
}

async function main() {
  const cdp = new Cdp(await getPageWs());
  await cdp.open();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');

  await cdp.send('Page.navigate', { url: BASE + '/login' });
  await poll(cdp, 'document.readyState === "complete"', { label: 'login load' });
  await sleep(1200);

  const login = await cdp.eval(`(async () => {
    const res = await fetch('/v1/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@vishaktech.com', password: 'Admin@123' }) });
    const d = (await res.json()).data || {};
    if (!d.token) return 'FAIL';
    localStorage.setItem('authToken', d.token);
    localStorage.setItem('refreshToken', d.refreshToken || '');
    localStorage.setItem('authUser', JSON.stringify(d.user || {}));
    return 'OK';
  })()`);
  console.log('login:', login);

  await cdp.send('Page.navigate', { url: BASE + '/sales/dashboard' });
  await poll(cdp, `document.readyState === 'complete' && !!document.querySelector('h1')`, { label: 'mount' });
  await poll(cdp, `!document.querySelector('.sd-skeleton') && document.querySelectorAll('.qtn-kpi-count').length >= 8`, { label: 'data' });
  await sleep(1200);

  // Intercept window.open to observe new-tab URLs without creating targets
  await cdp.eval(`window.__openedUrls = []; window.open = function(u) { window.__openedUrls.push(String(u)); return { closed: false }; };`);

  // --- 1. overflow audit at 3 viewport widths ---
  for (const width of [1366, 1024, 768]) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: false });
    await sleep(600);
    const audit = await cdp.eval(`(() => {
      const offenders = [];
      document.querySelectorAll('body *').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && (r.right > window.innerWidth + 4 || r.left < -4)) {
          // ignore elements inside a scrollable container (tables/charts scroll horizontally)
          let a = el;
          let insideScroll = false;
          while (a && a !== document.body) {
            const s = getComputedStyle(a);
            if (/(auto|scroll)/.test(s.overflowX) && a.scrollWidth > a.clientWidth) { insideScroll = true; break; }
            a = a.parentElement;
          }
          if (!insideScroll) offenders.push({ cls: el.className?.toString().slice(0, 60) || el.tagName, right: Math.round(r.right), left: Math.round(r.left) });
        }
      });
      return { vw: window.innerWidth, docScrollW: document.documentElement.scrollWidth, offenders: offenders.slice(0, 6) };
    })()`);
    console.log('width', width, '=>', JSON.stringify(audit));
  }
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 1000, deviceScaleFactor: 1, mobile: false });

  // --- 2. record link -> modal ---
  const linkInfo = await cdp.eval(`(() => {
    const btn = Array.from(document.querySelectorAll('button')).find((b) => /(LEAD-|CPR-|QTN-|SO-|INV-|PR-)2026-/.test(b.textContent) || /\\d{6}-\\d{6}/.test(b.textContent));
    if (!btn) {
      // fallback: any dark-green record-style button inside a table cell
      const any = Array.from(document.querySelectorAll('td button')).find((b) => b.textContent.trim().length > 3);
      return any ? { text: any.textContent.trim(), clicked: false, fallback: true } : null;
    }
    btn.click();
    return { text: btn.textContent.trim(), clicked: true };
  })()`);
  console.log('record link:', JSON.stringify(linkInfo));
  if (linkInfo?.clicked) {
    await poll(cdp, `(() => {
      const b = Array.from(document.querySelectorAll('button')).find((x) => /Open in Existing Page/.test(x.textContent || ''));
      if (!b) return false;
      const r = b.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.top >= 0;
    })()`, { label: 'modal' });
    const modalText = await cdp.eval(`(() => {
      const scope = document.body;
      const buttons = Array.from(scope.querySelectorAll('button')).filter((b) => { const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0; }).map((b) => b.textContent.trim().replace(/\\s+/g, ' ').slice(0, 44));
      const overlay = Array.from(document.querySelectorAll('.fixed')).find((el) => /Open in Existing Page/.test(el.textContent || ''));
      return { txt: (overlay ? overlay.innerText : '').slice(0, 240), buttons };
    })()`);
    console.log('modal:', JSON.stringify(modalText));
    // close via Cancel
    await cdp.eval(`(() => {
      const cancel = Array.from(document.querySelectorAll('button')).find((b) => /^Cancel$/.test(b.textContent.trim()));
      if (cancel) cancel.click();
    })()`);
    await sleep(400);
  }

  // --- 3. quick action opens creation page in new tab ---
  const qa = await cdp.eval(`(() => {
    const labels = ['New Lead', 'New Client', 'New CPR', 'New Quotation'];
    for (const lb of labels) {
      const btn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent.trim() === lb && b.offsetParent !== null);
      if (btn) { btn.click(); return lb; }
    }
    return null;
  })()`);
  console.log('clicked quick action:', qa);
  await sleep(500);
  const opened = await cdp.eval('window.__openedUrls');
  console.log('window.open urls:', JSON.stringify(opened));

  console.log('AUDIT DONE');
  proc.kill();
  process.exit(0);
}

main().catch((e) => { console.error('FAILED:', e.message); proc.kill(); process.exit(1); });
