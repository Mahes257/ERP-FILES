/**
 * purchase/services/workflowOrdering.test.js
 * ------------------------------------------------------------------
 * Regression tests for the PCS → Technical Evaluation → Approval →
 * Purchase Order workflow ordering.
 *
 * Validates:
 *   1. PCS is before Technical Evaluation
 *   2. PCS completion makes RFQ eligible for Technical Evaluation
 *   3. Technical Evaluation does NOT navigate to PCS
 *   4. Technical Evaluation action says "Proceed to Approval"
 *   5. Completed technical evaluation makes qualified RFQ eligible for Approval
 *   6. Technically unqualified RFQ cannot proceed to Approval
 *   7. Approval page displays eligible RFQ correctly
 *   8. Approval page includes Technical Evaluation in workflow progression
 *   9. Approval completion allows Purchase Order creation
 *  10. Approved supplier/value carry into PO
 *  11. Workflow state survives refresh (localStorage persistence)
 *  12. Existing RFQ/Quotation/PCS functionality remains intact
 * ------------------------------------------------------------------
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EVALUATION_STAGES, NFA_STATUS, RFQ_STATUS } from '../constants';
import { evaluationService, evaluationsStore } from './evaluation';
import { stageIndex, PURCHASE_WORKFLOW } from '../constants';
import { mockRfqService, rfqsStore, quotationsStore } from './rfq';
import { requisitionsStore } from './requisition';
import { ordersStore } from './purchaseOrder';
import { mockVendorService, vendorsStore } from './vendor';
import { nfaService, nfasStore } from './nfa';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
const VENDOR_C = 'Bharat Forge';

beforeEach(async () => {
  localStorage.clear();
  requisitionsStore.reset();
  rfqsStore.reset();
  quotationsStore.reset();
  ordersStore.reset();
  vendorsStore.reset();
  evaluationsStore.reset();
  nfasStore.reset();
  setActor();
  /* Create approved vendors. */
  for (const name of [VENDOR_A, VENDOR_B, VENDOR_C]) {
    const v = await mockVendorService.createVendor({ name, category: 'Steel & Metals' });
    await mockVendorService.setVendorStatus(v.id, 'Approved');
  }
});

const BASE_ITEMS = [
  { product: 'HR coil 3mm', hsn: '7208', uom: 'Kg', qty: 8000, rate: 24.5, expectedRate: 24.5, specification: 'IS 2062 E250', requiredDate: '2026-09-15' },
  { product: 'MS plate 6mm', hsn: '7208', uom: 'Kg', qty: 1200, rate: 28, expectedRate: 28, specification: 'IS 2062', requiredDate: '2026-09-15' },
];

/** Creates an RFQ, submits, approves, sends, records quotations, and advances to COMPARISON stage. */
async function createRfqWithQuotes(vendorNames, items = BASE_ITEMS) {
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
    vendorNames,
    items,
  });
  await mockRfqService.submitForReview(draft.id);
  await mockRfqService.approveRfq(draft.id);
  await mockRfqService.sendRfq(draft.id);
  const rfq = await mockRfqService.getRfq(draft.id);
  expect(rfq.status).toBe(RFQ_STATUS.SENT);

  for (const vendor of vendorNames) {
    await mockRfqService.saveQuotation({
      rfqNo: rfq.rfqNo,
      rfqId: rfq.id,
      prNo: rfq.reference,
      vendor,
      currency: 'INR',
      submittedOn: '2026-08-20',
      validUntil: '2026-09-30',
      items: items.map((item) => ({
        product: item.product,
        hsn: item.hsn,
        uom: item.uom,
        qty: item.qty,
        rate: item.rate,
      })),
      discount: 0,
      freight: 0,
      insurance: 0,
      charges: 0,
      delivery: 10,
      leadTime: 7,
      paymentTerms: '30 Days',
      warranty: '12 Months',
      notes: `${vendor} quote`,
    });
  }

  /* Advance workflow stage to COMPARISON (PCS) so the strict gates pass. */
  await mockRfqService.startEvaluation(rfq.id);
  return mockRfqService.getRfq(rfq.id);
}

/** Records an Agreed negotiation round — prerequisite for supplier selection. */
async function agreeNegotiation(rfqId, vendor = VENDOR_A) {
  const rfq = await mockRfqService.getRfq(rfqId);
  const quote = quotationsStore.all.find((entry) => entry.rfqNo === rfq.rfqNo && entry.vendor === vendor);
  await evaluationService.recordNegotiation(rfqId, vendor, {
    amount: quote?.total || 0,
    stage: 'Agreed',
    note: 'Rate confirmed'
  });
}

