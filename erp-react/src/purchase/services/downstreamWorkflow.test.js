/**
 * purchase/services/downstreamWorkflow.test.js
 * ------------------------------------------------------------------
 * Unit tests for the post-award procure-to-pay chain.
 * All tests are self-contained — they create their own fixtures.
 * ------------------------------------------------------------------
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { INVOICE_STATUS, MATCH_STATUS, PO_STATUS } from '../constants';
import { mockPurchaseOrderService, ordersStore } from './purchaseOrder';
import {
  logisticsService, GRN_STATUS, INSPECTION_STATUS, SHIPMENT_STATUS,
  grnsStore, inspectionsStore, shipmentsStore
} from './logistics';
import { mockInvoiceService, invoicesStore, advicesStore } from './invoice';
import { rfqsStore, quotationsStore } from './rfq';
import { requisitionsStore } from './requisition';
import { vendorsStore } from './vendor';

vi.mock('./base', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, delay: () => Promise.resolve() };
});

function setActor() {
  localStorage.setItem('authUser', JSON.stringify({ fullName: 'Test Buyer', email: 'buyer@test.com' }));
}

beforeEach(() => {
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
});

const TEST_ITEMS = [
  { product: 'Widget A', hsn: '1111', uom: 'Nos', qty: 10, rate: 100, gstRate: 18 },
  { product: 'Widget B', hsn: '1112', uom: 'Nos', qty: 5, rate: 50, gstRate: 18 }
];

/** Creates a fresh PO (Pending → Approved → Released) and returns it. */
async function createReleasedPo(items = TEST_ITEMS) {
  const po = await mockPurchaseOrderService.createOrder({
    title: 'Test PO', vendor: 'Tata Steel Ltd', reference: 'PR-TEST-1', items
  });
  await mockPurchaseOrderService.approveOrder(po.id);
  return mockPurchaseOrderService.releaseOrder(po.id);
}

/** Creates a fresh PO with a pending (not released) status. */
async function createPendingPo(items = TEST_ITEMS) {
  return mockPurchaseOrderService.createOrder({
    title: 'Pending PO', vendor: 'Tata Steel Ltd', reference: 'PR-TEST-2', items
  });
}

describe('Shipments', () => {
  it('createShipment refuses a PO that has not been released', async () => {
    const po = await createPendingPo();
    await expect(logisticsService.createShipment({ poNo: po.poNo })).rejects.toThrow(
      /Only released purchase orders/
    );
  });

  it('createShipment builds a numbered shipment carrying the PO vendor', async () => {
    const po = await createReleasedPo();
    const shipment = await logisticsService.createShipment({
      poNo: po.poNo, carrier: 'Blue Dart Freight', mode: 'Road'
    });
    expect(shipment.shipmentNo).toMatch(/^SHP-/);
    expect(shipment.poNo).toBe(po.poNo);
    expect(shipment.vendor).toBe('Tata Steel Ltd');
    expect(shipment.status).toBe(SHIPMENT_STATUS.PENDING);
  });

  it('marking a shipment delivered stamps receivedOn and blocks moving back', async () => {
    const po = await createReleasedPo();
    const shipment = await logisticsService.createShipment({ poNo: po.poNo });
    /* Must dispatch first — pending shipments cannot be marked delivered directly. */
    await logisticsService.updateShipment(shipment.id, { status: SHIPMENT_STATUS.IN_TRANSIT });
    const delivered = await logisticsService.updateShipment(shipment.id, { status: SHIPMENT_STATUS.DELIVERED });
    expect(delivered.status).toBe(SHIPMENT_STATUS.DELIVERED);
    expect(delivered.receivedOn).toBeTruthy();
    await expect(logisticsService.updateShipment(shipment.id, { status: SHIPMENT_STATUS.PENDING })).rejects.toThrow(/cannot be moved back/);
  });
});

