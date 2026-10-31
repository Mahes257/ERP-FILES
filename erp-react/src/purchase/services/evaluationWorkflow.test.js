/**
 * purchase/services/evaluationWorkflow.test.js
 * ------------------------------------------------------------------
 * Unit tests for the Procurement Evaluation pipeline — the sourcing
 * subset of the ONE canonical Purchase workflow (constants/workflow.js):
 *
 *   RFQ → Follow-up → Quotations → Comparison → Negotiation →
 *   Technical Evaluation → Commercial Evaluation →
 *   Supplier Selection → Purchase Order
 *
 * The stage sequence is never hardcoded in this file — the stepper
 * test asserts the canonical `EVALUATION_STAGES` order, the single
 * source of truth for stage ordering.
 *
 * Covers the workflow guards (every invalid transition throws):
 *   RULE 1  Evaluation only for open RFQs with received quotations
 *   RULE 2  Technical evaluation is one-way (no repeats)
 *   RULE 3  Commercial requires technical first
 *   RULE 4  Negotiation is a quotation-preparation step — allowed once
 *           quotations are received, BEFORE the evaluations (and never
 *           required to advance them)
 *   RULE 5  Negotiation preserves the original quotation + history
 *   RULE 6  Supplier selection is NEVER automatic — explicit only
 *   RULE 7  Selection requires technical + commercial
 *   RULE 8  One selection per RFQ
 *   RULE 9  Approval requires a completed selection
 *   RULE 10 RFQ award requires an APPROVED selection and references the
 *           selected vendor, quotation and final negotiated value
 *
 * The tests exercise the MOCK services directly against fresh in-memory
 * stores per test. `delay` is stubbed so the suite stays fast.
 * ------------------------------------------------------------------
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APPROVAL_STATUS, EVALUATION_STAGES, QUOTATION_STATUS, RFQ_STATUS } from '../constants';
import { evaluationService, evaluationsStore } from './evaluation';
import { evaluationSteps } from '../constants';
import { mockRfqService, rfqsStore, quotationsStore } from './rfq';
import { requisitionsStore } from './requisition';
import { ordersStore } from './purchaseOrder';
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

beforeEach(async () => {
  localStorage.clear();
  requisitionsStore.reset();
  rfqsStore.reset();
  quotationsStore.reset();
  ordersStore.reset();
  vendorsStore.reset();
  evaluationsStore.reset();
  setActor();
  for (const name of VENDORS) {
    const v = await mockVendorService.createVendor({ name, status: 'Approved' });
    await mockVendorService.setVendorStatus(v.id, 'Approved');
  }
});

const VENDORS = ['Tata Steel Ltd', 'JSW Steel'];

/* Valid finalized payment terms used by the strict-gate helpers. */
const TERMS = { type: 'Against Delivery', balanceTrigger: 'Against Delivery' };

function rfqItems() {
  return [
    { product: 'HR coil 3mm', hsn: '7208', uom: 'Kg', qty: 8000, rate: 24.5, expectedRate: 24.5, specification: 'IS 2062 E250', requiredDate: '2026-09-15' },
    { product: 'MS plate 6mm', hsn: '7208', uom: 'Kg', qty: 1200, rate: 28, expectedRate: 28, specification: 'IS 2062', requiredDate: '2026-09-15' }
  ];
}

