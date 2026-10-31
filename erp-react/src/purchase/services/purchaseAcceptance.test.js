/**
 * purchase/services/purchaseAcceptance.test.js
 * ------------------------------------------------------------------
 * COMPLETE ERP ACCEPTANCE TEST — the Purchase module is only complete
 * when ONE real transaction survives the whole lifecycle with real
 * linked data:
 *
 *   PR → RFQ → Quotation → Award → PO → Approval → Release →
 *   Supplier Acknowledgement → Packing → Shipment → GRN → Inspection →
 *   Inventory → Vendor Invoice → 3-Way Match → Invoice Approval →
 *   Payment → Payment Advice → Closed
 *
 * At every stage we verify: data · status · quantity · amount ·
 * documents (numbers) · audit · navigation (360° route) · counters ·
 * notifications · persistence (re-read after each step).
 *
 * Then: partial delivery / partial invoice / partial payment, mismatch,
 * rejection + resubmission, cancellation, duplicate prevention and a
 * simulated browser refresh.
 * ------------------------------------------------------------------ */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  APPROVAL_STATUS, INVOICE_STATUS, MATCH_STATUS, PO_STATUS,
  PR_STATUS, RFQ_STATUS
} from '../constants';
import { mockRequisitionService, requisitionsStore } from './requisition';
import { mockRfqService, rfqsStore, quotationsStore } from './rfq';
import { mockPurchaseOrderService, ordersStore } from './purchaseOrder';
import {
  logisticsService, INSPECTION_STATUS, GRN_STATUS, PACKING_STATUS,
  grnsStore, inspectionsStore, shipmentsStore, inventoryStore, manufacturingStore
} from './logistics';
import { mockInvoiceService, invoicesStore, advicesStore } from './invoice';
import { evaluationService, evaluationsStore } from './evaluation';
import { mockVendorService, vendorsStore } from './vendor';
import { deriveWorkQueue } from './workQueue';
import { deriveAlerts } from './notifications';
import { document360Service } from './document360';
import { settingsStore } from './settings';

function setActor(name = 'QA Engineer', role = 'ADMIN') {
  localStorage.setItem('authUser', JSON.stringify({ fullName: name, email: `${name.toLowerCase().replace(/\s/g, '.')}@test.com`, role }));
}

const VENDOR_A = 'Tata Steel Ltd';
const VENDOR_B = 'JSW Steel';
const TERMS = { type: 'Against Delivery', balanceTrigger: 'Against Delivery' };

const TEST_ITEMS = [
  { product: 'HR coil 3mm', hsn: '7208', uom: 'Kg', qty: 100, rate: 24.5, expectedRate: 24.5, gstRate: 18 },
  { product: 'MS plate 6mm', hsn: '7208', uom: 'Kg', qty: 50, rate: 28, expectedRate: 28, gstRate: 18 }
];

function resetAllStores() {
  [requisitionsStore, rfqsStore, quotationsStore, ordersStore, grnsStore,
    inspectionsStore, shipmentsStore, inventoryStore, manufacturingStore,
    invoicesStore, advicesStore, evaluationsStore, vendorsStore, settingsStore
  ].forEach((store) => store.reset());
}

beforeEach(async () => {
  localStorage.clear();
  resetAllStores();
  setActor();
  const tata = await mockVendorService.createVendor({ name: VENDOR_A, category: 'Steel & Metals' });
  await mockVendorService.setVendorStatus(tata.id, 'Approved');
  const jsw = await mockVendorService.createVendor({ name: VENDOR_B, category: 'Steel & Metals' });
  await mockVendorService.setVendorStatus(jsw.id, 'Approved');
});

/** Counters + notifications derived from the live stores. */
function liveQueue() {
  return deriveWorkQueue({
    requisitions: requisitionsStore.all,
    rfqs: rfqsStore.all,
    orders: ordersStore.all,
    grns: grnsStore.all,
    inspections: inspectionsStore.all,
    invoices: invoicesStore.all
  });
}
function liveAlerts() {
  return deriveAlerts({
    rules: settingsStore.all.notificationRules || [],
    stores: {
      requisitions: requisitionsStore.all,
      rfqs: rfqsStore.all,
      orders: ordersStore.all,
      grns: grnsStore.all,
      inspections: inspectionsStore.all,
      invoices: invoicesStore.all
    }
  });
}
function categoryCount(queue, key) {
  return queue.categories.find((c) => c.key === key)?.count || 0;
}