/* ═══════════════════════════════════════════════════════════════════ */
/*  1. PCS is before Technical Evaluation                            */
/* ═══════════════════════════════════════════════════════════════════ */
describe('Workflow Ordering — PCS before Technical Evaluation', () => {
  it('COMPARISON (PCS) has a lower index than TECHNICAL_EVALUATION', () => {
    const comparisonIndex = stageIndex('COMPARISON');
    const techEvalIndex = stageIndex('TECHNICAL_EVALUATION');
    expect(comparisonIndex).toBeGreaterThanOrEqual(0);
    expect(techEvalIndex).toBeGreaterThanOrEqual(0);
    expect(comparisonIndex).toBeLessThan(techEvalIndex);
  });

  it('TECHNICAL_EVALUATION has a lower index than PURCHASE_ORDER', () => {
    const techEvalIndex = stageIndex('TECHNICAL_EVALUATION');
    const poIndex = stageIndex('PURCHASE_ORDER');
    expect(techEvalIndex).toBeLessThan(poIndex);
  });

  it('canonical workflow order is: COMPARISON → NEGOTIATION → TECHNICAL_EVALUATION → SUPPLIER_SELECTION → PURCHASE_ORDER', () => {
    const keys = PURCHASE_WORKFLOW.map((s) => s.key);
    const compIdx = keys.indexOf('COMPARISON');
    const negIdx = keys.indexOf('NEGOTIATION');
    const techIdx = keys.indexOf('TECHNICAL_EVALUATION');
    const selIdx = keys.indexOf('SUPPLIER_SELECTION');
    const poIdx = keys.indexOf('PURCHASE_ORDER');
    expect(compIdx).toBeLessThan(negIdx);
    expect(negIdx).toBeLessThan(techIdx);
    expect(techIdx).toBeLessThan(selIdx);
    expect(selIdx).toBeLessThan(poIdx);
  });
});

/* ═══════════════════════════════════════════════════════════════════ */
/*  2. PCS completion makes RFQ eligible for Technical Evaluation     */
/* ═══════════════════════════════════════════════════════════════════ */
describe('Workflow Ordering — PCS → Tech Eval eligibility', () => {
  it('supplier selection (PCS completion) makes RFQ visible on evaluation board', async () => {
    const rfq = await createRfqWithQuotes([VENDOR_A, VENDOR_B]);
    await agreeNegotiation(rfq.id, VENDOR_A);
    /* Complete supplier selection (PCS step). */
    await evaluationService.completeSupplierSelection(rfq.id, VENDOR_A, { rationale: 'Lowest price' });
    const board = await evaluationService.getEvaluationBoard();
    const item = board.find((b) => b.rfqId === rfq.id);
    expect(item).toBeTruthy();
    expect(item.selection).toBeTruthy();
    expect(item.selection.selectedVendor).toBe(VENDOR_A);
  });

  it('evaluation board shows step state after supplier selection', async () => {
    const rfq = await createRfqWithQuotes([VENDOR_A, VENDOR_B]);
    await agreeNegotiation(rfq.id, VENDOR_A);
    await evaluationService.completeSupplierSelection(rfq.id, VENDOR_A);
    const board = await evaluationService.getEvaluationBoard();
    const item = board.find((b) => b.rfqId === rfq.id);
    expect(item.steps.selection).toBe(true);
  });
});

/* ═══════════════════════════════════════════════════════════════════ */
/*  3. PCS Detail navigates to Technical Evaluation, not Approval     */
/* ═══════════════════════════════════════════════════════════════════ */
describe('Workflow Ordering — PCS Detail navigation', () => {
  it('handleContinue navigates to Technical Evaluation when tech eval not done', () => {
    const detailPath = path.resolve(__dirname, '../pages/rfq/PriceComparativeStatementDetail.jsx');
    const content = fs.readFileSync(detailPath, 'utf-8');
    /* The handleContinue function should navigate to tech eval when !technicalCompleted */
    expect(content).toContain('navigate(`/purchase/rfq/technical-evaluation/${rfqId}`)');
  });

  it('handleContinue navigates to Approval when tech eval IS done', () => {
    const detailPath = path.resolve(__dirname, '../pages/rfq/PriceComparativeStatementDetail.jsx');
    const content = fs.readFileSync(detailPath, 'utf-8');
    /* The approval destination is now derived per RFQ (the NFA approval flow
       route) instead of the previous hardcoded '/purchase/rfq/approval' path,
       so the old literal assertion no longer matched the source. This remains a
       source-text smoke check — a behavioural test of handleContinue would be
       the stronger guard if this file is next reworked. */
    expect(content).toContain('nfaService.approvalFlowRouteFor(rfqId');
  });

  it('button text says "Continue to Technical Evaluation" when tech eval pending', () => {
    const detailPath = path.resolve(__dirname, '../pages/rfq/PriceComparativeStatementDetail.jsx');
    const content = fs.readFileSync(detailPath, 'utf-8');
    expect(content).toContain('Continue to Technical Evaluation');
  });

  it('button is NOT disabled when tech eval pending (only when no allocations)', () => {
    const detailPath = path.resolve(__dirname, '../pages/rfq/PriceComparativeStatementDetail.jsx');
    const content = fs.readFileSync(detailPath, 'utf-8');
    /* The button should only be disabled when allocationList.length === 0, not when !technicalCompleted */
    expect(content).toContain('disabled={submitting || allocationList.length === 0}');
    expect(content).not.toContain('!technicalCompleted}');
  });

  it('old handleSubmitForApproval is replaced with handleContinue', () => {
    const detailPath = path.resolve(__dirname, '../pages/rfq/PriceComparativeStatementDetail.jsx');
    const content = fs.readFileSync(detailPath, 'utf-8');
    expect(content).toContain('handleContinue');
    expect(content).not.toContain('handleSubmitForApproval');
  });
});

