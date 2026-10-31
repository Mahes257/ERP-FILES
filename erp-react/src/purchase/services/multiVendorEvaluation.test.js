/**
 * purchase/services/multiVendorEvaluation.test.js
 * Regression tests for multi-vendor Technical Evaluation workflow.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { evaluationService, evaluationsStore, VENDOR_EVAL_STATUS, QUALIFICATION_THRESHOLD } from './evaluation';
import { mockRfqService, rfqsStore, quotationsStore } from './rfq';
import { mockVendorService, vendorsStore } from './vendor';

vi.mock('./base', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, delay: () => Promise.resolve() };
});

function setActor() {
  localStorage.setItem('authUser', JSON.stringify({ fullName: 'Test Buyer', email: 'buyer@test.com' }));
}

const VENDOR_NAMES = ['Tata Steel', 'L&T', 'ABC Traders'];

function rfqItems() {
  return [
    { product: 'Mouse', hsn: '8471', uom: 'Nos', qty: 100, rate: 400, expectedRate: 400, specification: 'Standard', requiredDate: '2026-09-15' },
    { product: 'Keyboard', hsn: '8471', uom: 'Nos', qty: 50, rate: 300, expectedRate: 300, specification: 'Standard', requiredDate: '2026-09-15' }
  ];
}

function quotationFor(rfq, vendor, overrides = {}) {
  return {
    rfqNo: rfq.rfqNo,
    vendor,
    submittedOn: '2026-08-15',
    validUntil: '2026-08-31',
    currency: rfq.currency,
    discount: 2,
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

async function createSentRfq() {
  const draft = await mockRfqService.createRfq({
    title: 'Test Multi-Vendor RFQ',
    reference: 'PR-2026-TEST',
    department: 'IT',
    project: 'Test',
    requester: 'Test User',
    buyer: 'Test Buyer',
    priority: 'High',
    dueDate: '2026-09-10',
    currency: 'INR',
    vendorNames: VENDOR_NAMES,
    items: rfqItems()
  });
  await mockRfqService.submitForReview(draft.id);
  await mockRfqService.approveRfq(draft.id);
  await mockRfqService.sendRfq(draft.id);
  return mockRfqService.getRfq(draft.id);
}

async function createEvaluableRfq() {
  const rfq = await createSentRfq();
  for (const vendor of VENDOR_NAMES) {
    await mockRfqService.saveQuotation(quotationFor(rfq, vendor));
  }
  return mockRfqService.getRfq(rfq.id);
}

const SCORES_TATA = { compliance: 86, quality: 77, delivery: 79, postPurchase: 69 };
const SCORES_LT = { compliance: 90, quality: 85, delivery: 82, postPurchase: 78 };
const SCORES_ABC = { compliance: 74, quality: 70, delivery: 68, postPurchase: 65 };

function findVendor(evaluations, name) {
  return evaluations.find((e) => e.vendor === name);
}

function techScore(evaluation, key) {
  return evaluation.technical?.find((c) => c.key === key)?.score ?? null;
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

describe('Multi-Vendor Technical Evaluation', () => {
  describe('Per-vendor evaluation scores', () => {
    it('saves evaluation scores for a single vendor independently', async () => {
      const rfq = await createEvaluableRfq();
      await evaluationService.saveVendorEvaluation(rfq.id, 'Tata Steel', { scores: SCORES_TATA, remarks: 'Good quality' });
      const evaluations = await evaluationService.getVendorEvaluations(rfq.id);
      const tata = findVendor(evaluations, 'Tata Steel');
      expect(tata).toBeTruthy();
      expect(tata.evalStatus).toBe(VENDOR_EVAL_STATUS.IN_PROGRESS);
      expect(tata.evalRemarks).toBe('Good quality');
      expect(tata.evaluatedBy).toBeTruthy();
    });

    it('computes correct weighted total from scores', async () => {
      const rfq = await createEvaluableRfq();
      await evaluationService.saveVendorEvaluation(rfq.id, 'Tata Steel', { scores: SCORES_TATA });
      const evaluations = await evaluationService.getVendorEvaluations(rfq.id);
      const tata = findVendor(evaluations, 'Tata Steel');
      expect(tata.technicalTotal).toBe(80);
    });

    it('evaluations for different vendors are independent', async () => {
      const rfq = await createEvaluableRfq();
      await evaluationService.saveVendorEvaluation(rfq.id, 'Tata Steel', { scores: SCORES_TATA });
      await evaluationService.saveVendorEvaluation(rfq.id, 'L&T', { scores: SCORES_LT });
      const evaluations = await evaluationService.getVendorEvaluations(rfq.id);
      const tata = findVendor(evaluations, 'Tata Steel');
      const lt = findVendor(evaluations, 'L&T');
      expect(techScore(tata, 'compliance')).toBe(86);
      expect(techScore(lt, 'compliance')).toBe(90);
      expect(tata.technicalTotal).not.toBe(lt.technicalTotal);
    });

    it('changing Tata Steel evaluation does not change L&T', async () => {
      const rfq = await createEvaluableRfq();
      await evaluationService.saveVendorEvaluation(rfq.id, 'Tata Steel', { scores: SCORES_TATA });
      await evaluationService.saveVendorEvaluation(rfq.id, 'L&T', { scores: SCORES_LT });
      await evaluationService.saveVendorEvaluation(rfq.id, 'Tata Steel', { scores: { compliance: 95, quality: 90, delivery: 88, postPurchase: 85 } });
      const evaluations = await evaluationService.getVendorEvaluations(rfq.id);
      const lt = findVendor(evaluations, 'L&T');
      expect(techScore(lt, 'compliance')).toBe(90);
      expect(lt.technicalTotal).toBe(85);
    });
  });

  describe('Per-vendor technical decisions', () => {
    it('records a Qualified decision for a vendor', async () => {
      const rfq = await createEvaluableRfq();
      await evaluationService.saveVendorEvaluation(rfq.id, 'Tata Steel', { scores: SCORES_TATA });
      await evaluationService.setVendorDecision(rfq.id, 'Tata Steel', 'Qualified');
      const evaluations = await evaluationService.getVendorEvaluations(rfq.id);
      const tata = findVendor(evaluations, 'Tata Steel');
      expect(tata.evalStatus).toBe(VENDOR_EVAL_STATUS.QUALIFIED);
      expect(tata.evalDecision).toBe('Qualified');
    });

    it('records a Not Qualified decision for a vendor', async () => {
      const rfq = await createEvaluableRfq();
      await evaluationService.saveVendorEvaluation(rfq.id, 'ABC Traders', { scores: SCORES_ABC });
      await evaluationService.setVendorDecision(rfq.id, 'ABC Traders', 'Not Qualified');
      const evaluations = await evaluationService.getVendorEvaluations(rfq.id);
      const abc = findVendor(evaluations, 'ABC Traders');
      expect(abc.evalStatus).toBe(VENDOR_EVAL_STATUS.NOT_QUALIFIED);
    });

    it('vendors without decisions remain Pending', async () => {
      const rfq = await createEvaluableRfq();
      await evaluationService.saveVendorEvaluation(rfq.id, 'Tata Steel', { scores: SCORES_TATA });
      const evaluations = await evaluationService.getVendorEvaluations(rfq.id);
      const lt = findVendor(evaluations, 'L&T');
      expect(lt.evalStatus).toBe(VENDOR_EVAL_STATUS.PENDING);
    });

    it('rejects invalid decision values', async () => {
      const rfq = await createEvaluableRfq();
      await evaluationService.saveVendorEvaluation(rfq.id, 'Tata Steel', { scores: SCORES_TATA });
      await expect(
        evaluationService.setVendorDecision(rfq.id, 'Tata Steel', 'Invalid')
      ).rejects.toThrow('Invalid decision');
    });
  });

  describe('RFQ-level status from vendor evaluations', () => {
    it('board shows per-vendor evaluation summary', async () => {
      const rfq = await createEvaluableRfq();
      await evaluationService.saveVendorEvaluation(rfq.id, 'Tata Steel', { scores: SCORES_TATA });
      await evaluationService.setVendorDecision(rfq.id, 'Tata Steel', 'Qualified');
      const board = await evaluationService.getEvaluationBoard();
      const item = board.find((b) => b.rfqId === rfq.id);
      expect(item).toBeTruthy();
      expect(item.vendorEvalSummary.total).toBe(3);
      expect(item.vendorEvalSummary.qualified).toBe(1);
      expect(item.vendorEvalSummary.notQualified).toBe(0);
      expect(item.vendorEvalSummary.pending).toBe(2);
    });

    it('board vendor rows include evalStatus and technicalTotal', async () => {
      const rfq = await createEvaluableRfq();
      await evaluationService.saveVendorEvaluation(rfq.id, 'Tata Steel', { scores: SCORES_TATA });
      const board = await evaluationService.getEvaluationBoard();
      const item = board.find((b) => b.rfqId === rfq.id);
      const tata = item.vendors.find((v) => v.vendor === 'Tata Steel');
      expect(tata.evalStatus).toBe(VENDOR_EVAL_STATUS.IN_PROGRESS);
      expect(tata.technicalTotal).toBe(80);
      expect(tata.evalDecision).toBeNull();
    });
  });

  describe('Data persistence', () => {
    it('vendor evaluation data persists across saves', async () => {
      const rfq = await createEvaluableRfq();
      await evaluationService.saveVendorEvaluation(rfq.id, 'Tata Steel', { scores: SCORES_TATA, remarks: 'Initial evaluation' });
      await evaluationService.setVendorDecision(rfq.id, 'Tata Steel', 'Qualified');
      const evaluations = await evaluationService.getVendorEvaluations(rfq.id);
      const tata = findVendor(evaluations, 'Tata Steel');
      expect(techScore(tata, 'compliance')).toBe(86);
      expect(tata.evalDecision).toBe('Qualified');
      expect(tata.evalRemarks).toBe('Initial evaluation');
    });

    it('all vendor evaluations survive after saving one more', async () => {
      const rfq = await createEvaluableRfq();
      await evaluationService.saveVendorEvaluation(rfq.id, 'Tata Steel', { scores: SCORES_TATA });
      await evaluationService.saveVendorEvaluation(rfq.id, 'L&T', { scores: SCORES_LT });
      await evaluationService.setVendorDecision(rfq.id, 'Tata Steel', 'Qualified');
      const evaluations = await evaluationService.getVendorEvaluations(rfq.id);
      const tata = findVendor(evaluations, 'Tata Steel');
      const lt = findVendor(evaluations, 'L&T');
      expect(tata.evalDecision).toBe('Qualified');
      expect(techScore(lt, 'compliance')).toBe(90);
      expect(lt.evalStatus).toBe(VENDOR_EVAL_STATUS.IN_PROGRESS);
    });
  });

  describe('Score calculation', () => {
    it('weighted total matches manual calculation', async () => {
      const rfq = await createEvaluableRfq();
      await evaluationService.saveVendorEvaluation(rfq.id, 'L&T', { scores: SCORES_LT });
      const evaluations = await evaluationService.getVendorEvaluations(rfq.id);
      const lt = findVendor(evaluations, 'L&T');
      expect(lt.technicalTotal).toBe(85);
    });

    it('all-zero scores produce total of 0', async () => {
      const rfq = await createEvaluableRfq();
      await evaluationService.saveVendorEvaluation(rfq.id, 'Tata Steel', { scores: { compliance: 0, quality: 0, delivery: 0, postPurchase: 0 } });
      const evaluations = await evaluationService.getVendorEvaluations(rfq.id);
      const tata = findVendor(evaluations, 'Tata Steel');
      expect(tata.technicalTotal).toBe(0);
    });

    it('qualification threshold is configurable', () => {
      expect(QUALIFICATION_THRESHOLD).toBe(70);
    });
  });

  describe('Error handling', () => {
    it('rejects evaluation for non-existent RFQ', async () => {
      await expect(
        evaluationService.saveVendorEvaluation('NON-EXISTENT', 'Tata Steel', { scores: SCORES_TATA })
      ).rejects.toThrow('RFQ not found');
    });

    it('rejects evaluation for non-existent vendor', async () => {
      const rfq = await createEvaluableRfq();
      await expect(
        evaluationService.saveVendorEvaluation(rfq.id, 'Nonexistent Vendor', { scores: SCORES_TATA })
      ).rejects.toThrow('No quotation from Nonexistent Vendor');
    });

    it('rejects decision for non-existent RFQ', async () => {
      await expect(
        evaluationService.setVendorDecision('NON-EXISTENT', 'Tata Steel', 'Qualified')
      ).rejects.toThrow('RFQ not found');
    });
  });

  describe('3-vendor scenario (from spec)', () => {
    it('RFQ-2026-0009 with Tata Steel, L&T, ABC Traders — full evaluation flow', async () => {
      const rfq = await createEvaluableRfq();

      /* Step 1: Enter scores for all 3 vendors */
      await evaluationService.saveVendorEvaluation(rfq.id, 'Tata Steel', { scores: SCORES_TATA });
      await evaluationService.saveVendorEvaluation(rfq.id, 'L&T', { scores: SCORES_LT });
      await evaluationService.saveVendorEvaluation(rfq.id, 'ABC Traders', { scores: SCORES_ABC });

      /* Step 2: Verify all 3 are evaluated */
      const evaluations = await evaluationService.getVendorEvaluations(rfq.id);
      expect(evaluations).toHaveLength(3);
      const evaluated = evaluations.filter((e) => e.evalStatus !== VENDOR_EVAL_STATUS.PENDING);
      expect(evaluated).toHaveLength(3);

      /* Step 3: Verify scores are independent — Tata 80, L&T 85, ABC 70 */
      const tata = findVendor(evaluations, 'Tata Steel');
      const lt = findVendor(evaluations, 'L&T');
      const abc = findVendor(evaluations, 'ABC Traders');
      expect(tata.technicalTotal).toBe(80);
      expect(lt.technicalTotal).toBe(85);
      expect(abc.technicalTotal).toBe(70);

      /* Step 4: Make decisions */
      await evaluationService.setVendorDecision(rfq.id, 'Tata Steel', 'Qualified');
      await evaluationService.setVendorDecision(rfq.id, 'L&T', 'Qualified');
      await evaluationService.setVendorDecision(rfq.id, 'ABC Traders', 'Not Qualified');

      /* Step 5: Verify board summary */
      const board = await evaluationService.getEvaluationBoard();
      const item = board.find((b) => b.rfqId === rfq.id);
      expect(item.vendorEvalSummary.qualified).toBe(2);
      expect(item.vendorEvalSummary.notQualified).toBe(1);
      expect(item.vendorEvalSummary.pending).toBe(0);
    });
  });
});
