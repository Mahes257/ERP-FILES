/**
 * purchase/services/paymentAdviceWorkflow.test.js
 * ------------------------------------------------------------------
 * Unit tests for the Payment → Payment Advice workflow:
 *
 *   Matched Invoice → Payment Approval → Vendor Payment → Payment Advice
 *
 * Covers the Phase 7 rules:
 *   RULE 1  Only a matched invoice can be approved for payment
 *   RULE 2  Only an approved invoice / payment request can be paid
 *   RULE 3  A payment stores the full record: payment number, invoice,
 *           PO, vendor, amount, payment date, method, transaction
 *           reference and paid-by
 *   RULE 4  Duplicate payment is refused
 *   RULE 5  Overpayment is refused
 *   RULE 6  Payment without approval is refused
 *   RULE 7  A successful payment generates exactly one payment advice
 *           referencing the payment, invoice, PO and vendor
 *   RULE 8  Duplicate payment advice is prevented
 *   RULE 9  Complete chain PR → RFQ → Quotation → PO → GRN → Invoice
 *           → Payment → Payment Advice
 *
 * The tests exercise the MOCK services directly against fresh in-memory
 * stores per test. `delay` is stubbed so the suite stays fast.
 * ------------------------------------------------------------------
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APPROVAL_STATUS, INVOICE_STATUS, MATCH_STATUS } from '../constants';
import { mockPurchaseOrderService, ordersStore } from './purchaseOrder';
import {
  logisticsService,
  grnsStore, inspectionsStore, shipmentsStore
} from './logistics';
import { mockInvoiceService, invoicesStore, advicesStore } from './invoice';
import { mockRfqService, rfqsStore, quotationsStore } from './rfq';
import { requisitionsStore } from './requisition';
import { vendorsStore } from './vendor';

/* Stub the simulated latency so every service call resolves instantly. */
vi.mock('./base', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, delay: () => Promise.resolve() };
});

/* Deterministic signed-in user for payment / activity actor names. */
function setActor() {
  localStorage.setItem('authUser', JSON.stringify({ fullName: 'Test Buyer', email: 'buyer@test.com' }));
}

beforeEach(async () => {
  localStorage.clear();
  ordersStore.reset();
  grnsStore.reset();
  inspectionsStore.reset();
  shipmentsStore.reset();
  invoicesStore.reset();
  advicesStore.reset();
  requisitionsStore.reset();
  rfqsStore.reset();
  quotationsStore.reset();
  vendorsStore.reset();
  setActor();
  const { mockVendorService } = await import('./vendor');
  for (const name of ['Tata Steel Ltd', 'JSW Steel', 'Bharat Forge', 'Havells India', 'Dell Technologies', 'Bosch India']) {
    const v = await mockVendorService.createVendor({ name });
    await mockVendorService.setVendorStatus(v.id, 'Approved');
  }
});

/** Fresh released PO, fully received, matched invoice → Submitted. */
async function createMatchedSubmittedInvoice({ invoiceNo } = {}) {
  const po = await mockPurchaseOrderService.createOrder({
    title: 'Payment test PO',
    vendor: 'Tata Steel Ltd',
    reference: 'PR-TEST-PAY',
    items: [
      { product: 'Widget A', hsn: '1111', uom: 'Nos', qty: 10, rate: 100, gstRate: 18 },
      { product: 'Widget B', hsn: '1112', uom: 'Nos', qty: 5, rate: 50, gstRate: 12 }
    ]
  });
  await mockPurchaseOrderService.approveOrder(po.id);
  const released = await mockPurchaseOrderService.releaseOrder(po.id);
  const grn = await logisticsService.createGrn(po.poNo);
  await logisticsService.receiveGoods(grn.id);

  const invoice = await mockInvoiceService.createInvoice({
    poNo: po.poNo,
    invoiceNo,
    vendor: 'Tata Steel Ltd',
    amount: released.amount,
    gst: 0,
    status: INVOICE_STATUS.SUBMITTED
  });
  return { po: released, grn, invoice };
}