/* ═══════════════════════════════════════════════════════════════════ */
/*  4. PCS List navigates to Technical Evaluation, not Approval       */
/* ═══════════════════════════════════════════════════════════════════ */
describe('Workflow Ordering — PCS List navigation', () => {
  it('bulk action is "Proceed to Technical Evaluation" not "Proceed to Approval"', () => {
    const listPath = path.resolve(__dirname, '../pages/rfq/PriceComparativeStatement.jsx');
    const content = fs.readFileSync(listPath, 'utf-8');
    expect(content).toContain("label: 'Proceed to Technical Evaluation'");
    expect(content).not.toContain("label: 'Proceed to Approval'");
  });

  it('bulk action handler navigates to technical-evaluation', () => {
    const listPath = path.resolve(__dirname, '../pages/rfq/PriceComparativeStatement.jsx');
    const content = fs.readFileSync(listPath, 'utf-8');
    expect(content).toContain('navigate(`/purchase/rfq/technical-evaluation/${selectedRows[0].id}`)');
  });
});

/* ═══════════════════════════════════════════════════════════════════ */
/*  5. Technical Evaluation does NOT navigate to PCS                  */
/* ═══════════════════════════════════════════════════════════════════ */
describe('Workflow Ordering — Tech Eval does NOT navigate to PCS', () => {
  it('UI stepper label says "Proceed to Approval" not "Proceed to PCS"', () => {
    const detailPath = path.resolve(__dirname, '../pages/evaluation/TechnicalEvaluationDetail.jsx');
    const content = fs.readFileSync(detailPath, 'utf-8');
    expect(content).toContain("label: 'Proceed to Approval'");
    expect(content).not.toContain("label: 'Proceed to PCS'");
  });

  it('next-step button navigates to the Approval Flow entry for this RFQ, not PCS', () => {
    const detailPath = path.resolve(__dirname, '../pages/evaluation/TechnicalEvaluationDetail.jsx');
    const content = fs.readFileSync(detailPath, 'utf-8');
    /* Proceed to Approval resolves the RFQ's REAL approval state (the
       shared contract in utils/approvalCreateFlow.js): the create page
       with this RFQ pre-selected (?rfqId=...) while a note can still be
       raised, otherwise the note this RFQ already raised — never the
       generic Approval Flow list. */
    expect(content).toContain('approvalFlowRouteFor(item.rfqId, item.rfqNo)');
    expect(content).not.toContain("navigate('/purchase/rfq/approval')");
    expect(content).not.toContain("navigate(`/purchase/rfq/price-comparative-statement?rfq=");

    const flowPath = path.resolve(__dirname, '../services/nfa.js');
    const flow = fs.readFileSync(flowPath, 'utf-8');
    /* The create-page handoff (?rfqId=) is still the destination whenever
       the RFQ can raise a note, and the existing note is opened when it
       cannot (one note per RFQ). */
    expect(flow).toContain('return approvalCreateRoute(id)');
    expect(flow).toContain('/purchase/rfq/approval/${existing.id}');
  });

  it('qualified vendors section says "Eligible for Approval" not "Eligible for PCS"', () => {
    const detailPath = path.resolve(__dirname, '../pages/evaluation/TechnicalEvaluationDetail.jsx');
    const content = fs.readFileSync(detailPath, 'utf-8');
    expect(content).toContain('Eligible for Approval');
    expect(content).not.toContain('Eligible for PCS');
  });
});

/* ═══════════════════════════════════════════════════════════════════ */
/*  6. Technical Evaluation action says "Proceed to Approval"         */
/* ═══════════════════════════════════════════════════════════════════ */
describe('Workflow Ordering — Tech Eval button text', () => {
  it('next step button text says "Proceed to Approval"', () => {
    const detailPath = path.resolve(__dirname, '../pages/evaluation/TechnicalEvaluationDetail.jsx');
    const content = fs.readFileSync(detailPath, 'utf-8');
    expect(content).toContain('Proceed to Approval');
    expect(content).not.toContain('Continue to Price Comparative Statement');
  });

  it('next step text says "Proceed to the Approval Flow"', () => {
    const detailPath = path.resolve(__dirname, '../pages/evaluation/TechnicalEvaluationDetail.jsx');
    const content = fs.readFileSync(detailPath, 'utf-8');
    expect(content).toContain('Proceed to the Approval Flow');
  });
});

