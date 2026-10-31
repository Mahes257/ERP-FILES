/**
 * purchase/services/invoiceThreeWayMatch.test.js
 * ------------------------------------------------------------------
 * Unit tests for the Purchase Invoice + Three-Way Match workflow:
 *
 *   PO + GRN + Invoice → Three Way Matching
 *
 * Covers the Phase 6 rules:
 *   RULE 1  Invoice must reference a valid PO (create refuses otherwise)
 *   RULE 2  Duplicate invoice numbers are refused
 *   RULE 3  Invoice vendor must match the PO vendor (create + match)
 *   RULE 4  Line-item matching — quantity, unit price (rate) and tax
 *           are compared PO vs GRN vs Invoice per product
 *   RULE 5  Exact mismatch reasons are produced (qty > GRN, price ≠ PO,
 *           tax ≠ PO, total ≠ PO)
 *   RULE 6  No goods receipt posted → Pending Match
 *   RULE 7  Only Matched invoices can proceed to Payment Approval
 *   RULE 8  Complete document chain PR → RFQ → PO → GRN → Invoice
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
import { mockInvoiceService, computeThreeWayMatch, invoicesStore, advicesStore } from './invoice';
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

/** Creates a fresh released PO with two lines and returns it. */
async function createReleasedPo() {
  const po = await mockPurchaseOrderService.createOrder({
    title: 'Test PO',
    vendor: 'Tata Steel Ltd',
    reference: 'PR-TEST-1',
    items: [
      { product: 'Widget A', hsn: '1111', uom: 'Nos', qty: 10, rate: 100, gstRate: 18 },
      { product: 'Widget B', hsn: '1112', uom: 'Nos', qty: 5, rate: 50, gstRate: 12 }
    ]
  });
  await mockPurchaseOrderService.approveOrder(po.id);
  return mockPurchaseOrderService.releaseOrder(po.id);
}

/** Released PO → GRN → full receipt (both lines). */
async function receiveFull(po) {
  const grn = await logisticsService.createGrn(po.poNo);
  await logisticsService.receiveGoods(grn.id);
  return grn;
}

describe('Invoice validation', () => {
  it('RULE 1 — an invoice must reference a valid PO', async () => {
    await expect(
      mockInvoiceService.createInvoice({ poNo: 'PO-NOT-EXIST', vendor: 'Tata Steel Ltd', amount: 100, gst: 0 })
    ).rejects.toThrow(/must reference a valid PO/);
  });

  it('RULE 2 — duplicate invoice numbers are refused', async () => {
    const po = await createReleasedPo();
    await mockInvoiceService.createInvoice({
      poNo: po.poNo,
      invoiceNo: 'INV-2026-7001',
      vendor: 'Tata Steel Ltd',
      amount: 100,
      gst: 0
    });
    await expect(
      mockInvoiceService.createInvoice({
        poNo: po.poNo,
        invoiceNo: 'INV-2026-7001',
        vendor: 'Tata Steel Ltd',
        amount: 200,
        gst: 0
      })
    ).rejects.toThrow(/already exists/);
  });

  it('RULE 3 — the invoice vendor must match the PO vendor at creation', async () => {
    const po = await createReleasedPo();
    await expect(
      mockInvoiceService.createInvoice({
        poNo: po.poNo,
        vendor: 'JSW Steel',
        amount: 100,
        gst: 0
      })
    ).rejects.toThrow(/does not match the PO vendor/);
  });
});