/** Fully approved (matched + approveInvoice) → ready to pay. */
async function createApprovedForPayment(invoiceNo) {
  const ctx = await createMatchedSubmittedInvoice({ invoiceNo });
  const approved = await mockInvoiceService.approveInvoice(ctx.invoice.id);
  return { ...ctx, invoice: approved };
}

describe('Payment approval gating', () => {
  it('RULE 1 — only a matched invoice can be approved for payment', async () => {
    /* A matched invoice is approvable... */
    const matched = await createMatchedSubmittedInvoice({ invoiceNo: 'INV-2026-7101' });
    const re = await mockInvoiceService.getInvoice(matched.invoice.id);
    expect(re.matchStatus).toBe(MATCH_STATUS.MATCHED);
    await mockInvoiceService.approveInvoice(matched.invoice.id);

    /* ...but a mismatched invoice cannot be approved. */
    const po2 = await mockPurchaseOrderService.createOrder({
      title: 'Second PO',
      vendor: 'Tata Steel Ltd',
      reference: 'PR-TEST-2',
      items: [{ product: 'Widget A', hsn: '1111', uom: 'Nos', qty: 10, rate: 100, gstRate: 18 }]
    });
    await mockPurchaseOrderService.approveOrder(po2.id);
    await mockPurchaseOrderService.releaseOrder(po2.id);
    const grn2 = await logisticsService.createGrn(po2.poNo);
    await logisticsService.receiveGoods(grn2.id);
    const bad = await mockInvoiceService.createInvoice({
      poNo: po2.poNo,
      invoiceNo: 'INV-2026-7102',
      vendor: 'Tata Steel Ltd',
      amount: 5000,
      gst: 0,
      status: INVOICE_STATUS.SUBMITTED
    });
    const fetched = await mockInvoiceService.getInvoice(bad.id);
    expect(fetched.matchStatus).toBe(MATCH_STATUS.MISMATCH);
    await expect(mockInvoiceService.approveInvoice(bad.id)).rejects.toThrow(/three-way match is mismatch/);
  });

  it('RULE 2/6 — payment without approval is refused', async () => {
    const { invoice } = await createMatchedSubmittedInvoice({ invoiceNo: 'INV-2026-7103' });
    await expect(
      mockInvoiceService.recordPayment(invoice.id, { method: 'Bank Transfer', full: true })
    ).rejects.toThrow(/Only approved invoices can be paid/);
  });
});

describe('Payment record', () => {
  it('RULE 3 — a payment stores the full record with transaction reference', async () => {
    const { invoice } = await createApprovedForPayment('INV-2026-7104');
    const paid = await mockInvoiceService.recordPayment(invoice.id, {
      method: 'Bank Transfer',
      full: true,
      transactionReference: 'TXN-2026-88001'
    });

    expect(paid.status).toBe(INVOICE_STATUS.PAID);
    expect(paid.paymentNo).toMatch(/^PAY-2026-/);
    expect(paid.invoiceNo).toBe('INV-2026-7104');
    expect(paid.poNo).toBe(invoice.poNo);
    expect(paid.vendor).toBe('Tata Steel Ltd');
    expect(paid.paidAmount).toBe(paid.total);
    expect(paid.paymentDate).toBeTruthy();
    expect(paid.paymentMethod).toBe('Bank Transfer');
    expect(paid.transactionReference).toBe('TXN-2026-88001');
    expect(paid.paidBy).toBe('Test Buyer');
  });

  it('RULE 4 — a second full payment is refused (duplicate payment)', async () => {
    const { invoice } = await createApprovedForPayment('INV-2026-7105');
    await mockInvoiceService.recordPayment(invoice.id, { method: 'UPI', full: true });
    await expect(
      mockInvoiceService.recordPayment(invoice.id, { method: 'UPI', full: true })
    ).rejects.toThrow(/already paid/);
  });

  it('RULE 5 — a partial payment cannot exceed the outstanding balance', async () => {
    const { invoice } = await createApprovedForPayment('INV-2026-7106');
    await expect(
      mockInvoiceService.recordPayment(invoice.id, {
        method: 'Cheque',
        full: false,
        amount: invoice.total + 1
      })
    ).rejects.toThrow(/exceeds the outstanding balance/);
  });
});

