/**
 * ERP staging load test — 10 / 25 / 50 / 75 / 100 concurrent users.
 *
 * SAFETY: run this ONLY against an isolated staging environment with staging
 * data. It performs real writes (CPR drafts, and optionally attachments) when
 * ENABLE_WRITES=true. Never point it at production.
 *
 * The read mix mirrors how the ERP is actually used across Sales, Purchase,
 * Production, CRM and CPR, plus the CPR reports endpoint that used to load the
 * full Cost Workout object graph and the notification inbox that used to be
 * unpaged.
 *
 * Usage (one run per concurrency level; see loadtest/README.md):
 *   k6 run -e BASE_URL=https://staging.example.com \
 *          -e ERP_EMAIL=loadtest@example.com -e ERP_PASSWORD='...' \
 *          -e VUS=50 -e DURATION=5m erp-mixed.js
 *
 * The token is obtained once in setup() and shared by every VU. The app is
 * stateless (JWT), so this measures the backend, not login throughput; run the
 * separate login smoke with ENABLE_LOGIN_SCENARIO=true if login matters.
 */
import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';
import encoding from 'k6/encoding';

const BASE_URL = (__ENV.BASE_URL || '').replace(/\/$/, '');
const EMAIL = __ENV.ERP_EMAIL || '';
const PASSWORD = __ENV.ERP_PASSWORD || '';
const VUS = Number(__ENV.VUS || 10);
const DURATION = __ENV.DURATION || '5m';
const ENABLE_WRITES = String(__ENV.ENABLE_WRITES || 'true') === 'true';
const ENABLE_UPLOAD = String(__ENV.ENABLE_UPLOAD || 'false') === 'true';
// A CPR that belongs to the staging dataset, used only for the upload scenario.
const UPLOAD_CPR_ID = __ENV.UPLOAD_CPR_ID || '';
const THINK_MIN = Number(__ENV.THINK_MIN || 1);
const THINK_MAX = Number(__ENV.THINK_MAX || 3);

if (!BASE_URL || !EMAIL || !PASSWORD) {
  throw new Error('BASE_URL, ERP_EMAIL and ERP_PASSWORD are required');
}

const cprReportsLatency = new Trend('erp_cpr_reports_ms', true);
const notificationsLatency = new Trend('erp_notifications_ms', true);
const writesRate = new Rate('erp_write_success');
const uploadsCounter = new Counter('erp_uploads_total');

export const options = {
  scenarios: {
    erp_mixed: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: VUS },
        { duration: DURATION, target: VUS },
        { duration: '30s', target: 0 },
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: {
    // Fail the run instead of reporting a green result on a broken backend.
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1000', 'p(99)<2500'],
    checks: ['rate>0.99'],
    erp_cpr_reports_ms: ['p(95)<1500', 'p(99)<3000'],
    erp_notifications_ms: ['p(95)<500', 'p(99)<1000'],
  },
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

function jsonHeaders(token) {
  return {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    tags: { name: 'api' },
  };
}

function login() {
  const res = http.post(
    `${BASE_URL}/v1/auth/login`,
    JSON.stringify({ email: EMAIL, password: PASSWORD }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  const ok = check(res, { 'login 200': (r) => r.status === 200 });
  if (!ok) throw new Error(`Login failed: HTTP ${res.status} ${res.body}`);
  const body = res.json();
  const token = body?.data?.token;
  if (!token) throw new Error('Login response has no data.token');
  return token;
}

export function setup() {
  return { token: login() };
}

/** Weighted pick — keeps the read mix explicit and easy to tune per staging run. */
function pickRead() {
  const roll = Math.random() * 100;
  if (roll < 30) return 'salesOrders';
  if (roll < 50) return 'cprs';
  if (roll < 62) return 'invoices';
  if (roll < 74) return 'purchaseOrders';
  if (roll < 84) return 'productionOrders';
  if (roll < 92) return 'cprReports';
  if (roll < 97) return 'notifications';
  return 'crmLeads';
}

export default function (data) {
  const h = jsonHeaders(data.token);
  const read = pickRead();

  group(read, () => {
    let res;
    switch (read) {
      case 'salesOrders':
        res = http.get(`${BASE_URL}/v1/sales-orders?page=0&size=25`, h);
        break;
      case 'cprs':
        res = http.get(`${BASE_URL}/v1/cprs?page=0&size=25`, h);
        break;
      case 'invoices':
        res = http.get(`${BASE_URL}/v1/invoices?page=0&size=25`, h);
        break;
      case 'purchaseOrders':
        res = http.get(`${BASE_URL}/v1/api/purchase/orders?page=0&size=25`, h);
        break;
      case 'productionOrders':
        res = http.get(`${BASE_URL}/v1/production-orders?page=0&size=25`, h);
        break;
      case 'crmLeads':
        res = http.get(`${BASE_URL}/v1/leads?page=0&size=25`, h);
        break;
      case 'cprReports':
        res = http.get(`${BASE_URL}/v1/cprs/reports/summary`, h);
        cprReportsLatency.add(res.timings.duration);
        break;
      case 'notifications':
        res = http.get(`${BASE_URL}/v1/notifications?page=0&size=100`, h);
        notificationsLatency.add(res.timings.duration);
        break;
      default:
        res = http.get(`${BASE_URL}/v1/sales-orders?page=0&size=25`, h);
    }
    check(res, { [`${read} 2xx`]: (r) => r.status >= 200 && r.status < 300 });
  });

  // Real write path: create a CPR draft. Draft creation is the same code path
  // the UI uses, is bounded (no approvals, no downstream documents) and is
  // easy to identify for staging cleanup (department "K6 Load Test").
  if (ENABLE_WRITES && Math.random() < 0.10) {
    group('writeCprDraft', () => {
      const res = http.post(
        `${BASE_URL}/v1/cprs?draft=true`,
        JSON.stringify({
          department: 'K6 Load Test',
          requestedBy: 'k6',
          remarks: 'Synthetic staging load-test draft — safe to remove',
        }),
        h,
      );
      const ok = check(res, { 'cpr draft created': (r) => r.status === 201 });
      writesRate.add(ok);
    });
  }

  // Optional attachment throughput probe against a known staging CPR.
  if (ENABLE_UPLOAD && UPLOAD_CPR_ID) {
    group('uploadAttachment', () => {
      const payload = encoding.b64decode(
        'JVBERi0xLjQKMSAwIG9iago8PC9UeXBlL0NhdGFsb2c+PgplbmRvYmoKdHJhaWxlcgo8PC9Sb290IDEgMCBSPj4KJSVFT0YK',
        'std',
      );
      const res = http.post(
        `${BASE_URL}/v1/cprs/${UPLOAD_CPR_ID}/attachments`,
        { file: http.file(payload, `k6-${__VU}-${__ITER}.pdf`, 'application/pdf') },
        { headers: { Authorization: `Bearer ${data.token}` } },
      );
      uploadsCounter.add(1);
      check(res, { 'attachment uploaded': (r) => r.status === 201 });
    });
  }

  sleep(THINK_MIN + Math.random() * Math.max(0, THINK_MAX - THINK_MIN));
}
