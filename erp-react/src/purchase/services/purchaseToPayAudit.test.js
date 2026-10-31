/**
 * purchase/services/purchaseToPayAudit.test.js
 * ------------------------------------------------------------------
 * Phase 8 — COMPLETE PURCHASE-TO-PAY QA.
 *
 * Executes the entire real workflow end to end (mock services — the
 * same code path the demo uses) and verifies every document retains
 * its upstream references:
 *
 *   1  Create PR          10  Technical Evaluation   19  Shipment
 *   2  Approve PR         11  Commercial Evaluation  20  GRN
 *   3  Technical Review   12  Price Negotiation      21  Quality Inspection
 *   4  Convert PR → RFQ   13  Supplier Selection     22  Inventory Update
 *   5  Select vendors     14  RFQ Award              23  Invoice
 *   6  Approve RFQ        15  Create PO              24  Three-Way Match
 *   7  Send RFQ           16  PO Approval            25  Payment Approval
 *   8  Enter quotations   17  PO Release             26  Vendor Payment
 *   9  Compare quotations 18  Supplier Acknowledgement 27  Payment Advice
 *
 * Verified numbers retained per document: PR No, RFQ No, Quotation No,
 * PO No, Shipment No, GRN No, QC No, Invoice No, Payment No,
 * Payment Advice No. Also asserts the audit timeline records the major
 * events with actors and timestamps.
 * ------------------------------------------------------------------
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APPROVAL_STATUS, INVOICE_STATUS, MATCH_STATUS, PO_STATUS, PR_STATUS, RFQ_STATUS } from '../constants';
import { mockRequisitionService, requisitionsStore } from './requisition';
import { mockRfqService, rfqsStore, quotationsStore } from './rfq';
import { mockPurchaseOrderService, ordersStore } from './purchaseOrder';
import {
  logisticsService, INSPECTION_STATUS,
  grnsStore, inspectionsStore, shipmentsStore, inventoryStore
} from './logistics';
import { mockInvoiceService, invoicesStore, advicesStore } from './invoice';
import { evaluationService, evaluationsStore } from './evaluation';
import { mockVendorService, vendorsStore } from './vendor';

/* Stub the simulated latency so every service call resolves instantly. */
vi.mock('./base', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, delay: () => Promise.resolve() };
});

/* Deterministic signed-in user for activity / payment actor names. The
   ADMIN role satisfies the PR approval permission guard enforced by the
   requisition service (approve / reject reject unauthorised callers). */
function setActor() {
  localStorage.setItem('authUser', JSON.stringify({ fullName: 'QA Auditor', email: 'qa@test.com', role: 'ADMIN' }));
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
  /* Create approved vendors so RFQ send/vendor checks pass. */
  const tata = await mockVendorService.createVendor({ name: 'Tata Steel Ltd', category: 'Steel & Metals' });
  await mockVendorService.setVendorStatus(tata.id, 'Approved');
  const jsw = await mockVendorService.createVendor({ name: 'JSW Steel', category: 'Steel & Metals' });
  await mockVendorService.setVendorStatus(jsw.id, 'Approved');
});

const VENDOR_A = 'Tata Steel Ltd';
const VENDOR_B = 'JSW Steel';

/* Valid finalized payment terms used by the strict-gate evaluation flows. */
const TERMS = { type: 'Against Delivery', balanceTrigger: 'Against Delivery' };

