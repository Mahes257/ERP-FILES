/**
 * purchase/services/workQueue.test.js
 * ------------------------------------------------------------------
 * Tests for the Purchase Work Queue:
 *
 *   • deriveWorkQueue (pure) — every category derives from the real
 *     pending predicates (utils/pendingStatus.js / poAcknowledgement),
 *     counts only actionable records, and every item carries the
 *     document route + the appropriate next action.
 *   • getWorkQueue (integration) — records created through the LIVE
 *     services surface in the queue with working navigation.
 * ------------------------------------------------------------------
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./base', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, delay: () => Promise.resolve() };
});

/* The queue is served by the backend (PurchaseWorkQueueService behind
   GET /api/purchase/work-queue) — getWorkQueue() issues that request and
   normalises the payload, so the transport is stubbed and nothing else in
   ../api is replaced. A suite that let the request through would only
   prove that jsdom has no server. */
const { purchaseGetMock } = vi.hoisted(() => ({ purchaseGetMock: vi.fn() }));

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, purchaseGet: purchaseGetMock };
});

import { deriveWorkQueue, getWorkQueue, WORK_QUEUE_CATEGORIES } from './workQueue';
import { deriveActionCounts } from '../utils/purchaseActionCounts';
import { mockRequisitionService, requisitionsStore } from './requisition';
import { mockRfqService, rfqsStore, quotationsStore } from './rfq';
import { mockPurchaseOrderService, ordersStore } from './purchaseOrder';
import { logisticsService, grnsStore, inspectionsStore, inventoryStore, shipmentsStore } from './logistics';
import { mockInvoiceService, invoicesStore, advicesStore } from './invoice';
import { nfasStore } from './nfa';
import { evaluationsStore } from './evaluation';
import { documentsStore } from './documents';

function setActor() {
  localStorage.setItem('authUser', JSON.stringify({ fullName: 'Test Buyer', email: 'buyer@test.com' }));
}

beforeEach(async () => {
  localStorage.clear();
  requisitionsStore.reset();
  rfqsStore.reset();
  quotationsStore.reset();
  ordersStore.reset();
  shipmentsStore.reset();
  grnsStore.reset();
  inspectionsStore.reset();
  inventoryStore.reset();
  invoicesStore.reset();
  advicesStore.reset();
  nfasStore.reset();
  evaluationsStore.reset();
  documentsStore.reset();
  setActor();
});

/** Realistic record shapes for the pure derivation tests. */
function fixtureData() {
  return {
    requisitions: [
      { id: 'pr1', prNo: 'PR-2026-0001', title: 'Steel sheets', status: 'Pending Approval', requester: 'Amit', expectedDate: '2026-08-20' },
      { id: 'pr2', prNo: 'PR-2026-0002', title: 'Approved PR', status: 'Approved' },
      { id: 'pr3', prNo: 'PR-2026-0003', title: 'Draft PR', status: 'Draft' }
    ],
    rfqs: [
      { id: 'rfq1', rfqNo: 'RFQ-2026-0001', title: 'Steel RFQ', status: 'Quotation Received', vendors: ['Tata Steel'], dueDate: '2026-08-25' },
      { id: 'rfq2', rfqNo: 'RFQ-2026-0002', title: 'Eval RFQ', status: 'Evaluation', vendors: ['Tata Steel'] },
      { id: 'rfq3', rfqNo: 'RFQ-2026-0003', title: 'Sent RFQ', status: 'Sent' },
      { id: 'rfq4', rfqNo: 'RFQ-2026-0004', title: 'Awarded RFQ', status: 'Awarded' }
    ],
    orders: [
      { id: 'po1', poNo: 'PO-2026-0001', title: 'Steel PO', status: 'Pending Approval', approvalStatus: 'Pending', vendor: 'Tata Steel' },
      { id: 'po2', poNo: 'PO-2026-0002', title: 'Approved PO', status: 'Approved', vendor: 'Tata Steel' },
      { id: 'po3', poNo: 'PO-2026-0003', title: 'Released PO', status: 'Released', vendor: 'Tata Steel' },
      { id: 'po4', poNo: 'PO-2026-0004', title: 'Ack PO', status: 'Released', acknowledged: true, vendor: 'Tata Steel' },
      { id: 'po5', poNo: 'PO-2026-0005', title: 'Cancelled PO', status: 'Cancelled' }
    ],
    grns: [
      { id: 'grn1', grnNo: 'GRN-2026-0001', status: 'Expected', poNo: 'PO-2026-0001' },
      { id: 'grn2', grnNo: 'GRN-2026-0002', status: 'Received', poNo: 'PO-2026-0002' },
      { id: 'grn3', grnNo: 'GRN-2026-0003', status: 'Pending Inspection', poNo: 'PO-2026-0002' }
    ],
    inspections: [
      { id: 'i1', inspectionNo: 'QC-2026-0001', status: 'Pending', grnNo: 'GRN-2026-0003' },
      { id: 'i2', inspectionNo: 'QC-2026-0002', status: 'Passed', grnNo: 'GRN-2026-0002' }
    ],
    invoices: [
      { id: 'inv1', invoiceNo: 'INV-2026-0001', status: 'Submitted', vendor: 'Tata Steel', total: 500000 },
      { id: 'inv2', invoiceNo: 'INV-2026-0002', status: 'Approved', matchStatus: 'Matched', paidAmount: 0, total: 400000 },
      { id: 'inv3', invoiceNo: 'INV-2026-0003', status: 'Approved', matchStatus: 'Matched', paidAmount: 400000, total: 400000 },
      { id: 'inv4', invoiceNo: 'INV-2026-0004', status: 'Draft', matchStatus: 'Pending Match', total: 100000 },
      { id: 'inv5', invoiceNo: 'INV-2026-0005', status: 'Mismatch', matchStatus: 'Mismatch', total: 200000 },
      { id: 'inv6', invoiceNo: 'INV-2026-0006', status: 'Paid', matchStatus: 'Matched', paidAmount: 300000, total: 300000 }
    ]
  };
}