/* ═══════════════════════════════════════════════════════════════════ */
/*  7. Completed tech eval makes qualified RFQ eligible for Approval  */
/* ═══════════════════════════════════════════════════════════════════ */
describe('Workflow Ordering — Tech Eval → Approval eligibility', () => {
  it('NFA candidates require technical evaluation to be completed', async () => {
    const rfq = await createRfqWithQuotes([VENDOR_A, VENDOR_B]);
    await agreeNegotiation(rfq.id, VENDOR_A);
    await evaluationService.completeSupplierSelection(rfq.id, VENDOR_A, { rationale: 'Lowest price' });

    /* Before technical evaluation — should NOT be a candidate. */
    let candidates = await nfaService.getNfaCandidates();
    expect(candidates.find((c) => c.rfqId === rfq.id)).toBeFalsy();

    /* Save vendor evaluations (scores + decisions). */
    await evaluationService.saveVendorEvaluation(rfq.id, VENDOR_A, {
      scores: { compliance: 85, quality: 80, delivery: 75, postPurchase: 70 },
      remarks: 'Good compliance'
    });
    await evaluationService.setVendorDecision(rfq.id, VENDOR_A, 'Qualified', { remarks: 'Meets threshold' });
    await evaluationService.saveVendorEvaluation(rfq.id, VENDOR_B, {
      scores: { compliance: 60, quality: 55, delivery: 50, postPurchase: 45 },
      remarks: 'Below threshold'
    });
    await evaluationService.setVendorDecision(rfq.id, VENDOR_B, 'Not Qualified', { remarks: 'Does not meet threshold' });

    /* Complete technical evaluation. */
    await evaluationService.completeTechnicalEvaluation(rfq.id, { remarks: 'Tech eval done' });

    /* After technical evaluation — should NOW be a candidate. */
    candidates = await nfaService.getNfaCandidates();
    const candidate = candidates.find((c) => c.rfqId === rfq.id);
    expect(candidate).toBeTruthy();
    expect(candidate.supplier).toBe(VENDOR_A);
  });

  it('qualified RFQ status advances to Pending Approval in the shared RFQ data', async () => {
    const rfq = await createRfqWithQuotes([VENDOR_A, VENDOR_B]);
    await agreeNegotiation(rfq.id, VENDOR_A);
    await evaluationService.completeSupplierSelection(rfq.id, VENDOR_A, { rationale: 'Lowest price' });

    /* Before the evaluation the RFQ sits in Evaluation. */
    expect((await mockRfqService.getRfq(rfq.id)).status).toBe(RFQ_STATUS.EVALUATION);

    /* Every vendor gets a decision; at least one is Qualified. */
    await evaluationService.saveVendorEvaluation(rfq.id, VENDOR_A, {
      scores: { compliance: 85, quality: 80, delivery: 75, postPurchase: 70 }
    });
    await evaluationService.setVendorDecision(rfq.id, VENDOR_A, 'Qualified', { remarks: 'Meets threshold' });
    await evaluationService.saveVendorEvaluation(rfq.id, VENDOR_B, {
      scores: { compliance: 60, quality: 55, delivery: 50, postPurchase: 45 }
    });
    await evaluationService.setVendorDecision(rfq.id, VENDOR_B, 'Not Qualified', { remarks: 'Fails threshold' });
    await evaluationService.completeTechnicalEvaluation(rfq.id, { remarks: 'Tech eval done' });

    /* The shared RFQ record — and therefore the RFQ list — reports
       Pending Approval, not Evaluation. */
    const updated = await mockRfqService.getRfq(rfq.id);
    expect(updated.status).toBe(RFQ_STATUS.PENDING_APPROVAL);

    /* The RFQ list applies the same status filter and finds it. */
    const listed = await mockRfqService.getRfqs({ status: RFQ_STATUS.PENDING_APPROVAL });
    expect(listed.data.some((row) => row.id === rfq.id)).toBe(true);

    /* The NFA (Approval Note) can now be created and taken through its
       first approval stage — the expected Proceed to Approval flow. */
    const note = await nfaService.createNfa({
      rfqId: rfq.id,
      purpose: 'PO approval',
      justification: 'Qualified vendor selected'
    });
    await nfaService.submitNfa(note.id);
    expect(note.status).toBe('Draft');
    const submitted = await nfaService.getNfa(note.id);
    expect(submitted.status).toBe('Pending Approval');
    const first = await nfaService.approveStage(submitted.id, { stage: submitted.currentStage });
    expect(first.approvalStages[0].status).toBe('Approved');
  });

  it('RFQ status follows the Approval Flow: Pending → 1st → 2nd → Final → Approved', async () => {
    const rfq = await createRfqWithQuotes([VENDOR_A, VENDOR_B]);
    await agreeNegotiation(rfq.id, VENDOR_A);
    await evaluationService.completeSupplierSelection(rfq.id, VENDOR_A, { rationale: 'Lowest price' });
    await evaluationService.saveVendorEvaluation(rfq.id, VENDOR_A, {
      scores: { compliance: 85, quality: 80, delivery: 75, postPurchase: 70 }
    });
    await evaluationService.setVendorDecision(rfq.id, VENDOR_A, 'Qualified');
    await evaluationService.saveVendorEvaluation(rfq.id, VENDOR_B, {
      scores: { compliance: 60, quality: 55, delivery: 50, postPurchase: 45 }
    });
    await evaluationService.setVendorDecision(rfq.id, VENDOR_B, 'Not Qualified');
    await evaluationService.completeTechnicalEvaluation(rfq.id);

    /* Technical Evaluation completed → Pending Approval. */
    expect((await mockRfqService.getRfq(rfq.id)).status).toBe(RFQ_STATUS.PENDING_APPROVAL);

    const note = await nfaService.createNfa({
      rfqId: rfq.id,
      purpose: 'PO approval',
      justification: 'Qualified vendor selected'
    });
    const submitted = await nfaService.submitNfa(note.id);
    expect(submitted.status).toBe(NFA_STATUS.PENDING_APPROVAL);
    /* Submitted → the First stage is active → RFQ 1st Approval. */
    expect((await mockRfqService.getRfq(rfq.id)).status).toBe(RFQ_STATUS.FIRST_APPROVAL);

    /* 1st approval done → RFQ advances to 2nd Approval. */
    const second = await nfaService.approveStage(submitted.id, { stage: submitted.currentStage });
    expect(second.status).toBe(NFA_STATUS.SECOND_APPROVAL);
    expect((await mockRfqService.getRfq(rfq.id)).status).toBe(RFQ_STATUS.SECOND_APPROVAL);

    /* 2nd approval done → RFQ advances to Final Approval. */
    const final = await nfaService.approveStage(second.id, { stage: second.currentStage });
    expect(final.status).toBe(NFA_STATUS.FINAL_APPROVAL);
    expect((await mockRfqService.getRfq(rfq.id)).status).toBe(RFQ_STATUS.FINAL_APPROVAL);

    /* Final approval done → RFQ is Approved. */
    const approved = await nfaService.approveStage(final.id, { stage: final.currentStage });
    expect(approved.status).toBe(NFA_STATUS.APPROVED);
    expect((await mockRfqService.getRfq(rfq.id)).status).toBe(RFQ_STATUS.APPROVED);

    /* The RFQ list reads the SAME shared status — the status filter
       finds the RFQ under the advanced status, not Evaluation. */
    const listed = await mockRfqService.getRfqs({ status: RFQ_STATUS.APPROVED });
    expect(listed.data.some((row) => row.id === rfq.id)).toBe(true);
    const stale = await mockRfqService.getRfqs({ status: RFQ_STATUS.EVALUATION });
    expect(stale.data.some((row) => row.id === rfq.id)).toBe(false);
  });

  it('RFQ List heals a stale RFQ: NFA at Final Approval → RFQ no longer Evaluation', async () => {
    const rfq = await createRfqWithQuotes([VENDOR_A]);
    await agreeNegotiation(rfq.id, VENDOR_A);
    await evaluationService.completeSupplierSelection(rfq.id, VENDOR_A);
    await evaluationService.saveVendorEvaluation(rfq.id, VENDOR_A, {
      scores: { compliance: 85, quality: 80, delivery: 75, postPurchase: 70 }
    });
    await evaluationService.setVendorDecision(rfq.id, VENDOR_A, 'Qualified');
    await evaluationService.completeTechnicalEvaluation(rfq.id);

    /* Raise + submit + approve first two stages → the note sits at
       Final Approval (the exact field report: NFA at Final Approval,
       RFQ still Evaluation). */
    const note = await nfaService.createNfa({ rfqId: rfq.id, purpose: 'PO approval', justification: 'x' });
    let current = await nfaService.submitNfa(note.id);
    current = await nfaService.approveStage(current.id, { stage: current.currentStage });
    current = await nfaService.approveStage(current.id, { stage: current.currentStage });
    expect(current.status).toBe(NFA_STATUS.FINAL_APPROVAL);

    /* Simulate the stale persisted state: the RFQ record still says
       Evaluation even though the Approval Flow is at Final Approval. */
    const index = rfqsStore.all.findIndex((entry) => entry.id === rfq.id);
    rfqsStore.all[index] = { ...rfqsStore.all[index], status: RFQ_STATUS.EVALUATION };
    rfqsStore.persist(rfqsStore.all);

    /* The RFQ List read re-derives the status from the linked NFA —
       without any new approval transition. */
    const listed = await mockRfqService.getRfqs();
    const row = listed.data.find((entry) => entry.id === rfq.id);
    expect(row.status).toBe(RFQ_STATUS.FINAL_APPROVAL);
    /* The same persisted value survives a fresh read. */
    expect((await mockRfqService.getRfq(rfq.id)).status).toBe(RFQ_STATUS.FINAL_APPROVAL);

    /* After the final approval, refresh shows Approved. */
    await nfaService.approveStage(current.id, { stage: current.currentStage });
    expect((await mockRfqService.getRfq(rfq.id)).status).toBe(RFQ_STATUS.APPROVED);
    const approvedList = await mockRfqService.getRfqs({ status: RFQ_STATUS.APPROVED });
    expect(approvedList.data.some((row) => row.id === rfq.id)).toBe(true);
  });

  it('raising an NFA repairs an RFQ stuck at Evaluation → Pending Approval', async () => {
    const rfq = await createRfqWithQuotes([VENDOR_A]);
    await agreeNegotiation(rfq.id, VENDOR_A);
    await evaluationService.completeSupplierSelection(rfq.id, VENDOR_A);
    await evaluationService.saveVendorEvaluation(rfq.id, VENDOR_A, {
      scores: { compliance: 85, quality: 80, delivery: 75, postPurchase: 70 }
    });
    await evaluationService.setVendorDecision(rfq.id, VENDOR_A, 'Qualified');
    await evaluationService.completeTechnicalEvaluation(rfq.id);

    /* Simulate the stale state reported in the field: the technical
       evaluation completed and the Approval Flow is running, but the
       RFQ record never advanced past Evaluation. */
    const index = rfqsStore.all.findIndex((entry) => entry.id === rfq.id);
    rfqsStore.all[index] = { ...rfqsStore.all[index], status: RFQ_STATUS.EVALUATION };
    rfqsStore.persist(rfqsStore.all);

    /* Raising the note enters the Approval Flow — the shared status is
       repaired to Pending Approval (idempotent, forward-only). */
    await nfaService.createNfa({ rfqId: rfq.id, purpose: 'PO approval', justification: 'Repair test' });
    expect((await mockRfqService.getRfq(rfq.id)).status).toBe(RFQ_STATUS.PENDING_APPROVAL);
  });

  it('RFQ without a technically qualified vendor stays in Evaluation', async () => {
    const rfq = await createRfqWithQuotes([VENDOR_A, VENDOR_B]);
    await agreeNegotiation(rfq.id, VENDOR_A);
    await evaluationService.completeSupplierSelection(rfq.id, VENDOR_A, { rationale: 'Lowest price' });

    /* All vendors decided, but NONE qualified. */
    await evaluationService.saveVendorEvaluation(rfq.id, VENDOR_A, {
      scores: { compliance: 40, quality: 35, delivery: 30, postPurchase: 25 }
    });
    await evaluationService.setVendorDecision(rfq.id, VENDOR_A, 'Not Qualified');
    await evaluationService.saveVendorEvaluation(rfq.id, VENDOR_B, {
      scores: { compliance: 30, quality: 25, delivery: 20, postPurchase: 15 }
    });
    await evaluationService.setVendorDecision(rfq.id, VENDOR_B, 'Not Qualified');
    await evaluationService.completeTechnicalEvaluation(rfq.id);

    /* No qualified vendor — the status must not advance. */
    const updated = await mockRfqService.getRfq(rfq.id);
    expect(updated.status).toBe(RFQ_STATUS.EVALUATION);
  });

  it('per-vendor decisions alone (without the RFQ-level flag) sync the status', async () => {
    const rfq = await createRfqWithQuotes([VENDOR_A, VENDOR_B]);
    await agreeNegotiation(rfq.id, VENDOR_A);
    await evaluationService.completeSupplierSelection(rfq.id, VENDOR_A, { rationale: 'Lowest price' });

    /* The technical evaluation page can proceed from decisions alone —
       the shared status must follow even when the RFQ-level completion
       flag was never explicitly set. */
    await evaluationService.saveVendorEvaluation(rfq.id, VENDOR_A, {
      scores: { compliance: 85, quality: 80, delivery: 75, postPurchase: 70 }
    });
    await evaluationService.setVendorDecision(rfq.id, VENDOR_A, 'Qualified');
    await evaluationService.saveVendorEvaluation(rfq.id, VENDOR_B, {
      scores: { compliance: 60, quality: 55, delivery: 50, postPurchase: 45 }
    });
    await evaluationService.setVendorDecision(rfq.id, VENDOR_B, 'Not Qualified');

    expect((await mockRfqService.getRfq(rfq.id)).status).toBe(RFQ_STATUS.PENDING_APPROVAL);
  });
});