describe('PHASE 8 — complete purchase-to-pay audit', () => {
  it('executes all 27 steps and retains every document number end to end', async () => {
    /* ------------------------------------------------------------------ */
    /* STEP 1 — Create PR (Draft)                                          */
    /* ------------------------------------------------------------------ */
    const pr = await mockRequisitionService.createRequisition({
      title: 'QA audit materials',
      department: 'Production',
      project: 'Unit 2 Expansion',
      requester: 'Test Requester',
      priority: 'High',
      expectedDate: '2026-09-30',
      deliveryLocation: 'Plant 1 - Main Gate, Pune',
      currency: 'INR',
      items: [
        { product: 'HR coil 3mm', hsn: '7208', uom: 'Kg', qty: 100, rate: 24.5, expectedRate: 24.5 },
        { product: 'MS plate 6mm', hsn: '7208', uom: 'Kg', qty: 50, rate: 28, expectedRate: 28 }
      ]
    });
    expect(pr.prNo).toMatch(/^PR-2026-/);
    expect(pr.status).toBe(PR_STATUS.DRAFT);
    const PR_NO = pr.prNo;

    /* STEP 2 — Submit + Approve PR. Purchasing approval moves the PR
       into the Technical Specification Review stage (no longer terminal). */
    await mockRequisitionService.submitRequisition(pr.id);
    const submitted = await mockRequisitionService.approveRequisition(pr.id);
    expect(submitted.status).toBe(PR_STATUS.TECHNICAL_REVIEW);
    expect(submitted.approvalStatus).toBe(APPROVAL_STATUS.APPROVED);

    /* STEP 3 — Technical Review. */
    const reviewed = await mockRequisitionService.saveTechnicalReview(pr.id, {
      specification: 'HR coil 3mm IS 2062',
      drawing: 'QA-F-1100 rev A',
      materialGrade: 'IS 2062 E250',
      dimensions: '3mm x 1250mm x 2500mm',
      comments: 'Conforms to spec.',
      reviewStatus: 'Reviewed'
    });
    expect(reviewed.technicalReview?.reviewStatus).toBe('Reviewed');
    expect(reviewed.activity.some((entry) => entry.type === 'review')).toBe(true);

    /* STEP 3b — Approve the technical review → Ready for RFQ. */
    const techApproved = await mockRequisitionService.completeTechnicalReview(pr.id, 'Spec conforms');
    expect(techApproved.status).toBe(PR_STATUS.READY_FOR_RFQ);

    /* STEP 4 — Convert PR → RFQ (inherits PR data, no re-entry). */
    const { created, errors } = await mockRequisitionService.convertToRfq([pr.id]);
    expect(errors).toHaveLength(0);
    expect(created).toHaveLength(1);
    const rfqDraft = created[0];
    expect(rfqDraft.rfqNo).toMatch(/^RFQ-2026-/);
    expect(rfqDraft.prNo || rfqDraft.reference).toBe(PR_NO);
    expect(rfqDraft.items).toHaveLength(2);

    /* The PR is now Converted to RFQ and stores its RFQ number. */
    const linkedPr = await mockRequisitionService.getRequisition(pr.id);
    expect(linkedPr.status).toBe(PR_STATUS.CONVERTED);
    expect(linkedPr.rfqNo).toBe(rfqDraft.rfqNo);
    const RFQ_NO = rfqDraft.rfqNo;

    /* STEP 5 — Select approved vendors (invite the two master vendors).
       updateRfq syncs vendorCount from the `vendors` array. */
    await mockRfqService.updateRfq(rfqDraft.id, { vendors: [VENDOR_A, VENDOR_B] });

    /* STEP 6 — Approve RFQ (Draft → Pending Approval → Approved). */
    await mockRfqService.submitForReview(rfqDraft.id);
    await mockRfqService.approveRfq(rfqDraft.id);
    const approvedRfq = await mockRfqService.getRfq(rfqDraft.id);
    expect(approvedRfq.status).toBe(RFQ_STATUS.APPROVED);
    expect(approvedRfq.activity.some((entry) => entry.type === 'approve')).toBe(true);

    /* STEP 7 — Send RFQ (Approved → Sent; records activity + vendor list). */
    await mockRfqService.sendRfq(rfqDraft.id);
    const sentRfq = await mockRfqService.getRfq(rfqDraft.id);
    expect(sentRfq.status).toBe(RFQ_STATUS.SENT);
    expect(sentRfq.activity.some((entry) => entry.type === 'send')).toBe(true);
    expect(sentRfq.activity.some((entry) => entry.label && /sent/i.test(entry.label))).toBe(true);

    /* STEP 8 — Enter multiple quotations (two vendors). */
    const quoteItems = rfqDraft.items.map((item) => ({
      product: item.product,
      hsn: item.hsn,
      uom: item.uom,
      qty: item.qty,
      rate: item.rate ?? item.expectedRate ?? 0,
      gstRate: 18
    }));
    const quoteA = await mockRfqService.saveQuotation({
      rfqNo: RFQ_NO,
      vendor: VENDOR_A,
      submittedOn: '2026-08-20',
      validUntil: '2026-09-10',
      currency: 'INR',
      discount: 2,
      freight: 100,
      insurance: 50,
      leadTime: 15,
      delivery: 12,
      paymentTerms: '30 Days',
      warranty: '12 Months',
      items: quoteItems
    });
    const quoteB = await mockRfqService.saveQuotation({
      rfqNo: RFQ_NO,
      vendor: VENDOR_B,
      submittedOn: '2026-08-21',
      validUntil: '2026-09-10',
      currency: 'INR',
      discount: 1,
      freight: 120,
      insurance: 60,
      leadTime: 20,
      delivery: 15,
      paymentTerms: '30 Days',
      warranty: '12 Months',
      items: quoteItems.map((item) => ({ ...item, rate: Math.round((item.rate * 0.97) * 100) / 100 }))
    });
    expect(quoteA.quotationNo).toMatch(/^QT-\d{3,}$/);
    expect(quoteB.quotationNo).toMatch(/^QT-\d{3,}$/);
    expect(quoteA.quotationNo).not.toBe(quoteB.quotationNo);
    /* Quotations reference the RFQ and the PR. */
    expect(quoteA.prNo || quoteA.rfqNo).toBeTruthy();
    expect(quoteA.rfqNo).toBe(RFQ_NO);
    const QUOTATION_NO = quoteA.quotationNo;

    /* STEP 9 — Compare quotations (built from stored data). */
    const comparison = await mockRfqService.getQuotationComparison(rfqDraft.id);
    expect(comparison.quotes).toHaveLength(2);
    expect(comparison.winner).toBeTruthy();
    expect(comparison.rfq.rfqNo).toBe(RFQ_NO);    /* STEP 10/11 — Price negotiation (Agreed), then
       the Technical + Commercial evaluations with finalized terms. */
    await mockRfqService.startEvaluation(rfqDraft.id);
    const agreed = Math.round(quoteA.total * 0.95 * 100) / 100;
    await evaluationService.recordNegotiation(rfqDraft.id, VENDOR_A, { amount: agreed, stage: 'Agreed' });
    await evaluationService.completeTechnicalEvaluation(rfqDraft.id);
    await evaluationService.completeCommercialEvaluation(rfqDraft.id, { paymentTerms: TERMS });
    const evaluation = await evaluationService.getEvaluation(rfqDraft.id);
    expect(evaluation).toBeTruthy();
    expect(evaluation.steps.negotiation).toBe(true);
    expect(evaluation.steps.technical).toBe(true);
    expect(evaluation.steps.commercial).toBe(true);

    /* STEP 13 — Supplier selection (explicit, never automatic). */
    await evaluationService.completeSupplierSelection(rfqDraft.id, VENDOR_A, { rationale: 'Best price + delivery' });
    await evaluationService.approveSupplierSelection(rfqDraft.id, { decision: APPROVAL_STATUS.APPROVED });

    /* STEP 14 — RFQ Award (requires approved selection; references the
       selected vendor + quotation + final negotiated value). */
    await mockRfqService.awardRfq(rfqDraft.id, VENDOR_A);
    const awarded = await mockRfqService.getRfq(rfqDraft.id);
    expect(awarded.status).toBe(RFQ_STATUS.AWARDED);
    expect(awarded.awardedVendor).toBe(VENDOR_A);

    /* STEP 15 — Create PO from the awarded RFQ (inherits the full chain). */
    const { po } = await mockRfqService.raisePurchaseOrder(rfqDraft.id);
    expect(po.poNo).toMatch(/^PO-2026-/);
    expect(po.prNo || po.reference).toBe(PR_NO);
    expect(po.rfqNo).toBe(RFQ_NO);
    expect(po.quotationNo).toBe(QUOTATION_NO);
    expect(po.vendor).toBe(VENDOR_A);
    expect(po.awardedValue).toBe(agreed);
    const PO_NO = po.poNo;

    /* STEP 16/17 — PO Approval + Release (separate from delivery status). */
    await mockPurchaseOrderService.approveOrder(po.id);
    await mockPurchaseOrderService.releaseOrder(po.id);
    const released = await mockPurchaseOrderService.getOrder(po.id);
    expect(released.approvalStatus).toBe(APPROVAL_STATUS.APPROVED);
    expect(released.status).toBe(PO_STATUS.RELEASED);

    /* STEP 18 — Supplier acknowledgement (released-only). */
    await mockPurchaseOrderService.acknowledgeOrder(po.id);
    const acknowledged = await mockPurchaseOrderService.getOrder(po.id);
    expect(acknowledged.acknowledged).toBe(true);
    expect(acknowledged.acknowledgedAt).toBeTruthy();
    expect(acknowledged.activity.some((entry) => entry.type === 'acknowledge')).toBe(true);

    /* STEP 19 — Shipment references the PO. */
    const shipment = await logisticsService.createShipment({ poNo: PO_NO, carrier: 'VRL', mode: 'Road' });
    expect(shipment.shipmentNo).toMatch(/^SHP-2026-/);
    expect(shipment.poNo).toBe(PO_NO);
    const SHIPMENT_NO = shipment.shipmentNo;

    /* STEP 20 — GRN references the PO and auto-loads its items. */
    const grn = await logisticsService.createGrn(PO_NO);
    expect(grn.grnNo).toMatch(/^GRN-2026-/);
    expect(grn.poNo).toBe(PO_NO);
    expect(grn.items).toHaveLength(2);
    const GRN_NO = grn.grnNo;

    /* Receive the full quantity (normalised per line). */
    await logisticsService.receiveGoods(grn.id);
    const received = await logisticsService.getGrns({ search: GRN_NO });
    expect(received.data[0].items.every((item) => item.received === item.qty)).toBe(true);

    /* STEP 21 — Quality inspection auto-opens for the GRN (QC No). */
    const inspection = (await logisticsService.getInspections({ search: GRN_NO })).data[0];
    expect(inspection).toBeTruthy();
    expect(inspection.inspectionNo).toMatch(/^QC-2026-/);
    expect(inspection.grnNo).toBe(GRN_NO);
    expect(inspection.poNo).toBe(PO_NO);
    const QC_NO = inspection.inspectionNo;
    await logisticsService.setInspectionResult(inspection.id, INSPECTION_STATUS.PASSED, 'All batches conform.');

    /* STEP 22 — Inventory update (accepted quantity only, once). */
    const posts = await logisticsService.postInventoryFromInspection(inspection.id);
    expect(posts.length).toBeGreaterThan(0);
    posts.forEach((post) => {
      expect(post.type).toBe('Receipt');
      expect(post.reference).toBe(GRN_NO);
      expect(post.poNo).toBe(PO_NO);
      expect(post.grnNo).toBe(GRN_NO);
      expect(post.inspectionNo).toBe(QC_NO);
    });
    /* Duplicate posting refused. */
    await expect(logisticsService.postInventoryFromInspection(inspection.id)).rejects.toThrow(
      /already been posted to inventory/
    );

    /* STEP 23 — Invoice references the PO (vendor must match). */
    const invoice = await mockInvoiceService.createInvoice({
      poNo: PO_NO,
      vendor: VENDOR_A,
      amount: po.amount,
      gst: 0,
      status: INVOICE_STATUS.SUBMITTED,
      items: po.items.map((item) => ({ product: item.product, qty: item.qty, rate: item.rate, gst: item.gstRate }))
    });
    expect(invoice.invoiceNo).toMatch(/^VINV-2026-/);
    expect(invoice.poNo).toBe(PO_NO);
    const INVOICE_NO = invoice.invoiceNo;

    /* STEP 24 — Three-way match (PO vs GRN vs Invoice) is Matched. */
    const matched = await mockInvoiceService.getInvoice(invoice.id);
    expect(matched.matchStatus).toBe(MATCH_STATUS.MATCHED);

    /* STEP 25 — Payment approval (only matched invoices proceed). */
    await mockInvoiceService.approveInvoice(invoice.id);
    const approvedInv = await mockInvoiceService.getInvoice(invoice.id);
    expect(approvedInv.status).toBe(INVOICE_STATUS.APPROVED);

    /* STEP 26 — Vendor payment (approved only; stores the full record). */
    const paid = await mockInvoiceService.recordPayment(invoice.id, {
      method: 'Bank Transfer',
      full: true,
      transactionReference: 'TXN-QA-0001'
    });
    expect(paid.status).toBe(INVOICE_STATUS.PAID);
    expect(paid.paymentNo).toMatch(/^PAY-2026-/);
    const PAYMENT_NO = paid.paymentNo;

    /* STEP 27 — Payment advice (references payment, invoice, PO, vendor). */
    const advices = await mockInvoiceService.getPaymentAdvices();
    const advice = advices.find((entry) => entry.invoiceNo === INVOICE_NO);
    expect(advice).toBeTruthy();
    expect(advice.adviceNo).toMatch(/^ADV-2026-/);
    expect(advice.paymentNo).toBe(PAYMENT_NO);
    expect(advice.invoiceNo).toBe(INVOICE_NO);
    expect(advice.poNo).toBe(PO_NO);
    expect(advice.vendor).toBe(VENDOR_A);
    const ADVICE_NO = advice.adviceNo;

    /* ------------------------------------------------------------------ */
    /* TRACEABILITY — every document number retained across the chain.     */
    /* ------------------------------------------------------------------ */
    expect(PR_NO).toMatch(/^PR-2026-/);
    expect(RFQ_NO).toMatch(/^RFQ-2026-/);
    expect(QUOTATION_NO).toMatch(/^QT-\d{3,}$/);
    expect(PO_NO).toMatch(/^PO-2026-/);
    expect(SHIPMENT_NO).toMatch(/^SHP-2026-/);
    expect(GRN_NO).toMatch(/^GRN-2026-/);
    expect(QC_NO).toMatch(/^QC-2026-/);
    expect(INVOICE_NO).toMatch(/^VINV-2026-/);
    expect(PAYMENT_NO).toMatch(/^PAY-2026-/);
    expect(ADVICE_NO).toMatch(/^ADV-2026-/);

    /* Each downstream document still carries its upstream chain. */
    const finalPr = await mockRequisitionService.getRequisition(pr.id);
    expect(finalPr.rfqNo).toBe(RFQ_NO); // PR → RFQ
    const finalRfq = await mockRfqService.getRfq(rfqDraft.id);
    expect(finalRfq.prNo || finalRfq.reference).toBe(PR_NO); // RFQ → PR
    expect(finalRfq.poNo).toBe(PO_NO); // RFQ → PO
    const finalPo = await mockPurchaseOrderService.getOrder(po.id);
    expect(finalPo.rfqNo).toBe(RFQ_NO); // PO → RFQ
    expect(finalPo.prNo || finalPo.reference).toBe(PR_NO); // PO → PR
    expect(finalPo.quotationNo).toBe(QUOTATION_NO); // PO → Quotation
    expect(grn.poNo).toBe(PO_NO); // GRN → PO
    expect(inspection.poNo).toBe(PO_NO); // QC → PO
    expect(invoice.poNo).toBe(PO_NO); // Invoice → PO
    expect(paid.poNo).toBe(PO_NO); // Payment → PO
    expect(advice.poNo).toBe(PO_NO); // Advice → PO
  }, 60000);

  it('records a complete audit timeline with actors and timestamps', async () => {
    /* Walk a lighter chain and assert the timeline grows with the events. */
    const pr = await mockRequisitionService.createRequisition({
      title: 'Timeline audit',
      department: 'Production',
      project: 'Unit 2 Expansion',
      requester: 'Test Requester',
      priority: 'Medium',
      expectedDate: '2026-09-30',
      currency: 'INR',
      items: [{ product: 'Widget', hsn: '9999', uom: 'Nos', qty: 5, rate: 10, expectedRate: 10 }]
    });
    await mockRequisitionService.submitRequisition(pr.id);
    await mockRequisitionService.approveRequisition(pr.id);
    await mockRequisitionService.saveTechnicalReview(pr.id, { comments: 'OK', reviewStatus: 'Reviewed' });
    await mockRequisitionService.completeTechnicalReview(pr.id, 'OK');
    const { created } = await mockRequisitionService.convertToRfq([pr.id]);
    const rfqId = created[0].id;

    const prTimeline = await mockRequisitionService.getTimeline(pr.id);
    const types = prTimeline.events.map((entry) => entry.type);
    expect(types).toContain('create');
    expect(types).toContain('submit');
    expect(types).toContain('approve');
    expect(types).toContain('review');
    expect(types).toContain('rfq');
    prTimeline.events.forEach((entry) => {
      expect(entry.timestamp).toBeTruthy();
      expect(entry.actor).toBeTruthy();
      expect(entry.label).toBeTruthy();
    });

    await mockRfqService.updateRfq(rfqId, { vendors: [VENDOR_A] });
    await mockRfqService.submitForReview(rfqId);
    await mockRfqService.approveRfq(rfqId);
    await mockRfqService.sendRfq(rfqId);
    const rfq = await mockRfqService.getRfq(rfqId);
    const rfqTypes = rfq.activity.map((entry) => entry.type);
    expect(rfqTypes).toContain('create');
    expect(rfqTypes).toContain('submit');
    expect(rfqTypes).toContain('approve');
    expect(rfqTypes).toContain('send');
    rfq.activity.forEach((entry) => {
      expect(entry.actor).toBeTruthy();
      expect(entry.timestamp).toBeTruthy();
      expect(entry.label).toBeTruthy();
    });
  }, 60000);
});

