/**
 * purchase/services/globalSearch.js
 * ------------------------------------------------------------------
 * Purchase global search.
 *
 * Searches EVERY document type in the module — PR, RFQ, Quotation,
 * Vendor, PO, Packing, Shipment, GRN, Inspection, Inventory, Invoice,
 * Payment and Repository Document — by:
 *
 *   · Document Number     (prNo / rfqNo / poNo / grnNo / …)
 *   · Vendor              (vendor name on the record)
 *   · SKU                 (inventory sku / itemCode)
 *   · Item                (product names on line items)
 *   · Reference           (PR reference / PO / GRN / source chain)
 *   · Invoice Number      (invoiceNo / vendorInvoiceNo)
 *
 * Every result resolves to the REAL record (a working route — never a
 * guessed one) and carries the related-document chain in canonical
 * workflow order:
 *
 *   PR → RFQ → Quotation → PO → Packing → Shipment → GRN →
 *   Inspection → Inventory → Invoice → Payment
 *
 * so searching any one document number surfaces the whole chain it
 * belongs to. Results are built exclusively from the live stores —
 * nothing is synthetic.
 * ------------------------------------------------------------------
 */
import { requisitionsStore } from './requisition';
import { rfqsStore, quotationsStore } from './rfq';
import { ordersStore } from './purchaseOrder';
import {
  manufacturingStore, shipmentsStore, grnsStore,
  inspectionsStore, inventoryStore
} from './logistics';
import { invoicesStore, advicesStore } from './invoice';
import { vendorsStore } from './vendor';
import { documentsStore } from './documents';
import { documentSourceRoute, document360Route } from './document360';
import { delay } from './base';

/** Canonical workflow order for the related chain. */
export const CHAIN_ORDER = [
  'pr', 'rfq', 'quotation', 'po', 'packing', 'shipment',
  'grn', 'inspection', 'inventory', 'invoice', 'payment'
];

const SHORT_LABEL = {
  pr: 'PR', rfq: 'RFQ', quotation: 'Quotation', po: 'PO', packing: 'Packing',
  shipment: 'Shipment', grn: 'GRN', inspection: 'Inspection',
  inventory: 'Inventory', invoice: 'Invoice', payment: 'Payment',
  vendor: 'Vendor', document: 'Document'
};

/* ------------------------------------------------------------------ */
/*  Per-type accessors                                                */
/* ------------------------------------------------------------------ */

const recordsOf = {
  pr: () => requisitionsStore.all,
  rfq: () => rfqsStore.all,
  quotation: () => quotationsStore.all,
  vendor: () => vendorsStore.all,
  po: () => ordersStore.all,
  packing: () => manufacturingStore.all,
  shipment: () => shipmentsStore.all,
  grn: () => grnsStore.all,
  inspection: () => inspectionsStore.all,
  inventory: () => inventoryStore.all,
  invoice: () => invoicesStore.all,
  payment: () => [
    ...advicesStore.all.map((a) => ({ ...a, _fromAdvice: true })),
    ...invoicesStore.all.flatMap((inv) =>
      (inv.paymentHistory || []).map((h) => ({
        ...h,
        id: h.paymentNo || `${inv.invoiceNo}-${h.paymentNo}`,
        invoiceNo: inv.invoiceNo,
        vendor: inv.vendor || '',
        poNo: inv.poNo || '',
        _fromLedger: true
      }))
    )
  ],
  document: () => documentsStore.all
};

const numberOf = {
  pr: (r) => r.prNo || r.id,
  rfq: (r) => r.rfqNo || r.id,
  quotation: (r) => r.quotationNo || r.id,
  vendor: (r) => r.name || r.id,
  po: (r) => r.poNo || r.id,
  packing: (r) => r.packingNo || r.id,
  shipment: (r) => r.shipmentNo || r.id,
  grn: (r) => r.grnNo || r.id,
  inspection: (r) => r.inspectionNo || r.id,
  inventory: (r) => r.id || r.sku || '',
  invoice: (r) => r.invoiceNo || r.id,
  payment: (r) => r.paymentNo || r.adviceNo || r.id,
  document: (r) => r.name || r.docNo || r.docId
};

