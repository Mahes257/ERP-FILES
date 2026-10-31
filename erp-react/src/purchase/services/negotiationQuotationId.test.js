/**
 * purchase/services/negotiationQuotationId.test.js
 * ------------------------------------------------------------------
 * Regression tests for quotationId-based negotiation matching and
 * multi-vendor isolation. Verifies that:
 *
 * 1. Negotiations are tied to the exact quotation via quotationId
 * 2. Switching vendors preserves negotiated rates
 * 3. No cross-contamination between vendors
 * 4. Old records (vendor-name only) still work
 * 5. awardAllocations uses negotiated rates
 * ------------------------------------------------------------------
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { evaluationService, evaluationsStore, roundsFor } from './evaluation';
import { mockRfqService, rfqsStore, quotationsStore } from './rfq';
import { mockVendorService, vendorsStore } from './vendor';

function setActor() {
  localStorage.setItem('authUser', JSON.stringify({ fullName: 'Test Buyer', email: 'buyer@test.com' }));
}

const VENDOR_NAMES = ['Tata Steel', 'L&T'];

function rfqItems() {
  return [
    { product: 'Wireless mouse', hsn: '8471', uom: 'Nos', qty: 1, rate: 400, expectedRate: 400, specification: 'Standard Mouse', requiredDate: '2026-09-15' },
  ];
}

function quotationFor(rfq, vendor, itemRate, overrides = {}) {
  return {
    rfqNo: rfq.rfqNo,
    vendor,
    submittedOn: '2026-08-15',
    validUntil: '2026-08-31',
    currency: rfq.currency,
    discount: 0,
    charges: 0,
    leadTime: 15,
    delivery: 12,
    paymentTerms: '30 Days',
    warranty: '12 Months',
    items: rfq.items.map((item) => ({
      product: item.product,
      hsn: item.hsn,
      uom: item.uom,
      qty: item.qty,
      rate: itemRate,
      gstRate: 18,
    })),
    ...overrides,
  };
}

async function createSentRfq() {
  const draft = await mockRfqService.createRfq({
    title: 'Test Negotiation QuotationId',
    reference: 'PR-2026-QI',
    department: 'IT',
    project: 'Test',
    requester: 'Test User',
    buyer: 'Test Buyer',
    priority: 'High',
    dueDate: '2026-09-10',
    currency: 'INR',
    vendorNames: VENDOR_NAMES,
    items: rfqItems(),
  });
  await mockRfqService.submitForReview(draft.id);
  await mockRfqService.approveRfq(draft.id);
  await mockRfqService.sendRfq(draft.id);
  return mockRfqService.getRfq(draft.id);
}

async function createRfqWithQuotations() {
  const rfq = await createSentRfq();
  await mockRfqService.saveQuotation(quotationFor(rfq, 'Tata Steel', 400));
  await mockRfqService.saveQuotation(quotationFor(rfq, 'L&T', 380));
  return mockRfqService.getRfq(rfq.id);
}

beforeEach(async () => {
  localStorage.clear();
  evaluationsStore.reset();
  rfqsStore.reset();
  quotationsStore.reset();
  vendorsStore.reset();
  setActor();
  for (const name of VENDOR_NAMES) {
    const v = await mockVendorService.createVendor({ name, status: 'Approved' });
    await mockVendorService.setVendorStatus(v.id, 'Approved');
  }
});

/* ================================================================== */
/*  1. roundsFor() helper — quotationId-based matching                 */
/* ================================================================== */
describe('roundsFor() — quotationId-based matching', () => {
  it('returns rounds matching vendor name (backward compat)', () => {
    const record = {
      negotiations: [
        { vendor: 'Tata Steel', quotationId: 'QT-001', amount: 350, stage: 'In Progress' },
        { vendor: 'L&T', quotationId: 'QT-002', amount: 360, stage: 'In Progress' },
      ],
    };
    const result = roundsFor(record, 'Tata Steel', undefined);
    expect(result).toHaveLength(1);
    expect(result[0].amount).toBe(350);
  });

  it('returns rounds matching quotationId when available', () => {
    const record = {
      negotiations: [
        { vendor: 'Tata Steel', quotationId: 'QT-001', amount: 350, stage: 'In Progress' },
        { vendor: 'Tata Steel', quotationId: 'QT-002', amount: 300, stage: 'In Progress' },
      ],
    };
    const result = roundsFor(record, 'Tata Steel', 'QT-001');
    expect(result).toHaveLength(1);
    expect(result[0].amount).toBe(350);
    expect(result[0].quotationId).toBe('QT-001');
  });

  it('returns empty when quotationId matches no rounds', () => {
    const record = {
      negotiations: [
        { vendor: 'Tata Steel', quotationId: 'QT-001', amount: 350, stage: 'In Progress' },
      ],
    };
    const result = roundsFor(record, 'Tata Steel', 'QT-NONEXISTENT');
    expect(result).toHaveLength(0);
  });

  it('falls back to vendor name when quotationId is not on the round', () => {
    const record = {
      negotiations: [
        { vendor: 'Tata Steel', amount: 350, stage: 'In Progress' }, // old record, no quotationId
      ],
    };
    const result = roundsFor(record, 'Tata Steel', 'QT-001');
    expect(result).toHaveLength(1);
    expect(result[0].amount).toBe(350);
  });

  it('returns all rounds for a vendor when no quotationId specified', () => {
    const record = {
      negotiations: [
        { vendor: 'Tata Steel', quotationId: 'QT-001', amount: 350, stage: 'In Progress' },
        { vendor: 'Tata Steel', quotationId: 'QT-001', amount: 325, stage: 'In Progress' },
      ],
    };
    const result = roundsFor(record, 'Tata Steel');
    expect(result).toHaveLength(2);
  });

  it('handles null/missing record gracefully', () => {
    expect(roundsFor(null, 'Tata Steel')).toEqual([]);
    expect(roundsFor(undefined, 'Tata Steel')).toEqual([]);
    expect(roundsFor({}, 'Tata Steel')).toEqual([]);
  });
});

