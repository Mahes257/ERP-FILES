/* Verify lead archive/restore/inactive via correct PATCH endpoints. */
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
  const j = res.json?.data || res.json;
  if (!j || typeof j !== 'object') return {};
  const out = {};
  keys.forEach((k) => { if (j[k] !== undefined) out[k] = j[k]; });
  return out;
}

async function main() {
  const login = await req('POST', '/auth/login', null, { email: 'admin@vishaktech.com', password: 'Admin@123' });
  const token = login.json?.data?.token || login.json?.token;
  if (!token) { console.log('LOGIN FAILED'); return; }

  const lead = await req('POST', '/leads', token, {
    leadName: 'FINAL_AUDIT_ARCHIVE_20260808', businessName: 'FINAL_AUDIT_ARCHIVE_20260808',
    phone: '+91-9000033333', pipelineStage: 'NEW'
  });
  const id = lead.json?.data?.id;
  console.log('create:', lead.status, 'id:', id);

  const arch = await req('PATCH', `/leads/archive/${id}`, token);
  console.log('archive:', arch.status, JSON.stringify(pick(arch, ['id', 'status', 'archivedAt'])).slice(0, 100));

  // archived leads should be excluded from /clients and /leads scope lists
  const archList = await req('GET', '/leads?page=0&size=50', token);
  const inList = archList.json?.content?.some((r) => r.id === id);
  console.log('in active leads list after archive:', inList);

  const restore = await req('PATCH', `/leads/restore/${id}`, token);
  console.log('restore:', restore.status, JSON.stringify(pick(restore, ['id', 'status', 'archivedAt'])).slice(0, 100));

  const inact = await req('PATCH', `/leads/inactive/${id}`, token);
  console.log('mark-inactive:', inact.status, JSON.stringify(pick(inact, ['id', 'status'])).slice(0, 100));

  // cleanup test record
  const del = await req('DELETE', `/leads/${id}`, token);
  console.log('cleanup delete:', del.status);
  const after = await req('GET', `/leads/${id}`, token);
  console.log('get-after-delete:', after.status, after.status === 404 ? 'GONE (ok)' : '');
}

main().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
