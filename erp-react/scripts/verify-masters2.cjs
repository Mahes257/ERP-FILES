/* Verify the remaining editable master dropdowns:
 *  - UOM (portal) inside the CPR item grid on /cprs/new
 *  - Department + Prepared By on /cost-workouts/new
 * Runs against ORIGIN env (localhost or ngrok). */
const fs = require('fs');

const ORIGIN = process.env.ORIGIN || 'http://localhost:5173';

module.exports = { run };

async function run({ cdp, sleep, helpers }) {
  const { evalJs, navigate, waitFor, shot } = helpers;
  const report = { origin: ORIGIN, api_calls: [], console_errors: [], network_failures: [], steps: {} };
  const res = {};

  cdp.send('Page.enable');
  cdp.send('Runtime.enable');
  cdp.send('Network.enable');

  cdp.on('Network.responseReceived', (p) => {
    if (p.response && /\/v1\/masters\//.test(p.response.url)) {
      report.api_calls.push({ url: p.response.url.replace(ORIGIN, ''), status: p.response.status });
    }
  });
  cdp.on('Network.loadingFailed', (p) => report.network_failures.push(p.errorText || 'failed'));
  cdp.on('Runtime.consoleAPICalled', (p) => {
    if (p.type === 'error') report.console_errors.push(p.args.map((a) => a.value || a.description || '').join(' '));
  });
  cdp.on('Runtime.exceptionThrown', (p) => {
    report.console_errors.push('EXCEPTION: ' + (p.exceptionDetails?.exception?.description || p.exceptionDetails?.text || ''));
  });

  const tag = ORIGIN.includes('ngrok') ? 'ngrok' : 'local';

  // ---- Login ----
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
  res.logged_in = await evalJs(`!location.pathname.includes('signin')`);

  // ================= CPR ITEM GRID UOM (portal dropdown) =================
  await navigate(ORIGIN + '/cprs/new');
  await sleep(2500);
  // The grid starts empty; click "Add Row" so a UOM cell appears
  await evalJs(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Add Row'); if (b) b.click(); return !!b; })()`);
  await sleep(1200);
  const uomInputs = await evalJs(`(() => {
    const inputs = [...document.querySelectorAll('input')].filter((i) => i.placeholder === 'Select UOM...');
    return inputs.length;
  })()`);
  res.uom_inputs_found = uomInputs;
  // open first UOM dropdown by clicking
  await evalJs(`(() => {
    const inputs = [...document.querySelectorAll('input')].filter((i) => i.placeholder === 'Select UOM...');
    if (!inputs.length) return false;
    inputs[0].click(); inputs[0].focus();
    return true;
  })()`);
  let uomOptions = [];
  for (let i = 0; i < 25; i++) {
    uomOptions = await evalJs(`[...document.querySelectorAll('[role="option"]')].map((o) => o.textContent.trim())`);
    if (uomOptions.length > 0) break;
    await sleep(500);
  }
  res.uom_options_count = uomOptions.length;
  res.uom_options_sample = uomOptions.slice(0, 6);
  await shot('M2_' + tag + '_uom_options');

  // Add a new UOM via portal dropdown
  await evalJs(`(() => {
    const inputs = [...document.querySelectorAll('input')].filter((i) => i.placeholder === 'Select UOM...');
    if (!inputs.length) return false;
    const input = inputs[0];
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, 'Dozen');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('focus'));
    return true;
  })()`);
  await sleep(700);
  res.uom_add_row = await evalJs(`[...document.querySelectorAll('button')].some((b) => /Add "Dozen"/.test(b.textContent))`);
  if (res.uom_add_row) {
    await evalJs(`(() => { const b = [...document.querySelectorAll('button')].find((x) => /Add "Dozen"/.test(x.textContent)); if (b) b.click(); })()`);
    await sleep(1500);
  }
  const uomCellValue = await evalJs(`(() => {
    const inputs = [...document.querySelectorAll('input')].filter((i) => i.placeholder === 'Select UOM...');
    return inputs.length ? inputs[0].value : null;
  })()`);
  res.uom_cell_value_after_add = uomCellValue;
  await shot('M2_' + tag + '_uom_after_add');

  // ================= COST WORKOUT FORM =================
  await navigate(ORIGIN + '/cost-workouts/new');
  await sleep(2800);
  res.cw_page_loaded = await evalJs(`document.body.innerText.includes('General Information') || document.body.innerText.includes('Cost Items Breakdown')`);

  const fieldInput = (labelText) => evalJs(`(() => {
    const labels = [...document.querySelectorAll('label')];
    const lbl = labels.find((l) => (l.textContent || '').trim().startsWith(${JSON.stringify(labelText)}));
    if (!lbl) return null;
    let node = lbl.parentElement;
    for (let i = 0; i < 4 && node; i++) {
      const input = node.querySelector('input');
      if (input) return input.value;
      node = node.parentElement;
    }
    return null;
  })()`);

  const clickField = (labelText) => evalJs(`(() => {
    const labels = [...document.querySelectorAll('label')];
    const lbl = labels.find((l) => (l.textContent || '').trim().startsWith(${JSON.stringify(labelText)}));
    if (!lbl) return false;
    let node = lbl.parentElement;
    for (let i = 0; i < 4 && node; i++) {
      const input = node.querySelector('input');
      if (input) { input.click(); input.focus(); return true; }
      node = node.parentElement;
    }
    return false;
  })()`);

  const typeField = (labelText, text) => evalJs(`(() => {
    const labels = [...document.querySelectorAll('label')];
    const lbl = labels.find((l) => (l.textContent || '').trim().startsWith(${JSON.stringify(labelText)}));
    if (!lbl) return false;
    let node = lbl.parentElement;
    for (let i = 0; i < 4 && node; i++) {
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

  // CW Department options load from backend
  await clickField('Department');
  let cwDeptOptions = [];
  for (let i = 0; i < 25; i++) {
    cwDeptOptions = await evalJs(`[...document.querySelectorAll('[role="option"]')].map((o) => o.textContent.trim())`);
    if (cwDeptOptions.length > 0) break;
    await sleep(500);
  }
  res.cw_department_options_count = cwDeptOptions.length;
  res.cw_department_options_sample = cwDeptOptions.slice(0, 5);
  await shot('M2_' + tag + '_cw_dept_options');

  // CW Prepared By options + add
  await clickField('Prepared By');
  let cwPrepOptions = [];
  for (let i = 0; i < 25; i++) {
    cwPrepOptions = await evalJs(`[...document.querySelectorAll('[role="option"]')].map((o) => o.textContent.trim())`);
    if (cwPrepOptions.length > 0) break;
    await sleep(500);
  }
  res.cw_prepared_by_options_count = cwPrepOptions.length;
  res.cw_prepared_by_options_sample = cwPrepOptions.slice(0, 4);
  await shot('M2_' + tag + '_cw_prepared_options');

  await typeField('Prepared By', 'QA Lead');
  await sleep(700);
  res.cw_prepared_add_row = await evalJs(`[...document.querySelectorAll('button')].some((b) => /Add "QA Lead"/.test(b.textContent))`);
  if (res.cw_prepared_add_row) {
    await evalJs(`(() => { const b = [...document.querySelectorAll('button')].find((x) => /Add "QA Lead"/.test(x.textContent)); if (b) b.click(); })()`);
    await sleep(1500);
  }
  res.cw_prepared_after_add = await fieldInput('Prepared By');
  await shot('M2_' + tag + '_cw_prepared_after_add');

  report.steps = res;
  report.api_summary = {
    total: report.api_calls.length,
    non_2xx: report.api_calls.filter((a) => a.status < 200 || a.status >= 300),
    calls: report.api_calls
  };
  fs.writeFileSync('evidence/master2_' + tag + '_evidence.json', JSON.stringify(report, null, 2));
  console.log('MASTER2_EVIDENCE_SAVED_' + tag.toUpperCase());
  console.log(JSON.stringify({ origin: ORIGIN, ...res, api_summary: report.api_summary, console_errors: report.console_errors, network_failures: report.network_failures }, null, 1));
}
