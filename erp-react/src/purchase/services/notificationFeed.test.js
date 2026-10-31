/**
 * purchase/services/notificationFeed.test.js
 * ------------------------------------------------------------------
 * Event-driven notification feed tests:
 *
 *   • Real workflow events (PO submit/approve/reject/release, invoice
 *     create/submit/approve, payment, three-way mismatch) create the
 *     matching notifications with real routes and document numbers
 *   • Read/unread state: markRead / markAllRead / unread counts
 *   • Payment Due / Payment Overdue are DERIVED only from real invoice
 *     due dates and outstanding balances — never fabricated; settled
 *     invoices drop their derived alerts
 *   • Escalation raises level + priority for overdue notifications
 *   • No workflow events → no notifications
 * ------------------------------------------------------------------
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PO_STATUS } from '../constants';

import { mockPurchaseOrderService, ordersStore } from './purchaseOrder';
import { logisticsService, grnsStore } from './logistics';
import { mockInvoiceService, invoicesStore } from './invoice';
import { vendorsStore } from './vendor';
import { settingsStore } from './settings';
import {
  notificationFeedService, notificationsStore,
  NOTIFICATION_TYPES
} from './notificationFeed';

/* Stub latency so every service call resolves instantly. */
vi.mock('./base', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, delay: () => Promise.resolve() };
});

function setActor() {
  localStorage.setItem('authUser', JSON.stringify({ fullName: 'Test Buyer', email: 'buyer@test.com' }));
}

async function seedVendor() {
  const { mockVendorService } = await import('./vendor');
  const v = await mockVendorService.createVendor({ name: 'Tata Steel Ltd' });
  await mockVendorService.setVendorStatus(v.id, 'Approved');
}

/** Creates a DRAFT PO (the normal create-then-submit flow). */
async function createDraftPo(vendor = 'Tata Steel Ltd') {
  return mockPurchaseOrderService.createOrder({
    title: 'Feed PO',
    vendor,
    reference: 'PR-FEED',
    status: PO_STATUS.DRAFT,
    items: [{ product: 'Widget A', hsn: '1111', uom: 'Nos', qty: 5, rate: 1000, gstRate: 0 }]
  });
}

/** Released PO → received GRN (matching quantities). */
async function createReceivedPo(vendor = 'Tata Steel Ltd', qty = 10, rate = 1000) {
  const po = await mockPurchaseOrderService.createOrder({
    title: 'Feed test PO',
    vendor,
    reference: 'PR-FEED',
    items: [{ product: 'Widget A', hsn: '1111', uom: 'Nos', qty, rate, gstRate: 0 }]
  });
  await mockPurchaseOrderService.approveOrder(po.id);
  await mockPurchaseOrderService.releaseOrder(po.id);
  const grn = await logisticsService.createGrn(po.poNo);
  await logisticsService.receiveGoods(grn.id);
  return { po, grn };
}

async function approveInvoice(invoiceId) {
  let approved = null;
  for (let guard = 0; guard < 12; guard += 1) {
    approved = await mockInvoiceService.approveInvoice(invoiceId);
    if (approved.status === 'Approved') break;
  }
  return approved;
}

beforeEach(async () => {
  localStorage.clear();
  ordersStore.reset();
  grnsStore.reset();
  invoicesStore.reset();
  notificationsStore.reset();
  vendorsStore.reset();
  settingsStore.reset();
  setActor();
  await seedVendor();
});

