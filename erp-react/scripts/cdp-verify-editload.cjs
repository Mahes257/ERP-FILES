module.exports = { run: async ({ cdp, sleep, helpers }) => {
  const { evalJs, navigate } = helpers;
  // hook console.error capture once
  await evalJs(`(() => { if (!window.__errs) { window.__errs = []; const o = console.error; console.error = function () { window.__errs.push(Array.from(arguments).map((a) => (a && a.message) || String(a)).join(' ').slice(0, 200)); o.apply(console, arguments); }; } return true; })()`);
  for (const [tag, route, expectClient] of [['SO', '/sales-orders/30/edit', 'TechVision Labs'], ['PI', '/proforma-invoices/20/edit', 'Subramani Pharma'], ['PR', '/payment-receipts/10/edit', 'SK Logistics'], ['CN', '/credit-notes/11/edit', 'TechVision Labs']]) {
    await navigate('http://localhost:5173' + route);
    await sleep(4500);
    const d = await evalJs(`(() => {
      const client = document.querySelector('input[aria-label="Client"], input[aria-label="Customer"], input[aria-label="Select Customer"]');
      const rows = Array.from(document.querySelectorAll('tbody tr')).length;
      const itemInputs = Array.from(document.querySelectorAll('input[placeholder*="Item description"], input[placeholder="Product name"]')).length;
      return { clientVal: client ? client.value : null, rows, itemInputs };
    })()`);
    console.log('EDITLOAD ' + tag + ': ' + JSON.stringify(d));
  }
  const errs = await evalJs(`(() => window.__errs || [])()`);
  console.log('CONSOLE_ERRS: ' + JSON.stringify(errs.slice(0, 8)));
  console.log('EDITLOAD_DONE');
}};
