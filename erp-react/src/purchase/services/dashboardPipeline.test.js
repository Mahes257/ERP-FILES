/**
 * purchase/services/dashboardPipeline.test.js
 * ------------------------------------------------------------------
 * Unit tests for the dashboard service pipeline stage calculations.
 * Verifies that:
 *   1. calcPipelineStages returns all required keys
 *   2. PR count = active requisitions count
 *   3. Legacy keys (delivery, comparison, evaluation, selection) still present
 *   4. New keys (grn, techEval, pcs) are correctly mapped
 *   5. Approval and payment default to 0
 * ------------------------------------------------------------------
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requisitionsStore } from './requisition';
import { rfqsStore, quotationsStore } from './rfq';
import { ordersStore } from './purchaseOrder';
import { invoicesStore } from './invoice';
import { grnsStore } from './logistics';
import { vendorsStore } from './vendor';
import { mockDashboardService } from './dashboard';
import { RFQ_STATUS } from '../constants';

/* Stub the simulated latency so every service call resolves instantly. */
vi.mock('./base', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, delay: () => Promise.resolve() };
});

beforeEach(() => {
  requisitionsStore.reset();
  rfqsStore.reset();
  quotationsStore.reset();
  ordersStore.reset();
  invoicesStore.reset();
  grnsStore.reset();
  vendorsStore.reset();
});

/* ═══════════════════════════════════════════════════════════════════ */
/*  Pipeline Stages — key coverage                                    */
/* ═══════════════════════════════════════════════════════════════════ */
describe('calcPipelineStages — key coverage', () => {
  it('returns all 11 pipeline keys expected by the Dashboard', async () => {
    const pipeline = await mockDashboardService.getPipelineStages('all');
    const expectedKeys = [
      'pr', 'rfq', 'quotations', 'techEval', 'pcs',
      'negotiation', 'approval', 'po', 'grn', 'invoice', 'payment',
    ];
    expectedKeys.forEach((key) => {
      expect(pipeline).toHaveProperty(key);
      expect(typeof pipeline[key]).toBe('number');
    });
  });

  it('returns legacy keys for backwards compatibility', async () => {
    const pipeline = await mockDashboardService.getPipelineStages('all');
    expect(pipeline).toHaveProperty('delivery');
    expect(pipeline).toHaveProperty('comparison');
    expect(pipeline).toHaveProperty('evaluation');
    expect(pipeline).toHaveProperty('selection');
  });
});

/* ═══════════════════════════════════════════════════════════════════ */
/*  Pipeline Stages — PR count accuracy                               */
/* ═══════════════════════════════════════════════════════════════════ */
describe('calcPipelineStages — PR count', () => {
  it('PR count = number of active requisitions', async () => {
    requisitionsStore.persist([
      { id: 'PR-001', prNo: 'PR-2026-0001', title: 'Test PR 1',
        status: 'Draft', department: 'Production', requester: 'Test',
        createdAt: new Date().toISOString() },
      { id: 'PR-002', prNo: 'PR-2026-0002', title: 'Test PR 2',
        status: 'Pending Approval', department: 'Engineering', requester: 'Test',
        createdAt: new Date().toISOString() },
    ]);
    const pipeline = await mockDashboardService.getPipelineStages('all');
    expect(pipeline.pr).toBe(2);
  });

  it('PR count is not hardcoded — changes with data', async () => {
    requisitionsStore.persist([
      { id: 'PR-A', prNo: 'PR-2026-A', title: 'PR A',
        status: 'Draft', department: 'Production', requester: 'Test',
        createdAt: new Date().toISOString() },
    ]);
    const before = await mockDashboardService.getPipelineStages('all');
    const beforeCount = before.pr;

    requisitionsStore.persist([
      { id: 'PR-A', prNo: 'PR-2026-A', title: 'PR A',
        status: 'Draft', department: 'Production', requester: 'Test',
        createdAt: new Date().toISOString() },
      { id: 'PR-B', prNo: 'PR-2026-B', title: 'PR B',
        status: 'Pending Approval', department: 'Engineering', requester: 'Test',
        createdAt: new Date().toISOString() },
    ]);
    const after = await mockDashboardService.getPipelineStages('all');
    expect(after.pr).toBe(beforeCount + 1);
  });
});