describe('Goods receipt (GRN) and partial delivery', () => {
  it('createGrn refuses a PO that has not been released', async () => {
    const po = await createPendingPo();
    await expect(logisticsService.createGrn(po.poNo)).rejects.toThrow(/Only released purchase orders/);
  });

  it('createGrn builds expected lines from the released PO', async () => {
    const po = await createReleasedPo();
    const grn = await logisticsService.createGrn(po.poNo);
    expect(grn.grnNo).toMatch(/^GRN-/);
    expect(grn.status).toBe(GRN_STATUS.EXPECTED);
    expect(grn.vendor).toBe('Tata Steel Ltd');
    expect(grn.items).toHaveLength(2);
    expect(grn.items[0].product).toBe('Widget A');
    expect(grn.items[0].qty).toBe(10);
  });

  it('RULE 5 — a partial receipt keeps the PO at Partial with per-item receivedQty', async () => {
    const po = await createReleasedPo();
    const grn = await logisticsService.createGrn(po.poNo);
    await logisticsService.receiveGoods(grn.id, [
      { product: 'Widget A', received: 4 }, { product: 'Widget B', received: 5 }
    ]);
    const after = await mockPurchaseOrderService.getOrder(po.id);
    expect(after.status).toBe(PO_STATUS.PARTIALLY_DELIVERED);
    expect(after.items[0].receivedQty).toBe(4);
    expect(after.items[1].receivedQty).toBe(5);
  });

  it('RULE 6 — the PO becomes Completed only when every quantity is received', async () => {
    const po = await createReleasedPo();
    const grn1 = await logisticsService.createGrn(po.poNo);
    await logisticsService.receiveGoods(grn1.id, [{ product: 'Widget A', received: 4 }, { product: 'Widget B', received: 5 }]);
    expect((await mockPurchaseOrderService.getOrder(po.id)).status).toBe(PO_STATUS.PARTIALLY_DELIVERED);
    const grn2 = await logisticsService.createGrn(po.poNo);
    await logisticsService.receiveGoods(grn2.id, [{ product: 'Widget A', received: 6 }, { product: 'Widget B', received: 0 }]);
    const after = await mockPurchaseOrderService.getOrder(po.id);
    expect(after.status).toBe(PO_STATUS.COMPLETED);
  });

  it('RULE 4 — over-receipt beyond the outstanding ordered quantity is refused', async () => {
    const po = await createReleasedPo();
    const grn1 = await logisticsService.createGrn(po.poNo);
    await logisticsService.receiveGoods(grn1.id, [{ product: 'Widget A', received: 4 }, { product: 'Widget B', received: 5 }]);
    const grn2 = await logisticsService.createGrn(po.poNo);
    await expect(
      logisticsService.receiveGoods(grn2.id, [{ product: 'Widget A', received: 7 }, { product: 'Widget B', received: 0 }])
    ).rejects.toThrow(/exceeds the outstanding order quantity/);
  });

  it('a GRN cannot be received twice', async () => {
    const po = await createReleasedPo();
    const grn = await logisticsService.createGrn(po.poNo);
    await logisticsService.receiveGoods(grn.id);
    await expect(logisticsService.receiveGoods(grn.id)).rejects.toThrow(/already been received/);
  });

  it('full receipt on a Partial PO moves it to Completed', async () => {
    const po = await createReleasedPo();
    const grn = await logisticsService.createGrn(po.poNo);
    await logisticsService.receiveGoods(grn.id);
    const after = await mockPurchaseOrderService.getOrder(po.id);
    expect(after.status).toBe(PO_STATUS.COMPLETED);
  });
});

describe('Quality inspection', () => {
  it('a passed inspection closes the GRN receipt loop', async () => {
    const po = await createReleasedPo();
    const grn = await logisticsService.createGrn(po.poNo);
    await logisticsService.receiveGoods(grn.id);
    const inspections = await logisticsService.getInspections({ search: grn.grnNo });
    const inspection = inspections.data[0];
    expect(inspection).toBeTruthy();
    const result = await logisticsService.setInspectionResult(inspection.id, INSPECTION_STATUS.PASSED, 'All good');
    expect(result.status).toBe(INSPECTION_STATUS.PASSED);
    const grns = await logisticsService.getGrns({ search: grn.grnNo });
    expect(grns.data[0].status).toBe(GRN_STATUS.RECEIVED);
  });
});

