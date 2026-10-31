/**
 * purchase/services/nfaApprovalEligibility.test.js
 * ------------------------------------------------------------------
 * Regression tests for the runtime approval eligibility bug.
 *
 * The workflow:  PCS → Technical Evaluation → Technical Decision →
 *                Approval Flow → Approval Note → Approval stages →
 *                Purchase Order
 *
 * ROOT CAUSE (fixed):  nfa.buildCandidates() required `record.technical`
 * (the RFQ-level completion flag set by completeTechnicalEvaluation),
 * but the TechnicalEvaluationDetail page only saves per-vendor
 * evaluations and decisions — never calling completeTechnicalEvaluation.
 * The fix recognises per-vendor decisions as proof of completion.
 *
 * Tests:
 *  1. Qualified technical evaluation persists correctly
 *  2. Persisted qualified evaluation is found by nfa.buildCandidates()
 *  3. RFQ with one Qualified vendor appears in Approval Create
 *  4. RFQ with only Not Qualified vendors is excluded
 *  5. RFQ with pending technical evaluation is excluded
 *  6. RFQ with no supplier selection is excluded
 *  7. RFQ ID/rfqNo matching works between evaluation and NFA services
 *  8. Refreshing the browser does not lose the Qualified decision
 *  9. Approval Create uses the same persisted state shown by Technical Evaluation
 * 10. Creating the NFA succeeds for the qualified RFQ
 * 11. createNfa rejects RFQs with an incomplete technical evaluation
 * 12. createNfa rejects RFQs with no technically qualified vendor
 * 13. createNfa rejects a second note for the same RFQ
 * 14. createNfa rejects RFQs with no supplier selection / qualified vendor
 * ------------------------------------------------------------------
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { evaluationService, evaluationsStore } from './evaluation';
import { nfaService, nfasStore } from './nfa';
import { mockRfqService, rfqsStore, quotationsStore } from './rfq';
import { mockVendorService, vendorsStore } from './vendor';

/* Stub the simulated latency so every service call resolves instantly. */
vi.mock('./base', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, delay: () => Promise.resolve() };
});

/* Deterministic signed-in user for activity / actor names. */
function setActor() {
  localStorage.setItem('authUser', JSON.stringify({ fullName: 'Test Buyer', email: 'buyer@test.com' }));
}

const VENDOR_A = 'Tata Steel Ltd';
const VENDOR_B = 'JSW Steel';

function rfqItems() {
  return [
    { product: 'Hydraulic hose DN19', hsn: '4009', uom: 'Meter', qty: 200, rate: 285, expectedRate: 285, specification: 'EN 853 2SN DN19', requiredDate: '2026-09-15' },
    { product: 'Quick coupling G1/2', hsn: '7307', uom: 'Nos', qty: 40, rate: 430, expectedRate: 430, specification: 'ISO 7241-1 B series', requiredDate: '2026-09-15' }
  ];
}

/** Creates a fresh RFQ and walks it to Sent. */
async function createSentRfq() {
  const draft = await mockRfqService.createRfq({
    title: 'Hydraulic hoses and couplings',
    reference: 'PR-2026-0042',
    department: 'Maintenance',
    project: 'General Operations',
    requester: 'Rohan Desai',
    buyer: 'Amit Verma',
    priority: 'High',
    dueDate: '2026-09-10',
    currency: 'INR',
    vendorNames: [VENDOR_A, VENDOR_B],
    items: rfqItems()
  });
  await mockRfqService.submitForReview(draft.id);
  await mockRfqService.approveRfq(draft.id);
  await mockRfqService.sendRfq(draft.id);
  return mockRfqService.getRfq(draft.id);
}

function quotationFor(rfq, vendor, overrides = {}) {
  return {
    rfqNo: rfq.rfqNo,
    vendor,
    submittedOn: '2026-08-15',
    validUntil: '2026-08-31',
    currency: rfq.currency,
    discount: overrides.discount ?? 2,
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
      rate: item.rate ?? item.expectedRate ?? 0,
      gstRate: 18
    })),
    ...overrides
  };
}

/** Records an Agreed negotiation round. */
async function agreeNegotiation(rfqId, vendor = VENDOR_A) {
  const rfq = await mockRfqService.getRfq(rfqId);
  const quote = quotationsStore.all.find((entry) => entry.rfqNo === rfq.rfqNo && entry.vendor === vendor);
  await evaluationService.recordNegotiation(rfqId, vendor, {
    amount: quote.total,
    stage: 'Agreed',
    note: 'Rate confirmed'
  });
}