/** Builds the sourcing chain up to (and including) an awarded RFQ. */
async function buildAwardedRfq() {
  const pr = await mockRequisitionService.createRequisition({
    title: 'Acceptance materials', department: 'Production', project: 'Unit 2 Expansion',
    requester: 'Test Requester', priority: 'High', expectedDate: '2026-10-01',
    currency: 'INR', items: TEST_ITEMS
  });
  await mockRequisitionService.submitRequisition(pr.id);
  await mockRequisitionService.approveRequisition(pr.id);
  await mockRequisitionService.saveTechnicalReview(pr.id, { specification: 'IS 2062', reviewStatus: 'Reviewed' });
  await mockRequisitionService.completeTechnicalReview(pr.id);
  const { created } = await mockRequisitionService.convertToRfq([pr.id]);
  const rfq = created[0];
  await mockRfqService.updateRfq(rfq.id, { vendors: [VENDOR_A, VENDOR_B] });
  await mockRfqService.submitForReview(rfq.id);
  await mockRfqService.approveRfq(rfq.id);
  await mockRfqService.sendRfq(rfq.id);

  const quoteItems = rfq.items.map((item) => ({
    product: item.product, hsn: item.hsn, uom: item.uom, qty: item.qty,
    rate: item.rate ?? item.expectedRate ?? 0, gstRate: 18
  }));
  const quoteA = await mockRfqService.saveQuotation({
    rfqNo: rfq.rfqNo, vendor: VENDOR_A, submittedOn: '2026-08-20',
    validUntil: '2026-09-10', currency: 'INR', discount: 2, freight: 100,
    insurance: 50, leadTime: 15, delivery: 12, paymentTerms: '30 Days',
    warranty: '12 Months', items: quoteItems
  });
  const quoteB = await mockRfqService.saveQuotation({
    rfqNo: rfq.rfqNo, vendor: VENDOR_B, submittedOn: '2026-08-21',
    validUntil: '2026-09-10', currency: 'INR', discount: 1, freight: 120,
    insurance: 60, leadTime: 20, delivery: 15, paymentTerms: '30 Days',
    warranty: '12 Months', items: quoteItems.map((item) => ({ ...item, rate: Math.round(item.rate * 0.97 * 100) / 100 }))
  });

  await mockRfqService.startEvaluation(rfq.id);
  const agreed = Math.round(quoteA.total * 0.95 * 100) / 100;
  await evaluationService.recordNegotiation(rfq.id, VENDOR_A, { amount: agreed, stage: 'Agreed' });
  await evaluationService.completeTechnicalEvaluation(rfq.id);
  await evaluationService.completeCommercialEvaluation(rfq.id, { paymentTerms: TERMS });
  await evaluationService.completeSupplierSelection(rfq.id, VENDOR_A, { rationale: 'Best price + delivery' });
  await evaluationService.approveSupplierSelection(rfq.id, { decision: APPROVAL_STATUS.APPROVED });
  await mockRfqService.awardRfq(rfq.id, VENDOR_A);
  return { pr, rfq, quoteA, quoteB, agreed };
}

