/**
 * purchase/services/document360.js
 * ------------------------------------------------------------------
 * Document 360 resolver — the single source that powers the 360° view
 * for every major Purchase document (PR, RFQ, Quotation, PO, GRN,
 * Inventory, Invoice, Payment).
 *
 * For a document type + id it:
 *   · resolves the real record from the live store (never synthetic),
 *   · walks the REAL relationship graph (PR → RFQ → Quotation → PO →
 *     Shipment → GRN → Inspection → Inventory → Invoice → Payment)
 *     using the stored reference fields (prNo / reference / rfqNo /
 *     quotationNo / poNo / grnNo / inspectionNo / invoiceNo …), and
 *   · normalizes every 360 section (overview, items, financials,
 *     workflow, timeline, related, approvals, attachments, comments,
 *     audit, versions, exceptions) from that real data.
 *
 * Every link produced here targets an existing route with a real id —
 * nothing is guessed or generated.
 * ------------------------------------------------------------------
 */
import {
  APPROVAL_STATUS, DOCUMENT_STAGE, INVOICE_STATUS, MATCH_STATUS, RFQ_STATUS
} from '../constants';
import { GRN_STATUS } from './logistics';
import { calcDocumentTotals, round2 } from '../utils/purchase';
import { effectiveNetPayable, effectiveOutstanding } from '../utils/adjustmentNotes';
import { todayLocal } from './base';
import { requisitionsStore } from './requisition';
import { rfqsStore, quotationsStore } from './rfq';
import { ordersStore } from './purchaseOrder';
import {
  grnsStore, inspectionsStore, inventoryStore, shipmentsStore
} from './logistics';
import { invoicesStore, advicesStore } from './invoice';
import { nfasStore } from './nfa';
import { evaluationsStore } from './evaluation';
import { documentsStore } from './documents';
import { documentAuditService } from './documentAudit';
import { documentVersioningService } from './documentVersioning';
import { isApiMode } from './api-client';
import { purchaseOrderApi } from './api/purchaseOrderApi';
import { requisitionApi } from './api/requisitionApi';
import { rfqApi } from './api/rfqApi';
import { logisticsApi } from './api/logisticsApi';
import { invoiceApi } from './api/invoiceApi';

/* ------------------------------------------------------------------ */
/*  Type registry                                                     */
/* ------------------------------------------------------------------ */

export const DOC360_TYPES = {
  pr: {
    key: 'pr', short: 'PR', label: 'Purchase Requisition',
    stage: DOCUMENT_STAGE.PR, versionDocType: 'PR',
    listRoute: '/purchase/requisition'
  },
  rfq: {
    key: 'rfq', short: 'RFQ', label: 'RFQ',
    stage: DOCUMENT_STAGE.RFQ, versionDocType: 'RFQ',
    listRoute: '/purchase/rfq'
  },
  quotation: {
    key: 'quotation', short: 'Quotation', label: 'Vendor Quotation',
    stage: DOCUMENT_STAGE.QUOTATION, versionDocType: 'QUOTATION',
    listRoute: '/purchase/rfq/quotations'
  },
  po: {
    key: 'po', short: 'PO', label: 'Purchase Order',
    stage: DOCUMENT_STAGE.PO, versionDocType: 'PO',
    listRoute: '/purchase/orders'
  },
  shipment: {
    key: 'shipment', short: 'Shipment', label: 'Shipment',
    stage: DOCUMENT_STAGE.GRN, versionDocType: 'SHIPMENT',
    listRoute: '/purchase/logistics/shipment'
  },
  grn: {
    key: 'grn', short: 'GRN', label: 'Goods Receipt',
    stage: DOCUMENT_STAGE.GRN, versionDocType: 'GRN',
    listRoute: '/purchase/logistics/grn'
  },
  inspection: {
    key: 'inspection', short: 'Inspection', label: 'Quality Inspection',
    stage: DOCUMENT_STAGE.GRN, versionDocType: 'INSPECTION',
    listRoute: '/purchase/logistics/quality'
  },
  inventory: {
    key: 'inventory', short: 'Inventory', label: 'Inventory Movement',
    stage: DOCUMENT_STAGE.GRN, versionDocType: 'INVENTORY',
    listRoute: '/purchase/logistics/inventory'
  },
  invoice: {
    key: 'invoice', short: 'Invoice', label: 'Purchase Invoice',
    stage: DOCUMENT_STAGE.INVOICE, versionDocType: 'INVOICE',
    listRoute: '/purchase/invoices'
  },
  payment: {
    key: 'payment', short: 'Payment', label: 'Payment',
    stage: DOCUMENT_STAGE.PAYMENT, versionDocType: 'PAYMENT',
    listRoute: '/purchase/invoices/payment-advice'
  },
  nfa: {
    key: 'nfa', short: 'NFA', label: 'Approval Note',
    stage: DOCUMENT_STAGE.NFA, versionDocType: 'NFA',
    listRoute: '/purchase/rfq/approval'
  }
};

/** Canonical downstream workflow order used by the 360 chain bar. */
export const DOC360_CHAIN = [
  'pr', 'rfq', 'quotation', 'po', 'shipment', 'grn', 'inspection',
  'inventory', 'invoice', 'payment'
];

/** Types that have a 360° route of their own. */
export const DOC360_ROUTED = [
  'pr', 'rfq', 'quotation', 'po', 'grn', 'inventory', 'invoice', 'payment'
];

/* ------------------------------------------------------------------ */
/*  Record resolution                                                 */
/* ------------------------------------------------------------------ */

function recordId(type, record) {
  if (!record) return '';
  switch (type) {
    case 'pr': return record.prNo || record.id || '';
    case 'rfq': return record.rfqNo || record.id || '';
    case 'quotation': return record.quotationNo || record.id || '';
    case 'po': return record.poNo || record.id || '';
    case 'shipment': return record.shipmentNo || record.id || '';
    case 'grn': return record.grnNo || record.id || '';
    case 'inspection': return record.inspectionNo || record.id || '';
    case 'inventory': return record.id || '';
    case 'invoice': return record.invoiceNo || record.id || '';
    case 'payment': return record.id || record.adviceNo || record.paymentNo || '';
    case 'nfa': return record.id || record.nfaNo || '';
    default: return record.id || '';
  }
}

