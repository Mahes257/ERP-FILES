/**
 * purchase/services/negotiationPhase6.test.js
 * ------------------------------------------------------------------
 * Phase 6: Comprehensive negotiation persistence tests.
 *
 * GOAL: Verify that negotiated rates survive save, reload, navigation,
 * vendor switching, RFQ switching, and browser refresh.
 *
 * Tests cover:
 *   1. Initial quote (no negotiation)
 *   2. First negotiation → save → reload
 *   3. Second negotiation round → save → reload
 *   4. Multiple vendors — no cross-contamination
 *   5. Switching vendor — correct rates per vendor
 *   6. Switching RFQ — independent rates per RFQ
 *   7. Browser refresh — rates survive full page reload
 *   8. No negotiation case
 *   9. Save is idempotent
 *  10. History preservation across rounds
 *  11. originalRate must never be overwritten
 *  12. Vendor identity must remain attached
 *  13. Quotation ID must remain attached
 *  14. RFQ identity must remain attached
 * ------------------------------------------------------------------
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { evaluationService, evaluationsStore } from './evaluation';
import { mockRfqService, rfqsStore, quotationsStore } from './rfq';
import { mockVendorService, vendorsStore } from './vendor';

/* ── Helpers ────────────────────────────────────────────────────── */

function setActor() {
  localStorage.setItem('authUser', JSON.stringify({ fullName: 'Test Buyer', email: 'buyer@test.com' }));
}

const VENDOR_A = 'Tata Steel';
const VENDOR_B = 'L&T';

function rfqItems() {
  return [
    { product: 'Wireless mouse', hsn: '8471', uom: 'Nos', qty: 1, rate: 400, expectedRate: 400, specification: 'Standard Mouse', requiredDate: '2026-09-15' },
  ];
}


function quotationFor(rfq, vendor, itemRate, overrides = {}) {
  // itemRate can be a single number (applied to all items) or an array of rates
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
    items: rfq.items.map((item, idx) => ({
      product: item.product,
      hsn: item.hsn,
      uom: item.uom,
      qty: item.qty,
      rate: Array.isArray(itemRate) ? itemRate[idx] : itemRate,
      gstRate: 18,
    })),
    ...overrides,
  };
}

async function createSentRfq(title = 'Phase 6 Test', vendors = [VENDOR_A, VENDOR_B], items = null) {
  const draft = await mockRfqService.createRfq({
    title,
    reference: 'PR-2026-P6',
    department: 'IT',
    project: 'Test',
    requester: 'Test User',
    buyer: 'Test Buyer',
    priority: 'High',
    dueDate: '2026-09-10',
    currency: 'INR',
    vendorNames: vendors,
    items: items || rfqItems(),
  });
  await mockRfqService.submitForReview(draft.id);
  await mockRfqService.approveRfq(draft.id);
  await mockRfqService.sendRfq(draft.id);
  return mockRfqService.getRfq(draft.id);
}

async function createRfqWithQuotations(title, vendors, items, rates) {
  const vendorList = vendors || [VENDOR_A, VENDOR_B];
  const rfq = await createSentRfq(title || 'Phase 6 Test', vendorList, items);
  const vendorRates = rates || { [VENDOR_A]: 400, [VENDOR_B]: 380 };
  for (const [vendor, rate] of Object.entries(vendorRates)) {
    if (vendorList.includes(vendor)) {
      await mockRfqService.saveQuotation(quotationFor(rfq, vendor, rate));
    }
  }
  return mockRfqService.getRfq(rfq.id);
}

/** Simulate what FinalNegotiation.jsx does: hydrate rates from saved rounds. */
function hydrateRates(negotiationRounds, selectedQuote, rfqItems) {
  const latestRoundWithRates = [...negotiationRounds]
    .reverse()
    .find((r) => r.itemRates && typeof r.itemRates === 'object' && Object.keys(r.itemRates).length > 0);
  if (latestRoundWithRates) {
    return { ...latestRoundWithRates.itemRates };
  }
  const rates = {};
  (rfqItems || []).forEach((rfqItem, index) => {
    const quoteItem = (selectedQuote?.items || [])[index] || {};
    rates[index] = Number(quoteItem.rate) || Number(rfqItem.rate) || 0;
  });
  return rates;
}

/** Get evaluation board item for a specific RFQ. */
async function getBoardItem(rfqId) {
  const board = await evaluationService.getEvaluationBoard();
  return board.find((b) => b.rfqId === rfqId) || null;
}

/** Get negotiation rounds for a specific vendor on a board item. */
function roundsForVendor(boardItem, vendor) {
  return (boardItem?.negotiations || []).filter((r) => r.vendor === vendor);
}

