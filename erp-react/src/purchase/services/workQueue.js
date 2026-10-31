/**
 * purchase/services/workQueue.js
 * ------------------------------------------------------------------
 * Purchase Work Queue — the actionable pending-work view of the entire
 * procurement workflow. Every item is derived from REAL store records
 * (never hardcoded / synthetic), using the SAME shared predicates the
 * sidebar badges and table pending dots use (utils/pendingStatus.js and
 * utils/poAcknowledgement.js), so a queue item can never disagree with
 * a sidebar count or a row dot.
 *
 * Categories (each maps a real record set → pending items):
 *   PR Approvals          — requisitions in Pending Approval
 *   RFQ Actions           — RFQs in a pending sourcing state
 *   PO Approvals          — POs awaiting the approval decision
 *   PO Releases           — approved POs not yet released to supplier
 *   Supplier Acks         — released POs still awaiting acknowledgement
 *   Pending GRNs          — GRNs awaiting goods receipt
 *   Pending Inspections   — inspections awaiting the pass/fail decision
 *   Invoice Matching      — invoices awaiting the 3-way match
 *   Invoice Approvals     — submitted invoices awaiting approval
 *   Payments Due          — matched invoices awaiting payment
 *
 * Every item carries:
 *   · route       — opens the actual document,
 *   · actionLabel — the next action to take,
 *   · actionRoute — the page where that action is performed (falls back
 *                   to the document itself when the action lives on the
 *                   detail page).
 *
 * deriveWorkQueue(items) is PURE (safe to unit test with any input);
 * getWorkQueue() fetches the live lists and delegates to it.
 * ------------------------------------------------------------------
 */
import { PO_STATUS, PR_STATUS, RFQ_STATUS } from '../constants';
import { isPoReleased } from '../constants/poStage';
import { GRN_STATUS, INSPECTION_STATUS } from './logistics';
import {
  isAckPending,
  isInvoicePending,
  isMatchPending,
  isPaymentPending,
  isPoPending,
  RFQ_PENDING_STATUSES
} from '../utils/pendingStatus';
import { formatDate } from '../utils/helpers';
import { purchaseGet } from '../api';
import { unwrapResponse } from './api-client';

/* ------------------------------------------------------------------ */
/*  Category metadata                                                 */
/* ------------------------------------------------------------------ */

export const WORK_QUEUE_CATEGORIES = [
  { key: 'pr-approvals', label: 'PR Approvals', hint: 'Requisitions awaiting the approval decision', accent: '#D97706' },
  { key: 'rfq-actions', label: 'RFQ Actions', hint: 'Sourcing steps awaiting your input', accent: '#2563EB' },
  { key: 'po-approvals', label: 'PO Approvals', hint: 'Purchase orders awaiting approval', accent: '#7C3AED' },
  { key: 'po-releases', label: 'PO Releases', hint: 'Approved orders not yet released to suppliers', accent: '#0284C7' },
  { key: 'supplier-acknowledgements', label: 'Supplier Acknowledgements', hint: 'Released orders awaiting supplier confirmation', accent: '#0E7490' },
  { key: 'pending-grns', label: 'Pending GRNs', hint: 'Expected goods receipts awaiting receipt', accent: '#16A34A' },
  { key: 'pending-inspections', label: 'Pending Inspections', hint: 'Quality inspections awaiting a decision', accent: '#0891B2' },
  { key: 'invoice-matching', label: 'Invoice Matching', hint: 'Invoices awaiting the three-way match', accent: '#DC2626' },
  { key: 'invoice-approvals', label: 'Invoice Approvals', hint: 'Submitted invoices awaiting approval', accent: '#EA580C' },
  { key: 'payments-due', label: 'Payments Due', hint: 'Matched invoices awaiting payment', accent: '#166534' }
];

/* ------------------------------------------------------------------ */
/*  Item builders                                                     */
/* ------------------------------------------------------------------ */

/** Primary sort/display date for a record — due first, then created. */
function dateOf(record, priorityKeys = ['expectedDate', 'dueDate', 'invoiceDate', 'paidOn']) {
  for (const key of priorityKeys) {
    if (record[key]) return String(record[key]);
  }
  return record.createdAt || record.submittedOn || record.orderDate || record.receivedOn || '';
}