describe('Three-way match — line-item comparison', () => {
  it('RULE 3/4 — a fully aligned invoice (vendor, qty, rate, tax) is Matched', async () => {
    const po = await createReleasedPo();
    await receiveFull(po);

    const match = computeThreeWayMatch({
      poNo: po.poNo,
      vendor: 'Tata Steel Ltd',
      total: po.amount,
      items: [
        { product: 'Widget A', qty: 10, rate: 100, gst: 18 },
        { product: 'Widget B', qty: 5, rate: 50, gst: 12 }
      ]
    });
    expect(match.status).toBe(MATCH_STATUS.MATCHED);
    expect(match.reasons).toHaveLength(0);
    expect(match.details).toHaveLength(2);
    expect(match.details.every((line) => line.matched)).toBe(true);
  });

  it('RULE 4/5 — invoice quantity exceeding the GRN quantity produces an exact reason', async () => {
    const po = await createReleasedPo();
    await receiveFull(po);

    const match = computeThreeWayMatch({
      poNo: po.poNo,
      vendor: 'Tata Steel Ltd',
      total: po.amount,
      items: [
        { product: 'Widget A', qty: 12, rate: 100, gst: 18 },
        { product: 'Widget B', qty: 5, rate: 50, gst: 12 }
      ]
    });
    expect(match.status).toBe(MATCH_STATUS.MISMATCH);
    expect(match.reasons.join(' ')).toMatch(
      /Invoice quantity for Widget A \(12\) exceeds the GRN quantity \(10\)/
    );
    expect(match.details[0].matched).toBe(false);
    expect(match.details[1].matched).toBe(true);
  });

  it('RULE 4/5 — invoice unit price differing from the PO rate produces an exact reason', async () => {
    const po = await createReleasedPo();
    await receiveFull(po);

    const match = computeThreeWayMatch({
      poNo: po.poNo,
      vendor: 'Tata Steel Ltd',
      total: po.amount,
      items: [
        { product: 'Widget A', qty: 10, rate: 110, gst: 18 },
        { product: 'Widget B', qty: 5, rate: 50, gst: 12 }
      ]
    });
    expect(match.status).toBe(MATCH_STATUS.MISMATCH);
    expect(match.reasons.join(' ')).toMatch(
      /Invoice unit price for Widget A \(110\.00\) differs from the PO rate \(100\.00\)/
    );
  });

  it('RULE 4/5 — invoice tax differing from the PO tax produces an exact reason', async () => {
    const po = await createReleasedPo();
    await receiveFull(po);

    const match = computeThreeWayMatch({
      poNo: po.poNo,
      vendor: 'Tata Steel Ltd',
      total: po.amount,
      items: [
        { product: 'Widget A', qty: 10, rate: 100, gst: 28 },
        { product: 'Widget B', qty: 5, rate: 50, gst: 12 }
      ]
    });
    expect(match.status).toBe(MATCH_STATUS.MISMATCH);
    expect(match.reasons.join(' ')).toMatch(
      /Invoice tax for Widget A \(28\) differs from the PO tax \(18%\)/
    );
  });

  it('RULE 5 — the aggregate total mismatch reason is preserved (back-compat)', async () => {
    const po = await createReleasedPo();
    await receiveFull(po);

    const match = computeThreeWayMatch({ poNo: po.poNo, vendor: 'Tata Steel Ltd', total: 5000 });
    expect(match.status).toBe(MATCH_STATUS.MISMATCH);
    expect(match.reasons[0]).toMatch(/exceeds PO value/);
  });
});

describe('Three-way match — vendor and receipt state', () => {
  it('RULE 3 — a vendor-name mismatch on the invoice flags an exact reason', async () => {
    const po = await createReleasedPo();
    await receiveFull(po);

    const match = computeThreeWayMatch({
      poNo: po.poNo,
      vendor: 'JSW Steel',
      total: po.amount,
      items: [
        { product: 'Widget A', qty: 10, rate: 100, gst: 18 },
        { product: 'Widget B', qty: 5, rate: 50, gst: 12 }
      ]
    });
    expect(match.status).toBe(MATCH_STATUS.MISMATCH);
    expect(match.vendorMatched).toBe(false);
    expect(match.reasons[0]).toMatch(/Invoice vendor JSW Steel does not match the PO vendor Tata Steel Ltd/);
  });

  it('RULE 6 — no posted goods receipt leaves the match Pending', async () => {
    const po = await createReleasedPo();
    const match = computeThreeWayMatch({ poNo: po.poNo, vendor: 'Tata Steel Ltd', total: po.amount });
    expect(match.status).toBe(MATCH_STATUS.PENDING);
    expect(match.reasons[0]).toMatch(/No goods receipt posted/);
  });

  it('RULE 6/7 — a wrong PO reference gives Exception and blocks approval', async () => {
    const match = computeThreeWayMatch({ poNo: 'PO-MISSING', vendor: 'X', total: 1 });
    expect(match.status).toBe(MATCH_STATUS.EXCEPTION);
    expect(match.reasons[0]).toMatch(/does not reference a valid purchase order/);
  });
});

