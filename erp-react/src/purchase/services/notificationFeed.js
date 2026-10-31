/**
 * purchase/services/notificationFeed.js
 * ------------------------------------------------------------------
 * Event-driven notification feed for the Purchase module.
 *
 * Notifications are created ONLY from real workflow events — the
 * business services call `notifyWorkflowEvent(...)` at the moment a
 * document changes state (PO approved, invoice created, payment
 * recorded, …). Two notification types (Payment Due / Payment
 * Overdue) are DERIVED from real invoice due dates and outstanding
 * balances; a derived notification is removed the moment the invoice
 * is settled. Nothing here invents a notification.
 *
 * Every notification carries:
 *   · type           — one of the NOTIFICATION_TYPES below
 *   · priority       — high / medium / low
 *   · status         — unread | read
 *   · dueDate        — when action is time-boxed (derived from the
 *                      underlying document)
 *   · escalationLevel — 0 | 1 | 2 (raised by escalate() when a due
 *                      date passes)
 *   · route          — a REAL record route; opening the notification
 *                      navigates there
 *   · documentNo + related — the purchase document that produced it
 *
 * The feed is a normal service facade (`notificationFeedService`) with
 * the same local/API contract as every other Purchase service.
 * ------------------------------------------------------------------
 */
import { clone, createCollection, delay, storageKeys, todayLocal } from './base';

export const NOTIFICATION_TYPES = Object.freeze({
  PENDING_APPROVAL: 'Pending Approval',
  PO_APPROVED: 'PO Approved',
  PO_REJECTED: 'PO Rejected',
  PO_RELEASED: 'PO Released',
  ACK_PENDING: 'Acknowledgement Pending',
  SHIPMENT: 'Shipment',
  GRN: 'GRN',
  INSPECTION: 'Inspection',
  INVOICE_CREATED: 'Invoice Created',
  INVOICE_MISMATCH: 'Invoice Mismatch',
  INVOICE_APPROVAL: 'Invoice Approval',
  PAYMENT_DUE: 'Payment Due',
  PAYMENT_OVERDUE: 'Payment Overdue',
  PAYMENT_COMPLETED: 'Payment Completed'
});

/** Default priority per type (real events only). */
export const NOTIFICATION_PRIORITY = Object.freeze({
  [NOTIFICATION_TYPES.PENDING_APPROVAL]: 'medium',
  [NOTIFICATION_TYPES.PO_APPROVED]: 'medium',
  [NOTIFICATION_TYPES.PO_REJECTED]: 'high',
  [NOTIFICATION_TYPES.PO_RELEASED]: 'medium',
  [NOTIFICATION_TYPES.ACK_PENDING]: 'medium',
  [NOTIFICATION_TYPES.SHIPMENT]: 'low',
  [NOTIFICATION_TYPES.GRN]: 'medium',
  [NOTIFICATION_TYPES.INSPECTION]: 'low',
  [NOTIFICATION_TYPES.INVOICE_CREATED]: 'medium',
  [NOTIFICATION_TYPES.INVOICE_MISMATCH]: 'high',
  [NOTIFICATION_TYPES.INVOICE_APPROVAL]: 'medium',
  [NOTIFICATION_TYPES.PAYMENT_DUE]: 'medium',
  [NOTIFICATION_TYPES.PAYMENT_OVERDUE]: 'high',
  [NOTIFICATION_TYPES.PAYMENT_COMPLETED]: 'medium'
});

/** How many days ahead an invoice counts as "Payment Due". */
export const PAYMENT_DUE_WINDOW_DAYS = 7;

function notificationSeed() {
  return [];
}

/** Lazy, localStorage-backed notification collection. */
export const notificationsStore = createCollection(storageKeys.notifications, notificationSeed);

let idCounter = 1;
function nextNotificationId() {
  idCounter += 1;
  return `NTF-${Date.now().toString(36).toUpperCase()}-${idCounter}`;
}

function normalizeType(type) {
  return Object.values(NOTIFICATION_TYPES).includes(type) ? type : 'Pending Approval';
}

function nowIso() {
  return new Date().toISOString();
}