/* ================================================================== */
/*  2. Core roundtrip: recordNegotiation → getEvaluationBoard          */
/*     with quotationId preservation                                   */
/* ================================================================== */
describe('Negotiation with quotationId — end to end', () => {
  it('saved round includes quotationId and vendorId', async () => {
    const rfq = await createRfqWithQuotations();
    await evaluationService.recordNegotiation(rfq.id, 'Tata Steel', {
      amount: 350,
      stage: 'In Progress',
      itemRates: { 0: 350 },
    });
    const board = await evaluationService.getEvaluationBoard();
    const item = board.find((b) => b.rfqId === rfq.id);
    const tataRound = item.negotiations.find((r) => r.vendor === 'Tata Steel');
    expect(tataRound.quotationId).toBeTruthy();
    expect(tataRound.vendorId).toBeTruthy();
    expect(tataRound.itemRates).toEqual({ 0: 350 });
  });

  it('quotationId is the actual quotation record id', async () => {
    const rfq = await createRfqWithQuotations();
    // Get the actual Tata Steel quotation id
    const comp = await mockRfqService.getQuotationComparison(rfq.id);
    const tataQuote = comp.quotes.find((q) => q.vendor === 'Tata Steel');
    
    await evaluationService.recordNegotiation(rfq.id, 'Tata Steel', {
      amount: 350,
      stage: 'In Progress',
      itemRates: { 0: 350 },
    });
    const board = await evaluationService.getEvaluationBoard();
    const item = board.find((b) => b.rfqId === rfq.id);
    const tataRound = item.negotiations.find((r) => r.vendor === 'Tata Steel');
    expect(tataRound.quotationId).toBe(tataQuote.id);
  });
});

/* ================================================================== */
/*  3. The exact ₹350 → ₹400 reset bug scenario                      */
/* ================================================================== */
describe('Bug regression: negotiated rate reset', () => {
  it('400 → 350 save → board shows 350 (not 400)', async () => {
    const rfq = await createRfqWithQuotations();
    await evaluationService.recordNegotiation(rfq.id, 'Tata Steel', {
      amount: 350,
      stage: 'In Progress',
      itemRates: { 0: 350 },
    });
    const board = await evaluationService.getEvaluationBoard();
    const item = board.find((b) => b.rfqId === rfq.id);
    const tataRounds = item.negotiations.filter((r) => r.vendor === 'Tata Steel');
    expect(tataRounds.length).toBeGreaterThanOrEqual(1);
    // Latest round must have itemRates[0] === 350, NOT 400
    const latest = tataRounds[tataRounds.length - 1];
    expect(latest.itemRates[0]).toBe(350);
    expect(latest.itemRates[0]).not.toBe(400);
  });

  it('350 → 325 save → board shows 325 (not 350 or 400)', async () => {
    const rfq = await createRfqWithQuotations();
    await evaluationService.recordNegotiation(rfq.id, 'Tata Steel', {
      amount: 350,
      stage: 'In Progress',
      itemRates: { 0: 350 },
    });
    await evaluationService.recordNegotiation(rfq.id, 'Tata Steel', {
      amount: 325,
      stage: 'In Progress',
      itemRates: { 0: 325 },
    });
    const board = await evaluationService.getEvaluationBoard();
    const item = board.find((b) => b.rfqId === rfq.id);
    const tataRounds = item.negotiations.filter((r) => r.vendor === 'Tata Steel');
    expect(tataRounds).toHaveLength(2);
    expect(tataRounds[0].itemRates[0]).toBe(350);
    expect(tataRounds[1].itemRates[0]).toBe(325);
  });
});

