/* Focused live verification: CW Restore + Permanent Delete (both dialog-based). */
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
  const report = { rd: {} };
  const apiCalls = [];
  cdp.on('Network.responseReceived', (p) => {
    if (p.response && p.response.url && p.response.url.includes('/v1/')) {
      apiCalls.push({ url: p.response.url.split('?')[0], qs: p.response.url.split('?')[1] || '', status: p.response.status });
    }
  });
  cdp.send('Network.enable'); cdp.send('Page.enable'); cdp.send('Runtime.enable');

  const TOKEN = await apiLogin();
  const cprs = (await api(TOKEN, 'GET', '/cprs?page=0&size=20')).json?.content || [];
  const linkCpr = cprs.find((c) => c.status === 'approved') || cprs[0];
  const created = await api(TOKEN, 'POST', '/cost-workouts', {
    cwDate: '2026-08-04', status: 'draft', preparedBy: 'Admin', department: 'Sales',
    sourceLead: 'Client: Acme (1)', cprId: linkCpr.id, cprRef: linkCpr.prNo,
    customerName: 'VERIFY-CW-RD', items: [{ description: 'rd item', qty: 1, categories: [{ category: 'Material Cost', qty: 1, unit: 'Nos', rate: 100 }] }]
  });
  const cw = created.json?.data || {};
  report.rd.created = { id: cw.id, cwNo: cw.cwNo, status: created.status };

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
  async function switchSubtab(label) {
    await evalJs(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim().startsWith(${JSON.stringify(label)})); if (b) b.click(); return !!b; })()`);
    await sleep(2000);
  }
  const toastText = () => evalJs(`(() => { const p = document.querySelector('div[class*="top-4"][class*="right-4"] p'); return p ? p.textContent.trim() : null; })()`);
  const after = (ms = 2200) => sleep(ms);

  await navigate('http://localhost:5173/cost-workouts');
  await sleep(2200);
  await waitFor(`document.querySelectorAll('tbody tr').length > 0`, 20000);

  // 1) Archive (dialog)
  let idx = await rowIndexOf(cw.cwNo);
  await openRowMenu(idx); await sleep(700);
  await clickMenuItem('Archive'); await sleep(900);
  await clickVisibleButton('Archive'); await after();
  report.rd.archive = { toast: await toastText(), in_active: (await rowIndexOf(cw.cwNo)) !== -1 };
  await shot('50_cw_after_archive');

  // 2) Restore (dialog) from Archived tab
  await switchSubtab('Archived');
  idx = await rowIndexOf(cw.cwNo);
  await openRowMenu(idx); await sleep(700);
  report.rd.menu_archived = await menuItems();
  await shot('51_cw_restore_menu');
  await clickMenuItem('Restore'); await sleep(900);
  report.rd.restore_dialog = await evalJs(`(() => {
    const overlays = [...document.querySelectorAll('div')].filter(d => d.offsetParent !== null && getComputedStyle(d).position === 'fixed' && d.children.length > 0 && d.textContent.length < 400);
    for (const o of overlays.reverse()) {
      const btns = [...o.querySelectorAll('button')].map(b => b.textContent.trim()).filter(Boolean);
      if (btns.includes('Cancel')) return { title: o.textContent.trim().slice(0, 120), buttons: btns };
    }
    return null;
  })()`);
  await shot('52_cw_restore_dialog');
  await clickVisibleButton('Restore'); await after();
  report.rd.restore = { toast: await toastText(), in_archived: (await rowIndexOf(cw.cwNo)) !== -1 };
  await shot('53_cw_after_restore');
  await switchSubtab('Active');

  // 3) Delete (dialog)
  idx = await rowIndexOf(cw.cwNo);
  await openRowMenu(idx); await sleep(700);
  await clickMenuItem('Delete'); await sleep(900);
  await shot('54_cw_delete_dialog');
  await clickVisibleButton('Delete'); await after();
  report.rd.delete = { toast: await toastText(), in_active: (await rowIndexOf(cw.cwNo)) !== -1 };
  await shot('55_cw_after_delete');

  // 4) Permanent Delete (dialog) from Deleted tab
  await switchSubtab('Deleted');
  idx = await rowIndexOf(cw.cwNo);
  await openRowMenu(idx); await sleep(700);
  report.rd.menu_deleted = await menuItems();
  await shot('56_cw_permdel_menu');
  await clickMenuItem('Permanent Delete'); await sleep(900);
  await shot('57_cw_permdel_dialog');
  await clickVisibleButton('Delete Forever'); await after();
  report.rd.permanent_delete = { toast: await toastText(), in_deleted: (await rowIndexOf(cw.cwNo)) !== -1 };
  report.rd.db_after = (await api(TOKEN, 'GET', `/cost-workouts/${cw.id}`)).status;
  await shot('58_cw_after_permdel');
  await switchSubtab('Active');

  // cleanup: perm-delete all leftover test CWs (8, 9, 10, current)
  await api(TOKEN, 'POST', '/cost-workouts/bulk-permanent-delete', { ids: [8, 9, 10, cw.id] });

  report.rd.api_calls = apiCalls;
  fs.writeFileSync('evidence/cw_rd_evidence.json', JSON.stringify(report, null, 2));
  console.log('CW_RD_EVIDENCE_SAVED');
  console.log(JSON.stringify({ created: report.rd.created, archive: report.rd.archive, menu_archived: report.rd.menu_archived, restore_dialog: report.rd.restore_dialog, restore: report.rd.restore, delete: report.rd.delete, menu_deleted: report.rd.menu_deleted, permanent_delete: report.rd.permanent_delete, db_after: report.rd.db_after }, null, 1));
}
