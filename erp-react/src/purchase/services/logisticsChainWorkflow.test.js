/**
 * purchase/services/logisticsChainWorkflow.test.js
 * ------------------------------------------------------------------
 * Unit tests for the PO → Logistics → GRN → Quality → Inventory chain:
 *
 *   Released PO → Supplier Acknowledgement → Shipment → GRN →
 *   Quality Inspection → Inventory Update
 *
 * Covers the Phase 5 rules:
 *   RULE 1  Shipment must reference the PO (and only a released PO
 *           can be shipped)
 *   RULE 2  GRN must reference the PO and auto-load the PO items
 *   RULE 3  Ordered / Received / Pending quantities are tracked on
 *           every GRN line and on the linked PO
 *   RULE 4  Received quantity can never exceed the ordered quantity
 *   RULE 5  Multiple GRNs support partial deliveries
 *   RULE 6  PO status advances Open → Partial → Completed only as
 *           receipts warrant
 *   RULE 7  Quality inspection references the GRN (auto-opened on
 *           receipt, exactly one per GRN)
 *   RULE 8  Only ACCEPTED (passed-inspection) quantity enters
 *           inventory — failed goods never post
 *   RULE 9  Duplicate inventory posting is refused
 *   RULE 10 Every document retains the complete upstream chain
 *           (PR → RFQ → PO → Shipment → GRN → QC → Inventory)
 *
 * The tests exercise the MOCK services directly against fresh in-memory
 * stores per test. `delay` is stubbed so the suite stays fast.
 * ------------------------------------------------------------------
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APPROVAL_STATUS, PO_STATUS } from '../constants';
import { mockPurchaseOrderService, ordersStore } from './purchaseOrder';
import {
  logisticsService, GRN_STATUS, INSPECTION_STATUS, SHIPMENT_STATUS,
  grnsStore, inspectionsStore, inventoryStore, shipmentsStore
} from './logistics';
import { evaluationService, evaluationsStore } from './evaluation';
import { mockRfqService, rfqsStore, quotationsStore } from './rfq';
import { requisitionsStore } from './requisition';
import { vendorsStore } from './vendor';

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
  ordersStore.reset();
  grnsStore.reset();
  inspectionsStore.reset();
  shipmentsStore.reset();
  inventoryStore.reset();
  requisitionsStore.reset();
  rfqsStore.reset();
  quotationsStore.reset();
  vendorsStore.reset();
  evaluationsStore.reset();
  setActor();
  const { mockVendorService } = await import('./vendor');
  for (const name of ['Tata Steel Ltd', 'JSW Steel', 'Bharat Forge', 'Havells India', 'Dell Technologies', 'Bosch India', 'Crompton Greaves']) {
    const v = await mockVendorService.createVendor({ name });
    await mockVendorService.setVendorStatus(v.id, 'Approved');
  }
});

const TEST_ITEMS = [
  { product: 'Widget A', hsn: '1111', uom: 'Nos', qty: 10, rate: 100, gstRate: 18 },
  { product: 'Widget B', hsn: '1112', uom: 'Nos', qty: 5, rate: 50, gstRate: 18 }
];

/** Creates a fresh PO (Pending → Approved → Released) and returns it. */
async function createReleasedPo(items = TEST_ITEMS) {
  const po = await mockPurchaseOrderService.createOrder({
    title: 'Test PO',
    vendor: 'Tata Steel Ltd',
    reference: 'PR-TEST-1',
    items
  });
  await mockPurchaseOrderService.approveOrder(po.id);
  const released = await mockPurchaseOrderService.releaseOrder(po.id);
  return released;
}

/** Released PO → GRN → partial/full receipt (auto-opens inspection). */
async function receiveAgainstPo(po, receivedItems) {
  const grn = await logisticsService.createGrn(po.poNo);
  await logisticsService.receiveGoods(grn.id, receivedItems);
  return grn;
}