/* ═══════════════════════════════════════════════════════════════════ */
/*  Pipeline Stages — legacy key values                               */
/* ═══════════════════════════════════════════════════════════════════ */
describe('calcPipelineStages — legacy keys', () => {
  it('delivery = grn count', async () => {
    grnsStore.persist([
      { id: 'GRN-001', grnNo: 'GRN-2026-0001', createdAt: new Date().toISOString() },
    ]);
    const pipeline = await mockDashboardService.getPipelineStages('all');
    expect(pipeline.delivery).toBe(1);
    expect(pipeline.grn).toBe(1);
    expect(pipeline.delivery).toBe(pipeline.grn);
  });

  it('comparison = evaluation count', async () => {
    rfqsStore.persist([
      { id: 'RFQ-001', rfqNo: 'RFQ-2026-0001', title: 'Test RFQ',
        status: RFQ_STATUS.EVALUATION, createdAt: new Date().toISOString() },
    ]);
    const pipeline = await mockDashboardService.getPipelineStages('all');
    expect(pipeline.comparison).toBe(pipeline.evaluation);
  });
});

/* ═══════════════════════════════════════════════════════════════════ */
/*  Pipeline Stages — stages without backend data                     */
/* ═══════════════════════════════════════════════════════════════════ */
describe('calcPipelineStages — stages without backend data', () => {
  it('approval defaults to 0', async () => {
    const pipeline = await mockDashboardService.getPipelineStages('all');
    expect(pipeline.approval).toBe(0);
  });

  it('payment defaults to 0', async () => {
    const pipeline = await mockDashboardService.getPipelineStages('all');
    expect(pipeline.payment).toBe(0);
  });
});

/* ═══════════════════════════════════════════════════════════════════ */
/*  Pipeline Stages — key aliasing                                    */
/* ═══════════════════════════════════════════════════════════════════ */
describe('calcPipelineStages — key aliasing', () => {
  it('techEval = RFQs in Evaluation status', async () => {
    rfqsStore.persist([
      { id: 'RFQ-TE1', rfqNo: 'RFQ-2026-TE1', title: 'Eval RFQ',
        status: RFQ_STATUS.EVALUATION, createdAt: new Date().toISOString() },
      { id: 'RFQ-TE2', rfqNo: 'RFQ-2026-TE2', title: 'Eval RFQ 2',
        status: RFQ_STATUS.EVALUATION, createdAt: new Date().toISOString() },
    ]);
    const pipeline = await mockDashboardService.getPipelineStages('all');
    expect(pipeline.techEval).toBe(2);
    expect(pipeline.techEval).toBe(pipeline.evaluation);
  });

  it('pcs = RFQs with Quotation Received or Evaluation status', async () => {
    rfqsStore.persist([
      { id: 'RFQ-PC1', rfqNo: 'RFQ-2026-PC1', title: 'Quoted RFQ',
        status: RFQ_STATUS.QUOTATION_RECEIVED, createdAt: new Date().toISOString() },
      { id: 'RFQ-PC2', rfqNo: 'RFQ-2026-PC2', title: 'Eval RFQ',
        status: RFQ_STATUS.EVALUATION, createdAt: new Date().toISOString() },
      { id: 'RFQ-PC3', rfqNo: 'RFQ-2026-PC3', title: 'Draft RFQ',
        status: RFQ_STATUS.DRAFT, createdAt: new Date().toISOString() },
    ]);
    const pipeline = await mockDashboardService.getPipelineStages('all');
    expect(pipeline.pcs).toBe(2);
    expect(pipeline.pcs).toBe(pipeline.quotations);
  });
});