describe('Payment advice generation', () => {
  it('RULE 7 — a successful payment generates exactly one advice referencing the chain', async () => {
    const { invoice } = await createApprovedForPayment('INV-2026-7107');
    await mockInvoiceService.recordPayment(invoice.id, {
      method: 'Bank Transfer',
      full: true,
      transactionReference: 'TXN-2026-99002'
    });

    const advices = await mockInvoiceService.getPaymentAdvices();
    const advice = advices.find((entry) => entry.invoiceNo === 'INV-2026-7107');
    expect(advice).toBeTruthy();
    expect(advice.adviceNo).toMatch(/^ADV-2026-/);
    expect(advice.paymentNo).toMatch(/^PAY-2026-/);
    expect(advice.invoiceNo).toBe('INV-2026-7107');
    expect(advice.poNo).toBe(invoice.poNo);
    expect(advice.vendor).toBe('Tata Steel Ltd');
    expect(advice.transactionReference).toBe('TXN-2026-99002');
    expect(advice.paidBy).toBe('Test Buyer');
    expect(advice.amount).toBe(invoice.total);

    /* Exactly one advice for this payment — RULE 8. */
    expect(advices.filter((entry) => entry.invoiceNo === 'INV-2026-7107')).toHaveLength(1);
  });

  it('RULE 8 — a repeated advice request for the same payment is not duplicated', async () => {
    const { invoice } = await createApprovedForPayment('INV-2026-7108');
    await mockInvoiceService.recordPayment(invoice.id, { method: 'UPI', full: true });
    const before = (await mockInvoiceService.getPaymentAdvices()).filter(
      (entry) => entry.invoiceNo === 'INV-2026-7108'
    );
    expect(before).toHaveLength(1);
    /* Calling getPaymentAdvices again does not regenerate or duplicate. */
    const after = (await mockInvoiceService.getPaymentAdvices()).filter(
      (entry) => entry.invoiceNo === 'INV-2026-7108'
    );
    expect(after).toHaveLength(1);
  });

  it('RULE 7 — a partial payment produces a Partial invoice and its own advice', async () => {
    const { invoice } = await createApprovedForPayment('INV-2026-7109');
    const first = await mockInvoiceService.recordPayment(invoice.id, {
      method: 'Cheque',
      full: false,
      amount: 500
    });
    expect(first.status).toBe(INVOICE_STATUS.PARTIAL);
    const advices = await mockInvoiceService.getPaymentAdvices();
    expect(advices.filter((entry) => entry.invoiceNo === 'INV-2026-7109')).toHaveLength(1);

    /* A second partial settles the balance → PAID, second advice. */
    await mockInvoiceService.recordPayment(invoice.id, { method: 'UPI', full: true });
    const after = await mockInvoiceService.getPaymentAdvices();
    expect(after.filter((entry) => entry.invoiceNo === 'INV-2026-7109')).toHaveLength(2);
  });
});