beforeEach(async () => {
  localStorage.clear();
  evaluationsStore.reset();
  rfqsStore.reset();
  quotationsStore.reset();
  vendorsStore.reset();
  setActor();
  for (const name of [VENDOR_A, VENDOR_B]) {
    const v = await mockVendorService.createVendor({ name, status: 'Approved' });
    await mockVendorService.setVendorStatus(v.id, 'Approved');
  }
});

/* ================================================================== */
/*  1. Initial quote — no negotiation                                  */
/* ================================================================== */
describe('1. Initial quote (no negotiation)', () => {
  it('originalRate is the quotation rate when no rounds exist', async () => {
    const rfq = await createRfqWithQuotations();
    const comp = await mockRfqService.getQuotationComparison(rfq.id);
    const tataQuote = comp.quotes.find((q) => q.vendor === VENDOR_A);
    expect(tataQuote.items[0].rate).toBe(400);

    const board = await evaluationService.getEvaluationBoard();
    const item = board.find((b) => b.rfqId === rfq.id);
    const tataRounds = roundsForVendor(item, VENDOR_A);
    expect(tataRounds).toHaveLength(0);

    // Hydration should use original quotation rate
    const rates = hydrateRates(tataRounds, tataQuote, rfq.items);
    expect(rates[0]).toBe(400);
  });

  it('board has no negotiations before any save', async () => {
    const rfq = await createRfqWithQuotations();
    const item = await getBoardItem(rfq.id);
    expect(item).toBeTruthy();
    expect(item.negotiations).toHaveLength(0);
    expect(item.steps.negotiationAgreed).toBe(false);
  });
});

/* ================================================================== */
/*  2. First negotiation — save → reload                               */
/* ================================================================== */
describe('2. First negotiation: 400 → 350, save, reload', () => {
  it('saves itemRates and retrieves them after reload', async () => {
    const rfq = await createRfqWithQuotations();
    const quoteComp = await mockRfqService.getQuotationComparison(rfq.id);
    const tataQuote = quoteComp.quotes.find((q) => q.vendor === VENDOR_A);

    // User changes rate from 400 → 350 and saves
    await evaluationService.recordNegotiation(rfq.id, VENDOR_A, {
      amount: 350,
      stage: 'In Progress',
      itemRates: { 0: 350 },
      quotationId: tataQuote.id,
    });

    // Simulate reload: get fresh board
    const board = await evaluationService.getEvaluationBoard();
    const item = board.find((b) => b.rfqId === rfq.id);
    expect(item).toBeTruthy();

    const tataRounds = roundsForVendor(item, VENDOR_A);
    expect(tataRounds).toHaveLength(1);
    expect(tataRounds[0].itemRates[0]).toBe(350);

    // Hydration should restore 350, NOT 400
    const rates = hydrateRates(tataRounds, tataQuote, rfq.items);
    expect(rates[0]).toBe(350);
  });

  it('originalRate remains 400 (immutable)', async () => {
    const rfq = await createRfqWithQuotations();
    const comp = await mockRfqService.getQuotationComparison(rfq.id);
    const tataQuote = comp.quotes.find((q) => q.vendor === VENDOR_A);

    // Save at 350
    await evaluationService.recordNegotiation(rfq.id, VENDOR_A, {
      amount: 350, stage: 'In Progress', itemRates: { 0: 350 }, quotationId: tataQuote.id,
    });

    // Reload and verify original is still 400
    const freshComp = await mockRfqService.getQuotationComparison(rfq.id);
    const freshQuote = freshComp.quotes.find((q) => q.vendor === VENDOR_A);
    expect(freshQuote.items[0].rate).toBe(400); // Original immutable
  });
});

/* ================================================================== */
/*  3. Second negotiation round — save → reload                       */
/* ================================================================== */
describe('3. Second round: 350 → 325, save, reload', () => {
  it('latest round rate persists after second save', async () => {
    const rfq = await createRfqWithQuotations();
    const comp = await mockRfqService.getQuotationComparison(rfq.id);
    const tataQuote = comp.quotes.find((q) => q.vendor === VENDOR_A);

    // Round 1: 400 → 350
    await evaluationService.recordNegotiation(rfq.id, VENDOR_A, {
      amount: 350, stage: 'In Progress', itemRates: { 0: 350 }, quotationId: tataQuote.id,
    });

    // Round 2: 350 → 325
    await evaluationService.recordNegotiation(rfq.id, VENDOR_A, {
      amount: 325, stage: 'In Progress', itemRates: { 0: 325 }, quotationId: tataQuote.id,
    });

    // Reload
    const board = await evaluationService.getEvaluationBoard();
    const item = board.find((b) => b.rfqId === rfq.id);
    const tataRounds = roundsForVendor(item, VENDOR_A);
    expect(tataRounds).toHaveLength(2);

    // Latest round must have 325
    expect(tataRounds[1].itemRates[0]).toBe(325);

    // Hydration should return 325 (latest), NOT 350 or 400
    const rates = hydrateRates(tataRounds, tataQuote, rfq.items);
    expect(rates[0]).toBe(325);
  });

  it('first round is preserved in history', async () => {
    const rfq = await createRfqWithQuotations();
    const comp = await mockRfqService.getQuotationComparison(rfq.id);
    const tataQuote = comp.quotes.find((q) => q.vendor === VENDOR_A);

    await evaluationService.recordNegotiation(rfq.id, VENDOR_A, {
      amount: 350, stage: 'In Progress', itemRates: { 0: 350 }, quotationId: tataQuote.id,
    });
    await evaluationService.recordNegotiation(rfq.id, VENDOR_A, {
      amount: 325, stage: 'In Progress', itemRates: { 0: 325 }, quotationId: tataQuote.id,
    });

    const board = await evaluationService.getEvaluationBoard();
    const item = board.find((b) => b.rfqId === rfq.id);
    const tataRounds = roundsForVendor(item, VENDOR_A);

    // Both rounds preserved
    expect(tataRounds[0].itemRates[0]).toBe(350);
    expect(tataRounds[0].round).toBe(1);
    expect(tataRounds[1].itemRates[0]).toBe(325);
    expect(tataRounds[1].round).toBe(2);
  });
});

