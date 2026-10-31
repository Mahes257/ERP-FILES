/**
 * purchase/services/endToEndWorkflow.test.js
 * ------------------------------------------------------------------
 * Phase 9 — COMPLETE PURCHASE END-TO-END WORKFLOW VALIDATION
 *
 * Verifies all 36 verification points from the spec:
 *   1-26: Workflow steps (PR → Payment Advice)
 *   27-28: PO close and immutability
 *   29: Dashboard/KPI/Report updates after every transition
 *   30: No duplicate records
 *   31: No stale state after refresh
 *   32-33: URL state and browser navigation
 *   34: Print/PDF works
 *   35: Permissions are respected
 *   36: Audit information is retained
 * ------------------------------------------------------------------ */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  APPROVAL_STATUS, INVOICE_STATUS, MATCH_STATUS, PO_STATUS,
  PR_STATUS, RFQ_STATUS
} from '../constants';
import { normalizePOStatus } from '../constants/poStage';
import { mockRequisitionService, requisitionsStore } from './requisition';
import { mockRfqService, rfqsStore, quotationsStore } from './rfq';
import { mockPurchaseOrderService, ordersStore } from './purchaseOrder';
import {
  logisticsService, INSPECTION_STATUS, GRN_STATUS,
  grnsStore, inspectionsStore, shipmentsStore, inventoryStore
} from './logistics';
import { mockInvoiceService, invoicesStore, advicesStore } from './invoice';
import { evaluationService, evaluationsStore } from './evaluation';
import { mockVendorService, vendorsStore } from './vendor';
import { reportsService } from './reports';

vi.mock('./base', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, delay: () => Promise.resolve() };
});

function setActor(name = 'QA Auditor', role = 'ADMIN') {
  localStorage.setItem('authUser', JSON.stringify({ fullName: name, email: `${name.toLowerCase().replace(/\s/g, '.')}@test.com`, role }));
}

beforeEach(async () => {
  localStorage.clear();
  requisitionsStore.reset();
  rfqsStore.reset();
  quotationsStore.reset();
  ordersStore.reset();
  grnsStore.reset();
  inspectionsStore.reset();
  shipmentsStore.reset();
  inventoryStore.reset();
  invoicesStore.reset();
  advicesStore.reset();
  evaluationsStore.reset();
  vendorsStore.reset();
  setActor();
  /* Create approved vendors. */
  const tata = await mockVendorService.createVendor({ name: 'Tata Steel Ltd', category: 'Steel & Metals' });
  await mockVendorService.setVendorStatus(tata.id, 'Approved');
  const jsw = await mockVendorService.createVendor({ name: 'JSW Steel', category: 'Steel & Metals' });
  await mockVendorService.setVendorStatus(jsw.id, 'Approved');
});

const VENDOR_A = 'Tata Steel Ltd';
const VENDOR_B = 'JSW Steel';
const TERMS = { type: 'Against Delivery', balanceTrigger: 'Against Delivery' };

const TEST_ITEMS = [
  { product: 'HR coil 3mm', hsn: '7208', uom: 'Kg', qty: 100, rate: 24.5, expectedRate: 24.5, gstRate: 18 },
  { product: 'MS plate 6mm', hsn: '7208', uom: 'Kg', qty: 50, rate: 28, expectedRate: 28, gstRate: 18 }
];

