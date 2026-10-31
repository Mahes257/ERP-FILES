/* Reuses the exact pattern that proved 12 CPR options render (type-into-field
 * then click then waitFor [role=option]) to read the UOM (portal) dropdown and
 * the Cost Workout Department / Prepared By dropdowns. */
const fs = require('fs');

const ORIGIN = process.env.ORIGIN || 'http://localhost:5173';

module.exports = { run };

async function run({ cdp, sleep, helpers }) {
  const { evalJs, navigate, waitFor, shot } = helpers;
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

  const typeField = (labelText, text) => evalJs(`(() => {
    const labels = [...document.querySelectorAll('label')];
    const lbl = labels.find((l) => (l.textContent || '').trim().startsWith(${JSON.stringify(labelText)}));
    if (!lbl) return false;
    let node = lbl.parentElement;
    for (let i = 0; i < 5 && node; i++) {
      const input = node.querySelector('input');
      if (input) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(input, ${JSON.stringify(text)});
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('focus'));
        return true;
      }
      node = node.parentElement;
    }
    return false;
  })()`);

  const clickField = (labelText) => evalJs(`(() => {
    const labels = [...document.querySelectorAll('label')];
    const lbl = labels.find((l) => (l.textContent || '').trim().startsWith(${JSON.stringify(labelText)}));
    if (!lbl) return false;
    let node = lbl.parentElement;
    for (let i = 0; i < 5 && node; i++) {
      const input = node.querySelector('input');
      if (input) { input.click(); input.focus(); return true; }
      node = node.parentElement;
    }
    return false;
  })()`);

  const readOptions = async () => {
    await waitFor(`document.querySelectorAll('[role="option"]').length > 0`, 15000).catch(() => {});
    return evalJs(`[...document.querySelectorAll('[role="option"]')].map((o) => o.textContent.trim())`);
  };

  // ---- UOM (portal) on CPR item grid ----
  await navigate(ORIGIN + '/cprs/new');
  await sleep(2500);
  await evalJs(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Add Row'); if (b) b.click(); return !!b; })()`);
  await sleep(1500);
  await typeField('UOM', '');
  await clickField('UOM');
  const uomOptions = await readOptions();
  res.uom = { count: uomOptions.length, sample: uomOptions.slice(0, 8) };
  await shot('M5_' + tag + '_uom_options');

  // ---- Cost Workout page ----
  await navigate(ORIGIN + '/cost-workouts/new');
  await sleep(3000);
  await typeField('Department', '');
  await clickField('Department');
  const cwDept = await readOptions();
  res.cwDepartment = { count: cwDept.length, sample: cwDept.slice(0, 8) };
  await shot('M5_' + tag + '_cw_dept');

  await typeField('Prepared By', '');
  await clickField('Prepared By');
  const cwPrep = await readOptions();
  res.cwPreparedBy = { count: cwPrep.length, sample: cwPrep.slice(0, 8) };
  await shot('M5_' + tag + '_cw_prep');

  report.steps = res;
  fs.writeFileSync('evidence/master5_' + tag + '_evidence.json', JSON.stringify(report, null, 2));
  console.log('MASTER5_EVIDENCE_SAVED_' + tag.toUpperCase());
  console.log(JSON.stringify({ origin: ORIGIN, ...res, console_errors: report.console_errors, network_failures: report.network_failures }, null, 1));
}