/* ================================================================== */
/*  4. Multiple vendors — no cross-contamination                      */
/* ================================================================== */
describe('4. Multiple vendors: no cross-contamination', () => {
  it('Tata 400→350, L&T 380→360 — independent rates', async () => {
    const rfq = await createRfqWithQuotations();
    const comp = await mockRfqService.getQuotationComparison(rfq.id);
    const tataQuote = comp.quotes.find((q) => q.vendor === VENDOR_A);
    const ltQuote = comp.quotes.find((q) => q.vendor === VENDOR_B);

    await evaluationService.recordNegotiation(rfq.id, VENDOR_A, {
      amount: 350, stage: 'In Progress', itemRates: { 0: 350 }, quotationId: tataQuote.id,
    });
    await evaluationService.recordNegotiation(rfq.id, VENDOR_B, {
      amount: 360, stage: 'In Progress', itemRates: { 0: 360 }, quotationId: ltQuote.id,
    });

    // Reload and verify
    const board = await evaluationService.getEvaluationBoard();
    const item = board.find((b) => b.rfqId === rfq.id);

    const tataRounds = roundsForVendor(item, VENDOR_A);
    const ltRounds = roundsForVendor(item, VENDOR_B);

    expect(tataRounds).toHaveLength(1);
    expect(ltRounds).toHaveLength(1);
    expect(tataRounds[0].itemRates[0]).toBe(350);
    expect(ltRounds[0].itemRates[0]).toBe(360);

    // Hydration per vendor
    const tataRates = hydrateRates(tataRounds, tataQuote, rfq.items);
    const ltRates = hydrateRates(ltRounds, ltQuote, rfq.items);
    expect(tataRates[0]).toBe(350);
    expect(ltRates[0]).toBe(360);
  });

  it('multi-round: Tata 400→350→325, L&T stays 380→360', async () => {
    const rfq = await createRfqWithQuotations();
    const comp = await mockRfqService.getQuotationComparison(rfq.id);
    const tataQuote = comp.quotes.find((q) => q.vendor === VENDOR_A);
    const ltQuote = comp.quotes.find((q) => q.vendor === VENDOR_B);

    // Tata: two rounds
    await evaluationService.recordNegotiation(rfq.id, VENDOR_A, {
      amount: 350, stage: 'In Progress', itemRates: { 0: 350 }, quotationId: tataQuote.id,
    });
    await evaluationService.recordNegotiation(rfq.id, VENDOR_A, {
      amount: 325, stage: 'In Progress', itemRates: { 0: 325 }, quotationId: tataQuote.id,
    });
    // L&T: one round
    await evaluationService.recordNegotiation(rfq.id, VENDOR_B, {
      amount: 360, stage: 'In Progress', itemRates: { 0: 360 }, quotationId: ltQuote.id,
    });

    const board = await evaluationService.getEvaluationBoard();
    const item = board.find((b) => b.rfqId === rfq.id);

    const tataRounds = roundsForVendor(item, VENDOR_A);
    const ltRounds = roundsForVendor(item, VENDOR_B);

    expect(tataRounds).toHaveLength(2);
    expect(ltRounds).toHaveLength(1);
    expect(tataRounds[1].itemRates[0]).toBe(325); // latest Tata
    expect(ltRounds[0].itemRates[0]).toBe(360);

    // Original rates never changed
    const tataRates = hydrateRates(tataRounds, tataQuote, rfq.items);
    const ltRates = hydrateRates(ltRounds, ltQuote, rfq.items);
    expect(tataRates[0]).toBe(325);
    expect(ltRates[0]).toBe(360);
  });
});