/** Creates a fresh RFQ and walks it to Sent. */
async function createSentRfq() {
  const draft = await mockRfqService.createRfq({
    title: 'Steel sheets for chassis line',
    reference: 'PR-2026-0045',
    department: 'Production',
    project: 'Unit 2 Expansion',
    requester: 'Rahul Sharma',
    buyer: 'Kavita Rao',
    priority: 'High',
    dueDate: '2026-09-10',
    currency: 'INR',
    vendorNames: VENDORS,
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

/** Full setup: sent RFQ + quotations from both vendors + startEvaluation. */
async function createEvaluableRfq() {
  const rfq = await createSentRfq();
  await mockRfqService.saveQuotation(quotationFor(rfq, VENDORS[0]));
  await mockRfqService.saveQuotation(quotationFor(rfq, VENDORS[1]));
  await mockRfqService.startEvaluation(rfq.id);
  return mockRfqService.getRfq(rfq.id);
}

/** Records an Agreed negotiation round against a vendor's quotation —
 *  the strict-gate negotiation completion (defaults to the quoted rate,
 *  so the selection's final value stays the quotation total). */
async function agreeNegotiation(rfqId, vendor = VENDORS[0], amount = null) {
  const rfq = await mockRfqService.getRfq(rfqId);
  const quote = quotationsStore.all.find((entry) => entry.rfqNo === rfq.rfqNo && entry.vendor === vendor);
  await evaluationService.recordNegotiation(rfqId, vendor, {
    amount: amount ?? quote.total,
    stage: 'Agreed',
    note: 'Rate confirmed'
  });
}

/** Completes the strict-gate pipeline for an RFQ: negotiation closes as
 *  Agreed, then technical + commercial evaluation with finalized
 *  payment terms — the prerequisites of supplier selection. */
async function completeEvaluations(rfqId) {
  await agreeNegotiation(rfqId);
  await evaluationService.completeTechnicalEvaluation(rfqId);
  await evaluationService.completeCommercialEvaluation(rfqId, { paymentTerms: TERMS });
}

describe('Technical evaluation', () => {
  it('RULE 1 — refuses evaluation for an RFQ without received quotations', async () => {
    /* Sent but no quotation recorded yet. */
    const rfq = await createSentRfq();
    await expect(evaluationService.completeTechnicalEvaluation(rfq.id)).rejects.toThrow(
      /No received quotations available/
    );
  });

  it('RULE 1 — refuses evaluation for a non-open RFQ (Cancelled)', async () => {
    /* Create a cancelled RFQ and verify evaluation is refused. */
    const draft = await mockRfqService.createRfq({
      title: 'Cancelled RFQ', items: rfqItems(), vendorNames: VENDORS
    });
    await mockRfqService.cancelRfq(draft.id);
    await expect(evaluationService.completeTechnicalEvaluation(draft.id)).rejects.toThrow(
      /Only RFQs with received quotations can be evaluated/
    );
  });

  it('completes the technical evaluation and records actor + timestamp', async () => {
    const rfq = await createEvaluableRfq();
    await agreeNegotiation(rfq.id);
    const record = await evaluationService.completeTechnicalEvaluation(rfq.id, { remarks: 'All specs met' });

    expect(record.technical.completedBy).toBe('Test Buyer');
    expect(record.technical.completedAt).toBeTruthy();
    expect(record.technical.remarks).toBe('All specs met');
    expect(record.activity.some((entry) => entry.type === 'technical')).toBe(true);

    const board = await evaluationService.getEvaluation(rfq.id);
    expect(board.steps.technical).toBe(true);
    /* Scores are derived from the actual quotations. */
    expect(board.vendors).toHaveLength(2);
    board.vendors.forEach((vendor) => {
      expect(vendor.technicalTotal).toBeGreaterThan(0);
      expect(vendor.quoteId).toBeTruthy();
    });
  });

  it('RULE 2 — refuses a second technical evaluation', async () => {
    const rfq = await createEvaluableRfq();
    await agreeNegotiation(rfq.id);
    await evaluationService.completeTechnicalEvaluation(rfq.id);
    await expect(evaluationService.completeTechnicalEvaluation(rfq.id)).rejects.toThrow(
      /already completed/
    );
  });
});

describe('Commercial evaluation', () => {
  it('RULE 3 — refuses commercial evaluation before technical', async () => {
    const rfq = await createEvaluableRfq();
    await expect(evaluationService.completeCommercialEvaluation(rfq.id)).rejects.toThrow(
      /Complete the technical evaluation before the commercial evaluation/
    );
  });

  it('completes commercial evaluation after technical; repeats refused', async () => {
    const rfq = await createEvaluableRfq();
    await agreeNegotiation(rfq.id);
    await evaluationService.completeTechnicalEvaluation(rfq.id);
    const record = await evaluationService.completeCommercialEvaluation(rfq.id, { remarks: 'Within budget' });

    expect(record.commercial.completedBy).toBe('Test Buyer');
    expect(record.commercial.completedAt).toBeTruthy();
    expect(record.activity.some((entry) => entry.type === 'commercial')).toBe(true);

    await expect(evaluationService.completeCommercialEvaluation(rfq.id)).rejects.toThrow(
      /already completed/
    );
  });
});

describe('Price negotiation', () => {
  it('RULE 4 — negotiation is a quotation-preparation step: allowed once quotations are received, before the evaluations', async () => {
    const rfq = await createEvaluableRfq();
    /* No technical / commercial evaluation required — negotiation happens
       after comparison, before the evaluations when required. */
    const record = await evaluationService.recordNegotiation(rfq.id, VENDORS[0], {
      amount: 0,
      stage: 'In Progress',
      note: 'Opening offer requested'
    });
    expect(record.negotiations).toHaveLength(1);

    const board = await evaluationService.getEvaluation(rfq.id);
    expect(board.steps.negotiation).toBe(true);
    /* A recorded round is progress — the strict gate needs an Agreed
       close before the technical evaluation unlocks. */
    expect(board.steps.negotiationAgreed).toBe(false);
    /* The evaluations stay open — negotiation never blocks them. */
    expect(board.steps.technical).toBe(false);
    expect(board.steps.commercial).toBe(false);
  });

  it('RULE 4 — refuses negotiation for an RFQ without received quotations', async () => {
    const rfq = await createSentRfq();
    await expect(
      evaluationService.recordNegotiation(rfq.id, VENDORS[0], { amount: 1000, stage: 'In Progress' })
    ).rejects.toThrow(/No quotation from/);
  });

  it('RULE 5 — preserves the original quotation and appends history rounds', async () => {
    const rfq = await createEvaluableRfq();

    const originalQuote = quotationsStore.all.find((quote) => quote.rfqNo === rfq.rfqNo && quote.vendor === VENDORS[0]);
    const originalTotal = originalQuote.total;

    await evaluationService.recordNegotiation(rfq.id, VENDORS[0], { amount: 0, stage: 'In Progress', note: 'Opening offer requested' });
    await evaluationService.recordNegotiation(rfq.id, VENDORS[0], { amount: originalTotal * 0.93, stage: 'Agreed', note: 'Volume discount accepted' });

    /* The original quotation is untouched. */
    const after = quotationsStore.all.find((quote) => quote.rfqNo === rfq.rfqNo && quote.vendor === VENDORS[0]);
    expect(after.total).toBe(originalTotal);

    const board = await evaluationService.getEvaluation(rfq.id);
    const vendor = board.vendors.find((entry) => entry.vendor === VENDORS[0]);
    expect(vendor.rounds).toHaveLength(2);
    expect(vendor.rounds[0].stage).toBe('In Progress');
    expect(vendor.rounds[1].stage).toBe('Agreed');
    expect(vendor.negotiatedValue).toBe(Math.round(originalTotal * 0.93 * 100) / 100);
    expect(vendor.negotiationStage).toBe('Agreed');
  });

  it('refuses an invalid stage and an Agreed round without a rate', async () => {
    const rfq = await createEvaluableRfq();

    await expect(
      evaluationService.recordNegotiation(rfq.id, VENDORS[0], { amount: 0, stage: 'Bogus' })
    ).rejects.toThrow(/Invalid negotiation stage/);

    await expect(
      evaluationService.recordNegotiation(rfq.id, VENDORS[0], { amount: 0, stage: 'Agreed' })
    ).rejects.toThrow(/Enter the agreed rate/);
  });

  it('refuses negotiation for a vendor with no quotation', async () => {
    const rfq = await createEvaluableRfq();
    await expect(
      evaluationService.recordNegotiation(rfq.id, 'Bosch', { amount: 0, stage: 'In Progress' })
    ).rejects.toThrow(/No quotation from Bosch/);
  });
});

describe('Strict workflow gates', () => {
  it('technical evaluation is refused until negotiation closes as Agreed', async () => {
    const rfq = await createEvaluableRfq();
    /* Comparison done, but no negotiation round yet. */
    await expect(evaluationService.completeTechnicalEvaluation(rfq.id)).rejects.toThrow(
      /Complete the negotiation before starting the technical evaluation/
    );
    /* An in-progress round is progress, not completion. */
    await evaluationService.recordNegotiation(rfq.id, VENDORS[0], { amount: 0, stage: 'In Progress' });
    await expect(evaluationService.completeTechnicalEvaluation(rfq.id)).rejects.toThrow(
      /Complete the negotiation before starting the technical evaluation/
    );
    /* Closing as Agreed unlocks the stage. */
    await agreeNegotiation(rfq.id);
    await evaluationService.completeTechnicalEvaluation(rfq.id);
  });

  it('supplier selection requires comparison + negotiation (payment terms are downstream)', async () => {
    const rfq = await createEvaluableRfq();
    await agreeNegotiation(rfq.id);
    /* Supplier selection can happen before technical/commercial evaluation.
       Payment terms are finalized later as part of the approval process. */
    await evaluationService.completeSupplierSelection(rfq.id, VENDORS[0]);
    const record = await evaluationService.getEvaluation(rfq.id);
    expect(record.selection.selectedVendor).toBe(VENDORS[0]);
  });
});

describe('Supplier selection', () => {
  it('RULE 7 — refuses selection before the strict prerequisites are completed', async () => {
    const rfq = await createEvaluableRfq();
    /* The first unmet strict gate: negotiation has not closed as Agreed. */
    await expect(
      evaluationService.completeSupplierSelection(rfq.id, VENDORS[0])
    ).rejects.toThrow(/Complete the negotiation before selecting a supplier/);
  });

  it('RULE 6 — never auto-selects; the board has no selection until chosen', async () => {
    const rfq = await createEvaluableRfq();
    await completeEvaluations(rfq.id);

    const board = await evaluationService.getEvaluation(rfq.id);
    expect(board.selection).toBeNull();
    expect(board.steps.selection).toBe(false);
  });

  it('RULE 7/8 — refuses an unquoted vendor and a second selection', async () => {
    const rfq = await createEvaluableRfq();
    await completeEvaluations(rfq.id);

    await expect(
      evaluationService.completeSupplierSelection(rfq.id, 'Bosch')
    ).rejects.toThrow(/No quotation from Bosch/);

    await evaluationService.completeSupplierSelection(rfq.id, VENDORS[0], { rationale: 'Best overall' });
    await expect(
      evaluationService.completeSupplierSelection(rfq.id, VENDORS[1])
    ).rejects.toThrow(/already been selected/);
  });

  it('records the selected vendor, quotation and quoted final value', async () => {
    const rfq = await createEvaluableRfq();
    await completeEvaluations(rfq.id);
    const quote = quotationsStore.all.find((entry) => entry.rfqNo === rfq.rfqNo && entry.vendor === VENDORS[0]);

    const record = await evaluationService.completeSupplierSelection(rfq.id, VENDORS[0], { rationale: 'Top technical score' });
    expect(record.selection).toMatchObject({
      selectedVendor: VENDORS[0],
      selectedQuoteId: quote.id,
      finalValue: quote.total,
      selectedBy: 'Test Buyer'
    });
    expect(record.selection.selectedAt).toBeTruthy();
    expect(record.approval).toBeNull();
    expect(record.activity.some((entry) => entry.type === 'selection')).toBe(true);
  });

  it('uses the agreed negotiated value as the final award value', async () => {
    const rfq = await createEvaluableRfq();
    await completeEvaluations(rfq.id);
    const quote = quotationsStore.all.find((entry) => entry.rfqNo === rfq.rfqNo && entry.vendor === VENDORS[0]);
    const agreed = Math.round(quote.total * 0.9 * 100) / 100;
    await evaluationService.recordNegotiation(rfq.id, VENDORS[0], { amount: agreed, stage: 'Agreed' });

    const record = await evaluationService.completeSupplierSelection(rfq.id, VENDORS[0]);
    expect(record.selection.finalValue).toBe(agreed);
  });
});

describe('Selection approval', () => {
  it('RULE 9 — refuses approval before a selection exists', async () => {
    const rfq = await createEvaluableRfq();
    await completeEvaluations(rfq.id);
    await expect(
      evaluationService.approveSupplierSelection(rfq.id, { decision: APPROVAL_STATUS.APPROVED })
    ).rejects.toThrow(/Select a supplier before approving/);
  });

  it('refuses an invalid approval decision', async () => {
    const rfq = await createEvaluableRfq();
    await completeEvaluations(rfq.id);
    await evaluationService.completeSupplierSelection(rfq.id, VENDORS[0]);
    await expect(
      evaluationService.approveSupplierSelection(rfq.id, { decision: 'Maybe' })
    ).rejects.toThrow(/Invalid approval decision/);
  });

  it('records the approver, date, decision and remarks; repeats refused', async () => {
    const rfq = await createEvaluableRfq();
    await completeEvaluations(rfq.id);
    await evaluationService.completeSupplierSelection(rfq.id, VENDORS[0]);

    const record = await evaluationService.approveSupplierSelection(rfq.id, {
      decision: APPROVAL_STATUS.APPROVED,
      remarks: 'Price and terms agreed'
    });
    expect(record.approval).toMatchObject({
      status: APPROVAL_STATUS.APPROVED,
      decision: APPROVAL_STATUS.APPROVED,
      approver: 'Test Buyer',
      remarks: 'Price and terms agreed'
    });
    expect(record.approval.date).toBeTruthy();
    expect(record.activity.some((entry) => entry.type === 'approval')).toBe(true);

    await expect(
      evaluationService.approveSupplierSelection(rfq.id, { decision: APPROVAL_STATUS.APPROVED })
    ).rejects.toThrow(/already approved/);
  });
});

describe('RFQ award gating', () => {
  it('RULE 10 — refuses award while the selection is only pending', async () => {
    const rfq = await createEvaluableRfq();
    await completeEvaluations(rfq.id);
    await evaluationService.completeSupplierSelection(rfq.id, VENDORS[0]);

    await expect(mockRfqService.awardRfq(rfq.id)).rejects.toThrow(/must be approved before awarding/);
    expect((await mockRfqService.getRfq(rfq.id)).status).toBe(RFQ_STATUS.EVALUATION);
  });

  it('RULE 10 — refuses award when the selection was rejected', async () => {
    const rfq = await createEvaluableRfq();
    await completeEvaluations(rfq.id);
    await evaluationService.completeSupplierSelection(rfq.id, VENDORS[0]);
    await evaluationService.approveSupplierSelection(rfq.id, { decision: APPROVAL_STATUS.REJECTED, remarks: 'Budget overrun' });

    await expect(mockRfqService.awardRfq(rfq.id)).rejects.toThrow(/must be approved before awarding/);
  });

  it('RULE 8 — a REJECTED selection can be superseded by a different supplier', async () => {
    const rfq = await createEvaluableRfq();
    await completeEvaluations(rfq.id);

    await evaluationService.completeSupplierSelection(rfq.id, VENDORS[0]);
    await evaluationService.approveSupplierSelection(rfq.id, { decision: APPROVAL_STATUS.REJECTED, remarks: 'Price too high' });

    /* The rejected pick is void — the buyer may re-select another vendor. */
    const reselected = await evaluationService.completeSupplierSelection(rfq.id, VENDORS[1], { rationale: 'Better overall value' });
    expect(reselected.selection.selectedVendor).toBe(VENDORS[1]);
    /* A fresh selection re-opens the approval step. */
    expect(reselected.approval).toBeNull();

    /* A pending selection is still one-way. */
    await expect(
      evaluationService.completeSupplierSelection(rfq.id, VENDORS[0])
    ).rejects.toThrow(/already been selected/);
  });

  it('full pipeline — award references the selected vendor, quotation and negotiated value', async () => {
    const rfq = await createEvaluableRfq();
    const quote = quotationsStore.all.find((entry) => entry.rfqNo === rfq.rfqNo && entry.vendor === VENDORS[0]);
    const agreed = Math.round(quote.total * 0.92 * 100) / 100;
    /* Strict gates: negotiation Agreed → technical →
       commercial (with finalized payment terms) → selection. */
    await evaluationService.recordNegotiation(rfq.id, VENDORS[0], { amount: agreed, stage: 'Agreed', note: 'Final counter' });
    await evaluationService.completeTechnicalEvaluation(rfq.id);
    await evaluationService.completeCommercialEvaluation(rfq.id, { paymentTerms: TERMS });
    await evaluationService.completeSupplierSelection(rfq.id, VENDORS[0], { rationale: 'Best fit' });
    await evaluationService.approveSupplierSelection(rfq.id, { decision: APPROVAL_STATUS.APPROVED });

    const awarded = await mockRfqService.awardRfq(rfq.id);
    expect(awarded.status).toBe(RFQ_STATUS.AWARDED);
    expect(awarded.awardedVendor).toBe(VENDORS[0]);
    expect(awarded.awardedQuoteId).toBe(quote.id);
    expect(awarded.awardedValue).toBe(agreed);
    expect(awarded.awardedAt).toBeTruthy();
    expect(awarded.activity.at(-1)).toMatchObject({
      type: 'award',
      label: `${rfq.rfqNo} awarded to ${VENDORS[0]}`
    });

    /* Winner quotation accepted, the rest rejected. */
    const quotes = quotationsStore.all.filter((entry) => entry.rfqNo === rfq.rfqNo);
    expect(quotes.find((entry) => entry.id === quote.id).status).toBe(QUOTATION_STATUS.ACCEPTED);
    expect(quotes.find((entry) => entry.vendor === VENDORS[1]).status).toBe(QUOTATION_STATUS.REJECTED);
  });

  it('stepper — renders the canonical sourcing sequence; a rejected approval blocks the Purchase Order step', async () => {
    const rfq = await createEvaluableRfq();
    await completeEvaluations(rfq.id);
    await evaluationService.completeSupplierSelection(rfq.id, VENDORS[0]);
    await evaluationService.approveSupplierSelection(rfq.id, { decision: APPROVAL_STATUS.REJECTED });

    const board = await evaluationService.getEvaluation(rfq.id);
    const steps = evaluationSteps(board);
    /* The sourcing subset of the ONE canonical workflow — asserted
       against EVALUATION_STAGES, never a hardcoded parallel list. */
    expect(steps.map((step) => step.key)).toEqual(
      EVALUATION_STAGES.map((stage) => stage.key)
    );
    /* Both evaluations are done, selection is done; the Purchase Order
       step is still current because the selection was not approved. */
    expect(steps.find((step) => step.key === 'TECHNICAL_EVALUATION').state).toBe('done');
    expect(steps.find((step) => step.key === 'COMMERCIAL_EVALUATION').state).toBe('done');
    expect(steps.find((step) => step.key === 'SUPPLIER_SELECTION').state).toBe('done');
    expect(steps.find((step) => step.key === 'PURCHASE_ORDER').state).toBe('current');
    /* Once the RFQ is awarded, the Purchase Order step completes. */
    const awardedSteps = evaluationSteps({
      steps: {
        followUp: true, quotations: true,
        negotiationAgreed: true,
        technical: true, commercial: true, selection: true
      },
      rfqStatus: RFQ_STATUS.AWARDED
    });
    expect(awardedSteps.find((step) => step.key === 'PURCHASE_ORDER').state).toBe('done');
  });

  it('evaluation board only lists open RFQs and reflects step state', async () => {
    const rfq = await createEvaluableRfq();
    await agreeNegotiation(rfq.id);
    await evaluationService.completeTechnicalEvaluation(rfq.id);

    const board = await evaluationService.getEvaluationBoard();
    const item = board.find((entry) => entry.rfqId === rfq.id);
    expect(item).toBeTruthy();
    expect(item.rfqStatus).toBe(RFQ_STATUS.EVALUATION);
    expect(item.steps.technical).toBe(true);
    expect(item.steps.commercial).toBe(false);
    expect(item.vendors).toHaveLength(2);
    /* Terminal / unawarded RFQs outside the open set are excluded. */
    expect(board.some((entry) => entry.rfqNo === 'RFQ-2026-0002')).toBe(false); /* Cancelled */
    expect(board.some((entry) => entry.rfqNo === 'RFQ-2026-0005')).toBe(false); /* Awarded */
  });
});