const vendorOf = {
  pr: (r) => r.vendor || '',
  rfq: (r) => (Array.isArray(r.vendors) ? r.vendors.join(', ') : r.vendor || ''),
  quotation: (r) => r.vendor || '',
  vendor: (r) => r.name || '',
  po: (r) => r.vendor || '',
  packing: (r) => r.vendor || '',
  shipment: (r) => r.vendor || '',
  grn: (r) => r.vendor || '',
  inspection: (r) => r.vendor || '',
  inventory: (r) => r.vendor || '',
  invoice: (r) => r.vendor || '',
  payment: (r) => r.vendor || '',
  document: (r) => r.vendor || ''
};

const statusOf = {
  pr: (r) => r.status || '',
  rfq: (r) => r.status || '',
  quotation: (r) => r.status || '',
  vendor: (r) => r.status || '',
  po: (r) => r.status || '',
  packing: (r) => r.status || '',
  shipment: (r) => r.status || '',
  grn: (r) => r.status || '',
  inspection: (r) => r.status || '',
  inventory: (r) => r.type || r.status || '',
  invoice: (r) => r.status || '',
  payment: (r) => r.status || '',
  document: (r) => r.status || ''
};

const dateOf = {
  pr: (r) => r.date || r.createdAt || '',
  rfq: (r) => r.dueDate || r.createdAt || '',
  quotation: (r) => r.submittedOn || r.createdAt || '',
  vendor: (r) => r.createdAt || '',
  po: (r) => r.orderDate || r.createdAt || '',
  packing: (r) => r.startDate || r.createdAt || '',
  shipment: (r) => r.dispatchDate || r.createdAt || '',
  grn: (r) => r.receivedOn || r.createdAt || '',
  inspection: (r) => r.inspectedOn || r.createdAt || '',
  inventory: (r) => r.updatedOn || r.createdAt || '',
  invoice: (r) => r.invoiceDate || r.createdAt || '',
  payment: (r) => r.paidOn || r.createdAt || '',
  document: (r) => r.uploadedAt || r.createdAt || ''
};

/** Extra searchable strings per record (references, items, SKUs). */
function extraHaystack(type, r) {
  const parts = [];
  const items = Array.isArray(r.items) ? r.items : [];
  items.forEach((line) => {
    if (line.product) parts.push(String(line.product));
    if (line.sku) parts.push(String(line.sku));
    if (line.itemCode) parts.push(String(line.itemCode));
    if (line.hsn) parts.push(String(line.hsn));
  });
  if (r.reference) parts.push(String(r.reference));
  if (r.prNo) parts.push(String(r.prNo));
  if (r.poNo) parts.push(String(r.poNo));
  if (r.rfqNo) parts.push(String(r.rfqNo));
  if (r.grnNo) parts.push(String(r.grnNo));
  if (r.invoiceNo) parts.push(String(r.invoiceNo));
  if (r.vendorInvoiceNo) parts.push(String(r.vendorInvoiceNo));
  if (r.sku) parts.push(String(r.sku));
  if (r.itemCode) parts.push(String(r.itemCode));
  if (r.product) parts.push(String(r.product));
  if (r.notes) parts.push(String(r.notes));
  if (r.title) parts.push(String(r.title));
  return parts;
}