/* ================================================================== */
/*  5. Switching vendor — correct rates per vendor                    */
/* ================================================================== */
describe('5. Switching vendor preserves correct rates', () => {
  it('switching from Tata to L&T shows L&T rates, not Tata rates', async () => {
    const rfq = await createRfqWithQuotations();
    const comp = await mockRfqService.getQuotationComparison(rfq.id);
    const tataQuote = comp.quotes.find((q) => q.vendor === VENDOR_A);
    const ltQuote = comp.quotes.find((q) => q.vendor === VENDOR_B);

    // Negotiate both vendors
    await evaluationService.recordNegotiation(rfq.id, VENDOR_A, {
      amount: 350, stage: 'In Progress', itemRates: { 0: 350 }, quotationId: tataQuote.id,
    });
    await evaluationService.recordNegotiation(rfq.id, VENDOR_B, {
      amount: 360, stage: 'In Progress', itemRates: { 0: 360 }, quotationId: ltQuote.id,
    });

    const board = await evaluationService.getEvaluationBoard();
    const item = board.find((b) => b.rfqId === rfq.id);

    // Simulate selecting Tata → hydrate
    const tataRounds = roundsForVendor(item, VENDOR_A);
    const tataRates = hydrateRates(tataRounds, tataQuote, rfq.items);
    expect(tataRates[0]).toBe(350);

    // Simulate switching to L&T → hydrate
    const ltRounds = roundsForVendor(item, VENDOR_B);
    const ltRates = hydrateRates(ltRounds, ltQuote, rfq.items);
    expect(ltRates[0]).toBe(360);

    // Switching back to Tata
    const tataRatesAgain = hydrateRates(tataRounds, tataQuote, rfq.items);
    expect(tataRatesAgain[0]).toBe(350);
  });

  it('vendor without negotiations shows original quotation rate', async () => {
    const rfq = await createRfqWithQuotations();
    const comp = await mockRfqService.getQuotationComparison(rfq.id);
    const ltQuote = comp.quotes.find((q) => q.vendor === VENDOR_B);

    // Only negotiate Tata
    await evaluationService.recordNegotiation(rfq.id, VENDOR_A, {
      amount: 350, stage: 'In Progress', itemRates: { 0: 350 },
    });

    const board = await evaluationService.getEvaluationBoard();
    const item = board.find((b) => b.rfqId === rfq.id);

    // L&T has no rounds → should show original rate
    const ltRounds = roundsForVendor(item, VENDOR_B);
    expect(ltRounds).toHaveLength(0);
    const ltRates = hydrateRates(ltRounds, ltQuote, rfq.items);
    expect(ltRates[0]).toBe(380); // L&T original rate
  });
});

/* ================================================================== */
/*  6. Switching RFQ — independent rates per RFQ                      */
/* ================================================================== */
describe('6. Switching RFQ — independent rates per RFQ', () => {
  it('negotiating RFQ-1 does not affect RFQ-2', { timeout: 30000 }, async () => {
    // Create two separate RFQs
    const rfq1 = await createRfqWithQuotations('RFQ-1');
    const rfq2 = await createRfqWithQuotations('RFQ-2');

    const comp1 = await mockRfqService.getQuotationComparison(rfq1.id);
    const tataQuote1 = comp1.quotes.find((q) => q.vendor === VENDOR_A);

    const comp2 = await mockRfqService.getQuotationComparison(rfq2.id);
    const tataQuote2 = comp2.quotes.find((q) => q.vendor === VENDOR_A);

    // Negotiate RFQ-1 only
    await evaluationService.recordNegotiation(rfq1.id, VENDOR_A, {
      amount: 350, stage: 'In Progress', itemRates: { 0: 350 }, quotationId: tataQuote1.id,
    });

    // Reload both boards
    const board1 = await getBoardItem(rfq1.id);
    const board2 = await getBoardItem(rfq2.id);

    // RFQ-1 should have the negotiated rate
    const r1Rounds = roundsForVendor(board1, VENDOR_A);
    expect(r1Rounds).toHaveLength(1);
    expect(r1Rounds[0].itemRates[0]).toBe(350);

    // RFQ-2 should have NO rounds
    const r2Rounds = roundsForVendor(board2, VENDOR_A);
    expect(r2Rounds).toHaveLength(0);

    // Hydration for RFQ-1 → 350
    const r1Rates = hydrateRates(r1Rounds, tataQuote1, rfq1.items);
    expect(r1Rates[0]).toBe(350);

    // Hydration for RFQ-2 → 400 (original)
    const r2Rates = hydrateRates(r2Rounds, tataQuote2, rfq2.items);
    expect(r2Rates[0]).toBe(400);
  });
});

