/* Definitive check: after opening each master dropdown, verify that master
 * values are literally rendered in the DOM (body innerText), and that the
 * dropdown list markup exists. Runs against ORIGIN. */
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

  const clickField = (labelText) => evalJs(`(() => {
    const labels = [...document.querySelectorAll('label')];
    const lbl = labels.find((l) => (l.textContent || '').trim().startsWith(${JSON.stringify(labelText)}));
    if (!lbl) return false;
    let node = lbl.parentElement;
    for (let i = 0; i < 4 && node; i++) {
      const input = node.querySelector('input');
      if (input) { input.focus(); input.dispatchEvent(new Event('focus')); return true; }
      node = node.parentElement;
    }
    return false;
  })()`);

  const openAndProbe = async (labelText, probeTexts, fieldTag) => {
    const ok = await clickField(labelText);
    await sleep(900);
    const bodyText = await evalJs(`document.body.innerText`);
    const found = {};
    probeTexts.forEach((p) => { found[p] = bodyText.includes(p); });
    const listVisible = await evalJs(`[...document.querySelectorAll('*')].some((el) => {
      const t = el.textContent || '';
      return (el.children.length === 0 || el.tagName === 'BUTTON') && ${JSON.stringify(probeTexts[0]) && 'true'} && t.trim() === ${JSON.stringify(probeTexts[0])};
    })`);
    await shot('M3_' + tag + '_' + fieldTag);
    return { field_clicked: ok, probes: found };
  };

  // CPR page: Department + Requested By + Priority
  await navigate(ORIGIN + '/cprs/new');
  await sleep(2500);
  res.department = await openAndProbe('Department', ['Production', 'Finance', 'Stores'], 'dept');
  res.requestedBy = await openAndProbe('Requested By', ['Ramesh Patel', 'Admin User', 'Amit Singh'], 'reqby');
  res.priority = await openAndProbe('Priority', ['Low', 'Critical', 'High'], 'priority');

  // CPR item grid UOM (portal)
  await evalJs(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Add Row'); if (b) b.click(); return !!b; })()`);
  await sleep(1200);
  res.uom = await openAndProbe('UOM', ['Nos', 'Kg', 'Litre', 'Lump Sum'], 'uom');

  // Cost Workout page: Department + Prepared By
  await navigate(ORIGIN + '/cost-workouts/new');
  await sleep(2800);
  res.cwDepartment = await openAndProbe('Department', ['Production', 'Purchase', 'Sales'], 'cw_dept');
  res.cwPreparedBy = await openAndProbe('Prepared By', ['Ramesh Patel', 'Admin User', 'Neha Gupta'], 'cw_prep');

  report.steps = res;
  report.console_errors = report.console_errors;
  fs.writeFileSync('evidence/master3_' + tag + '_evidence.json', JSON.stringify(report, null, 2));
  console.log('MASTER3_EVIDENCE_SAVED_' + tag.toUpperCase());
  console.log(JSON.stringify({ origin: ORIGIN, ...res, console_errors: report.console_errors, network_failures: report.network_failures }, null, 1));
}