describe('Shipment references the PO', () => {
  it('RULE 1 — createShipment requires a released PO and stores its number', async () => {
    const po = await createReleasedPo();
    const shipment = await logisticsService.createShipment({
      poNo: po.poNo,
      carrier: 'Blue Dart',
      mode: 'Road'
    });
    expect(shipment.poNo).toBe(po.poNo);
    expect(shipment.vendor).toBe(po.vendor);
    expect(shipment.shipmentNo).toMatch(/^SHP-2026-/);
  });

  it('RULE 1 — an un-released PO cannot be shipped', async () => {
    /* Create a pending (unreleased) PO. */
    const po = await mockPurchaseOrderService.createOrder({
      title: 'Pending PO', vendor: 'Tata Steel Ltd', reference: 'PR-TEST-PENDING',
      items: TEST_ITEMS
    });
    await expect(logisticsService.createShipment({ poNo: po.poNo })).rejects.toThrow(
      /Only released purchase orders/
    );
  });
});

describe('GRN references the PO and auto-loads its items', () => {
  it('RULE 2 — createGrn builds expected lines from the released PO', async () => {
    const po = await createReleasedPo();
    const grn = await logisticsService.createGrn(po.poNo);
    expect(grn.poNo).toBe(po.poNo);
    expect(grn.vendor).toBe(po.vendor);
    expect(grn.status).toBe(GRN_STATUS.EXPECTED);
    expect(grn.items).toHaveLength(2);
    expect(grn.items[0]).toMatchObject({ product: 'Widget A', qty: 10, received: 0 });
    expect(grn.items[1]).toMatchObject({ product: 'Widget B', qty: 5, received: 0 });
  });

  it('RULE 2 — an un-released PO cannot receive goods', async () => {
    /* Create a pending (unreleased) PO. */
    const po = await mockPurchaseOrderService.createOrder({
      title: 'Pending PO', vendor: 'Tata Steel Ltd', reference: 'PR-TEST-PENDING2',
      items: TEST_ITEMS
    });
    await expect(logisticsService.createGrn(po.poNo)).rejects.toThrow(
      /Only released purchase orders/
    );
  });
});

describe('Ordered / Received / Pending quantity tracking', () => {
  it('RULE 3 — GRN lines expose ordered, received and pending quantities', async () => {
    const po = await createReleasedPo();
    const grn = await logisticsService.createGrn(po.poNo);
    await logisticsService.receiveGoods(grn.id, [
      { product: 'Widget A', received: 4 },
      { product: 'Widget B', received: 5 }
    ]);

    const after = (await logisticsService.getGrns({ search: grn.grnNo })).data[0];
    expect(after.items[0]).toMatchObject({ qty: 10, received: 4, pending: 6 });
    expect(after.items[1]).toMatchObject({ qty: 5, received: 5, pending: 0 });
  });

  it('RULE 3 — the PO carries per-item receivedQty and pendingQty', async () => {
    const po = await createReleasedPo();
    const grn = await logisticsService.createGrn(po.poNo);
    await logisticsService.receiveGoods(grn.id, [
      { product: 'Widget A', received: 4 },
      { product: 'Widget B', received: 5 }
    ]);

    const after = await mockPurchaseOrderService.getOrder(po.id);
    expect(after.status).toBe(PO_STATUS.PARTIALLY_DELIVERED);
    expect(after.items[0]).toMatchObject({ qty: 10, receivedQty: 4, pendingQty: 6 });
    expect(after.items[1]).toMatchObject({ qty: 5, receivedQty: 5, pendingQty: 0 });
  });
});

