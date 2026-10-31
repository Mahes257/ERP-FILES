/* Capture the exact login 500 error body from node */
const http = require('http');

const data = JSON.stringify({ email: 'admin@vishaktech.com', password: 'Admin@123' });
const u = new URL('http://localhost:8080/v1/auth/login');
const o = {
  method: 'POST', hostname: u.hostname, port: u.port, path: u.pathname,
  headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
  timeout: 10000
};
const h = http.request(o, (res) => {
  let s = '';
  res.on('data', (c) => (s += c));
  res.on('end', () => {
    console.log('STATUS', res.statusCode);
    console.log('BODY', s.slice(0, 600));
    console.log('HEADERS', JSON.stringify(res.headers));
  });
});
h.on('error', (e) => console.log('ERROR', e.message));
h.write(data);
h.end();