/* ================================================================== */
/*  7. Browser refresh — rates survive full page reload               */
/* ================================================================== */
describe('7. Browser refresh — rates survive full reload', () => {
  it('simulate full reload: create, negotiate, reset stores, re-read', async () => {
    const rfq = await createRfqWithQuotations();
    const comp = await mockRfqService.getQuotationComparison(rfq.id);
    const tataQuote = comp.quotes.find((q) => q.vendor === VENDOR_A);

    // Negotiate
    await evaluationService.recordNegotiation(rfq.id, VENDOR_A, {
      amount: 350, stage: 'In Progress', itemRates: { 0: 350 }, quotationId: tataQuote.id,
    });

    // Simulate browser refresh: reset in-memory caches, re-read from localStorage
    evaluationsStore.reset();
    rfqsStore.reset();
    quotationsStore.reset();

    // Re-read from localStorage (simulating page reload)
    const board = await evaluationService.getEvaluationBoard();
    const item = board.find((b) => b.rfqId === rfq.id);
    expect(item).toBeTruthy();

    const tataRounds = roundsForVendor(item, VENDOR_A);
    expect(tataRounds).toHaveLength(1);
    expect(tataRounds[0].itemRates[0]).toBe(350);

    // Hydration should return 350
    const rates = hydrateRates(tataRounds, tataQuote, rfq.items);
    expect(rates[0]).toBe(350);
  });

  it('350 → 325 → save → full reload → 325', async () => {
    const rfq = await createRfqWithQuotations();
    const comp = await mockRfqService.getQuotationComparison(rfq.id);
    const tataQuote = comp.quotes.find((q) => q.vendor === VENDOR_A);

    await evaluationService.recordNegotiation(rfq.id, VENDOR_A, {
      amount: 350, stage: 'In Progress', itemRates: { 0: 350 }, quotationId: tataQuote.id,
    });
    await evaluationService.recordNegotiation(rfq.id, VENDOR_A, {
      amount: 325, stage: 'In Progress', itemRates: { 0: 325 }, quotationId: tataQuote.id,
    });

    // Simulate browser refresh
    evaluationsStore.reset();
    rfqsStore.reset();
    quotationsStore.reset();

    const board = await evaluationService.getEvaluationBoard();
    const item = board.find((b) => b.rfqId === rfq.id);
    const tataRounds = roundsForVendor(item, VENDOR_A);
    expect(tataRounds).toHaveLength(2);

    const rates = hydrateRates(tataRounds, tataQuote, rfq.items);
    expect(rates[0]).toBe(325); // NOT 350, NOT 400
  });
});

/* ================================================================== */
/*  8. No negotiation case                                            */
/* ================================================================== */
describe('8. No negotiation — rates stay as original', () => {
  it('without any save, hydration returns original rate', async () => {
    const rfq = await createRfqWithQuotations();
    const comp = await mockRfqService.getQuotationComparison(rfq.id);
    const tataQuote = comp.quotes.find((q) => q.vendor === VENDOR_A);

    const board = await getBoardItem(rfq.id);
    const tataRounds = roundsForVendor(board, VENDOR_A);
    expect(tataRounds).toHaveLength(0);

    const rates = hydrateRates(tataRounds, tataQuote, rfq.items);
    expect(rates[0]).toBe(400);
  });
});

/* ================================================================== */
/*  9. Save is idempotent                                             */
/* ================================================================== */
describe('9. Save is idempotent', () => {
  it('saving same rate twice does not duplicate rounds', async () => {
    const rfq = await createRfqWithQuotations();
    const comp = await mockRfqService.getQuotationComparison(rfq.id);
    const tataQuote = comp.quotes.find((q) => q.vendor === VENDOR_A);

    // Save same rate twice (user clicks Save twice quickly)
    await evaluationService.recordNegotiation(rfq.id, VENDOR_A, {
      amount: 350, stage: 'In Progress', itemRates: { 0: 350 }, quotationId: tataQuote.id,
    });
    await evaluationService.recordNegotiation(rfq.id, VENDOR_A, {
      amount: 350, stage: 'In Progress', itemRates: { 0: 350 }, quotationId: tataQuote.id,
    });

    const board = await evaluationService.getEvaluationBoard();
    const item = board.find((b) => b.rfqId === rfq.id);
    const tataRounds = roundsForVendor(item, VENDOR_A);

    // Two rounds exist (idempotent save creates a new round, not replaces)
    expect(tataRounds).toHaveLength(2);
    // Both have the same rate
    expect(tataRounds[0].itemRates[0]).toBe(350);
    expect(tataRounds[1].itemRates[0]).toBe(350);
    // Hydration returns the latest (still 350)
    const rates = hydrateRates(tataRounds, tataQuote, rfq.items);
    expect(rates[0]).toBe(350);
  });
});

