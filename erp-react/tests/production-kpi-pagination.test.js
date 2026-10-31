/**
 * tests/production-kpi-pagination.test.js
 * ------------------------------------------------------------------
 * Production KPI screens no longer calculate in the browser.
 *
 * The KPI details page used to pull whole production tables (all orders,
 * inspections, packing and dispatch records plus four 500-row shop-floor
 * lists) and then filter, count, sort and render every matching row itself;
 * the Production Orders counters walked the loaded orders; the Machine
 * Utilization report downloaded up to 500 Machine Shop jobs that could not
 * contribute anything.
 *
 * They now ask the database:
 *
 *   GET /production-kpi/{module}/kpi/{kpiKey}?page&size&search&status
 *   GET /production-kpi/{module}/counts
 *
 * Covered here:
 *   QUERY CONTRACT  the pure helpers that build the request, clamp the page
 *                   size and normalise the response
 *   FRONTEND        the pages use those endpoints, keep a bounded page and no
 *                   longer hold or tally whole tables
 *   BACKEND         the endpoints exist, clamp to 100 and filter in SQL
 *
 * Run: node --test tests/production-kpi-pagination.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  KPI_PAGE_SIZE_DEFAULT,
  KPI_PAGE_SIZE_MAX,
  ORDER_TAB_KPI_KEYS,
  buildKpiParams,
  clampKpiPageSize,
  normalizeKpiPage,
  orderTabCounts,
  toApiPage,
} from '../src/production/utils/kpiQuery.js';

const ROOT = join(import.meta.dirname, '..');
const read = (relativePath) => readFileSync(join(ROOT, relativePath), 'utf8');

const KPI_PAGE = 'src/production/pages/KpiDetailsPage.jsx';
const MACHINE_REPORT = 'src/production/pages/reports/MachineUtilizationReport.jsx';
const ORDERS_PAGE = 'src/production/pages/ProductionOrders.jsx';
const API_LAYER = 'src/production/utils/api.js';
const CONTROLLER = 'erp-backend/src/main/java/com/vishatech/erp/controller/production/ProductionKpiController.java';
const SERVICE = 'erp-backend/src/main/java/com/vishatech/erp/service/production/ProductionKpiService.java';
// The report aggregations moved server-side (Production → Reports), so the
// machine formulas asserted below are now the report service's.
const REPORT_SERVICE =
  'erp-backend/src/main/java/com/vishatech/erp/service/production/ProductionReportService.java';
const REPORT_API = 'src/production/services/production/reportService.js';

/* ------------------------------------------------------------------ *
 * Query contract
 * ------------------------------------------------------------------ */

describe('KPI query contract', () => {
  it('always sends a page and a clamped size', () => {
    assert.deepEqual(buildKpiParams(), { page: 0, size: KPI_PAGE_SIZE_DEFAULT });
    assert.equal(buildKpiParams({ page: 3 }).page, 2);
    assert.equal(buildKpiParams({ page: 0 }).page, 0);
    assert.equal(buildKpiParams({ page: -4 }).page, 0);
    assert.equal(buildKpiParams({ pageSize: 500 }).size, KPI_PAGE_SIZE_MAX);
    assert.equal(buildKpiParams({ pageSize: 0 }).size, KPI_PAGE_SIZE_DEFAULT);
    assert.equal(buildKpiParams({ pageSize: 'n/a' }).size, KPI_PAGE_SIZE_DEFAULT);
    assert.equal(clampKpiPageSize(101), KPI_PAGE_SIZE_MAX);
    assert.equal(toApiPage(1), 0);
    assert.ok(KPI_PAGE_SIZE_DEFAULT <= KPI_PAGE_SIZE_MAX);
  });

  it('drops a blank or "All" status and trims the search term', () => {
    assert.equal('status' in buildKpiParams({ status: 'All' }), false);
    assert.equal('status' in buildKpiParams({ status: '  ' }), false);
    assert.equal('search' in buildKpiParams({ search: '   ' }), false);
    assert.equal(buildKpiParams({ status: 'Draft' }).status, 'Draft');
    assert.equal(buildKpiParams({ search: '  WO-1 ' }).search, 'WO-1');
  });

  it('normalises the paged response the table renders', () => {
    const page = normalizeKpiPage({
      content: [{ id: 'WO-1' }],
      totalElements: 42,
      totalPages: 2,
      page: 1,
    });
    assert.deepEqual(page, { rows: [{ id: 'WO-1' }], total: 42, totalPages: 2, page: 1 });
  });

  it('is null-safe and never reports zero pages', () => {
    const empty = normalizeKpiPage(null);
    assert.deepEqual(empty.rows, []);
    assert.equal(empty.total, 0);
    assert.equal(empty.totalPages, 1);

    const onePage = normalizeKpiPage({ content: [{ id: 'WO-1' }], totalElements: 1, totalPages: 0 });
    assert.equal(onePage.totalPages, 1);
    assert.equal(onePage.total, 1);
  });

  it('maps the orders counters onto the tab labels', () => {
    const counts = orderTabCounts({
      total: 10,
      draft: 4,
      prodApproval: 3,
      adminApproval: 2,
      approved: 1,
      prodRejected: 0,
      adminRejected: 0,
      cancelled: 0,
    });

    assert.deepEqual(counts, {
      All: 10,
      Draft: 4,
      'Production Approval': 3,
      'Admin Approval': 2,
      Approved: 1,
      'Production Rejected': 0,
      'Admin Rejected': 0,
      Cancelled: 0,
    });
    assert.equal(Object.keys(ORDER_TAB_KPI_KEYS).length, Object.keys(counts).length);
  });

  it('reports zero for missing counters instead of NaN', () => {
    const counts = orderTabCounts({ total: 3 });
    assert.equal(counts.All, 3);
    assert.equal(counts.Draft, 0);
    assert.equal(orderTabCounts(null).All, 0);
  });
});

