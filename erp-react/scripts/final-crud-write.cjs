/* Write-path CRUD verification: create -> get -> update -> archive/delete -> verify,
 * using traceable FINAL_AUDIT_* test records that are then removed. */
const http = require('http');
const BASE = 'http://localhost:8080/v1';

function req(method, path, token, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const r = http.request(BASE + path, { method, headers, timeout: 10000 }, (res) => {
      let s = '';
      res.on('data', (d) => (s += d));
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(s); } catch (e) { /* noop */ }
        resolve({ status: res.statusCode, json, raw: s.slice(0, 200) });
      });
    });
    r.on('error', (e) => reject(e));
    r.on('timeout', () => { r.destroy(); reject(new Error('timeout')); });
    if (data) r.write(data);
    r.end();
  });
}

function pick(res, keys) {
  const j = res.json;
  const root = j?.data || j;
  if (!root || typeof root !== 'object') return {};
  const out = {};
  keys.forEach((k) => { if (root[k] !== undefined) out[k] = root[k]; });
  return out;
}

async function main() {
  const login = await req('POST', '/auth/login', null, { email: 'admin@vishaktech.com', password: 'Admin@123' });
  const token = login.json?.data?.token || login.json?.token;
  if (!token) { console.log('LOGIN FAILED'); return; }
  console.log('=== CUSTOMER (customers table) ===');
  const cust = await req('POST', '/customers', token, {
    businessName: 'FINAL_AUDIT_CUSTOMER_20260808', contactPerson: 'Audit Tester',
    email: 'finalaudit@example.com', phone: '+91-9000011111', status: 'Active'
  });
  console.log('create:', cust.status, JSON.stringify(pick(cust, ['id', 'businessName', 'clientCode', 'status'])));
  const custId = cust.json?.data?.id;
  if (custId) {
    const g = await req('GET', `/customers/${custId}`, token);
    console.log('get:', g.status, JSON.stringify(pick(g, ['id', 'businessName'])));
    const u = await req('PUT', `/customers/${custId}`, token, { businessName: 'FINAL_AUDIT_CUSTOMER_20260808_UPDATED', contactPerson: 'Audit Tester', status: 'Active' });
    console.log('update:', u.status, JSON.stringify(pick(u, ['id', 'businessName'])));
    const d = await req('DELETE', `/customers/${custId}`, token);
    console.log('delete:', d.status);
    const g2 = await req('GET', `/customers/${custId}`, token);
    console.log('get-after-delete:', g2.status, g2.status === 404 ? 'GONE (ok)' : JSON.stringify(pick(g2, ['id'])).slice(0, 60));
  }

  console.log('=== LEAD (leads table, WON = client scope) ===');
  const lead = await req('POST', '/leads', token, {
    leadName: 'FINAL_AUDIT_LEAD_20260808', businessName: 'FINAL_AUDIT_LEAD_20260808',
    phone: '+91-9000022222', email: 'finalauditlead@example.com', pipelineStage: 'WON', leadSource: 'Website'
  });
  console.log('create:', lead.status, JSON.stringify(pick(lead, ['id', 'name', 'stage', 'status'])));
  const leadId = lead.json?.data?.id || lead.json?.id;
  if (leadId) {
    const u = await req('PUT', `/leads/${leadId}`, token, {
      leadName: 'FINAL_AUDIT_LEAD_20260808_UPDATED', businessName: 'FINAL_AUDIT_LEAD_20260808_UPDATED', pipelineStage: 'WON'
    });
    console.log('update:', u.status, JSON.stringify(pick(u, ['id', 'name'])));
    const arch = await req('POST', `/leads/${leadId}/archive`, token);
    console.log('archive:', arch.status);
    const d = await req('DELETE', `/leads/${leadId}`, token);
    console.log('delete:', d.status);
    const g2 = await req('GET', `/leads/${leadId}`, token);
    console.log('get-after-delete:', g2.status, g2.status === 404 ? 'GONE (ok)' : '');
  }

  console.log('=== QUOTATION (list + get first record) ===');
  const ql = await req('GET', '/quotations?page=0&size=3', token);
  const qFirst = ql.json?.content?.[0] || ql.json?.data?.[0];
  if (qFirst?.id) {
    const qg = await req('GET', `/quotations/${qFirst.id}`, token);
    console.log('list ok, first id', qFirst.id, '| get:', qg.status, JSON.stringify(pick(qg, ['id', 'quotationNo'])).slice(0, 80));
  } else {
    console.log('no quotation rows to get-test');
  }

  console.log('=== INVOICE (list + get first record) ===');
  const il = await req('GET', '/invoices?page=0&size=3', token);
  const iFirst = il.json?.content?.[0] || il.json?.data?.[0];
  if (iFirst?.id) {
    const ig = await req('GET', `/invoices/${iFirst.id}`, token);
    console.log('list ok, first id', iFirst.id, '| get:', ig.status, JSON.stringify(pick(ig, ['id', 'invoiceNo'])).slice(0, 80));
  } else {
    console.log('no invoice rows to get-test');
  }
}

main().catch((e) => { console.error('WRITE AUDIT ERROR:', e.message); process.exit(1); });