function item(key, record, fields) {
  const date = dateOf(record, fields.dateKeys);
  return {
    category: key,
    id: record.id,
    number: fields.number,
    title: fields.title || fields.number,
    vendor: fields.vendor || '',
    status: fields.status || '',
    matchStatus: fields.matchStatus || '',
    priority: fields.priority || '',
    amount: fields.amount ?? '',
    /* `due` = a real due/expected date exists — such items sort before
       records without one. */
    due: Boolean(date && date !== record.createdAt && date !== record.submittedOn),
    date,
    dateLabel: formatDate(date) || '—',
    route: fields.route,
    actionLabel: fields.actionLabel,
    actionRoute: fields.actionRoute || fields.route,
    raw: record
  };
}

/** Requisitions pending approval — the exact Pending Approval set. */
function prItems(requisitions) {
  return (requisitions || [])
    .filter((pr) => pr.status === PR_STATUS.PENDING_APPROVAL)
    .map((pr) => item(
      'pr-approvals',
      pr,
      {
        number: pr.prNo,
        title: pr.title || pr.prNo,
        vendor: pr.vendor || pr.requester || '',
        status: pr.status,
        priority: pr.priority,
        dateKeys: ['expectedDate', 'dueDate'],
        route: `/purchase/requisition/${pr.id}`,
        actionLabel: 'Review & Approve',
        actionRoute: `/purchase/requisition/${pr.id}/approval`
      }
    ));
}

/** RFQs needing a sourcing action (the RFQ_PENDING_STATUSES set). */
function rfqItems(rfqs) {
  return (rfqs || [])
    .filter((rfq) => RFQ_PENDING_STATUSES.includes(rfq.status))
    .map((rfq) => {
      const action =
        rfq.status === RFQ_STATUS.EVALUATION
          ? { label: 'Select Supplier', route: `/purchase/rfq/price-comparative-statement/${rfq.id}` }
          : rfq.status === RFQ_STATUS.QUOTATION_RECEIVED
            ? { label: 'Evaluate Quotations', route: `/purchase/rfq/${rfq.id}` }
            : { label: 'Approve RFQ', route: `/purchase/rfq/${rfq.id}` };
      return item(
        'rfq-actions',
        rfq,
        {
          number: rfq.rfqNo,
          title: rfq.title || rfq.rfqNo,
          vendor: (rfq.vendors || []).join(', '),
          status: rfq.status,
          priority: rfq.priority,
          dateKeys: ['dueDate', 'closingDate'],
          route: `/purchase/rfq/${rfq.id}`,
          actionLabel: action.label,
          actionRoute: action.route
        }
      );
    });
}

/** POs awaiting the approval decision (isPoPending). */
function poApprovalItems(orders) {
  return (orders || [])
    .filter((po) => isPoPending(po))
    .map((po) => item(
      'po-approvals',
      po,
      {
        number: po.poNo,
        title: po.title || po.poNo,
        vendor: po.vendor,
        status: po.status,
        amount: po.totals?.total ?? po.amount ?? '',
        dateKeys: ['expectedDate', 'orderDate'],
        route: `/purchase/orders/${po.id}`,
        actionLabel: 'Approve PO'
      }
    ));
}

/** Approved POs that have not been released to the supplier yet. */
function poReleaseItems(orders) {
  return (orders || [])
    .filter((po) => po.status === PO_STATUS.APPROVED)
    .map((po) => item(
      'po-releases',
      po,
      {
        number: po.poNo,
        title: po.title || po.poNo,
        vendor: po.vendor,
        status: po.status,
        amount: po.totals?.total ?? po.amount ?? '',
        dateKeys: ['expectedDate', 'orderDate'],
        route: `/purchase/orders/${po.id}`,
        actionLabel: 'Release PO'
      }
    ));
}

/** Released POs still awaiting supplier acknowledgement — the same
 *  released-only gate the sidebar badge uses (isPoReleased first, then
 *  the derived acknowledgement state). */
function acknowledgementItems(orders) {
  return (orders || [])
    .filter((po) => isPoReleased(po.status) && isAckPending(po))
    .map((po) => item(
      'supplier-acknowledgements',
      po,
      {
        number: po.poNo,
        title: po.title || po.poNo,
        vendor: po.vendor,
        status: 'Pending Acknowledgement',
        amount: po.totals?.total ?? po.amount ?? '',
        dateKeys: ['expectedDate', 'orderDate'],
        route: `/purchase/orders/${po.id}`,
        actionLabel: 'Record Acknowledgement',
        actionRoute: '/purchase/orders/acknowledgement'
      }
    ));
}

/** GRNs awaiting goods receipt (Expected only — Pending Inspection is
 *  handled by the inspection queue, exactly like the sidebar badge). */