/* ------------------------------------------------------------------ *
 * KPI details page — one bounded page, no client-side aggregation
 * ------------------------------------------------------------------ */

describe('KPI details page', () => {
  const page = read(KPI_PAGE);

  it('reads one page from the KPI endpoint', () => {
    assert.match(page, /productionKpiApi\.kpiPage\(/);
    assert.match(page, /pageSize: KPI_PAGE_SIZE_DEFAULT/);
    assert.match(page, /normalizeKpiPage\(/);
    assert.match(page, /search,/);
    assert.match(page, /status: statusFilter/);
  });

  it('no longer downloads whole tables for the KPIs', () => {
    assert.doesNotMatch(page, /castingApi\.list\(\{ size: 500 \}\)/);
    assert.doesNotMatch(page, /fabricationApi\.list\(\{ size: 500 \}\)/);
    assert.doesNotMatch(page, /assemblyApi\.list\(\{ size: 500 \}\)/);
    assert.doesNotMatch(page, /machineShopApi\.list\(\{ size: 500 \}\)/);
    assert.doesNotMatch(page, /size: 500/);
  });

  it('no longer filters or tallies the KPI rows in the browser', () => {
    assert.doesNotMatch(page, /function filterData/);
    assert.doesNotMatch(page, /function getJobs/);
    assert.doesNotMatch(page, /orders\.find\(/);
  });

  it('no longer reads the production contexts to compute a KPI', () => {
    assert.doesNotMatch(page, /useProductionOrders/);
    assert.doesNotMatch(page, /useQuality\(\)/);
    assert.doesNotMatch(page, /usePacking\(\)/);
    assert.doesNotMatch(page, /useDispatch\(\)/);
    assert.doesNotMatch(page, /useProductionEntry/);
  });

  it('keeps the table, its columns, filters and the record link', () => {
    assert.match(page, /kpi-details-table/);
    assert.match(page, /STATUS_FILTERS/);
    assert.match(page, /Search records\.\.\./);
    assert.match(page, /\/production\/orders\/\$\{record\.id\}/);
    assert.match(page, /\/production\/quality\/\$\{record\.id\}/);
  });

  it('pages with the module’s existing pager markup', () => {
    assert.match(page, /sf-pagination/);
    assert.match(page, /Page \{page\} of \{totalPages\}/);
    assert.match(page, /disabled=\{page <= 1\}/);
    assert.match(page, /disabled=\{page >= totalPages\}/);
    assert.match(page, /onClick=\{\(\) => setPage\(\(p\) => p \+ 1\)\}/);
  });

  it('sends the search term once typing settles, not per keystroke', () => {
    assert.match(page, /useDebounce\(searchInput, 400\)/);
    assert.match(page, /setPage\(1\)/);
  });
});

/* ------------------------------------------------------------------ *
 * Machine utilization — no dead job download, scoped machine master
 * ------------------------------------------------------------------ */

describe('machine utilization report', () => {
  const report = read(MACHINE_REPORT);

  it('no longer downloads the machine-shop job list', () => {
    assert.doesNotMatch(report, /machineShopApi/);
    assert.doesNotMatch(report, /size: 500/);
    assert.doesNotMatch(report, /loadData\('machineShop'/);
  });

  it('scopes the machine master to the selected department before computing', () => {
    // The report asks the report service for its own rows, passing the filters
    // (department included) instead of walking a client-side machine list.
    assert.match(report, /useReportData\(reportService\.getMachineUtilization, filters\)/);
    assert.match(read(REPORT_API), /getMachineUtilization: \(filters\) => productionReportApi\.machineUtilization\(filters\)/);

    // …and the backend scopes the machine master by department before computing,
    // so an unfiltered request still gets the whole master.
    const service = read(REPORT_SERVICE);
    assert.match(service, /machineRepository\.findByDepartmentOrderByMachineCodeAsc\(department\)/);
    assert.match(service, /machineRepository\.findAllByOrderByMachineCodeAsc\(\)/);
  });

  it('keeps the same formulas and summary', () => {
    // The cards still render the same summary the formula produces…
    assert.match(report, /summary\.averageUtilization/);
    assert.match(report, /Average Utilization/);
    assert.match(report, /data\?\.summary/);

    // …computed server-side as running ÷ available per machine, averaged over
    // the scoped machines (the formula the screens used to apply locally).
    const service = read(REPORT_SERVICE);
    assert.match(service, /percent\(nz\(machine\.getRunningHours\(\)\), nz\(machine\.getAvailableHours\(\)\), false\)/);
    assert.match(service, /summary\.put\("averageUtilization"/);
    assert.match(service, /utilizationTotal \/ rows\.size\(\)/);
  });
});

/* ------------------------------------------------------------------ *
 * Production orders counters — counted in SQL
 * ------------------------------------------------------------------ */

describe('production orders counters', () => {
  const orders = read(ORDERS_PAGE);

  it('reads the counters from the backend', () => {
    assert.match(orders, /productionKpiApi\.counts\('orders'\)/);
    assert.match(orders, /orderTabCounts\(response\?\.data \?\? response\)/);
  });

  it('no longer walks the loaded orders to count them', () => {
    assert.doesNotMatch(orders, /orders\.filter\(\(o\) => statuses\.includes\(o\.status\)\)\.length/);
  });

  it('still shows the same counters on the cards and tabs', () => {
    assert.match(orders, /num: tabCounts\.All \|\| 0/);
    assert.match(orders, /label: 'Total Orders'/);
    assert.match(orders, /tabCounts\['Production Approval'\]/);
  });
});

/* ------------------------------------------------------------------ *
 * Backend contract
 * ------------------------------------------------------------------ */

describe('KPI backend endpoints', () => {
  const controller = read(CONTROLLER);
  const service = read(SERVICE);

  it('exposes one paged KPI endpoint and one counters endpoint', () => {
    assert.match(controller, /@RequestMapping\("\/production-kpi"\)/);
    assert.match(controller, /@GetMapping\("\/\{module\}\/kpi\/\{kpiKey\}"\)/);
    assert.match(controller, /@GetMapping\("\/\{module\}\/counts"\)/);
    assert.match(controller, /@RequestParam\(defaultValue = "25"\) int size/);
  });

  it('clamps the page size and pages with Spring Data', () => {
    assert.match(service, /MAX_PAGE_SIZE = 100/);
    assert.match(service, /DEFAULT_PAGE_SIZE = 25/);
    assert.match(service, /Math\.min\(size, MAX_PAGE_SIZE\)/);
    assert.match(service, /PageRequest\.of\(/);
  });

  it('filters and counts in the database, never by loading a table', () => {
    assert.match(service, /Specification<ProductionOrder> orderSpec/);
    assert.match(service, /repository\.count\(|orders\.count\(|Repository\.count\(/);
    assert.match(service, /findAll\(/);
    assert.match(service, /totalElements/);
  });

  it('keeps the KPI definitions identical to the screens', () => {
    ['total', 'draft', 'prodApproval', 'adminApproval', 'approved',
      'prodRejected', 'adminRejected', 'cancelled'].forEach((key) => {
      assert.match(service, new RegExp(`Map\\.entry\\("${key}"`), `orders KPI ${key} missing`);
    });
    ['pendingApproval', 'inProgress', 'completed', 'onHold', 'qcPending', 'delayed'].forEach((key) => {
      assert.match(service, new RegExp(`"${key}"`), `dashboard KPI ${key} missing`);
    });
    ['pending', 'inProgress', 'completed', 'readyForDispatch'].forEach((key) => {
      assert.match(service, new RegExp(`Map\\.entry\\("${key}"`), `packing KPI ${key} missing`);
    });
    ['draft', 'ready', 'dispatched', 'inTransit', 'delivered'].forEach((key) => {
      assert.match(service, new RegExp(`Map\\.entry\\("${key}"`), `dispatch KPI ${key} missing`);
    });
  });

  it('is wired through the production API client', () => {
    const api = read(API_LAYER);
    assert.match(api, /export const productionKpiApi/);
    assert.match(api, /\/production-kpi\/\$\{encodeURIComponent\(module\)\}\/kpi\/\$\{encodeURIComponent\(kpiKey\)\}/);
    assert.match(api, /\/production-kpi\/\$\{encodeURIComponent\(module\)\}\/counts/);
    assert.match(api, /buildKpiParams\(/);
  });
});

/* ------------------------------------------------------------------ *
 * Quality KPI cards — counted and summed in SQL
 * ------------------------------------------------------------------ */

describe('quality KPI cards', () => {
  const page = read('src/production/pages/Quality.jsx');
  // The cards render through the shared grid the Packing page uses; the
  // Quality-specific wrapper it replaced is no longer mounted by the page.
  const cards = read('src/production/components/production/ModuleSummaryCards.jsx');
  const repository = read('erp-backend/src/main/java/com/vishatech/erp/repository/production/QualityInspectionRepository.java');

  it('reads the five card values from the counters endpoint', () => {
    assert.match(page, /productionKpiApi\.counts\('quality'\)/);
    assert.match(page, /<ModuleSummaryCards[\s\S]{0,200}values=\{summaryValues \|\| EMPTY_SUMMARY\}/);
    assert.match(page, /const EMPTY_SUMMARY = \{ pending: 0, today: 0, accepted: 0, rejected: 0, onHold: 0 \}/);
    assert.match(page, /subscribeProductionDataChanged\('quality-view', loadCounts\)/);
  });

  it('no longer filters or reduces the loaded inspections to draw a card', () => {
    assert.doesNotMatch(cards, /inspections\.filter\(/);
    assert.doesNotMatch(cards, /inspections\.reduce\(/);
    assert.doesNotMatch(cards, /toISOString\(\)\.slice\(0, 10\)/);
    assert.doesNotMatch(cards, /\binspections\b\s*[,}]/);
  });

  it('keeps the same cards, hints and click-through', () => {
    // the five cards, with the keys the counters endpoint returns
    assert.match(page, /key: 'pending'/);
    assert.match(page, /key: 'today'/);
    assert.match(page, /key: 'accepted'/);
    assert.match(page, /key: 'rejected'/);
    assert.match(page, /key: 'onHold'/);
    // the labels/hints the module had before the grid was shared
    assert.match(page, /label: 'QC Pending'/);
    assert.match(page, /hint: 'inspections awaiting start'/);
    assert.match(page, /hint: 'units rejected'/);
    // …and the grid still opens the KPI details tab for a clicked card
    assert.match(cards, /View \$\{card\.label\} details \(opens in new tab\)/);
    assert.match(cards, /onCardClick\(card\.key\)/);
    assert.match(page, /\/production\/kpi\/quality\/\$\{key\}/);
  });

  it('sums the unit columns in the database', () => {
    assert.match(repository, /SELECT COALESCE\(SUM\(qi\.acceptedQuantity\), 0\) FROM QualityInspection qi/);
    assert.match(repository, /SELECT COALESCE\(SUM\(qi\.rejectedQuantity\), 0\) FROM QualityInspection qi/);
    assert.match(repository, /long countByInspectionDate\(LocalDate inspectionDate\)/);
  });

  it('counts today in UTC, exactly as the screens did', () => {
    const service = read(SERVICE);
    assert.match(service, /case "quality" -> qualityCounts\(\)/);
    assert.match(service, /inspectionRepository\.countByInspectionDate\(todayUtc\(\)\)/);
    assert.match(service, /LocalDate\.now\(ZoneOffset\.UTC\)/);
    assert.match(service, /cb\.lessThanOrEqualTo\(root\.get\("dueDate"\), todayUtc\(\)\)/);
  });
});