describe('Complete document chain', () => {
  it('RULE 9 — PR → RFQ → Quotation → PO → GRN → Invoice → Payment → Advice stays linked', async () => {
    /* Walk the whole sourcing pipeline (Phases 3-6). */
    const draft = await mockRfqService.createRfq({
      title: 'Chain materials',
      reference: 'PR-2026-0070',
      department: 'Production',
      project: 'Unit 2 Expansion',
      requester: 'Rahul Sharma',
      buyer: 'Kavita Rao',
      priority: 'High',
      dueDate: '2026-09-10',
      currency: 'INR',
      vendorNames: ['Tata Steel Ltd'],
      items: [
        { product: 'Widget A', hsn: '1111', uom: 'Nos', qty: 10, rate: 100, expectedRate: 100, gstRate: 18 },
        { product: 'Widget B', hsn: '1112', uom: 'Nos', qty: 5, rate: 50, expectedRate: 50, gstRate: 12 }
      ]
    });
    await mockRfqService.submitForReview(draft.id);
    await mockRfqService.approveRfq(draft.id);
    await mockRfqService.sendRfq(draft.id);
    const quote = await mockRfqService.saveQuotation({
      rfqNo: draft.rfqNo,
      vendor: 'Tata Steel Ltd',
      submittedOn: '2026-08-15',
      validUntil: '2026-08-31',
      currency: draft.currency,
      discount: 0,
      freight: 0,
      insurance: 0,
      leadTime: 15,
      delivery: 12,
      paymentTerms: '30 Days',
      warranty: '12 Months',
      items: draft.items.map((item) => ({
        product: item.product,
        hsn: item.hsn,
        uom: item.uom,
        qty: item.qty,
        rate: item.rate ?? item.expectedRate ?? 0,
        gstRate: item.gstRate
      }))
    });
    const TERMS = { type: 'Against Delivery', balanceTrigger: 'Against Delivery' };
    await mockRfqService.startEvaluation(draft.id);
    const { evaluationService } = await import('./evaluation');
    /* Strict gates — negotiation closes as Agreed,
       technical + commercial evaluation with finalized payment terms. */
    const agreed = Math.round(quote.total * 0.95 * 100) / 100;
    await evaluationService.recordNegotiation(draft.id, 'Tata Steel Ltd', { amount: agreed, stage: 'Agreed' });
    await evaluationService.completeTechnicalEvaluation(draft.id);
    await evaluationService.completeCommercialEvaluation(draft.id, { paymentTerms: TERMS });
    await evaluationService.completeSupplierSelection(draft.id, 'Tata Steel Ltd');
    await evaluationService.approveSupplierSelection(draft.id, { decision: APPROVAL_STATUS.APPROVED });
    await mockRfqService.awardRfq(draft.id);
    const { po } = await mockRfqService.raisePurchaseOrder(draft.id);
    await mockPurchaseOrderService.approveOrder(po.id);
    await mockPurchaseOrderService.releaseOrder(po.id);

    /* Ship → receive → invoice → approve → pay. */
    await logisticsService.createShipment({ poNo: po.poNo, carrier: 'VRL', mode: 'Road' });
    const grn = await logisticsService.createGrn(po.poNo);
    await logisticsService.receiveGoods(grn.id);
    const invoice = await mockInvoiceService.createInvoice({
      poNo: po.poNo,
      vendor: 'Tata Steel Ltd',
      amount: po.amount,
      gst: 0,
      status: INVOICE_STATUS.SUBMITTED,
      items: po.items.map((item) => ({ product: item.product, qty: item.qty, rate: item.rate, gst: item.gstRate }))
    });
    await mockInvoiceService.approveInvoice(invoice.id);
    const paid = await mockInvoiceService.recordPayment(invoice.id, {
      method: 'Bank Transfer',
      full: true,
      transactionReference: 'TXN-CHAIN-1'
    });

    /* The advice carries the full settlement chain. */
    const advices = await mockInvoiceService.getPaymentAdvices();
    const advice = advices.find((entry) => entry.invoiceNo === invoice.invoiceNo);
    expect(advice).toBeTruthy();
    expect(advice.paymentNo).toBe(paid.paymentNo);
    expect(advice.invoiceNo).toBe(invoice.invoiceNo);
    expect(advice.poNo).toBe(po.poNo);
    expect(advice.vendor).toBe('Tata Steel Ltd');

    /* Upstream references survive end to end. */
    const storedPo = await mockPurchaseOrderService.getOrder(po.id);
    expect(storedPo.prNo).toBe('PR-2026-0070');
    expect(storedPo.rfqNo).toBe(draft.rfqNo);
    expect(storedPo.quotationNo).toBe(quote.quotationNo);
    expect(grn.poNo).toBe(po.poNo);
    expect(invoice.poNo).toBe(po.poNo);
    expect(paid.poNo).toBe(po.poNo);
    const rfq = await mockRfqService.getRfq(draft.id);
    expect(rfq.poNo).toBe(po.poNo);
  });
});
