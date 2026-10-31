module.exports = {
  run: async ({ cdp, sleep, helpers }) => {
    const { evalJs, navigate, waitFor } = helpers;

    await navigate('http://localhost:5173/invoices');
    await waitFor(`document.body.innerText.length > 100`, 15000);
    await sleep(3000);

    const result = await evalJs(`(async () => {
      const token = localStorage.getItem('authToken') || '';
      const out = {};
      const endpoints = {
        pi: '/v1/proforma-invoices?page=0&size=200',
        inv: '/v1/invoices?page=0&size=200',
        pr: '/v1/payment-receipts?page=0&size=200',
        cn: '/v1/credit-notes?page=0&size=200'
      };
      for (const [k, url] of Object.entries(endpoints)) {
        try {
          const res = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
          const j = await res.json();
          const arr = Array.isArray(j) ? j : Array.isArray(j.data) ? j.data : Array.isArray(j.content) ? j.content : [];
          const sources = {};
          arr.forEach((r) => { const s = r.source || '(empty)'; sources[s] = (sources[s] || 0) + 1; });
          out[k] = { total: arr.length, sources };
        } catch (e) { out[k] = { error: String(e) }; }
      }
      return out;
    })()`);
    console.log('SRC_DIST: ' + JSON.stringify(result));
    console.log('SRC_DONE');
  }
};