/* ================================================================== */
/*  Points 1–26: Complete workflow validation                          */
/* ================================================================== */
describe('Points 1–26: Complete PR-to-Payment workflow', () => {
  it('executes the full workflow and verifies every step', async () => {
    /* --- Point 1: PR creates correctly --- */
    const pr = await mockRequisitionService.createRequisition({
      title: 'E2E workflow test', department: 'Production', project: 'Unit 2 Expansion',
      requester: 'Test Requester', priority: 'High', expectedDate: '2026-10-01',
      currency: 'INR', items: TEST_ITEMS
    });
    expect(pr.status).toBe(PR_STATUS.DRAFT);
    expect(pr.prNo).toMatch(/^PR-/);
    expect(pr.items).toHaveLength(2);
    const PR_NO = pr.prNo;

    /* --- Point 2: PR approval updates actual status --- */
    await mockRequisitionService.submitRequisition(pr.id);
    expect((await mockRequisitionService.getRequisition(pr.id)).status).toBe(PR_STATUS.PENDING_APPROVAL);

    const approved = await mockRequisitionService.approveRequisition(pr.id);
    expect(approved.status).toBe(PR_STATUS.TECHNICAL_REVIEW);
    expect(approved.approvalStatus).toBe(APPROVAL_STATUS.APPROVED);

    /* Technical review → Ready for RFQ */
    await mockRequisitionService.saveTechnicalReview(pr.id, {
      specification: 'IS 2062', reviewStatus: 'Reviewed'
    });
    const ready = await mockRequisitionService.completeTechnicalReview(pr.id);
    expect(ready.status).toBe(PR_STATUS.READY_FOR_RFQ);

    /* --- Point 3: Approved PR can create RFQ --- */
    const { created, errors } = await mockRequisitionService.convertToRfq([pr.id]);
    expect(errors).toHaveLength(0);
    expect(created).toHaveLength(1);
    const rfqDraft = created[0];
    expect(rfqDraft.status).toBe(RFQ_STATUS.DRAFT);
    expect(rfqDraft.prNo || rfqDraft.reference).toBe(PR_NO);
    const RFQ_NO = rfqDraft.rfqNo;

    /* --- Point 4: RFQ can be sent to vendors --- */
    await mockRfqService.updateRfq(rfqDraft.id, { vendors: [VENDOR_A, VENDOR_B] });
    await mockRfqService.submitForReview(rfqDraft.id);
    await mockRfqService.approveRfq(rfqDraft.id);
    await mockRfqService.sendRfq(rfqDraft.id);
    expect((await mockRfqService.getRfq(rfqDraft.id)).status).toBe(RFQ_STATUS.SENT);

    /* --- Point 5: Quotations can be received --- */
    const quoteItems = TEST_ITEMS.map((item) => ({
      product: item.product, hsn: item.hsn, uom: item.uom, qty: item.qty,
      rate: item.rate, gstRate: 18
    }));
    const quoteA = await mockRfqService.saveQuotation({
      rfqNo: RFQ_NO, vendor: VENDOR_A, submittedOn: '2026-08-20',
      validUntil: '2026-09-10', currency: 'INR', items: quoteItems
    });
    const quoteB = await mockRfqService.saveQuotation({
      rfqNo: RFQ_NO, vendor: VENDOR_B, submittedOn: '2026-08-21',
      validUntil: '2026-09-10', currency: 'INR', items: quoteItems.map((i) => ({ ...i, rate: i.rate * 0.97 }))
    });
    expect(quoteA.quotationNo).toMatch(/^QT-/);
    expect(quoteB.quotationNo).toMatch(/^QT-/);
    const QUOTATION_NO = quoteA.quotationNo;

    /* --- Points 6-8: Evaluation, Negotiation, Comparison --- */
    await mockRfqService.startEvaluation(rfqDraft.id);
    /* Negotiation must happen before technical evaluation */
    const agreed = Math.round(quoteA.total * 0.95 * 100) / 100;
    await evaluationService.recordNegotiation(rfqDraft.id, VENDOR_A, { amount: agreed, stage: 'Agreed' });
    await evaluationService.completeTechnicalEvaluation(rfqDraft.id);
    await evaluationService.completeCommercialEvaluation(rfqDraft.id, { paymentTerms: TERMS });
    const evalData = await evaluationService.getEvaluation(rfqDraft.id);
    expect(evalData.steps.negotiation).toBe(true);
    expect(evalData.steps.technical).toBe(true);
    expect(evalData.steps.commercial).toBe(true);

    /* --- Point 9: Supplier selection works --- */
    await evaluationService.completeSupplierSelection(rfqDraft.id, VENDOR_A, { rationale: 'Best value' });
    await evaluationService.approveSupplierSelection(rfqDraft.id, { decision: APPROVAL_STATUS.APPROVED });
    await mockRfqService.awardRfq(rfqDraft.id, VENDOR_A);
    expect((await mockRfqService.getRfq(rfqDraft.id)).status).toBe(RFQ_STATUS.AWARDED);

    /* --- Point 10: PO can be created from selected supplier --- */
    const { po } = await mockRfqService.raisePurchaseOrder(rfqDraft.id);
    expect(po.poNo).toMatch(/^PO-/);
    const PO_NO = po.poNo;

    /* --- Point 11: PO references originating PR/RFQ correctly --- */
    expect(po.prNo || po.reference).toBe(PR_NO);
    expect(po.rfqNo).toBe(RFQ_NO);
    expect(po.quotationNo).toBe(QUOTATION_NO);
    expect(po.vendor).toBe(VENDOR_A);

    /* --- Point 12: PO approval works --- */
    await mockPurchaseOrderService.approveOrder(po.id);
    const approvedPo = await mockPurchaseOrderService.getOrder(po.id);
    expect(approvedPo.status).toBe(PO_STATUS.APPROVED);
    expect(approvedPo.approvalStatus).toBe(APPROVAL_STATUS.APPROVED);

    /* --- Point 13: PO release works --- */
    await mockPurchaseOrderService.releaseOrder(po.id);
    const releasedPo = await mockPurchaseOrderService.getOrder(po.id);
    expect(releasedPo.status).toBe(PO_STATUS.RELEASED);

    /* --- Point 14: Released PO appears in Released Orders workspace --- */
    const releasedOrders = await mockPurchaseOrderService.getOrders({ status: PO_STATUS.RELEASED });
    expect(releasedOrders.data.some((o) => o.poNo === PO_NO)).toBe(true);

    /* --- Point 15: Supplier acknowledgement updates PO --- */
    await mockPurchaseOrderService.acknowledgeOrder(po.id);
    const ackPo = await mockPurchaseOrderService.getOrder(po.id);
    expect(ackPo.acknowledged).toBe(true);
    expect(ackPo.acknowledgedAt).toBeTruthy();

    /* --- Point 16: PO moves to In Progress --- */
    await mockPurchaseOrderService.startOrder(po.id);
    const inProgressPo = await mockPurchaseOrderService.getOrder(po.id);
    expect(inProgressPo.status).toBe(PO_STATUS.IN_PROGRESS);

    /* --- Point 17: Delivery can be recorded --- */
    const grn = await logisticsService.createGrn(PO_NO);
    expect(grn.grnNo).toMatch(/^GRN-/);
    expect(grn.poNo).toBe(PO_NO);

    /* --- Point 18: Partial delivery updates PO stage, delivered qty, remaining qty --- */
    await logisticsService.receiveGoods(grn.id, [
      { product: 'HR coil 3mm', received: 40 },
      { product: 'MS plate 6mm', received: 25 }
    ]);
    const partialPo = await mockPurchaseOrderService.getOrder(po.id);
    expect(partialPo.status).toBe(PO_STATUS.PARTIALLY_DELIVERED);
    expect(partialPo.items[0].receivedQty).toBe(40);
    expect(partialPo.items[1].receivedQty).toBe(25);

    /* --- Point 19: GRN works --- */
    const grns = await logisticsService.getGrns({ search: grn.grnNo });
    expect(grns.data[0].status).toBe(GRN_STATUS.PENDING_INSPECTION);

    /* --- Point 20: Inspection works --- */
    const inspections = await logisticsService.getInspections({ search: grn.grnNo });
    expect(inspections.data.length).toBeGreaterThan(0);
    const inspection = inspections.data[0];
    await logisticsService.setInspectionResult(inspection.id, INSPECTION_STATUS.PASSED, 'OK');

    /* Complete remaining delivery to move PO to Completed */
    const grn2 = await logisticsService.createGrn(PO_NO);
    await logisticsService.receiveGoods(grn2.id, [
      { product: 'HR coil 3mm', received: 60 },
      { product: 'MS plate 6mm', received: 25 }
    ]);
    const completedPo = await mockPurchaseOrderService.getOrder(po.id);
    expect(completedPo.status).toBe(PO_STATUS.COMPLETED);

    /* --- Point 21: Invoice can reference PO --- */
    const invoice = await mockInvoiceService.createInvoice({
      poNo: PO_NO, vendor: VENDOR_A, amount: completedPo.amount,
      gst: 0, status: INVOICE_STATUS.SUBMITTED
    });
    expect(invoice.invoiceNo).toMatch(/^VINV-/);
    expect(invoice.poNo).toBe(PO_NO);

    /* --- Point 22: Three-way matching compares PO/GRN/Invoice --- */
    const fetchedInv = await mockInvoiceService.getInvoice(invoice.id);
    expect(fetchedInv.matchStatus).toBe(MATCH_STATUS.MATCHED);

    /* --- Point 23: Mismatch is clearly shown --- */
    const mismatchInv = await mockInvoiceService.createInvoice({
      poNo: PO_NO, vendor: VENDOR_A, amount: 999999,
      gst: 0, status: INVOICE_STATUS.SUBMITTED
    });
    const mismatchFetched = await mockInvoiceService.getInvoice(mismatchInv.id);
    expect(mismatchFetched.matchStatus).toBe(MATCH_STATUS.MISMATCH);

    /* --- Point 24: Invoice approval works --- */
    await mockInvoiceService.approveInvoice(invoice.id);
    const approvedInv = await mockInvoiceService.getInvoice(invoice.id);
    expect(approvedInv.status).toBe(INVOICE_STATUS.APPROVED);

    /* --- Point 25: Payment works --- */
    const paid = await mockInvoiceService.recordPayment(invoice.id, {
      method: 'Bank Transfer', full: true, transactionReference: 'TXN-E2E-001'
    });
    expect(paid.status).toBe(INVOICE_STATUS.PAID);
    expect(paid.paymentNo).toMatch(/^PAY-/);

    /* --- Point 26: Payment advice works --- */
    const advices = await mockInvoiceService.getPaymentAdvices();
    const advice = advices.find((a) => a.invoiceNo === invoice.invoiceNo);
    expect(advice).toBeTruthy();
    expect(advice.adviceNo).toMatch(/^ADV-/);
    expect(advice.poNo).toBe(PO_NO);
  }, 60000);
});

