/**
 * purchase/services/poAwardWorkflow.test.js
 * ------------------------------------------------------------------
 * Unit tests for the RFQ Award → Purchase Order workflow:
 *
 *   Awarded RFQ → Create PO → PO Approval → PO Release →
 *   Supplier Acknowledgement (→ Shipment → GRN)
 *
 * Covers the Phase 4 rules:
 *   RULE 1  Only an AWARDED RFQ can raise a PO
 *   RULE 2  The PO inherits the full document chain (PR, RFQ,
 *           Quotation, Vendor, items, quantity, final negotiated
 *           value, discount, tax, freight, payment terms, delivery
 *           terms, warranty, delivery location, currency)
 *   RULE 3  Duplicate PO creation is refused
 *   RULE 4  PO approval (Pending/Approved/Rejected) is separate from
 *           delivery status (Open/Partial/Completed)
 *   RULE 5  Only a RELEASED (approved) PO can be acknowledged by the
 *           supplier, shipped, or goods-received
 *   RULE 6  The PO records the complete document chain for deep links
 *           (prNo, rfqNo, quotationNo, awardedValue)
 *
 * The tests exercise the MOCK services directly against fresh in-memory
 * stores per test. `delay` is stubbed so the suite stays fast.
 * ------------------------------------------------------------------
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APPROVAL_STATUS, PO_STATUS, QUOTATION_STATUS } from '../constants';
import { evaluationService, evaluationsStore } from './evaluation';
import { mockRfqService, rfqsStore, quotationsStore } from './rfq';
import { mockPurchaseOrderService, ordersStore } from './purchaseOrder';
import { requisitionsStore } from './requisition';
import { vendorsStore } from './vendor';
import { logisticsService, grnsStore, shipmentsStore } from './logistics';

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
  grnsStore.reset();
  shipmentsStore.reset();
  setActor();
  const { mockVendorService } = await import('./vendor');
  for (const name of ['Tata Steel Ltd', 'JSW Steel', 'Bharat Forge']) {
    const v = await mockVendorService.createVendor({ name });
    await mockVendorService.setVendorStatus(v.id, 'Approved');
  }
});

const VENDORS = ['Tata Steel Ltd', 'JSW Steel'];

function rfqItems() {
  return [
    { product: 'HR coil 3mm', hsn: '7208', uom: 'Kg', qty: 8000, rate: 24.5, expectedRate: 24.5, specification: 'IS 2062 E250', requiredDate: '2026-09-15' },
    { product: 'MS plate 6mm', hsn: '7208', uom: 'Kg', qty: 1200, rate: 28, expectedRate: 28, specification: 'IS 2062', requiredDate: '2026-09-15' }
  ];
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
    freight: 0,
    insurance: 0,
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

/* Valid finalized payment terms used when a test supplies none — the
   strict selection gate requires finalized terms. */
const DEFAULT_TERMS = { type: 'Against Delivery', balanceTrigger: 'Against Delivery' };

/** Walks a fresh RFQ all the way to Awarded (via the Phase 3 pipeline).
 *  When `paymentTerms` is provided it is finalized during the commercial
 *  evaluation, so the raised PO inherits real finalized terms (otherwise
 *  DEFAULT_TERMS are finalized to satisfy the strict selection gate).
 *  Negotiation always closes as Agreed — at the negotiated rate when
 *  `negotiate` is set, otherwise at the quoted rate. */