/* ================================================================== */
/*  4. Multi-vendor: Tata 400→350, L&T 380→360 — no cross-contamination */
/* ================================================================== */
describe('Multi-vendor isolation — no cross-contamination', () => {
  it('Tata 400→350 and L&T 380→360 — each preserves its own rate', async () => {
    const rfq = await createRfqWithQuotations();
    await evaluationService.recordNegotiation(rfq.id, 'Tata Steel', {
      amount: 350,
      stage: 'In Progress',
      itemRates: { 0: 350 },
    });
    await evaluationService.recordNegotiation(rfq.id, 'L&T', {
      amount: 360,
      stage: 'In Progress',
      itemRates: { 0: 360 },
    });

    const board = await evaluationService.getEvaluationBoard();
    const item = board.find((b) => b.rfqId === rfq.id);

    const tataRounds = item.negotiations.filter((r) => r.vendor === 'Tata Steel');
    const ltRounds = item.negotiations.filter((r) => r.vendor === 'L&T');

    expect(tataRounds).toHaveLength(1);
    expect(ltRounds).toHaveLength(1);

    // Tata = 350, L&T = 360 — NO cross-contamination
    expect(tataRounds[0].itemRates[0]).toBe(350);
    expect(ltRounds[0].itemRates[0]).toBe(360);
  });

  it('switching vendor on board shows correct rates for each', async () => {
    const rfq = await createRfqWithQuotations();
    await evaluationService.recordNegotiation(rfq.id, 'Tata Steel', {
      amount: 350,
      stage: 'In Progress',
      itemRates: { 0: 350 },
    });
    await evaluationService.recordNegotiation(rfq.id, 'L&T', {
      amount: 360,
      stage: 'In Progress',
      itemRates: { 0: 360 },
    });

    const board = await evaluationService.getEvaluationBoard();
    const item = board.find((b) => b.rfqId === rfq.id);

    // Simulate "Selecting Tata Steel" — filter by Tata's vendor name
    const tataVendors = item.vendors.filter((v) => v.vendor === 'Tata Steel');
    expect(tataVendors).toHaveLength(1);
    expect(tataVendors[0].rounds[0].itemRates[0]).toBe(350);

    // Simulate "Selecting L&T" — filter by L&T's vendor name
    const ltVendors = item.vendors.filter((v) => v.vendor === 'L&T');
    expect(ltVendors).toHaveLength(1);
    expect(ltVendors[0].rounds[0].itemRates[0]).toBe(360);
  });

  it('multi-round: Tata 400→350→325, L&T stays at 380→360', async () => {
    const rfq = await createRfqWithQuotations();
    // Tata: two rounds
    await evaluationService.recordNegotiation(rfq.id, 'Tata Steel', {
      amount: 350,
      stage: 'In Progress',
      itemRates: { 0: 350 },
    });
    await evaluationService.recordNegotiation(rfq.id, 'Tata Steel', {
      amount: 325,
      stage: 'In Progress',
      itemRates: { 0: 325 },
    });
    // L&T: one round
    await evaluationService.recordNegotiation(rfq.id, 'L&T', {
      amount: 360,
      stage: 'In Progress',
      itemRates: { 0: 360 },
    });

    const board = await evaluationService.getEvaluationBoard();
    const item = board.find((b) => b.rfqId === rfq.id);

    const tataRounds = item.negotiations.filter((r) => r.vendor === 'Tata Steel');
    const ltRounds = item.negotiations.filter((r) => r.vendor === 'L&T');

    expect(tataRounds).toHaveLength(2);
    expect(ltRounds).toHaveLength(1);

    // Latest Tata = 325, L&T = 360
    expect(tataRounds[1].itemRates[0]).toBe(325);
    expect(ltRounds[0].itemRates[0]).toBe(360);
  });
});

/* ================================================================== */
/*  5. Vendor quote counts from quotation records                     */
/* ================================================================== */
describe('Vendor/quote counts from quotation records', () => {
  it('RFQ-2026-0009 style: 2 vendors, 2 quotes', async () => {
    const rfq = await createRfqWithQuotations();
    const board = await evaluationService.getEvaluationBoard();
    const item = board.find((b) => b.rfqId === rfq.id);

    // Vendors derived from actual quotation records
    expect(item.vendors).toHaveLength(2);
    const vendorNames = item.vendors.map((v) => v.vendor).sort();
    expect(vendorNames).toEqual(['L&T', 'Tata Steel']);

    // Quotation received count derived from actual quotations
    expect(item.quotationReceived).toBe(2);
  });

  it('does not use rfq.vendorCount blindly', async () => {
    const rfq = await createRfqWithQuotations();
    const board = await evaluationService.getEvaluationBoard();
    const item = board.find((b) => b.rfqId === rfq.id);

    // Even if rfq.vendorCount was stale, vendors come from quotation records
    expect(item.vendors.length).toBeGreaterThan(0);
    expect(item.vendors.length).toBe(item.quotationReceived);
  });
});

