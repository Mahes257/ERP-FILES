module.exports = {
  run: async ({ cdp, sleep, helpers }) => {
    const { evalJs, navigate, waitFor } = helpers;

    const token = await evalJs(`localStorage.getItem('authToken') || ''`);
    // Find one editable record per module that has a non-empty source (short code).
    const targets = await evalJs(`(async () => {
      const token = localStorage.getItem('authToken') || '';
      const ep = {
        pi: '/v1/proforma-invoices?page=0&size=50',
        inv: '/v1/invoices?page=0&size=50',
        pr: '/v1/payment-receipts?page=0&size=50',
        cn: '/v1/credit-notes?page=0&size=50'
      };
      const out = {};
      for (const [k, url] of Object.entries(ep)) {
        try {
          const res = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
          const j = await res.json();
          const arr = Array.isArray(j) ? j : Array.isArray(j.data) ? j.data : Array.isArray(j.content) ? j.content : [];
          const withSrc = arr.find((r) => r.source && r.source !== 'Direct' && r.source !== '');
          out[k] = withSrc ? { id: withSrc.id, source: withSrc.source, docNo: withSrc.piNo || withSrc.invoiceNo || withSrc.receiptNo || withSrc.cnNo } : null;
        } catch (e) { out[k] = { error: String(e) }; }
      }
      return out;
    })()`);
    console.log('TARGETS: ' + JSON.stringify(targets));

    const routes = {
      pi: '/proforma-invoices',
      inv: '/invoices',
      pr: '/payment-receipts',
      cn: '/credit-notes'
    };

    for (const [k, t] of Object.entries(targets)) {
      if (!t || !t.id) {
        console.log(`SKIP | ${k} no source-bearing record`);
        continue;
      }
      await navigate(`http://localhost:5173${routes[k]}/${t.id}/edit`);
      await waitFor(`document.body.innerText.length > 200`, 15000);
      await sleep(3000);
      // Dump all selects with their selected value + option list
      const sel = await evalJs(`(() => ({
        selects: [...document.querySelectorAll('select')].map((s) => ({
          value: s.value,
          text: s.options[s.selectedIndex] ? s.options[s.selectedIndex].textContent.trim() : '',
          opts: [...s.options].map((o) => o.textContent.trim())
        }))
      }))()`);
      console.log(`SELECTS_${k}: ` + JSON.stringify(sel));
    }
    console.log('SRC_PRESELECT_DONE');
  }
};
