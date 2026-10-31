module.exports = { run: async ({ cdp, sleep, helpers }) => {
  const { evalJs, navigate } = helpers;
  for (const [tag, route] of [['SC', '/sales-contracts/new'], ['PR', '/payment-receipts/new'], ['QTN', '/quotations/new']]) {
    await navigate('http://localhost:5173' + route);
    await sleep(4500);
    const dump = await evalJs(`(() => {
      const btns = Array.from(document.querySelectorAll('button')).map((b) => b.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean);
      const addItem = btns.filter((t) => t.includes('Add'));
      const productInputs = Array.from(document.querySelectorAll('input[aria-label="Product"]')).length;
      const clientInputs = Array.from(document.querySelectorAll('input[aria-label="Client"], input[aria-label="Customer"], input[aria-label="Select Customer"]')).length;
      const selectProduct = btns.filter((t) => t.includes('Select Product'));
      const saves = btns.filter((t) => /save|submit|mark|received/i.test(t));
      return { total: btns.length, addItem, productInputs, clientInputs, selectProduct, saves: saves.slice(0, 10) };
    })()`);
    console.log('BTNS_' + tag + ': ' + JSON.stringify(dump));
  }
  console.log('BTNS_PROBE_DONE');
}};
