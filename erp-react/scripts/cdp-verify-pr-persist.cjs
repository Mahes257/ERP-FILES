/* Confirm the Payment Receipt created in the previous round-trip persisted
   through the real API, then open its edit page and verify the status dropdown
   pre-selects the saved value ('Received'). */
module.exports = {
  run: async ({ cdp, sleep, helpers }) => {
    const { evalJs, navigate, waitFor } = helpers;

    await navigate('http://localhost:5173/payment-receipts');
    await waitFor(`document.body.innerText.length > 100`, 15000);
    await sleep(3000);

    // Query the API directly from the page (token already in axios interceptors/localStorage)
    const found = await evalJs(`(async () => {
      try {
        const token = localStorage.getItem('token') || localStorage.getItem('vishak_token') || '';
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers.Authorization = 'Bearer ' + token;
        const res = await fetch('/api/payment-receipts?page=0&size=10', { headers });
        if (res.status === 404) {
          const res2 = await fetch('/v1/payment-receipts?page=0&size=10', { headers });
          const j2 = await res2.json();
          return { base: res.status, data: j2 };
        }
        const j = await res.json();
        return { base: res.status, data: j };
      } catch (e) {
        return { error: String(e) };
      }
    })()`);

    let rows = [];
    if (found?.data?.content) rows = found.data.content;
    else if (Array.isArray(found?.data)) rows = found.data;
    else if (found?.data?.data?.content) rows = found.data.data.content;
    else if (Array.isArray(found?.data?.data)) rows = found.data.data;

    const hit = rows.find((r) => String(r.amount || r.grandTotal || '').includes('4321') || String(r.receiptNo || '').includes('0000'));
    console.log('API_ROWS: ' + rows.length + ' first=' + JSON.stringify(rows.slice(0, 2).map((r) => ({ no: r.receiptNo, amount: r.amount, status: r.status, client: r.clientName }))));
    console.log('API_HIT: ' + JSON.stringify(hit ? { id: hit.id, no: hit.receiptNo, amount: hit.amount, status: hit.status } : null));

    if (hit?.id) {
      await navigate('http://localhost:5173/payment-receipts/' + hit.id + '/edit');
      await sleep(2800);
      const st = await evalJs(`(() => {
        const sel = [...document.querySelectorAll('select')].find((s) => [...s.options].some((o) => o.value === 'Received'));
        return { statusValue: sel ? sel.value : null, client: (document.querySelector('input[autocomplete="off"]')?.value || '').slice(0, 40) };
      })()`);
      console.log('REOPEN_STATUS: ' + JSON.stringify(st));
    }
    console.log('PERSIST_VERIFY_DONE');
  }
};
