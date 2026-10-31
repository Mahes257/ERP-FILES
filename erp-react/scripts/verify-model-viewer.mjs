/* eslint-disable no-console */
// Verify the upgraded 3D Production Model viewer (/model-viewer/:id):
//   - real geometry loads (never fake/fallback geometry)
//   - hierarchy tree + model info panels appear
//   - object selection works (tree row click -> Selected Object info)
//   - measure mode works (2 canvas clicks -> distance in mm)
//   - zoom in/out + projection + measure toolbar controls exist
// Uses existing real models only (read-only).
// Usage: node scripts/verify-model-viewer.mjs
import { spawn } from 'node:child_process';
import { accessSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';

const BASE = 'http://localhost:5173';
const PORT = 9387;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const exe = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  (process.env.LOCALAPPDATA || '') + '\\Google\\Chrome\\Application\\chrome.exe',
].find((p) => { try { accessSync(p); return true; } catch { return false; } });
const OUT = mkdtempSync(join(tmpdir(), 'erp-mv-'));
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

  // Login through the app API and store the token exactly like the app does.
  await c.send('Page.navigate', { url: BASE + '/signin' });
  await sleep(2200);
  const login = await c.eval(`(async () => {
    const r = await fetch('/v1/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@vishaktech.com', password: 'Admin@123' }) });
    if (!r.ok) return 'login-failed:' + r.status;
    const d = (await r.json()).data;
    localStorage.setItem('authToken', d.token);
    localStorage.setItem('refreshToken', d.refreshToken || '');
    return 'ok';
  })()`);
  record('Login', login === 'ok', String(login));
  await sleep(600);

  // ── STL model (bracket.stl, id 24, READY) ──
  await c.send('Page.navigate', { url: BASE + '/model-viewer/24' });
  await sleep(6000);
  const st = await c.eval(`(() => {
    const txt = document.body.innerText;
    return {
      readyBanner: txt.includes('Interactive 3D') && txt.includes('Actual CAD Geometry'),
      fakeGeometry: txt.includes('Fallback') || txt.includes('placeholder geometry'),
      errBanner: txt.includes('3D Preview Unavailable'),
      hierarchyPanel: !!document.querySelector('.mv3d-hierarchy-panel'),
      infoPanel: !!document.querySelector('.mv3d-info-panel'),
      treeRows: document.querySelectorAll('.mv3d-tree-row').length,
      zoomIn: !!document.querySelector('button[title="Zoom In"]'),
      zoomOut: !!document.querySelector('button[title="Zoom Out"]'),
      hasMeasure: [...document.querySelectorAll('.mv3d-btn')].some(b => b.textContent.trim() === 'Measure'),
      hasPersp: [...document.querySelectorAll('.mv3d-btn')].some(b => b.textContent.trim() === 'Persp'),
      hasFit: [...document.querySelectorAll('.mv3d-btn')].some(b => b.textContent.trim() === 'Fit'),
      hasWire: [...document.querySelectorAll('.mv3d-btn')].some(b => b.textContent.trim() === 'Wire'),
    };
  })()`);
  record('STL 24: real geometry ready (no fake/fallback geometry)', !!(st?.readyBanner && !st?.errBanner && !st?.fakeGeometry), JSON.stringify(st));
  record('STL 24: hierarchy tree panel with ≥1 part row', !!(st?.hierarchyPanel && st?.treeRows >= 1), JSON.stringify(st));
  record('STL 24: model information panel present', !!st?.infoPanel, JSON.stringify(st));
  record('STL 24: Zoom In/Out buttons present', !!(st?.zoomIn && st?.zoomOut), JSON.stringify(st));
  record('STL 24: Measure / Persp / Fit / Wire controls present', !!(st?.hasMeasure && st?.hasPersp && st?.hasFit && st?.hasWire), JSON.stringify(st));

  // Tree-row click → object selection info appears in the info panel.
  await c.eval(`(() => { const row = document.querySelector('.mv3d-tree-row'); if (row) row.click(); return !!row; })()`);
  await sleep(700);
  const selState = await c.eval(`(() => {
    const panel = document.querySelector('.mv3d-info-panel');
    const txt = panel ? panel.innerText : '';
    return {
      hasSelected: txt.includes('SELECTED OBJECT'),
      hasTriangles: txt.includes('Triangles'),
      hasSize: txt.includes('Size (W×H×D)'),
      selectedRow: !!document.querySelector('.mv3d-tree-row.mv3d-tree-selected'),
    };
  })()`);
  record('STL 24: tree-row click selects + highlights object', !!(selState?.hasSelected && selState?.hasTriangles && selState?.hasSize && selState?.selectedRow), JSON.stringify(selState));

  // Measure mode on → hint; two canvas clicks → distance mm readout.
  await c.eval(`(() => { const b = [...document.querySelectorAll('.mv3d-btn')].find(x => x.textContent.trim() === 'Measure'); if (b) b.click(); return !!b; })()`);
  await sleep(400);
  const ms = await c.eval(`(() => {
    const panel = document.querySelector('.mv3d-info-panel');
    return { hint: panel ? panel.innerText.includes('Click point 1 of 2') : false };
  })()`);
  record('STL 24: Measure mode shows 2-point hint', !!ms?.hint, JSON.stringify(ms));
  const dist = await c.eval(`(async () => {
    const canvas = document.querySelector('.mv3d-viewport canvas');
    if (!canvas) return { err: 'no-canvas' };
    const rect = canvas.getBoundingClientRect();
    const fire = (x, y) => {
      canvas.dispatchEvent(new PointerEvent('pointerdown', { clientX: x, clientY: y, bubbles: true }));
      canvas.dispatchEvent(new MouseEvent('click', { clientX: x, clientY: y, bubbles: true }));
    };
    const readPanel = () => {
      const panel = document.querySelector('.mv3d-info-panel');
      const t = panel ? panel.innerText : '';
      const i = t.indexOf('Distance');
      let mm = null;
      if (i >= 0) {
        const tail = t.slice(i, i + 60);
        const nums = tail.match(/[0-9]+[.][0-9]+/);
        mm = nums ? nums[0] : null;
      }
      return { mm, pointB: t.includes('Point B') };
    };
    // Sweep candidate points until two land on geometry (a bracket has holes,
    // so center clicks can fall through to empty space).
    const spots = [
      [0.5, 0.5], [0.35, 0.45], [0.65, 0.45], [0.5, 0.35], [0.5, 0.65],
      [0.3, 0.3], [0.7, 0.7], [0.3, 0.7], [0.7, 0.3], [0.45, 0.42],
      [0.55, 0.58], [0.42, 0.55], [0.58, 0.45], [0.4, 0.6], [0.6, 0.4],
    ];
    for (const [fx, fy] of spots) {
      fire(rect.left + rect.width * fx, rect.top + rect.height * fy);
      await new Promise(r => setTimeout(r, 250));
      const s = readPanel();
      if (s.mm) return s;
    }
    return readPanel();
  })()`);
  record('STL 24: measurement reports distance in mm', !!(dist?.mm && dist?.pointB), JSON.stringify(dist));

  // ── GLB model (test-triangle.glb, id 25) ──
  await c.send('Page.navigate', { url: BASE + '/model-viewer/25' });
  await sleep(6000);
  const glb = await c.eval(`(() => {
    const txt = document.body.innerText;
    return { ready: txt.includes('Actual CAD Geometry'), err: txt.includes('3D Preview Unavailable'), rows: document.querySelectorAll('.mv3d-tree-row').length };
  })()`);
  record('GLB 25: real geometry loads with hierarchy', !!(glb?.ready && !glb?.err && glb?.rows >= 1), JSON.stringify(glb));

  // ── OBJ model (cube.obj, id 21) ──
  await c.send('Page.navigate', { url: BASE + '/model-viewer/21' });
  await sleep(6000);
  const obj = await c.eval(`(() => {
    const txt = document.body.innerText;
    return { ready: txt.includes('Actual CAD Geometry'), err: txt.includes('3D Preview Unavailable'), rows: document.querySelectorAll('.mv3d-tree-row').length };
  })()`);
  record('OBJ 21: real geometry loads with hierarchy', !!(obj?.ready && !obj?.err && obj?.rows >= 1), JSON.stringify(obj));
} catch (e) {
  record('Script error', false, String((e && e.message) || e));
} finally {
  proc.kill();
}

let pass = 0;
for (const r of results) {
  if (r.ok) pass += 1;
  console.log(`${r.ok ? '✅' : '❌'} ${r.name}${r.detail ? ' — ' + r.detail : ''}`);
}
console.log(`\n${pass}/${results.length} PASS`);
process.exit(pass === results.length ? 0 : 1);