describe('Invoices and the three-way match', () => {
  it('RULE 7 — an invoice must reference a valid PO', async () => {
    await expect(
      mockInvoiceService.createInvoice({ poNo: 'PO-NOT-EXIST', vendor: 'Tata Steel Ltd' })
    ).rejects.toThrow(/must reference a valid PO/);
  });

  it('RULE 8 — match is Pending without a receipt, Matched when aligned, Mismatch when value differs', async () => {
    const po = await createReleasedPo();
    const pending = await mockInvoiceService.createInvoice({ poNo: po.poNo, vendor: 'Tata Steel Ltd', amount: 100, gst: 0, status: INVOICE_STATUS.SUBMITTED });
    const fetched = await mockInvoiceService.getInvoice(pending.id);
    expect(fetched.matchStatus).toBe(MATCH_STATUS.PENDING);

    const grn = await logisticsService.createGrn(po.poNo);
    await logisticsService.receiveGoods(grn.id);
    const matched = await mockInvoiceService.createInvoice({ poNo: po.poNo, vendor: 'Tata Steel Ltd', amount: po.amount, gst: 0, status: INVOICE_STATUS.SUBMITTED });
    const matchedFetched = await mockInvoiceService.getInvoice(matched.id);
    expect(matchedFetched.matchStatus).toBe(MATCH_STATUS.MATCHED);

    const mismatched = await mockInvoiceService.createInvoice({ poNo: po.poNo, vendor: 'Tata Steel Ltd', amount: 99999, gst: 0, status: INVOICE_STATUS.SUBMITTED });
    const mismatchedFetched = await mockInvoiceService.getInvoice(mismatched.id);
    expect(mismatchedFetched.matchStatus).toBe(MATCH_STATUS.MISMATCH);
  });

  it('RULE 9 — approval is blocked while the match is pending', async () => {
    const po = await createReleasedPo();
    const invoice = await mockInvoiceService.createInvoice({ poNo: po.poNo, vendor: 'Tata Steel Ltd', amount: 100, gst: 0, status: INVOICE_STATUS.SUBMITTED });
    await expect(mockInvoiceService.approveInvoice(invoice.id)).rejects.toThrow(/three-way match is pending/);
  });

  it('RULE 10 — an already-paid invoice cannot be paid again', async () => {
    const po = await createReleasedPo();
    const grn = await logisticsService.createGrn(po.poNo);
    await logisticsService.receiveGoods(grn.id);
    const invoice = await mockInvoiceService.createInvoice({ poNo: po.poNo, vendor: 'Tata Steel Ltd', amount: po.amount, gst: 0, status: INVOICE_STATUS.SUBMITTED });
    await mockInvoiceService.approveInvoice(invoice.id);
    await mockInvoiceService.recordPayment(invoice.id, { method: 'Bank Transfer', full: true });
    await expect(mockInvoiceService.recordPayment(invoice.id, { method: 'Bank Transfer', full: true })).rejects.toThrow(/already paid/);
  });
});

describe('Payments and payment advices', () => {
  it('full payment settles an approved matched invoice', async () => {
    const po = await createReleasedPo();
    const grn = await logisticsService.createGrn(po.poNo);
    await logisticsService.receiveGoods(grn.id);
    const invoice = await mockInvoiceService.createInvoice({ poNo: po.poNo, vendor: 'Tata Steel Ltd', amount: po.amount, gst: 0, status: INVOICE_STATUS.SUBMITTED });
    await mockInvoiceService.approveInvoice(invoice.id);
    const paid = await mockInvoiceService.recordPayment(invoice.id, { method: 'Bank Transfer', full: true });
    expect(paid.status).toBe(INVOICE_STATUS.PAID);
    expect(paid.paymentNo).toMatch(/^PAY-/);
  });

  it('partial payments accumulate and complete at the balance', async () => {
    const po = await createReleasedPo();
    const grn = await logisticsService.createGrn(po.poNo);
    await logisticsService.receiveGoods(grn.id);
    const invoice = await mockInvoiceService.createInvoice({ poNo: po.poNo, vendor: 'Tata Steel Ltd', amount: po.amount, gst: 0, status: INVOICE_STATUS.SUBMITTED });
    await mockInvoiceService.approveInvoice(invoice.id);
    const first = await mockInvoiceService.recordPayment(invoice.id, { method: 'UPI', full: false, amount: 500 });
    expect(first.status).toBe(INVOICE_STATUS.PARTIAL);
    const second = await mockInvoiceService.recordPayment(invoice.id, { method: 'UPI', full: false, amount: po.amount - 500 });
    expect(second.status).toBe(INVOICE_STATUS.PAID);
  });
});

describe('RULE 11 — upstream references are preserved end to end', () => {
  it('GRNs, shipments and invoices all reference their PO', async () => {
    const po = await createReleasedPo();
    const grn = await logisticsService.createGrn(po.poNo);
    const shipment = await logisticsService.createShipment({ poNo: po.poNo });
    const invoice = await mockInvoiceService.createInvoice({ poNo: po.poNo, vendor: 'Tata Steel Ltd', amount: 100, gst: 0, status: INVOICE_STATUS.SUBMITTED });
    const fetched = await mockInvoiceService.getInvoice(invoice.id);
    expect(grn.poNo).toBe(po.poNo);
    expect(shipment.poNo).toBe(po.poNo);
    expect(fetched.poNo).toBe(po.poNo);
    expect(fetched.matchStatus).toBe(MATCH_STATUS.PENDING);
  });
});