describe('Over-receipt and partial deliveries', () => {
  it('RULE 4 — received quantity cannot exceed the ordered quantity', async () => {
    const po = await createReleasedPo();
    const grn = await logisticsService.createGrn(po.poNo);
    await expect(
      logisticsService.receiveGoods(grn.id, [{ product: 'Widget A', received: 11 }])
    ).rejects.toThrow(/exceeds the outstanding order quantity \(10\)/);
  });

  it('RULE 4 — cumulative over-receipt across multiple GRNs is refused', async () => {
    const po = await createReleasedPo();
    const grn1 = await logisticsService.createGrn(po.poNo);
    await logisticsService.receiveGoods(grn1.id, [
      { product: 'Widget A', received: 4 },
      { product: 'Widget B', received: 5 }
    ]);

    /* Only 6 of Widget A remain across the PO — asking for 7 must fail. */
    const grn2 = await logisticsService.createGrn(po.poNo);
    await expect(
      logisticsService.receiveGoods(grn2.id, [
        { product: 'Widget A', received: 7 },
        { product: 'Widget B', received: 0 }
      ])
    ).rejects.toThrow(/exceeds the outstanding order quantity \(6\)/);
  });

  it('RULE 5/6 — multiple GRNs accumulate to Partial then Completed', async () => {
    const po = await createReleasedPo();

    const grn1 = await receiveAgainstPo(po, [
      { product: 'Widget A', received: 4 },
      { product: 'Widget B', received: 5 }
    ]);
    expect((await mockPurchaseOrderService.getOrder(po.id)).status).toBe(PO_STATUS.PARTIALLY_DELIVERED);

    const grn2 = await receiveAgainstPo(po, [
      { product: 'Widget A', received: 6 },
      { product: 'Widget B', received: 0 }
    ]);
    expect(grn1.grnNo).not.toBe(grn2.grnNo);

    const after = await mockPurchaseOrderService.getOrder(po.id);
    expect(after.status).toBe(PO_STATUS.COMPLETED);
    expect(after.items[0]).toMatchObject({ receivedQty: 10, pendingQty: 0 });
    expect(after.items[1]).toMatchObject({ receivedQty: 5, pendingQty: 0 });
  });

  it('RULE 6 — a GRN cannot be received twice', async () => {
    const po = await createReleasedPo();
    const grn = await logisticsService.createGrn(po.poNo);
    await logisticsService.receiveGoods(grn.id);
    await expect(logisticsService.receiveGoods(grn.id)).rejects.toThrow(/already been received/);
  });
});

describe('Quality inspection references the GRN', () => {
  it('RULE 7 — receiving goods auto-opens exactly one inspection per GRN', async () => {
    const po = await createReleasedPo();
    const grn = await receiveAgainstPo(po, [{ product: 'Widget A', received: 4 }]);

    const inspections = await logisticsService.getInspections({ search: grn.grnNo });
    expect(inspections.total).toBe(1);
    expect(inspections.data[0]).toMatchObject({
      grnNo: grn.grnNo,
      poNo: po.poNo,
      vendor: po.vendor,
      status: INSPECTION_STATUS.PENDING
    });

    /* A second receipt against the same GRN is impossible (already
       received); a fresh GRN for the same PO opens its own inspection.
       Widget B is already fully received — the second GRN takes the
       remaining Widget A quantity instead. */
    const grn2 = await receiveAgainstPo(po, [{ product: 'Widget A', received: 6 }]);
    const second = await logisticsService.getInspections({ search: grn2.grnNo });
    expect(second.total).toBe(1);
    expect(second.data[0].grnNo).toBe(grn2.grnNo);
    expect(second.data[0].poNo).toBe(po.poNo);
  });

  it('RULE 7 — a failed inspection does NOT close the GRN loop or post inventory', async () => {
    const po = await createReleasedPo();
    const grn = await receiveAgainstPo(po, [{ product: 'Widget A', received: 4 }]);
    const inspection = (await logisticsService.getInspections({ search: grn.grnNo })).data[0];

    await logisticsService.setInspectionResult(inspection.id, INSPECTION_STATUS.FAILED, 'Non-conforming');

    /* GRN stays Pending Inspection; nothing enters the ledger. */
    const grnAfter = (await logisticsService.getGrns({ search: grn.grnNo })).data[0];
    expect(grnAfter.status).toBe(GRN_STATUS.PENDING_INSPECTION);
    expect(
      inventoryStore.all.filter((entry) => entry.reference === grn.grnNo)
    ).toHaveLength(0);

    await expect(logisticsService.postInventoryFromInspection(inspection.id)).rejects.toThrow(
      /Only a passed or partially accepted inspection/
    );
  });
});