async function createAwardedRfq({ negotiate, paymentTerms } = {}) {
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
  const quote = await mockRfqService.saveQuotation(quotationFor(draft, VENDORS[0]));
  await mockRfqService.saveQuotation(quotationFor(draft, VENDORS[1]));
  await mockRfqService.startEvaluation(draft.id);
  if (negotiate) {
    const agreed = Math.round(quote.total * 0.9 * 100) / 100;
    await evaluationService.recordNegotiation(draft.id, VENDORS[0], { amount: agreed, stage: 'Agreed', note: 'Volume discount' });
  } else {
    /* Strict gate — negotiation must close as Agreed before the
       technical evaluation; at the quoted rate the final award value
       stays the quotation total. */
    await evaluationService.recordNegotiation(draft.id, VENDORS[0], { amount: quote.total, stage: 'Agreed', note: 'Rate confirmed' });
  }
  await evaluationService.completeTechnicalEvaluation(draft.id);
  await evaluationService.completeCommercialEvaluation(
    draft.id,
    paymentTerms ? { paymentTerms } : { paymentTerms: DEFAULT_TERMS }
  );
  await evaluationService.completeSupplierSelection(draft.id, VENDORS[0], { rationale: 'Best overall fit' });
  await evaluationService.approveSupplierSelection(draft.id, { decision: APPROVAL_STATUS.APPROVED });
  await mockRfqService.awardRfq(draft.id);
  return mockRfqService.getRfq(draft.id);
}