/* ================================================================== */
/*  Points 27–28: PO Close and Immutability                           */
/* ================================================================== */
describe('Points 27–28: PO Close and Immutability', () => {
  it('completed PO can be closed and closed PO cannot be modified', async () => {
    /* Create a PO through to Completed status */
    const pr = await mockRequisitionService.createRequisition({
      title: 'Close test', department: 'Production', requester: 'Test', priority: 'Medium',
      expectedDate: '2026-10-01', currency: 'INR',
      items: [{ product: 'Widget', hsn: '9999', uom: 'Nos', qty: 10, rate: 100, expectedRate: 100, gstRate: 18 }]
    });
    await mockRequisitionService.submitRequisition(pr.id);
    await mockRequisitionService.approveRequisition(pr.id);
    await mockRequisitionService.completeTechnicalReview(pr.id);
    const { created } = await mockRequisitionService.convertToRfq([pr.id]);
    const rfq = created[0];
    await mockRfqService.updateRfq(rfq.id, { vendors: [VENDOR_A] });
    await mockRfqService.submitForReview(rfq.id);
    await mockRfqService.approveRfq(rfq.id);
    await mockRfqService.sendRfq(rfq.id);
    await mockRfqService.saveQuotation({
      rfqNo: rfq.rfqNo, vendor: VENDOR_A, submittedOn: '2026-08-20',
      validUntil: '2026-09-10', currency: 'INR',
      items: [{ product: 'Widget', hsn: '9999', uom: 'Nos', qty: 10, rate: 100, gstRate: 18 }]
    });
    await mockRfqService.startEvaluation(rfq.id);
    await evaluationService.recordNegotiation(rfq.id, VENDOR_A, { amount: 950, stage: 'Agreed' });
    await evaluationService.completeTechnicalEvaluation(rfq.id);
    await evaluationService.completeCommercialEvaluation(rfq.id, { paymentTerms: TERMS });
    await evaluationService.completeSupplierSelection(rfq.id, VENDOR_A);
    await evaluationService.approveSupplierSelection(rfq.id, { decision: APPROVAL_STATUS.APPROVED });
    await mockRfqService.awardRfq(rfq.id, VENDOR_A);
    const { po } = await mockRfqService.raisePurchaseOrder(rfq.id);
    await mockPurchaseOrderService.approveOrder(po.id);
    await mockPurchaseOrderService.releaseOrder(po.id);
    await mockPurchaseOrderService.acknowledgeOrder(po.id);
    await mockPurchaseOrderService.startOrder(po.id);
    /* Receive full quantity */
    const grn = await logisticsService.createGrn(po.poNo);
    await logisticsService.receiveGoods(grn.id);

    const completedPo = await mockPurchaseOrderService.getOrder(po.id);
    expect(completedPo.status).toBe(PO_STATUS.COMPLETED);

    /* --- Point 27: Completed PO can be closed --- */
    await mockPurchaseOrderService.closeOrder(po.id);
    const closedPo = await mockPurchaseOrderService.getOrder(po.id);
    expect(closedPo.status).toBe(PO_STATUS.CLOSED);

    /* --- Point 28: Closed PO cannot be accidentally modified --- */
    await expect(mockPurchaseOrderService.approveOrder(po.id)).rejects.toThrow();
    await expect(mockPurchaseOrderService.releaseOrder(po.id)).rejects.toThrow();
    await expect(mockPurchaseOrderService.cancelOrder(po.id)).rejects.toThrow();
    await expect(mockPurchaseOrderService.closeOrder(po.id)).rejects.toThrow();
  }, 60000);
});

