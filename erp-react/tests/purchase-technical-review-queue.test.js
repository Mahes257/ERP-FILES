/**
 * tests/purchase-technical-review-queue.test.js
 * ------------------------------------------------------------------
 * The Technical Specification Review queue is no longer filtered in the
 * browser.
 *
 * It used to read 500 requisitions (requisition.js getTechnicalReviewQueue,
 * pageSize: 500) and then search, filter (drawer + KPI cards), sort and page
 * them inside React — which also made the KPI counts depend on an arbitrary
 * window of rows. It now reads ONE bounded page from
 *
 *   GET /api/purchase/requisitions/technical-review       (page/size/sort)
 *   GET /api/purchase/requisitions/technical-review/stats (counts + options)
 *
 * Covered here:
 *   QUERY CONTRACT  the pure helpers that turn screen state into a queue
 *                   request, plus the local-mode predicate/ordering that
 *                   mirrors the backend
 *   FRONTEND        the API layer sends those parameters, the service no
 *                   longer uses the 500-row workaround, and the screen does
 *                   not filter, sort or slice the queue itself
 *   BACKEND         the endpoint exists, is clamped to 100 rows, and filters
 *                   in the database
 *
 * Run: node --test tests/purchase-technical-review-queue.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  KPI_FILTERS,
  QUEUE_ACTIVE,
  QUEUE_PAGE_SIZE_DEFAULT,
  QUEUE_PAGE_SIZE_EXPORT,
  QUEUE_PAGE_SIZE_MAX,
  QUEUE_READY,
  QUEUE_REVIEWED,
  QUEUE_STAGE,
  buildQueueQuery,
  buildQueueSort,
  clampQueuePageSize,
  compareQueueRows,
  isReviewedOn,
  mapQueueStats,
  matchesQueueRow,
} from '../src/purchase/utils/technicalReviewQueue.js';

const ROOT = join(import.meta.dirname, '..');
const read = (relativePath) => readFileSync(join(ROOT, relativePath), 'utf8');

const PAGE = 'src/purchase/pages/requisition/TechnicalSpecificationReview.jsx';
const SERVICE = 'src/purchase/services/requisition.js';
const API_LAYER = 'src/purchase/services/api/requisitionApi.js';
const CONTROLLER = 'erp-backend/src/main/java/com/vishatech/erp/controller/PurchaseRequisitionController.java';
const BACKEND_SERVICE = 'erp-backend/src/main/java/com/vishatech/erp/service/PurchaseRequisitionService.java';
const CONSTANTS = 'src/purchase/constants/index.js';

/* Values read out of src/purchase/constants/index.js. They are spelled out
   instead of imported because the constants barrel uses extension-less
   specifiers Node cannot resolve — and the guard test below fails loudly if
   they ever drift from the constants module. */
const PR_TECHNICAL_REVIEW = 'Technical Specification Review';
const PR_PENDING_APPROVAL = 'Pending Approval';
const PR_READY_FOR_RFQ = 'Ready for RFQ';
const REVIEW_IN_REVIEW = 'In Review';

const requisition = (overrides = {}) => ({
  id: 1,
  prNo: 'PR-2026-0001',
  title: 'Test requisition',
  status: QUEUE_STAGE,
  recordState: QUEUE_ACTIVE,
  department: 'Quality',
  vendor: 'Acme',
  priority: 'High',
  buyer: 'Ravi',
  date: '2026-02-01',
  createdAt: '2026-02-01T09:00:00',
  items: [{ product: 'Hex bolt M10' }],
  technicalReview: null,
  ...overrides,
});

/* ------------------------------------------------------------------ *
 * Query contract
 * ------------------------------------------------------------------ */

