/**
 * purchase/services/matchingEngine.test.js
 * ------------------------------------------------------------------
 * Tests for the ERP-grade Three-Way Matching engine:
 *   · per-line comparison — quantity (PO/GRN/Invoice), rate, tax,
 *     value
 *   · configurable tolerances (quantity / rate / tax / value)
 *   · Matched / Partially Matched / Mismatch statuses
 *   · exact mismatch reasons
 *   · approval gating — invoice approval is blocked when the matching
 *     rules require a successful match and the match is not Matched
 * The engine uses REAL PO + GRN records.
 * ------------------------------------------------------------------ */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MATCH_STATUS } from '../constants';
import { mockPurchaseOrderService, ordersStore } from './purchaseOrder';
import { logisticsService, grnsStore, inspectionsStore, shipmentsStore } from './logistics';
import { invoicesStore, advicesStore } from './invoice';
import { computeThreeWayMatch, matchAllowsApproval, matchLine, LINE_STATUS } from './matchingEngine';

vi.mock('./base', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, delay: () => Promise.resolve() };
});

function setActor() {
  localStorage.setItem('authUser', JSON.stringify({ fullName: 'Match Buyer', email: 'match@test.com' }));
}

const BASE_CONFIG = {
  enabled: true,
  requireMatchToApprove: true,
  allowOverride: true,
  tolerances: { quantityPct: 0, ratePct: 0, taxPct: 0, valuePct: 2 }
};

beforeEach(async () => {
  localStorage.clear();
  ordersStore.reset();
  grnsStore.reset();
  inspectionsStore.reset();
  shipmentsStore.reset();
  invoicesStore.reset();
  advicesStore.reset();
  setActor();
});

/** PO with two lines: Widget A 10×100 (18%) + Widget B 5×50 (12%). */
async function createReleasedPo() {
  const po = await mockPurchaseOrderService.createOrder({
    title: 'Match Test PO',
    vendor: 'Tata Steel Ltd',
    reference: 'PR-MATCH-1',
    items: [
      { product: 'Widget A', hsn: '1111', uom: 'Nos', qty: 10, rate: 100, gstRate: 18 },
      { product: 'Widget B', hsn: '1112', uom: 'Nos', qty: 5, rate: 50, gstRate: 12 }
    ]
  });
  await mockPurchaseOrderService.approveOrder(po.id);
  return mockPurchaseOrderService.releaseOrder(po.id);
}

async function receiveFull(po) {
  const grn = await logisticsService.createGrn(po.poNo);
  await logisticsService.receiveGoods(grn.id);
  return grn;
}