function resolveRecord(type, id) {
  if (!id) return null;
  switch (type) {
    case 'pr':
      return requisitionsStore.all.find((r) => r.id === id || r.prNo === id) || null;
    case 'rfq':
      return rfqsStore.all.find((r) => r.id === id || r.rfqNo === id) || null;
    case 'quotation':
      return quotationsStore.all.find((q) => q.id === id || q.quotationNo === id) || null;
    case 'po':
      return ordersStore.all.find((o) => o.id === id || o.poNo === id) || null;
    case 'shipment':
      return shipmentsStore.all.find((s) => s.id === id || s.shipmentNo === id) || null;
    case 'grn':
      return grnsStore.all.find((g) => g.id === id || g.grnNo === id) || null;
    case 'inspection':
      return inspectionsStore.all.find((i) => i.id === id || i.inspectionNo === id) || null;
    case 'inventory':
      return inventoryStore.all.find((m) => m.id === id) || null;
    case 'invoice':
      return invoicesStore.all.find((i) => i.id === id || i.invoiceNo === id) || null;
    case 'payment':
      return (
        advicesStore.all.find((a) => a.id === id || a.adviceNo === id || a.paymentNo === id) ||
        /* A payment may exist on the invoice ledger before its advice is
           generated — resolve it from the payment history. */
        resolvePaymentFromLedger(id) ||
        null
      );
    case 'nfa':
      return nfasStore.all.find((n) => n.id === id || n.nfaNo === id) || null;
    default:
      return null;
  }
}

/**
 * API-mode fallback: when the local store is empty (API mode), fetch the
 * record from the real backend. Returns null when the API call fails or
 * the record genuinely doesn't exist.
 */
async function apiResolveRecord(type, id) {
  try {
    switch (type) {
      case 'po':        return await purchaseOrderApi.get(id);
      case 'pr':        return await requisitionApi.get(id);
      case 'rfq':       return await rfqApi.get(id);
      case 'quotation': return await rfqApi.quotation(id);
      case 'grn':       return await logisticsApi.grn(id);
      case 'inspection': return await logisticsApi.inspection(id);
      case 'shipment':  return await logisticsApi.shipment(id);
      case 'inventory': return await logisticsApi.inventoryMovement(id);
      case 'invoice':   return await invoiceApi.get(id);
      /* payment / nfa: no single-record GET on the backend */
      default: return null;
    }
  } catch {
    return null;
  }
}

/**
 * Resolves a record from the local store first; if that fails and we're
 * in API mode, falls back to the real backend API.
 */
async function asyncResolveRecord(type, id) {
  const local = resolveRecord(type, id);
  if (local) return local;
  if (isApiMode()) return apiResolveRecord(type, id);
  return null;
}