/** Days between two YYYY-MM-DD strings (positive when `date` is past). */
export function daysPast(dateStr, from = todayLocal()) {
  if (!dateStr) return 0;
  const d = new Date(String(dateStr).slice(0, 10)).getTime();
  const f = new Date(String(from).slice(0, 10)).getTime();
  if (Number.isNaN(d) || Number.isNaN(f)) return 0;
  return Math.max(0, Math.round((f - d) / 86400000));
}

export const notificationFeedService = {
  /**
   * Emits one notification from a real workflow event.
   * Never throws into the caller — a failed write is logged and
   * skipped so business operations are never blocked by the feed.
   */
  async emit({
    type = '',
    title = '',
    message = '',
    priority,
    route = '',
    documentNo = '',
    dueDate = '',
    related = {},
    sourceEvent = ''
  } = {}) {
    await delay();
    const normalizedType = normalizeType(type);
    const record = {
      id: nextNotificationId(),
      type: normalizedType,
      title: title || normalizedType,
      message: String(message || '').trim(),
      priority: priority || NOTIFICATION_PRIORITY[normalizedType] || 'medium',
      status: 'unread',
      createdAt: nowIso(),
      readAt: '',
      dueDate: dueDate || '',
      escalationLevel: 0,
      escalatedAt: '',
      route: route || '',
      documentNo: String(documentNo || ''),
      related: related || {},
      sourceEvent: String(sourceEvent || ''),
      derivedKey: '' /* only derived notifications set this */
    };
    const all = [...notificationsStore.all, record];
    notificationsStore.persist(all);
    return clone(record);
  },

  async getNotifications({ limit = 50, type = '', unreadOnly = false } = {}) {
    await delay();
    let list = notificationsStore.all;
    if (type) list = list.filter((n) => n.type === type);
    if (unreadOnly) list = list.filter((n) => n.status === 'unread');
    list = [...list].sort((a, b) => {
      /* Unread first, then newest first. */
      if (a.status !== b.status) return a.status === 'unread' ? -1 : 1;
      return String(b.createdAt).localeCompare(String(a.createdAt));
    });
    return clone(list.slice(0, limit));
  },

  async getUnreadCount() {
    return notificationsStore.all.filter((n) => n.status === 'unread').length;
  },

  async markRead(id) {
    await delay();
    const all = notificationsStore.all.map((n) =>
      n.id === id && n.status !== 'read'
        ? { ...n, status: 'read', readAt: nowIso() }
        : n
    );
    notificationsStore.persist(all);
    return all.find((n) => n.id === id) || null;
  },

  async markAllRead() {
    await delay();
    const all = notificationsStore.all.map((n) =>
      n.status === 'unread' ? { ...n, status: 'read', readAt: nowIso() } : n
    );
    notificationsStore.persist(all);
    return all.filter((n) => n.status === 'read').length;
  },

  /**
   * Derives Payment Due / Payment Overdue notifications from REAL
   * invoice records: an invoice with an outstanding balance and a due
   * date. Due-within-window → "Payment Due" (medium). Past due →
   * "Payment Overdue" (high). When the invoice settles, its derived
   * notifications are removed — the feed never carries stale debt.
   */
  async refreshDerived() {
    await delay();
    const { invoicesStore } = await import('./invoice');
    const { effectiveOutstanding } = await import('../utils/adjustmentNotes');
    const today = todayLocal();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + PAYMENT_DUE_WINDOW_DAYS);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    const keepDerived = new Set();
    const derived = [];

    (invoicesStore.all || []).forEach((inv) => {
      if (!inv || !inv.dueDate) return;
      const outstanding = effectiveOutstanding(inv);
      if (outstanding <= 0.005) return; // settled — no derived alert
      const isOverdue = String(inv.dueDate) < today;
      if (isOverdue) {
        const days = daysPast(inv.dueDate, today);
        keepDerived.add(`payment-overdue:${inv.invoiceNo}`);
        derived.push({
          derivedKey: `payment-overdue:${inv.invoiceNo}`,
          type: NOTIFICATION_TYPES.PAYMENT_OVERDUE,
          title: `Payment overdue — ${inv.invoiceNo}`,
          message: `${inv.vendor || 'Vendor'} invoice ${inv.invoiceNo} is ${days} day${days !== 1 ? 's' : ''} past due (${inv.dueDate}) with ${formatAmount(outstanding)} outstanding.`,
          priority: 'high',
          dueDate: inv.dueDate,
          route: `/purchase/invoices/${inv.id}`,
          documentNo: inv.invoiceNo,
          related: { type: 'invoice', id: inv.id, vendor: inv.vendor || '', poNo: inv.poNo || '' },
          sourceEvent: 'refreshDerived'
        });
      } else if (String(inv.dueDate) <= cutoffStr) {
        keepDerived.add(`payment-due:${inv.invoiceNo}`);
        derived.push({
          derivedKey: `payment-due:${inv.invoiceNo}`,
          type: NOTIFICATION_TYPES.PAYMENT_DUE,
          title: `Payment due soon — ${inv.invoiceNo}`,
          message: `${inv.vendor || 'Vendor'} invoice ${inv.invoiceNo} is due on ${inv.dueDate} with ${formatAmount(outstanding)} outstanding.`,
          priority: 'medium',
          dueDate: inv.dueDate,
          route: `/purchase/invoices/${inv.id}`,
          documentNo: inv.invoiceNo,
          related: { type: 'invoice', id: inv.id, vendor: inv.vendor || '', poNo: inv.poNo || '' },
          sourceEvent: 'refreshDerived'
        });
      }
    });

    /* Upsert derived notifications; drop ones that no longer apply. */
    const all = notificationsStore.all;
    const next = all.filter((n) => {
      if (!n.derivedKey) return true;
      return keepDerived.has(n.derivedKey);
    });
    derived.forEach((spec) => {
      const existingIndex = next.findIndex((n) => n.derivedKey === spec.derivedKey);
      const record = {
        id: existingIndex >= 0 ? next[existingIndex].id : nextNotificationId(),
        status: existingIndex >= 0 ? next[existingIndex].status : 'unread',
        readAt: existingIndex >= 0 ? next[existingIndex].readAt : '',
        escalationLevel: existingIndex >= 0 ? next[existingIndex].escalationLevel : 0,
        escalatedAt: existingIndex >= 0 ? next[existingIndex].escalatedAt : '',
        createdAt: existingIndex >= 0 ? next[existingIndex].createdAt : nowIso(),
        derivedKey: spec.derivedKey,
        type: spec.type,
        title: spec.title,
        message: spec.message,
        priority: spec.priority,
        dueDate: spec.dueDate,
        route: spec.route,
        documentNo: spec.documentNo,
        related: spec.related,
        sourceEvent: spec.sourceEvent
      };
      if (existingIndex >= 0) next[existingIndex] = record;
      else next.push(record);
    });
    notificationsStore.persist(next);
    return clone(next);
  },

  /**
   * Escalates notifications whose due date has passed: Payment
   * Overdue notifications climb one escalation level per 7 days past
   * due (max 2) and are always high priority; any other unread
   * notification past its due date is bumped to high priority.
   */
  async escalate() {
    await delay();
    const today = todayLocal();
    const all = notificationsStore.all.map((n) => {
      if (!n.dueDate || String(n.dueDate) >= today) return n;
      const days = daysPast(n.dueDate, today);
      let level = n.escalationLevel || 0;
      let priority = n.priority;
      if (n.type === NOTIFICATION_TYPES.PAYMENT_OVERDUE) {
        level = days > 7 ? 2 : 1;
        priority = 'high';
      } else if (n.status === 'unread') {
        priority = 'high';
      }
      if (level === n.escalationLevel && priority === n.priority) return n;
      return { ...n, escalationLevel: level, escalatedAt: nowIso(), priority };
    });
    notificationsStore.persist(all);
    return clone(all);
  },

  /** Full feed for the bell: derived refresh + escalation + list. */
  async getFeed({ limit = 30 } = {}) {
    await this.refreshDerived();
    await this.escalate();
    const list = await this.getNotifications({ limit });
    const unread = list.filter((n) => n.status === 'unread').length;
    return { notifications: list, unread };
  }
};

/** Local currency formatting for messages (kept dependency-free). */
export function formatAmount(value) {
  const n = Number(value) || 0;
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Never-throw emitter for business services. Workflow methods call
 * this after a real state change; failures are swallowed so the
 * business operation is never blocked by the notification feed.
 */
export async function notifyWorkflowEvent(spec) {
  try {
    return await notificationFeedService.emit(spec);
  } catch {
    return null;
  }
}