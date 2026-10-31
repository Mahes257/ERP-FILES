/* Final audit verification:
 * - check quotation 1 conversion flags (did probes convert it?)
 * - list all 8 modules and check for duplicate document numbers
 * - verify counts + that created docs persist via GET-by-id
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
      timeout: 10000
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

  // 1. Quotation 1 conversion flags
  const q = await req('GET', '/v1/quotations/1', token);
  const qd = q?.body?.data ?? q?.body;
  console.log('QUOTATION_1:', JSON.stringify({
    id: qd?.id, no: qd?.quotationNo, status: qd?.status,
    convertedToSo: qd?.convertedToSo, convertedToPi: qd?.convertedToPi,
    convertedToInvoice: qd?.convertedToInvoice, convertedToCn: qd?.convertedToCn,
    convertedToPr: qd?.convertedToPr, convertedToSc: qd?.convertedToSc
  }));

  // 2. List all 8 modules: count + duplicate-number check + number-format check
  const modules = [
    ['quotations', (d) => d.quotationNo],
    ['sales-contracts', (d) => d.scNo],
    ['sales-orders', (d) => d.soNo],
    ['delivery-challans', (d) => d.dcNo],
    ['proforma-invoices', (d) => d.piNo],
    ['invoices', (d) => d.invoiceNo],
    ['payment-receipts', (d) => d.receiptNo],
    ['credit-notes', (d) => d.cnNo]
  ];
  for (const [m, numFn] of modules) {
    const res = await req('GET', `/v1/${m}?page=0&size=200`, token);
    const data = res?.body?.data ?? res?.body;
    const rows = Array.isArray(data) ? data : (data?.content || []);
    const nums = rows.map(numFn).filter(Boolean);
    const dupes = nums.filter((n, i) => nums.indexOf(n) !== i);
    const withNo = nums.length;
    console.log(`MODULE ${m}: HTTP ${res.status} rows=${rows.length} total=${data?.totalElements ?? '?'} numbered=${withNo} duplicates=${dupes.length > 0 ? JSON.stringify([...new Set(dupes)].slice(0, 3)) : 'NONE'}`);
  }

  // 3. Persistence check: GET a few docs by id (created by earlier probes / seed)
  for (const [m, id] of [['sales-orders', 1], ['delivery-challans', 1], ['proforma-invoices', 1], ['invoices', 1], ['credit-notes', 1], ['payment-receipts', 1], ['sales-contracts', 1]]) {
    const res = await req('GET', `/v1/${m}/${id}`, token);
    const d = res?.body?.data ?? res?.body;
    console.log(`GET ${m}/${id}: HTTP ${res.status} exists=${!!(d && (d.id !== undefined))} ${d ? ('no=' + (d.no || d.quotationNo || d.scNo || d.soNo || d.dcNo || d.piNo || d.invoiceNo || d.receiptNo || d.cnNo || '?')) : ''}`);
  }
})();
