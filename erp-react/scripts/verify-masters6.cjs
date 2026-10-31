/* True user-behavior verification: drive real mouse events via CDP
 * Input.dispatchMouseEvent to open master dropdowns, then read the option list.
 * This avoids any synthetic .click() quirks with React focus handling. */
const fs = require('fs');

const ORIGIN = process.env.ORIGIN || 'http://localhost:5173';

module.exports = { run };

async function run({ cdp, sleep, helpers }) {
  const { evalJs, navigate, shot } = helpers;
  const report = { origin: ORIGIN, console_errors: [], network_failures: [], steps: {} };
  const res = {};

  cdp.send('Page.enable');
  cdp.send('Runtime.enable');
  cdp.send('Network.enable');
  cdp.on('Network.loadingFailed', (p) => report.network_failures.push(p.errorText || 'failed'));
  cdp.on('Runtime.consoleAPICalled', (p) => {
    if (p.type === 'error') report.console_errors.push(p.args.map((a) => a.value || a.description || '').join(' '));
  });
  cdp.on('Runtime.exceptionThrown', (p) => {
    report.console_errors.push('EXCEPTION: ' + (p.exceptionDetails?.exception?.description || p.exceptionDetails?.text || ''));
  });

  const tag = ORIGIN.includes('ngrok') ? 'ngrok' : 'local';

  const realClick = async (selectorExpr) => {
    const rect = await evalJs(`(() => {
      const el = ${selectorExpr};
      if (!el) return null;
      el.scrollIntoView({ block: 'center' });
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    })()`);
    if (!rect) return false;
    await sleep(400);
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: rect.x, y: rect.y });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
    await sleep(150);
    return true;
  };

  const findFieldInputExpr = (labelText) => `(() => {
    const labels = [...document.querySelectorAll('label')];
    const lbl = labels.find((l) => (l.textContent || '').trim().startsWith(${JSON.stringify(labelText)}));
    if (!lbl) return null;
    let node = lbl.parentElement;
    for (let i = 0; i < 5 && node; i++) {
      const input = node.querySelector('input');
      if (input) return input;
      node = node.parentElement;
    }
    return null;
  })()`;

  const openAndRead = async (labelText, fieldTag, fallbackExpr) => {
    const inputExpr = fallbackExpr || findFieldInputExpr(labelText);
    await realClick(inputExpr);
    let opts = [];
    for (let i = 0; i < 30; i++) {
      opts = await evalJs(`[...document.querySelectorAll('[role="option"]')].map((o) => o.textContent.trim())`);
      if (opts.length > 0) break;
      await sleep(400);
    }
    await shot('M6_' + tag + '_' + fieldTag);
    return { count: opts.length, sample: opts.slice(0, 10) };
  };

  await navigate(ORIGIN + '/signin');
  await sleep(1500);
  const visited = await evalJs(`(() => {
    const btn = [...document.querySelectorAll('button, a')].find((b) => /visit site/i.test(b.textContent));
    if (btn) { btn.click(); return true; }
    return false;
  })()`);
  if (visited) { await sleep(2500); await navigate(ORIGIN + '/signin'); await sleep(1500); }
  await evalJs(`(() => {
    const email = document.querySelector('input[type="email"], input[name="email"], input[placeholder*="mail" i]');
    const pass = document.querySelector('input[type="password"]');
    if (!email || !pass) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(email, 'admin@vishaktech.com'); email.dispatchEvent(new Event('input', { bubbles: true }));
    setter.call(pass, 'Admin@123'); pass.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  await evalJs(`(() => { const b = [...document.querySelectorAll('button')].find((x) => /sign\\s*in|login|submit/i.test(x.textContent)); if (b) b.click(); })()`);
  await sleep(2800);

  // CPR page: Department (sanity — proven before, but re-prove with real clicks)
  await navigate(ORIGIN + '/cprs/new');
  await sleep(2500);
  res.department = await openAndRead('Department', 'dept');

  // UOM portal dropdown: locate the "Select UOM..." input directly
  await evalJs(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Add Row'); if (b) b.click(); return !!b; })()`);
  await sleep(1500);
  res.uom = await openAndRead('', 'uom', `(() => { const i = [...document.querySelectorAll('input')].find((x) => x.placeholder === 'Select UOM...'); return i || null; })()`);

  // Cost Workout page
  await navigate(ORIGIN + '/cost-workouts/new');
  await sleep(3000);
  res.cwDepartment = await openAndRead('Department', 'cw_dept');
  res.cwPreparedBy = await openAndRead('Prepared By', 'cw_prep');

  report.steps = res;
  fs.writeFileSync('evidence/master6_' + tag + '_evidence.json', JSON.stringify(report, null, 2));
  console.log('MASTER6_EVIDENCE_SAVED_' + tag.toUpperCase());
  console.log(JSON.stringify({ origin: ORIGIN, ...res, console_errors: report.console_errors, network_failures: report.network_failures }, null, 1));
}