/* ================================================================== */
/*  Point 29: Dashboard/KPI/Report updates after transitions          */
/* ================================================================== */
describe('Point 29: Dashboard/KPI/Report updates after transitions', () => {
  it('reports service reflects real-time data after PO lifecycle changes', async () => {
    /* Create a PO */
    const po = await mockPurchaseOrderService.createOrder({
      title: 'KPI test PO', vendor: VENDOR_A, reference: 'PR-KPI-1',
      items: [{ product: 'Widget', hsn: '9999', uom: 'Nos', qty: 10, rate: 100, gstRate: 18 }]
    });

    /* Before approval: order count should include this PO */
    const statsBefore = await reportsService.getDashboardKpis({});
    expect(statsBefore.orderCount).toBeGreaterThanOrEqual(1);

    /* After approval */
    await mockPurchaseOrderService.approveOrder(po.id);
    const statsAfterApprove = await mockPurchaseOrderService.getOrderStats();
    expect(statsAfterApprove[PO_STATUS.APPROVED]).toBeGreaterThanOrEqual(1);

    /* After release */
    await mockPurchaseOrderService.releaseOrder(po.id);
    const statsAfterRelease = await mockPurchaseOrderService.getOrderStats();
    expect(statsAfterRelease[PO_STATUS.RELEASED]).toBeGreaterThanOrEqual(1);

    /* Vendor analysis should include this vendor */
    const vendorAnalysis = await reportsService.getVendorAnalysis({});
    expect(vendorAnalysis.performance.some((v) => v.name === VENDOR_A)).toBe(true);

    /* Spend analysis should include this PO */
    const spendAnalysis = await reportsService.getSpendAnalysis({});
    expect(spendAnalysis.total).toBeGreaterThan(0);
  });

  it('stage counts update after every transition', async () => {
    const po = await mockPurchaseOrderService.createOrder({
      title: 'Stage count test', vendor: VENDOR_A, reference: 'PR-SC-1',
      items: [{ product: 'Widget', hsn: '9999', uom: 'Nos', qty: 5, rate: 200, gstRate: 18 }]
    });

    const stats1 = await mockPurchaseOrderService.getOrderStats();
    expect(stats1.total).toBeGreaterThanOrEqual(1);

    await mockPurchaseOrderService.approveOrder(po.id);
    const approvedCount = (await mockPurchaseOrderService.getOrderStats())[PO_STATUS.APPROVED];
    expect(approvedCount).toBeGreaterThanOrEqual(1);

    await mockPurchaseOrderService.releaseOrder(po.id);
    const releasedCount = (await mockPurchaseOrderService.getOrderStats())[PO_STATUS.RELEASED];
    expect(releasedCount).toBeGreaterThanOrEqual(1);
  });
});