describe('workflow-event notifications', () => {
  it('emits nothing before any workflow event', async () => {
    const list = await notificationFeedService.getNotifications();
    expect(list).toEqual([]);
    expect(await notificationFeedService.getUnreadCount()).toBe(0);
  });

  it('PO submit → Pending Approval with a real route and number', async () => {
    const po = await createDraftPo();
    await mockPurchaseOrderService.submitOrder(po.id);

    const list = await notificationFeedService.getNotifications({ type: NOTIFICATION_TYPES.PENDING_APPROVAL });
    const n = list.find((x) => x.documentNo === po.poNo);
    expect(n).toBeTruthy();
    expect(n.route).toBe(`/purchase/orders/${po.id}`);
    expect(n.priority).toBe('medium');
    expect(n.status).toBe('unread');
  });

  it('PO approve / reject / release emit their workflow notifications', async () => {
    const po = await createDraftPo();
    await mockPurchaseOrderService.submitOrder(po.id);
    await mockPurchaseOrderService.approveOrder(po.id);

    let list = await notificationFeedService.getNotifications({ type: NOTIFICATION_TYPES.PO_APPROVED });
    expect(list.some((n) => n.documentNo === po.poNo)).toBe(true);

    /* Release → Released + Acknowledgement Pending */
    await mockPurchaseOrderService.releaseOrder(po.id);
    list = await notificationFeedService.getNotifications({ type: NOTIFICATION_TYPES.PO_RELEASED });
    expect(list.some((n) => n.documentNo === po.poNo)).toBe(true);
    list = await notificationFeedService.getNotifications({ type: NOTIFICATION_TYPES.ACK_PENDING });
    expect(list.some((n) => n.documentNo === po.poNo)).toBe(true);

    /* Reject a second PO → high priority */
    const po2 = await createDraftPo();
    await mockPurchaseOrderService.submitOrder(po2.id);
    await mockPurchaseOrderService.rejectOrder(po2.id);
    list = await notificationFeedService.getNotifications({ type: NOTIFICATION_TYPES.PO_REJECTED });
    const rejected = list.find((n) => n.documentNo === po2.poNo);
    expect(rejected).toBeTruthy();
    expect(rejected.priority).toBe('high');
  });

  it('invoice lifecycle emits Created, Pending Approval, Approval and Payment Completed', async () => {
    const { po } = await createReceivedPo();
    const invoice = await mockInvoiceService.createInvoice({
      poNo: po.poNo,
      vendor: 'Tata Steel Ltd',
      items: [{ product: 'Widget A', hsn: '1111', uom: 'Nos', qty: 10, rate: 1000, gstRate: 0 }]
    });

    let list = await notificationFeedService.getNotifications({ type: NOTIFICATION_TYPES.INVOICE_CREATED });
    expect(list.some((n) => n.documentNo === invoice.invoiceNo)).toBe(true);

    await mockInvoiceService.submitInvoice(invoice.id);
    list = await notificationFeedService.getNotifications({ type: NOTIFICATION_TYPES.PENDING_APPROVAL });
    expect(list.some((n) => n.documentNo === invoice.invoiceNo)).toBe(true);

    await approveInvoice(invoice.id);
    list = await notificationFeedService.getNotifications({ type: NOTIFICATION_TYPES.INVOICE_APPROVAL });
    expect(list.some((n) => n.documentNo === invoice.invoiceNo)).toBe(true);

    await mockInvoiceService.recordPayment(invoice.id, { full: true, method: 'Bank Transfer' });
    list = await notificationFeedService.getNotifications({ type: NOTIFICATION_TYPES.PAYMENT_COMPLETED });
    expect(list.some((n) => n.documentNo === invoice.invoiceNo)).toBe(true);
  });

  it('a three-way mismatch blocks approval and emits Invoice Mismatch', async () => {
    const { po } = await createReceivedPo('Tata Steel Ltd', 10, 1000);
    /* Invoice for 15 units against 10 received → mismatch. */
    const invoice = await mockInvoiceService.createInvoice({
      poNo: po.poNo,
      vendor: 'Tata Steel Ltd',
      items: [{ product: 'Widget A', hsn: '1111', uom: 'Nos', qty: 15, rate: 1000, gstRate: 0 }]
    });
    await mockInvoiceService.submitInvoice(invoice.id);
    await expect(approveInvoice(invoice.id)).rejects.toThrow();

    const list = await notificationFeedService.getNotifications({ type: NOTIFICATION_TYPES.INVOICE_MISMATCH });
    const n = list.find((x) => x.documentNo === invoice.invoiceNo);
    expect(n).toBeTruthy();
    expect(n.priority).toBe('high');
    expect(n.route).toBe(`/purchase/invoices/${invoice.id}`);
  });

  it('logistics events emit Shipment, GRN and Inspection', async () => {
    const { po } = await createReceivedPo();

    const shipment = await logisticsService.createShipment({
      poNo: po.poNo,
      carrier: 'Blue Dart',
      mode: 'Road'
    });
    let list = await notificationFeedService.getNotifications({ type: NOTIFICATION_TYPES.SHIPMENT });
    expect(list.some((n) => n.documentNo === shipment.shipmentNo)).toBe(true);

    list = await notificationFeedService.getNotifications({ type: NOTIFICATION_TYPES.GRN });
    expect(list.length).toBeGreaterThan(0);
    list = await notificationFeedService.getNotifications({ type: NOTIFICATION_TYPES.INSPECTION });
    expect(list.length).toBeGreaterThan(0);
  });
});