/** Route to the REAL record — never a guessed one. */
const routeOf = {
  pr: (r) => documentSourceRoute('pr', r),
  rfq: (r) => documentSourceRoute('rfq', r),
  quotation: (r) => documentSourceRoute('quotation', r),
  vendor: (r) => `/purchase/vendors/${r.id}`,
  po: (r) => documentSourceRoute('po', r),
  packing: (r) => `/purchase/logistics/manufacturing/${r.packingNo}`,
  shipment: (r) => documentSourceRoute('shipment', r),
  grn: (r) => documentSourceRoute('grn', r),
  inspection: (r) => documentSourceRoute('inspection', r),
  inventory: (r) => documentSourceRoute('inventory', r),
  invoice: (r) => documentSourceRoute('invoice', r),
  payment: (r) => (r.adviceNo || r.paymentNo ? `/purchase/payments/${r.adviceNo || r.paymentNo}/360` : '/purchase/invoices/payment-advice'),
  document: () => '/purchase/documents'
};

/** 360 route when the type supports one (audit chain chip). */
function route360Of(type, r) {
  if (type === 'payment') return routeOf.payment(r);
  return document360Route(type, r) || '';
}

/* ------------------------------------------------------------------ */
/*  Related chain                                                     */
/* ------------------------------------------------------------------ */

function findBy(list, predicate) {
  return list.find(predicate) || null;
}

/**
 * Resolves the related-document chain for a record in canonical
 * workflow order (PR → RFQ → Quotation → PO → Packing → Shipment →
 * GRN → Inspection → Inventory → Invoice → Payment), resolving every
 * stage from the REAL stores via reference fields. The searched record
 * is marked `current` at its own position in the chain.
 */
export function buildRelatedChain(type, record) {
  if (!record) return [];

  const prNo = record.prNo || (record.reference && String(record.reference).startsWith('PR-') ? record.reference : '');
  const rfqNo = record.rfqNo || '';
  const poNo = record.poNo || '';
  const grnNo = record.grnNo || '';
  const invoiceNo = record.invoiceNo || '';
  const vendor = vendorOf[type] ? vendorOf[type](record) : '';

  /* One resolver per stage. Each returns the real record or null;
     upstream stages walk the chain through the PO / RFQ references so
     a document that only references its PO still surfaces the PR and
     RFQ that started the chain. */
  const resolve = {
    po: () => {
      if (type === 'po') return record;
      return poNo ? findBy(ordersStore.all, (o) => o.poNo === poNo) : null;
    },
    rfq: () => {
      if (type === 'rfq') return record;
      const no = rfqNo || resolve.po()?.rfqNo || '';
      return no ? findBy(rfqsStore.all, (r) => r.rfqNo === no) : null;
    },
    pr: () => {
      if (type === 'pr') return record;
      const po = resolve.po();
      let no =
        prNo ||
        po?.prNo ||
        (po?.reference && String(po.reference).startsWith('PR-') ? po.reference : '');
      if (!no) {
        const ref = resolve.rfq()?.reference;
        if (ref && String(ref).startsWith('PR-')) no = ref;
      }
      return no ? findBy(requisitionsStore.all, (r) => r.prNo === no) : null;
    },
    quotation: () => {
      if (type === 'quotation') return record;
      const rfq = resolve.rfq();
      if (!rfq) return null;
      return (
        findBy(quotationsStore.all, (q) => q.rfqNo === rfq.rfqNo) ||
        findBy(quotationsStore.all, (q) => q.rfqNo === rfq.rfqNo && vendorMatch(q.vendor, vendor))
      );
    },
    packing: () => {
      if (type === 'packing') return record;
      return poNo ? findBy(manufacturingStore.all, (m) => m.poNo === poNo) : null;
    },
    shipment: () => {
      if (type === 'shipment') return record;
      return poNo ? findBy(shipmentsStore.all, (s) => s.poNo === poNo) : null;
    },
    grn: () => {
      if (type === 'grn') return record;
      if (grnNo) return findBy(grnsStore.all, (g) => g.grnNo === grnNo);
      return poNo ? findBy(grnsStore.all, (g) => g.poNo === poNo) : null;
    },
    inspection: () => {
      if (type === 'inspection') return record;
      const grn = resolve.grn();
      return grn ? findBy(inspectionsStore.all, (i) => i.grnNo === grn.grnNo) : null;
    },
    inventory: () => {
      if (type === 'inventory') return record;
      const grn = resolve.grn();
      return grn
        ? findBy(inventoryStore.all, (m) => m.grnNo === grn.grnNo || m.reference === grn.grnNo)
        : null;
    },
    invoice: () => {
      if (type === 'invoice') return record;
      if (invoiceNo) return findBy(invoicesStore.all, (i) => i.invoiceNo === invoiceNo);
      return poNo ? findBy(invoicesStore.all, (i) => i.poNo === poNo) : null;
    },
    payment: () => {
      if (type === 'payment') return record;
      const invoice = resolve.invoice();
      const invNo = invoice?.invoiceNo || invoiceNo;
      return invNo ? findBy(advicesStore.all, (a) => a.invoiceNo === invNo) : null;
    }
  };

  const chain = CHAIN_ORDER
    .map((stage) => {
      const rec = resolve[stage]();
      if (!rec) return null;
      return {
        type: stage,
        short: SHORT_LABEL[stage] || stage,
        number: numberOf[stage](rec),
        route: routeOf[stage](rec),
        route360: route360Of(stage, rec),
        current: stage === type
      };
    })
    .filter(Boolean);

  return chain;
}