describe('queue query contract', () => {
  it('always sends a page and a clamped size', () => {
    assert.deepEqual(buildQueueQuery(), { page: 1, size: QUEUE_PAGE_SIZE_DEFAULT, reviewedToday: false });
    assert.equal(buildQueueQuery({ page: 4, pageSize: 50 }).page, 4);
    assert.equal(buildQueueQuery({ page: 4, pageSize: 50 }).size, 50);
    assert.equal(buildQueueQuery({ pageSize: 5000 }).size, QUEUE_PAGE_SIZE_MAX);
    assert.equal(buildQueueQuery({ pageSize: 0 }).size, QUEUE_PAGE_SIZE_DEFAULT);
    assert.equal(buildQueueQuery({ page: -3 }).page, 1);
  });

  it('keeps the default (25) inside the cap (100)', () => {
    assert.ok(QUEUE_PAGE_SIZE_DEFAULT <= QUEUE_PAGE_SIZE_MAX);
    assert.equal(QUEUE_PAGE_SIZE_EXPORT, QUEUE_PAGE_SIZE_MAX);
    assert.equal(clampQueuePageSize(101), QUEUE_PAGE_SIZE_MAX);
    assert.equal(clampQueuePageSize('n/a'), QUEUE_PAGE_SIZE_DEFAULT);
  });

  it('maps screen filters onto query parameters and drops empty ones', () => {
    const query = buildQueueQuery({
      page: 2,
      pageSize: 25,
      search: '  hex bolt ',
      filters: { department: 'Quality', vendor: 'All', assignedBy: '', priority: 'High', dateFrom: '2026-01-01', dateTo: undefined },
      sortKey: 'prNo',
      sortDirection: 'desc',
    });

    assert.deepEqual(query, {
      page: 2,
      size: 25,
      search: 'hex bolt',
      sort: '-prNo',
      department: 'Quality',
      priority: 'High',
      dateFrom: '2026-01-01',
      reviewedToday: false,
    });
    assert.equal('reviewStatus' in query, false);
    assert.equal('vendor' in query, false);
    assert.equal('assignedBy' in query, false);
    assert.equal('dateTo' in query, false);
  });

  it('turns the KPI cards into real queue criteria', () => {
    assert.deepEqual(KPI_FILTERS.pendingReview, { reviewStatus: QUEUE_READY });
    assert.equal(KPI_FILTERS.reviewedToday.reviewedToday, true);
    assert.equal(KPI_FILTERS.highPriority.priority, 'High,Critical');

    assert.equal(buildQueueQuery({ kpiActive: 'pendingReview' }).reviewStatus, QUEUE_READY);
    assert.equal(buildQueueQuery({ kpiActive: 'reviewedToday' }).reviewedToday, true);
    assert.equal(buildQueueQuery({ kpiActive: 'highPriority' }).priority, 'High,Critical');
    assert.equal(buildQueueQuery({ kpiActive: null }).reviewedToday, false);
  });

  it('lets a KPI card override the drawer value it replaces', () => {
    const query = buildQueueQuery({
      filters: { priority: 'Low', reviewStatus: 'Reviewed' },
      kpiActive: 'highPriority',
    });
    assert.equal(query.priority, 'High,Critical');
    assert.equal(query.reviewStatus, 'Reviewed');
  });

  it('keeps its status literals in step with the Purchase constants', () => {
    const constants = read(CONSTANTS);
    assert.match(constants, new RegExp(`TECHNICAL_REVIEW: '${QUEUE_STAGE}'`));
    assert.match(constants, new RegExp(`REVIEWED: '${QUEUE_REVIEWED}'`));
    assert.match(constants, new RegExp(`PENDING_APPROVAL: '${PR_PENDING_APPROVAL}'`));
    assert.match(constants, new RegExp(`READY_FOR_RFQ: '${PR_READY_FOR_RFQ}'`));
    assert.match(constants, new RegExp(`IN_REVIEW: '${REVIEW_IN_REVIEW}'`));
  });

  it('builds the sort parameter (descending uses the -field form)', () => {
    assert.equal(buildQueueSort(null, 'asc'), '');
    assert.equal(buildQueueSort('prNo', 'asc'), 'prNo');
    assert.equal(buildQueueSort('prNo', 'desc'), '-prNo');
  });
});

/* ------------------------------------------------------------------ *
 * Local-mode predicate / ordering (mirrors the backend)
 * ------------------------------------------------------------------ */

