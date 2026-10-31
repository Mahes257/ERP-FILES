/* eslint-disable no-console */
import { spawn } from 'node:child_process';
import { accessSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';

const BASE = 'http://localhost:5173';
const PORT = 9389;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const exe = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  (process.env.LOCALAPPDATA || '') + '\\Google\\Chrome\\Application\\chrome.exe']
  .find((p) => { try { accessSync(p); return true; } catch { return false; } });
const OUT = mkdtempSync(join(tmpdir(), 'erp-sel-'));
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
    if (r.exceptionDetails) return { err: JSON.stringify(r.exceptionDetails).slice(0, 500) };
    return r.result?.value;
  }
}
try {
  const c = new C(await ws());
  await c.open();
  await c.send('Page.enable');
  await c.send('Runtime.enable');
  await c.send('Page.navigate', { url: BASE + '/signin' });
  await sleep(2200);
  await c.eval(`(async () => {
    const r = await fetch('/v1/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@vishaktech.com', password: 'Admin@123' }) });
    const d = (await r.json()).data;
    localStorage.setItem('authToken', d.token);
    return 'ok';
  })()`);
  await sleep(600);
  await c.send('Page.navigate', { url: BASE + '/model-viewer/24' });
  await sleep(6500);
  const rows = await c.eval(`(() => {
    const rs = [...document.querySelectorAll('.mv3d-tree-row')].map(r => ({
      text: r.innerText.trim().slice(0, 40), cls: r.className, visible: r.offsetParent !== null,
    }));
    return rs;
  })()`);
  console.log('rows before click:', JSON.stringify(rows, null, 1));
  await c.eval(`(() => { const r = document.querySelectorAll('.mv3d-tree-row')[1]; if (r) r.click(); return !!r; })()`);
  await sleep(900);
  const after = await c.eval(`(() => {
    const panel = document.querySelector('.mv3d-info-panel');
    const subtitles = panel ? [...panel.querySelectorAll('.mv3d-panel-subtitle')].map(s => s.innerText) : [];
    const txt = panel ? panel.innerText : '(no panel)';
    const selRows = [...document.querySelectorAll('.mv3d-tree-row')].map(r => ({ t: r.innerText.trim().slice(0, 30), sel: r.className.includes('selected') }));
    return { subtitles, hasSelectedObject: txt.includes('Selected Object'), txtStart: txt.slice(0, 300), selRows };
  })()`);
  console.log('after click:', JSON.stringify(after, null, 1));
} catch (e) {
  console.error('ERR', e);
} finally {
  proc.kill();
}
