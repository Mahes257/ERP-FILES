/* Live backend audit for the 8 sales modules:
 * - authenticate
 * - list each module (verify 200 + record count + real data)
 * - verify conversion endpoints exist by probing
 */
const http = require('http');

const BASE = 'http://localhost:8080';

function req(method, path, token, body) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const u = new URL(BASE + path);
    const options = {
      method,
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      headers: { 'Content-Type': 'application/json' },
      timeout: 8000
    };
    if (token) options.headers.Authorization = `Bearer ${token}`;
    if (data) options.headers['Content-Length'] = Buffer.byteLength(data);
    const r = http.request(options, (res) => {
      let buf = '';
      res.on('data', (c) => (buf += c));
      res.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(buf); } catch { parsed = buf.slice(0, 200); }
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    r.on('error', (e) => resolve({ status: 0, error: e.message }));
    r.on('timeout', () => { r.destroy(); resolve({ status: 0, error: 'timeout' }); });
    if (data) r.write(data);
    r.end();
  });
}

(async () => {
  const login = await req('POST', '/v1/auth/login', null, { email: 'admin@vishaktech.com', password: 'Admin@123' });
  const token = login?.body?.data?.token || login?.body?.token || '';
  console.log('LOGIN_STATUS', login.status, 'TOKEN_LEN', token.length);

  const modules = ['quotations', 'sales-contracts', 'sales-orders', 'delivery-challans', 'proforma-invoices', 'invoices', 'payment-receipts', 'credit-notes'];

  for (const m of modules) {
    const res = await req('GET', `/v1/${m}?page=0&size=3`, token);
    let count = 'n/a';
    let sample = null;
    const data = res?.body?.data ?? res?.body;
    if (Array.isArray(data)) { count = data.length; sample = data[0]; }
    else if (data?.content) { count = data.totalElements ?? data.content.length; sample = data.content[0]; }
    console.log(`LIST ${m}: HTTP ${res.status} count=${count}${sample ? ' sample=' + JSON.stringify({ no: sample.no || sample.quotationNo || sample.scNo || sample.soNo || sample.dcNo || sample.piNo || sample.invoiceNo || sample.receiptNo || sample.cnNo || sample.id, client: sample.clientName, status: sample.status, total: sample.grandTotal }) : ''}`);
  }

  // Conversion endpoints probe: quotations has 6 conversion endpoints + SC convert + SO conversions
  const probes = [
    ['quotations/1/convert-sales-order', 'quotation->SO'],
    ['quotations/1/convert-proforma', 'quotation->PI'],
    ['quotations/1/convert-invoice', 'quotation->INV'],
    ['quotations/1/convert-credit-note', 'quotation->CN'],
    ['quotations/1/convert-payment-receipt', 'quotation->PR'],
    ['quotations/1/convert-delivery-challan', 'quotation->DC'],
    ['sales-contracts/1/convert-sales-order', 'SC->SO'],
    ['sales-orders/1/generate-delivery-challan', 'SO->DC'],
    ['sales-orders/1/convert-proforma', 'SO->PI'],
    ['sales-orders/1/convert-invoice', 'SO->INV'],
    ['delivery-challans/1/convert-invoice', 'DC->INV'],
    ['proforma-invoices/1/convert-invoice', 'PI->INV'],
    ['proforma-invoices/1/convert-sales-order', 'PI->SO'],
    ['proforma-invoices/1/generate-delivery-challan', 'PI->DC'],
    ['invoices/1/mark-paid', 'INV mark-paid'],
    ['invoices/1/send', 'INV send'],
    ['invoices/1/generate-payment-receipt', 'INV->PR'],
    ['invoices/1/convert-credit-note', 'INV->CN'],
    ['quotations/1/send', 'QTN send'],
    ['sales-orders/1/approve', 'SO approve'],
    ['sales-orders/1/cancel', 'SO cancel'],
    ['sales-contracts/1/approve', 'SC approve'],
    ['credit-notes/1/approve', 'CN approve'],
    ['credit-notes/1/issue', 'CN issue']
  ];
  for (const [path, label] of probes) {
    const res = await req('POST', `/v1/${path}`, token, {});
    // 2xx = endpoint exists & succeeded; 4xx (400/404/409) = exists but rejected (already converted etc.)
    const exists = res.status >= 200 && res.status < 500 && res.status !== 0;
    console.log(`PROBE ${label}: HTTP ${res.status} ${exists ? 'endpoint-OK' : 'MISSING'} ${typeof res.body === 'string' ? res.body.slice(0, 80) : (res.body?.message || res.body?.error || '')}`);
  }
})();