describe('Payment approval gating', () => {
  it('RULE 7 — a matched invoice can be approved for payment; the pending one cannot', async () => {
    const po = await createReleasedPo();
    const grn = await receiveFull(po);
    const invoice = await mockInvoiceService.createInvoice({
      poNo: po.poNo,
      vendor: 'Tata Steel Ltd',
      amount: po.amount,
      gst: 0,
      status: INVOICE_STATUS.SUBMITTED,
      items: [
        { product: 'Widget A', qty: 10, rate: 100, gst: 18 },
        { product: 'Widget B', qty: 5, rate: 50, gst: 12 }
      ]
    });

    const matched = await mockInvoiceService.approveInvoice(invoice.id);
    expect(matched.status).toBe(INVOICE_STATUS.APPROVED);

    /* A fresh Submitted invoice against a PO with NO posted receipt
       stays Pending Match — pending is driven by the absence of a GRN. */
    const po2 = await createReleasedPo();
    const draft = await mockInvoiceService.createInvoice({
      poNo: po2.poNo,
      invoiceNo: 'INV-2026-7002',
      vendor: 'Tata Steel Ltd',
      amount: po2.amount,
      gst: 0,
      status: INVOICE_STATUS.SUBMITTED
    });
    await expect(mockInvoiceService.approveInvoice(draft.id)).rejects.toThrow(/three-way match is pending match/);
    expect(grn.grnNo).toMatch(/^GRN-/);
  });

  it('RULE 7 — a mismatched invoice (wrong qty) cannot be approved for payment', async () => {
    const po = await createReleasedPo();
    await receiveFull(po);
    const invoice = await mockInvoiceService.createInvoice({
      poNo: po.poNo,
      vendor: 'Tata Steel Ltd',
      amount: po.amount,
      gst: 0,
      status: INVOICE_STATUS.SUBMITTED,
      items: [
        { product: 'Widget A', qty: 11, rate: 100, gst: 18 },
        { product: 'Widget B', qty: 5, rate: 50, gst: 12 }
      ]
    });
    await expect(mockInvoiceService.approveInvoice(invoice.id)).rejects.toThrow(/three-way match is mismatch/);
  });
});

describe('Complete document chain', () => {
  it('RULE 8 — PR → RFQ → PO → GRN → Invoice references stay intact', async () => {
    /* Walk the sourcing pipeline down to an awarded PO (Phases 3-5). */
    const draft = await mockRfqService.createRfq({
      title: 'Chain test materials',
      reference: 'PR-2026-0060',
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
    /* Import lazily to avoid a hard dependency at the top of the suite. */
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

    /* Deliver, receive and invoice. */
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

    /* Every downstream document retains its upstream reference. */
    const storedPo = await mockPurchaseOrderService.getOrder(po.id);
    expect(storedPo.prNo).toBe('PR-2026-0060');
    expect(storedPo.rfqNo).toBe(draft.rfqNo);
    expect(grn.poNo).toBe(po.poNo);
    expect(invoice.poNo).toBe(po.poNo);

    /* The full chain matches: the invoice is Matched and approvable. */
    const fetched = await mockInvoiceService.getInvoice(invoice.id);
    expect(fetched.matchStatus).toBe(MATCH_STATUS.MATCHED);
    await mockInvoiceService.approveInvoice(invoice.id);
  });
});
