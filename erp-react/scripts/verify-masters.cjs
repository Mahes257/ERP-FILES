/* Live verification of EditableMasterDropdown on the New CPR page.
 * Runs the same steps against whichever ORIGIN env var points at
 * (localhost or the ngrok URL). Captures API calls, toasts, and DB-facing
 * evidence into evidence/master_<tag>_evidence.json. */
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

  // ---- Open New CPR ----
  await navigate(ORIGIN + '/cprs/new');
  await sleep(2500);
  res.page_loaded = await evalJs(`document.body.innerText.includes('General Information') || document.body.innerText.includes('Item Details')`);

  // Find the form field container for a label (walk up until we find an input)
  const fieldInputExpr = (labelText) => `(() => {
    const labels = [...document.querySelectorAll('label')];
    const lbl = labels.find((l) => (l.textContent || '').trim().startsWith(${JSON.stringify(labelText)}));
    if (!lbl) return null;
    let node = lbl.parentElement;
    for (let i = 0; i < 4 && node; i++) {
      const input = node.querySelector('input');
      if (input) return { found: true };
      node = node.parentElement;
    }
    return { found: false };
  })()`;

  const typeIntoField = (labelText, text) => evalJs(`(() => {
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

  const readFieldValue = (labelText) => evalJs(`(() => {
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

  // Department dropdown field (label "Department")
  res.department_field_found = await evalJs(fieldInputExpr('Department'));

  const openDropdown = async (labelText) => {
    // Real-user click: focus the input (onFocus opens the dropdown), keep text.
    return evalJs(`(() => {
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
  };

  const clearQuery = async (labelText) =>
    typeIntoField(labelText, ' ').then(() => typeIntoField(labelText, ''));

  const listTexts = () => evalJs(`[...document.querySelectorAll('[role="option"]')].map((o) => o.textContent.trim()).filter(Boolean)`);

  // ---- 1) Options load from backend (empty query -> all rows) ----
  await clearQuery('Department');
  await sleep(400);
  await openDropdown('Department');
  await waitFor(`document.querySelectorAll('[role="option"]').length > 0`, 15000).catch(() => {});
  const deptOptions = await listTexts();
  res.dept_options_count = deptOptions.length;
  res.dept_options_sample = deptOptions.slice(0, 5);
  await shot('M_' + tag + '_1_dept_options');

  // ---- 2) Add a brand-new value ----
  await typeIntoField('Department', 'Zonal Office');
  await sleep(800);
  const addRow = await evalJs(`[...document.querySelectorAll('button')].some((b) => /Add "Zonal Office"/.test(b.textContent))`);
  res.add_row_visible = addRow;
  await shot('M_' + tag + '_2_add_row');
  if (addRow) {
    await evalJs(`(() => { const b = [...document.querySelectorAll('button')].find((x) => /Add "Zonal Office"/.test(x.textContent)); if (b) b.click(); })()`);
    await sleep(1500);
  }
  const deptAfterAdd = await readFieldValue('Department');
  res.department_value_after_add = deptAfterAdd;
  await shot('M_' + tag + '_3_after_add');

  // ---- 3) Edit the value just added ----
  await clearQuery('Department');
  await sleep(300);
  await openDropdown('Department');
  await waitFor(`document.querySelectorAll('[role="option"]').length > 0`, 15000).catch(() => {});
  // click the edit (pencil) button on the "Zonal Office" row
  const editClicked = await evalJs(`(() => {
    const rows = [...document.querySelectorAll('[role="option"]')];
    const row = rows.find((r) => r.textContent.includes('Zonal Office'));
    if (!row) return false;
    const btn = row.querySelector('button[title="Edit"]');
    if (!btn) return false;
    btn.click();
    return true;
  })()`);
  res.edit_clicked = editClicked;
  await sleep(600);
  if (editClicked) {
    await evalJs(`(() => {
      const input = document.querySelector('input[aria-label="Edit master value"]');
      if (!input) return;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, 'Zonal Branch');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await sleep(300);
    await evalJs(`(() => { const b = document.querySelector('button[title="Save"]'); if (b) b.click(); })()`);
    await sleep(1500);
    await shot('M_' + tag + '_4_after_edit');
  }

  // ---- 4) Delete in-use value must be blocked ----
  await clearQuery('Department');
  await sleep(300);
  await openDropdown('Department');
  await waitFor(`document.querySelectorAll('[role="option"]').length > 0`, 15000).catch(() => {});
  const delClicked = await evalJs(`(() => {
    const rows = [...document.querySelectorAll('[role="option"]')];
    const row = rows.find((r) => r.textContent.includes('Production'));
    if (!row) return false;
    const btn = row.querySelector('button[title="Delete"]');
    if (!btn) return false;
    btn.click();
    return true;
  })()`);
  res.delete_in_use_clicked = delClicked;
  await sleep(800);
  const dialogVisible = await evalJs(`!![...document.querySelectorAll('h3, .text-sm')].find((e) => /Delete master value/.test(e.textContent)) || document.body.innerText.includes('Delete master value')`);
  res.delete_dialog_visible = dialogVisible;
  await shot('M_' + tag + '_5_delete_dialog');
  // confirm delete
  await evalJs(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Delete' && x.className.includes('rose')); if (b) b.click(); else { const bb = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Delete'); if (bb) bb.click(); } })()`);
  await sleep(1800);
  const toastText = await evalJs(`(() => { const t = document.querySelector('div.fixed.top-4.right-4 p, [class*="toast"] p, div.fixed.top-4.right-4'); return t ? t.textContent.trim() : null; })()`);
  res.toast_after_blocked_delete = toastText;
  await shot('M_' + tag + '_6_blocked_delete_toast');

  // ---- 5) Delete the unused value just added ("Zonal Branch") ----
  await clearQuery('Department');
  await sleep(300);
  await openDropdown('Department');
  await waitFor(`document.querySelectorAll('[role="option"]').length > 0`, 15000).catch(() => {});
  await evalJs(`(() => {
    const rows = [...document.querySelectorAll('[role="option"]')];
    const row = rows.find((r) => r.textContent.includes('Zonal Branch'));
    if (!row) return false;
    const btn = row.querySelector('button[title="Delete"]');
    if (!btn) return false;
    btn.click();
    return true;
  })()`);
  await sleep(800);
  await evalJs(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Delete' && (x.className.includes('rose') || x.className.includes('bg-rose'))); if (b) b.click(); else { const bb = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Delete' && x.closest('footer')); if (bb) bb.click(); } })()`);
  await sleep(1800);
  const toastAfterDelete = await evalJs(`(() => { const t = document.querySelector('div.fixed.top-4.right-4 p, [class*="toast"] p'); return t ? t.textContent.trim() : null; })()`);
  res.toast_after_clean_delete = toastAfterDelete;
  await shot('M_' + tag + '_7_deleted_clean');

  report.steps = res;
  report.api_summary = {
    total: report.api_calls.length,
    non_2xx: report.api_calls.filter((a) => a.status < 200 || a.status >= 300),
    calls: report.api_calls
  };
  fs.writeFileSync('evidence/master_' + tag + '_evidence.json', JSON.stringify(report, null, 2));
  console.log('MASTER_EVIDENCE_SAVED_' + tag.toUpperCase());
  console.log(JSON.stringify({ origin: ORIGIN, ...res, api_summary: report.api_summary, console_errors: report.console_errors, network_failures: report.network_failures }, null, 1));
}