describe('PHASE 8 — invalid transitions (all 13 negative cases)', () => {
  /** Reusable fixture: an approved, sent RFQ with two quotations, ready for
   *  evaluation — but no technical/commercial evaluation, no negotiation,
   *  no supplier selection, no award. */
  async function sentRfqWithQuotations() {
    const pr = await mockRequisitionService.createRequisition({
      title: 'Invalid-case materials',
      department: 'Production',
      project: 'Unit 2 Expansion',
      requester: 'Test Requester',
      priority: 'Medium',
      expectedDate: '2026-09-30',
      currency: 'INR',
      items: [{ product: 'Widget X', hsn: '9001', uom: 'Nos', qty: 10, rate: 50, expectedRate: 50 }]
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
      rfqNo: rfq.rfqNo,
      vendor: VENDOR_A,
      submittedOn: '2026-08-20',
      validUntil: '2026-09-10',
      currency: 'INR',
      items: rfq.items.map((item) => ({
        product: item.product,
        hsn: item.hsn,
        uom: item.uom,
        qty: item.qty,
        rate: item.rate ?? item.expectedRate ?? 0,
        gstRate: 18
      }))
    });
    return { pr, rfq };
  }

  it('1. duplicate RFQ — a converted PR cannot be converted again', async () => {
    const pr = await mockRequisitionService.createRequisition({
      title: 'Dup RFQ', department: 'Production', requester: 'QA', priority: 'Medium',
      expectedDate: '2026-09-30', currency: 'INR',
      items: [{ product: 'Widget', hsn: '9001', uom: 'Nos', qty: 1, rate: 1, expectedRate: 1 }]
    });
    await mockRequisitionService.submitRequisition(pr.id);
    await mockRequisitionService.approveRequisition(pr.id);
    await mockRequisitionService.completeTechnicalReview(pr.id);
    const first = await mockRequisitionService.convertToRfq([pr.id]);
    expect(first.errors).toHaveLength(0);
    const second = await mockRequisitionService.convertToRfq([pr.id]);
    expect(second.created).toHaveLength(0);
    expect(second.errors[0].error).toMatch(/only ready-for-rfq requisitions can be converted/i);
  });

  it('2. duplicate PO — an awarded RFQ cannot raise a second PO', async () => {
    const { rfq } = await sentRfqWithQuotations();
    await mockRfqService.startEvaluation(rfq.id);
    await evaluationService.recordNegotiation(rfq.id, VENDOR_A, { amount: 480, stage: 'Agreed' });
    await evaluationService.completeTechnicalEvaluation(rfq.id);
    await evaluationService.completeCommercialEvaluation(rfq.id, { paymentTerms: TERMS });
    await evaluationService.completeSupplierSelection(rfq.id, VENDOR_A);
    await evaluationService.approveSupplierSelection(rfq.id, { decision: APPROVAL_STATUS.APPROVED });
    await mockRfqService.awardRfq(rfq.id, VENDOR_A);
    await mockRfqService.raisePurchaseOrder(rfq.id);
    await expect(mockRfqService.raisePurchaseOrder(rfq.id)).rejects.toThrow(/already raised for this RFQ/);
  });

  it('3. invalid vendor — a Pending vendor blocks the RFQ send', async () => {
    const pr = await mockRequisitionService.createRequisition({
      title: 'Vendor gate', department: 'Production', requester: 'QA', priority: 'Medium',
      expectedDate: '2026-09-30', currency: 'INR',
      items: [{ product: 'Widget', hsn: '9001', uom: 'Nos', qty: 1, rate: 1, expectedRate: 1 }]
    });
    await mockRequisitionService.submitRequisition(pr.id);
    await mockRequisitionService.approveRequisition(pr.id);
    await mockRequisitionService.completeTechnicalReview(pr.id);
    const { created } = await mockRequisitionService.convertToRfq([pr.id]);
    const rfq = created[0];
    /* ABB is Pending Approval in the vendor master. */
    await mockRfqService.updateRfq(rfq.id, { vendors: ['ABB'] });
    await mockRfqService.submitForReview(rfq.id);
    await mockRfqService.approveRfq(rfq.id);
    await expect(mockRfqService.sendRfq(rfq.id)).rejects.toThrow(/not approved vendors/);
  });

  it('4. unapproved RFQ cannot be sent', async () => {
    const { rfq } = await sentRfqWithQuotations();
    const unapproved = await mockRfqService.createRfq({
      title: 'Not approved', reference: 'PR-X1', vendorNames: [VENDOR_A],
      items: [{ product: 'Widget', hsn: '9001', uom: 'Nos', qty: 1, rate: 1 }]
    });
    await mockRfqService.submitForReview(unapproved.id);
    await expect(mockRfqService.sendRfq(unapproved.id)).rejects.toThrow(/Only approved RFQs can be sent/);
    expect(rfq.rfqNo).toBeTruthy();
  });

  it('5. quotation without RFQ is refused', async () => {
    await expect(
      mockRfqService.saveQuotation({ rfqNo: 'RFQ-2026-9999', vendor: VENDOR_A, items: [] })
    ).rejects.toThrow(/RFQ/);
  });

  it('6. award without evaluation is refused', async () => {
    const { rfq } = await sentRfqWithQuotations();
    await expect(mockRfqService.awardRfq(rfq.id, VENDOR_A)).rejects.toThrow(/supplier selection/);
  });

  it('7. PO without award is refused', async () => {
    const { rfq } = await sentRfqWithQuotations();
    await expect(mockRfqService.raisePurchaseOrder(rfq.id)).rejects.toThrow(/Only awarded RFQs/);
  });

  it('8. GRN above ordered quantity is refused', async () => {
    const po = await mockPurchaseOrderService.createOrder({
      title: 'Over-receipt PO', vendor: VENDOR_A, reference: 'PR-X2',
      items: [{ product: 'Widget', hsn: '9001', uom: 'Nos', qty: 10, rate: 10, gstRate: 18 }]
    });
    await mockPurchaseOrderService.approveOrder(po.id);
    const grn = await logisticsService.createGrn(po.poNo);
    await expect(
      logisticsService.receiveGoods(grn.id, [{ product: 'Widget', received: 11 }])
    ).rejects.toThrow(/exceeds the outstanding order quantity \(10\)/);
  });

  it('9. invoice without PO is refused', async () => {
    await expect(
      mockInvoiceService.createInvoice({ poNo: 'PO-NOT-EXIST', vendor: VENDOR_A, amount: 100, gst: 0 })
    ).rejects.toThrow(/must reference a valid PO/);
  });

  it('10. invoice mismatch blocks payment approval', async () => {
    const po = await mockPurchaseOrderService.createOrder({
      title: 'Mismatch PO', vendor: VENDOR_A, reference: 'PR-X3',
      items: [{ product: 'Widget', hsn: '9001', uom: 'Nos', qty: 10, rate: 10, gstRate: 18 }]
    });
    await mockPurchaseOrderService.approveOrder(po.id);
    await mockPurchaseOrderService.releaseOrder(po.id);
    const grn = await logisticsService.createGrn(po.poNo);
    await logisticsService.receiveGoods(grn.id);
    const invoice = await mockInvoiceService.createInvoice({
      poNo: po.poNo, invoiceNo: 'INV-2026-7201', vendor: VENDOR_A,
      amount: 5000, gst: 0, status: INVOICE_STATUS.SUBMITTED
    });
    const fetched = await mockInvoiceService.getInvoice(invoice.id);
    expect(fetched.matchStatus).toBe(MATCH_STATUS.MISMATCH);
    await expect(mockInvoiceService.approveInvoice(invoice.id)).rejects.toThrow(/three-way match is mismatch/);
  });

  it('11. payment without match is blocked', async () => {
    const po = await mockPurchaseOrderService.createOrder({
      title: 'No-match PO', vendor: VENDOR_A, reference: 'PR-X4',
      items: [{ product: 'Widget', hsn: '9001', uom: 'Nos', qty: 10, rate: 10, gstRate: 18 }]
    });
    await mockPurchaseOrderService.approveOrder(po.id);
    await mockPurchaseOrderService.releaseOrder(po.id);
    const grn = await logisticsService.createGrn(po.poNo);
    await logisticsService.receiveGoods(grn.id);
    const invoice = await mockInvoiceService.createInvoice({
      poNo: po.poNo, invoiceNo: 'INV-2026-7202', vendor: VENDOR_A,
      amount: 5000, gst: 0, status: INVOICE_STATUS.SUBMITTED
    });
    /* Unapproved AND unmatched — payment is blocked before any money moves. */
    await expect(
      mockInvoiceService.recordPayment(invoice.id, { method: 'Bank Transfer', full: true })
    ).rejects.toThrow(/Only approved invoices can be paid/);
  });

  it('12. duplicate payment is refused', async () => {
    const po = await mockPurchaseOrderService.createOrder({
      title: 'Dup pay PO', vendor: VENDOR_A, reference: 'PR-X5',
      items: [{ product: 'Widget', hsn: '9001', uom: 'Nos', qty: 10, rate: 10, gstRate: 18 }]
    });
    await mockPurchaseOrderService.approveOrder(po.id);
    await mockPurchaseOrderService.releaseOrder(po.id);
    const grn = await logisticsService.createGrn(po.poNo);
    await logisticsService.receiveGoods(grn.id);
    const invoice = await mockInvoiceService.createInvoice({
      poNo: po.poNo, invoiceNo: 'INV-2026-7203', vendor: VENDOR_A,
      amount: po.amount, gst: 0, status: INVOICE_STATUS.SUBMITTED
    });
    await mockInvoiceService.approveInvoice(invoice.id);
    await mockInvoiceService.recordPayment(invoice.id, { method: 'UPI', full: true });
    await expect(
      mockInvoiceService.recordPayment(invoice.id, { method: 'UPI', full: true })
    ).rejects.toThrow(/already paid/);
  });

  it('13. duplicate payment advice is prevented', async () => {
    const po = await mockPurchaseOrderService.createOrder({
      title: 'Dup advice PO', vendor: VENDOR_A, reference: 'PR-X6',
      items: [{ product: 'Widget', hsn: '9001', uom: 'Nos', qty: 10, rate: 10, gstRate: 18 }]
    });
    await mockPurchaseOrderService.approveOrder(po.id);
    await mockPurchaseOrderService.releaseOrder(po.id);
    const grn = await logisticsService.createGrn(po.poNo);
    await logisticsService.receiveGoods(grn.id);
    const invoice = await mockInvoiceService.createInvoice({
      poNo: po.poNo, invoiceNo: 'INV-2026-7204', vendor: VENDOR_A,
      amount: po.amount, gst: 0, status: INVOICE_STATUS.SUBMITTED
    });
    await mockInvoiceService.approveInvoice(invoice.id);
    await mockInvoiceService.recordPayment(invoice.id, { method: 'Cheque', full: true });
    const advices = await mockInvoiceService.getPaymentAdvices();
    const own = advices.filter((entry) => entry.invoiceNo === 'INV-2026-7204');
    expect(own).toHaveLength(1);
    /* Reading advices again never duplicates them. */
    const again = (await mockInvoiceService.getPaymentAdvices()).filter(
      (entry) => entry.invoiceNo === 'INV-2026-7204'
    );
    expect(again).toHaveLength(1);
  });
});

