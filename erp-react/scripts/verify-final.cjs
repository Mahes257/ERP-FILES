/* Final live verification: capture where EVERY action option lives on CPR + CW lists. */
const fs = require('fs');

module.exports = { run };

async function run({ cdp, sleep, helpers }) {
  const { evalJs, navigate, waitFor, shot } = helpers;
  const report = { final: {} };
  const errors = [];
  cdp.send('Page.enable'); cdp.send('Runtime.enable');

  await navigate('http://localhost:5173/signin');
  await sleep(1500);
  await evalJs(`(() => {
    const email = document.querySelector('input[type="email"], input[name="email"], input[placeholder*="mail" i]');
    const pass = document.querySelector('input[type="password"]');
    if (!email || !pass) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(email, 'admin@vishaktech.com'); email.dispatchEvent(new Event('input', { bubbles: true }));
    setter.call(pass, 'Admin@123'); pass.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  await evalJs(`(() => { const b = [...document.querySelectorAll('button')].find(x => /sign\\s*in|login|submit/i.test(x.textContent)); if (b) b.click(); })()`);
  await sleep(2500);

  const closeMenu = () => evalJs(`(() => { const b = document.querySelector('button[aria-expanded="true"]'); if (b) { b.click(); return true; } return false; })()`);
  async function openMenu(rowIdx) {
    await closeMenu(); await sleep(300);
    return evalJs(`(() => { const r = document.querySelectorAll('tbody tr')[${rowIdx}]; if (!r) return false; const mb = r.querySelector('button[aria-label="Row actions"], button[aria-haspopup="menu"]'); if (!mb) return false; mb.click(); return true; })()`);
  }
  const menuItems = () => evalJs(`[...document.querySelectorAll('[role="menuitem"]')].map(m => m.textContent.trim())`);
  async function checkList(path, label, rowIdx = 0) {
    await navigate('http://localhost:5173' + path);
    await sleep(2200);
    await waitFor(`document.querySelectorAll('tbody tr').length > 0`, 20000);
    const rowCount = await evalJs(`document.querySelectorAll('tbody tr').length`);
    const res = { rowCount };
    // row menu on FIRST row
    await openMenu(0); await sleep(700);
    res.first_row_menu = await menuItems();
    await shot(`F_${label}_first_row_menu`);
    await closeMenu(); await sleep(300);
    // row menu on LAST row (bottom-clipping check)
    await openMenu(rowCount - 1); await sleep(700);
    res.last_row_menu = await menuItems();
    await shot(`F_${label}_last_row_menu`);
    await closeMenu(); await sleep(300);
    // bulk bar after selecting first row checkbox
    await evalJs(`(() => { const cb = document.querySelector('tbody tr input[type="checkbox"]'); if (cb) cb.click(); })()`);
    await sleep(800);
    res.bulk_buttons = await evalJs(`[...document.querySelectorAll('button')].map(b => b.textContent.trim()).filter(t => /delete|archive|restore|permanent|export/i.test(t)).slice(0, 10)`);
    await shot(`F_${label}_bulk_bar`);
    await evalJs(`document.body.click()`); await sleep(300);
    // export dropdown
    await evalJs(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Export'); if (b) { b.click(); return true; } return false; })()`);
    await sleep(600);
    res.export_menu = await evalJs(`[...document.querySelectorAll('button')].map(b => b.textContent.trim()).filter(t => /export (pdf|excel|csv)|print/i.test(t))`);
    await shot(`F_${label}_export_menu`);
    await evalJs(`document.body.click()`); await sleep(300);
    // subtabs present?
    res.subtabs = await evalJs(`[...document.querySelectorAll('button')].map(b => b.textContent.trim()).filter(t => /^Active/.test(t) || /^Archived/.test(t) || /^Deleted/.test(t))`);
    // Deleted subtab (empty state expected)
    await evalJs(`(() => { const b = [...document.querySelectorAll('button')].find(x => /^Deleted/.test(x.textContent.trim())); if (b) b.click(); })()`);
    await sleep(1800);
    res.deleted_tab_visible = await evalJs(`document.body.innerText.includes('Deleted')`);
    await shot(`F_${label}_deleted_tab`);
    return res;
  }

  report.final.cpr = await checkList('/cprs', 'CPR');
  report.final.cw = await checkList('/cost-workouts', 'CW');
  report.final.errors = errors;
  fs.writeFileSync('evidence/final_evidence.json', JSON.stringify(report, null, 2));
  console.log('FINAL_EVIDENCE_SAVED');
  console.log(JSON.stringify(report.final, null, 1));
}