describe('queue row matching', () => {
  it('keeps only requisitions in the review stage', () => {
    assert.equal(matchesQueueRow(requisition(), {}), true);
    assert.equal(matchesQueueRow(requisition({ status: PR_PENDING_APPROVAL }), {}), false);
    assert.equal(matchesQueueRow(requisition({ status: PR_READY_FOR_RFQ }), {}), false);
    assert.equal(matchesQueueRow(requisition({ status: QUEUE_STAGE, recordState: 'archived' }), {}), false);
    assert.equal(matchesQueueRow(null, {}), false);
  });

  it('applies every drawer filter', () => {
    const row = requisition();
    assert.equal(matchesQueueRow(row, { department: 'Quality' }), true);
    assert.equal(matchesQueueRow(row, { department: 'Stores' }), false);
    assert.equal(matchesQueueRow(row, { vendor: 'Acme' }), true);
    assert.equal(matchesQueueRow(row, { assignedBy: 'Ravi' }), true);
    assert.equal(matchesQueueRow(row, { assignedBy: 'Sita' }), false);
    assert.equal(matchesQueueRow(row, { priority: 'High,Critical' }), true);
    assert.equal(matchesQueueRow(row, { priority: 'Low' }), false);
    assert.equal(matchesQueueRow(row, { dateFrom: '2026-03-01' }), false);
    assert.equal(matchesQueueRow(row, { dateTo: '2026-01-01' }), false);
  });

  it('separates reviewed rows from rows still ready for review', () => {
    const reviewed = requisition({ technicalReview: { reviewStatus: QUEUE_REVIEWED } });
    const ready = requisition({ technicalReview: null });
    const inReview = requisition({ technicalReview: { reviewStatus: REVIEW_IN_REVIEW } });

    assert.equal(matchesQueueRow(reviewed, { reviewStatus: QUEUE_REVIEWED }), true);
    assert.equal(matchesQueueRow(reviewed, { reviewStatus: QUEUE_READY }), false);
    assert.equal(matchesQueueRow(ready, { reviewStatus: QUEUE_READY }), true);
    assert.equal(matchesQueueRow(inReview, { reviewStatus: QUEUE_READY }), true);
  });

  it('searches PR numbers, header fields and line items', () => {
    const row = requisition();
    assert.equal(matchesQueueRow(row, { search: 'pr-2026' }), true);
    assert.equal(matchesQueueRow(row, { search: 'quality' }), true);
    assert.equal(matchesQueueRow(row, { search: 'hex bolt' }), true);
    assert.equal(matchesQueueRow(row, { search: 'not-there' }), false);
  });

  it('filters "reviewed today" on the review timestamp', () => {
    const now = new Date();
    const today = requisition({ technicalReview: { reviewStatus: QUEUE_REVIEWED, reviewedAt: now.toISOString() } });
    const yesterday = requisition({
      technicalReview: { reviewStatus: QUEUE_REVIEWED, reviewedAt: new Date(now.getTime() - 48 * 3600 * 1000).toISOString() },
    });

    assert.equal(isReviewedOn(now.toISOString()), true);
    assert.equal(isReviewedOn(''), false);
    assert.equal(isReviewedOn('not-a-date'), false);
    assert.equal(matchesQueueRow(today, { reviewedToday: true }), true);
    assert.equal(matchesQueueRow(yesterday, { reviewedToday: true }), false);
  });
});

describe('queue ordering', () => {
  const rows = [
    requisition({ id: 1, prNo: 'PR-3', priority: 'Low', createdAt: '2026-02-03T09:00:00' }),
    requisition({ id: 2, prNo: 'PR-1', priority: 'Critical', createdAt: '2026-02-01T09:00:00' }),
    requisition({ id: 3, prNo: 'PR-2', priority: 'Medium', createdAt: '2026-02-02T09:00:00' }),
  ];

  it('orders FIFO (oldest first) by default', () => {
    const sorted = [...rows].sort((a, b) => compareQueueRows(a, b, ''));
    assert.deepEqual(sorted.map((row) => row.prNo), ['PR-1', 'PR-2', 'PR-3']);
  });

  it('orders by priority rank, not alphabetically', () => {
    const asc = [...rows].sort((a, b) => compareQueueRows(a, b, 'priority'));
    assert.deepEqual(asc.map((row) => row.priority), ['Critical', 'Medium', 'Low']);

    const desc = [...rows].sort((a, b) => compareQueueRows(a, b, '-priority'));
    assert.deepEqual(desc.map((row) => row.priority), ['Low', 'Medium', 'Critical']);
  });

  it('orders text columns both ways', () => {
    const asc = [...rows].sort((a, b) => compareQueueRows(a, b, 'prNo'));
    assert.deepEqual(asc.map((row) => row.prNo), ['PR-1', 'PR-2', 'PR-3']);
    const desc = [...rows].sort((a, b) => compareQueueRows(a, b, 'prNo,desc'));
    assert.deepEqual(desc.map((row) => row.prNo), ['PR-3', 'PR-2', 'PR-1']);
  });
});

describe('queue stats mapping', () => {
  it('maps the KPI numbers and filter options', () => {
    const stats = mapQueueStats({
      pendingReview: 12,
      reviewedToday: 3,
      highPriority: '4',
      reviewed: 2,
      departments: ['Quality', null, 'Stores'],
      vendors: 'nope',
      assignees: ['Ravi'],
    });

    assert.equal(stats.pendingReview, 12);
    assert.equal(stats.reviewedToday, 3);
    assert.equal(stats.highPriority, 4);
    assert.equal(stats.reviewed, 2);
    assert.deepEqual(stats.departments, ['Quality', 'Stores']);
    assert.deepEqual(stats.vendors, []);
    assert.deepEqual(stats.assignees, ['Ravi']);
  });

  it('is null-safe', () => {
    const empty = mapQueueStats(null);
    assert.equal(empty.pendingReview, 0);
    assert.deepEqual(empty.departments, []);
  });
});

/* ------------------------------------------------------------------ *
 * Frontend — no browser-side queue filtering left
 * ------------------------------------------------------------------ */