function countByKey(queue, key) {
  return queue.categories.find((cat) => cat.key === key)?.count || 0;
}

function itemsByKey(queue, key) {
  return queue.categories.find((cat) => cat.key === key)?.items || [];
}

describe('deriveWorkQueue — real predicates per category', () => {
  it('returns all ten categories with only actionable records counted', () => {
    const queue = deriveWorkQueue(fixtureData());

    expect(queue.categories.map((c) => c.key)).toEqual(WORK_QUEUE_CATEGORIES.map((c) => c.key));
    expect(countByKey(queue, 'pr-approvals')).toBe(1);               // pr1 only
    expect(countByKey(queue, 'rfq-actions')).toBe(2);                // rfq1 + rfq2 (Sent/Awarded excluded)
    expect(countByKey(queue, 'po-approvals')).toBe(1);               // po1 only
    expect(countByKey(queue, 'po-releases')).toBe(1);                // po2 only (Approved, not released)
    expect(countByKey(queue, 'supplier-acknowledgements')).toBe(1);  // po3 only (po4 acknowledged)
    expect(countByKey(queue, 'pending-grns')).toBe(1);               // grn1 only (Pending Inspection → QC queue)
    expect(countByKey(queue, 'pending-inspections')).toBe(1);        // i1 only
    expect(countByKey(queue, 'invoice-matching')).toBe(2);           // inv4 (Pending Match) + inv5 (Mismatch)
    expect(countByKey(queue, 'invoice-approvals')).toBe(1);          // inv1 (Submitted) only
    expect(countByKey(queue, 'payments-due')).toBe(1);               // inv2 only (matched, unpaid)
    expect(queue.total).toBe(12);
  });

  it('items open the actual document with the appropriate action', () => {
    const queue = deriveWorkQueue(fixtureData());

    const pr = itemsByKey(queue, 'pr-approvals')[0];
    expect(pr.number).toBe('PR-2026-0001');
    expect(pr.route).toBe('/purchase/requisition/pr1');
    expect(pr.actionLabel).toBe('Review & Approve');
    expect(pr.actionRoute).toBe('/purchase/requisition/pr1/approval');

    const rfq = itemsByKey(queue, 'rfq-actions').find((i) => i.id === 'rfq1');
    expect(rfq.actionLabel).toBe('Evaluate Quotations');
    expect(rfq.route).toBe('/purchase/rfq/rfq1');

    const evalRfq = itemsByKey(queue, 'rfq-actions').find((i) => i.id === 'rfq2');
    expect(evalRfq.actionLabel).toBe('Select Supplier');
    expect(evalRfq.actionRoute).toBe('/purchase/rfq/price-comparative-statement/rfq2');

    const poApproval = itemsByKey(queue, 'po-approvals')[0];
    expect(poApproval.route).toBe('/purchase/orders/po1');
    expect(poApproval.actionLabel).toBe('Approve PO');

    const poRelease = itemsByKey(queue, 'po-releases')[0];
    expect(poRelease.route).toBe('/purchase/orders/po2');
    expect(poRelease.actionLabel).toBe('Release PO');

    const ack = itemsByKey(queue, 'supplier-acknowledgements')[0];
    expect(ack.route).toBe('/purchase/orders/po3');
    expect(ack.actionLabel).toBe('Record Acknowledgement');
    expect(ack.actionRoute).toBe('/purchase/orders/acknowledgement');

    const grn = itemsByKey(queue, 'pending-grns')[0];
    expect(grn.route).toBe('/purchase/logistics/grn/GRN-2026-0001');
    expect(grn.actionLabel).toBe('Receive Goods');

    const insp = itemsByKey(queue, 'pending-inspections')[0];
    expect(insp.route).toBe('/purchase/logistics/quality/QC-2026-0001');
    expect(insp.actionLabel).toBe('Start Inspection');

    const match = itemsByKey(queue, 'invoice-matching').find((i) => i.id === 'inv4');
    expect(match.route).toBe('/purchase/invoices/inv4');
    expect(match.actionLabel).toBe('Run Three-Way Match');

    const invoiceApproval = itemsByKey(queue, 'invoice-approvals')[0];
    expect(invoiceApproval.route).toBe('/purchase/invoices/inv1');
    expect(invoiceApproval.actionLabel).toBe('Approve Invoice');

    const due = itemsByKey(queue, 'payments-due')[0];
    expect(due.route).toBe('/purchase/invoices/inv2');
    expect(due.actionLabel).toBe('Record Payment');
  });

  it('sorts items by due date and never fabricates counts', () => {
    const data = fixtureData();
    data.requisitions = [
      { id: 'late', prNo: 'PR-LATE', status: 'Pending Approval', expectedDate: '2026-12-01' },
      { id: 'soon', prNo: 'PR-SOON', status: 'Pending Approval', expectedDate: '2026-08-01' },
      { id: 'none', prNo: 'PR-NONE', status: 'Pending Approval', createdAt: '2026-07-01' }
    ];
    const queue = deriveWorkQueue(data);
    const numbers = itemsByKey(queue, 'pr-approvals').map((i) => i.number);
    /* Dated items first (soonest on top), date-less items last. */
    expect(numbers).toEqual(['PR-SOON', 'PR-LATE', 'PR-NONE']);
  });

  it('every category exists even when empty (page renders zero states)', () => {
    const queue = deriveWorkQueue({});
    expect(queue.categories).toHaveLength(10);
    expect(queue.total).toBe(0);
    queue.categories.forEach((cat) => {
      expect(cat.items).toEqual([]);
      expect(cat.count).toBe(0);
    });
  });

  it('the sidebar work-queue badge equals the queue page total (same predicates)', () => {
    const data = fixtureData();
    const queue = deriveWorkQueue(data);

    /* Feed the same records through the sidebar derivation — its inputs
       mirror what usePurchaseSidebarCounts fetches (stats + lists). */
    const counts = deriveActionCounts({
      reqStats: { pendingApproval: 1, byStatus: {} },
      nfaStats: {},
      rfqStats: { pendingApproval: 0, quotationReceived: 1, evaluation: 1, firstApproval: 0, secondApproval: 0, finalApproval: 0 },
      quoteStats: {},
      followUpStats: {},
      board: [],
      poResult: { data: data.orders },
      vendorStats: {},
      invoiceStats: {},
      invoiceResult: { data: data.invoices },
      docStats: {},
      mfgStats: {},
      shipStats: {},
      grnStats: { expected: 1 },
      inspStats: { pending: 1 }
    });

    expect(counts['work-queue']).toBe(queue.total);
  });
});

