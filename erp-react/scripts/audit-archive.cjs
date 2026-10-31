/* Probe archive/restore/duplicate with correct paths + full error bodies */
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
        try { j = JSON.parse(s); } catch { j = s.slice(0, 200); }
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
  console.log('login', lg.status);

  // PR archive on a real receipt id (2) - capture full error
  const a = await call('PATCH', '/v1/payment-receipts/archive/2', tok);
  console.log('PR archive/2:', a.status, JSON.stringify(a.body).slice(0, 300));

  // PR restore back
  const r = await call('PATCH', '/v1/payment-receipts/restore/2', tok);
  console.log('PR restore/2:', r.status, JSON.stringify(r.body).slice(0, 300));

  // SC duplicate with correct path /1/duplicate
  const d = await call('POST', '/v1/sales-contracts/1/duplicate', tok);
  console.log('SC duplicate/1:', d.status, JSON.stringify(d.body).slice(0, 200));

  // PR duplicate correct path
  const pd = await call('POST', '/v1/payment-receipts/3/duplicate', tok);
  console.log('PR duplicate/3:', pd.status, JSON.stringify(pd.body).slice(0, 200));
})();
