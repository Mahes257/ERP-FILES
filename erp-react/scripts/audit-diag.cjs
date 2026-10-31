/* Diagnose SO list/search/filter response shapes precisely */
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

function call(method, path, token) {
  return new Promise((resolve) => {
    const u = new URL('http://localhost:8080' + path);
    const o = {
      method, hostname: u.hostname, port: u.port, path: u.pathname + u.search,
      headers: {}, timeout: 8000
    };
    if (token) o.headers.Authorization = 'Bearer ' + token;
    const h = http.request(o, (res) => {
      let s = '';
      res.on('data', (c) => (s += c));
      res.on('end', () => {
        let j = null;
        try { j = JSON.parse(s); } catch { j = s.slice(0, 150); }
        resolve({ status: res.statusCode, body: j });
      });
    });
    h.on('error', (e) => resolve({ status: 0, error: e.message }));
    h.end();
  });
}

(async () => {
  const lg = await login();
  const tok = lg.body?.data?.token || lg.body?.token;
  console.log('login', lg.status);

  const read = (body) => body?.data ?? body;

  const plain = await call('GET', '/v1/sales-orders?page=0&size=3', tok);
  console.log('PLAIN status', plain.status, 'total=', read(plain.body)?.totalElements, 'rows=', (read(plain.body)?.content || []).length);

  const f = await call('GET', '/v1/sales-orders?page=0&size=3&status=approved', tok);
  console.log('FILTER status=approved total=', read(f.body)?.totalElements, 'rows=', (read(f.body)?.content || []).length,
    'sample=', (read(f.body)?.content || []).slice(0, 3).map((x) => x.soNo + '/' + x.status).join(', '));

  const se = await call('GET', '/v1/sales-orders?page=0&size=3&search=SO-2026-000029', tok);
  console.log('SEARCH SO-2026-000029 total=', read(se.body)?.totalElements, 'rows=', (read(se.body)?.content || []).length,
    'sample=', (read(se.body)?.content || []).map((x) => x.soNo + '/' + x.status).join(', '));

  const st = await call('GET', '/v1/sales-orders/stats', tok);
  console.log('STATS:', JSON.stringify(read(st.body)).slice(0, 300));
})();