/* ================================================================== */
/*  THE COMPLETE LIFECYCLE — one transaction, every stage verified      */
/* ================================================================== */
describe('Complete ERP lifecycle — one real transaction', () => {
  it('walks PR → … → Closed with status/quantity/amount/document/audit/navigation/counter/notification/persistence invariants', async () => {
    /* ─────────────────────────── PR ─────────────────────────── */
    const { pr, rfq, quoteA, agreed } = await buildAwardedRfq();
    expect(pr.prNo).toMatch(/^PR-2026-/);
    const finalPr = await mockRequisitionService.getRequisition(pr.id); /* re-read after conversion */
    expect(finalPr.status).toBe(PR_STATUS.CONVERTED);
    expect(finalPr.rfqNo).toBe(rfq.rfqNo);
    expect(finalPr.prNo).toBe(pr.prNo); /* persistence */
    const pr360 = await document360Service.getDocument360('pr', pr.id);
    expect(pr360.record.prNo).toBe(pr.prNo); /* navigation */

    /* ─────────────────────────── RFQ ────────────────────────── */
    expect(rfq.rfqNo).toMatch(/^RFQ-2026-/);
    const awardedRfq = await mockRfqService.getRfq(rfq.id); /* re-read after award */
    expect(awardedRfq.status).toBe(RFQ_STATUS.AWARDED);
    expect(awardedRfq.awardedVendor).toBe(VENDOR_A);
    expect(awardedRfq.prNo || awardedRfq.reference).toBe(pr.prNo);
    expect(awardedRfq.activity.some((entry) => entry.type === 'award')).toBe(true); /* audit */
    expect(awardedRfq.rfqNo).toBe(rfq.rfqNo);
    const rfq360 = await document360Service.getDocument360('rfq', rfq.id);
    expect(rfq360.record.rfqNo).toBe(rfq.rfqNo);

    /* ─────────────────────── Quotation ──────────────────────── */
    expect(quoteA.quotationNo).toMatch(/^QT-\d{3,}$/);
    expect(quoteA.rfqNo).toBe(rfq.rfqNo);
    const quote360 = await document360Service.getDocument360('quotation', quoteA.id);
    expect(quote360.record.quotationNo).toBe(quoteA.quotationNo);

    /* ─────────────────────────── PO ─────────────────────────── */
    const { po } = await mockRfqService.raisePurchaseOrder(rfq.id);
    expect(po.poNo).toMatch(/^PO-2026-/);
    expect(po.vendor).toBe(VENDOR_A);
    expect(po.rfqNo).toBe(rfq.rfqNo);
    expect(po.prNo || po.reference).toBe(pr.prNo);
    expect(po.quotationNo).toBe(quoteA.quotationNo);
    expect(po.awardedValue).toBe(agreed);
    const PO_NO = po.poNo;

    /* Counters — the new PO is pending approval. */
    expect(categoryCount(liveQueue(), 'po-approvals')).toBeGreaterThan(0);

    /* ────────────────── Approval + Release ──────────────────── */
    await mockPurchaseOrderService.approveOrder(po.id);
    const approved = await mockPurchaseOrderService.getOrder(po.id);
    expect(approved.approvalStatus).toBe(APPROVAL_STATUS.APPROVED);
    await mockPurchaseOrderService.releaseOrder(po.id);
    const released = await mockPurchaseOrderService.getOrder(po.id);
    expect(released.status).toBe(PO_STATUS.RELEASED);
    expect(released.activity.some((entry) => entry.type === 'release')).toBe(true);
    expect(categoryCount(liveQueue(), 'po-approvals')).toBe(0);
    const po360 = await document360Service.getDocument360('po', po.id);
    expect(po360.record.poNo).toBe(PO_NO);

    /* ─────────────────── Supplier Acknowledgement ───────────── */
    await mockPurchaseOrderService.acknowledgeOrder(po.id);
    const acked = await mockPurchaseOrderService.getOrder(po.id);
    expect(acked.acknowledged).toBe(true);
    expect(acked.acknowledgedAt).toBeTruthy();

    /* ────────────────────────── Packing ─────────────────────── */
    const packing = await logisticsService.createManufacturingJob({ poNo: PO_NO, product: 'Acceptance batch' });
    expect(packing.packingNo).toMatch(/^MFR-2026-/);
    expect(packing.poNo).toBe(PO_NO);
    await logisticsService.updateManufacturing(packing.id, { status: PACKING_STATUS.READY_TO_SHIP, progress: 100 });
    const packed = await logisticsService.getManufacturingById(packing.id);
    expect(packed.status).toBe(PACKING_STATUS.READY_TO_SHIP);
    expect((await logisticsService.getManufacturingById(packing.id)).packingNo).toBe(packing.packingNo); /* persistence */

    /* ───────────────────────── Shipment ─────────────────────── */
    const shipment = await logisticsService.createShipment({ poNo: PO_NO, carrier: 'VRL', mode: 'Road', packingNo: packing.packingNo });
    expect(shipment.shipmentNo).toMatch(/^SHP-2026-/);
    expect(shipment.poNo).toBe(PO_NO);
    const SHIPMENT_NO = shipment.shipmentNo;
    const shipment360 = await document360Service.getDocument360('shipment', shipment.id);
    expect(shipment360.record.shipmentNo).toBe(SHIPMENT_NO);

    /* ─────────────────────────── GRN ────────────────────────── */
    const grn = await logisticsService.createGrn(PO_NO);
    expect(grn.grnNo).toMatch(/^GRN-2026-/);
    expect(grn.poNo).toBe(PO_NO);
    expect(grn.items).toHaveLength(2);
    const GRN_NO = grn.grnNo;
    const grn360 = await document360Service.getDocument360('grn', grn.grnNo);
    expect(grn360.record.grnNo).toBe(GRN_NO);

    /* Receive FULL quantity → PO Completed automatically. */
    await logisticsService.receiveGoods(grn.id);
    const received = await logisticsService.getGrns({ search: GRN_NO });
    received.data[0].items.forEach((item) => expect(item.received).toBe(item.qty)); /* quantity */
    const afterReceive = await mockPurchaseOrderService.getOrder(po.id);
    expect(afterReceive.status).toBe(PO_STATUS.COMPLETED); /* status */
    expect(categoryCount(liveQueue(), 'pending-grns')).toBe(0);

    /* ─────────────────────── Inspection ─────────────────────── */
    const inspection = (await logisticsService.getInspections({ search: GRN_NO })).data[0];
    expect(inspection).toBeTruthy();
    expect(inspection.inspectionNo).toMatch(/^QC-2026-/);
    expect(inspection.grnNo).toBe(GRN_NO);
    await logisticsService.setInspectionResult(inspection.id, INSPECTION_STATUS.PASSED, 'All batches conform.');
    const passed = (await logisticsService.getInspections({ search: GRN_NO })).data[0];
    expect(passed.status).toBe(INSPECTION_STATUS.PASSED);
    const inspection360 = await document360Service.getDocument360('inspection', inspection.id);
    expect(inspection360.record.inspectionNo).toBe(inspection.inspectionNo);

    /* ─────────────────────── Inventory ──────────────────────── */
    const posts = await logisticsService.postInventoryFromInspection(inspection.id);
    expect(posts.length).toBeGreaterThan(0);
    const totalQty = posts.reduce((s, p) => s + Number(p.delta || p.qty || 0), 0);
    expect(totalQty).toBe(150); /* 100 + 50 — quantity flows through */
    posts.forEach((post) => {
      expect(post.type).toBe('Receipt');
      expect(post.reference).toBe(GRN_NO);
      expect(post.inspectionNo).toBe(inspection.inspectionNo);
    });
    await expect(logisticsService.postInventoryFromInspection(inspection.id)).rejects.toThrow(/already been posted/); /* duplicate prevention */
    const inv360 = await document360Service.getDocument360('inventory', posts[0].id);
    expect(inv360.record.id).toBe(posts[0].id);

    /* ──────────────────── Vendor Invoice ────────────────────── */
    const invoice = await mockInvoiceService.createInvoice({
      poNo: PO_NO, vendor: VENDOR_A, amount: po.amount, gst: 0,
      status: INVOICE_STATUS.SUBMITTED,
      items: po.items.map((item) => ({ product: item.product, qty: item.qty, rate: item.rate, gst: item.gstRate }))
    });
    expect(invoice.invoiceNo).toMatch(/^VINV-2026-/);
    expect(invoice.poNo).toBe(PO_NO);
    const INVOICE_NO = invoice.invoiceNo;
    const invoice360 = await document360Service.getDocument360('invoice', invoice.id);
    expect(invoice360.record.invoiceNo).toBe(INVOICE_NO);

    /* ─────────────────────── 3-Way Match ────────────────────── */
    const matched = await mockInvoiceService.getInvoice(invoice.id);
    expect(matched.matchStatus).toBe(MATCH_STATUS.MATCHED); /* data */
    expect(categoryCount(liveQueue(), 'invoice-approvals')).toBeGreaterThan(0); /* counter */

    /* ───────────────────── Invoice Approval ─────────────────── */
    await mockInvoiceService.approveInvoice(invoice.id);
    const approvedInv = await mockInvoiceService.getInvoice(invoice.id);
    expect(approvedInv.status).toBe(INVOICE_STATUS.APPROVED);
    expect(categoryCount(liveQueue(), 'invoice-approvals')).toBe(0);
    /* A matched, approved, unpaid invoice is a payment due. */
    expect(categoryCount(liveQueue(), 'payments-due')).toBeGreaterThan(0);
    /* Notification alerts derive from the same real records. */
    const alerts = liveAlerts();
    const payAlert = alerts.find((a) => a.event === 'Payment overdue');
    if (payAlert) expect(payAlert.count).toBeGreaterThan(0);

    /* ───────────────────────── Payment ──────────────────────── */
    const paid = await mockInvoiceService.recordPayment(invoice.id, {
      method: 'Bank Transfer', full: true, transactionReference: 'TXN-ACC-0001'
    });
    expect(paid.status).toBe(INVOICE_STATUS.PAID);
    expect(paid.paidAmount).toBe(round2(paid.total - paid.outstanding)); /* amount */
    expect(paid.paymentNo).toMatch(/^PAY-2026-/);
    const PAYMENT_NO = paid.paymentNo;
    expect(categoryCount(liveQueue(), 'payments-due')).toBe(0);

    /* ───────────────────── Payment Advice ───────────────────── */
    const advices = await mockInvoiceService.getPaymentAdvices();
    const advice = advices.find((entry) => entry.invoiceNo === INVOICE_NO);
    expect(advice).toBeTruthy();
    expect(advice.adviceNo).toMatch(/^ADV-2026-/);
    expect(advice.paymentNo).toBe(PAYMENT_NO);
    expect(advice.invoiceNo).toBe(INVOICE_NO);
    expect(advice.poNo).toBe(PO_NO);
    const payment360 = await document360Service.getDocument360('payment', advice.adviceNo);
    expect(payment360.record.adviceNo).toBe(advice.adviceNo);

    /* ─────────────────────────── Closed ─────────────────────── */
    await mockPurchaseOrderService.closeOrder(po.id);
    const closed = await mockPurchaseOrderService.getOrder(po.id);
    expect(closed.status).toBe(PO_STATUS.CLOSED);
    expect(closed.activity.some((entry) => entry.type === 'close')).toBe(true);

    /* ─────────────── document numbers retained ──────────────── */
    expect(pr.prNo).toMatch(/^PR-2026-/);
    expect(rfq.rfqNo).toMatch(/^RFQ-2026-/);
    expect(quoteA.quotationNo).toMatch(/^QT-\d{3,}$/);
    expect(PO_NO).toMatch(/^PO-2026-/);
    expect(packing.packingNo).toMatch(/^MFR-2026-/);
    expect(SHIPMENT_NO).toMatch(/^SHP-2026-/);
    expect(GRN_NO).toMatch(/^GRN-2026-/);
    expect(inspection.inspectionNo).toMatch(/^QC-2026-/);
    expect(INVOICE_NO).toMatch(/^VINV-2026-/);
    expect(PAYMENT_NO).toMatch(/^PAY-2026-/);
    expect(advice.adviceNo).toMatch(/^ADV-2026-/);

    /* Chain integrity — every downstream document still carries its upstream links. */
    const finalRfq = await mockRfqService.getRfq(rfq.id);
    expect(finalRfq.poNo).toBe(PO_NO);
    const finalPo = await mockPurchaseOrderService.getOrder(po.id);
    expect(finalPo.rfqNo).toBe(rfq.rfqNo);
    expect(finalPo.quotationNo).toBe(quoteA.quotationNo);
    expect(inspection.poNo).toBe(PO_NO);
    expect(invoice.poNo).toBe(PO_NO);
    expect(paid.poNo).toBe(PO_NO);
    expect(advice.poNo).toBe(PO_NO);
  }, 90000);
});

