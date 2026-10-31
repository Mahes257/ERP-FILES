/**
 * tests/production-sales-orders-pagination.test.js
 * ------------------------------------------------------------------
 * Production Orders no longer download the entire Sales Order dataset.
 *
 * The old Production data flow walked EVERY page of GET /sales-orders
 * (page=0..totalPages, size=100) on mount — and each of those rows was a
 * FULL Sales Order assembled with its items, attachments, timeline and
 * history. It now reads:
 *
 *   GET /sales-orders/options   one bounded request of slim CPO rows
 *   GET /sales-orders/{id}      ONE full Sales Order, on demand
 *
 * Covered here:
 *   READ MODEL  the pure mapping/query helpers the flow is built on —
 *               option mapping, detail mapping, envelope unwrapping and
 *               CPO reference → Sales Order id resolution (including the
 *               legacy "number stored instead of id" rows)
 *   CONTRACT    no page-walking loop survives in the context, the option
 *               feed is a single request with no page/size parameters,
 *               and the backend keeps serving the endpoints this relies on
 *               with the agreed caps (options cap, page-size max 100)
 *
 * Run: node --test tests/production-sales-orders-pagination.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  buildSalesOrderOptionsParams,
  isCpoReferenceUnserved,
  normalizeSalesOrderDetail,
  normalizeSalesOrderOption,
  resolveSalesOrderId,
  unwrapApiData,
  withLinkedCpoOption,
} from '../src/production/utils/salesOrderReadModel.js';

const ROOT = join(import.meta.dirname, '..');

const read = (relativePath) => readFileSync(join(ROOT, relativePath), 'utf8');

/* ------------------------------------------------------------------ *
 * Read model — the slim CPO option feed
 * ------------------------------------------------------------------ */

describe('CPO option feed — query contract', () => {
  it('sends no parameters when no search term is given', () => {
    assert.deepEqual(buildSalesOrderOptionsParams(), {});
    assert.deepEqual(buildSalesOrderOptionsParams({}), {});
  });

  it('never sends page or size — the client cannot turn the feed into a paging loop', () => {
    const params = buildSalesOrderOptionsParams({ search: 'Acme', page: 3, size: 10000 });
    assert.deepEqual(params, { search: 'Acme' });
  });

  it('trims the search term and drops blank ones', () => {
    assert.deepEqual(buildSalesOrderOptionsParams({ search: '  SO-2026-000042  ' }), {
      search: 'SO-2026-000042',
    });
    assert.deepEqual(buildSalesOrderOptionsParams({ search: '   ' }), {});
    assert.deepEqual(buildSalesOrderOptionsParams({ search: null }), {});
  });
});

describe('normalizeSalesOrderOption', () => {
  it('maps the server projection (id, soNo, clientId, clientName, orderDate, itemCount)', () => {
    const option = normalizeSalesOrderOption({
      id: 7,
      soNo: 'SO-2026-000007',
      clientId: 42,
      clientName: 'Acme Industries',
      orderDate: '2026-01-05',
      itemCount: 3,
    });

    assert.deepEqual(option, {
      id: '7',
      salesOrderId: 7,
      salesOrderNumber: 'SO-2026-000007',
      customerName: 'Acme Industries',
      customerCode: '42',
      orderDate: '2026-01-05',
      itemCount: 3,
    });
  });

  it('is null-safe and defaults the optional fields', () => {
    assert.equal(normalizeSalesOrderOption(null), null);

    assert.deepEqual(normalizeSalesOrderOption({ soNo: 'SO-2026-000008' }), {
      id: 'SO-2026-000008',
      salesOrderId: null,
      salesOrderNumber: 'SO-2026-000008',
      customerName: '',
      customerCode: '',
      orderDate: '',
      itemCount: 0,
    });
  });

  it('never produces NaN item counts', () => {
    assert.equal(normalizeSalesOrderOption({ id: 1, itemCount: 'n/a' }).itemCount, 0);
    assert.equal(normalizeSalesOrderOption({ id: 1, itemCount: null }).itemCount, 0);
  });
});