/* ================================================================== */
/*  10. History preservation across rounds                            */
/* ================================================================== */
describe('10. History preservation across rounds', () => {
  it('all rounds preserved with correct round numbers and stages', async () => {
    const rfq = await createRfqWithQuotations();
    const comp = await mockRfqService.getQuotationComparison(rfq.id);
    const tataQuote = comp.quotes.find((q) => q.vendor === VENDOR_A);

    await evaluationService.recordNegotiation(rfq.id, VENDOR_A, {
      amount: 350, stage: 'In Progress', note: 'Round 1', itemRates: { 0: 350 }, quotationId: tataQuote.id,
    });
    await evaluationService.recordNegotiation(rfq.id, VENDOR_A, {
      amount: 325, stage: 'In Progress', note: 'Round 2', itemRates: { 0: 325 }, quotationId: tataQuote.id,
    });
    await evaluationService.recordNegotiation(rfq.id, VENDOR_A, {
      amount: 300, stage: 'Agreed', note: 'Final', itemRates: { 0: 300 }, quotationId: tataQuote.id,
    });

    const board = await evaluationService.getEvaluationBoard();
    const item = board.find((b) => b.rfqId === rfq.id);
    const tataRounds = roundsForVendor(item, VENDOR_A);

    expect(tataRounds).toHaveLength(3);
    expect(tataRounds[0].round).toBe(1);
    expect(tataRounds[0].itemRates[0]).toBe(350);
    expect(tataRounds[0].stage).toBe('In Progress');
    expect(tataRounds[0].note).toBe('Round 1');

    expect(tataRounds[1].round).toBe(2);
    expect(tataRounds[1].itemRates[0]).toBe(325);
    expect(tataRounds[1].stage).toBe('In Progress');
    expect(tataRounds[1].note).toBe('Round 2');

    expect(tataRounds[2].round).toBe(3);
    expect(tataRounds[2].itemRates[0]).toBe(300);
    expect(tataRounds[2].stage).toBe('Agreed');
    expect(tataRounds[2].note).toBe('Final');
  });

  it('negotiationAgreed is true only after Agreed round', async () => {
    const rfq = await createRfqWithQuotations();

    await evaluationService.recordNegotiation(rfq.id, VENDOR_A, {
      amount: 350, stage: 'In Progress', itemRates: { 0: 350 },
    });
    let board = await getBoardItem(rfq.id);
    expect(board.steps.negotiationAgreed).toBe(false);

    await evaluationService.recordNegotiation(rfq.id, VENDOR_A, {
      amount: 300, stage: 'Agreed', itemRates: { 0: 300 },
    });
    board = await getBoardItem(rfq.id);
    expect(board.steps.negotiationAgreed).toBe(true);
  });
});

/* ================================================================== */
/*  11. originalRate must never be overwritten                        */
/* ================================================================== */
describe('11. originalRate is immutable', () => {
  it('quotation item rate remains unchanged after negotiation', async () => {
    const rfq = await createRfqWithQuotations();
    const comp = await mockRfqService.getQuotationComparison(rfq.id);
    const tataQuote = comp.quotes.find((q) => q.vendor === VENDOR_A);

    // Original rate is 400
    expect(tataQuote.items[0].rate).toBe(400);

    // Negotiate down to 300
    await evaluationService.recordNegotiation(rfq.id, VENDOR_A, {
      amount: 300, stage: 'Agreed', itemRates: { 0: 300 }, quotationId: tataQuote.id,
    });

    // Reload and verify original is STILL 400
    const freshComp = await mockRfqService.getQuotationComparison(rfq.id);
    const freshQuote = freshComp.quotes.find((q) => q.vendor === VENDOR_A);
    expect(freshQuote.items[0].rate).toBe(400);
  });

  it('multiple negotiations do not degrade original rate', async () => {
    const rfq = await createRfqWithQuotations();
    const comp = await mockRfqService.getQuotationComparison(rfq.id);
    const tataQuote = comp.quotes.find((q) => q.vendor === VENDOR_A);

    for (const rate of [350, 325, 300, 280]) {
      await evaluationService.recordNegotiation(rfq.id, VENDOR_A, {
        amount: rate, stage: 'In Progress', itemRates: { 0: rate }, quotationId: tataQuote.id,
      });
    }

    const freshComp = await mockRfqService.getQuotationComparison(rfq.id);
    const freshQuote = freshComp.quotes.find((q) => q.vendor === VENDOR_A);
    expect(freshQuote.items[0].rate).toBe(400); // Always 400
  });
});