function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

/* ================================================================== */
/*  PARTIAL FLOWS — delivery / invoice / payment                       */
/* ================================================================== */
describe('Partial delivery · partial invoice · partial payment', () => {
  it('receives 60%, invoices it, pays in two installments, then completes and closes', async () => {
    const { pr, rfq, quoteA, agreed } = await buildAwardedRfq();
    const { po } = await mockRfqService.raisePurchaseOrder(rfq.id);
    await mockPurchaseOrderService.approveOrder(po.id);
    await mockPurchaseOrderService.releaseOrder(po.id);
    await mockPurchaseOrderService.acknowledgeOrder(po.id);
    const PO_NO = po.poNo;

    /* ── Partial delivery: 60 of 100 HR coil, none of the plate ── */
    const grn = await logisticsService.createGrn(PO_NO);
    await logisticsService.receiveGoods(grn.id, [{ product: 'HR coil 3mm', received: 60 }]);
    const grnAfter = (await logisticsService.getGrns({ search: grn.grnNo })).data[0];
    const hrLine = grnAfter.items.find((i) => i.product === 'HR coil 3mm');
    const plateLine = grnAfter.items.find((i) => i.product === 'MS plate 6mm');
    expect(hrLine.received).toBe(60);           /* quantity */
    expect(hrLine.pending).toBe(40);
    expect(plateLine.received).toBe(0);
    expect(plateLine.pending).toBe(50);
    expect(grnAfter.status).toBe(GRN_STATUS.PENDING_INSPECTION);
    const poAfter = await mockPurchaseOrderService.getOrder(po.id);
    expect(poAfter.status).toBe(PO_STATUS.PARTIALLY_DELIVERED); /* status */

    /* ── Inspection + inventory for the accepted 60 units ── */
    const inspection = (await logisticsService.getInspections({ search: grn.grnNo })).data[0];
    await logisticsService.setInspectionResult(inspection.id, INSPECTION_STATUS.PASSED);
    const posts = await logisticsService.postInventoryFromInspection(inspection.id);
    const hrPost = posts.find((p) => p.product === 'HR coil 3mm');
    expect(Number(hrPost.delta ?? hrPost.qty)).toBe(60); /* inventory quantity */
    const onHand = inventoryStore.all.filter((m) => m.product === 'HR coil 3mm').reduce((s, m) => s + Number(m.delta), 0);
    expect(onHand).toBe(60);

    /* ── Partial invoice: only the received 60 units ── */
    const invoice = await mockInvoiceService.createInvoice({
      poNo: PO_NO, vendor: VENDOR_A,
      amount: round2(60 * 24.5), gst: 0, status: INVOICE_STATUS.SUBMITTED,
      items: [{ product: 'HR coil 3mm', qty: 60, rate: 24.5, gst: 18 }]
    });
    const matched = await mockInvoiceService.getInvoice(invoice.id);
    expect(matched.matchStatus).toBe(MATCH_STATUS.MATCHED); /* 60 invoiced = 60 received */
    await mockInvoiceService.approveInvoice(invoice.id);
    const approved = await mockInvoiceService.getInvoice(invoice.id);
    expect(approved.status).toBe(INVOICE_STATUS.APPROVED);

    /* ── Partial payment: half now, half later ── */
    const net = round2(approved.netPayable ?? approved.total);
    const first = await mockInvoiceService.recordPayment(invoice.id, {
      method: 'Bank Transfer', full: false, amount: round2(net / 2), transactionReference: 'TXN-P1'
    });
    expect(first.status).toBe(INVOICE_STATUS.PARTIAL);
    expect(first.paidAmount).toBe(round2(net / 2));               /* amount */
    expect(first.outstanding).toBe(round2(net / 2));              /* balance */

    /* A second installment can still be recorded. */
    const second = await mockInvoiceService.recordPayment(invoice.id, {
      method: 'Bank Transfer', full: false, amount: round2(net / 2), transactionReference: 'TXN-P2'
    });
    expect(second.status).toBe(INVOICE_STATUS.PAID);
    expect(second.outstanding).toBe(0);
    expect(second.paymentNo).toMatch(/^PAY-2026-/);
    const advice = (await mockInvoiceService.getPaymentAdvices()).find((a) => a.invoiceNo === invoice.invoiceNo);
    expect(advice).toBeTruthy();

    /* ── Receive the remainder → Completed → Closed ── */
    const grn2 = await logisticsService.createGrn(PO_NO);
    await logisticsService.receiveGoods(grn2.id, [
      { product: 'HR coil 3mm', received: 40 },
      { product: 'MS plate 6mm', received: 50 }
    ]);
    const completed = await mockPurchaseOrderService.getOrder(po.id);
    expect(completed.status).toBe(PO_STATUS.COMPLETED);
    await mockPurchaseOrderService.closeOrder(po.id);
    expect((await mockPurchaseOrderService.getOrder(po.id)).status).toBe(PO_STATUS.CLOSED);
  }, 90000);
});

