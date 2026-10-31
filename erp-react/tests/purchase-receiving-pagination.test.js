/**
 * tests/purchase-receiving-pagination.test.js
 * ------------------------------------------------------------------
 * Purchase Receiving no longer downloads whole tables.
 *
 * The five receiving lists used to call the backend with no paging at all
 * (GET /grns, /inspections, /manufacturing, /shipments, /inventory) and
 * then filter, search and slice the entire result set in the browser. They
 * are now read as bounded, server-filtered pages: one request returns one
 * page (page / size / search / filters / sort) plus the database totals.
 *
 * Covered here:
 *   QUERY CONTRACT  the pure helper that builds page requests — 1-based to
 *                   0-based page, size clamped to the 25 default / 100 max,
 *                   blank and "All" filters dropped, search trimmed
 *   FRONTEND        the API layer sends those parameters and normalizes the
 *                   paged response; the service facade delegates to it
 *                   instead of filtering locally; no receiving screen asks
 *                   for an unbounded page any more
 *   BACKEND         the five endpoints declare page/size/sort, the service
 *                   clamps the size and counts in the database
 *
 * Run: node --test tests/purchase-receiving-pagination.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  RECEIVING_PAGE_SIZE_DEFAULT,
  RECEIVING_PAGE_SIZE_MAX,
  RECEIVING_PAGE_SIZE_SNAPSHOT,
  buildPageParams,
  clampPageSize,
  toPageIndex,
} from '../src/purchase/services/api/logisticsPaging.js';

const ROOT = join(import.meta.dirname, '..');

const read = (relativePath) => readFileSync(join(ROOT, relativePath), 'utf8');

const API_LAYER = 'src/purchase/services/api/logisticsApi.js';
const SERVICE = 'src/purchase/services/logistics.js';
const CONTROLLER = 'erp-backend/src/main/java/com/vishatech/erp/controller/PurchaseReceivingController.java';
const BACKEND_SERVICE = 'erp-backend/src/main/java/com/vishatech/erp/service/PurchaseReceivingService.java';
const LIST_PAGES = [
  'src/purchase/pages/logistics/GoodsReceipt.jsx',
  'src/purchase/pages/logistics/QualityInspection.jsx',
  'src/purchase/pages/logistics/ManufacturingPacking.jsx',
  'src/purchase/pages/logistics/ShipmentTracking.jsx',
  'src/purchase/pages/logistics/InventoryUpdate.jsx',
];

/* ------------------------------------------------------------------ *
 * Query contract
 * ------------------------------------------------------------------ */

describe('page request contract', () => {
  it('sends a 0-based page and defaults the size to the widest allowed page', () => {
    assert.deepEqual(buildPageParams(), { page: 0, size: RECEIVING_PAGE_SIZE_SNAPSHOT });
    assert.deepEqual(buildPageParams({ page: 1 }), { page: 0, size: RECEIVING_PAGE_SIZE_SNAPSHOT });
    assert.deepEqual(buildPageParams({ page: 3 }), { page: 2, size: RECEIVING_PAGE_SIZE_SNAPSHOT });
  });

  it('never sends a page below zero', () => {
    assert.deepEqual(buildPageParams({ page: 0 }).page, 0);
    assert.deepEqual(buildPageParams({ page: -5 }).page, 0);
    assert.deepEqual(buildPageParams({ page: 'nonsense' }).page, 0);
  });

  it('clamps the page size to the backend maximum', () => {
    assert.equal(buildPageParams({ pageSize: 25 }).size, 25);
    assert.equal(buildPageParams({ pageSize: 100 }).size, 100);
    assert.equal(buildPageParams({ pageSize: 101 }).size, 100);
    assert.equal(buildPageParams({ pageSize: 5000 }).size, 100);
    assert.equal(buildPageParams({ pageSize: 10000 }).size, 100);
  });

  it('falls back to the default size for missing, zero or negative sizes', () => {
    assert.equal(clampPageSize(undefined), RECEIVING_PAGE_SIZE_DEFAULT);
    assert.equal(clampPageSize(null), RECEIVING_PAGE_SIZE_DEFAULT);
    assert.equal(clampPageSize(0), RECEIVING_PAGE_SIZE_DEFAULT);
    assert.equal(clampPageSize(-20), RECEIVING_PAGE_SIZE_DEFAULT);
    assert.equal(clampPageSize('n/a'), RECEIVING_PAGE_SIZE_DEFAULT);
    assert.equal(buildPageParams({ pageSize: 0 }).size, RECEIVING_PAGE_SIZE_DEFAULT);
  });

  it('keeps the default (25) below the cap (100)', () => {
    assert.ok(RECEIVING_PAGE_SIZE_DEFAULT < RECEIVING_PAGE_SIZE_MAX);
    assert.equal(RECEIVING_PAGE_SIZE_SNAPSHOT, RECEIVING_PAGE_SIZE_MAX);
  });

  it('trims the search term and drops blank ones', () => {
    assert.deepEqual(buildPageParams({ search: '  GRN-2026-0001 ' }).search, 'GRN-2026-0001');
    assert.equal('search' in buildPageParams({ search: '   ' }), false);
    assert.equal('search' in buildPageParams({ search: '' }), false);
    assert.equal('search' in buildPageParams({ search: null }), false);
  });

  it('keeps real filters and drops empty / "All" ones', () => {
    const params = buildPageParams({
      page: 2,
      pageSize: 50,
      status: 'Pending Inspection',
      vendor: 'All',
      poNo: '',
      warehouse: '   ',
      type: undefined,
      sku: null,
      reference: 'GRN-2026-0009',
    });

    assert.deepEqual(params, {
      page: 1,
      size: 50,
      status: 'Pending Inspection',
      reference: 'GRN-2026-0009',
    });
  });

  it('only sends a sort field when one is given', () => {
    assert.equal('sort' in buildPageParams({ sort: '' }), false);
    assert.equal(buildPageParams({ sort: '  grnNo,asc ' }).sort, 'grnNo,asc');
  });

  it('maps 1-based pages to Spring Data page indexes', () => {
    assert.equal(toPageIndex(1), 0);
    assert.equal(toPageIndex(4), 3);
    assert.equal(toPageIndex(0), 0);
    assert.equal(toPageIndex(undefined), 0);
  });
});