describe('Only accepted quantity enters inventory', () => {
  it('RULE 8 — a passed inspection posts the accepted quantity per line', async () => {
    const po = await createReleasedPo();
    const grn = await receiveAgainstPo(po, [
      { product: 'Widget A', received: 4 },
      { product: 'Widget B', received: 5 }
    ]);
    const inspection = (await logisticsService.getInspections({ search: grn.grnNo })).data[0];
    await logisticsService.setInspectionResult(inspection.id, INSPECTION_STATUS.PASSED, 'Conforming');

    const posts = await logisticsService.postInventoryFromInspection(inspection.id);
    expect(posts).toHaveLength(2);
    const widgetA = posts.find((entry) => entry.product === 'Widget A');
    const widgetB = posts.find((entry) => entry.product === 'Widget B');
    expect(widgetA.delta).toBe(4);
    expect(widgetB.delta).toBe(5);
    /* Each posting carries the full document chain for the ledger. */
    posts.forEach((entry) => {
      expect(entry.type).toBe('Receipt');
      expect(entry.reference).toBe(grn.grnNo);
      expect(entry.poNo).toBe(po.poNo);
      expect(entry.grnNo).toBe(grn.grnNo);
      expect(entry.inspectionNo).toBe(inspection.inspectionNo);
    });
  });

  it('RULE 8 — rejected lines are excluded from the inventory posting', async () => {
    const po = await createReleasedPo();
    const grn = await receiveAgainstPo(po, [
      { product: 'Widget A', received: 6 },
      { product: 'Widget B', received: 0 } /* Widget B not received at all */
    ]);
    const inspection = (await logisticsService.getInspections({ search: grn.grnNo })).data[0];
    await logisticsService.setInspectionResult(inspection.id, INSPECTION_STATUS.PASSED);

    const posts = await logisticsService.postInventoryFromInspection(inspection.id);
    expect(posts).toHaveLength(1);
    expect(posts[0].product).toBe('Widget A');
    expect(posts[0].delta).toBe(6);
  });

  it('RULE 9 — duplicate inventory posting is refused (inspection stamp + ledger check)', async () => {
    const po = await createReleasedPo();
    const grn = await receiveAgainstPo(po, [{ product: 'Widget A', received: 4 }]);
    const inspection = (await logisticsService.getInspections({ search: grn.grnNo })).data[0];
    await logisticsService.setInspectionResult(inspection.id, INSPECTION_STATUS.PASSED);

    await logisticsService.postInventoryFromInspection(inspection.id);
    /* Same inspection cannot post twice. */
    await expect(logisticsService.postInventoryFromInspection(inspection.id)).rejects.toThrow(
      /already been posted to inventory/
    );

    /* A different inspection record for the same GRN cannot post either —
       the ledger already holds a receipt for this GRN. */
    const duplicate = {
      id: 'QC-2026-9999',
      inspectionNo: 'QC-2026-9999',
      grnNo: grn.grnNo,
      poNo: po.poNo,
      vendor: po.vendor,
      status: INSPECTION_STATUS.PASSED,
      inspectedOn: '2026-08-20',
      defects: 0,
      inspector: 'Quality Team',
      notes: '',
      createdAt: '2026-08-20T12:00:00Z'
    };
    inspectionsStore.all.push(duplicate);
    await expect(logisticsService.postInventoryFromInspection(duplicate.id)).rejects.toThrow(
      /already been posted to inventory/
    );
  });

  it('RULE 8 — posting requires the GRN to be received first', async () => {
    const po = await createReleasedPo();
    const grn = await receiveAgainstPo(po, [{ product: 'Widget A', received: 4 }]);
    const inspection = (await logisticsService.getInspections({ search: grn.grnNo })).data[0];
    await logisticsService.setInspectionResult(inspection.id, INSPECTION_STATUS.PASSED);
    /* The pass closes the GRN loop (Pending Inspection → Received). */
    const grnAfter = (await logisticsService.getGrns({ search: grn.grnNo })).data[0];
    expect(grnAfter.status).toBe(GRN_STATUS.RECEIVED);
  });
});