function grnItems(grns) {
  return (grns || [])
    .filter((grn) => grn.status === GRN_STATUS.EXPECTED)
    .map((grn) => item(
      'pending-grns',
      grn,
      {
        number: grn.grnNo,
        title: `GRN for PO ${grn.poNo || '—'}`,
        vendor: grn.vendor,
        status: grn.status,
        dateKeys: ['expectedDate', 'receivedOn'],
        route: `/purchase/logistics/grn/${grn.grnNo}`,
        actionLabel: 'Receive Goods'
      }
    ));
}

/** Inspections awaiting the pass/fail decision (status Pending only —
 *  mirrors getInspectionStats().pending used by the sidebar badge). */
function inspectionItems(inspections) {
  return (inspections || [])
    .filter((insp) => insp.status === INSPECTION_STATUS.PENDING)
    .map((insp) => item(
      'pending-inspections',
      insp,
      {
        number: insp.inspectionNo,
        title: `Inspection for GRN ${insp.grnNo || '—'}`,
        vendor: insp.vendor || '',
        status: insp.status,
        dateKeys: ['createdAt', 'receivedOn'],
        route: `/purchase/logistics/quality/${insp.inspectionNo}`,
        actionLabel: 'Start Inspection'
      }
    ));
}

/** Invoices awaiting the three-way match (Pending Match / Mismatch). */
function matchingItems(invoices) {
  return (invoices || [])
    .filter((inv) => isMatchPending(inv))
    .map((inv) => item(
      'invoice-matching',
      inv,
      {
        number: inv.invoiceNo,
        title: inv.vendor ? `Invoice from ${inv.vendor}` : inv.invoiceNo,
        vendor: inv.vendor,
        status: inv.matchStatus || inv.status,
        matchStatus: inv.matchStatus || inv.status,
        amount: inv.total ?? inv.amount ?? '',
        dateKeys: ['invoiceDate', 'dueDate'],
        route: `/purchase/invoices/${inv.id}`,
        actionLabel: 'Run Three-Way Match'
      }
    ));
}

/** Submitted invoices awaiting approval. */
function invoiceApprovalItems(invoices) {
  return (invoices || [])
    .filter((inv) => isInvoicePending(inv))
    .map((inv) => item(
      'invoice-approvals',
      inv,
      {
        number: inv.invoiceNo,
        title: inv.vendor ? `Invoice from ${inv.vendor}` : inv.invoiceNo,
        vendor: inv.vendor,
        status: inv.status,
        amount: inv.total ?? inv.amount ?? '',
        dateKeys: ['invoiceDate', 'dueDate'],
        route: `/purchase/invoices/${inv.id}`,
        actionLabel: 'Approve Invoice'
      }
    ));
}

/** Matched-but-unpaid invoices awaiting payment (isPaymentPending). */
function paymentDueItems(invoices) {
  return (invoices || [])
    .filter((inv) => isPaymentPending(inv))
    .map((inv) => item(
      'payments-due',
      inv,
      {
        number: inv.invoiceNo,
        title: inv.vendor ? `Invoice from ${inv.vendor}` : inv.invoiceNo,
        vendor: inv.vendor,
        status: inv.status,
        amount: inv.netPayable ?? inv.total ?? inv.amount ?? '',
        dateKeys: ['dueDate', 'invoiceDate'],
        route: `/purchase/invoices/${inv.id}`,
        actionLabel: 'Record Payment'
      }
    ));
}

/* ------------------------------------------------------------------ */
/*  Pure derivation                                                   */
/* ------------------------------------------------------------------ */

/**
 * Derives the complete work queue from real record lists.
 *
 * @param {Object} data - { requisitions, rfqs, orders, grns,
 *                         inspections, invoices } record arrays.
 * @returns {{ categories: Array, total: number }} category objects in
 *          display order, each { key, label, hint, accent, count,
 *          items } with items sorted by due date.
 */
export function deriveWorkQueue({ requisitions, rfqs, orders, grns, inspections, invoices } = {}) {
  const builders = [
    prItems(requisitions),
    rfqItems(rfqs),
    poApprovalItems(orders),
    poReleaseItems(orders),
    acknowledgementItems(orders),
    grnItems(grns),
    inspectionItems(inspections),
    matchingItems(invoices),
    invoiceApprovalItems(invoices),
    paymentDueItems(invoices)
  ];

  const categories = WORK_QUEUE_CATEGORIES.map((meta, index) => {
    const items = (builders[index] || [])
      .slice()
      .sort((a, b) => (Number(b.due) - Number(a.due)) || String(a.date).localeCompare(String(b.date)));
    return { ...meta, count: items.length, items };
  });

  return {
    categories,
    total: categories.reduce((sum, cat) => sum + cat.count, 0)
  };
}

