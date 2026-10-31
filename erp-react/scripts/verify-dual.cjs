/* Dual-origin verification: run the same live checks against one origin (set via env ORIGIN).
 * Captures: API calls (url -> status), console errors, network failures, row menus,
 * bulk bar buttons, export menu, subtabs. Saves evidence + JSON report. */
const fs = require('fs');

const ORIGIN = process.env.ORIGIN || 'http://localhost:5173';

module.exports = { run };

async function run({ cdp, sleep, helpers }) {
  const { evalJs, navigate, waitFor, shot } = helpers;
  const report = { origin: ORIGIN, api_calls: [], console_errors: [], network_failures: [], checks: {} };
  const results = {};

  cdp.send('Page.enable');
  cdp.send('Runtime.enable');
  cdp.send('Network.enable');

  // Capture API calls + failures
  cdp.on('Network.responseReceived', (p) => {
    if (p.response && /\/v1\//.test(p.response.url)) {
      report.api_calls.push({ url: p.response.url.replace(ORIGIN, ''), status: p.response.status });
    }
  });
  cdp.on('Network.loadingFailed', (p) => {
    report.network_failures.push(p.errorText || 'failed');
  });
  // Capture console errors
  cdp.on('Runtime.consoleAPICalled', (p) => {
    if (p.type === 'error') report.console_errors.push(p.args.map(a => a.value || a.description || '').join(' '));
  });
  cdp.on('Runtime.exceptionThrown', (p) => {
    report.console_errors.push('EXCEPTION: ' + (p.exceptionDetails?.exception?.description || p.exceptionDetails?.text || ''));
  });

  // --- Login ---
  await navigate(ORIGIN + '/signin');
  // ngrok free interstitial may appear first; click "Visit Site" if present
  await sleep(1500);
  const visited = await evalJs(`(() => {
    const btn = [...document.querySelectorAll('button, a')].find(b => /visit site/i.test(b.textContent));
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
  await evalJs(`(() => { const b = [...document.querySelectorAll('button')].find(x => /sign\\s*in|login|submit/i.test(x.textContent)); if (b) b.click(); })()`);
  await sleep(2800);
  const loggedIn = await evalJs(`document.body.innerText.includes('Dashboard') || !location.pathname.includes('signin')`);
  results.logged_in = loggedIn;
  if (!loggedIn) { await shot('NG_d' + (ORIGIN.includes('ngrok') ? '_ngrok' : '_local') + '_login_fail'); }

  const closeMenu = () => evalJs(`(() => { const b = document.querySelector('button[aria-expanded="true"]'); if (b) { b.click(); return true; } return false; })()`);
  async function openMenu(rowIdx) {
    await closeMenu(); await sleep(300);
    return evalJs(`(() => { const r = document.querySelectorAll('tbody tr')[${rowIdx}]; if (!r) return false; const mb = r.querySelector('button[aria-label="Row actions"], button[aria-haspopup="menu"]'); if (!mb) return false; mb.click(); return true; })()`);
  }
  const menuItems = () => evalJs(`[...document.querySelectorAll('[role="menuitem"]')].map(m => m.textContent.trim())`);

  async function checkList(path, label) {
    await navigate(ORIGIN + path);
    await sleep(2200);
    await waitFor(`document.querySelectorAll('tbody tr').length > 0`, 25000).catch(() => {});
    const rowCount = await evalJs(`document.querySelectorAll('tbody tr').length`);
    const res = { rowCount };
    await shot(label + '_rows');
    if (rowCount > 0) {
      await openMenu(0); await sleep(700);
      res.row_menu = await menuItems();
      await shot(label + '_row_menu');
      await closeMenu(); await sleep(300);
      // bulk bar
      await evalJs(`(() => { const cb = document.querySelector('tbody tr input[type="checkbox"]'); if (cb) cb.click(); })()`);
      await sleep(800);
      res.bulk_buttons = await evalJs(`[...document.querySelectorAll('button')].map(b => b.textContent.trim()).filter(t => /delete|archive|restore|permanent|export/i.test(t)).slice(0, 10)`);
      await shot(label + '_bulk_bar');
      await evalJs(`document.body.click()`); await sleep(300);
    }
    // export dropdown (toolbar)
    await evalJs(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Export'); if (b) { b.click(); return true; } return false; })()`);
    await sleep(600);
    res.export_menu = await evalJs(`[...document.querySelectorAll('button')].map(b => b.textContent.trim()).filter(t => /export (pdf|excel|csv)|print/i.test(t))`);
    await shot(label + '_export_menu');
    await evalJs(`document.body.click()`); await sleep(300);
    res.subtabs = await evalJs(`[...document.querySelectorAll('button')].map(b => b.textContent.trim()).filter(t => /^Active/.test(t) || /^Archived/.test(t) || /^Deleted/.test(t))`);
    return res;
  }

  report.checks.cpr = await checkList('/cprs', 'NG_cpr');
  report.checks.costWorkout = await checkList('/cost-workouts', 'NG_cw');

  // Summarize API call statuses
  const api = report.api_calls;
  report.api_summary = {
    total: api.length,
    non_2xx: api.filter(a => a.status < 200 || a.status >= 300),
    auth_calls: api.filter(a => a.url.includes('/auth/')).slice(0, 3),
    cpr_calls: api.filter(a => a.url.includes('/cprs')).slice(0, 5),
  };
  report.checks.logged_in = loggedIn;
  report.checks.console_errors = report.console_errors;
  report.checks.network_failures = report.network_failures;

  const tag = ORIGIN.includes('ngrok') ? 'ngrok' : 'local';
  fs.writeFileSync('evidence/dual_' + tag + '_evidence.json', JSON.stringify(report, null, 2));
  console.log('DUAL_EVIDENCE_SAVED_' + tag.toUpperCase());
  console.log(JSON.stringify({ origin: ORIGIN, ...report.checks, api_summary: report.api_summary }, null, 1));
}
