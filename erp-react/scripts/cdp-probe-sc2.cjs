module.exports = { run: async ({ cdp, sleep, helpers }) => {
  const { evalJs, navigate } = helpers;
  const norm = (t) => String(t).replace(/s/gi, '').replace(/[^a-z0-9 ]/gi, ' ').replace(/\s+/g, ' ').trim();

  await navigate('http://localhost:5173/sales-contracts/new');
  await sleep(4500);

  // client pick
  await evalJs(`(() => { const el = document.querySelector('input[aria-label="Client"]'); if (el) el.focus(); return !!el; })()`);
  await sleep(300);
  await cdp.send('Input.insertText', { text: 'SK ' });
  await sleep(2200);
  await evalJs(`(() => {
    const opts = Array.from(document.querySelectorAll('button')).filter((b) => b.textContent.includes('SK Logistics'));
    if (opts[0]) opts[0].dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    return opts.length;
  })()`);
  await sleep(800);

  // add line + fill
  await evalJs(`(() => {
    const btn = Array.from(document.querySelectorAll('button')).find((b) => norm(b.textContent) === ${JSON.stringify(norm('Add New Line'))});
    if (btn) btn.click();
    return !!btn;
  })()`);
  await sleep(1200);
  await evalJs(`(() => {
    const el = document.querySelector('input[placeholder="Item description"]');
    if (!el) return false;
    const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    s.call(el, 'AUDIT_ITEM_20260808');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    const trs = Array.from(document.querySelectorAll('tbody tr'));
    const row = trs[trs.length - 1];
    const ins = row.querySelectorAll('input');
    const set = (i, v) => { const s2 = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; s2.call(ins[i], v); ins[i].dispatchEvent(new Event('input', { bubbles: true })); ins[i].dispatchEvent(new Event('change', { bubbles: true })); };
    set(3, '2'); set(4, '500');
    return true;
  })()`);
  await sleep(800);

  // click primary and watch toast over 3s
  const stateBefore = await evalJs(`(() => {
    const client = document.querySelector('input[aria-label="Client"]');
    const rows = Array.from(document.querySelectorAll('tbody tr'));
    const lastRow = rows[rows.length - 1];
    return { clientVal: client ? client.value : null, rows: rows.length, desc: lastRow ? lastRow.querySelectorAll('input')[0].value : null, qty: lastRow ? lastRow.querySelectorAll('input')[3].value : null, rate: lastRow ? lastRow.querySelectorAll('input')[4].value : null };
  })()`);
  console.log('SC2_BEFORE: ' + JSON.stringify(stateBefore));

  await evalJs(`(() => {
    const btn = Array.from(document.querySelectorAll('button')).find((b) => b.className.includes('032f25') && !b.disabled);
    if (btn) btn.click();
    return !!btn;
  })()`);
  for (const delay of [1200, 2500, 4000]) {
    await sleep(delay === 1200 ? 1200 : delay - [0, 1200, 2500][[1200, 2500, 4000].indexOf(delay) - 1] || 1300);
    const st = await evalJs(`(() => {
      const toasts = Array.from(document.querySelectorAll('[class*="toast"]')).map((t) => t.textContent.trim());
      return { path: location.pathname, toasts };
    })()`);
    console.log('SC2_T' + delay + ': ' + JSON.stringify(st));
  }
  console.log('SC2_PROBE_DONE');
}};