describe('normalizeSalesOrderDetail', () => {
  it('maps a full Sales Order with its line items (unchanged item shape)', () => {
    const detail = normalizeSalesOrderDetail({
      id: 9,
      soNo: 'SO-2026-000009',
      clientName: 'Beta Castings',
      orderDate: '2026-02-01',
      itemsCount: 1,
      items: [
        {
          id: 501,
          description: 'Gear Blank',
          sku: 'GB-01',
          qty: 12,
          rate: 250,
          netAmount: 3000,
          uom: 'Nos',
          hsn: '8483',
        },
      ],
    });

    assert.equal(detail.itemCount, 1);
    assert.equal(detail.salesOrderNumber, 'SO-2026-000009');
    assert.deepEqual(detail.items, [
      {
        id: '501',
        itemNo: 1,
        productName: 'Gear Blank',
        productCode: 'GB-01',
        description: 'Gear Blank',
        quantity: 12,
        rate: 250,
        amount: 3000,
        unit: 'Nos',
        hsn: '8483',
      },
    ]);
  });

  it('handles a Sales Order with no items at all', () => {
    const detail = normalizeSalesOrderDetail({ id: 10, soNo: 'SO-2026-000010' });
    assert.deepEqual(detail.items, []);
    assert.equal(detail.itemCount, 0);
  });

  it('returns null for a missing Sales Order', () => {
    assert.equal(normalizeSalesOrderDetail(null), null);
  });
});

/* ------------------------------------------------------------------ *
 * Read model — envelope + CPO reference resolution
 * ------------------------------------------------------------------ */

describe('unwrapApiData', () => {
  it('unwraps the ApiResponse envelope { success, message, data }', () => {
    assert.deepEqual(unwrapApiData({ success: true, message: 'ok', data: [1, 2] }), [1, 2]);
    assert.deepEqual(unwrapApiData({ success: true, data: { id: 1 } }), { id: 1 });
  });

  it('accepts a bare array or object', () => {
    assert.deepEqual(unwrapApiData([1]), [1]);
    assert.deepEqual(unwrapApiData({ content: [] }), { content: [] });
    assert.equal(unwrapApiData(null), null);
  });

  it('returns null for an enveloped empty payload', () => {
    assert.equal(unwrapApiData({ success: true, data: null }), null);
  });
});

describe('resolveSalesOrderId', () => {
  const options = [
    { id: '7', salesOrderId: 7, salesOrderNumber: 'SO-2026-000007' },
    { id: '8', salesOrderId: 8, salesOrderNumber: 'SO-2026-000008' },
  ];

  it('resolves by CPO number (legacy rows store the number, not the id)', () => {
    assert.equal(resolveSalesOrderId(options, 'SO-2026-000008'), 8);
  });

  it('resolves by the string identity and by the numeric Sales Order id', () => {
    assert.equal(resolveSalesOrderId(options, '7'), 7);
    assert.equal(resolveSalesOrderId(options, 7), 7);
  });

  it('falls back to a numeric reference that is not in the option feed yet', () => {
    assert.equal(resolveSalesOrderId([], '123'), 123);
    assert.equal(resolveSalesOrderId([], 123), 123);
  });

  it('never resolves an unknown, non-numeric CPO reference', () => {
    assert.equal(resolveSalesOrderId(options, 'SO-1999-000001'), null);
    assert.equal(resolveSalesOrderId(options, null), null);
    assert.equal(resolveSalesOrderId(options, ''), null);
    assert.equal(resolveSalesOrderId(options, undefined), null);
  });
});

