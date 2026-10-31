module.exports = {
  run: async ({ cdp, sleep, helpers }) => {
    const { evalJs, navigate, waitFor } = helpers;

    // Find a PI with source 'Direct' or empty
    const target = await evalJs(`(async () => {
      const token = localStorage.getItem('authToken') || '';
      const res = await fetch('/v1/proforma-invoices?page=0&size=50', { headers: { Authorization: 'Bearer ' + token } });
      const j = await res.json();
      const arr = Array.isArray(j) ? j : Array.isArray(j.data) ? j.data : Array.isArray(j.content) ? j.content : [];
      const rec = arr.find((r) => !r.source || r.source === 'Direct' || r.source === '');
      return rec ? { id: rec.id, source: rec.source, piNo: rec.piNo } : null;
    })()`);
    console.log('DIRECT_TARGET: ' + JSON.stringify(target));
    if (!target || !target.id) {
      console.log('DIRECT_DONE (no Direct PI)');
      return;
    }

    await navigate(`http://localhost:5173/proforma-invoices/${target.id}/edit`);
    await waitFor(`document.body.innerText.length > 200`, 15000);
    await sleep(3000);

    const sel = await evalJs(`(() => {
      const src = [...document.querySelectorAll('select')].find((s) => [...s.options].some((o) => o.textContent.trim() === 'From Sales Order'));
      return src ? { value: src.value, text: src.options[src.selectedIndex]?.textContent.trim() } : { error: 'source select not found' };
    })()`);
    console.log('DIRECT_SELECT: ' + JSON.stringify(sel));
    console.log('DIRECT_DONE');
  }
};