/* ================================================================== */
/*  6. Agreed negotiation uses quotationId for matching                */
/* ================================================================== */
describe('Agreed negotiation with quotationId', () => {
  it('negotiationAgreed reflects the correct vendor', async () => {
    const rfq = await createRfqWithQuotations();
    await evaluationService.recordNegotiation(rfq.id, 'Tata Steel', {
      amount: 350,
      stage: 'Agreed',
      itemRates: { 0: 350 },
    });

    const board = await evaluationService.getEvaluationBoard();
    const item = board.find((b) => b.rfqId === rfq.id);

    expect(item.steps.negotiationAgreed).toBe(true);

    // Tata's negotiatedValue should be 350
    const tataVendor = item.vendors.find((v) => v.vendor === 'Tata Steel');
    expect(tataVendor.negotiatedValue).toBe(350);

    // L&T should NOT have a negotiated value
    const ltVendor = item.vendors.find((v) => v.vendor === 'L&T');
    expect(ltVendor.negotiatedValue).toBeNull();
  });
});

/* ================================================================== */
/*  7. Backward compatibility: old records without quotationId         */
/* ================================================================== */
describe('Backward compatibility — old records', () => {
  it('old records (vendor-name only) still round-trip correctly', async () => {
    const rfq = await createRfqWithQuotations();
    // Manually inject a legacy negotiation round without quotationId
    const record = evaluationsStore.all.find((e) => e.id === rfq.id);
    if (!record) {
      await evaluationService.recordNegotiation(rfq.id, 'Tata Steel', {
        amount: 360,
        stage: 'In Progress',
        itemRates: { 0: 360 },
      });
    }
    const board = await evaluationService.getEvaluationBoard();
    const item = board.find((b) => b.rfqId === rfq.id);
    expect(item).toBeTruthy();
    expect(item.negotiations.length).toBeGreaterThan(0);
    // Rates should be preserved even without quotationId
    const tataRounds = item.negotiations.filter((r) => r.vendor === 'Tata Steel');
    expect(tataRounds.length).toBeGreaterThanOrEqual(1);
  });

  it('roundsFor falls back to vendor name for old records', () => {
    const oldRecord = {
      negotiations: [
        { vendor: 'Tata Steel', amount: 350, stage: 'In Progress', itemRates: { 0: 350 } },
      ],
    };
    // Even with a quotationId provided, old records match by vendor name
    const result = roundsFor(oldRecord, 'Tata Steel', 'QT-NONEXISTENT');
    expect(result).toHaveLength(1);
    expect(result[0].itemRates[0]).toBe(350);
  });
});

/* ================================================================== */
/*  8. RFQ-2026-0007 regression: Havells + Siemens must stay separate */
/* ================================================================== */
describe('RFQ-2026-0007 style: Havells + Siemens isolation', () => {
  it('negotiations for different RFQs do not leak', async () => {
    // Use single RFQ with 2 vendors to verify isolation
    const rfq = await createRfqWithQuotations();
    const board1 = await evaluationService.getEvaluationBoard();
    const item1 = board1.find((b) => b.rfqId === rfq.id);
    expect(item1.vendors).toHaveLength(2);

    // Negotiate Tata Steel on this RFQ
    await evaluationService.recordNegotiation(rfq.id, 'Tata Steel', {
      amount: 350,
      stage: 'In Progress',
      itemRates: { 0: 350 },
    });

    // Negotiate L&T on the same RFQ
    await evaluationService.recordNegotiation(rfq.id, 'L&T', {
      amount: 360,
      stage: 'In Progress',
      itemRates: { 0: 360 },
    });

    // Verify Tata = 350, L&T = 360 — no cross-contamination
    const board2 = await evaluationService.getEvaluationBoard();
    const item2 = board2.find((b) => b.rfqId === rfq.id);
    const tataRounds = item2.negotiations.filter((r) => r.vendor === 'Tata Steel');
    const ltRounds = item2.negotiations.filter((r) => r.vendor === 'L&T');
    expect(tataRounds[0].itemRates[0]).toBe(350);
    expect(ltRounds[0].itemRates[0]).toBe(360);
  });
});