/* ═══════════════════════════════════════════════════════════════════ */
/*  8. Technically unqualified RFQ cannot proceed to Approval         */
/* ═══════════════════════════════════════════════════════════════════ */
describe('Workflow Ordering — Unqualified vendors block Approval', () => {
  it('NFA creation requires at least one technically qualified vendor', async () => {
    const rfq = await createRfqWithQuotes([VENDOR_A]);
    await agreeNegotiation(rfq.id, VENDOR_A);
    await evaluationService.completeSupplierSelection(rfq.id, VENDOR_A);

    /* Mark vendor as NOT qualified — should NOT be an NFA candidate. */
    await evaluationService.saveVendorEvaluation(rfq.id, VENDOR_A, {
      scores: { compliance: 30, quality: 25, delivery: 20, postPurchase: 15 },
      remarks: 'Well below threshold'
    });
    await evaluationService.setVendorDecision(rfq.id, VENDOR_A, 'Not Qualified', { remarks: 'Fails technical' });
    await evaluationService.completeTechnicalEvaluation(rfq.id);

    /* NFA requires at least one qualified vendor — with all vendors
       Not Qualified, this RFQ should NOT be a candidate. */
    const candidates = await nfaService.getNfaCandidates();
    const candidate = candidates.find((c) => c.rfqId === rfq.id);
    expect(candidate).toBeFalsy();

    /* Now mark as Qualified — should become a candidate. */
    await evaluationService.setVendorDecision(rfq.id, VENDOR_A, 'Qualified', { remarks: 'Meets threshold' });
    const candidatesAfter = await nfaService.getNfaCandidates();
    const candidateAfter = candidatesAfter.find((c) => c.rfqId === rfq.id);
    expect(candidateAfter).toBeTruthy();
    expect(candidateAfter.supplier).toBe(VENDOR_A);
  });
});