/* ------------------------------------------------------------------ *
 * Frontend — the API layer and the service facade
 * ------------------------------------------------------------------ */

describe('logistics API layer', () => {
  const source = read(API_LAYER);

  it('paged every receiving list through the shared page-parameter builder', () => {
    ['/grns', '/inspections', '/manufacturing', '/shipments', '/inventory'].forEach((path) => {
      assert.match(
        source,
        new RegExp(`purchaseGet\\('${path}', buildPageParams\\(\\{`),
        `${path} must be requested with buildPageParams`
      );
    });
  });

  it('normalizes every paged response into the { data, total, page, pageSize, totalPages } shape', () => {
    const normalized = source.match(/normalizePage\(unwrapResponse\(data\)\)/g) || [];
    assert.equal(normalized.length, 5);
  });

  it('carries a single-document inspection lookup and the stats endpoints', () => {
    assert.match(source, /async inspectionStats\(\)/);
    assert.match(source, /async inspection\(id\)/);
    assert.match(source, /async grnStats\(\)/);
  });

  it('never asks for a fixed unbounded page size', () => {
    assert.doesNotMatch(source, /size:\s*(1000|5000|10000|100000)/);
  });
});

describe('logistics service facade', () => {
  const source = read(SERVICE);

  it('delegates the API-mode lists to the paged endpoints instead of filtering locally', () => {
    assert.match(source, /return logisticsApi\.grns\(\{ page, pageSize, search, status \}\)/);
    assert.match(source, /return logisticsApi\.inspections\(\{ page, pageSize, search, status \}\)/);
    assert.match(source, /return logisticsApi\.manufacturing\(\{ page, pageSize, search, status \}\)/);
    assert.match(source, /return logisticsApi\.shipments\(\{ page, pageSize, search, status \}\)/);
    assert.match(source, /return logisticsApi\.inventory\(\{ page, pageSize, search, type \}\)/);
  });

  it('does not download a whole list to answer a single-record question', () => {
    // No zero-argument list call may remain: hasPackingForPo, the inspection
    // lookups and the ledger duplicate guard all use bounded queries now.
    assert.doesNotMatch(source, /logisticsApi\.(grns|inspections|inventory|manufacturing|shipments)\(\)/);
    assert.match(source, /logisticsApi\.manufacturing\(\{ poNo, pageSize: 1 \}\)/);
    assert.match(source, /logisticsApi\.inspections\(\{ grnNo: grn\.grnNo, pageSize: 1 \}\)/);
  });

  it('reads the KPI counts from the stats endpoints', () => {
    assert.match(source, /await logisticsApi\.grnStats\(\)/);
    assert.match(source, /await logisticsApi\.inspectionStats\(\)/);
  });

  it('keeps no page-walking loop in the receiving flow', () => {
    assert.doesNotMatch(source, /while\s*\(/);
    assert.doesNotMatch(source, /for\s*\(\s*;\s*;\s*\)/);
  });

  it('exposes the backend page cap so screens stop asking for "everything"', () => {
    assert.match(source, /export const RECEIVING_MAX_PAGE_SIZE = RECEIVING_PAGE_SIZE_MAX;/);
  });
});

describe('receiving screens', () => {
  it('request the widest allowed page for exports instead of 10000 rows', () => {
    LIST_PAGES.forEach((path) => {
      const source = read(path);
      assert.doesNotMatch(source, /pageSize:\s*(1000|5000|10000|100000)/, `${path} asks for an unbounded page`);
      assert.match(source, /RECEIVING_MAX_PAGE_SIZE/, `${path} must use the shared page cap`);
    });
  });
});

/* ------------------------------------------------------------------ *
 * Backend — endpoints, clamping and database counts
 * ------------------------------------------------------------------ */

describe('receiving backend endpoints', () => {
  const controller = read(CONTROLLER);
  const service = read(BACKEND_SERVICE);

  it('declares page / size / sort on all five list endpoints', () => {
    ['/grns', '/inspections', '/manufacturing', '/shipments', '/inventory'].forEach((path) => {
      assert.match(controller, new RegExp(`@GetMapping\\("${path}"\\)`), `${path} mapping missing`);
    });

    const pagedMappings = controller.match(/@GetMapping\("(\/grns|\/inspections|\/manufacturing|\/shipments|\/inventory)"\)[^\n]*@RequestParam\(defaultValue="0"\) int page/g) || [];
    assert.equal(pagedMappings.length, 5, 'every list endpoint must accept a page parameter');

    const sized = controller.match(/@RequestParam\(defaultValue="25"\) int size/g) || [];
    assert.equal(sized.length, 5, 'every list endpoint must default the page size to 25');
  });

  it('returns a page envelope, not a bare list', () => {
    assert.match(controller, /public Page<Map<String,Object>> listGrns\(/);
    assert.match(controller, /public Page<Map<String,Object>> listInspections\(/);
    assert.match(controller, /public Page<Map<String,Object>> listMfg\(/);
    assert.match(controller, /public Page<Map<String,Object>> listShips\(/);
    assert.match(controller, /public Page<Map<String,Object>> listInv\(/);
  });

  it('clamps every page size on the server', () => {
    assert.match(service, /private static final int DEFAULT_PAGE_SIZE=25;/);
    assert.match(service, /private static final int MAX_PAGE_SIZE=100;/);
    assert.match(service, /Math\.min\(size,MAX_PAGE_SIZE\)/);
  });

  it('no longer maps an entire table into a list response', () => {
    ['listGrns', 'listInspections', 'listManufacturing', 'listShipments', 'listInventory'].forEach((name) => {
      assert.doesNotMatch(
        service,
        new RegExp(`List<Map<String,Object>> ${name}\\(`),
        `${name} must return a page`
      );
    });
    assert.doesNotMatch(service, /grns\.findAll\(\)\.stream\(\)\.map\(this::grn\)/);
    assert.doesNotMatch(service, /inspections\.findAll\(\)\.stream\(\)/);
    assert.doesNotMatch(service, /mfgJobs\.findAll\(\)\.stream\(\)\.map\(this::mfr\)/);
    assert.doesNotMatch(service, /shipments\.findAll\(\)\.stream\(\)\.map\(this::ship\)/);
    assert.doesNotMatch(service, /inventory\.findAll\(\)\.stream\(\)\.map\(this::mov\)/);
  });

  it('counts the KPI figures in the database', () => {
    assert.match(service, /grns\.countBy\(\)/);
    assert.match(service, /grns\.countByStatus\("Pending Inspection"\)/);
    assert.match(service, /inspections\.countByStatus\("Partially Accepted"\)/);
    assert.match(service, /mfgJobs\.countByStatus\("In Progress"\)|mfgJobs\.countByStatus\("In Production"\)/);
    assert.match(service, /shipments\.countByStatus\("In Transit"\)/);
    assert.match(service, /inventory\.countByTypeAndDirection\("Transfer","Out"\)/);
    assert.match(service, /inventory\.sumDeltaForItem\(/);
  });

  it('loads a page of GRN line items in one query instead of per row', () => {
    assert.match(service, /grns\.findAllWithItemsByIds\(ids\)/);
  });
});