/* ------------------------------------------------------------------ */
/*  Payload normalisation                                             */
/* ------------------------------------------------------------------ */

/** Date fields, in preference order, for a queue item's display date. */
const ITEM_DATE_KEYS = ['date', 'expectedDate', 'dueDate', 'receivedOn', 'createdAt'];

function itemDate(record) {
  for (const key of ITEM_DATE_KEYS) {
    if (record?.[key]) return String(record[key]);
  }
  return '';
}

/**
 * Normalises a single queue item so the page renders identically
 * regardless of where the queue came from.
 *
 * The locally derived items already carry every field, while the REST
 * payload carries only raw record fields (it has `route` + `actionLabel`
 * but no `actionRoute`, `dateLabel` or `due`). Filling those gaps here
 * keeps every row free of per-field fallbacks and — critically —
 * guarantees a real navigation target for the action button: an
 * undefined target silently re-navigates to the current page, making
 * the button a no-op.
 */
export function normalizeQueueItem(record = {}) {
  const route = record.route || '';
  const date = record.dateLabel ? record.date : itemDate(record);
  return {
    ...record,
    number: record.number ?? record.id ?? '',
    title: record.title || record.number || '',
    vendor: record.vendor || '',
    status: record.status || '',
    matchStatus: record.matchStatus || '',
    amount: record.amount ?? '',
    date,
    dateLabel: record.dateLabel || formatDate(date) || '—',
    due: typeof record.due === 'boolean'
      ? record.due
      : Boolean(record.expectedDate || record.dueDate),
    route,
    /* When the payload does not name a dedicated action page the action
       is performed on the document itself. */
    actionRoute: record.actionRoute || route,
    actionLabel: record.actionLabel || 'Open'
  };
}

/**
 * Normalises a work-queue payload into the exact shape the page renders.
 *
 * Display metadata (label / hint / accent) always comes from the shared
 * category definition — the REST payload omits the design tokens, which
 * would otherwise leave the category icon uncoloured and the count pill
 * unreadable. Counts stay exactly as reported (a backend count is the
 * true total even when the item list is capped); items are sorted by
 * due date, matching the locally derived order.
 */
export function normalizeQueue(payload) {
  const incoming = Array.isArray(payload?.categories) ? payload.categories : [];
  const byKey = new Map(incoming.map((cat) => [cat?.key, cat]));

  const categories = WORK_QUEUE_CATEGORIES.map((meta) => {
    const raw = byKey.get(meta.key) || {};
    const items = (Array.isArray(raw.items) ? raw.items : [])
      .map(normalizeQueueItem)
      .sort((a, b) => (Number(b.due) - Number(a.due)) || String(a.date).localeCompare(String(b.date)));
    const count = Number(raw.count);
    return { ...meta, count: Number.isFinite(count) ? count : items.length, items };
  });

  const total = Number(payload?.total);
  return {
    categories,
    total: Number.isFinite(total) ? total : categories.reduce((sum, cat) => sum + cat.count, 0)
  };
}

/* ------------------------------------------------------------------ */
/*  Live fetch                                                        */
/* ------------------------------------------------------------------ */

/**
 * Fetches the authoritative queue from the backend and normalises it.
 * Every count is a real database count — nothing hardcoded.
 */
export async function getWorkQueue() {
  const { data } = await purchaseGet('/work-queue');
  return normalizeQueue(unwrapResponse(data));
  /*
  const { requisitionService } = await import('./requisition');
  const { rfqService } = await import('./rfq');
  const { purchaseOrderService } = await import('./purchaseOrder');
  const { logisticsService } = await import('./logistics');
  const { invoiceService } = await import('./invoice');

  const [
    reqResult, rfqResult, poResult, grnResult, inspResult, invoiceResult
  ] = await Promise.all([
    requisitionService.getRequisitions({ page: 1, pageSize: 500 }),
    rfqService.getRfqs({ page: 1, pageSize: 500 }),
    purchaseOrderService.getOrders({ page: 1, pageSize: 500 }),
    logisticsService.getGrns({ page: 1, pageSize: 500 }),
    logisticsService.getInspections({ page: 1, pageSize: 500 }),
    invoiceService.getInvoices({ page: 1, pageSize: 500 })
  ]);

  return deriveWorkQueue({
    requisitions: reqResult?.data || [],
    rfqs: rfqResult?.data || [],
    orders: poResult?.data || [],
    grns: grnResult?.data || [],
    inspections: inspResult?.data || [],
    invoices: invoiceResult?.data || []
  });
  */
}

export default { WORK_QUEUE_CATEGORIES, deriveWorkQueue, normalizeQueue, getWorkQueue };