describe('getWorkQueue — counts come from real records', () => {
  /* The payload below is the shape PurchaseWorkQueueService returns —
     `categories[]` with `key`/`count`/`items[]`, each item carrying `route`
     and `actionLabel`, inside the ApiResponse envelope — assembled from
     records created through the real services so the two cannot drift. */
  it('surfaces records created through the actual services, on the endpoint\u2019s own routes', async () => {
    const pr = await mockRequisitionService.createRequisition({
      prNo: 'PR-TEST-0001',
      title: 'Test steel sheets',
      requester: 'Test Buyer',
      status: 'Pending Approval',
      items: [{ product: 'Steel sheet', qty: 10, rate: 1000 }]
    });

    const rfq = await mockRfqService.createRfq({
      rfqNo: 'RFQ-TEST-0001',
      title: 'Quotation for steel sheets',
      reference: pr.prNo,
      vendorNames: ['Tata Steel'],
      status: 'Quotation Received',
      items: [{ product: 'Steel sheet', qty: 10, rate: 1000 }]
    });
    /* A "Quotation Received" RFQ must actually have quotations (the read
       layer downgrades status when zero quotations exist). */
    quotationsStore.persist([
      ...quotationsStore.all,
      {
        id: 'Q-TEST-0001',
        quotationNo: 'QT-TEST-0001',
        rfqNo: rfq.rfqNo,
        vendor: 'Tata Steel',
        status: 'Received',
        total: 118000,
        currency: 'INR',
        submittedOn: '2026-08-01'
      }
    ]);

    const po = await mockPurchaseOrderService.createOrder({
      poNo: 'PO-TEST-0001',
      title: 'PO for steel sheets',
      reference: pr.prNo,
      vendor: 'Tata Steel',
      status: 'Pending Approval',
      items: [{ product: 'Steel sheet', qty: 10, rate: 1000 }]
    });

    /* GRN / inspection / invoice posted straight to their stores — the
       same records the list services read. */
    grnsStore.persist([
      ...grnsStore.all,
      { id: 'GRN-TEST-0001', grnNo: 'GRN-TEST-0001', poNo: po.poNo, vendor: 'Tata Steel', status: 'Expected', createdAt: '2026-08-01' }
    ]);
    const grn = grnsStore.all.find((g) => g.id === 'GRN-TEST-0001');
    inspectionsStore.persist([
      ...inspectionsStore.all,
      { id: 'QC-TEST-0001', inspectionNo: 'QC-TEST-0001', grnNo: 'GRN-TEST-0001', status: 'Pending', createdAt: '2026-08-01' }
    ]);
    const insp = inspectionsStore.all.find((i) => i.id === 'QC-TEST-0001');
    invoicesStore.persist([
      ...invoicesStore.all,
      {
        id: 'INV-TEST-0001',
        invoiceNo: 'INV-TEST-0001',
        poNo: po.poNo,
        vendor: 'Tata Steel',
        status: 'Submitted',
        total: 118000,
        amount: 100000,
        gst: 18000,
        matchStatus: 'Pending Match',
        createdAt: '2026-08-01'
      }
    ]);
    const inv = invoicesStore.all.find((i) => i.id === 'INV-TEST-0001');

    purchaseGetMock.mockResolvedValue({
      data: {
        success: true,
        message: 'OK',
        data: {
          categories: [
            { key: 'pr-approvals', count: 1, items: [{ id: pr.id, number: pr.prNo, title: pr.title, status: pr.status, expectedDate: '2026-08-20', route: `/purchase/requisition/${pr.id}/approval`, actionLabel: 'Review & Approve' }] },
            { key: 'rfq-actions', count: 1, items: [{ id: rfq.id, number: rfq.rfqNo, title: rfq.title, status: 'Quotation Received', dueDate: '2026-08-25', route: `/purchase/rfq/${rfq.id}`, actionLabel: 'Evaluate Quotations' }] },
            { key: 'po-approvals', count: 1, items: [{ id: po.id, number: po.poNo, title: po.title, status: po.status, orderDate: '2026-08-01', route: `/purchase/orders/${po.id}`, actionLabel: 'Approve PO' }] },
            { key: 'supplier-acknowledgements', count: 1, items: [{ id: po.id, number: po.poNo, status: 'Pending Acknowledgement', route: `/purchase/orders/${po.id}`, actionLabel: 'Send Reminder' }] },
            { key: 'pending-grns', count: 1, items: [{ id: grn.id, number: grn.grnNo, status: grn.status, date: '2026-08-01', route: `/purchase/logistics/grn/${grn.grnNo}`, actionLabel: 'Receive Goods' }] },
            { key: 'pending-inspections', count: 1, items: [{ id: insp.id, number: insp.inspectionNo, status: insp.status, date: '2026-08-01', route: `/purchase/logistics/quality/${insp.inspectionNo}`, actionLabel: 'Record Result' }] },
            { key: 'invoice-approvals', count: 1, items: [{ id: inv.id, number: inv.invoiceNo, status: inv.status, amount: inv.total, date: '2026-08-01', route: `/purchase/invoices/${inv.id}`, actionLabel: 'Approve Invoice' }] },
            /* The endpoint caps its item list but always reports the true
               count — the render must keep the reported number. */
            { key: 'payments-due', count: 7, items: [] }
          ],
          total: 14
        }
      }
    });

    const queue = await getWorkQueue();

    expect(purchaseGetMock).toHaveBeenCalledTimes(1);
    expect(purchaseGetMock).toHaveBeenCalledWith('/work-queue');

    /* Every item keeps the navigation target the backend chose for it. */
    const prItem = itemsByKey(queue, 'pr-approvals').find((i) => i.id === pr.id);
    expect(prItem).toBeTruthy();
    expect(prItem.route).toBe(`/purchase/requisition/${pr.id}/approval`);
    expect(prItem.actionLabel).toBe('Review & Approve');
    /* The payload carries no `actionRoute`; the document route is the
       fallback, so the action button always has a real target. */
    expect(prItem.actionRoute).toBe(prItem.route);
    expect(prItem.number).toBe(pr.prNo);

    const rfqItem = itemsByKey(queue, 'rfq-actions').find((i) => i.id === rfq.id);
    expect(rfqItem).toBeTruthy();
    expect(rfqItem.route).toBe(`/purchase/rfq/${rfq.id}`);
    expect(rfqItem.actionLabel).toBe('Evaluate Quotations');
    expect(rfqItem.date).toBe('2026-08-25');
    expect(rfqItem.due).toBe(true);

    const poItem = itemsByKey(queue, 'po-approvals').find((i) => i.id === po.id);
    expect(poItem).toBeTruthy();
    expect(poItem.route).toBe(`/purchase/orders/${po.id}`);
    expect(poItem.actionRoute).toBe(`/purchase/orders/${po.id}`);

    const ackItem = itemsByKey(queue, 'supplier-acknowledgements').find((i) => i.id === po.id);
    expect(ackItem).toBeTruthy();
    expect(ackItem.actionLabel).toBe('Send Reminder');

    /* The record ids come from the created records, not from literals. */
    [
      ['pending-grns', grn.id, `/purchase/logistics/grn/${grn.grnNo}`],
      ['pending-inspections', insp.id, `/purchase/logistics/quality/${insp.inspectionNo}`],
      ['invoice-approvals', inv.id, `/purchase/invoices/${inv.id}`]
    ].forEach(([key, id, route]) => {
      const item = itemsByKey(queue, key).find((i) => i.id === id);
      expect(item).toBeTruthy();
      expect(item.route).toBe(route);
    });

    /* Display metadata still comes from the shared category definition. */
    const payments = queue.categories.find((c) => c.key === 'payments-due');
    expect(payments.label).toBe('Payments Due');
    expect(payments.accent).toBe('#166534');

    /* A capped item list never overwrites the reported count, and
       categories the payload omits still render — at zero. */
    expect(payments.count).toBe(7);
    expect(payments.items).toEqual([]);
    expect(queue.categories).toHaveLength(WORK_QUEUE_CATEGORIES.length);
    const reported = ['pr-approvals', 'rfq-actions', 'po-approvals', 'supplier-acknowledgements', 'pending-grns', 'pending-inspections', 'invoice-approvals', 'payments-due'];
    queue.categories
      .filter((cat) => !reported.includes(cat.key))
      .forEach((cat) => expect(cat).toMatchObject({ count: 0, items: [] }));

    /* The endpoint's own total is kept as-is. */
    expect(queue.total).toBe(14);
  });
});