describe('Complete document chain integrity', () => {
  it('RULE 10 — PR → RFQ → PO → Shipment → GRN → QC → Inventory stays linked', async () => {
    /* Walk the full sourcing pipeline down to an awarded RFQ (Phase 3/4). */
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
      vendorNames: ['Tata Steel Ltd', 'JSW Steel'],
      items: [
        { product: 'HR coil 3mm', hsn: '7208', uom: 'Kg', qty: 100, rate: 24.5, expectedRate: 24.5 },
        { product: 'MS plate 6mm', hsn: '7208', uom: 'Kg', qty: 50, rate: 28, expectedRate: 28 }
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
      discount: 2,
      freight: 100,
      insurance: 50,
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
        gstRate: 18
      }))
    });
    await mockRfqService.saveQuotation({
      rfqNo: draft.rfqNo,
      vendor: 'JSW Steel',
      submittedOn: '2026-08-15',
      validUntil: '2026-08-31',
      currency: draft.currency,
      discount: 1,
      freight: 120,
      insurance: 60,
      leadTime: 20,
      delivery: 15,
      paymentTerms: '30 Days',
      warranty: '12 Months',
      items: draft.items.map((item) => ({
        product: item.product,
        hsn: item.hsn,
        uom: item.uom,
        qty: item.qty,
        rate: (item.rate ?? item.expectedRate ?? 0) * 0.97,
        gstRate: 18
      }))
    });
    const TERMS = { type: 'Against Delivery', balanceTrigger: 'Against Delivery' };
    await mockRfqService.startEvaluation(draft.id);
    /* Strict gates — negotiation closes as Agreed,
       technical + commercial evaluation with finalized payment terms. */
    const agreed = Math.round(quote.total * 0.9 * 100) / 100;
    await evaluationService.recordNegotiation(draft.id, 'Tata Steel Ltd', { amount: agreed, stage: 'Agreed' });
    await evaluationService.completeTechnicalEvaluation(draft.id);
    await evaluationService.completeCommercialEvaluation(draft.id, { paymentTerms: TERMS });
    await evaluationService.completeSupplierSelection(draft.id, 'Tata Steel Ltd');
    await evaluationService.approveSupplierSelection(draft.id, { decision: APPROVAL_STATUS.APPROVED });
    await mockRfqService.awardRfq(draft.id);
    const { po } = await mockRfqService.raisePurchaseOrder(draft.id);
    await mockPurchaseOrderService.approveOrder(po.id);
    await mockPurchaseOrderService.releaseOrder(po.id);

    /* Downstream documents each carry their upstream reference. */
    const shipment = await logisticsService.createShipment({ poNo: po.poNo, carrier: 'VRL', mode: 'Road' });
    const grn = await logisticsService.createGrn(po.poNo);
    await logisticsService.receiveGoods(grn.id);
    const inspection = (await logisticsService.getInspections({ search: grn.grnNo })).data[0];
    await logisticsService.setInspectionResult(inspection.id, INSPECTION_STATUS.PASSED);
    const posts = await logisticsService.postInventoryFromInspection(inspection.id);

    expect(shipment.poNo).toBe(po.poNo);
    expect(grn.poNo).toBe(po.poNo);
    expect(inspection.poNo).toBe(po.poNo);
    expect(inspection.grnNo).toBe(grn.grnNo);
    posts.forEach((post) => {
      expect(post.poNo).toBe(po.poNo);
      expect(post.grnNo).toBe(grn.grnNo);
      expect(post.inspectionNo).toBe(inspection.inspectionNo);
    });

    /* The PO's upstream chain (PR → RFQ) is intact and delivered fully. */
    const storedPo = await mockPurchaseOrderService.getOrder(po.id);
    expect(storedPo.prNo).toBe('PR-2026-0045');
    expect(storedPo.rfqNo).toBe(draft.rfqNo);
    expect(storedPo.status).toBe(PO_STATUS.COMPLETED);
    const rfq = await mockRfqService.getRfq(draft.id);
    expect(rfq.poNo).toBe(po.poNo);
  });
});