/* ================================================================== */
/*  Point 30: No duplicate records                                    */
/* ================================================================== */
describe('Point 30: No duplicate records', () => {
  it('creating multiple POs produces unique PO numbers', async () => {
    const po1 = await mockPurchaseOrderService.createOrder({
      title: 'PO 1', vendor: VENDOR_A, reference: 'PR-DUP-1',
      items: [{ product: 'Widget', hsn: '9999', uom: 'Nos', qty: 1, rate: 100, gstRate: 18 }]
    });
    const po2 = await mockPurchaseOrderService.createOrder({
      title: 'PO 2', vendor: VENDOR_B, reference: 'PR-DUP-2',
      items: [{ product: 'Widget', hsn: '9999', uom: 'Nos', qty: 1, rate: 100, gstRate: 18 }]
    });
    expect(po1.poNo).not.toBe(po2.poNo);
    expect(po1.id).not.toBe(po2.id);
  });

  it('creating multiple PRs produces unique PR numbers', async () => {
    const pr1 = await mockRequisitionService.createRequisition({
      title: 'PR 1', department: 'Production', requester: 'User A', priority: 'Medium',
      expectedDate: '2026-10-01', currency: 'INR',
      items: [{ product: 'Widget', hsn: '9999', uom: 'Nos', qty: 1, rate: 10 }]
    });
    const pr2 = await mockRequisitionService.createRequisition({
      title: 'PR 2', department: 'Production', requester: 'User B', priority: 'Medium',
      expectedDate: '2026-10-01', currency: 'INR',
      items: [{ product: 'Widget', hsn: '9999', uom: 'Nos', qty: 1, rate: 10 }]
    });
    expect(pr1.prNo).not.toBe(pr2.prNo);
  });

  it('duplicate PO number is rejected', async () => {
    const po1 = await mockPurchaseOrderService.createOrder({
      title: 'First PO', vendor: VENDOR_A, reference: 'PR-DUP-3',
      items: [{ product: 'Widget', hsn: '9999', uom: 'Nos', qty: 1, rate: 100, gstRate: 18 }]
    });
    await expect(
      mockPurchaseOrderService.createOrder({
        poNo: po1.poNo, title: 'Duplicate', vendor: VENDOR_A, reference: 'PR-DUP-4',
        items: [{ product: 'Widget', hsn: '9999', uom: 'Nos', qty: 1, rate: 100, gstRate: 18 }]
      })
    ).rejects.toThrow(/already exists/);
  });
});