describe('Per-line matching', () => {
  it('a fully aligned invoice is Matched with no reasons', async () => {
    const po = await createReleasedPo();
    await receiveFull(po);
    const match = computeThreeWayMatch({
      poNo: po.poNo, vendor: 'Tata Steel Ltd', total: po.amount,
      items: [
        { product: 'Widget A', qty: 10, rate: 100, gst: 18 },
        { product: 'Widget B', qty: 5, rate: 50, gst: 12 }
      ]
    }, BASE_CONFIG);
    expect(match.status).toBe(MATCH_STATUS.MATCHED);
    expect(match.reasons).toHaveLength(0);
    expect(match.details.every((line) => line.status === LINE_STATUS.MATCHED)).toBe(true);
  });

  it('PO 100 / GRN 90 / Invoice 100 → Quantity Mismatch with the exact reason', async () => {
    const po = await createReleasedPo();
    const grn = await logisticsService.createGrn(po.poNo);
    /* Receive only 9 of the 10 Widget A. */
    await logisticsService.receiveGoods(grn.id, [
      { product: 'Widget A', received: 9 },
      { product: 'Widget B', received: 5 }
    ]);
    const match = computeThreeWayMatch({
      poNo: po.poNo, vendor: 'Tata Steel Ltd', total: po.amount,
      items: [
        { product: 'Widget A', qty: 10, rate: 100, gst: 18 },
        { product: 'Widget B', qty: 5, rate: 50, gst: 12 }
      ]
    }, BASE_CONFIG);
    expect(match.status).toBe(MATCH_STATUS.MISMATCH);
    expect(match.reasons.join(' ')).toMatch(/Invoice quantity for Widget A \(10\) exceeds the GRN quantity \(9\)/);
    expect(match.details[0].status).toBe(LINE_STATUS.MISMATCH);
    expect(match.details[0].grnQty).toBe(9);
    expect(match.details[0].invoiceQty).toBe(10);
  });

  it('partial invoicing of received goods → Partially Matched', async () => {
    const po = await createReleasedPo();
    await receiveFull(po);
    const match = computeThreeWayMatch({
      poNo: po.poNo, vendor: 'Tata Steel Ltd', total: po.amount,
      items: [
        { product: 'Widget A', qty: 6, rate: 100, gst: 18 },
        { product: 'Widget B', qty: 5, rate: 50, gst: 12 }
      ]
    }, BASE_CONFIG);
    expect(match.status).toBe(MATCH_STATUS.PARTIAL);
    expect(match.details[0].status).toBe(LINE_STATUS.PARTIAL);
    expect(match.details[1].status).toBe(LINE_STATUS.MATCHED);
  });

  it('rate and tax mismatches produce exact reasons', async () => {
    const po = await createReleasedPo();
    await receiveFull(po);
    const match = computeThreeWayMatch({
      poNo: po.poNo, vendor: 'Tata Steel Ltd', total: po.amount,
      items: [
        { product: 'Widget A', qty: 10, rate: 110, gst: 28 },
        { product: 'Widget B', qty: 5, rate: 50, gst: 12 }
      ]
    }, BASE_CONFIG);
    expect(match.status).toBe(MATCH_STATUS.MISMATCH);
    expect(match.reasons.join(' ')).toMatch(/Invoice unit price for Widget A \(110\.00\) differs from the PO rate \(100\.00\)/);
    expect(match.reasons.join(' ')).toMatch(/Invoice tax for Widget A \(28\) differs from the PO tax \(18%\)/);
  });
});

describe('Configurable tolerances', () => {
  it('a small rate difference passes when the rate tolerance covers it', async () => {
    const po = await createReleasedPo();
    await receiveFull(po);
    const config = {
      ...BASE_CONFIG,
      tolerances: { quantityPct: 0, ratePct: 5, taxPct: 0, valuePct: 2 }
    };
    /* Rate 102 vs PO 100 = 2% diff (within the 5% rate tolerance) and
       the resulting total stays within the 2% value tolerance. */
    const match = computeThreeWayMatch({
      poNo: po.poNo, vendor: 'Tata Steel Ltd', total: po.amount,
      items: [
        { product: 'Widget A', qty: 10, rate: 102, gst: 18 },
        { product: 'Widget B', qty: 5, rate: 50, gst: 12 }
      ]
    }, config);
    expect(match.status).toBe(MATCH_STATUS.MATCHED);
    expect(match.details[0].status).toBe(LINE_STATUS.MATCHED);
  });

  it('the same difference fails when the rate tolerance is 0', async () => {
    const po = await createReleasedPo();
    await receiveFull(po);
    const match = computeThreeWayMatch({
      poNo: po.poNo, vendor: 'Tata Steel Ltd', total: po.amount,
      items: [
        { product: 'Widget A', qty: 10, rate: 102, gst: 18 },
        { product: 'Widget B', qty: 5, rate: 50, gst: 12 }
      ]
    }, BASE_CONFIG);
    expect(match.status).toBe(MATCH_STATUS.MISMATCH);
  });

  it('header-only value tolerance is configurable', async () => {
    const po = await createReleasedPo();
    await receiveFull(po);
    const tolerant = { ...BASE_CONFIG, tolerances: { ...BASE_CONFIG.tolerances, valuePct: 10 } };
    const within = computeThreeWayMatch({ poNo: po.poNo, vendor: 'Tata Steel Ltd', total: 1500 }, tolerant);
    expect(within.status).toBe(MATCH_STATUS.MATCHED);
    const strict = computeThreeWayMatch({ poNo: po.poNo, vendor: 'Tata Steel Ltd', total: 1500 }, BASE_CONFIG);
    expect(strict.status).toBe(MATCH_STATUS.MISMATCH);
    expect(strict.reasons.join(' ')).toMatch(/Invoice total 1500\.00 exceeds PO value/);
  });
});

