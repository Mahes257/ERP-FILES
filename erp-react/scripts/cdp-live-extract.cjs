/**
 * Extract the CURRENT erp-react create-page structure from the live app:
 * section titles, field labels, table headers, buttons, selects (option labels).
 * Sidebar/nav content is excluded.
 */
const ROUTES = [
  ['clients', '/leads/new'],
  ['leads', '/leads/new'],
  ['followups', '/leads/new'],
  ['cpr', '/cprs/new'],
  ['costWorkout', '/cost-workouts/new'],
  ['quotation', '/quotations/new'],
  ['salesContract', '/sales-contracts/new'],
  ['salesOrder', '/sales-orders/new'],
  ['deliveryChallan', '/delivery-challans/new'],
  ['proforma', '/proforma-invoices/new'],
  ['invoice', '/invoices/new'],
  ['paymentReceipt', '/payment-receipts/new'],
  ['creditNote', '/credit-notes/new']
];

const EXTRACT = `(() => {
  const isNav = (el) => !!el.closest('aside, nav, [class*="sidebar"], [class*="Sidebar"]');
  const norm = (t) => t.replace(/\\s+/g, ' ').trim();
  const out = { sectionTitles: [], labels: [], ths: [], buttons: [], selects: [] };
  // section titles: h1/h2/h3 + accordion headers (button with span title + chevron)
  const seen = new Set();
  Array.from(document.querySelectorAll('h1, h2, h3, legend, [class*="card-header"], [class*="section-title"], [class*="form-card-header"]')).forEach((h) => {
    if (isNav(h)) return;
    const t = norm(h.textContent);
    if (t && t.length < 90 && !seen.has(t)) { seen.add(t); out.sectionTitles.push(t); }
  });
  Array.from(document.querySelectorAll('button')).forEach((b) => {
    if (isNav(b)) return;
    const t = norm(b.textContent);
    if (t && t.length < 60) {
      const hasChild = b.querySelectorAll('input, select, textarea').length === 0;
      if (hasChild) out.buttons.push(t);
    }
  });
  Array.from(document.querySelectorAll('label')).forEach((l) => {
    if (isNav(l)) return;
    const t = norm(l.textContent).replace(/\\*$/, '').trim();
    if (t) out.labels.push(t);
  });
  Array.from(document.querySelectorAll('th')).forEach((th) => {
    if (isNav(th)) return;
    const t = norm(th.textContent);
    if (t) out.ths.push(t);
  });
  Array.from(document.querySelectorAll('select')).forEach((s) => {
    if (isNav(s)) return;
    out.selects.push(Array.from(s.options).map((o) => norm(o.textContent)).filter(Boolean));
  });
  // dedupe
  out.sectionTitles = Array.from(new Set(out.sectionTitles));
  out.labels = Array.from(new Set(out.labels));
  out.ths = Array.from(new Set(out.ths));
  out.buttons = Array.from(new Set(out.buttons));
  return out;
})()`;

module.exports = {
  run: async ({ cdp, sleep, helpers }) => {
    const { evalJs, navigate } = helpers;
    const results = {};
    for (const [key, route] of ROUTES) {
      try {
        await navigate('http://localhost:5173' + route);
        await sleep(4500);
        const d = await evalJs(EXTRACT);
        results[key] = { route, ...d };
        console.log('LIVE_' + key + ': ' + JSON.stringify({ sections: d.sectionTitles, labels: d.labels.length, ths: d.ths, btns: d.buttons.slice(0, 14) }));
      } catch (e) {
        results[key] = { route, error: e.message };
        console.log('LIVE_' + key + '_ERR: ' + e.message);
      }
    }
    require('fs').writeFileSync('evidence/erp-react-live-structure.json', JSON.stringify(results, null, 1));
    console.log('LIVE_DONE');
  }
};
