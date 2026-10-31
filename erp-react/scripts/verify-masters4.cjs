/* Definitive single-shot check: inside the page, click a master dropdown field,
 * wait up to N ms for the option list to render, and read back option texts —
 * all within one Runtime.evaluate so no cross-call race can close the dropdown. */
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

  // One-shot: find field input, focus, poll for the dropdown list (any element
  // carrying role=option or the Add-row / loading text), then return results.
  const probeField = (labelText, fieldTag) => evalJs(`(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const labels = [...document.querySelectorAll('label')];
    const lbl = labels.find((l) => (l.textContent || '').trim().startsWith(${JSON.stringify(labelText)}));
    if (!lbl) return { clicked: false };
    let node = lbl.parentElement;
    let input = null;
    for (let i = 0; i < 5 && node; i++) {
      input = node.querySelector('input');
      if (input) break;
      node = node.parentElement;
    }
    if (!input) return { clicked: true, input: false };
    input.focus();
    input.click();
    let opts = [];
    let listHtml = '';
    for (let i = 0; i < 30; i++) {
      await sleep(300);
      opts = [...document.querySelectorAll('[role="option"]')].map((o) => o.textContent.trim());
      if (opts.length > 0) break;
    }
    listHtml = (document.querySelector('[role="option"]')?.parentElement?.textContent || '').slice(0, 200);
    const btn = document.body.querySelector('button');
    return { clicked: true, input: true, count: opts.length, opts: opts.slice(0, 15), listHtml };
  })()`);

  // CPR page
  await navigate(ORIGIN + '/cprs/new');
  await sleep(2500);
  res.department = await probeField('Department', 'dept');
  await shot('M4_' + tag + '_dept');
  res.requestedBy = await probeField('Requested By', 'reqby');
  res.priority = await probeField('Priority', 'priority');

  // CPR item grid UOM (portal dropdown)
  await evalJs(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Add Row'); if (b) b.click(); return !!b; })()`);
  await sleep(1500);
  res.uom = await probeField('UOM', 'uom');
  await shot('M4_' + tag + '_uom');

  // Cost Workout page
  await navigate(ORIGIN + '/cost-workouts/new');
  await sleep(3000);
  res.cwDepartment = await probeField('Department', 'cw_dept');
  await shot('M4_' + tag + '_cw_dept');
  res.cwPreparedBy = await probeField('Prepared By', 'cw_prep');
  await shot('M4_' + tag + '_cw_prep');

  report.steps = res;
  fs.writeFileSync('evidence/master4_' + tag + '_evidence.json', JSON.stringify(report, null, 2));
  console.log('MASTER4_EVIDENCE_SAVED_' + tag.toUpperCase());
  console.log(JSON.stringify({ origin: ORIGIN, ...res, console_errors: report.console_errors, network_failures: report.network_failures }, null, 1));
}