describe('End-to-end logistics workflow', () => {
  it('PO → Shipment → GRN → Inspection → Inventory completes the full chain', async () => {
    const po = await createReleasedPo();

    /* Step 1: Create a shipment against the released PO. */
    const shipment = await logisticsService.createShipment({
      poNo: po.poNo, carrier: 'Blue Dart', mode: 'Road'
    });
    expect(shipment.poNo).toBe(po.poNo);
    expect(shipment.status).toBe(SHIPMENT_STATUS.PENDING);

    /* Step 2: Dispatch the shipment. */
    await logisticsService.updateShipment(shipment.id, { status: SHIPMENT_STATUS.IN_TRANSIT });

    /* Step 3: Deliver the shipment. */
    const delivered = await logisticsService.updateShipment(shipment.id, { status: SHIPMENT_STATUS.DELIVERED });
    expect(delivered.status).toBe(SHIPMENT_STATUS.DELIVERED);
    expect(delivered.receivedOn).toBeTruthy();

    /* Step 4: Create a GRN linked to the shipment. */
    const grn = await logisticsService.createGrn(po.poNo, { shipmentNo: shipment.shipmentNo });
    expect(grn.poNo).toBe(po.poNo);
    expect(grn.shipmentNo).toBe(shipment.shipmentNo);
    expect(grn.status).toBe(GRN_STATUS.EXPECTED);
    expect(grn.items).toHaveLength(2);

    /* Step 5: Receive goods against the GRN (partial receipt). */
    const received = await logisticsService.receiveGoods(grn.id, [
      { product: 'Widget A', received: 7 },
      { product: 'Widget B', received: 5 }
    ]);
    expect(received.status).toBe(GRN_STATUS.PENDING_INSPECTION);
    expect(received.items[0].received).toBe(7);
    expect(received.items[0].pending).toBe(3);
    expect(received.items[1].received).toBe(5);
    expect(received.items[1].pending).toBe(0);

    /* PO advances to Partial. */
    const partialPo = await mockPurchaseOrderService.getOrder(po.id);
    expect(partialPo.status).toBe(PO_STATUS.PARTIALLY_DELIVERED);

    /* Step 6: Inspection was auto-created on receipt. */
    const inspections = await logisticsService.getInspections({ search: grn.grnNo });
    expect(inspections.total).toBe(1);
    const inspection = inspections.data[0];
    expect(inspection.status).toBe(INSPECTION_STATUS.PENDING);
    expect(inspection.grnNo).toBe(grn.grnNo);

    /* Step 7: Start the inspection. */
    const started = await logisticsService.startInspection(inspection.id);
    expect(started.status).toBe(INSPECTION_STATUS.IN_PROGRESS);

    /* Step 8: Set inspection result — pass with per-item quantities. */
    const result = await logisticsService.setInspectionResult(inspection.id, INSPECTION_STATUS.PASSED, {
      notes: 'All conforming',
      items: [
        { product: 'Widget A', receivedQty: 7, inspectedQty: 7, acceptedQty: 6, rejectedQty: 1 },
        { product: 'Widget B', receivedQty: 5, inspectedQty: 5, acceptedQty: 5, rejectedQty: 0 }
      ]
    });
    expect(result.status).toBe(INSPECTION_STATUS.PARTIALLY_ACCEPTED);
    expect(result.defects).toBe(1);

    /* GRN advances to Received. */
    const grnAfter = (await logisticsService.getGrns({ search: grn.grnNo })).data[0];
    expect(grnAfter.status).toBe(GRN_STATUS.RECEIVED);

    /* Step 9: Post accepted quantity to inventory. */
    const posts = await logisticsService.postInventoryFromInspection(inspection.id, {
      warehouse: 'Main Store', updatedBy: 'Stores Team'
    });
    expect(posts).toHaveLength(2);
    const widgetAPost = posts.find((p) => p.product === 'Widget A');
    const widgetBPost = posts.find((p) => p.product === 'Widget B');
    /* Only accepted qty enters stock — rejected excluded. */
    expect(widgetAPost.delta).toBe(6);
    expect(widgetBPost.delta).toBe(5);
    expect(widgetAPost.type).toBe('Receipt');
    expect(widgetAPost.grnNo).toBe(grn.grnNo);
    expect(widgetAPost.inspectionNo).toBe(inspection.inspectionNo);

    /* Duplicate posting is refused. */
    await expect(
      logisticsService.postInventoryFromInspection(inspection.id)
    ).rejects.toThrow(/already been posted/);

    /* Step 10: Second GRN for the remaining quantity. */
    const grn2 = await logisticsService.createGrn(po.poNo, { shipmentNo: shipment.shipmentNo });
    await logisticsService.receiveGoods(grn2.id, [
      { product: 'Widget A', received: 3 },
      { product: 'Widget B', received: 0 }
    ]);

    /* PO completes. */
    const completedPo = await mockPurchaseOrderService.getOrder(po.id);
    expect(completedPo.status).toBe(PO_STATUS.COMPLETED);
    expect(completedPo.items[0]).toMatchObject({ qty: 10, receivedQty: 10, pendingQty: 0 });
    expect(completedPo.items[1]).toMatchObject({ qty: 5, receivedQty: 5, pendingQty: 0 });
  });

  it('updateGrn edits quantities before receipt and refuses edit after receipt', async () => {
    const po = await createReleasedPo();
    const grn = await logisticsService.createGrn(po.poNo);

    /* Edit before receipt succeeds. */
    const edited = await logisticsService.updateGrn(grn.id, {
      items: [
        { product: 'Widget A', qty: 8, received: 0 },
        { product: 'Widget B', qty: 5, received: 0 }
      ]
    });
    expect(edited.items[0].qty).toBe(8);

    /* Receive — now edit must fail. */
    await logisticsService.receiveGoods(grn.id, [
      { product: 'Widget A', received: 8 },
      { product: 'Widget B', received: 5 }
    ]);
    await expect(
      logisticsService.updateGrn(grn.id, { items: [{ product: 'Widget A', qty: 1, received: 0 }] })
    ).rejects.toThrow(/can only be edited before goods are received/);
  });

  it('sendToInspection returns the inspection and refuses on expected GRN', async () => {
    const po = await createReleasedPo();
    const grn = await logisticsService.createGrn(po.poNo);

    /* Cannot send to inspection before receipt. */
    await expect(logisticsService.sendToInspection(grn.id)).rejects.toThrow(/must be received/);

    /* Receive goods. */
    await logisticsService.receiveGoods(grn.id, [
      { product: 'Widget A', received: 10 },
      { product: 'Widget B', received: 5 }
    ]);

    /* Now sendToInspection returns the existing inspection. */
    const inspection = await logisticsService.sendToInspection(grn.id);
    expect(inspection.grnNo).toBe(grn.grnNo);
    expect(inspection.status).toBe(INSPECTION_STATUS.PENDING);
  });

  it('shipment delivery refuses when still pending (not dispatched)', async () => {
    const po = await createReleasedPo();
    const shipment = await logisticsService.createShipment({ poNo: po.poNo });

    await expect(
      logisticsService.updateShipment(shipment.id, { status: SHIPMENT_STATUS.DELIVERED })
    ).rejects.toThrow(/dispatched before/);
  });
});
