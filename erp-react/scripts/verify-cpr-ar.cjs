/* Clean live verification: CPR List Archive -> Restore (one test CPR). */
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
  return { status: res.status, json };
}

async function run({ cdp, sleep, helpers }) {
  const { evalJs, navigate, waitFor, shot } = helpers;
  const report = { ar: {} };
  const apiCalls = [];
  cdp.on('Network.responseReceived', (p) => {
    if (p.response && p.response.url && p.response.url.includes('/v1/')) {
      apiCalls.push({ url: p.response.url.split('?')[0], qs: p.response.url.split('?')[1] || '', status: p.response.status });
    }
  });
  cdp.send('Network.enable'); cdp.send('Page.enable'); cdp.send('Runtime.enable');

  // ---- create a single draft CPR ----
  const TOKEN = await apiLogin();
  const created = await api(TOKEN, 'POST', '/cprs', {
    clientName: 'VERIFY-AR', client: 'VERIFY-AR', description: 'archive-restore live test',
    department: 'Sales', items: [{ description: 'ar item', qty: 1, estimatedCost: 100 }]
  });
  const pr = created.json?.data || {};
  report.ar.created = { id: pr.id, prNo: pr.prNo, status: created.status };

  // ---- login browser ----
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
  const rowIndexOf = (prNo) => evalJs(`(() => { const rows = [...document.querySelectorAll('tbody tr')]; return rows.findIndex(r => r.textContent.includes(${JSON.stringify(prNo)})); })()`);
  async function openRowMenu(idx) {
    await closeOpenMenu(); await sleep(400);
    return evalJs(`(() => { const row = document.querySelectorAll('tbody tr')[${idx}]; if (!row) return false; const mb = row.querySelector('button[aria-label="Row actions"], button[aria-haspopup="menu"]'); if (!mb) return false; mb.click(); return true; })()`);
  }
  const menuItems = () => evalJs(`[...document.querySelectorAll('[role="menuitem"]')].map(m => m.textContent.trim())`);
  async function clickMenuItem(label) {
    return evalJs(`(() => { const it = [...document.querySelectorAll('[role="menuitem"]')].find(m => m.textContent.trim() === ${JSON.stringify(label)}); if (!it) return false; it.click(); return true; })()`);
  }
  async function switchSubtab(label) {
    await evalJs(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim().startsWith(${JSON.stringify(label)})); if (b) b.click(); return !!b; })()`);
    await sleep(2000);
  }
  const toastText = () => evalJs(`(() => { const p = document.querySelector('div[class*="top-4"][class*="right-4"] p'); return p ? p.textContent.trim() : null; })()`);

  await navigate('http://localhost:5173/cprs');
  await sleep(2200);
  await waitFor(`document.querySelectorAll('tbody tr').length > 0`, 20000);

  // ---- ARCHIVE ----
  const aIdx = await rowIndexOf(pr.prNo);
  await openRowMenu(aIdx); await sleep(700);
  report.ar.menu_before = await menuItems();
  await shot('20_cpr_ar_menu_active');
  await clickMenuItem('Archive');
  await sleep(2200);
  await waitFor(`document.querySelectorAll('tbody tr').length > 0 || document.body.innerText.includes('No ')`, 15000);
  report.ar.archive = {
    toast: await toastText(),
    still_in_active: (await rowIndexOf(pr.prNo)) !== -1
  };
  await shot('21_cpr_ar_after_archive');

  // ---- RESTORE (Archived subtab) ----
  await switchSubtab('Archived');
  const aIdxArch = await rowIndexOf(pr.prNo);
  report.ar.archived_row_index = aIdxArch;
  await openRowMenu(aIdxArch); await sleep(700);
  report.ar.menu_archived = await menuItems();
  await shot('22_cpr_ar_menu_archived');
  await clickMenuItem('Restore');
  await sleep(2200);
  await waitFor(`document.querySelectorAll('tbody tr').length > 0 || document.body.innerText.includes('No ')`, 15000);
  report.ar.restore = {
    toast: await toastText(),
    still_in_archived: (await rowIndexOf(pr.prNo)) !== -1
  };
  await shot('23_cpr_ar_after_restore');

  // ---- DB proof ----
  report.ar.db = {
    archived_rows_after: (await api(TOKEN, 'GET', '/cprs?page=0&size=50&status=archived')).json?.content?.length,
    active_has_it: (await api(TOKEN, 'GET', '/cprs?page=0&size=50')).json?.content?.some(c => c.id === pr.id)
  };

  // ---- cleanup ----
  await api(TOKEN, 'POST', '/cprs/bulk-permanent-delete', { ids: [pr.id] });

  report.ar.api_calls = apiCalls;
  fs.writeFileSync('evidence/cpr_ar_evidence.json', JSON.stringify(report, null, 2));
  console.log('CPR_AR_EVIDENCE_SAVED');
  console.log(JSON.stringify({ created: report.ar.created, menu_before: report.ar.menu_before, archive: report.ar.archive, archived_row_index: report.ar.archived_row_index, menu_archived: report.ar.menu_archived, restore: report.ar.restore, db: report.ar.db }, null, 1));
}