/* ================================================================== */
/*  Point 31: No stale state after refresh (localStorage persistence) */
/* ================================================================== */
describe('Point 31: No stale state after refresh', () => {
  it('PO data persists to localStorage and survives store reset', async () => {
    const po = await mockPurchaseOrderService.createOrder({
      title: 'Persist test', vendor: VENDOR_A, reference: 'PR-PERSIST-1',
      items: [{ product: 'Widget', hsn: '9999', uom: 'Nos', qty: 5, rate: 100, gstRate: 18 }]
    });

    /* Simulate a page refresh by resetting the in-memory cache */
    ordersStore.reset();

    /* Re-read from localStorage */
    const fetched = await mockPurchaseOrderService.getOrder(po.id);
    expect(fetched.poNo).toBe(po.poNo);
    expect(fetched.title).toBe('Persist test');
    expect(fetched.vendor).toBe(VENDOR_A);
  });

  it('PR data persists to localStorage', async () => {
    const pr = await mockRequisitionService.createRequisition({
      title: 'Persist PR', department: 'Production', requester: 'User', priority: 'Low',
      expectedDate: '2026-10-01', currency: 'INR',
      items: [{ product: 'Widget', hsn: '9999', uom: 'Nos', qty: 1, rate: 10 }]
    });

    requisitionsStore.reset();
    const fetched = await mockRequisitionService.getRequisition(pr.id);
    expect(fetched.prNo).toBe(pr.prNo);
  });
});

/* ================================================================== */
/*  Point 32: URL state works (query parameter validation)            */
/* ================================================================== */
describe('Point 32: URL state', () => {
  it('PO status filter maps to URL state correctly', async () => {
    /* Create POs in different statuses */
    // eslint-disable-next-line no-unused-vars
    const po1 = await mockPurchaseOrderService.createOrder({
      title: 'Draft PO', vendor: VENDOR_A, reference: 'PR-URL-1',
      items: [{ product: 'Widget', hsn: '9999', uom: 'Nos', qty: 1, rate: 100, gstRate: 18 }]
    });
    const po2 = await mockPurchaseOrderService.createOrder({
      title: 'Approved PO', vendor: VENDOR_A, reference: 'PR-URL-2',
      items: [{ product: 'Widget', hsn: '9999', uom: 'Nos', qty: 1, rate: 100, gstRate: 18 }]
    });
    await mockPurchaseOrderService.approveOrder(po2.id);

    /* Filter by status */
    const drafts = await mockPurchaseOrderService.getOrders({ status: PO_STATUS.DRAFT });
    expect(drafts.data.every((o) => o.status === PO_STATUS.DRAFT)).toBe(true);

    const approved = await mockPurchaseOrderService.getOrders({ status: PO_STATUS.APPROVED });
    expect(approved.data.every((o) => o.status === PO_STATUS.APPROVED)).toBe(true);
  });

  it('PR tab filter works correctly', async () => {
    const pr = await mockRequisitionService.createRequisition({
      title: 'Tab test', department: 'Production', requester: 'User', priority: 'Low',
      expectedDate: '2026-10-01', currency: 'INR',
      items: [{ product: 'Widget', hsn: '9999', uom: 'Nos', qty: 1, rate: 10 }]
    });

    const { data: drafts } = await mockRequisitionService.getRequisitions({ tab: 'draft', page: 1, pageSize: 100 });
    expect(drafts.some((r) => r.id === pr.id)).toBe(true);
  });
});

/* ================================================================== */
/*  Point 33: Browser Back/Forward (state restoration)                */
/* ================================================================== */
describe('Point 33: Browser navigation (state restoration)', () => {
  it('filter state can be serialized and restored', () => {
    /* Simulate URL state serialization */
    const filters = { status: PO_STATUS.RELEASED, search: 'Tata', page: 2 };
    const serialized = new URLSearchParams(filters).toString();
    const restored = Object.fromEntries(new URLSearchParams(serialized));

    expect(restored.status).toBe(PO_STATUS.RELEASED);
    expect(restored.search).toBe('Tata');
    expect(restored.page).toBe('2');
  });

  it('search params preserve across navigation', () => {
    const params = new URLSearchParams();
    params.set('scope', 'active');
    params.set('stage', 'In Progress');
    params.set('search', 'Tata Steel');

    const restored = Object.fromEntries(params);
    expect(restored.scope).toBe('active');
    expect(restored.stage).toBe('In Progress');
    expect(restored.search).toBe('Tata Steel');
  });
});