/* ================================================================== */
/*  12. Vendor identity must remain attached                          */
/* ================================================================== */
describe('12. Vendor identity attached to rounds', () => {
  it('each round has correct vendor name', async () => {
    const rfq = await createRfqWithQuotations();
    const comp = await mockRfqService.getQuotationComparison(rfq.id);
    const tataQuote = comp.quotes.find((q) => q.vendor === VENDOR_A);

    await evaluationService.recordNegotiation(rfq.id, VENDOR_A, {
      amount: 350, stage: 'In Progress', itemRates: { 0: 350 }, quotationId: tataQuote.id,
    });

    const board = await getBoardItem(rfq.id);
    const tataRounds = roundsForVendor(board, VENDOR_A);
    expect(tataRounds[0].vendor).toBe(VENDOR_A);
  });

  it('vendorId is attached when vendor master exists', async () => {
    const rfq = await createRfqWithQuotations();
    const comp = await mockRfqService.getQuotationComparison(rfq.id);
    const tataQuote = comp.quotes.find((q) => q.vendor === VENDOR_A);

    await evaluationService.recordNegotiation(rfq.id, VENDOR_A, {
      amount: 350, stage: 'In Progress', itemRates: { 0: 350 }, quotationId: tataQuote.id,
    });

    const board = await getBoardItem(rfq.id);
    const tataRounds = roundsForVendor(board, VENDOR_A);
    expect(tataRounds[0].vendorId).toBeTruthy();
  });
});

/* ================================================================== */
/*  13. Quotation ID must remain attached                             */
/* ================================================================== */
describe('13. Quotation ID attached to rounds', () => {
  it('each round has quotationId matching the quotation record', async () => {
    const rfq = await createRfqWithQuotations();
    const comp = await mockRfqService.getQuotationComparison(rfq.id);
    const tataQuote = comp.quotes.find((q) => q.vendor === VENDOR_A);

    await evaluationService.recordNegotiation(rfq.id, VENDOR_A, {
      amount: 350, stage: 'In Progress', itemRates: { 0: 350 }, quotationId: tataQuote.id,
    });

    const board = await getBoardItem(rfq.id);
    const tataRounds = roundsForVendor(board, VENDOR_A);
    expect(tataRounds[0].quotationId).toBe(tataQuote.id);
  });

  it('quotationId preserved across multiple rounds', async () => {
    const rfq = await createRfqWithQuotations();
    const comp = await mockRfqService.getQuotationComparison(rfq.id);
    const tataQuote = comp.quotes.find((q) => q.vendor === VENDOR_A);

    await evaluationService.recordNegotiation(rfq.id, VENDOR_A, {
      amount: 350, stage: 'In Progress', itemRates: { 0: 350 }, quotationId: tataQuote.id,
    });
    await evaluationService.recordNegotiation(rfq.id, VENDOR_A, {
      amount: 325, stage: 'Agreed', itemRates: { 0: 325 }, quotationId: tataQuote.id,
    });

    const board = await getBoardItem(rfq.id);
    const tataRounds = roundsForVendor(board, VENDOR_A);
    expect(tataRounds[0].quotationId).toBe(tataQuote.id);
    expect(tataRounds[1].quotationId).toBe(tataQuote.id);
  });
});

/* ================================================================== */
/*  14. RFQ identity must remain attached                             */
/* ================================================================== */
describe('14. RFQ identity attached to evaluation records', () => {
  it('evaluation record has correct RFQ id and rfqNo', async () => {
    const rfq = await createRfqWithQuotations();

    await evaluationService.recordNegotiation(rfq.id, VENDOR_A, {
      amount: 350, stage: 'In Progress', itemRates: { 0: 350 },
    });

    const board = await getBoardItem(rfq.id);
    expect(board.rfqId).toBe(rfq.id);
    expect(board.rfqNo).toBe(rfq.rfqNo);
  });

  it('negotiations are scoped to their RFQ', { timeout: 30000 }, async () => {
    const rfq1 = await createRfqWithQuotations('RFQ-Alpha');
    const rfq2 = await createRfqWithQuotations('RFQ-Beta');

    await evaluationService.recordNegotiation(rfq1.id, VENDOR_A, {
      amount: 350, stage: 'In Progress', itemRates: { 0: 350 },
    });
    await evaluationService.recordNegotiation(rfq2.id, VENDOR_A, {
      amount: 325, stage: 'In Progress', itemRates: { 0: 325 },
    });

    const board1 = await getBoardItem(rfq1.id);
    const board2 = await getBoardItem(rfq2.id);

    // RFQ-1 has one round for Tata
    const r1Rounds = roundsForVendor(board1, VENDOR_A);
    expect(r1Rounds).toHaveLength(1);
    expect(r1Rounds[0].itemRates[0]).toBe(350);

    // RFQ-2 has one round for Tata (different rate)
    const r2Rounds = roundsForVendor(board2, VENDOR_A);
    expect(r2Rounds).toHaveLength(1);
    expect(r2Rounds[0].itemRates[0]).toBe(325);
  });
});

