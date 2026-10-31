/* Confirm the created invoice persisted with correct customer, items and totals,
 * by calling the API from within the authenticated browser session. */
module.exports = {
  run: async ({ cdp, sleep, helpers }) => {
    const { navigate, waitFor, evalJs } = helpers;
    await navigate('http://localhost:5173/invoices');
    await sleep(3000);
    const needsLogin = await evalJs(`!!document.querySelector('input[type=email]')`);
    if (needsLogin) {
      await evalJs(`(() => {
        const setVal = (el, v) => {
          const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
          Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
          el.dispatchEvent(new Event('input', { bubbles: true }));
        };
        setVal(document.querySelector('input[type=email]'), 'admin@vishaktech.com');
        setVal(document.querySelector('input[type=password]'), 'Admin@123');
        document.querySelector('button[type=submit]').click();
      })()`);
      await waitFor(`!location.href.includes('signin')`, 20000);
      await sleep(2500);
      await navigate('http://localhost:5173/invoices');
      await sleep(2500);
    }
    await waitFor(`document.querySelectorAll('tbody tr').length > 0`, 20000);
    await sleep(1000);

    const result = await evalJs(`(async () => {
      const token = localStorage.getItem('token') || localStorage.getItem('authToken') || '';
      const keys = Object.keys(localStorage).filter((k) => /token|auth|jwt/i.test(k));
      const headers = token ? { Authorization: 'Bearer ' + token } : {};
      const listRes = await fetch('/v1/invoices?page=0&size=10&sort=createdAt,desc', { headers });
      const listJson = await listRes.json();
      const rows = Array.isArray(listJson) ? listJson : listJson.data || listJson.content || [];
      const inv = rows.find((r) => String(r.invoiceNo) === 'INV-2026-000011');
      if (!inv) return { notFound: true, keys, listSample: rows.slice(0, 3).map((r) => r.invoiceNo) };
      const detailRes = await fetch('/v1/invoices/' + inv.id, { headers });
      const detail = await detailRes.json();
      const d = detail.data || detail;
      return {
        id: d.id,
        invoiceNo: d.invoiceNo,
        clientName: d.clientName,
        grandTotal: d.grandTotal,
        status: d.status,
        source: d.source,
        sourceRef: d.sourceRef,
        companyName: d.companyName,
        companyAddress: d.companyAddress,
        bankType: d.bankType,
        dueDate: d.dueDate,
        items: Array.isArray(d.items) ? d.items.map((it) => ({ product: it.productName || it.description, qty: it.qty, rate: it.rate, gstRate: it.gstRate, amount: it.amount })) : []
      };
    })()`);
    console.log(JSON.stringify(result, null, 2));
  }
};