/** Builds a pseudo payment record from an invoice's paymentHistory entry. */
function resolvePaymentFromLedger(id) {
  for (const invoice of invoicesStore.all) {
    const entry = (invoice.paymentHistory || []).find(
      (h) => h.paymentNo === id || (invoice.id === id) || (invoice.invoiceNo === id)
    );
    if (entry) {
      return {
        id: entry.paymentNo || id,
        adviceNo: '',
        paymentNo: entry.paymentNo || id,
        transactionReference: entry.transactionReference || '',
        invoiceNo: invoice.invoiceNo || '',
        vendor: invoice.vendor || '',
        poNo: invoice.poNo || '',
        paidOn: entry.paidOn || '',
        method: entry.method || '',
        bank: entry.bank || '',
        currency: entry.currency || invoice.currency || 'INR',
        exchangeRate: Number(entry.exchangeRate) || 1,
        amount: Number(entry.amount) || 0,
        status: entry.status || 'Active',
        paidBy: entry.paidBy || '',
        issuedBy: entry.paidBy || '',
        createdAt: entry.timestamp || '',
        _fromLedger: true
      };
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/*  Relationship graph                                                */
/* ------------------------------------------------------------------ */

function vendorMatch(a, b) {
  const x = String(a || '').trim().toLowerCase();
  const y = String(b || '').trim().toLowerCase();
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
}

const node = (type, record) => ({ type, id: recordId(type, record), record });

/** Direct downstream documents for a record — real store references only. */
const childrenOf = {
  pr: (pr) => rfqsStore.all
    .filter((r) => r.reference === pr.prNo || r.prNo === pr.prNo)
    .map((r) => node('rfq', r)),

  rfq: (rfq) => [
    ...quotationsStore.all.filter((q) => q.rfqNo === rfq.rfqNo).map((q) => node('quotation', q)),
    ...ordersStore.all.filter((o) => o.rfqNo === rfq.rfqNo).map((o) => node('po', o)),
    ...nfasStore.all.filter((n) => n.rfqNo === rfq.rfqNo).map((n) => node('nfa', n))
  ],

  quotation: (q) => ordersStore.all
    .filter((o) =>
      o.rfqNo === q.rfqNo &&
      (o.quotationNo === (q.quotationNo || q.id) || vendorMatch(o.vendor, q.vendor))
    )
    .map((o) => node('po', o)),

  po: (po) => [
    ...shipmentsStore.all.filter((s) => s.poNo === po.poNo).map((s) => node('shipment', s)),
    ...grnsStore.all.filter((g) => g.poNo === po.poNo).map((g) => node('grn', g)),
    ...invoicesStore.all.filter((i) => i.poNo === po.poNo).map((i) => node('invoice', i)),
    ...advicesStore.all.filter((a) => a.poNo === po.poNo).map((a) => node('payment', a))
  ],

  shipment: (s) => grnsStore.all
    .filter((g) => g.poNo === s.poNo || g.shipmentNo === s.shipmentNo)
    .map((g) => node('grn', g)),

  grn: (g) => [
    ...inspectionsStore.all.filter((i) => i.grnNo === g.grnNo).map((i) => node('inspection', i)),
    ...invoicesStore.all.filter((i) => i.grnNo === g.grnNo).map((i) => node('invoice', i)),
    ...inventoryStore.all
      .filter((m) => m.grnNo === g.grnNo || m.reference === g.grnNo)
      .map((m) => node('inventory', m))
  ],

  inspection: (i) => inventoryStore.all
    .filter((m) => m.inspectionNo === i.inspectionNo || m.reference === i.inspectionNo)
    .map((m) => node('inventory', m)),

  inventory: (m) => {
    const out = [];
    const grn = grnsStore.all.find(
      (g) => g.grnNo === m.grnNo || (String(m.reference || '').startsWith('GRN-') && g.grnNo === m.reference)
    );
    if (grn) {
      out.push(node('grn', grn));
      /* Inventory receipts against a GRN inherit the GRN's PO chain. */
      const po = ordersStore.all.find((o) => o.poNo === grn.poNo);
      if (po) out.push(node('po', po));
    }
    if (m.poNo) {
      const po = ordersStore.all.find((o) => o.poNo === m.poNo);
      if (po) out.push(node('po', po));
    }
    if (m.inspectionNo) {
      const insp = inspectionsStore.all.find((i) => i.inspectionNo === m.inspectionNo);
      if (insp) out.push(node('inspection', insp));
    }
    return out;
  },

  invoice: (i) => advicesStore.all
    .filter((a) => a.invoiceNo === i.invoiceNo)
    .map((a) => node('payment', a)),

  payment: () => [],
  nfa: () => []
};

/** Direct upstream documents for a record. */
const parentsOf = {
  rfq: (rfq) => requisitionsStore.all
    .filter((pr) => pr.prNo === (rfq.reference || rfq.prNo))
    .map((pr) => node('pr', pr)),

  quotation: (q) => rfqsStore.all
    .filter((r) => r.rfqNo === q.rfqNo)
    .map((r) => node('rfq', r)),

  po: (po) => [
    ...requisitionsStore.all
      .filter((pr) => pr.prNo === (po.prNo || po.reference))
      .map((pr) => node('pr', pr)),
    ...(po.rfqNo
      ? rfqsStore.all.filter((r) => r.rfqNo === po.rfqNo).map((r) => node('rfq', r))
      : []),
    ...quotationsStore.all
      .filter((q) =>
        q.rfqNo === po.rfqNo &&
        (q.quotationNo === po.quotationNo || vendorMatch(q.vendor, po.vendor))
      )
      .map((q) => node('quotation', q))
  ],

  shipment: (s) => ordersStore.all
    .filter((o) => o.poNo === s.poNo)
    .map((o) => node('po', o)),

  grn: (g) => [
    ...ordersStore.all.filter((o) => o.poNo === g.poNo).map((o) => node('po', o)),
    ...(g.shipmentNo
      ? shipmentsStore.all.filter((s) => s.shipmentNo === g.shipmentNo).map((s) => node('shipment', s))
      : [])
  ],

  inspection: (i) => [
    ...grnsStore.all.filter((g) => g.grnNo === i.grnNo).map((g) => node('grn', g)),
    ...ordersStore.all.filter((o) => o.poNo === i.poNo).map((o) => node('po', o))
  ],

  inventory: (m) => {
    const out = [];
    const grn = grnsStore.all.find(
      (g) => g.grnNo === m.grnNo || (String(m.reference || '').startsWith('GRN-') && g.grnNo === m.reference)
    );
    if (grn) out.push(node('grn', grn));
    const po = ordersStore.all.find(
      (o) => o.poNo === m.poNo || (String(m.reference || '').startsWith('PO-') && o.poNo === m.reference)
    );
    if (po) out.push(node('po', po));
    if (m.inspectionNo) {
      const insp = inspectionsStore.all.find((i) => i.inspectionNo === m.inspectionNo);
      if (insp) out.push(node('inspection', insp));
    }
    return out;
  },

  invoice: (i) => [
    ...ordersStore.all.filter((o) => o.poNo === i.poNo).map((o) => node('po', o)),
    ...(i.grnNo ? grnsStore.all.filter((g) => g.grnNo === i.grnNo).map((g) => node('grn', g)) : [])
  ],

  payment: (a) => [
    ...invoicesStore.all.filter((i) => i.invoiceNo === a.invoiceNo).map((i) => node('invoice', i)),
    ...ordersStore.all.filter((o) => o.poNo === a.poNo).map((o) => node('po', o))
  ],

  pr: () => [],
  nfa: (n) => [
    ...(n.rfqNo ? rfqsStore.all.filter((r) => r.rfqNo === n.rfqNo).map((r) => node('rfq', r)) : []),
    ...(n.prNo ? requisitionsStore.all.filter((pr) => pr.prNo === n.prNo).map((pr) => node('pr', pr)) : [])
  ]
};

/**
 * Walks the real graph (both directions) starting from the current
 * record. Returns documents grouped by canonical chain stage plus the
 * stage order, deduplicated and cycle-safe.
 */
function collectGraph(type, record) {
  const start = node(type, record);
  const visited = new Set();
  const byStage = {};
  const queue = [start];
  visited.add(`${start.type}:${start.id}`);

  let guard = 0;
  while (queue.length > 0 && guard++ < 800) {
    const current = queue.shift();
    const stage = DOC360_CHAIN.includes(current.type) ? current.type : current.type;
    if (!byStage[stage]) byStage[stage] = [];

    /* The current document itself is not a "related" document. */
    if (!(current.type === start.type && current.id === start.id)) {
      if (!byStage[stage].some((n) => n.type === current.type && n.id === current.id)) {
        byStage[stage].push(current);
      }
    }

    const expand = (neighbors) => {
      for (const next of neighbors) {
        if (!next.id) continue;
        const key = `${next.type}:${next.id}`;
        if (visited.has(key)) continue;
        visited.add(key);
        queue.push(next);
      }
    };
    expand(childrenOf[current.type]?.(current.record) || []);
    expand(parentsOf[current.type]?.(current.record) || []);
  }
  return { byStage, order: Object.keys(byStage) };
}

/* ------------------------------------------------------------------ */
/*  Route helpers                                                     */
/* ------------------------------------------------------------------ */

/** 360° route for a document. */
export function document360Route(type, record) {
  const id = recordId(type, record);
  switch (type) {
    case 'pr': return `/purchase/requisition/${id}/360`;
    case 'rfq': return `/purchase/rfq/${id}/360`;
    case 'quotation': return `/purchase/rfq/quotations/${id}/360`;
    case 'po': return `/purchase/orders/${id}/360`;
    case 'grn': return `/purchase/logistics/grn/${record.grnNo || id}/360`;
    case 'inventory': return `/purchase/logistics/inventory/${id}/360`;
    case 'invoice': return `/purchase/invoices/${id}/360`;
    case 'payment': return `/purchase/payments/${id}/360`;
    default: return '';
  }
}

/** Source (detail) route for a document — the "Open document" action. */
export function documentSourceRoute(type, record) {
  const id = recordId(type, record);
  switch (type) {
    case 'pr': return `/purchase/requisition/${id}`;
    case 'rfq': return `/purchase/rfq/${id}`;
    case 'quotation': return `/purchase/rfq/quotations/${id}`;
    case 'po': return `/purchase/orders/${id}`;
    case 'grn': return `/purchase/logistics/grn/${record.grnNo || id}`;
    case 'inventory': return `/purchase/logistics/inventory/${id}`;
    case 'invoice': return `/purchase/invoices/${id}`;
    case 'payment': return '/purchase/invoices/payment-advice';
    case 'shipment': return `/purchase/logistics/shipment/${record.shipmentNo || id}`;
    case 'inspection': return `/purchase/logistics/quality/${record.inspectionNo || id}`;
    case 'nfa': return `/purchase/rfq/approval/${id}`;
    default: return DOC360_TYPES[type]?.listRoute || '';
  }
}

/** Route for a related node. */
export function relatedRoute(node) {
  return documentSourceRoute(node.type, node.record);
}

/* ------------------------------------------------------------------ */
/*  Section builders                                                  */
/* ------------------------------------------------------------------ */

function formatList(values) {
  return Array.isArray(values) ? values.filter(Boolean).join(', ') : values || '';
}

/** Overview key-values per document type. */
function buildOverview(type, record) {
  const rows = [];
  const push = (label, value) => rows.push({ label, value: value ?? '' });

  switch (type) {
    case 'pr':
      push('Department', record.department);
      push('Project', record.project);
      push('Requester', record.requester);
      push('Buyer', record.buyer);
      push('Vendor', record.vendor);
      push('Priority', record.priority);
      push('Currency', record.currency);
      push('Payment Terms', record.terms);
      push('Required Date', record.expectedDate);
      push('Requested On', record.date || (record.createdAt || '').slice(0, 10));
      push('Company', record.company);
      push('Branch', record.branch);
      push('GST Type', record.gstType);
      push('Discount', record.discount ? `${record.discount}%` : '');
      push('Charges', record.charges ? String(record.charges) : '');
      push('Status', record.status);
      push('Approval', record.approvalStatus || APPROVAL_STATUS.PENDING);
      break;

    case 'rfq':
      push('Category', record.category);
      push('Department', record.department);
      push('Project', record.project);
      push('Requester', record.requester);
      push('Buyer', record.buyer);
      push('Priority', record.priority);
      push('Validity', record.validity ? `${record.validity} days` : '');
      push('Due Date', record.dueDate);
      push('Vendors', formatList(record.vendors));
      push('Currency', record.currency);
      push('Created', (record.createdAt || '').slice(0, 10));
      push('Sent', record.sentAt ? record.sentAt.slice(0, 10) : '');
      push('Status', record.status);
      break;

    case 'quotation':
      push('RFQ Reference', record.rfqNo);
      push('Vendor', record.vendor);
      push('Submitted On', record.submittedOn || (record.createdAt || '').slice(0, 10));
      push('Delivery', record.delivery);
      push('Valid Until', record.validUntil);
      push('Lead Time', record.leadTime ? `${record.leadTime} days` : '');
      push('Payment Terms', record.paymentTerms);
      push('Score', record.score != null ? `${record.score} / 100` : '');
      push('Currency', record.currency);
      push('Status', record.status);
      break;

    case 'po':
      push('Vendor', record.vendor);
      push('PR Reference', record.reference || record.prNo);
      push('RFQ Reference', record.rfqNo);
      push('Quotation', record.quotationNo);
      push('Order Date', record.orderDate);
      push('Expected Date', record.expectedDate);
      push('Currency', record.currency);
      push('Payment Terms', record.terms || record.paymentTerms?.type);
      push('Delivery Terms', record.deliveryTerms);
      push('Warranty', record.warranty);
      push('Freight', record.freight ? String(record.freight) : '');
      push('Discount', record.discount ? `${record.discount}%` : '');
      push('Charges', record.charges ? String(record.charges) : '');
      push('Incoterm', record.incoterm);
      push('Transport Mode', record.transportMode);
      push('Warehouse', record.warehouse);
      push('Cost Center', record.costCenter);
      push('Delivery Address', record.deliveryAddress);
      push('Status', record.status);
      push('Approval', record.approvalStatus || APPROVAL_STATUS.PENDING);
      break;

    case 'grn':
      push('PO Number', record.poNo);
      push('Shipment No', record.shipmentNo);
      push('Vendor', record.vendor);
      push('Warehouse', record.warehouse);
      push('Received Date', record.receivedOn || record.receivedAt || '');
      push('Created', (record.createdAt || '').slice(0, 10));
      push('Status', record.status);
      break;

    case 'inventory':
      push('SKU', record.sku || record.itemCode);
      push('Product', record.product);
      push('Warehouse', record.warehouse);
      push('Location', record.location);
      push('Type', record.type);
      push('Reference', record.reference);
      push('Updated By', record.updatedBy);
      push('Updated On', record.updatedOn || (record.createdAt || '').slice(0, 10));
      if (record.notes) push('Notes', record.notes);
      break;

    case 'invoice':
      push('Vendor', record.vendor);
      push('PO Reference', record.poNo);
      push('GRN Reference', record.grnNo);
      push('Vendor Invoice No', record.vendorInvoiceNo);
      push('Invoice Date', record.invoiceDate);
      push('Due Date', record.dueDate);
      push('Payment Method', record.paymentMethod);
      push('Payment Date', record.paymentDate);
      push('Currency', record.currency);
      push('TDS %', record.tdsPercent ? `${record.tdsPercent}%` : '');
      push('Retention %', record.retentionPercent ? `${record.retentionPercent}%` : '');
      push('Three-Way Match', record.matchStatus || 'Not Computed');
      push('Status', record.status);
      break;

    case 'payment':
      push('Advice No', record.adviceNo || '—');
      push('Payment No', record.paymentNo);
      push('Transaction Reference', record.transactionReference);
      push('Invoice No', record.invoiceNo);
      push('PO Number', record.poNo);
      push('Vendor', record.vendor);
      push('Paid On', record.paidOn);
      push('Method', record.method);
      push('Bank', record.bank);
      push('Currency', record.currency);
      push('Exchange Rate', record.exchangeRate ? String(record.exchangeRate) : '');
      push('Paid By', record.paidBy);
      push('Issued By', record.issuedBy);
      push('Status', record.status);
      break;
    default:
      break;
  }
  return rows;
}

/** Normalized line items per document type. */
function buildItems(type, record) {
  const items = (record.items || []).filter(Boolean);
  switch (type) {
    case 'grn':
      return items.map((line) => ({
        product: line.product || '',
        hsn: line.hsn || '',
        uom: line.uom || '',
        qty: Number(line.qty) || 0,
        rate: null,
        gstRate: null,
        received: Number(line.received) || 0,
        pending: Math.max(0, (Number(line.qty) || 0) - (Number(line.received) || 0)),
        amount: null
      }));
    case 'quotation':
    case 'pr':
    case 'rfq':
    case 'po':
    case 'invoice':
      return items.map((line) => {
        const qty = Number(line.qty) || 0;
        const rate = Number(line.rate ?? line.price ?? line.unitPrice) || 0;
        return {
          product: line.product || line.description || line.name || '',
          hsn: line.hsn || line.hsnCode || line.sac || '',
          uom: line.uom || line.unit || '',
          qty,
          rate,
          gstRate: line.gstRate != null ? Number(line.gstRate) : (line.gst != null ? Number(line.gst) : null),
          received: null,
          pending: null,
          amount: Number(line.amount ?? line.total ?? (qty * rate)) || 0
        };
      });
    case 'inventory':
      return [{
        product: record.product || record.sku || '',
        hsn: record.hsn || '',
        uom: record.uom || '',
        qty: Math.abs(Number(record.delta) || 0),
        rate: null,
        gstRate: null,
        received: null,
        pending: null,
        amount: null
      }];
    case 'payment':
      return [{
        product: `Payment ${record.paymentNo || record.adviceNo || ''}`.trim(),
        hsn: '',
        uom: '',
        qty: 1,
        rate: Number(record.amount) || 0,
        gstRate: null,
        received: null,
        pending: null,
        amount: Number(record.amount) || 0
      }];
    default:
      return [];
  }
}

/** Financial summary per document type. */
function buildFinancials(type, record, graph) {
  const rows = [];
  const push = (label, value, tone = '') => rows.push({ label, value, tone });

  const discount = Number(record.discount) || 0;
  const charges = Number(record.charges) || 0;
  const freight = Number(record.freight) || 0;
  const items = (record.items || []).filter(Boolean);

  if (type === 'pr' || type === 'rfq' || type === 'quotation' || type === 'po') {
    const totals =
      record.totals ||
      calcDocumentTotals(items, discount, charges, record.gstType || '');
    push('Taxable Value', totals.taxable ?? 0);
    push('GST', totals.gstTotal ?? totals.gst ?? 0);
    if (discount) push('Discount', `${discount}%`);
    if (charges) push('Charges', totals.charges ?? charges);
    if (type === 'po' && freight) push('Freight', freight);
    push('Grand Total', totals.total ?? totals.roundedTotal ?? 0, 'total');
    if (type === 'po') {
      if (record.awardedValue != null) push('Award Value', record.awardedValue);
      if (Number(record.advanceAmount) > 0) push('Advance Required', record.advanceAmount);
      if (Number(record.balanceAmount) > 0) push('Balance Amount', record.balanceAmount);
      if (Number(record.advancePaidAmount) > 0) push('Advance Paid', record.advancePaidAmount);
    }
    return rows;
  }

  if (type === 'invoice') {
    push('Taxable Value', record.amount ?? 0);
    push('GST', record.gst ?? 0);
    if (record.charges) push('Charges', record.charges);
    if (record.freight) push('Freight', record.freight);
    if (record.discount) push('Discount', `${record.discount}%`);
    push('Gross Total', record.total ?? 0, 'total');
    if (Number(record.tds) > 0) push('TDS', record.tds);
    if (Number(record.retention) > 0) push('Retention', record.retention);
    /* Approved credit / debit notes adjust the ledger — surface their
       net movement and price Net Payable / Outstanding from the
       adjusted balance, exactly as the invoice module and reports do. */
    const adj = record && typeof record.adjustments === 'object' && record.adjustments ? record.adjustments : null;
    if (adj) {
      if (Number(adj.credit) > 0) push('Credit Notes', -round2(Number(adj.credit)));
      if (Number(adj.debit) > 0) push('Debit Notes', round2(Number(adj.debit)));
    }
    push('Net Payable', effectiveNetPayable(record), 'total');
    push('Paid', record.paidAmount ?? 0);
    const outstanding = effectiveOutstanding(record);
    push('Outstanding', outstanding, outstanding <= 0.005 ? 'ok' : 'warn');
    return rows;
  }

  if (type === 'grn') {
    const ordered = items.reduce((sum, line) => sum + (Number(line.qty) || 0), 0);
    const received = items.reduce((sum, line) => sum + (Number(line.received) || 0), 0);
    push('Ordered Quantity', ordered);
    push('Received Quantity', received, received >= ordered && ordered > 0 ? 'ok' : 'warn');
    push('Balance Quantity', Math.max(0, ordered - received), ordered - received > 0 ? 'warn' : 'ok');
    const po = (graph.byStage?.po || [])[0]?.record;
    if (po) {
      push('Linked PO Value', Number(po.amount) || Number(po.totals?.total) || 0);
    }
    return rows;
  }

  if (type === 'inventory') {
    const before = Number(record.before) || 0;
    const delta = Number(record.delta) || 0;
    push('Before Quantity', before);
    push('Delta', delta, delta > 0 ? 'ok' : delta < 0 ? 'warn' : '');
    push('After Quantity', before + delta, 'total');
    return rows;
  }

  if (type === 'payment') {
    push('Payment Amount', record.amount ?? 0, 'total');
    if (record.exchangeRate && Number(record.exchangeRate) !== 1) {
      push('Exchange Rate', Number(record.exchangeRate));
    }
    push('Method', record.method || '—');
    push('Bank', record.bank || '—');
    return rows;
  }

  return rows;
}

/** Workflow activity stream per document type. */
function buildActivity(type, record) {
  const out = [];
  const push = (typeKey, label, actor, timestamp, note = '') => {
    if (!timestamp) return;
    out.push({ type: typeKey, label, actor, timestamp, note });
  };

  switch (type) {
    case 'pr':
    case 'rfq':
    case 'po':
      return (record.activity || []).filter((a) => a && (a.label || a.type));
    case 'quotation':
      push('submit', `Quotation ${record.quotationNo || record.id} submitted`, record.vendor, record.submittedOn);
      push('create', `Quotation ${record.quotationNo || record.id} recorded`, record.vendor, record.createdAt);
      return out;
    case 'grn':
      push('create', `GRN ${record.grnNo} created`, 'System', record.createdAt);
      if (record.receivedOn || record.receivedAt) {
        push('approve', `Goods received on ${record.grnNo}`, 'Stores', record.receivedAt || record.receivedOn);
      }
      if (record.status === GRN_STATUS.PENDING_INSPECTION) {
        push('review', 'Sent to quality inspection', 'System', record.receivedAt || record.receivedOn);
      }
      return out;
    case 'inventory':
      push('create', `Inventory movement ${record.id} posted`, record.updatedBy, record.createdAt || record.updatedOn);
      if (record.reversalOf) push('return', `Reversal of ${record.reversalOf}`, record.updatedBy, record.createdAt);
      if (record.reversalId) push('review', `Reversed by ${record.reversalId}`, record.updatedBy, record.reversedOn || record.createdAt);
      return out;
    case 'invoice':
      return (record.auditHistory || []).map((entry) => ({
        type: entry.action || 'review',
        label: entry.action || 'Action',
        actor: entry.actor || entry.performedBy || 'System',
        timestamp: entry.timestamp || entry.performedAt,
        note: entry.details?.note || entry.details?.reason || ''
      }));
    case 'payment':
      push('create', `Payment ${record.paymentNo || record.adviceNo} recorded`, record.paidBy || record.issuedBy, record.createdAt || record.paidOn);
      if (record.status === 'Sent') push('send', 'Payment advice sent to vendor', record.issuedBy, record.sentOn);
      return out;
    default:
      return [];
  }
}

/** Approval information per document type. */
function buildApprovals(type, record) {
  const out = [];
  const engine = record.approval;
  if (engine && Array.isArray(engine.steps) && engine.steps.length > 0) {
    (engine.steps || []).forEach((step, index) => {
      out.push({
        step: index + 1,
        role: step.role || step.assignedTo || 'Approver',
        approver: step.approver || step.assignedTo || '',
        status: step.status || 'Pending',
        decidedAt: step.decidedAt || step.approvedAt || '',
        note: step.note || ''
      });
    });
    return out;
  }

  /* Legacy activity-based approvals (PR / RFQ / PO without an engine). */
  const decisions = ['approve', 'reject', 'return', 'submit', 'award'];
  const acts = (record.activity || []).filter((a) => decisions.includes(a.type));
  acts.forEach((a, index) => {
    out.push({
      step: index + 1,
      role: a.type === 'approve' ? 'Approver' : a.type,
      approver: a.actor || '',
      status: a.type === 'approve' ? 'Approved' : a.type === 'reject' ? 'Rejected' : a.type === 'return' ? 'Returned' : 'Completed',
      decidedAt: a.timestamp || '',
      note: a.note || ''
    });
  });
  if (out.length === 0 && record.approvalStatus) {
    out.push({
      step: 1,
      role: 'Approval',
      approver: record.approvedBy || '',
      status: record.approvalStatus,
      decidedAt: record.approvalDate || '',
      note: record.approvalNote || ''
    });
  }
  return out;
}

/** Audit history — record trail + version trails + shared audit service. */
async function buildAudit(type, record, versions) {
  const entries = [];
  const push = (action, actor, timestamp, details = '') => {
    if (!timestamp) return;
    entries.push({ action, actor: actor || 'System', timestamp, details });
  };

  /* 1. The record's own trail (activity / auditHistory). */
  const activity = buildActivity(type, record);
  activity.forEach((a) => push(a.label || a.type, a.actor, a.timestamp, a.note));

  /* 2. Version audit trails. */
  (versions || []).forEach((v) => {
    push(`Version v${v.version} — ${v.status || 'Generated'}`, v.createdBy || v.updatedBy, v.createdAt, v.changeReason || v.description);
    (v.auditTrail || []).forEach((a) => {
      push(`v${v.version}: ${a.action}`, a.performedBy, a.performedAt, a.details);
    });
  });

  /* 3. Shared audit service entries for this document (views, uploads,
        downloads, renames … recorded by the document repository). */
  const docNo = recordId(type, record);
  const meta = DOC360_TYPES[type];
  try {
    const recent = await documentAuditService.getRecentAudit({ limit: 300 });
    (recent || []).forEach((entry) => {
      const doc = entry.document || {};
      if (doc.docNo === docNo || (meta?.stage && doc.stage === meta.stage)) {
        push(entry.action, entry.user?.name, entry.timestamp, entry.details);
      }
    });
  } catch {
    /* Shared audit is best-effort. */
  }

  entries.sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
  return entries;
}

/** Exceptions / flags per document type — derived from real fields. */
function buildExceptions(type, record) {
  const out = [];
  const push = (severity, title, detail) => out.push({ severity, title, detail });

  switch (type) {
    case 'pr':
      if (record.status === 'Rejected') push('error', 'Requisition rejected', record.approvalNote || record.notes || 'Rejected during approval.');
      if (record.status === 'Returned') push('warning', 'Returned to requester', (record.comments || []).map((c) => c.text).join(' ') || 'Please review and resubmit.');
      break;
    case 'rfq':
      if (record.status === RFQ_STATUS.CANCELLED) push('warning', 'RFQ cancelled', record.notes || 'Cancelled before completion.');
      if (record.dueDate && record.dueDate < todayLocal() && !['Closed', 'Cancelled', 'Awarded'].includes(record.status)) {
        push('error', 'RFQ response overdue', `Due date ${record.dueDate} has passed — vendors may still be responding.`);
      }
      break;
    case 'quotation':
      if (String(record.status || '').toLowerCase() === 'rejected') push('warning', 'Quotation rejected', 'This vendor quotation was not accepted.');
      if (record.validUntil && record.validUntil < todayLocal()) push('warning', 'Quotation expired', `Validity ended on ${record.validUntil}.`);
      break;
    case 'po':
      if (record.budget && record.budget.ok === false) {
        push('error', 'Budget shortage', `Shortage ${record.budget.shortage} against ${record.budget.budgetLabel || 'budget'}.`);
      }
      if (record.correctionRequested) push('warning', 'Correction requested', record.correctionReason || 'Approver requested changes.');
      if (record.status === 'Cancelled') push('warning', 'PO cancelled', record.notes || 'Cancelled during its lifecycle.');
      if (record.advanceStatus === 'Rejected') push('warning', 'Advance payment rejected', record.advanceApproval?.remarks || '');
      break;
    case 'grn': {
      const ordered = (record.items || []).reduce((s, l) => s + (Number(l.qty) || 0), 0);
      const received = (record.items || []).reduce((s, l) => s + (Number(l.received) || 0), 0);
      if (ordered > 0 && received < ordered) push('warning', 'Partial receipt', `${received} of ${ordered} units received — balance ${ordered - received}.`);
      if (record.status === GRN_STATUS.PENDING_INSPECTION) push('info', 'Pending inspection', 'Goods received but not yet cleared by quality inspection.');
      break;
    }
    case 'inventory':
      if (record.reversalOf) push('warning', 'Reversed movement', `This entry reverses ${record.reversalOf}.`);
      if (record.reversalId) push('info', 'Reversal posted', `Reversed by ${record.reversalId}.`);
      if (Number(record.delta) < 0) push('info', 'Stock issue', 'Stock moved out of the warehouse.');
      break;
    case 'invoice':
      if (record.matchStatus === MATCH_STATUS.EXCEPTION) {
        push('error', 'Match exception', (record.matchReasons || []).join(' ') || 'Invoice could not be matched.');
      }
      if (record.matchStatus === MATCH_STATUS.MISMATCH) {
        push('error', 'Three-way mismatch', (record.matchReasons || []).join(' ') || 'Invoice does not match PO / GRN.');
      }
      if (record.rejectionReason) push('error', 'Invoice rejected', record.rejectionReason);
      if (record.correctionRequested) push('warning', 'Correction requested', record.correctionReason || '');
      if (record.status === INVOICE_STATUS.OVERDUE) push('warning', 'Payment overdue', 'Due date has passed and the invoice is unpaid.');
      break;
    case 'payment':
      if (record.status !== 'Sent' && record.status !== 'Issued') push('info', 'Advice not sent', `Advice status is ${record.status || 'Not Issued'}.`);
      if (record.status === 'Sent') push('info', 'Advice sent', 'Payment advice sent to the vendor.');
      break;
    default:
      break;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*  Public service                                                    */
/* ------------------------------------------------------------------ */

export const document360Service = {
  DOC360_TYPES,
  DOC360_CHAIN,

  /** Resolve the raw record for a document type + id. */
  resolveRecord,

  /** True when a 360° view route exists for this type. */
  hasRoute(type) {
    return DOC360_ROUTED.includes(type);
  },

  /**
   * Builds the complete 360 payload for a document.
   *
   * @returns {Promise<Object>} normalized sections + the real record.
   * @throws {Error} when the record cannot be resolved.
   */
  async getDocument360(type, id) {
    const record = await asyncResolveRecord(type, id);
    if (!record) throw new Error(`${DOC360_TYPES[type]?.label || type} not found`);
    const graph = collectGraph(type, record);
    const meta = DOC360_TYPES[type];

    /* Versions from the document versioning service. */
    let versions;
    try {
      versions = await documentVersioningService.getVersions(meta.versionDocType, recordId(type, record));
    } catch {
      versions = [];
    }

    /* Repository documents attached to this source record. */
    const repoDocs = (documentsStore.all || []).filter(
      (doc) => doc.recordState === 'active' && doc.sourceId === recordId(type, record)
    );
    /* Repository documents that reference this record by number. */
    const refDocs = (documentsStore.all || []).filter((doc) => {
      if (doc.recordState !== 'active') return false;
      const docNo = recordId(type, record);
      if (!docNo) return false;
      if (type === 'pr') return doc.prNo === docNo;
      if (type === 'rfq') return doc.rfqNo === docNo;
      if (type === 'po') return doc.poNo === docNo;
      return false;
    });

    /* NFA / evaluation documents linked to an RFQ. */
    const relatedExtras = [];
    if (type === 'rfq') {
      nfasStore.all
        .filter((n) => n.rfqNo === record.rfqNo)
        .forEach((n) => relatedExtras.push(node('nfa', n)));
      evaluationsStore.all
        .filter((e) => e.rfqNo === record.rfqNo)
        .forEach((e) => {
          relatedExtras.push({
            type: 'evaluation',
            id: e.id || e.rfqNo,
            record: e
          });
        });
    }

    /* Related documents — every real node in the graph grouped by type,
       ordered by the canonical chain, plus the extras. */
    const related = DOC360_CHAIN
      .map((stage) => ({
        stage,
        docs: (graph.byStage[stage] || []).map((n) => ({
          type: n.type,
          id: n.id,
          number: numberOf(n),
          label: DOC360_TYPES[n.type]?.label || n.type,
          short: DOC360_TYPES[n.type]?.short || n.type,
          status: statusOf(n),
          vendor: vendorOf(n),
          date: dateOf(n),
          route: relatedRoute(n),
          route360: document360Route(n.type, n.record)
        }))
      }))
      .filter((group) => group.docs.length > 0);
    if (relatedExtras.length > 0) {
      related.push({
        stage: 'extra',
        docs: relatedExtras.map((n) => ({
          type: n.type,
          id: n.id,
          number: n.type === 'nfa' ? (n.record.nfaNo || n.id) : n.id,
          label: n.type === 'nfa' ? 'Approval Note' : 'Technical Evaluation',
          short: n.type === 'nfa' ? 'NFA' : 'Evaluation',
          status: n.record.status || n.record.selection?.selectedVendor ? 'Evaluated' : '',
          vendor: n.record.supplier || n.record.selection?.selectedVendor || '',
          date: n.record.raisedAt || n.record.createdAt || '',
          route: relatedRoute(n),
          route360: ''
        }))
      });
    }

    const currency = record.currency || 'INR';
    const amount =
      Number(record.amount) ||
      Number(record.total) ||
      Number(record.awardedValue) ||
      Number(record.advanceAmount) ||
      0;

    const audit = await buildAudit(type, record, versions);

    return {
      type,
      id: recordId(type, record),
      meta,
      record,
      currency,
      amount,
      docNo: recordId(type, record),
      title: titleOf(type, record),
      subtitle: subtitleOf(type, record),
      vendor: vendorOf(node(type, record)),
      status: statusOf(node(type, record)),
      date: dateOf(node(type, record)),
      sourceRoute: documentSourceRoute(type, record),
      route360: document360Route(type, record),
      listRoute: meta.listRoute,
      overview: buildOverview(type, record),
      items: buildItems(type, record),
      financials: buildFinancials(type, record, graph),
      activity: buildActivity(type, record),
      related,
      approvals: buildApprovals(type, record),
      attachments: (record.attachments || []).filter(Boolean),
      repoDocuments: [...repoDocs, ...refDocs],
      comments: (record.comments || []).filter(Boolean),
      audit,
      versions,
      exceptions: buildExceptions(type, record)
    };
  }
};

/* ------------------------------------------------------------------ */
/*  Display helpers                                                   */
/* ------------------------------------------------------------------ */

function titleOf(type, record) {
  switch (type) {
    case 'pr': return record.title || record.prNo || '';
    case 'rfq': return record.title || record.rfqNo || '';
    case 'quotation': return `Quote from ${record.vendor || 'vendor'}`;
    case 'po': return record.title || 'Purchase order';
    case 'grn': return `Goods receipt — ${record.vendor || ''}`;
    case 'inventory': return record.product || record.sku || '';
    case 'invoice': return record.vendor ? `Invoice from ${record.vendor}` : 'Purchase invoice';
    case 'payment': return `Payment ${record.paymentNo || record.adviceNo || ''}`;
    case 'shipment': return `Shipment — ${record.vendor || ''}`;
    case 'inspection': return `Inspection — ${record.vendor || ''}`;
    case 'nfa': return record.title || `Approval Note ${record.nfaNo || ''}`;
    default: return '';
  }
}

function subtitleOf(type, record) {
  switch (type) {
    case 'pr': return `${record.prNo} · ${record.vendor || '—'}`;
    case 'rfq': return `${record.rfqNo} · ${(record.vendors || []).join(', ') || '—'}`;
    case 'quotation': return `${record.quotationNo || record.id} · ${record.rfqNo || ''}`;
    case 'po': return `${record.poNo} · ${record.vendor || ''}`;
    case 'grn': return `${record.grnNo} · ${record.vendor || ''}`;
    case 'inventory': return `${record.id} · ${record.warehouse || ''}`;
    case 'invoice': return `${record.invoiceNo} · ${record.vendor || ''}`;
    case 'payment': return `${record.adviceNo || record.paymentNo || ''} · ${record.vendor || ''}`;
    default: return '';
  }
}

function numberOf(node) {
  const r = node.record;
  switch (node.type) {
    case 'pr': return r.prNo || r.id;
    case 'rfq': return r.rfqNo || r.id;
    case 'quotation': return r.quotationNo || r.id;
    case 'po': return r.poNo || r.id;
    case 'shipment': return r.shipmentNo || r.id;
    case 'grn': return r.grnNo || r.id;
    case 'inspection': return r.inspectionNo || r.id;
    case 'inventory': return r.id;
    case 'invoice': return r.invoiceNo || r.id;
    case 'payment': return r.adviceNo || r.paymentNo || r.id;
    case 'nfa': return r.nfaNo || r.id;
    default: return r.id;
  }
}

function statusOf(node) {
  const r = node.record;
  switch (node.type) {
    case 'pr': return r.status;
    case 'rfq': return r.status;
    case 'quotation': return r.status;
    case 'po': return r.status;
    case 'shipment': return r.status;
    case 'grn': return r.status;
    case 'inspection': return r.status;
    case 'inventory': return r.type;
    case 'invoice': return r.status;
    case 'payment': return r.status;
    case 'nfa': return r.status;
    default: return '';
  }
}

function vendorOf(node) {
  const r = node.record;
  if (node.type === 'rfq') return (r.vendors || []).join(', ');
  return r.vendor || r.supplier || r.selectedVendor || '';
}

function dateOf(node) {
  const r = node.record;
  const value =
    r.createdAt || r.submittedOn || r.orderDate || r.receivedOn ||
    r.updatedOn || r.raisedAt || r.invoiceDate || r.paidOn || '';
  return value || '';
}