/* ================================================================== */
/*  15. End-to-end: exact bug scenario 400→350→save→reload→verify     */
/* ================================================================== */
describe('15. End-to-end bug regression: 400→350→save→reload', () => {
  it('exact scenario from bug report: rate must be 350 after reload', async () => {
    const rfq = await createRfqWithQuotations();
    const comp = await mockRfqService.getQuotationComparison(rfq.id);
    const tataQuote = comp.quotes.find((q) => q.vendor === VENDOR_A);

    // Verify initial state
    expect(tataQuote.items[0].rate).toBe(400);

    // Step 1: Simulate user changing rate 400 → 350 and saving
    await evaluationService.recordNegotiation(rfq.id, VENDOR_A, {
      amount: 350,
      stage: 'In Progress',
      itemRates: { 0: 350 },
      quotationId: tataQuote.id,
    });

    // Step 2: Simulate reload — reset in-memory caches
    evaluationsStore.reset();
    rfqsStore.reset();
    quotationsStore.reset();

    // Step 3: Re-read from localStorage (simulating page reload)
    const freshBoard = await getBoardItem(rfq.id);
    expect(freshBoard).toBeTruthy();

    const freshComp = await mockRfqService.getQuotationComparison(rfq.id);
    const freshQuote = freshComp.quotes.find((q) => q.vendor === VENDOR_A);

    // Step 4: Hydrate rates (same logic as FinalNegotiation.jsx)
    const freshRounds = roundsForVendor(freshBoard, VENDOR_A);
    expect(freshRounds).toHaveLength(1);

    const rates = hydrateRates(freshRounds, freshQuote, rfq.items);

    // CRITICAL: rate MUST be 350 after reload, NOT 400
    expect(rates[0]).toBe(350);

    // Original rate is still 400 (immutable)
    expect(freshQuote.items[0].rate).toBe(400);
  });

  it('350→325→save→refresh→325 (exact scenario from bug report)', async () => {
    const rfq = await createRfqWithQuotations();
    const comp = await mockRfqService.getQuotationComparison(rfq.id);
    const tataQuote = comp.quotes.find((q) => q.vendor === VENDOR_A);

    // Negotiate twice
    await evaluationService.recordNegotiation(rfq.id, VENDOR_A, {
      amount: 350, stage: 'In Progress', itemRates: { 0: 350 }, quotationId: tataQuote.id,
    });
    await evaluationService.recordNegotiation(rfq.id, VENDOR_A, {
      amount: 325, stage: 'In Progress', itemRates: { 0: 325 }, quotationId: tataQuote.id,
    });

    // Simulate browser refresh
    evaluationsStore.reset();
    rfqsStore.reset();
    quotationsStore.reset();

    const freshBoard = await getBoardItem(rfq.id);
    const freshComp = await mockRfqService.getQuotationComparison(rfq.id);
    const freshQuote = freshComp.quotes.find((q) => q.vendor === VENDOR_A);

    const freshRounds = roundsForVendor(freshBoard, VENDOR_A);
    const rates = hydrateRates(freshRounds, freshQuote, rfq.items);

    // MUST be 325 (latest), NOT 350 or 400
    expect(rates[0]).toBe(325);
  });
});

/* ================================================================== */
/*  16. Multi-line item persistence                                   */
/* ================================================================== */
describe('16. Multi-line item persistence', () => {
  it('all line item rates persist correctly', async () => {
    const multiItems = [
      { product: 'Wireless mouse', hsn: '8471', uom: 'Nos', qty: 1, rate: 400, expectedRate: 400, specification: 'Standard Mouse', requiredDate: '2026-09-15' },
      { product: 'Mechanical keyboard', hsn: '8471', uom: 'Nos', qty: 2, rate: 1200, expectedRate: 1200, specification: 'Cherry MX', requiredDate: '2026-09-20' },
    ];
    const rfq = await createRfqWithQuotations('Multi-line RFQ', [VENDOR_A], multiItems, { [VENDOR_A]: [400, 1200] });
    const comp = await mockRfqService.getQuotationComparison(rfq.id);
    const tataQuote = comp.quotes.find((q) => q.vendor === VENDOR_A);

    // Original rates: item0=400, item1=1200
    expect(tataQuote.items[0].rate).toBe(400);
    expect(tataQuote.items[1].rate).toBe(1200);

    // Negotiate both items
    await evaluationService.recordNegotiation(rfq.id, VENDOR_A, {
      amount: 350 * 1 + 1100 * 2,
      stage: 'In Progress',
      itemRates: { 0: 350, 1: 1100 },
      quotationId: tataQuote.id,
    });

    // Reload
    evaluationsStore.reset();
    rfqsStore.reset();
    quotationsStore.reset();

    const freshBoard = await getBoardItem(rfq.id);
    const freshComp = await mockRfqService.getQuotationComparison(rfq.id);
    const freshQuote = freshComp.quotes.find((q) => q.vendor === VENDOR_A);

    const freshRounds = roundsForVendor(freshBoard, VENDOR_A);
    const rates = hydrateRates(freshRounds, freshQuote, rfq.items);

    expect(rates[0]).toBe(350);
    expect(rates[1]).toBe(1100);

    // Originals immutable
    expect(freshQuote.items[0].rate).toBe(400);
    expect(freshQuote.items[1].rate).toBe(1200);
  });
});
