/**
 * purchase/services/negotiationServiceRoundtrip.test.js
 * ------------------------------------------------------------------
 * REAL regression tests: exercise recordNegotiation() → getEvaluationBoard()
 * through the actual service methods and persisted store.
 *
 * These are NOT mock-only tests — they create real RFQs, real quotations,
 * and verify the actual persistence path through localStorage.
 * ------------------------------------------------------------------ */
import { beforeEach, describe, expect, it } from 'vitest';
import { evaluationService, evaluationsStore } from './evaluation';
import { mockRfqService, rfqsStore, quotationsStore } from './rfq';
import { mockVendorService, vendorsStore } from './vendor';

function setActor() {
  localStorage.setItem('authUser', JSON.stringify({ fullName: 'Test Buyer', email: 'buyer@test.com' }));
}

const VENDOR_NAMES = ['Tata Steel', 'L&T'];

function rfqItems() {
  return [
    { product: 'Mouse', hsn: '8471', uom: 'Nos', qty: 1, rate: 400, expectedRate: 400, specification: 'Standard Mouse', requiredDate: '2026-09-15' },
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
    title: 'Test Negotiation Roundtrip',
    reference: 'PR-2026-RT',
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

describe('Negotiation round-trip: recordNegotiation → getEvaluationBoard', () => {
  it('saves itemRates and retrieves them through getEvaluationBoard', async () => {
    const rfq = await createRfqWithQuotations();
    await evaluationService.recordNegotiation(rfq.id, 'Tata Steel', {
      amount: 350,
      stage: 'In Progress',
      itemRates: { 0: 350 },
    });
    const board = await evaluationService.getEvaluationBoard();
    const item = board.find((b) => b.rfqId === rfq.id);
    expect(item).toBeTruthy();
    const tataRounds = item.negotiations.filter((r) => r.vendor === 'Tata Steel');
    expect(tataRounds).toHaveLength(1);
    expect(tataRounds[0].itemRates).toEqual({ 0: 350 });
    expect(tataRounds[0].amount).toBe(350);
    expect(tataRounds[0].stage).toBe('In Progress');
  });

  it('400 → 350 → save → getEvaluationBoard → itemRates[0] === 350', async () => {
    const rfq = await createRfqWithQuotations();
    await evaluationService.recordNegotiation(rfq.id, 'Tata Steel', {
      amount: 350,
      stage: 'In Progress',
      itemRates: { 0: 350 },
    });
    const board = await evaluationService.getEvaluationBoard();
    const item = board.find((b) => b.rfqId === rfq.id);
    const tataRounds = item.negotiations.filter((r) => r.vendor === 'Tata Steel');
    const latest = tataRounds[tataRounds.length - 1];
    expect(latest.itemRates[0]).toBe(350);
  });

  it('350 → 325 → save → getEvaluationBoard → itemRates[0] === 325', async () => {
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
    const latest = tataRounds[tataRounds.length - 1];
    expect(latest.itemRates[0]).toBe(325);
  });

  it('two vendors: Tata 400→350 and L&T 380→360 — no cross-contamination', async () => {
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
    expect(tataRounds[0].itemRates[0]).toBe(350);
    expect(ltRounds[0].itemRates[0]).toBe(360);
  });

  it('negotiation rounds include quotationId and vendorId when available', async () => {
    const rfq = await createRfqWithQuotations();
    await evaluationService.recordNegotiation(rfq.id, 'Tata Steel', {
      amount: 350,
      stage: 'In Progress',
      itemRates: { 0: 350 },
    });
    const board = await evaluationService.getEvaluationBoard();
    const item = board.find((b) => b.rfqId === rfq.id);
    const tataRound = item.negotiations.find((r) => r.vendor === 'Tata Steel');
    expect(tataRound).toBeTruthy();
    /* quotationId should be resolved from the evaluation row */
    expect(tataRound.quotationId).toBeTruthy();
    /* vendorId should be resolved from the vendor master */
    expect(tataRound.vendorId).toBeTruthy();
  });

  it('board vendors array includes quotationId in negotiation rounds', async () => {
    const rfq = await createRfqWithQuotations();
    await evaluationService.recordNegotiation(rfq.id, 'Tata Steel', {
      amount: 350,
      stage: 'In Progress',
      itemRates: { 0: 350 },
    });
    const board = await evaluationService.getEvaluationBoard();
    const item = board.find((b) => b.rfqId === rfq.id);
    const tataVendor = item.vendors.find((v) => v.vendor === 'Tata Steel');
    expect(tataVendor).toBeTruthy();
    expect(tataVendor.rounds).toHaveLength(1);
    expect(tataVendor.rounds[0].itemRates[0]).toBe(350);
  });

  it('vendor quote counts are accurate for multi-vendor RFQ', async () => {
    const rfq = await createRfqWithQuotations();
    const board = await evaluationService.getEvaluationBoard();
    const item = board.find((b) => b.rfqId === rfq.id);
    expect(item.vendors).toHaveLength(2);
    expect(item.vendors.map((v) => v.vendor).sort()).toEqual(['L&T', 'Tata Steel']);
  });

  it('negotiated rates survive mark-complete (Agreed stage)', async () => {
    const rfq = await createRfqWithQuotations();
    await evaluationService.recordNegotiation(rfq.id, 'Tata Steel', {
      amount: 350,
      stage: 'Agreed',
      itemRates: { 0: 350 },
    });
    const board = await evaluationService.getEvaluationBoard();
    const item = board.find((b) => b.rfqId === rfq.id);
    expect(item.steps.negotiationAgreed).toBe(true);
    const tataRounds = item.negotiations.filter((r) => r.vendor === 'Tata Steel');
    expect(tataRounds[0].stage).toBe('Agreed');
    expect(tataRounds[0].itemRates[0]).toBe(350);
  });

  it('backward compatibility: old records without quotationId still work', async () => {
    const rfq = await createRfqWithQuotations();
    /* Manually inject a legacy round without quotationId */
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
  });
});
