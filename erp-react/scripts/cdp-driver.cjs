/* Minimal CDP driver using Node's built-in WebSocket + fetch.
 * Usage: node cdp-driver.js <port> <script-file.js>
 * The script-file exports an async function run({ cdp, page }) and helpers.
 */
const fs = require('fs');
const path = require('path');

const port = process.argv[2] || '9222';
const scriptFile = process.argv[3];
if (!scriptFile) { console.error('usage: node cdp-driver.js <port> <script>'); process.exit(1); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); }
  static async connect(wsUrl) {
    const ws = new WebSocket(wsUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    const cdp = new CDP(ws);
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && cdp.pending.has(msg.id)) {
        const { resolve, reject } = cdp.pending.get(msg.id);
        cdp.pending.delete(msg.id);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result);
      } else if (msg.method) {
        (cdp.listeners[msg.method] || []).forEach((fn) => fn(msg.params));
      }
    };
    cdp.listeners = {};
    return cdp;
  }
  on(method, fn) { (this.listeners[method] = this.listeners[method] || []).push(fn); }
  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.id;
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
}

async function main() {
  const targets = await fetch(`http://127.0.0.1:${port}/json`).then((r) => r.json());
  const page = targets.find((t) => t.type === 'page');
  if (!page) { console.error('no page target'); process.exit(1); }
  const cdp = await CDP.connect(page.webSocketDebuggerUrl);

  const script = require(path.resolve(scriptFile));

  // Core evaluate function used by all helpers.
  async function evalJs(expression) {
    const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error('eval error: ' + JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result.value;
  }

  await script.run({
    cdp,
    sleep,
    helpers: {
      evalJs,
      async navigate(url) {
        await cdp.send('Page.navigate', { url });
        await sleep(2500);
      },
      async waitFor(expr, timeoutMs = 15000) {
        const t0 = Date.now();
        while (Date.now() - t0 < timeoutMs) {
          const v = await evalJs(`!!(${expr})`);
          if (v) return true;
          await sleep(400);
        }
        throw new Error('waitFor timeout: ' + expr);
      },
      async shot(name) {
        const r = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
        const dir = path.resolve(__dirname, '..', 'evidence');
        fs.mkdirSync(dir, { recursive: true });
        const file = path.join(dir, name + '.png');
        fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
        return file;
      },
      async text(selector) {
        return evalJs(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); return el ? el.textContent.trim() : null; })()`);
      },
    },
  });
  console.log('CDP_SCRIPT_DONE');
  process.exit(0);
}

main().catch((e) => { console.error('CDP_ERROR:', e.message); process.exit(1); });