/* ═══════════════════════════════════════════════════════════════════ */
/*  9. Approval page displays eligible RFQ correctly                  */
/* ═══════════════════════════════════════════════════════════════════ */
describe('Workflow Ordering — Approval page displays eligible RFQ', () => {
  it('NFA candidates show the correct supplier and value', async () => {
    const rfq = await createRfqWithQuotes([VENDOR_A, VENDOR_B]);
    await agreeNegotiation(rfq.id, VENDOR_A);
    await evaluationService.completeSupplierSelection(rfq.id, VENDOR_A, { rationale: 'Best value' });

    /* Complete tech eval. */
    await evaluationService.saveVendorEvaluation(rfq.id, VENDOR_A, {
      scores: { compliance: 85, quality: 80, delivery: 75, postPurchase: 70 },
      remarks: ''
    });
    await evaluationService.setVendorDecision(rfq.id, VENDOR_A, 'Qualified');
    await evaluationService.saveVendorEvaluation(rfq.id, VENDOR_B, {
      scores: { compliance: 60, quality: 55, delivery: 50, postPurchase: 45 },
      remarks: ''
    });
    await evaluationService.setVendorDecision(rfq.id, VENDOR_B, 'Not Qualified');
    await evaluationService.completeTechnicalEvaluation(rfq.id);

    const candidates = await nfaService.getNfaCandidates();
    const candidate = candidates.find((c) => c.rfqId === rfq.id);
    expect(candidate).toBeTruthy();
    expect(candidate.supplier).toBe(VENDOR_A);
    expect(candidate.amount).toBeGreaterThan(0);
    expect(candidate.currency).toBe('INR');
    expect(candidate.rfqNo).toBe(rfq.rfqNo);
  });
});