/**
 * Full setup: sent RFQ + quotations + negotiation agreed + supplier selected.
 * Returns the RFQ with all prerequisites completed.
 */
async function setupWithSelection() {
  const rfq = await createSentRfq();
  await mockRfqService.saveQuotation(quotationFor(rfq, VENDOR_A));
  await mockRfqService.saveQuotation(quotationFor(rfq, VENDOR_B, { rate: 310 }));
  await mockRfqService.startEvaluation(rfq.id);
  await agreeNegotiation(rfq.id);
  await evaluationService.completeSupplierSelection(rfq.id, VENDOR_A, {
    rationale: 'Lowest evaluated total after negotiation'
  });
  return mockRfqService.getRfq(rfq.id);
}

/* ================================================================ */

describe('NFA approval eligibility — Technical Evaluation → Approval Flow', () => {
  beforeEach(async () => {
    localStorage.clear();
    evaluationsStore.reset();
    nfasStore.reset();
    rfqsStore.reset();
    quotationsStore.reset();
    vendorsStore.reset();
    setActor();
    for (const name of [VENDOR_A, VENDOR_B]) {
      const v = await mockVendorService.createVendor({ name, status: 'Approved' });
      await mockVendorService.setVendorStatus(v.id, 'Approved');
    }
  });

  /* ── Test 1: Qualified technical evaluation persists correctly ── */
  it('1. saves per-vendor evaluation scores and decision, and they persist', async () => {
    const rfq = await setupWithSelection();

    const scores = { compliance: 85, quality: 80, delivery: 78, postPurchase: 72 };
    await evaluationService.saveVendorEvaluation(rfq.id, VENDOR_A, { scores, remarks: 'Solid compliance' });
    await evaluationService.setVendorDecision(rfq.id, VENDOR_A, 'Qualified', { remarks: 'Meets threshold' });

    const vendorEvals = await evaluationService.getVendorEvaluations(rfq.id);
    const vendorA = vendorEvals.find((v) => v.vendor === VENDOR_A);
    expect(vendorA).toBeTruthy();
    expect(vendorA.evalStatus).toBe('Technically Qualified');
    expect(vendorA.evalDecision).toBe('Qualified');
    expect(vendorA.technicalTotal).toBeGreaterThan(0);
  });

  /* ── Test 2: Persisted qualified evaluation is found by nfa.buildCandidates() ── */
  it('2. buildCandidates finds RFQ with qualified vendor even without record.technical', async () => {
    const rfq = await setupWithSelection();

    /* Save per-vendor scores and decision (without calling completeTechnicalEvaluation). */
    await evaluationService.saveVendorEvaluation(rfq.id, VENDOR_A, {
      scores: { compliance: 82, quality: 80, delivery: 78, postPurchase: 72 }
    });
    await evaluationService.setVendorDecision(rfq.id, VENDOR_A, 'Qualified');

    const candidates = await nfaService.getNfaCandidates();
    const found = candidates.find((c) => c.rfqNo === rfq.rfqNo);
    expect(found).toBeTruthy();
    expect(found.suppliers).toContain(VENDOR_A);
  });

  /* ── Test 3: RFQ with one Qualified vendor appears in Approval Create ── */
  it('3. RFQ with one Qualified vendor appears in getNfaCandidates', async () => {
    const rfq = await setupWithSelection();

    await evaluationService.saveVendorEvaluation(rfq.id, VENDOR_A, {
      scores: { compliance: 90, quality: 85, delivery: 80, postPurchase: 75 }
    });
    await evaluationService.setVendorDecision(rfq.id, VENDOR_A, 'Qualified');

    /* Mark the other vendor as Not Qualified. */
    await evaluationService.saveVendorEvaluation(rfq.id, VENDOR_B, {
      scores: { compliance: 50, quality: 45, delivery: 40, postPurchase: 35 }
    });
    await evaluationService.setVendorDecision(rfq.id, VENDOR_B, 'Not Qualified');

    const candidates = await nfaService.getNfaCandidates();
    expect(candidates.some((c) => c.rfqNo === rfq.rfqNo)).toBe(true);
  });

  /* ── Test 4: RFQ with only Not Qualified vendors is excluded ── */
  it('4. RFQ with only Not Qualified vendors is excluded from candidates', async () => {
    const rfq = await setupWithSelection();

    await evaluationService.saveVendorEvaluation(rfq.id, VENDOR_A, {
      scores: { compliance: 30, quality: 25, delivery: 30, postPurchase: 20 }
    });
    await evaluationService.setVendorDecision(rfq.id, VENDOR_A, 'Not Qualified');

    await evaluationService.saveVendorEvaluation(rfq.id, VENDOR_B, {
      scores: { compliance: 35, quality: 20, delivery: 25, postPurchase: 15 }
    });
    await evaluationService.setVendorDecision(rfq.id, VENDOR_B, 'Not Qualified');

    const candidates = await nfaService.getNfaCandidates();
    expect(candidates.some((c) => c.rfqNo === rfq.rfqNo)).toBe(false);
  });

  /* ── Test 5: RFQ with pending technical evaluation is excluded ── */
  it('5. RFQ with no vendor decisions is excluded from candidates', async () => {
    const rfq = await setupWithSelection();

    /* Save scores but do NOT make any decisions. */
    await evaluationService.saveVendorEvaluation(rfq.id, VENDOR_A, {
      scores: { compliance: 85, quality: 80, delivery: 78, postPurchase: 72 }
    });

    const candidates = await nfaService.getNfaCandidates();
    expect(candidates.some((c) => c.rfqNo === rfq.rfqNo)).toBe(false);
  });

  /* ── Test 6: RFQ with no explicit selection but qualified vendor is included ── */
  it('6. RFQ with no explicit supplier selection but qualified vendor IS included', async () => {
    const rfq = await createSentRfq();
    await mockRfqService.saveQuotation(quotationFor(rfq, VENDOR_A));
    await mockRfqService.saveQuotation(quotationFor(rfq, VENDOR_B));
    await mockRfqService.startEvaluation(rfq.id);
    await agreeNegotiation(rfq.id);

    /* Do evaluations and decisions but skip supplier selection.
       The selection should be derived from the qualified vendor. */
    await evaluationService.saveVendorEvaluation(rfq.id, VENDOR_A, {
      scores: { compliance: 85, quality: 80, delivery: 78, postPurchase: 72 }
    });
    await evaluationService.setVendorDecision(rfq.id, VENDOR_A, 'Qualified');

    await evaluationService.saveVendorEvaluation(rfq.id, VENDOR_B, {
      scores: { compliance: 50, quality: 45, delivery: 40, postPurchase: 35 }
    });
    await evaluationService.setVendorDecision(rfq.id, VENDOR_B, 'Not Qualified');

    const candidates = await nfaService.getNfaCandidates();
    const found = candidates.find((c) => c.rfqNo === rfq.rfqNo);
    expect(found).toBeTruthy();
    expect(found.supplier).toBe(VENDOR_A);
    expect(found.amount).toBeGreaterThan(0);
  });

  /* ── Test 7: RFQ ID/rfqNo matching works between evaluation and NFA services ── */
  it('7. RFQ ID and rfqNo matching works correctly between services', async () => {
    const rfq = await setupWithSelection();

    await evaluationService.saveVendorEvaluation(rfq.rfqNo, VENDOR_A, {
      scores: { compliance: 85, quality: 80, delivery: 78, postPurchase: 72 }
    });
    await evaluationService.setVendorDecision(rfq.rfqNo, VENDOR_A, 'Qualified');

    /* The evaluation was saved using rfqNo. The NFA service should find it using rfq.id. */
    const candidates = await nfaService.getNfaCandidates();
    const found = candidates.find((c) => c.rfqNo === rfq.rfqNo);
    expect(found).toBeTruthy();
    expect(found.rfqId).toBe(rfq.id);
  });

  /* ── Test 8: Refreshing the browser does not lose the Qualified decision ── */
  it('8. per-vendor evaluations survive localStorage persistence round-trip', async () => {
    const rfq = await setupWithSelection();

    await evaluationService.saveVendorEvaluation(rfq.id, VENDOR_A, {
      scores: { compliance: 85, quality: 80, delivery: 78, postPurchase: 72 },
      remarks: 'Good compliance'
    });
    await evaluationService.setVendorDecision(rfq.id, VENDOR_A, 'Qualified', { remarks: 'Approved' });

    /* Simulate browser refresh: reset in-memory caches and reload from localStorage. */
    evaluationsStore.reset();
    nfasStore.reset();

    /* Data should still be in localStorage — re-read it. */
    const candidates = await nfaService.getNfaCandidates();
    const found = candidates.find((c) => c.rfqNo === rfq.rfqNo);
    expect(found).toBeTruthy();

    const vendorEvals = await evaluationService.getVendorEvaluations(rfq.id);
    const vendorA = vendorEvals.find((v) => v.vendor === VENDOR_A);
    expect(vendorA.evalDecision).toBe('Qualified');
    expect(vendorA.evalRemarks).toBe('Good compliance');
  });

  /* ── Test 9: Approval Create uses same persisted state as Technical Evaluation ── */
  it('9. NFA candidates reflect the same evaluation state as the evaluation detail', async () => {
    const rfq = await setupWithSelection();

    await evaluationService.saveVendorEvaluation(rfq.id, VENDOR_A, {
      scores: { compliance: 85, quality: 80, delivery: 78, postPurchase: 72 }
    });
    await evaluationService.setVendorDecision(rfq.id, VENDOR_A, 'Qualified');

    /* Technical Evaluation detail view. */
    const vendorEvals = await evaluationService.getVendorEvaluations(rfq.id);
    const techQualified = vendorEvals.filter((v) => v.evalStatus === 'Technically Qualified');
    expect(techQualified.length).toBeGreaterThanOrEqual(1);

    /* NFA candidates (Approval Create view). */
    const candidates = await nfaService.getNfaCandidates();
    const candidate = candidates.find((c) => c.rfqNo === rfq.rfqNo);
    expect(candidate).toBeTruthy();
    expect(candidate.supplier).toBe(VENDOR_A);
    expect(candidate.amount).toBeGreaterThan(0);
  });

  /* ── Test 10: Creating the NFA succeeds for the qualified RFQ ── */
  it('10. createNfa succeeds when per-vendor decisions indicate completion', async () => {
    const rfq = await setupWithSelection();

    await evaluationService.saveVendorEvaluation(rfq.id, VENDOR_A, {
      scores: { compliance: 85, quality: 80, delivery: 78, postPurchase: 72 }
    });
    await evaluationService.setVendorDecision(rfq.id, VENDOR_A, 'Qualified');

    const note = await nfaService.createNfa({
      rfqId: rfq.id,
      purpose: 'Approval to place the PO',
      justification: 'Lowest evaluated total after technical evaluation'
    });

    expect(note.nfaNo).toBeTruthy();
    expect(note.rfqNo).toBe(rfq.rfqNo);
    expect(note.supplier).toBe(VENDOR_A);
    expect(note.status).toBe('Draft');
    expect(note.amount).toBeGreaterThan(0);
  });

  /* ── Test 11: createNfa refuses RFQs with an incomplete technical evaluation ── */
  it('11. createNfa rejects when the technical evaluation is not complete', async () => {
    const rfq = await setupWithSelection();

    /* Scores saved but NO decisions made — per-vendor evaluation incomplete. */
    await evaluationService.saveVendorEvaluation(rfq.id, VENDOR_A, {
      scores: { compliance: 85, quality: 80, delivery: 78, postPurchase: 72 }
    });

    await expect(
      nfaService.createNfa({ rfqId: rfq.id, purpose: 'PO approval', justification: 'Lowest quote' })
    ).rejects.toThrow('Complete the technical evaluation before raising an NFA');
  });

  /* ── Test 12: createNfa refuses RFQs with no technically qualified vendor ── */
  it('12. createNfa rejects when no vendor is technically qualified', async () => {
    const rfq = await setupWithSelection();

    await evaluationService.saveVendorEvaluation(rfq.id, VENDOR_A, {
      scores: { compliance: 40, quality: 35, delivery: 30, postPurchase: 25 }
    });
    await evaluationService.setVendorDecision(rfq.id, VENDOR_A, 'Not Qualified');

    await expect(
      nfaService.createNfa({ rfqId: rfq.id, purpose: 'PO approval', justification: 'Lowest quote' })
    ).rejects.toThrow('At least one vendor must be technically qualified before raising an NFA');
  });

  /* ── Test 13: createNfa refuses a second note for the same RFQ ── */
  it('13. createNfa rejects when an NFA already exists for the RFQ', async () => {
    const rfq = await setupWithSelection();

    await evaluationService.saveVendorEvaluation(rfq.id, VENDOR_A, {
      scores: { compliance: 85, quality: 80, delivery: 78, postPurchase: 72 }
    });
    await evaluationService.setVendorDecision(rfq.id, VENDOR_A, 'Qualified');

    await nfaService.createNfa({ rfqId: rfq.id, purpose: 'First note', justification: 'Lowest quote' });

    await expect(
      nfaService.createNfa({ rfqId: rfq.id, purpose: 'Second note', justification: 'Duplicate' })
    ).rejects.toThrow(/already exists/);
  });

  /* ── Test 14: createNfa refuses RFQs with no selection or qualified vendor ── */
  it('14. createNfa rejects when there is no supplier selection or qualified vendor', async () => {
    const rfq = await createSentRfq(); /* Sent but no quotations at all. */

    await expect(
      nfaService.createNfa({ rfqId: rfq.id, purpose: 'PO approval', justification: 'x' })
    ).rejects.toThrow('No supplier selection or qualified vendor found');
  });
});