describe('PHASE 8 — approval authorization guard', () => {
  /** Fixture: a submitted (Pending Approval) requisition. */
  async function pendingRequisition(requester) {
    const pr = await mockRequisitionService.createRequisition({
      title: 'Approval guard', department: 'Production', requester, priority: 'Medium',
      expectedDate: '2026-09-30', currency: 'INR',
      items: [{ product: 'Widget', hsn: '9001', uom: 'Nos', qty: 1, rate: 1, expectedRate: 1 }]
    });
    await mockRequisitionService.submitRequisition(pr.id);
    return pr;
  }

  it('approve/reject are refused for a user without approver permission', async () => {
    /* Plain user — no ADMIN role, no approval permission. The service
       must refuse even if the UI buttons were bypassed (console / route
       / manipulated frontend state). */
    localStorage.setItem('authUser', JSON.stringify({ fullName: 'Priya Patel', email: 'priya@test.com', role: 'USER' }));
    const pr = await pendingRequisition('Priya Patel');
    await expect(mockRequisitionService.approveRequisition(pr.id)).rejects.toThrow(/Forbidden/i);
    await expect(mockRequisitionService.rejectRequisition(pr.id)).rejects.toThrow(/Forbidden/i);
    /* The rejected attempts must not have touched the record. */
    const untouched = await mockRequisitionService.getRequisition(pr.id);
    expect(untouched.status).toBe(PR_STATUS.PENDING_APPROVAL);
  });

  it('allows approve for an ADMIN-role user and records the approver', async () => {
    localStorage.setItem('authUser', JSON.stringify({ fullName: 'Admin User', email: 'admin@vishaktech.com', role: 'ADMIN' }));
    const pr = await pendingRequisition('Priya Patel');
    const approved = await mockRequisitionService.approveRequisition(pr.id);
    expect(approved.status).toBe(PR_STATUS.TECHNICAL_REVIEW);
    expect(approved.approvalStatus).toBe(APPROVAL_STATUS.APPROVED);
    expect(approved.approvedBy).toBe('Admin User');
  });
});