/* ------------------------------------------------------------------ *
 * Linked CPO reference — a saved link stays VISIBLE
 * ------------------------------------------------------------------ *
 * The feed serves only the current row of each revision chain, so a Work Order
 * saved against a since-superseded CPO revision had no matching option and its
 * CPO Reference rendered blank. The linked CPO is read by id and added as ONE
 * extra option (or a saved-reference fallback), never replacing the feed and
 * never rewriting the saved value.
 * ------------------------------------------------------------------ */

describe('isCpoReferenceUnserved', () => {
  // Latest revision of CPO-2026-000006 only: the feed never carries id 7.
  const feed = [
    { id: '9', salesOrderId: 9, salesOrderNumber: 'CPO-2026-000006(2)' },
    { id: '6', salesOrderId: 6, salesOrderNumber: 'CPO-2026-000005' },
  ];

  it('flags a superseded revision id the feed cannot serve', () => {
    assert.equal(isCpoReferenceUnserved(feed, '7'), true);
    assert.equal(isCpoReferenceUnserved(feed, 7), true);
  });

  it('is quiet when the feed already serves the reference', () => {
    assert.equal(isCpoReferenceUnserved(feed, '9'), false);
    assert.equal(isCpoReferenceUnserved(feed, 9), false);
    assert.equal(isCpoReferenceUnserved(feed, 'CPO-2026-000005'), false);
  });

  it('treats an absent reference as served (nothing to add)', () => {
    assert.equal(isCpoReferenceUnserved(feed, ''), false);
    assert.equal(isCpoReferenceUnserved(feed, null), false);
    assert.equal(isCpoReferenceUnserved([], undefined), false);
  });
});

describe('withLinkedCpoOption', () => {
  const feed = [
    { id: '9', salesOrderId: 9, salesOrderNumber: 'CPO-2026-000006(2)', customerName: 'Apex Industries', itemCount: 2 },
    { id: '6', salesOrderId: 6, salesOrderNumber: 'CPO-2026-000005', customerName: 'Apex Industries', itemCount: 1 },
  ];
  // GET /sales-orders/7 — the historical revision the Work Order was raised from.
  const fetched = {
    id: '7',
    salesOrderId: 7,
    salesOrderNumber: 'CPO-2026-000006',
    customerName: 'Apex Industries',
    customerCode: '1',
    orderDate: '2026-10-09',
    itemCount: 1,
  };

  it('adds the fetched historical CPO as the first option, keeping the saved value selectable', () => {
    const options = withLinkedCpoOption({ options: feed, value: '7', option: fetched });
    assert.equal(options.length, 3);
    assert.equal(options[0].id, '7', 'the saved reference stays the option value');
    assert.equal(options[0].salesOrderNumber, 'CPO-2026-000006');
    assert.equal(options[0].itemCount, 1);
    assert.deepEqual(options.slice(1), feed, 'the real feed rows are untouched');
  });

  it('leaves the feed untouched (same array) when it already serves the value', () => {
    const options = withLinkedCpoOption({ options: feed, value: '9', option: fetched });
    assert.equal(options, feed);
    assert.equal(options.length, 2);
    assert.equal(new Set(options.map((o) => o.id)).size, options.length, 'no duplicate option');
  });

  it('falls back to the SAVED reference when the CPO cannot be read', () => {
    const options = withLinkedCpoOption({
      options: feed,
      value: '7',
      option: null,
      fallbackLabel: 'CPO-2026-000006',
    });
    assert.equal(options[0].id, '7');
    assert.equal(options[0].salesOrderNumber, 'CPO-2026-000006');
    assert.equal(options[0].salesOrderId, null, 'no CPO data is invented');
    // null = "no CPO data": the option prints no item count and the form shows
    // no detail line, so a failed read never claims "0 items".
    assert.equal(options[0].itemCount, null);
    assert.notEqual(options[0].itemCount, 0, 'a fabricated zero is never shown');
  });

  it('uses the raw saved value as the fallback label when no number is known', () => {
    const options = withLinkedCpoOption({ options: feed, value: '7', option: null });
    assert.equal(options[0].salesOrderNumber, '7');
  });

  it('ignores a fetched option that belongs to a different CPO', () => {
    const other = { ...fetched, id: '8', salesOrderId: 8, salesOrderNumber: 'CPO-2026-000007' };
    const options = withLinkedCpoOption({ options: feed, value: '7', option: other });
    assert.equal(options[0].id, '7');
    assert.equal(options[0].salesOrderNumber, '7', 'falls back rather than showing the wrong CPO');
  });

  it('does nothing for an empty reference or a missing list', () => {
    assert.equal(withLinkedCpoOption({ options: feed, value: '' }).length, 2);
    assert.deepEqual(withLinkedCpoOption({ options: null, value: null }), []);
  });
});

