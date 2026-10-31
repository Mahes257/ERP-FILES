const RECORDS = [
  ['leads', 14], ['leads', 15], ['leads', 16],
  ['cprs', 130], ['cost-workouts', 14], ['quotations', 117],
  ['sales-contracts', 11], ['sales-orders', 30], ['delivery-challans', 17],
  ['proforma-invoices', 20], ['invoices', 15], ['payment-receipts', 10], ['credit-notes', 11]
];
module.exports = { run: async ({ cdp, sleep, helpers }) => {
  const { evalJs } = helpers;
  for (const [mod, id] of RECORDS) {
    const r = await evalJs(`(async () => {
      const token = localStorage.getItem('authToken') || '';
      const res = await fetch('/v1/${mod}/${id}', { headers: { Authorization: 'Bearer ' + token } });
      let b = null;
      try { b = await res.json(); } catch (e) {}
      const d = b && b.data ? b.data : b;
      return { status: res.status, id: d && d.id, no: d && (d.prNo || d.cwNo || d.quotationNo || d.scNo || d.soNo || d.dcNo || d.piNo || d.invoiceNo || d.receiptNo || d.cnNo || d.name || ''), client: d && (d.clientName || d.customerName || d.businessName || '') };
    })()`);
    console.log('REFETCH ' + mod + '/' + id + ': ' + JSON.stringify(r));
  }
  console.log('REFETCH_DONE');
}};