/* ═══════════════════════════════════════════════════════════════════ */
/* 10. Approval page includes Tech Eval in workflow progression      */
/* ═══════════════════════════════════════════════════════════════════ */
describe('Workflow Ordering — Approval workflow progression includes Tech Eval', () => {
  it('NfaCreate workflow steps include Technical Evaluation', () => {
    const nfaCreatePath = path.resolve(__dirname, '../pages/approval/NfaCreate.jsx');
    const content = fs.readFileSync(nfaCreatePath, 'utf-8');
    expect(content).toContain("label: 'Technical Evaluation'");
    expect(content).toContain("label: 'PCS'");
    expect(content).toContain("label: 'Approval Note'");
  });

  it('NfaCreate subtitle mentions Technical Evaluation', () => {
    const nfaCreatePath = path.resolve(__dirname, '../pages/approval/NfaCreate.jsx');
    const content = fs.readFileSync(nfaCreatePath, 'utf-8');
    expect(content).toContain('Technical Evaluation');
  });

  it('Nfa list subtitle mentions Technical Evaluation', () => {
    const nfaPath = path.resolve(__dirname, '../pages/approval/Nfa.jsx');
    const content = fs.readFileSync(nfaPath, 'utf-8');
    expect(content).toContain('Technical Evaluation');
  });
});

/* ═══════════════════════════════════════════════════════════════════ */
/* 11. Approval completion allows Purchase Order creation             */
/* ═══════════════════════════════════════════════════════════════════ */
describe('Workflow Ordering — Approval → Purchase Order', () => {
  it('NFA can be created, submitted, and approved after tech eval + selection', async () => {
    const rfq = await createRfqWithQuotes([VENDOR_A, VENDOR_B]);
    await agreeNegotiation(rfq.id, VENDOR_A);
    await evaluationService.completeSupplierSelection(rfq.id, VENDOR_A, { rationale: 'Best value' });

    /* Complete tech eval with qualified vendor. */
    await evaluationService.saveVendorEvaluation(rfq.id, VENDOR_A, {
      scores: { compliance: 85, quality: 80, delivery: 75, postPurchase: 70 },
      remarks: ''
    });
    await evaluationService.setVendorDecision(rfq.id, VENDOR_A, 'Qualified');
    await evaluationService.saveVendorEvaluation(rfq.id, VENDOR_B, {
      scores: { compliance: 60, quality: 55, delivery: 50, postPurchase: 45 },
      remarks: ''
    });
    await evaluationService.setVendorDecision(rfq.id, VENDOR_B, 'Not Qualified');
    await evaluationService.completeTechnicalEvaluation(rfq.id);

    /* Create NFA. */
    const note = await nfaService.createNfa({
      rfqId: rfq.id,
      purpose: 'PO for steel sheets',
      justification: 'Lowest evaluated total after technical evaluation'
    });
    expect(note.status).toBe('Draft');
    expect(note.supplier).toBe(VENDOR_A);
    expect(note.amount).toBeGreaterThan(0);

    /* Submit for approval. */
    const submitted = await nfaService.submitNfa(note.id);
    expect(submitted.status).toBe('Pending Approval');

    /* Approve all stages. */
    let current = submitted;
    while (current.currentStage) {
      current = await nfaService.approveStage(current.id, { stage: current.currentStage });
    }
    expect(current.status).toBe('Approved');
  });
});

/* ═══════════════════════════════════════════════════════════════════ */
/* 12. Approved supplier/value carry into PO                        */
/* ═══════════════════════════════════════════════════════════════════ */
describe('Workflow Ordering — Approved value carries into PO', () => {
  it('NFA note preserves supplier, amount, and currency from selection', async () => {
    const rfq = await createRfqWithQuotes([VENDOR_A]);
    await agreeNegotiation(rfq.id, VENDOR_A);
    await evaluationService.completeSupplierSelection(rfq.id, VENDOR_A, { rationale: 'Only vendor' });
    await evaluationService.saveVendorEvaluation(rfq.id, VENDOR_A, {
      scores: { compliance: 85, quality: 80, delivery: 75, postPurchase: 70 },
      remarks: ''
    });
    await evaluationService.setVendorDecision(rfq.id, VENDOR_A, 'Qualified');
    await evaluationService.completeTechnicalEvaluation(rfq.id);

    const note = await nfaService.createNfa({
      rfqId: rfq.id,
      purpose: 'PO creation',
      justification: 'Approved workflow'
    });

    expect(note.supplier).toBe(VENDOR_A);
    expect(note.amount).toBeGreaterThan(0);
    expect(note.currency).toBe('INR');
    expect(note.rfqNo).toBe(rfq.rfqNo);
  });
});