/* ------------------------------------------------------------------ *
 * Contract — no bulk Sales Order download survives
 * ------------------------------------------------------------------ */

describe('Production Sales Order fetching contract', () => {
  const context = read('src/production/context/SalesOrdersContext.jsx');

  it('contains no page-walking loop', () => {
    assert.equal(/\bwhile\s*\(/.test(context), false, 'no while-loop may page through Sales Orders');
    assert.equal(/for\s*\(\s*;\s*;/.test(context), false, 'no for(;;) loop may page through Sales Orders');
    assert.equal(/totalPages/.test(context), false, 'the context must not derive/loop over totalPages');
  });

  it('never requests the full Sales Order list', () => {
    assert.equal(/\bsize\s*:/.test(context), false, 'the CPO feed must not send a page size');
    assert.equal(/api\.get\(\s*['"]\/sales-orders['"]/.test(context), false, 'the context must not call the full list endpoint');
  });

  it('reads the slim CPO option feed and single Sales Orders only', () => {
    assert.ok(context.includes("'/sales-orders/options'"), 'uses GET /sales-orders/options');
    assert.ok(context.includes('/sales-orders/${salesOrderId}'), 'fetches one Sales Order by id on demand');
    assert.ok(/getSalesOrderById/.test(context), 'exposes an on-demand full Sales Order fetch');
  });

  it('guards against duplicate in-flight option requests', () => {
    assert.ok(/optionsRequest|request\.current/.test(context), 'has an in-flight request guard');
  });

  it('keeps the slim option mapping out of the component (pure, unit tested)', () => {
    assert.ok(context.includes('salesOrderReadModel'), 'context imports the pure read model');
  });
});

describe('Backend endpoints this flow depends on', () => {
  it('serves the CPO option feed', () => {
    const controller = read('erp-backend/src/main/java/com/vishatech/erp/controller/SalesOrderController.java');
    assert.ok(controller.includes('@GetMapping("/options")'), 'GET /sales-orders/options exists');
    assert.ok(controller.includes('salesOrderService.listOptions(search)'), 'delegates to listOptions');
  });

  it('caps the CPO option feed server-side', () => {
    const service = read('erp-backend/src/main/java/com/vishatech/erp/service/SalesOrderService.java');
    assert.ok(/MAX_CPO_OPTIONS\s*=\s*\d+/.test(service), 'the feed has a hard server-side cap');
    assert.ok(service.includes('PageRequest.of(0, MAX_CPO_OPTIONS'), 'the feed fetches a single capped page');
  });

  it('defaults the Work Order list to 25 rows per page', () => {
    const controller = read(
      'erp-backend/src/main/java/com/vishatech/erp/controller/production/ProductionOrderController.java'
    );
    assert.ok(controller.includes('@RequestParam(defaultValue = "25") int size'), 'default page size is 25');
  });

  it('caps the Work Order page size at 100 on the server', () => {
    const service = read('erp-backend/src/main/java/com/vishatech/erp/service/production/ProductionOrderService.java');
    assert.ok(/Math\.min\(size,\s*100\)/.test(service), 'page size is clamped to 100');
    assert.ok(/totalElements/.test(service) && /totalPages/.test(service), 'pagination metadata is returned');
  });
});