describe('PO creation from an awarded RFQ', () => {
  it('RULE 1 — refuses to raise a PO from a non-awarded RFQ', async () => {
    /* Create an RFQ and walk it to SENT (not awarded). */
    const sentRfq = await mockRfqService.createRfq({
      title: 'Sent RFQ',
      reference: 'PR-TEST-001',
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
    await mockRfqService.submitForReview(sentRfq.id);
    await mockRfqService.approveRfq(sentRfq.id);
    await mockRfqService.sendRfq(sentRfq.id);
    await expect(mockRfqService.raisePurchaseOrder(sentRfq.id)).rejects.toThrow(
      /Only awarded RFQs can raise a purchase order/
    );

    /* Create an RFQ and close it (CLOSED). */
    const closedRfq = await mockRfqService.createRfq({
      title: 'Closed RFQ',
      reference: 'PR-TEST-002',
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
    await mockRfqService.submitForReview(closedRfq.id);
    await mockRfqService.approveRfq(closedRfq.id);
    await mockRfqService.sendRfq(closedRfq.id);
    await mockRfqService.closeRfq(closedRfq.id);
    await expect(mockRfqService.raisePurchaseOrder(closedRfq.id)).rejects.toThrow(
      /Only awarded RFQs can raise a purchase order/
    );

    /* Create an RFQ and cancel it (CANCELLED). */
    const cancelledRfq = await mockRfqService.createRfq({
      title: 'Cancelled RFQ',
      reference: 'PR-TEST-003',
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
    await mockRfqService.submitForReview(cancelledRfq.id);
    await mockRfqService.approveRfq(cancelledRfq.id);
    await mockRfqService.sendRfq(cancelledRfq.id);
    await mockRfqService.cancelRfq(cancelledRfq.id);
    await expect(mockRfqService.raisePurchaseOrder(cancelledRfq.id)).rejects.toThrow(
      /Only awarded RFQs can raise a purchase order/
    );
  });

  it('RULE 3 — refuses a second PO for the same RFQ', async () => {
    const rfq = await createAwardedRfq();
    const first = await mockRfqService.raisePurchaseOrder(rfq.id);
    expect(first.po.poNo).toMatch(/^PO-2026-/);

    await expect(mockRfqService.raisePurchaseOrder(rfq.id)).rejects.toThrow(/already raised/);
    /* The RFQ still points at the first PO. */
    const after = await mockRfqService.getRfq(rfq.id);
    expect(after.poNo).toBe(first.po.poNo);
  });

  it('RULE 2 — the PO inherits the complete document chain and commercial terms', async () => {
    const rfq = await createAwardedRfq();
    const quote = quotationsStore.all.find(
      (entry) => entry.rfqNo === rfq.rfqNo && entry.vendor === VENDORS[0] && entry.status === QUOTATION_STATUS.ACCEPTED
    );

    const { po } = await mockRfqService.raisePurchaseOrder(rfq.id);

    /* Document chain references. */
    expect(po.prNo).toBe('PR-2026-0045');
    expect(po.rfqNo).toBe(rfq.rfqNo);
    expect(po.quotationNo).toBe(quote.quotationNo);
    expect(po.awardedValue).toBe(rfq.awardedValue);

    /* Vendor, items, quantity and rates from the awarded quotation. */
    expect(po.vendor).toBe(VENDORS[0]);
    expect(po.items).toHaveLength(2);
    expect(po.items[0]).toMatchObject({ product: 'HR coil 3mm', qty: 8000, rate: 24.5, gstRate: 18 });
    expect(po.items[1]).toMatchObject({ product: 'MS plate 6mm', qty: 1200, rate: 28, gstRate: 18 });

    /* Commercial terms — payment / delivery terms, warranty, freight,
       discount, currency and delivery location. */
    expect(po.terms).toBe(quote.paymentTerms);
    expect(po.deliveryTerms).toBe(rfq.commercialTerms?.deliveryTerms || '');
    expect(po.warranty).toBe(quote.warranty);
    expect(po.discount).toBe(quote.discount);
    expect(po.currency).toBe(rfq.currency);
    expect(po.deliveryAddress).toBe(rfq.deliveryAddress || '');

    /* Approval and delivery start untouched — Pending + Open. */
    expect(po.approvalStatus).toBe(APPROVAL_STATUS.PENDING);
    expect(po.status).toBe(PO_STATUS.PENDING_APPROVAL);
  });

  it('RULE 2 — freight and insurance fold into the PO total so it matches the awarded quotation', async () => {
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
    /* Quotation carries freight + insurance on top of the item totals. */
    const quote = await mockRfqService.saveQuotation(
      quotationFor(draft, VENDORS[0], { freight: 1000, insurance: 500, discount: 2 })
    );
    await mockRfqService.saveQuotation(quotationFor(draft, VENDORS[1], { freight: 1200, insurance: 600 }));
    await mockRfqService.startEvaluation(draft.id);
    /* Strict gate — negotiation closes as Agreed (at the quoted rate, so
       the awarded value stays the quotation total). */
    await evaluationService.recordNegotiation(draft.id, VENDORS[0], { amount: quote.total, stage: 'Agreed', note: 'Rate confirmed' });
    await evaluationService.completeTechnicalEvaluation(draft.id);
    await evaluationService.completeCommercialEvaluation(draft.id, { paymentTerms: DEFAULT_TERMS });
    await evaluationService.completeSupplierSelection(draft.id, VENDORS[0]);
    await evaluationService.approveSupplierSelection(draft.id, { decision: APPROVAL_STATUS.APPROVED });
    await mockRfqService.awardRfq(draft.id);

    const { po } = await mockRfqService.raisePurchaseOrder(draft.id);
    /* Freight + insurance are preserved as display fields and folded into
       the non-taxable charges so PO amount === awarded quotation total. */
    expect(po.freight).toBe(1000);
    expect(po.insurance).toBe(500);
    expect(po.charges).toBe(1500);
    expect(po.amount).toBe(quote.total);
    expect(po.awardedValue).toBe(quote.total);
  });

  it('RULE 2 — the final NEGOTIATED value flows through the award into the PO', async () => {
    const rfq = await createAwardedRfq({ negotiate: true });
    const { po } = await mockRfqService.raisePurchaseOrder(rfq.id);
    expect(po.awardedValue).toBe(rfq.awardedValue);
    expect(rfq.awardedValue).toBeLessThan(
      quotationsStore.all.find((entry) => entry.rfqNo === rfq.rfqNo && entry.vendor === VENDORS[0]).total
    );
  });

  it('RULE 2 — the raised PO inherits the selected supplier, final negotiated price and finalized payment terms', async () => {
    /* Walk the full evaluation pipeline: finalized terms (50% advance +
       50% against delivery) + a negotiated rate agreed below the quote. */
    const rfq = await createAwardedRfq({
      negotiate: true,
      paymentTerms: {
        type: 'Partial Advance',
        advancePercentage: 50,
        advanceTrigger: 'Against PO / Order Confirmation',
        balanceTrigger: 'Against Delivery'
      }
    });
    const quote = quotationsStore.all.find(
      (entry) => entry.rfqNo === rfq.rfqNo && entry.vendor === VENDORS[0] && entry.status === QUOTATION_STATUS.ACCEPTED
    );
    /* The helper negotiates at 90% of the quoted total. */
    const agreed = Math.round(quote.total * 0.9 * 100) / 100;

    const { po } = await mockRfqService.raisePurchaseOrder(rfq.id);

    /* 1 — SELECTED SUPPLIER: the PO goes to the vendor the buyer picked
       (never the lowest-price one automatically). */
    expect(po.vendor).toBe(VENDORS[0]);

    /* 2 — FINAL NEGOTIATED PRICE: the award carries the agreed rate as
       the final approved value; the PO lines keep the quoted rates, so
       the PO amount matches the accepted quotation while awardedValue is
       the negotiated figure. */
    expect(po.awardedValue).toBe(agreed);
    expect(po.amount).toBe(quote.total);

    /* 3 — FINALIZED PAYMENT TERMS flow verbatim from the evaluation. */
    expect(po.paymentTermsRequired).toBe(false);
    expect(po.paymentTerms).toMatchObject({
      type: 'Partial Advance',
      advancePercentage: 50,
      balancePercentage: 50,
      balanceTrigger: 'Against Delivery'
    });
    expect(po.advanceStatus).toBe('Required');
    expect(po.advancePercentage).toBe(50);
    /* Advance / balance amounts are computed from the PO total (50/50). */
    const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;
    expect(po.advanceAmount).toBe(round2(po.amount * 0.5));
    expect(po.balanceAmount).toBe(round2(po.amount - po.advanceAmount));

    /* Items + quantities + the document chain ride along. */
    expect(po.items).toHaveLength(2);
    expect(po.items[0]).toMatchObject({ product: 'HR coil 3mm', qty: 8000, rate: 24.5 });
    expect(po.items[1]).toMatchObject({ product: 'MS plate 6mm', qty: 1200, rate: 28 });
    expect(po.rfqNo).toBe(rfq.rfqNo);
    expect(po.quotationNo).toBe(quote.quotationNo);
  });

  it('RULE 2 — credit-type finalized terms (30 days) inherit onto the PO with no advance', async () => {
    const rfq = await createAwardedRfq({ paymentTerms: { type: 'Credit', creditPeriod: 30 } });
    const { po } = await mockRfqService.raisePurchaseOrder(rfq.id);

    expect(po.paymentTermsRequired).toBe(false);
    expect(po.paymentTerms).toMatchObject({ type: 'Credit', creditPeriod: 30 });
    expect(po.advanceStatus).toBe('Not Required');
    expect(po.advanceAmount).toBe(0);
    expect(po.balanceAmount).toBe(po.amount);
    expect(po.vendor).toBe(VENDORS[0]);
  });
});

describe('PO approval vs delivery status', () => {
  it('RULE 4 — approval and delivery are tracked independently', async () => {
    const rfq = await createAwardedRfq();
    const { po } = await mockRfqService.raisePurchaseOrder(rfq.id);

    /* Delivery cannot move before approval (release). */
    await expect(mockPurchaseOrderService.setDeliveryStatus(po.id, PO_STATUS.PARTIALLY_DELIVERED)).rejects.toThrow(
      /Cannot set delivery status/
    );

    /* Approve → approval flips, delivery stays at Approved. */
    const approved = await mockPurchaseOrderService.approveOrder(po.id);
    expect(approved.approvalStatus).toBe(APPROVAL_STATUS.APPROVED);
    expect(approved.status).toBe(PO_STATUS.APPROVED);

    /* Release → Released, delivery now advances. */
    await mockPurchaseOrderService.releaseOrder(po.id);
    const partial = await mockPurchaseOrderService.setDeliveryStatus(po.id, PO_STATUS.PARTIALLY_DELIVERED);
    expect(partial.status).toBe(PO_STATUS.PARTIALLY_DELIVERED);
    expect(partial.approvalStatus).toBe(APPROVAL_STATUS.APPROVED);

    const completed = await mockPurchaseOrderService.setDeliveryStatus(po.id, PO_STATUS.COMPLETED);
    expect(completed.status).toBe(PO_STATUS.COMPLETED);
  });

  it('RULE 4 — a rejected PO cannot advance delivery and can be re-approved', async () => {
    const rfq = await createAwardedRfq();
    const { po } = await mockRfqService.raisePurchaseOrder(rfq.id);

    const rejected = await mockPurchaseOrderService.rejectOrder(po.id);
    expect(rejected.approvalStatus).toBe(APPROVAL_STATUS.REJECTED);
    expect(rejected.status).toBe(PO_STATUS.PENDING_APPROVAL);

    await expect(mockPurchaseOrderService.setDeliveryStatus(po.id, PO_STATUS.COMPLETED)).rejects.toThrow(
      /Cannot set delivery status/
    );

    /* Re-approval after a rejection is allowed (Pending or Rejected). */
    const reapproved = await mockPurchaseOrderService.approveOrder(po.id);
    expect(reapproved.approvalStatus).toBe(APPROVAL_STATUS.APPROVED);
  });
});

describe('Released-only downstream actions', () => {
  it('RULE 5 — acknowledgement, shipment and GRN are refused before release', async () => {
    const rfq = await createAwardedRfq();
    const { po } = await mockRfqService.raisePurchaseOrder(rfq.id);

    await expect(mockPurchaseOrderService.acknowledgeOrder(po.id)).rejects.toThrow(
      /Cannot acknowledge.*current stage is/
    );
    await expect(logisticsService.createShipment({ poNo: po.poNo })).rejects.toThrow(
      /Only released purchase orders can create a shipment/
    );
    await expect(logisticsService.createGrn(po.poNo)).rejects.toThrow(
      /Only released purchase orders can create a goods receipt/
    );
  });

  it('RULE 5 — after approval the PO can be acknowledged, shipped and GRN-received', async () => {
    const rfq = await createAwardedRfq();
    const { po } = await mockRfqService.raisePurchaseOrder(rfq.id);
    await mockPurchaseOrderService.approveOrder(po.id);
    await mockPurchaseOrderService.releaseOrder(po.id);

    const acknowledged = await mockPurchaseOrderService.acknowledgeOrder(po.id);
    expect(acknowledged.acknowledged).toBe(true);
    expect(acknowledged.acknowledgedBy).toBe(po.vendor);

    const shipment = await logisticsService.createShipment({ poNo: po.poNo, carrier: 'VRL', mode: 'Road' });
    expect(shipment.shipmentNo).toMatch(/^SHP-2026-/);

    const grn = await logisticsService.createGrn(po.poNo);
    expect(grn.grnNo).toMatch(/^GRN-2026-/);
    expect(grn.items).toHaveLength(2);
  });
});

describe('Document chain integrity', () => {
  it('RULE 6 — the RFQ records its raised PO and the PO carries the chain back', async () => {
    const rfq = await createAwardedRfq();
    const { po } = await mockRfqService.raisePurchaseOrder(rfq.id);

    /* RFQ → PO. */
    const after = await mockRfqService.getRfq(rfq.id);
    expect(after.poNo).toBe(po.poNo);

    /* PO → RFQ → Quotation → PR (the exact fields the OrderView chain reads). */
    const stored = await mockPurchaseOrderService.getOrder(po.id);
    expect(stored.rfqNo).toBe(rfq.rfqNo);
    expect(stored.quotationNo).toMatch(/^QT-/);
    expect(stored.prNo).toBe('PR-2026-0045');
    expect(stored.awardedValue).toBe(rfq.awardedValue);
  });
});
