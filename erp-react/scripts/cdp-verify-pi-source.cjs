module.exports = {
  run: async ({ cdp, sleep, helpers }) => {
    const { evalJs, navigate, waitFor } = helpers;

    await navigate('http://localhost:5173/proforma-invoices');
    await waitFor(`document.body.innerText.length > 100`, 15000);
    await sleep(3000);

    const api = await evalJs(`(async () => {
      try {
        const token = localStorage.getItem('authToken') || '';
        const res = await fetch('/v1/proforma-invoices/2026', {
          headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }
        });
        const j = await res.json();
        const r = j.data || j || {};
        return {
          status: res.status,
          id: r.id,
          piNo: r.piNo,
          source: r.source,
          status2: r.status,
          refNo: r.referenceNo,
          keys: Object.keys(r).slice(0, 30)
        };
      } catch (e) { return { error: String(e) }; }
    })()`);
    console.log('PI_API: ' + JSON.stringify(api));

    // Also list which PIs have a non-empty source
    const list = await evalJs(`(async () => {
      try {
        const token = localStorage.getItem('authToken') || '';
        const res = await fetch('/v1/proforma-invoices?page=0&size=5', {
          headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }
        });
        const j = await res.json();
        const arr = Array.isArray(j) ? j : Array.isArray(j.data) ? j.data : Array.isArray(j.content) ? j.content : [];
        return arr.slice(0, 5).map((r) => ({ id: r.id, piNo: r.piNo, source: r.source, status: r.status }));
      } catch (e) { return { error: String(e) }; }
    })()`);
    console.log('PI_LIST: ' + JSON.stringify(list));
    console.log('PI_SOURCE_DONE');
  }
};