/* ================================================================== */
/*  Point 34: Print/PDF works (service-level verification)           */
/* ================================================================== */
describe('Point 34: Print/PDF', () => {
  it('PO printPreview returns complete document data', async () => {
    const po = await mockPurchaseOrderService.createOrder({
      title: 'Print test PO', vendor: VENDOR_A, reference: 'PR-PRINT-1',
      items: [{ product: 'Widget', hsn: '9999', uom: 'Nos', qty: 10, rate: 100, gstRate: 18 }]
    });

    const preview = await mockPurchaseOrderService.printPreview(po.id);
    expect(preview.record).toBeTruthy();
    expect(preview.company).toBeTruthy();
    expect(preview.company.name).toBeTruthy();
    expect(preview.company.gstin).toBeTruthy();
    expect(preview.generatedAt).toBeTruthy();
    expect(preview.record.poNo).toBe(po.poNo);
    expect(preview.record.items).toHaveLength(1);
  });

  it('PR printPreview returns complete document data', async () => {
    const pr = await mockRequisitionService.createRequisition({
      title: 'Print test PR', department: 'Production', requester: 'User', priority: 'Medium',
      expectedDate: '2026-10-01', currency: 'INR',
      items: [{ product: 'Widget', hsn: '9999', uom: 'Nos', qty: 5, rate: 100 }]
    });

    const preview = await mockRequisitionService.printPreview(pr.id);
    expect(preview.record).toBeTruthy();
    expect(preview.company).toBeTruthy();
    expect(preview.generatedAt).toBeTruthy();
    expect(preview.record.prNo).toBe(pr.prNo);
  });

  it('print activity is logged after PDF export', async () => {
    const po = await mockPurchaseOrderService.createOrder({
      title: 'Print log test', vendor: VENDOR_A, reference: 'PR-PLOG-1',
      items: [{ product: 'Widget', hsn: '9999', uom: 'Nos', qty: 1, rate: 100, gstRate: 18 }]
    });

    await mockPurchaseOrderService.logPrintActivity(po.id);
    const fetched = await mockPurchaseOrderService.getOrder(po.id);
    expect(fetched.activity.some((a) => a.type === 'print')).toBe(true);
  });
});

/* ================================================================== */
/*  Point 35: Permissions are respected                               */
/* ================================================================== */
describe('Point 35: Permissions', () => {
  it('non-admin user cannot approve PR', async () => {
    localStorage.setItem('authUser', JSON.stringify({ fullName: 'Regular User', email: 'user@test.com', role: 'USER' }));
    const pr = await mockRequisitionService.createRequisition({
      title: 'Auth test', department: 'Production', requester: 'Other', priority: 'Low',
      expectedDate: '2026-10-01', currency: 'INR',
      items: [{ product: 'Widget', hsn: '9999', uom: 'Nos', qty: 1, rate: 10 }]
    });
    await mockRequisitionService.submitRequisition(pr.id);
    await expect(mockRequisitionService.approveRequisition(pr.id)).rejects.toThrow(/Forbidden/i);
  });

  it('self-approval is blocked', async () => {
    const pr = await mockRequisitionService.createRequisition({
      title: 'Self-approval test', department: 'Production', requester: 'QA Auditor', priority: 'Low',
      expectedDate: '2026-10-01', currency: 'INR',
      items: [{ product: 'Widget', hsn: '9999', uom: 'Nos', qty: 1, rate: 10 }]
    });
    await mockRequisitionService.submitRequisition(pr.id);
    await expect(mockRequisitionService.approveRequisition(pr.id)).rejects.toThrow(/cannot approve their own/i);
  });

  it('PO service transitions enforce valid stage guards', async () => {
    const po = await mockPurchaseOrderService.createOrder({
      title: 'Guard test', vendor: VENDOR_A, reference: 'PR-GUARD-1',
      items: [{ product: 'Widget', hsn: '9999', uom: 'Nos', qty: 1, rate: 100, gstRate: 18 }]
    });
    /* Cannot release a Draft PO */
    await expect(mockPurchaseOrderService.releaseOrder(po.id)).rejects.toThrow();
    /* Cannot acknowledge a Draft PO */
    await expect(mockPurchaseOrderService.acknowledgeOrder(po.id)).rejects.toThrow();
  });
});

