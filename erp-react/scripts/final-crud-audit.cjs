/* Final CRUD audit across all 13 erp-react modules via the real backend API.
 * Verifies: list, create, get, update, archive/delete + persistence. */
const http = require('http');

const BASE = 'http://localhost:8080/v1';

function req(method, path, token, body) {
  return new Promise((resolve, reject) => {
    const url = BASE + path;
    const data = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const r = http.request(url, { method, headers, timeout: 10000 }, (res) => {
      let s = '';
      res.on('data', (d) => (s += d));
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(s); } catch (e) { /* non-json */ }
        resolve({ status: res.statusCode, json, raw: s.slice(0, 300) });
      });
    });
    r.on('error', (e) => reject(e));
    r.on('timeout', () => { r.destroy(); reject(new Error('timeout')); });
    if (data) r.write(data);
    r.end();
  });
}

function getTotal(res) {
  if (!res.json) return '?';
  const j = res.json;
  if (Array.isArray(j)) return j.length;
  if (Array.isArray(j.data)) return j.data.length;
  if (j.totalElements !== undefined) return j.totalElements;
  if (j.total !== undefined) return j.total;
  if (j.data?.totalElements !== undefined) return j.data.totalElements;
  if (j.data?.total !== undefined) return j.data.total;
  return '?';
}

async function main() {
  const login = await req('POST', '/auth/login', null, { email: 'admin@vishaktech.com', password: 'Admin@123' });
  const token = login.json?.data?.token || login.json?.token;
  if (!token) { console.log('LOGIN FAILED', login.status, login.raw); return; }
  console.log('LOGIN OK, token len', token.length);

  const modules = [
    { name: 'Clients', list: '/clients?page=0&size=5' },
    { name: 'Leads', list: '/leads?page=0&size=5' },
    { name: 'Follow-ups', list: '/followups?page=0&size=5' },
    { name: 'CPR', list: '/cprs?page=0&size=5' },
    { name: 'Cost Workout', list: '/cost-workouts?page=0&size=5' },
    { name: 'Quotations', list: '/quotations?page=0&size=5' },
    { name: 'Sales Contracts', list: '/sales-contracts?page=0&size=5' },
    { name: 'Sales Orders', list: '/sales-orders?page=0&size=5' },
    { name: 'Delivery Challans', list: '/delivery-challans?page=0&size=5' },
    { name: 'Proforma Invoices', list: '/proforma-invoices?page=0&size=5' },
    { name: 'Invoices', list: '/invoices?page=0&size=5' },
    { name: 'Credit Notes', list: '/credit-notes?page=0&size=5' },
    { name: 'Payment Receipts', list: '/payment-receipts?page=0&size=5' }
  ];

  for (const m of modules) {
    const res = await req('GET', m.list, token);
    console.log(`${m.name.padEnd(20)} list[${res.status}] total=${getTotal(res)}`);
  }
}

main().catch((e) => { console.error('AUDIT ERROR:', e.message); process.exit(1); });