describe('read / unread state', () => {
  it('markRead and markAllRead update status and counts', async () => {
    const po = await createDraftPo();
    await mockPurchaseOrderService.submitOrder(po.id);
    await mockPurchaseOrderService.approveOrder(po.id);

    const unreadBefore = await notificationFeedService.getUnreadCount();
    expect(unreadBefore).toBeGreaterThan(0);

    const all = await notificationFeedService.getNotifications();
    const target = all[0];
    await notificationFeedService.markRead(target.id);
    expect(await notificationFeedService.getUnreadCount()).toBe(unreadBefore - 1);
    const after = await notificationFeedService.getNotifications();
    expect(after.find((n) => n.id === target.id).status).toBe('read');

    /* markAllRead returns the total read count after the sweep. */
    const marked = await notificationFeedService.markAllRead();
    expect(marked).toBe(unreadBefore);
    expect(await notificationFeedService.getUnreadCount()).toBe(0);
  });
});

describe('derived Payment Due / Payment Overdue + escalation', () => {
  async function createInvoiceWithDueDate(dueDate, amount = 10000) {
    const { po } = await createReceivedPo();
    const invoice = await mockInvoiceService.createInvoice({
      poNo: po.poNo,
      vendor: 'Tata Steel Ltd',
      dueDate,
      items: [{ product: 'Widget A', hsn: '1111', uom: 'Nos', qty: 10, rate: amount / 10, gstRate: 0 }]
    });
    await mockInvoiceService.submitInvoice(invoice.id);
    await approveInvoice(invoice.id);
    return invoice;
  }

  it('derives Payment Overdue only from a real past-due invoice', async () => {
    await createInvoiceWithDueDate('2020-01-01');
    const feed = await notificationFeedService.getFeed({ limit: 100 });
    const overdue = feed.notifications.find(
      (n) => n.type === NOTIFICATION_TYPES.PAYMENT_OVERDUE
    );
    expect(overdue).toBeTruthy();
    expect(overdue.priority).toBe('high');
    expect(overdue.dueDate).toBe('2020-01-01');
    expect(overdue.route).toMatch(/^\/purchase\/invoices\//);
  });

  it('derives Payment Due for invoices due within the window', async () => {
    const soon = new Date();
    soon.setDate(soon.getDate() + 3);
    const dueDate = soon.toISOString().slice(0, 10);
    await createInvoiceWithDueDate(dueDate);
    const feed = await notificationFeedService.getFeed({ limit: 100 });
    const due = feed.notifications.find((n) => n.type === NOTIFICATION_TYPES.PAYMENT_DUE);
    expect(due).toBeTruthy();
    expect(due.priority).toBe('medium');
    expect(due.dueDate).toBe(dueDate);
  });

  it('removes derived alerts once the invoice is settled', async () => {
    const invoice = await createInvoiceWithDueDate('2020-01-01');
    let feed = await notificationFeedService.getFeed({ limit: 100 });
    expect(feed.notifications.some((n) => n.type === NOTIFICATION_TYPES.PAYMENT_OVERDUE)).toBe(true);

    await mockInvoiceService.recordPayment(invoice.id, { full: true, method: 'Bank Transfer' });
    feed = await notificationFeedService.getFeed({ limit: 100 });
    expect(feed.notifications.some((n) => n.type === NOTIFICATION_TYPES.PAYMENT_OVERDUE && n.documentNo === invoice.invoiceNo)).toBe(false);
  });

  it('escalation raises level and priority for overdue payment alerts', async () => {
    await createInvoiceWithDueDate('2020-01-01');
    const feed = await notificationFeedService.getFeed({ limit: 100 });
    const overdue = feed.notifications.find((n) => n.type === NOTIFICATION_TYPES.PAYMENT_OVERDUE);
    expect(overdue).toBeTruthy();
    expect(overdue.escalationLevel).toBeGreaterThanOrEqual(1);
    expect(overdue.priority).toBe('high');
  });
});