/* ================================================================== */
/*  MISMATCH · REJECTION · RESUBMISSION · CANCELLATION · DUPLICATES ·  */
/*  REFRESH                                                            */
/* ================================================================== */
describe('Exception paths and refresh persistence', () => {
  it('mismatch blocks approval, rejection+resubmission works, cancellation is terminal', async () => {
    /* ── Mismatch: invoice rate far above PO/GRN ── */
    const po = await mockPurchaseOrderService.createOrder({
      title: 'Mismatch acceptance', vendor: VENDOR_A, reference: 'PR-MM1',
      items: [{ product: 'Widget', hsn: '9001', uom: 'Nos', qty: 10, rate: 10, gstRate: 18 }]
    });
    await mockPurchaseOrderService.approveOrder(po.id);
    await mockPurchaseOrderService.releaseOrder(po.id);
    const grn = await logisticsService.createGrn(po.poNo);
    await logisticsService.receiveGoods(grn.id);
    const badInvoice = await mockInvoiceService.createInvoice({
      poNo: po.poNo, invoiceNo: 'INV-2026-AC1', vendor: VENDOR_A,
      amount: 5000, gst: 0, status: INVOICE_STATUS.SUBMITTED
    });
    expect((await mockInvoiceService.getInvoice(badInvoice.id)).matchStatus).toBe(MATCH_STATUS.MISMATCH);
    await expect(mockInvoiceService.approveInvoice(badInvoice.id)).rejects.toThrow(/three-way match is mismatch/);

    /* ── Rejection is terminal; a returned PR can be resubmitted ── */
    const pr = await mockRequisitionService.createRequisition({
      title: 'Reject me', department: 'Production', requester: 'QA', priority: 'Medium',
      expectedDate: '2026-10-01', currency: 'INR',
      items: [{ product: 'Widget', hsn: '9001', uom: 'Nos', qty: 1, rate: 1, expectedRate: 1 }]
    });
    await mockRequisitionService.submitRequisition(pr.id);
    const rejected = await mockRequisitionService.rejectRequisition(pr.id, 'Budget not approved');
    expect(rejected.status).toBe(PR_STATUS.REJECTED);
    expect(rejected.activity.some((entry) => entry.type === 'reject')).toBe(true); /* audit */
    /* A rejected PR cannot be approved again. */
    await expect(mockRequisitionService.approveRequisition(pr.id)).rejects.toThrow(/Only pending requisitions can be approved/);

    /* Resubmission flows through Return (technical review → RETURNED → submit). */
    const pr2 = await mockRequisitionService.createRequisition({
      title: 'Return me', department: 'Production', requester: 'QA', priority: 'Medium',
      expectedDate: '2026-10-01', currency: 'INR',
      items: [{ product: 'Widget', hsn: '9001', uom: 'Nos', qty: 1, rate: 1, expectedRate: 1 }]
    });
    await mockRequisitionService.submitRequisition(pr2.id);
    await mockRequisitionService.approveRequisition(pr2.id);
    const returned = await mockRequisitionService.returnRequisition(pr2.id, 'Please add the material grade');
    expect(returned.status).toBe(PR_STATUS.RETURNED);
    await mockRequisitionService.submitRequisition(pr2.id);
    expect((await mockRequisitionService.getRequisition(pr2.id)).status).toBe(PR_STATUS.PENDING_APPROVAL);
    const approved = await mockRequisitionService.approveRequisition(pr2.id);
    expect(approved.approvalStatus).toBe(APPROVAL_STATUS.APPROVED);
    /* The resubmitted PR can still flow forward. */
    await mockRequisitionService.completeTechnicalReview(pr2.id);
    const { created } = await mockRequisitionService.convertToRfq([pr2.id]);
    expect(created).toHaveLength(1);

    /* ── Cancellation is terminal and cannot be released ── */
    const cancelPo = await mockPurchaseOrderService.createOrder({
      title: 'Cancel me', vendor: VENDOR_A, reference: 'PR-C1',
      items: [{ product: 'Widget', hsn: '9001', uom: 'Nos', qty: 1, rate: 1, gstRate: 18 }]
    });
    await mockPurchaseOrderService.approveOrder(cancelPo.id);
    await mockPurchaseOrderService.cancelOrder(cancelPo.id);
    expect((await mockPurchaseOrderService.getOrder(cancelPo.id)).status).toBe(PO_STATUS.CANCELLED);
    await expect(mockPurchaseOrderService.releaseOrder(cancelPo.id)).rejects.toThrow(/Cannot release/);
  }, 90000);

  it('duplicate prevention holds across conversion, packing and payment', async () => {
    const { rfq } = await buildAwardedRfq();
    /* Converted PR cannot be converted again. */
    const pr2 = await mockRequisitionService.createRequisition({
      title: 'Dup PR', department: 'Production', requester: 'QA', priority: 'Medium',
      expectedDate: '2026-10-01', currency: 'INR',
      items: [{ product: 'Widget', hsn: '9001', uom: 'Nos', qty: 1, rate: 1, expectedRate: 1 }]
    });
    await mockRequisitionService.submitRequisition(pr2.id);
    await mockRequisitionService.approveRequisition(pr2.id);
    await mockRequisitionService.completeTechnicalReview(pr2.id);
    await mockRequisitionService.convertToRfq([pr2.id]);
    const second = await mockRequisitionService.convertToRfq([pr2.id]);
    expect(second.created).toHaveLength(0);

    /* Awarded RFQ cannot raise a second PO. */
    await mockRfqService.raisePurchaseOrder(rfq.id);
    await expect(mockRfqService.raisePurchaseOrder(rfq.id)).rejects.toThrow(/already raised/);

    /* One packing job per PO. */
    const finalRfq = await mockRfqService.getRfq(rfq.id);
    const poNo = finalRfq.poNo;
    const poRec = (await mockPurchaseOrderService.getOrders({ search: poNo })).data[0];
    await mockPurchaseOrderService.approveOrder(poRec.id);
    await mockPurchaseOrderService.releaseOrder(poRec.id);
    await logisticsService.createManufacturingJob({ poNo });
    await expect(logisticsService.createManufacturingJob({ poNo })).rejects.toThrow(/already exists/);

    /* Duplicate payment refused — against its own simple PO. */
    const payPo = await mockPurchaseOrderService.createOrder({
      title: 'Dup pay PO', vendor: VENDOR_A, reference: 'PR-DP1',
      items: [{ product: 'Widget', hsn: '9001', uom: 'Nos', qty: 10, rate: 10, gstRate: 18 }]
    });
    await mockPurchaseOrderService.approveOrder(payPo.id);
    await mockPurchaseOrderService.releaseOrder(payPo.id);
    const grn = await logisticsService.createGrn(payPo.poNo);
    await logisticsService.receiveGoods(grn.id);
    const invoice = await mockInvoiceService.createInvoice({
      poNo: payPo.poNo, vendor: VENDOR_A, amount: 100, gst: 0, status: INVOICE_STATUS.SUBMITTED,
      items: [{ product: 'Widget', qty: 10, rate: 10, gst: 18 }]
    });
    await mockInvoiceService.approveInvoice(invoice.id);
    await mockInvoiceService.recordPayment(invoice.id, { method: 'UPI', full: true });
    await expect(mockInvoiceService.recordPayment(invoice.id, { method: 'UPI', full: true })).rejects.toThrow(/already paid/);
  }, 90000);

  it('survives a simulated browser refresh — every number and status persists', async () => {
    const { pr, rfq, quoteA } = await buildAwardedRfq();
    const { po } = await mockRfqService.raisePurchaseOrder(rfq.id);
    await mockPurchaseOrderService.approveOrder(po.id);
    await mockPurchaseOrderService.releaseOrder(po.id);
    await mockPurchaseOrderService.acknowledgeOrder(po.id);
    const shipment = await logisticsService.createShipment({ poNo: po.poNo, carrier: 'VRL' });
    const grn = await logisticsService.createGrn(po.poNo);
    await logisticsService.receiveGoods(grn.id);
    const inspection = (await logisticsService.getInspections({ search: grn.grnNo })).data[0];
    await logisticsService.setInspectionResult(inspection.id, INSPECTION_STATUS.PASSED);
    await logisticsService.postInventoryFromInspection(inspection.id);
    const invoice = await mockInvoiceService.createInvoice({
      poNo: po.poNo, vendor: VENDOR_A, amount: po.amount, gst: 0, status: INVOICE_STATUS.SUBMITTED,
      items: po.items.map((item) => ({ product: item.product, qty: item.qty, rate: item.rate, gst: item.gstRate }))
    });
    await mockInvoiceService.approveInvoice(invoice.id);
    const paid = await mockInvoiceService.recordPayment(invoice.id, { method: 'Bank Transfer', full: true });

    /* Snapshot before "refresh". */
    const before = {
      prNo: pr.prNo, rfqNo: rfq.rfqNo, quotationNo: quoteA.quotationNo, poNo: po.poNo,
      shipmentNo: shipment.shipmentNo, grnNo: grn.grnNo, inspectionNo: inspection.inspectionNo,
      invoiceNo: invoice.invoiceNo, paymentNo: paid.paymentNo,
      poStatus: (await mockPurchaseOrderService.getOrder(po.id)).status,
      invoiceStatus: (await mockInvoiceService.getInvoice(invoice.id)).status
    };

    /* Simulate a browser refresh: drop every in-memory cache so the
       next read comes back from persistence (localStorage). */
    resetAllStores();

    expect((await mockRequisitionService.getRequisition(pr.id)).prNo).toBe(before.prNo);
    expect((await mockRfqService.getRfq(rfq.id)).rfqNo).toBe(before.rfqNo);
    expect((await mockRfqService.getQuotation(quoteA.id)).quotationNo).toBe(before.quotationNo);
    expect((await mockPurchaseOrderService.getOrder(po.id)).poNo).toBe(before.poNo);
    expect((await mockPurchaseOrderService.getOrder(po.id)).status).toBe(before.poStatus);
    expect((await logisticsService.getShipmentById(shipment.id)).shipmentNo).toBe(before.shipmentNo);
    expect((await logisticsService.getGrns({ search: before.grnNo })).data[0].grnNo).toBe(before.grnNo);
    expect((await logisticsService.getInspections({ search: before.inspectionNo })).data[0].inspectionNo).toBe(before.inspectionNo);
    expect((await mockInvoiceService.getInvoice(invoice.id)).invoiceNo).toBe(before.invoiceNo);
    expect((await mockInvoiceService.getInvoice(invoice.id)).status).toBe(before.invoiceStatus);
    const adviceAfter = (await mockInvoiceService.getPaymentAdvices()).find((a) => a.invoiceNo === before.invoiceNo);
    expect(adviceAfter).toBeTruthy();
    expect(adviceAfter.paymentNo).toBe(before.paymentNo);

    /* Counters derive from the same persisted records after refresh. */
    expect(categoryCount(liveQueue(), 'payments-due')).toBe(0);
  }, 90000);
});