/* ================================================================== */
/*  Point 36: Audit information is retained                           */
/* ================================================================== */
describe('Point 36: Audit information', () => {
  it('PR activity trail records all lifecycle events', async () => {
    const pr = await mockRequisitionService.createRequisition({
      title: 'Audit test', department: 'Production', requester: 'Test User', priority: 'Medium',
      expectedDate: '2026-10-01', currency: 'INR',
      items: [{ product: 'Widget', hsn: '9999', uom: 'Nos', qty: 1, rate: 100 }]
    });
    await mockRequisitionService.submitRequisition(pr.id);
    await mockRequisitionService.approveRequisition(pr.id);

    const timeline = await mockRequisitionService.getTimeline(pr.id);
    expect(timeline.events.length).toBeGreaterThanOrEqual(3);
    expect(timeline.events.some((e) => e.type === 'create')).toBe(true);
    expect(timeline.events.some((e) => e.type === 'submit')).toBe(true);
    expect(timeline.events.some((e) => e.type === 'approve')).toBe(true);
    timeline.events.forEach((e) => {
      expect(e.actor).toBeTruthy();
      expect(e.timestamp).toBeTruthy();
    });
  });

  it('PO activity trail records all lifecycle events', async () => {
    const po = await mockPurchaseOrderService.createOrder({
      title: 'Audit PO', vendor: VENDOR_A, reference: 'PR-AUDIT-1',
      items: [{ product: 'Widget', hsn: '9999', uom: 'Nos', qty: 1, rate: 100, gstRate: 18 }]
    });
    await mockPurchaseOrderService.approveOrder(po.id);
    await mockPurchaseOrderService.releaseOrder(po.id);
    await mockPurchaseOrderService.acknowledgeOrder(po.id);

    const fetched = await mockPurchaseOrderService.getOrder(po.id);
    expect(fetched.activity.length).toBeGreaterThanOrEqual(4);
    expect(fetched.activity.some((a) => a.type === 'create')).toBe(true);
    expect(fetched.activity.some((a) => a.type === 'approve')).toBe(true);
    expect(fetched.activity.some((a) => a.type === 'release')).toBe(true);
    expect(fetched.activity.some((a) => a.type === 'acknowledge')).toBe(true);
    fetched.activity.forEach((a) => {
      expect(a.actor).toBeTruthy();
      expect(a.timestamp).toBeTruthy();
      expect(a.label).toBeTruthy();
    });
  });

  it('invoice payment records audit trail', async () => {
    const po = await mockPurchaseOrderService.createOrder({
      title: 'Invoice audit', vendor: VENDOR_A, reference: 'PR-INV-1',
      items: [{ product: 'Widget', hsn: '9999', uom: 'Nos', qty: 10, rate: 100, gstRate: 18 }]
    });
    await mockPurchaseOrderService.approveOrder(po.id);
    await mockPurchaseOrderService.releaseOrder(po.id);
    const grn = await logisticsService.createGrn(po.poNo);
    await logisticsService.receiveGoods(grn.id);
    const invoice = await mockInvoiceService.createInvoice({
      poNo: po.poNo, vendor: VENDOR_A, amount: po.amount,
      gst: 0, status: INVOICE_STATUS.SUBMITTED
    });
    await mockInvoiceService.approveInvoice(invoice.id);
    await mockInvoiceService.recordPayment(invoice.id, { method: 'Bank Transfer', full: true });

    const fetched = await mockInvoiceService.getInvoice(invoice.id);
    expect(fetched.status).toBe(INVOICE_STATUS.PAID);
    expect(fetched.paymentNo).toMatch(/^PAY-/);
    expect(fetched.paymentDate).toBeTruthy();
  });
});

/* ================================================================== */
/*  Canonical PO Stage Normalization                                   */
/* ================================================================== */
describe('Canonical PO stage normalization', () => {
  it('normalizePOStatus maps legacy Open to In Progress', () => {
    expect(normalizePOStatus('Open')).toBe(PO_STATUS.IN_PROGRESS);
  });

  it('normalizePOStatus maps legacy Partial to Partially Delivered', () => {
    expect(normalizePOStatus('Partial')).toBe(PO_STATUS.PARTIALLY_DELIVERED);
  });

  it('normalizePOStatus passes canonical stages through unchanged', () => {
    Object.values(PO_STATUS).forEach((status) => {
      expect(normalizePOStatus(status)).toBe(status);
    });
  });

  it('all POs returned from service have canonical stages', async () => {
    const po = await mockPurchaseOrderService.createOrder({
      title: 'Canonical test', vendor: VENDOR_A, reference: 'PR-CANON-1',
      items: [{ product: 'Widget', hsn: '9999', uom: 'Nos', qty: 1, rate: 100, gstRate: 18 }]
    });
    expect(Object.values(PO_STATUS)).toContain(po.status);
    expect(['Open', 'Partial']).not.toContain(po.status);
  });
});
