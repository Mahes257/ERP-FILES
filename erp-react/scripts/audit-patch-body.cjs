/* Does a PATCH archive with a JSON body 500? Frontend sends no body. */
const http = require('http');

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
  const lg = await call('POST', '/v1/auth/login', null, { email: 'admin@vishaktech.com', password: 'Admin@123' });
  const tok = lg.body?.data?.token || lg.body?.token;
  console.log('login', lg.status);

  // 1. No body (frontend behavior)
  const a1 = await call('PATCH', '/v1/payment-receipts/archive/2', tok);
  console.log('PATCH no-body:', a1.status, a1.status < 300 ? 'OK' : JSON.stringify(a1.body).slice(0, 200));
  const r1 = await call('PATCH', '/v1/payment-receipts/restore/2', tok);
  console.log('RESTORE no-body:', r1.status);

  // 2. With empty JSON body {} (my earlier probe artifact)
  const a2 = await call('PATCH', '/v1/payment-receipts/archive/2', tok, {});
  console.log('PATCH body {}:', a2.status, JSON.stringify(a2.body).slice(0, 220));
  const r2 = await call('PATCH', '/v1/payment-receipts/restore/2', tok);
  console.log('RESTORE after body test:', r2.status);
})();