/** Loose vendor comparison for chain resolution. */
function vendorMatch(a, b) {
  const x = String(a || '').trim().toLowerCase();
  const y = String(b || '').trim().toLowerCase();
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
}

/* ------------------------------------------------------------------ */
/*  Search                                                           */
/* ------------------------------------------------------------------ */

const SEARCHABLE_TYPES = Object.keys(recordsOf);

/** One record → normalized searchable haystack string. */
function haystackFor(type, record) {
  const fields = [
    numberOf[type](record),
    vendorOf[type](record),
    statusOf[type](record),
    ...extraHaystack(type, record)
  ];
  return fields.filter((f) => f != null && f !== '').join(' ').toLowerCase();
}

/** True when every query token appears in the haystack. */
function matchesQuery(haystack, tokens) {
  return tokens.every((token) => haystack.includes(token));
}

/**
 * Searches every Purchase document type.
 *
 * @param {string} query  - any document number, vendor, SKU, item,
 *                          reference or invoice number.
 * @param {object} [options] - { limit = 8 per type }
 * @returns {Promise<Array>} flat result list:
 *   { type, id, number, title, vendor, status, date, route, route360, chain }
 */
export async function searchAll(query, { limit = 8 } = {}) {
  await delay();
  const q = String(query || '').trim();
  if (!q) return [];
  const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);

  const results = [];
  SEARCHABLE_TYPES.forEach((type) => {
    const records = recordsOf[type]() || [];
    let count = 0;
    for (const record of records) {
      if (count >= limit) break;
      if (!matchesQuery(haystackFor(type, record), tokens)) continue;
      count += 1;
      const number = numberOf[type](record);
      results.push({
        type,
        id: record.id || number,
        number,
        title: number,
        vendor: vendorOf[type](record),
        status: statusOf[type](record),
        date: dateOf[type](record),
        route: routeOf[type](record),
        route360: route360Of(type, record),
        chain: buildRelatedChain(type, record)
      });
    }
  });

  /* Rank: exact number match first, then prefix, then the rest. */
  const lowered = q.toLowerCase();
  results.sort((a, b) => {
    const aExact = String(a.number).toLowerCase() === lowered ? 0 : 1;
    const bExact = String(b.number).toLowerCase() === lowered ? 0 : 1;
    if (aExact !== bExact) return aExact - bExact;
    const aPrefix = String(a.number).toLowerCase().startsWith(lowered) ? 0 : 1;
    const bPrefix = String(b.number).toLowerCase().startsWith(lowered) ? 0 : 1;
    return aPrefix - bPrefix;
  });

  return results;
}

export const globalSearchService = {
  searchAll,
  buildRelatedChain,
  CHAIN_ORDER
};