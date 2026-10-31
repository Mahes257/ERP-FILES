/* Live verification of CPR List actions — v2. Evidence: screenshots + DOM state + API calls. */
const fs = require('fs');
const path = require('path');

module.exports = { run };

async function run({ cdp, sleep, helpers }) {
  const { evalJs, navigate, waitFor, shot, text } = helpers;
  const report = { cpr_list: {} };
  const errors = [];

  const apiCalls = [];
  cdp.on('Network.responseReceived', (p) => {
    if (p.response && p.response.url && p.response.url.includes('/v1/')) {
      apiCalls.push({ url: p.response.url.split('?')[0], qs: (p.response.url.split('?')[1] || ''), status: p.response.status });
    }
  });
  cdp.send('Network.enable');
  cdp.send('Page.enable');
  cdp.send('Runtime.enable');

  // ---- LOGIN ----
  await navigate('http://localhost:5173/signin');
  await sleep(1500);
  try {
    await evalJs(`(() => {
      const email = document.querySelector('input[type="email"], input[name="email"], input[placeholder*="mail" i]');
      const pass = document.querySelector('input[type="password"]');
      if (!email || !pass) return 'NO_INPUTS';
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(email, 'admin@vishaktech.com'); email.dispatchEvent(new Event('input', { bubbles: true }));
      setter.call(pass, 'Admin@123'); pass.dispatchEvent(new Event('input', { bubbles: true }));
      return 'FILLED';
    })()`);
    await evalJs(`(() => {
      const btn = [...document.querySelectorAll('button')].find(b => /sign\\s*in|login|submit/i.test(b.textContent));
      if (btn) { btn.click(); return 'CLICKED'; }
      return 'NO_BTN';
    })()`);
    await sleep(2500);
    report.cpr_list.login_redirect = await evalJs('location.pathname');
  } catch (e) { errors.push('login: ' + e.message); }

  // ---- CPR LIST ----
  await navigate('http://localhost:5173/cprs');
  await sleep(2500);
  await waitFor(`document.querySelectorAll('tbody tr').length > 0`, 20000);
  await shot('01_cpr_list_page');
  report.cpr_list.url = await evalJs('location.pathname');
  report.cpr_list.row_count = await evalJs(`document.querySelectorAll('tbody tr').length`);

  // ---- Scan EVERY visible row's action menu (captures per-status variants) ----
  // React flushes state async, so click -> sleep -> read per row.
  const rowMenus = [];
  const rowCount = await evalJs(`document.querySelectorAll('tbody tr').length`);
  for (let i = 0; i < Math.min(rowCount, 8); i++) {
    const opened = await evalJs(`(() => {
      const rows = [...document.querySelectorAll('tbody tr')];
      const row = rows[${i}];
      if (!row) return false;
      const menuBtn = row.querySelector('button[aria-label="Row actions"], button[aria-haspopup="menu"]');
      if (!menuBtn) return false;
      menuBtn.click();
      return true;
    })()`);
    await sleep(600);
    const read = await evalJs(`(() => {
      const rows = [...document.querySelectorAll('tbody tr')];
      const row = rows[${i}];
      const badge = row ? row.querySelector('.cpr-badge, [class*=badge]') : null;
      const status = badge ? badge.textContent.trim() : (row ? 'row-' + ${i} : 'N/A');
      const items = [...document.querySelectorAll('[role="menuitem"]')].map(m => m.textContent.trim());
      return { status, items };
    })()`);
    rowMenus.push(read);
    await evalJs(`document.body.click()`);
    await sleep(400);
  }
  report.cpr_list.row_menus = rowMenus;
  await shot('02_cpr_row_menus');

  // ---- Convert to Quotation / Open Quotation (status-dependent) ----
  // Log in via API to get a token, find approved-not-converted and converted CPRs.
  let candidates = { approved: null, converted: null };
  try {
    const lr = await fetch('http://localhost:8080/v1/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@vishaktech.com', password: 'Admin@123' })
    }).then(r => r.json());
    const TOKEN = lr.data?.token || lr.token || lr.accessToken;
    const resp = await fetch('http://localhost:8080/v1/cprs?page=0&size=50&sort=createdAt,desc', { headers: { Authorization: 'Bearer ' + TOKEN } });
    const data = await resp.json();
    const all = data.content || [];
    candidates.approved = all.find(c => String(c.status).toUpperCase() === 'APPROVED' && !c.convertedToQtn) || null;
    candidates.converted = all.find(c => c.convertedToQtn) || null;
  } catch (e) { errors.push('api candidate lookup: ' + e.message); }
  report.cpr_list.convert_candidates = { approved: candidates.approved ? candidates.approved.prNo : null, converted: candidates.converted ? candidates.converted.prNo : null };

  for (const [kind, cpr] of [['approved', candidates.approved], ['converted', candidates.converted]]) {
    if (!cpr) continue;
    await evalJs(`(() => {
      const input = document.querySelector('input[placeholder*="Search" i]');
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(cpr.prNo)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
    await sleep(2000);
    const opened = await evalJs(`(() => {
      const row = document.querySelector('tbody tr');
      if (!row) return false;
      const mb = row.querySelector('button[aria-label="Row actions"], button[aria-haspopup="menu"]');
      if (!mb) return false;
      mb.click(); return true;
    })()`);
    await sleep(700);
    const items = await evalJs(`[...document.querySelectorAll('[role="menuitem"]')].map(m => m.textContent.trim())`);
    report.cpr_list['menu_for_' + kind] = items;
    await shot('02b_cpr_menu_' + kind);
    await evalJs(`document.body.click()`); await sleep(400);
    // clear search
    await evalJs(`(() => { const x = document.querySelector('button[aria-label="Clear search"]'); if (x) x.click(); })()`);
    await sleep(1500);
  }

  // ---- Bulk selection bar ----
  await evalJs(`(() => {
    const cb = document.querySelector('tbody tr input[type="checkbox"]');
    if (cb) { cb.click(); return true; } return false;
  })()`);
  await sleep(800);
  report.cpr_list.bulk_bar_visible = await evalJs(`document.body.innerText.includes('selected')`);
  report.cpr_list.bulk_bar_buttons = await evalJs(`[...document.querySelectorAll('button')].map(b => b.textContent.trim()).filter(t => /delete|archive|restore|permanent|export/i.test(t))`);
  await shot('03_cpr_bulk_bar');
  await evalJs(`document.body.click()`); await sleep(400);

  // ---- Export dropdown + LIVE click on Export CSV ----
  await evalJs(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Export'); if (b) { b.click(); return true; } return false; })()`);
  await sleep(700);
  report.cpr_list.export_menu = await evalJs(`[...document.querySelectorAll('button')].map(b => b.textContent.trim()).filter(t => /export (pdf|excel|csv)|print/i.test(t))`);
  await shot('04_cpr_export_menu');
  const before = apiCalls.length;
  await evalJs(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Export CSV'); if (b) { b.click(); return true; } return false; })()`);
  await sleep(2500);
  report.cpr_list.export_csv_clicked = true;
  report.cpr_list.export_csv_api_calls = apiCalls.slice(before).map(c => c.url + (c.qs ? '?' + c.qs : '') + ' -> ' + c.status);
  await shot('05_cpr_after_export_csv');
  await sleep(500);

  // ---- Subtabs ----
  const subBtn = await evalJs(`[...document.querySelectorAll('button')].map(b => b.textContent.trim()).filter(t => /^Active/.test(t) || /^Archived/.test(t) || /^Deleted/.test(t))`);
  report.cpr_list.subtabs = subBtn;

  // ---- Deleted subtab with diagnostics ----
  await evalJs(`(() => { const b = [...document.querySelectorAll('button')].find(x => /^Deleted/.test(x.textContent.trim())); if (b) { b.click(); return true; } return false; })()`);
  await sleep(2000);
  report.cpr_list.deleted_row_count = await evalJs(`document.querySelectorAll('tbody tr').length`);
  const delDiag = await evalJs(`(() => {
    const rows = [...document.querySelectorAll('tbody tr')];
    if (!rows.length) return { rows: 0 };
    const first = rows[0];
    const hasMenuBtn = !!first.querySelector('button[aria-label="Row actions"], button[aria-haspopup="menu"]');
    const actionsCell = first.querySelector('td:last-child');
    return {
      rows: rows.length,
      hasMenuBtn,
      firstRowText: first.textContent.trim().slice(0, 90),
      actionsCellHtml: actionsCell ? actionsCell.innerHTML.slice(0, 300) : 'NONE'
    };
  })()`);
  report.cpr_list.deleted_diagnostics = delDiag;
  if (delDiag.hasMenuBtn) {
    await evalJs(`document.querySelectorAll('tbody tr')[0].querySelector('button[aria-label="Row actions"], button[aria-haspopup="menu"]').click()`);
    await sleep(800);
    report.cpr_list.deleted_row_menu = await evalJs(`[...document.querySelectorAll('[role="menuitem"]')].map(m => m.textContent.trim())`);
    await shot('06_cpr_deleted_menu');
  }
  await evalJs(`document.body.click()`); await sleep(400);

  // ---- Back to Active ----
  await evalJs(`(() => { const b = [...document.querySelectorAll('button')].find(x => /^Active/.test(x.textContent.trim())); if (b) b.click(); })()`);
  await sleep(1500);

  report.cpr_list.api_calls = apiCalls;
  report.cpr_list.errors = errors;
  fs.writeFileSync('/tmp/cpr_list_evidence.json', JSON.stringify(report, null, 2));
  console.log('CPR_LIST_EVIDENCE_SAVED');
  console.log(JSON.stringify({ row_menus: report.cpr_list.row_menus, bulk: report.cpr_list.bulk_bar_buttons, export_menu: report.cpr_list.export_menu, export_csv_api: report.cpr_list.export_csv_api_calls, deleted: report.cpr_list.deleted_diagnostics, deleted_menu: report.cpr_list.deleted_row_menu, subtabs: report.cpr_list.subtabs }, null, 1));
}