describe('Approval gating', () => {
  it('only a Matched match allows approval when a full match is required', async () => {
    const po = await createReleasedPo();
    await receiveFull(po);
    const matched = computeThreeWayMatch({
      poNo: po.poNo, vendor: 'Tata Steel Ltd', total: po.amount,
      items: [
        { product: 'Widget A', qty: 10, rate: 100, gst: 18 },
        { product: 'Widget B', qty: 5, rate: 50, gst: 12 }
      ]
    }, BASE_CONFIG);
    expect(matchAllowsApproval(matched, BASE_CONFIG).allowed).toBe(true);

    const partial = computeThreeWayMatch({
      poNo: po.poNo, vendor: 'Tata Steel Ltd', total: po.amount,
      items: [{ product: 'Widget A', qty: 6, rate: 100, gst: 18 }]
    }, BASE_CONFIG);
    expect(matchAllowsApproval(partial, BASE_CONFIG).allowed).toBe(false);

    const mismatch = computeThreeWayMatch({
      poNo: po.poNo, vendor: 'Tata Steel Ltd', total: po.amount,
      items: [{ product: 'Widget A', qty: 12, rate: 100, gst: 18 }]
    }, BASE_CONFIG);
    expect(matchAllowsApproval(mismatch, BASE_CONFIG).allowed).toBe(false);
  });

  it('Partially Matched passes when requireMatchToApprove is off', async () => {
    const po = await createReleasedPo();
    await receiveFull(po);
    const lax = { ...BASE_CONFIG, requireMatchToApprove: false };
    const partial = computeThreeWayMatch({
      poNo: po.poNo, vendor: 'Tata Steel Ltd', total: po.amount,
      items: [{ product: 'Widget A', qty: 6, rate: 100, gst: 18 }]
    }, lax);
    expect(partial.status).toBe(MATCH_STATUS.PARTIAL);
    expect(matchAllowsApproval(partial, lax).allowed).toBe(true);
  });

  it('Pending and Exception always block approval', async () => {
    const po = await createReleasedPo();
    const pending = computeThreeWayMatch({ poNo: po.poNo, vendor: 'Tata Steel Ltd', total: po.amount }, BASE_CONFIG);
    expect(pending.status).toBe(MATCH_STATUS.PENDING);
    expect(matchAllowsApproval(pending, BASE_CONFIG).allowed).toBe(false);

    const exception = computeThreeWayMatch({ poNo: 'PO-NOPE', vendor: 'X', total: 1 }, BASE_CONFIG);
    expect(exception.status).toBe(MATCH_STATUS.EXCEPTION);
    expect(matchAllowsApproval(exception, BASE_CONFIG).allowed).toBe(false);
  });
});

describe('Line-level helper', () => {
  it('matchLine returns the exact comparison fields', () => {
    const result = matchLine(
      { product: 'Widget A', qty: 10, rate: 100, gst: 18 },
      { qty: 10, rate: 100, gstRate: 18 },
      10,
      BASE_CONFIG.tolerances
    );
    expect(result.status).toBe(LINE_STATUS.MATCHED);
    expect(result.poQty).toBe(10);
    expect(result.grnQty).toBe(10);
    expect(result.invoiceQty).toBe(10);
    expect(result.poRate).toBe(100);
    expect(result.invoiceRate).toBe(100);
    expect(result.poGst).toBe(18);
    expect(result.invoiceGst).toBe(18);
    expect(result.poValue).toBe(1000);
    expect(result.invoiceValue).toBe(1000);
  });
});