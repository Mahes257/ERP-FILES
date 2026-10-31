module.exports = { run: async ({ cdp, sleep, helpers }) => {
  const { evalJs, navigate } = helpers;
  await navigate('http://localhost:5173/sales-contracts/new');
  await sleep(4500);
  const dump = await evalJs(`(() => {
    const footer = document.querySelector('.sticky') || document.body;
    const btns = Array.from(footer.querySelectorAll('button'));
    const primary = btns[btns.length - 1];
    return {
      footerBtns: btns.map((b) => b.textContent.replace(/\s+/g, ' ').trim()),
      lastBtnHTML: primary ? primary.outerHTML.slice(0, 400) : null
    };
  })()`);
  console.log('SC_DUMP: ' + JSON.stringify(dump));
  // click Add New Line and inspect the row inputs
  const clicked = await evalJs(`(() => {
    const btn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent.replace(/\s+/g, ' ').includes('Add New Line'));
    if (!btn) return false;
    btn.click();
    return true;
  })()`);
  console.log('SC_ADD_LINE: ' + clicked);
  await sleep(1500);
  const rows = await evalJs(`(() => {
    const tables = Array.from(document.querySelectorAll('table'));
    const last = tables[tables.length - 1];
    if (!last) return null;
    const trs = Array.from(last.querySelectorAll('tbody tr'));
    const lastTr = trs[trs.length - 1];
    if (!lastTr) return null;
    return { tables: tables.length, rows: trs.length, inputs: Array.from(lastTr.querySelectorAll('input, select, textarea')).map((i) => ({ tag: i.tagName, ph: i.placeholder, aria: i.getAttribute('aria-label'), type: i.type, val: (i.value || '').slice(0, 30) })) };
  })()`);
  console.log('SC_ROW: ' + JSON.stringify(rows));
  console.log('SC_PROBE_DONE');
}};
