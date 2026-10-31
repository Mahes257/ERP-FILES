/* eslint-disable no-console */
import { spawn } from 'node:child_process';
import { accessSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';

const BASE = 'http://localhost:5173';
const PORT = 9368;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const exe = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  (process.env.LOCALAPPDATA || '') + '\\Google\\Chrome\\Application\\chrome.exe',
].find((p) => { try { accessSync(p); return true; } catch { return false; } });
const OUT = mkdtempSync(join(tmpdir(), 'tv-kpi-'));
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
async function main() {
  const cdp = new C(await ws());
  await cdp.open();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Page.navigate', { url: BASE + '/signin' });
  await sleep(2200);
  await cdp.eval(`(async () => {
    const r = await fetch('/v1/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@vishaktech.com', password: 'Admin@123' }) });
    const d = (await r.json()).data;
    localStorage.setItem('authToken', d.token);
    return 'ok';
  })()`);
  await sleep(600);
  const stats = await cdp.eval(`(async () => {
    const h = { Authorization: 'Bearer ' + localStorage.getItem('authToken') };
    const r = await fetch('/v1/technical-verifications/stats', { headers: h });
    return { status: r.status, body: (await r.text()).slice(0, 400) };
  })()`);
  console.log('TV_STATS', JSON.stringify(stats));
  await cdp.send('Page.navigate', { url: BASE + '/production' });
  await sleep(6500);
  const kpi = await cdp.eval(`(() => {
    const out = [];
    document.querySelectorAll('*').forEach((el) => {
      if (el.children.length === 0 && /technical verification/i.test(el.textContent) && el.textContent.length < 40) {
        out.push(el.parentElement.parentElement?.textContent.replace(/\\s+/g, ' ').trim().slice(0, 50));
      }
    });
    return out.slice(0, 6);
  })()`);
  console.log('DASH_TV_CARDS', JSON.stringify(kpi));
  process.exit(0);
}
main().catch((e) => { console.error('ERR', e.message); process.exit(1); });