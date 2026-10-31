/* Live CPR List action-flow verification — v3 (row lookup by PR number, no search box).
 * A (draft):  Archive -> Restore (Archived tab)
 * B (draft):  Delete (dialog) -> Permanent Delete (Deleted tab, dialog)
 * C (approved via API): menu shows "Convert to Quotation" -> click -> quotation created -> menu shows "Open Quotation"
 */
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
  const report = { actions: {} };
  const apiCalls = [];
  cdp.on('Network.responseReceived', (p) => {
    if (p.response && p.response.url && p.response.url.includes('/v1/')) {
      apiCalls.push({ url: p.response.url.split('?')[0], qs: p.response.url.split('?')[1] || '', status: p.response.status });
    }
  });
  cdp.send('Network.enable'); cdp.send('Page.enable'); cdp.send('Runtime.enable');

  // ---- API setup ----
  const TOKEN = await apiLogin();
  const make = (tag) => api(TOKEN, 'POST', '/cprs', {
    clientName: 'VERIFY-TEST-' + tag, client: 'VERIFY-TEST-' + tag, description: 'live action test ' + tag,
    department: 'Sales', remarks: 'test',
    items: [{ description: 'item ' + tag, qty: 2, estimatedCost: 500 }]
  });
  const A = await make('A'); await sleep(250);
  const B = await make('B'); await sleep(250);
  const C = await make('C');
  const cprA = A.json?.data || {}, cprB = B.json?.data || {}, cprC = C.json?.data || {};
  report.actions.created = { A: { id: cprA.id, prNo: cprA.prNo }, B: { id: cprB.id, prNo: cprB.prNo }, C: { id: cprC.id, prNo: cprC.prNo } };
  report.actions.c_approval = {
    submit: (await api(TOKEN, 'POST', `/cprs/${cprC.id}/submit`)).status,
    approve: (await api(TOKEN, 'POST', `/cprs/${cprC.id}/approve`, { remarks: 'approve for convert test' })).status
  };

  // ---- Browser login ----
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

  // ---- Page helpers ----
  const rowIndexOf = (prNo) => evalJs(`(() => { const rows = [...document.querySelectorAll('tbody tr')]; return rows.findIndex(r => r.textContent.includes(${JSON.stringify(prNo)})); })()`);
  const rowCount = () => evalJs(`document.querySelectorAll('tbody tr').length`);
  async function openRowMenu(idx) {
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
      // Modal overlay: a fixed/absolute backdrop with a centered card.
      const overlays = [...document.querySelectorAll('div')].filter(d => d.offsetParent !== null && (getComputedStyle(d).position === 'fixed') && d.children.length > 0 && d.textContent.length > 5 && d.textContent.length < 400);
      for (const o of overlays.reverse()) {
        const btns = [...o.querySelectorAll('button')].map(b => b.textContent.trim()).filter(Boolean);
        if (btns.includes('Cancel')) return { title: o.textContent.trim().slice(0, 160), buttons: btns };
      }
      return null;
    })()`);
  }
  async function switchSubtab(label) {
    await evalJs(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim().startsWith(${JSON.stringify(label)})); if (b) b.click(); return !!b; })()`);
    await sleep(1800);
  }
  async function afterAction() {
    await sleep(2200); // refreshKey -> list reload
    await waitFor(`document.querySelectorAll('tbody tr').length > 0 || document.body.innerText.includes('No ')`, 15000);
  }
  const toastText = () => evalJs(`(() => { const els = [...document.querySelectorAll('div')].filter(d => /^[A-Za-z].*(archived|restored|deleted|converted|updated|trash|permanent)/i.test(d.textContent) && d.textContent.length < 80); return els.length ? els[els.length - 1].textContent.trim() : null; })()`);

  await navigate('http://localhost:5173/cprs');
  await sleep(2200);
  await waitFor(`document.querySelectorAll('tbody tr').length > 0`, 20000);

  // ---------- TEST 5 first: CPR-C Convert to Quotation (row 0 = newest = C, approved) ----------
  const cIdx = await rowIndexOf(cprC.prNo);
  await openRowMenu(cIdx); await sleep(700);
  report.actions.C_menu_before = await menuItems();
  await shot('10_cpr_c_menu_convert');
  await clickMenuItem('Convert to Quotation');
  await afterAction();
  report.actions.C_convert = { toast: await toastText() };
  const afterC = await api(TOKEN, 'GET', `/cprs/${cprC.id}`);
  const cprAfter = afterC.json?.data || afterC.json || {};
  report.actions.C_after_api = { status: afterC.status, convertedToQtn: cprAfter.convertedToQtn, quotationId: cprAfter.quotationId };
  const cIdx2 = await rowIndexOf(cprC.prNo);
  await openRowMenu(cIdx2); await sleep(700);
  report.actions.C_menu_after = await menuItems();
  await shot('11_cpr_c_menu_after_convert');
  await evalJs(`document.body.click()`); await sleep(400);

  // ---------- TEST 1: CPR-A Archive ----------
  const aIdx = await rowIndexOf(cprA.prNo);
  await openRowMenu(aIdx); await sleep(700);
  report.actions.A_menu_before = await menuItems();
  await clickMenuItem('Archive');
  await afterAction();
  report.actions.A_archive = { toast: await toastText(), still_in_active: (await rowIndexOf(cprA.prNo)) !== -1 };
  await shot('12_cpr_a_after_archive');

  // ---------- TEST 2: CPR-A Restore (Archived tab) ----------
  await switchSubtab('Archived');
  const aIdxArch = await rowIndexOf(cprA.prNo);
  report.actions.A_archived_row_index = aIdxArch;
  await openRowMenu(aIdxArch); await sleep(700);
  report.actions.A_menu_archived = await menuItems();
  await shot('13_cpr_a_menu_archived');
  await clickMenuItem('Restore');
  await afterAction();
  report.actions.A_restore = { toast: await toastText(), still_in_archived: (await rowIndexOf(cprA.prNo)) !== -1 };
  await shot('14_cpr_a_after_restore');
  await switchSubtab('Active');

  // ---------- TEST 3: CPR-B Delete ----------
  const bIdx = await rowIndexOf(cprB.prNo);
  await openRowMenu(bIdx); await sleep(700);
  await clickMenuItem('Delete'); await sleep(900);
  report.actions.B_delete_dialog = await visibleDialogInfo();
  await shot('15_cpr_b_delete_dialog');
  await clickVisibleButton('Delete');
  await afterAction();
  report.actions.B_delete = { toast: await toastText(), still_in_active: (await rowIndexOf(cprB.prNo)) !== -1 };
  await shot('16_cpr_b_after_delete');

  // ---------- TEST 4: CPR-B Permanent Delete (Deleted tab) ----------
  await switchSubtab('Deleted');
  const bIdxDel = await rowIndexOf(cprB.prNo);
  await openRowMenu(bIdxDel); await sleep(700);
  report.actions.B_menu_deleted = await menuItems();
  await shot('17_cpr_b_menu_deleted');
  await clickMenuItem('Permanent Delete'); await sleep(900);
  report.actions.B_permdel_dialog = await visibleDialogInfo();
  await shot('18_cpr_b_permdel_dialog');
  await clickVisibleButton('Delete');
  await afterAction();
  report.actions.B_permanent_delete = { toast: await toastText(), still_in_deleted: (await rowIndexOf(cprB.prNo)) !== -1 };
  await shot('19_cpr_b_after_permdel');
  await switchSubtab('Active');

  // ---------- DB row check via API (permanent delete proof) ----------
  const dbB = await api(TOKEN, 'GET', `/cprs/${cprB.id}`);
  report.actions.B_db_after = { status: dbB.status };

  // ---------- cleanup: permanent delete remaining test CPRs (A, C) ----------
  await api(TOKEN, 'POST', '/cprs/bulk-permanent-delete', { ids: [cprA.id, cprC.id] });

  report.actions.api_calls = apiCalls;
  fs.writeFileSync('evidence/cpr_actions_evidence.json', JSON.stringify(report, null, 2));
  console.log('CPR_ACTIONS_EVIDENCE_SAVED');
}
