/* E2E: Sales Order create -> list -> view -> edit -> persist (backend integration audit) */
const http = require('http');
const BASE = 'http://localhost:8080';

function req(method, path, token, body) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const u = new URL(BASE + path);
    const options = {
      method, hostname: u.hostname, port: u.port, path: u.pathname + u.search,
      headers: { 'Content-Type': 'application/json' }, timeout: 10000
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
  console.log('LOGIN', login.status);

  // 1. Create a real Sales Order (no mock)
  const payload = {
    clientId: 1, clientName: 'Apex Industries', soDate: '2026-08-08', status: 'draft',
    paymentTerms: 'Net 30', currency: 'INR', exchangeRate: 1,
    items: [{ product: 'Test Product A', description: 'E2E audit item', qty: 2, rate: 500, discount: 10, tax: 18, amount: 900 }],
    subTotal: 1000, discountPct: 10, discountAmount: 100, taxAmount: 162, grandTotal: 1062,
    termsAndConditions: 'E2E terms', remarks: 'E2E audit remark'
  };
  const created = await req('POST', '/v1/sales-orders', token, payload);
  const so = created?.body?.data ?? created?.body;
  console.log('CREATE SO:', created.status, so?.soNo || so?.message || so?.error || 'no-no');

  if (created.status === 201 || created.status === 200) {
    const id = so.id;
    // 2. List reflects it
    const list = await req('GET', '/v1/sales-orders?page=0&size=5&search=E2E%20audit', token);
    const lrows = (list?.body?.data?.content ?? list?.body?.data ?? []).filter((r) => String(r.remarks || '').includes('E2E audit'));
    console.log('LIST-FOUND:', lrows.length, lrows.length ? lrows[0].soNo : '');
    // 3. View (GET by id) persists all fields
    const got = await req('GET', `/v1/sales-orders/${id}`, token);
    const g = got?.body?.data ?? got?.body;
    console.log('VIEW SO:', got.status, JSON.stringify({ no: g?.soNo, client: g?.clientName, status: g?.status, items: (g?.items || []).length, grandTotal: g?.grandTotal, remarks: g?.remarks }));
    // 4. Edit (PUT) persists
    const updated = await req('PUT', `/v1/sales-orders/${id}`, token, { ...payload, remarks: 'E2E audit remark UPDATED', status: 'approved' });
    console.log('UPDATE SO:', updated.status, (updated?.body?.data?.remarks ?? ''));
    const got2 = await req('GET', `/v1/sales-orders/${id}`, token);
    const g2 = got2?.body?.data ?? got2?.body;
    console.log('RE-GET AFTER UPDATE:', JSON.stringify({ remarks: g2?.remarks, status: g2?.status }));
    console.log('PERSISTENCE:', g2?.remarks === 'E2E audit remark UPDATED' ? 'PASS' : 'FAIL');
  } else {
    console.log('CREATE FAILED:', JSON.stringify(created.body).slice(0, 300));
  }
})();
