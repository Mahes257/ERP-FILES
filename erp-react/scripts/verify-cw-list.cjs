/* Live Cost Workout List verification: full ERP menu, Submit, Archive->Restore,
 * Delete->PermanentDelete, Export. Evidence: screenshots + API + DB. */
const fs = require('fs');

module.exports = { run };

const API = 'http://localhost:8080/v1';

async function apiLogin() {
  const r = await fetch(API + '/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@vishaktech.com', password: 'Admin@123' })
  }).then((x) => x.json());
  return r.data?.token || r.token || r.accessToken;
}
async function api(token, method, url, body) {
  const res = await fetch(API + url, {
    method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch (e) {}
  return { status: res.status, json, text: text.slice(0, 200) };
}

async function run({ cdp, sleep, helpers }) {
  const { evalJs, navigate, waitFor, shot } = helpers;
  const report = { cw: {} };
  const apiCalls = [];
  cdp.on('Network.responseReceived', (p) => {
    if (p.response && p.response.url && p.response.url.includes('/v1/')) {
      apiCalls.push({ url: p.response.url.split('?')[0], qs: p.response.url.split('?')[1] || '', status: p.response.status });
    }
  });
  cdp.send('Network.enable'); cdp.send('Page.enable'); cdp.send('Runtime.enable');

  // ---- API setup: find a CPR to link + create a draft CW ----
  const TOKEN = await apiLogin();
  const cprs = (await api(TOKEN, 'GET', '/cprs?page=0&size=20')).json?.content || [];
  const linkCpr = cprs.find((c) => c.status === 'approved') || cprs[0];
  const created = await api(TOKEN, 'POST', '/cost-workouts', {
    cwDate: '2026-08-04',
    status: 'draft',
    preparedBy: 'Admin',
    department: 'Sales',
    sourceLead: 'Client: Acme (1)',
    cprId: linkCpr.id,
    cprRef: linkCpr.prNo,
    customerName: 'VERIFY-CW-CLIENT',
    company: 'VERIFY-CW-CO',
    description: 'cw live action test',
    profitPct: 10, gstPct: 18,
    items: [{ description: 'cw item 1', qty: 2, unit: 'Nos', categories: [{ category: 'Material Cost', qty: 2, unit: 'Nos', rate: 500, notes: '' }] }]
  });
  const cw = created.json?.data || {};
  report.cw.created = { id: cw.id, cwNo: cw.cwNo, status: created.status, cprRef: linkCpr.prNo };

  // ---- browser login ----
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

  const closeOpenMenu = () => evalJs(`(() => { const b = document.querySelector('button[aria-expanded="true"]'); if (b) { b.click(); return true; } return false; })()`);
  const rowIndexOf = (text) => evalJs(`(() => { const rows = [...document.querySelectorAll('tbody tr')]; return rows.findIndex(r => r.textContent.includes(${JSON.stringify(text)})); })()`);
  async function openRowMenu(idx) {
    await closeOpenMenu(); await sleep(400);
    return evalJs(`(() => { const row = document.querySelectorAll('tbody tr')[${idx}]; if (!row) return false; const mb = row.querySelector('button[aria-label="Row actions"], button[aria-haspopup="menu"]'); if (!mb) return false; mb.click(); return true; })()`);
  }
  const menuItems = () => evalJs(`[...document.querySelectorAll('[role="menuitem"]')].map(m => m.textContent.trim())`);
  async function clickMenuItem(label) {
    return evalJs(`(() => { const it = [...document.querySelectorAll('[role="menuitem"]')].find(m => m.textContent.trim() === ${JSON.stringify(label)}); if (!it) return false; it.click(); return true; })()`);
  }
  async function clickVisibleButton(label) {
    return evalJs(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === ${JSON.stringify(label)} && x.offsetParent !== null); if (!b) return false; b.click(); return true; })()`);
  }
  async function visibleDialogInfo() {
    return evalJs(`(() => {
      const overlays = [...document.querySelectorAll('div')].filter(d => d.offsetParent !== null && getComputedStyle(d).position === 'fixed' && d.children.length > 0 && d.textContent.length > 5 && d.textContent.length < 400);
      for (const o of overlays.reverse()) {
        const btns = [...o.querySelectorAll('button')].map(b => b.textContent.trim()).filter(Boolean);
        if (btns.includes('Cancel')) return { title: o.textContent.trim().slice(0, 160), buttons: btns };
      }
      return null;
    })()`);
  }
  async function switchSubtab(label) {
    await evalJs(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim().startsWith(${JSON.stringify(label)})); if (b) b.click(); return !!b; })()`);
    await sleep(2000);
  }
  const toastText = () => evalJs(`(() => { const p = document.querySelector('div[class*="top-4"][class*="right-4"] p'); return p ? p.textContent.trim() : null; })()`);
  const rowCount = () => evalJs(`document.querySelectorAll('tbody tr').length`);

  await navigate('http://localhost:5173/cost-workouts');
  await sleep(2200);
  await waitFor(`document.querySelectorAll('tbody tr').length > 0`, 20000);
  await shot('30_cw_list_page');
  report.cw.row_count = await rowCount();
  report.cw.headers = await evalJs(`[...document.querySelectorAll('thead th')].map(t => t.textContent.trim())`);

  // ---- Full ERP row menu (draft CW with cprRef) ----
  const cwIdx = await rowIndexOf(cw.cwNo);
  await openRowMenu(cwIdx); await sleep(700);
  report.cw.menu_before = await menuItems();
  await shot('31_cw_menu_active');

  // ---- Submit for Approval ----
  await clickMenuItem('Submit for Approval'); await sleep(900);
  report.cw.submit_dialog = await visibleDialogInfo();
  await shot('32_cw_submit_dialog');
  await clickVisibleButton('Submit');
  await sleep(2200);
  report.cw.submit = { toast: await toastText(), status_api: (await api(TOKEN, 'GET', `/cost-workouts/${cw.id}`)).json?.data?.status };
  await shot('33_cw_after_submit');

  // ---- Archive (opens confirm dialog in CW list, unlike CPR direct archive) ----
  const cwIdx2 = await rowIndexOf(cw.cwNo);
  await openRowMenu(cwIdx2); await sleep(700);
  report.cw.menu_after_submit = await menuItems();
  await clickMenuItem('Archive'); await sleep(900);
  report.cw.archive_dialog = await visibleDialogInfo();
  await shot('34_cw_archive_dialog');
  await clickVisibleButton('Archive');
  await sleep(2200);
  report.cw.archive = { toast: await toastText(), still_in_active: (await rowIndexOf(cw.cwNo)) !== -1 };
  await shot('34b_cw_after_archive');

  // ---- Restore (Archived tab) ----
  await switchSubtab('Archived');
  const cwIdxA = await rowIndexOf(cw.cwNo);
  report.cw.archived_row_index = cwIdxA;
  await openRowMenu(cwIdxA); await sleep(700);
  report.cw.menu_archived = await menuItems();
  await shot('35_cw_menu_archived');
  await clickMenuItem('Restore');
  await sleep(2200);
  report.cw.restore = { toast: await toastText(), still_in_archived: (await rowIndexOf(cw.cwNo)) !== -1 };
  await shot('36_cw_after_restore');
  await switchSubtab('Active');

  // ---- Delete ----
  const cwIdxB = await rowIndexOf(cw.cwNo);
  await openRowMenu(cwIdxB); await sleep(700);
  await clickMenuItem('Delete'); await sleep(900);
  report.cw.delete_dialog = await visibleDialogInfo();
  await shot('37_cw_delete_dialog');
  await clickVisibleButton('Delete');
  await sleep(2200);
  report.cw.delete = { toast: await toastText(), still_in_active: (await rowIndexOf(cw.cwNo)) !== -1 };
  await shot('38_cw_after_delete');

  // ---- Permanent Delete (Deleted tab) ----
  await switchSubtab('Deleted');
  const cwIdxD = await rowIndexOf(cw.cwNo);
  await openRowMenu(cwIdxD); await sleep(700);
  report.cw.menu_deleted = await menuItems();
  await shot('39_cw_menu_deleted');
  await clickMenuItem('Permanent Delete'); await sleep(900);
  report.cw.permdel_dialog = await visibleDialogInfo();
  await shot('40_cw_permdel_dialog');
  await clickVisibleButton('Delete Forever');
  await sleep(2200);
  report.cw.permanent_delete = { toast: await toastText(), still_in_deleted: (await rowIndexOf(cw.cwNo)) !== -1 };
  await shot('41_cw_after_permdel');
  report.cw.db_after = (await api(TOKEN, 'GET', `/cost-workouts/${cw.id}`)).status;
  await switchSubtab('Active');

  // ---- cleanup: permanently delete leftover probe CWs (id 8 probe, id 9 prior run) ----
  await api(TOKEN, 'POST', '/cost-workouts/bulk-permanent-delete', { ids: [8, 9] });

  // ---- Export dropdown ----
  await evalJs(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Export'); if (b) { b.click(); return true; } return false; })()`);
  await sleep(700);
  report.cw.export_menu = await evalJs(`[...document.querySelectorAll('button')].map(b => b.textContent.trim()).filter(t => /export (pdf|excel|csv)|print/i.test(t))`);
  await shot('42_cw_export_menu');
  await evalJs(`document.body.click()`); await sleep(300);

  // ---- Bulk bar ----
  await evalJs(`(() => { const cb = document.querySelector('tbody tr input[type="checkbox"]'); if (cb) { cb.click(); return true; } return false; })()`);
  await sleep(800);
  report.cw.bulk_buttons = await evalJs(`[...document.querySelectorAll('button')].map(b => b.textContent.trim()).filter(t => /delete|archive|restore|permanent|export/i.test(t)).slice(0, 8)`);
  await shot('43_cw_bulk_bar');
  await evalJs(`document.body.click()`); await sleep(300);

  report.cw.api_calls = apiCalls;
  fs.writeFileSync('evidence/cw_list_evidence.json', JSON.stringify(report, null, 2));
  console.log('CW_LIST_EVIDENCE_SAVED');
  console.log(JSON.stringify({ created: report.cw.created, menu_before: report.cw.menu_before, submit: report.cw.submit, menu_after_submit: report.cw.menu_after_submit, archive: report.cw.archive, menu_archived: report.cw.menu_archived, restore: report.cw.restore, delete: report.cw.delete, menu_deleted: report.cw.menu_deleted, permanent_delete: report.cw.permanent_delete, db_after: report.cw.db_after, export_menu: report.cw.export_menu, bulk_buttons: report.cw.bulk_buttons }, null, 1));
}
