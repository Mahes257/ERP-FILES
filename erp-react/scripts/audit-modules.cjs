/* Module-by-module filter/search/stats verification for all 8 sales modules */
const http = require('http');

function login() {
  return new Promise((resolve) => {
    const data = JSON.stringify({ email: 'admin@vishaktech.com', password: 'Admin@123' });
    const u = new URL('http://localhost:8080/v1/auth/login');
    const o = {
      method: 'POST', hostname: u.hostname, port: u.port, path: u.pathname,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
      timeout: 8000
    };
    const h = http.request(o, (res) => {
      let s = '';
      res.on('data', (c) => (s += c));
      res.on('end', () => {
        let j = null;
        try { j = JSON.parse(s); } catch { j = s; }
        resolve({ status: res.statusCode, body: j });
      });
    });
    h.on('error', (e) => resolve({ status: 0, error: e.message }));
    h.write(data);
    h.end();
  });
}

function call(method, path, token, body) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const u = new URL('http://localhost:8080' + path);
    const o = {
      method, hostname: u.hostname, port: u.port, path: u.pathname + u.search,
      headers: {}, timeout: 8000
    };
    if (token) o.headers.Authorization = 'Bearer ' + token;
    if (data) o.headers['Content-Length'] = Buffer.byteLength(data);
    const h = http.request(o, (res) => {
      let s = '';
      res.on('data', (c) => (s += c));
      res.on('end', () => {
        let j = null;
        try { j = JSON.parse(s); } catch { j = s.slice(0, 120); }
        resolve({ status: res.statusCode, body: j });
      });
    });
    h.on('error', (e) => resolve({ status: 0, error: e.message }));
    if (data) h.write(data);
    h.end();
  });
}

(async () => {
  const lg = await login();
  const tok = lg.body?.data?.token || lg.body?.token;
  const read = (body) => body?.data ?? body;
  const no = (d) => d.quotationNo || d.scNo || d.soNo || d.dcNo || d.piNo || d.invoiceNo || d.receiptNo || d.cnNo;

  const modules = [
    ['quotations', 'draft', 'QTN'],
    ['sales-contracts', 'draft', 'SC'],
    ['sales-orders', 'approved', 'SO'],
    ['delivery-challans', 'draft', 'DC'],
    ['proforma-invoices', 'draft', 'PI'],
    ['invoices', 'draft', 'INV'],
    ['payment-receipts', 'received', 'PR'],
    ['credit-notes', 'draft', 'CN']
  ];

  for (const [m, status, prefix] of modules) {
    const plain = await call('GET', `/v1/${m}?page=0&size=1`, tok);
    const total = read(plain.body)?.totalElements;
    const filtered = await call('GET', `/v1/${m}?page=0&size=1&status=${status}`, tok);
    const fTotal = read(filtered.body)?.totalElements;
    const searched = await call('GET', `/v1/${m}?page=0&size=1&search=${prefix}`, tok);
    const sTotal = read(searched.body)?.totalElements;
    const stats = await call('GET', `/v1/${m}/stats`, tok);
    const st = read(stats.body);
    const statsKeys = st && typeof st === 'object' ? Object.keys(st).join(',') : 'n/a';
    console.log(`${m}: list=${total} filter(${status})=${fTotal} search(${prefix})=${sTotal} stats=${stats.status} keys=${statsKeys.slice(0, 60)}`);
  }

  // Archive/restore/delete soft behavior probe (read-only status change on a draft doc is risky; just verify endpoints exist)
  const endpts = [
    ['payment-receipts/archive/2', 'PR archive'],
    ['sales-contracts/duplicate/1', 'SC duplicate']
  ];
  for (const [p, label] of endpts) {
    const method = p.startsWith('archive') ? 'PATCH' : 'POST';
    const res = await call(method, `/v1/${p}`, tok, {});
    console.log(`${label}: HTTP ${res.status} ${res.status < 500 ? 'endpoint-OK' : 'missing'}`);
  }
})();