describe('technical review screen', () => {
  const page = read(PAGE);

  it('reads the queue through the paged service call', () => {
    assert.match(page, /requisitionService\.getTechnicalReviewQueue\(queueQuery\)/);
    assert.match(page, /requisitionService\s*\n?\s*\.getTechnicalReviewQueueStats\(\)/);
  });

  it('no longer filters, sorts or slices the queue in the browser', () => {
    assert.doesNotMatch(page, /const filtered = useMemo/);
    assert.doesNotMatch(page, /const sorted = useMemo/);
    assert.doesNotMatch(page, /const sortValueFor/);
    assert.doesNotMatch(page, /sorted\.slice\(/);
    assert.doesNotMatch(page, /getRequisitions\(\{ page: 1, pageSize: 200 \}\)/);
  });

  it('takes its KPI values and filter options from the queue stats', () => {
    /* The page hands the service its RAW screen state (page / pageSize /
       search / filters / kpiActive / sortKey / sortDirection); the API layer
       is the single place that turns it into the queue query (asserted
       below). Building the query here as well would hand the service an
       already-built query, which the second pass would re-interpret as
       screen state and silently drop every filter, the sort and the chosen
       page size. */
    assert.match(page, /\(\) => \(\{ page, pageSize, search, filters, kpiActive, sortKey, sortDirection \}\)/);
    assert.doesNotMatch(page, /buildQueueQuery\(/);
    assert.match(page, /const departmentOptions = stats\.departments;/);
    assert.match(page, /const vendorOptions = stats\.vendors;/);
    assert.match(page, /const assignedByOptions = stats\.assignees;/);
  });
});

describe('requisition service + API layer', () => {
  const service = read(SERVICE);
  const api = read(API_LAYER);

  it('dropped the 500-row workaround', () => {
    assert.doesNotMatch(service, /pageSize: 500/);
    assert.doesNotMatch(service, /requisitionApi\.list\(\{ pageSize: 500 \}\)/);
  });

  it('serves the queue from the dedicated paged endpoints', () => {
    assert.match(service, /requisitionApi\.technicalReviewQueue\(options\)/);
    assert.match(service, /requisitionApi\.technicalReviewQueueStats\(\)/);
    assert.match(api, /purchaseGet\('\/requisitions\/technical-review', params\)/);
    assert.match(api, /purchaseGet\('\/requisitions\/technical-review\/stats'\)/);
    assert.match(api, /normalizePage\(unwrapResponse\(data\)\)/);
    assert.match(api, /buildQueueQuery\(options\)/);
  });
});

/* ------------------------------------------------------------------ *
 * Backend — endpoint, clamping and database filtering
 * ------------------------------------------------------------------ */

describe('queue backend endpoints', () => {
  const controller = read(CONTROLLER);
  const service = read(BACKEND_SERVICE);

  it('exposes the queue and its stats behind PURCHASE_VIEW', () => {
    assert.match(controller, /@GetMapping\("\/technical-review"\)/);
    assert.match(controller, /@GetMapping\("\/technical-review\/stats"\)/);
    const guarded = controller.match(/@GetMapping\("\/technical-review"\)\s*\n\s*@PreAuthorize\("hasAuthority\('PURCHASE_VIEW'\)"\)/g) || [];
    assert.equal(guarded.length, 1);
  });

  it('declares page / size / sort plus the queue filters', () => {
    ['page', 'size', 'search', 'sort', 'reviewStatus', 'department', 'vendor', 'assignedBy', 'priority', 'dateFrom', 'dateTo', 'reviewedToday']
      .forEach((name) => {
        assert.match(controller, new RegExp(`@RequestParam\\([^)]*\\) [A-Za-z]+ ${name}`), `${name} parameter missing`);
      });
    assert.match(controller, /@RequestParam\(defaultValue = "25"\) int size/);
  });

  it('clamps the page size and counts in the database', () => {
    assert.match(service, /QUEUE_MAX_PAGE_SIZE = 100/);
    assert.match(service, /QUEUE_DEFAULT_PAGE_SIZE = 25/);
    assert.match(service, /Math\.min\(size, QUEUE_MAX_PAGE_SIZE\)/);
    assert.match(service, /repository\.count\(/);
  });

  it('filters the queue in the database, never by loading the table', () => {
    assert.match(service, /private Specification<PurchaseRequisition> technicalReviewSpec\(/);
    assert.match(service, /cb\.equal\(root\.get\("status"\), STATUS_TECH_REVIEW\)/);
    assert.match(service, /cb\.like\(root\.get\("technicalReviewJson"\), "%" \+ REVIEWED_MARKER \+ "%"\)/);
    assert.match(service, /repository\.distinctDepartments\(/);
    assert.doesNotMatch(service, /requisitionsStore/);
  });
});