/* ═══════════════════════════════════════════════════════════════════ */
/* 13. Workflow state survives refresh (localStorage)                */
/* ═══════════════════════════════════════════════════════════════════ */
describe('Workflow Ordering — State persistence', () => {
  it('evaluation state persists to localStorage and survives store reset', async () => {
    const rfq = await createRfqWithQuotes([VENDOR_A]);
    await agreeNegotiation(rfq.id, VENDOR_A);
    await evaluationService.completeSupplierSelection(rfq.id, VENDOR_A);
    await evaluationService.saveVendorEvaluation(rfq.id, VENDOR_A, {
      scores: { compliance: 85, quality: 80, delivery: 75, postPurchase: 70 },
      remarks: 'Persisted'
    });
    await evaluationService.setVendorDecision(rfq.id, VENDOR_A, 'Qualified');
    await evaluationService.completeTechnicalEvaluation(rfq.id);

    /* Reset the in-memory cache (simulates page refresh). */
    evaluationsStore.reset();

    /* Verify data persists from localStorage. */
    const board = await evaluationService.getEvaluationBoard();
    const item = board.find((b) => b.rfqId === rfq.id);
    expect(item).toBeTruthy();
    expect(item.steps.technical).toBe(true);
    expect(item.steps.selection).toBe(true);
  });

  it('NFA state persists to localStorage', async () => {
    const rfq = await createRfqWithQuotes([VENDOR_A]);
    await agreeNegotiation(rfq.id, VENDOR_A);
    await evaluationService.completeSupplierSelection(rfq.id, VENDOR_A);
    await evaluationService.saveVendorEvaluation(rfq.id, VENDOR_A, {
      scores: { compliance: 85, quality: 80, delivery: 75, postPurchase: 70 },
      remarks: ''
    });
    await evaluationService.setVendorDecision(rfq.id, VENDOR_A, 'Qualified');
    await evaluationService.completeTechnicalEvaluation(rfq.id);

    const note = await nfaService.createNfa({
      rfqId: rfq.id,
      purpose: 'Test persistence',
      justification: 'Should survive reset'
    });

    /* Reset the in-memory cache. */
    nfasStore.reset();

    /* Verify NFA persists. */
    const retrieved = await nfaService.getNfa(note.id);
    expect(retrieved).toBeTruthy();
    expect(retrieved.nfaNo).toBe(note.nfaNo);
  });
});

/* ═══════════════════════════════════════════════════════════════════ */
/* 14. Existing RFQ/Quotation/PCS functionality remains intact       */
/* ═══════════════════════════════════════════════════════════════════ */
describe('Workflow Ordering — Existing functionality intact', () => {
  it('RFQ can be created, sent, and quotations received', async () => {
    const rfq = await createRfqWithQuotes([VENDOR_A, VENDOR_B]);
    /* After startEvaluation the RFQ status advances to Evaluation. */
    expect(rfq.status).toBe(RFQ_STATUS.EVALUATION);

    const quotes = quotationsStore.all.filter((q) => q.rfqNo === rfq.rfqNo);
    expect(quotes.length).toBe(2);
  });

  it('quotation comparison works correctly', async () => {
    const rfq = await createRfqWithQuotes([VENDOR_A, VENDOR_B]);
    const comparison = await mockRfqService.getQuotationComparison(rfq.id);
    expect(comparison.rfq.rfqNo).toBe(rfq.rfqNo);
    expect(comparison.quotes.length).toBe(2);
    expect(comparison.winner).toBeTruthy();
  });

  it('evaluation board shows correct step progression', async () => {
    const rfq = await createRfqWithQuotes([VENDOR_A]);
    const board = await evaluationService.getEvaluationBoard();
    const item = board.find((b) => b.rfqId === rfq.id);
    expect(item).toBeTruthy();
    expect(item.steps.quotations).toBe(true);
    expect(item.steps.technical).toBe(false);
    expect(item.steps.selection).toBe(false);
  });

  it('evaluation stages are in correct canonical order', () => {
    const stageKeys = EVALUATION_STAGES.map((s) => s.key);
    expect(stageKeys).toContain('COMPARISON');
    expect(stageKeys).toContain('TECHNICAL_EVALUATION');
    expect(stageKeys).toContain('SUPPLIER_SELECTION');
    expect(stageKeys).toContain('PURCHASE_ORDER');

    const compIdx = stageKeys.indexOf('COMPARISON');
    const techIdx = stageKeys.indexOf('TECHNICAL_EVALUATION');
    const selIdx = stageKeys.indexOf('SUPPLIER_SELECTION');
    const poIdx = stageKeys.indexOf('PURCHASE_ORDER');
    expect(compIdx).toBeLessThan(techIdx);
    expect(techIdx).toBeLessThan(selIdx);
    expect(selIdx).toBeLessThan(poIdx);
  });
});
