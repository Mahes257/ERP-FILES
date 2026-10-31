/**
 * purchase/services/rfq.js
 * ------------------------------------------------------------------
 * Mock RFQ & Quotations service covering the full enterprise sourcing
 * workflow: Draft → Pending Approval → Approved → Sent →
 * Quotation Received → Evaluation → Awarded → Closed (Cancelled as a
 * terminal side-branch).
 *
 * Data persists to localStorage via lazy collections. Each RFQ carries
 * general info, line items, invited vendors, commercial terms, comments,
 * attachments and a full activity / audit trail. Quotations are scored
 * on six weighted criteria — price, delivery, lead time, warranty,
 * payment terms and vendor quality rating — so the comparison,
 * evaluation and cost-estimation screens can rank vendors objectively.
 * ------------------------------------------------------------------
 */
import { APPROVAL_STATUS, PAYMENT_TERMS, PO_STATUS, PR_STATUS, PRIORITIES, QUOTATION_STATUS, RFQ_SCORING_WEIGHTS, RFQ_STATUS, RFQ_STATUSES, WARRANTY_TERMS, deriveWorkflowStage } from '../constants';
import { calcDocumentTotals, formatAmount, nextSeqNo, normalizePurchaseRequest, round2 } from '../utils/purchase';
import { rfqApi } from './api/rfqApi';
import { getCurrentActor, withFallback } from './api-client';
import { clone, createCollection, delay, paginate, storageKeys, todayLocal } from './base';
import { safeGetTime } from '../utils/helpers';
import { getDefaultCurrency } from './settings';
import { isVendorRfqEligible, vendorsStore } from './vendor';
/* ordersStore is read-only here (enrichRfq derives the linked PO's
   lifecycle for the canonical workflow's final stages). purchaseOrder.js
   never imports this module, so the edge is one-directional. */
import { mockPurchaseOrderService, ordersStore } from './purchaseOrder';
/* Circular with ./evaluation (which imports the rfq / quotation stores
   above) is safe: evaluationsStore is only touched at call time inside
   awardRfq, never during module evaluation. buildAwardAllocations is a
   pure helper — no store access at module evaluation time. */
import { buildAwardAllocations, evaluationsStore } from './evaluation';
/* Circular with ./nfa (which imports the rfq stores above) is safe the
   same way: repairRfqApprovalStatuses is only invoked at call time
   inside the RFQ reads below, never during module evaluation. It is
   the single source that derives the RFQ status from the Approval
   Flow (NFA) state, so the RFQ list always reads the synced value. */
import { repairRfqApprovalStatuses } from './nfa';
/* Circular with ./requisition (which imports mockRfqService above) is safe:
   requisitionsStore is only touched at call time inside raisePurchaseOrder,
   never during module evaluation. */
import { requisitionsStore } from './requisition';
/* Circular with ./rfqFollowUp (which imports the rfq stores above) is
   safe: ensureSentFollowUp is only invoked at call time inside sendRfq. */
import { ensureSentFollowUp } from './rfqFollowUp';

export { QUOTATION_STATUS, RFQ_STATUS };

function nowIso() {
  return new Date().toISOString();
}

function activityEntry(type, label, note = '') {
  const actor = getCurrentActor();
  return {
    id: `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type,
    label,
    actor: actor.name || 'System',
    timestamp: nowIso(),
    note
  };
}


/** Resolves an invited vendor name against the vendor master (exact match
 *  first, then a loose includes-match so legacy names like "Tata Steel Ltd"
 *  still resolve to the "Tata Steel" master record). Shared by the send-RFQ
 *  guard and quotation recording. */
function resolveVendorByName(name) {
  return (
    vendorsStore.all.find((entry) => entry.name === name) ||
    vendorsStore.all.find((entry) => entry.name && (entry.name.includes(name) || name.includes(entry.name))) ||
    null
  );
}

/** The vendor master's 0-5 star rating for a vendor name (0 when unknown). */
function vendorRatingOf(vendorName) {
  return Number(resolveVendorByName(vendorName)?.rating) || 0;
}

/** Trailing numeric sequence of a quotation number (0 when the
 *  value doesn't match QT-NNN format). */
function quotationSeq(record) {
  const value = String(record?.quotationNo || record?.id || '');
  const match = /^QT-(\d+)$/.exec(value);
  return match ? Number(match[1]) : 0;
}

/** Next quotation number (QT-001, QT-002, ...) — one above the highest
 *  existing sequence, so it can never collide with a stored quotation.
 *  Nothing is hardcoded: the number is derived from the stored records. */
function nextQuotationNo(records = []) {
  const highest = records.reduce((max, record) => Math.max(max, quotationSeq(record)), 0);
  return `QT-${String(highest + 1).padStart(3, '0')}`;
}

const DEFAULT_COMMERCIAL_TERMS = {
  paymentTerms: '30 Days',
  deliveryTerms: '30 Days',
  warranty: '12 Months',
  taxRate: 18,
  freight: 'Included in Price',
  insurance: 'Buyer Arranges'
};


/** Seed RFQs — returns empty. Real data from the API. */
function rfqSeed() {
  return [];
}

const QUOTE_RATES = {
  'Tata Steel Ltd': { factor: 1.0, discount: 2 },
  'JSW Steel': { factor: 0.96, discount: 1.5 },
  'Bharat Forge': { factor: 1.04, discount: 1 },
  'Siemens India': { factor: 1.0, discount: 0 },
  'Havells India': { factor: 0.92, discount: 2.5 },
  'Godrej Consumer': { factor: 0.9, discount: 1 },
  'Crompton Greaves': { factor: 0.94, discount: 1.5 },
  'Bosch': { factor: 1.05, discount: 1 }
};

/* ------------------------------------------------------------------ */
/*  Vendor quotation scoring — six weighted criteria:
 *    price (comparative vs cheapest), delivery, lead time, warranty,
 *    payment terms and vendor quality rating.
 *  Scores are 0-100 per criterion; the composite is a weighted mean
 *  (weights from RFQ_SCORING_WEIGHTS). `scoreBreakdown` lets the UI
 *  show exactly why a vendor ranks where it does.
 * ------------------------------------------------------------------ */
function paymentTermsScore(terms) {
  const map = {
    Advance: 30,
    'On Delivery': 40,
    '7 Days': 50,
    '15 Days': 60,
    '30 Days': 70,
    '45 Days': 80,
    '60 Days': 90,
    '90 Days': 100
  };
  return map[terms] ?? 60;
}

function warrantyScore(warranty) {
  const months = Number.parseInt(String(warranty || ''), 10);
  if (!Number.isFinite(months)) return warranty === 'None' ? 15 : 60;
  if (months >= 12) return 100;
  if (months >= 6) return 70;
  if (months >= 3) return 50;
  return 30;
}

function vendorQualityScore(vendorName) {
  const rating = vendorRatingOf(vendorName);
  const effective = rating > 0 ? rating : 3.5;
  return Math.round(Math.max(0, Math.min(5, effective)) * 20);
}

/** Absolute per-criterion scores (price needs the peer group). */
function quoteCriterionScores(quote, peers) {
  const totals = peers.map((q) => q.total);
  const min = totals.length ? Math.min(...totals) : quote.total;
  const max = totals.length ? Math.max(...totals) : quote.total;
  const range = max - min || 1;
  return {
    price: Math.max(0, Math.min(100, Math.round(100 * (1 - (quote.total - min) / range)))),
    delivery: Math.round(100 * Math.max(0, 1 - (Number(quote.delivery) || 0) / 60)),
    leadTime: Math.round(100 * Math.max(0, 1 - (Number(quote.leadTime) || 0) / 45)),
    warranty: warrantyScore(quote.warranty),
    paymentTerms: paymentTermsScore(quote.paymentTerms),
    quality: vendorQualityScore(quote.vendor)
  };
}

function computeQuoteScore(quote, peers) {
  const breakdown = quoteCriterionScores(quote, peers);
  const weights = RFQ_SCORING_WEIGHTS;
  const composite = Math.round(
    (breakdown.price * weights.price +
      breakdown.delivery * weights.delivery +
      breakdown.leadTime * weights.leadTime +
      breakdown.warranty * weights.warranty +
      breakdown.paymentTerms * weights.paymentTerms +
      breakdown.quality * weights.quality) /
      100
  );
  return { score: composite, scoreBreakdown: breakdown };
}

// eslint-disable-next-line no-unused-vars
function buildQuotations(rfqs) {
  const quotes = [];
  rfqs.forEach((rfq) => {
    rfq.vendors.forEach((vendor, vendorIndex) => {
      const config = QUOTE_RATES[vendor] || { factor: 1, discount: 0 };
      const items = rfq.items.map((item) => {
        const baseRate = Number(item.rate ?? item.expectedRate) || 0;
        return {
          product: item.product,
          hsn: item.hsn,
          uom: item.uom,
          qty: item.qty,
          rate: Math.round(baseRate * (config.factor + (vendorIndex * 0.01)) * 100) / 100
        };
      });
      const totals = calcDocumentTotals(items, config.discount, 0);
      const isTerminal = rfq.status === RFQ_STATUS.CLOSED || rfq.status === RFQ_STATUS.AWARDED;
      const isOpen = [RFQ_STATUS.SENT, RFQ_STATUS.QUOTATION_RECEIVED, RFQ_STATUS.EVALUATION].includes(rfq.status);
      const status = isTerminal
        ? vendorIndex === 0
          ? QUOTATION_STATUS.ACCEPTED
          : QUOTATION_STATUS.REJECTED
        : isOpen
          ? QUOTATION_STATUS.RECEIVED
          : QUOTATION_STATUS.PENDING;
      const leadTime = 7 + (vendorIndex * 4) + (rfq.vendors.length % 3);
      const delivery = 10 + (vendorIndex * 6);
      const paymentTerms = vendorIndex % 2 === 0 ? PAYMENT_TERMS[4] : PAYMENT_TERMS[3];
      quotes.push({
        id: `QT-${String(quotes.length + 1).padStart(3, '0')}`,
        /* Human-facing quotation number — plain QT-NNN (no fiscal year),
           matching nextQuotationNo() and the backend's nextQuotationNo. */
        quotationNo: `QT-${String(quotes.length + 1).padStart(3, '0')}`,
        rfqNo: rfq.rfqNo,
        /* The quotation always references its RFQ's originating PR. */
        prNo: rfq.reference || '',
        vendor,
        vendorRating: vendorRatingOf(vendor),
        freight: 0,
        insurance: 0,
        submittedOn: (() => {
          if (!isOpen && !isTerminal) return null;
          const createdMs = new Date(rfq.createdAt).getTime();
          return !Number.isNaN(createdMs)
            ? new Date(createdMs + (1 + vendorIndex) * 86400000).toISOString().slice(0, 10)
            : null;
        })(),
        validUntil: '2026-08-31',
        currency: rfq.currency,
        discount: config.discount,
        charges: 0,
        items,
        subtotal: totals.subtotal,
        discountAmount: totals.discountAmount,
        taxable: totals.taxable,
        gstTotal: totals.gstTotal,
        total: totals.total,
        leadTime,
        delivery,
        paymentTerms,
        warranty: rfq.commercialTerms?.warranty || WARRANTY_TERMS[3],
        score: 0,
        scoreBreakdown: null,
        status,
        notes: `${vendor} commercial offer against ${rfq.rfqNo}.`
      });
    });
  });

  /* Composite score per RFQ using the six weighted criteria. */
  const byRfq = {};
  quotes.forEach((quote) => {
    (byRfq[quote.rfqNo] = byRfq[quote.rfqNo] || []).push(quote);
  });
  Object.values(byRfq).forEach((group) => {
    group.forEach((quote) => {
      Object.assign(quote, computeQuoteScore(quote, group));
    });
  });
  return quotes;
}

/** Seed quotations — returns empty. Real data from the API. */
function quotationsSeed() {
  return [];
}

/** Lazy, localStorage-backed RFQ + quotation collections. */
export const rfqsStore = createCollection(storageKeys.rfqs, rfqSeed);
export const quotationsStore = createCollection(storageKeys.quotations, quotationsSeed);

function toFilter(value) {
  return value === undefined || value === null || value === '' || value === 'All' ? null : value;
}

function toFilterValue(value) {
  return value === undefined || value === null || value === '' || value === 'All' ? null : value;
}

function estimatedValueOf(rfq) {
  return (rfq.items || []).reduce(
    (sum, item) => sum + (Number(item.qty) || 0) * (Number(item.rate ?? item.expectedRate) || 0),
    0
  );
}

/** Attaches live quotation counts, estimated value and award info to an RFQ record. */
function enrichRfq(rfq) {
  const quotes = quotationsStore.all.filter((quote) => quote.rfqNo === rfq.rfqNo);
  const acceptedQuote = quotes.find((quote) => quote.status === QUOTATION_STATUS.ACCEPTED);
  /* Linked PO lifecycle — the PO record is the authority for the PO
     stages of the canonical workflow (PO_APPROVAL → PO_RELEASED →
     SUPPLIER_ACKNOWLEDGEMENT). The RFQ's explicit poNo/poNos win;
     seeded / legacy RFQs resolve the link via the PO's rfqNo field. */
  const linkedPo =
    ordersStore.all.find((po) => po.poNo === rfq.poNo || (rfq.poNos || []).includes(po.poNo)) ||
    ordersStore.all.find((po) => po.rfqNo && po.rfqNo === rfq.rfqNo) ||
    null;
  return {
    ...rfq,
    /* Form-created RFQs persist expectedRate (no rate key); normalize so
       consumers reading item.rate (view table, subtotal, print) render
       correctly for both seeded and form-created records. */
    items: (rfq.items || []).map((item) => ({ ...item, rate: item.rate ?? item.expectedRate ?? 0 })),
    /* Explicit PR link (task requirement) — falls back to the legacy
       reference so every RFQ exposes prNo even if stored before this
       field existed. */
    prNo: rfq.prNo || rfq.reference || null,
    createdBy: rfq.createdBy || rfq.requester || null,
    updatedAt: rfq.updatedAt || null,
    /* The actual procurement stage — a persisted workflowStage wins,
       otherwise derived from the document lifecycle status. */
    workflowStage: deriveWorkflowStage(rfq),
    /* PO lifecycle facts (null / false until a PO is linked) — derived
       from the PO record so the workflow stepper can light up the final
       stages without duplicating PO state on the RFQ. */
    poNo: rfq.poNo || linkedPo?.poNo || null,
    poNos: rfq.poNos || (linkedPo ? [linkedPo.poNo] : []),
    poApprovalStatus: linkedPo?.approvalStatus || null,
    poAcknowledged: Boolean(linkedPo?.acknowledged),
    poStatus: linkedPo?.status || null,
    estimatedValue: estimatedValueOf(rfq),
    approval: approvalLabel(rfq),
    quotationReceived: quotes.filter((quote) => quote.status === QUOTATION_STATUS.RECEIVED || quote.status === QUOTATION_STATUS.ACCEPTED).length,
    quotationPending: quotes.filter((quote) => quote.status === QUOTATION_STATUS.PENDING).length,
    /* Per-vendor quote summary — drives the RFQ list "Quotation Summary"
       column so users see which vendors quoted and how much. */
    vendorQuoteSummary: quotes
      .filter((quote) => [QUOTATION_STATUS.RECEIVED, QUOTATION_STATUS.ACCEPTED, QUOTATION_STATUS.REJECTED].includes(quote.status))
      .map((quote) => ({
        vendor: quote.vendor,
        amount: quote.total || 0,
        currency: quote.currency || 'INR',
        status: quote.status,
        quoteId: quote.id,
        quotationNo: quote.quotationNo || quote.id,
      })),
    awardedVendor: rfq.awardedVendor || acceptedQuote?.vendor || null,
    awardedQuoteId: rfq.awardedQuoteId || acceptedQuote?.id || null,
    awardedValue: rfq.awardedValue ?? acceptedQuote?.total ?? null,
    awardedAt: rfq.awardedAt || null
  };
}

/** True when an RFQ is part of the derived "Open" bucket. */
export function isOpenRfq(rfq) {
  return [RFQ_STATUS.SENT, RFQ_STATUS.QUOTATION_RECEIVED, RFQ_STATUS.EVALUATION].includes(rfq.status);
}

/** True when an RFQ is part of the derived "Active" bucket — i.e. every
 *  status except the terminal Closed / Cancelled states. The Approval
 *  Flow stages (Pending / Second / Final Approval) stay active until
 *  the award. */
function isActiveRfq(rfq) {
  return isOpenRfq(rfq) || [
    RFQ_STATUS.DRAFT, RFQ_STATUS.PENDING_APPROVAL, RFQ_STATUS.APPROVED,
    RFQ_STATUS.FIRST_APPROVAL, RFQ_STATUS.SECOND_APPROVAL,
    RFQ_STATUS.FINAL_APPROVAL, RFQ_STATUS.AWARDED
  ].includes(rfq.status);
}

/** True when an RFQ is still actionable but past its closing date — the
 *  "Overdue" bucket used by the RFQ list KPI + status filter. Drafts are
 *  never overdue (unassigned, not committed to vendors) and awarded /
 *  closed / cancelled RFQs are terminal (the sourcing concluded), so only
 *  Pending Approval → Evaluation (inclusive of Approved) with a due date
 *  in the past count. */
export function isOverdueRfq(rfq) {
  if (!rfq?.dueDate) return false;
  if (
    [RFQ_STATUS.DRAFT, RFQ_STATUS.AWARDED, RFQ_STATUS.CLOSED, RFQ_STATUS.CANCELLED].includes(rfq.status)
  ) {
    return false;
  }
  return safeGetTime(rfq.dueDate) < Date.now();
}

/** Number of live quotations received for an RFQ (Received or Accepted). */
function receivedQuotationCount(rfqNo) {
  return quotationsStore.all.filter(
    (quote) =>
      quote.rfqNo === rfqNo &&
      [QUOTATION_STATUS.RECEIVED, QUOTATION_STATUS.ACCEPTED].includes(quote.status)
  ).length;
}

/**
 * Repairs records left inconsistent before the quotation guard existed: an
 * RFQ can only sit in Evaluation / Quotation Received while it actually has
 * live quotations. One that has none is genuinely still waiting for vendor
 * responses, so it returns to Sent (the "Waiting for Quotations" stage) with
 * an activity entry. Idempotent — only persists when something changed.
 */
function repairInconsistentRfqStatuses() {
  const records = rfqsStore.all;
  let changed = false;
  records.forEach((rfq, index) => {
    const quoteCount = receivedQuotationCount(rfq.rfqNo);
    /* DOWNGRADE: Evaluation / Quotation Received with zero quotations → Sent */
    if (
      [RFQ_STATUS.EVALUATION, RFQ_STATUS.QUOTATION_RECEIVED].includes(rfq.status) &&
      quoteCount === 0
    ) {
      records[index] = {
        ...rfq,
        status: RFQ_STATUS.SENT,
        activity: [
          ...(Array.isArray(rfq.activity) ? rfq.activity : []),
          activityEntry('repair', `${rfq.rfqNo} returned to Sent — waiting for quotations`)
        ]
      };
      changed = true;
    }
    /* UPGRADE: Sent with received quotations → Quotation Received */
    else if (rfq.status === RFQ_STATUS.SENT && quoteCount > 0) {
      records[index] = {
        ...rfq,
        status: RFQ_STATUS.QUOTATION_RECEIVED,
        activity: [
          ...(Array.isArray(rfq.activity) ? rfq.activity : []),
          activityEntry('repair', `${rfq.rfqNo} advanced to Quotation Received — ${quoteCount} quotation(s) received`)
        ]
      };
      changed = true;
    }
  });
  if (changed) rfqsStore.persist(records);
}

/** Derived approval-state label for an RFQ (mirrors the list Approval column).
 *  A stored Rejected decision always wins so a rejected RFQ is never
 *  shown as approved; everything past Approved derives from the status. */
function approvalLabel(rfq) {
  if (rfq.approvalStatus === APPROVAL_STATUS.REJECTED) return APPROVAL_STATUS.REJECTED;
  if (rfq.status === RFQ_STATUS.CANCELLED) return '—';
  /* Post-sourcing Approval Flow — the initial RFQ approval already
     stands; the RFQ awaits the Approval Flow (NFA) decision, so the
     Approval column keeps reporting the original approval state. This
     covers Pending Approval plus the Second / Final approval stages. */
  if (
    [
      RFQ_STATUS.PENDING_APPROVAL, RFQ_STATUS.FIRST_APPROVAL,
      RFQ_STATUS.SECOND_APPROVAL, RFQ_STATUS.FINAL_APPROVAL
    ].includes(rfq.status) &&
    receivedQuotationCount(rfq.rfqNo) > 0
  ) {
    return 'Approved';
  }
  if (
    [RFQ_STATUS.APPROVED, RFQ_STATUS.SENT, RFQ_STATUS.QUOTATION_RECEIVED, RFQ_STATUS.EVALUATION, RFQ_STATUS.AWARDED, RFQ_STATUS.CLOSED].includes(rfq.status)
  ) {
    return 'Approved';
  }
  return 'Pending';
}

/** Resolves an RFQ by its internal id OR its human-facing RFQ number
 *  (e.g. RFQ-2026-0007), so document URLs work with either value. The
 *  internal id always wins — the number is only a fallback. */
function resolveRfqRecord(id) {
  return (
    rfqsStore.all.find((entry) => entry.id === id) ||
    rfqsStore.all.find((entry) => entry.rfqNo === id) ||
    null
  );
}

export const mockRfqService = {
  /** --------------------------------- RFQs --------------------------------- */
  async getRfqs({
    search = '',
    status = 'All',
    department = 'All',
    priority = 'All',
    category = 'All',
    project = 'All',
    requester = 'All',
    buyer = 'All',
    vendor = 'All',
    approvalStatus = 'All',
    currency = 'All',
    rfqNo = '',
    title = '',
    dateFrom = '',
    dateTo = '',
    closingFrom = '',
    closingTo = '',
    valueFrom = '',
    valueTo = '',
    page = 1,
    pageSize = 10,
    sortBy = 'createdAt',
    sortDir = 'desc'
  } = {}) {
    repairInconsistentRfqStatuses();
    /* Re-derive every RFQ status from its linked NFA (Approval Flow) —
       heals records whose status was left stale and guarantees the list
       shows the SAME status the Approval Flow reports. */
    repairRfqApprovalStatuses();
    await delay();
    const records = rfqsStore.all;
    const query = String(search).trim().toLowerCase();
    const statusFilter = toFilterValue(status);
    const departmentFilter = toFilterValue(department);
    const priorityFilter = toFilterValue(priority);
    const categoryFilter = toFilterValue(category);
    const projectFilter = toFilterValue(project);
    const requesterFilter = toFilterValue(requester);
    const buyerFilter = toFilterValue(buyer);
    const vendorFilter = toFilterValue(vendor);
    const approvalFilter = toFilterValue(approvalStatus);
    const currencyFilter = toFilterValue(currency);

    let filtered = records.filter((rfq) => {
      if (statusFilter) {
        if (statusFilter === 'Open') {
          if (!isOpenRfq(rfq)) return false;
        } else if (statusFilter === 'Active') {
          if (!isActiveRfq(rfq)) return false;
        } else if (statusFilter === 'Overdue') {
          if (!isOverdueRfq(rfq)) return false;
        } else if (rfq.status !== statusFilter) {
          return false;
        }
      }
      if (approvalFilter && approvalLabel(rfq) !== approvalFilter) return false;
      if (departmentFilter && rfq.department !== departmentFilter) return false;
      if (priorityFilter && rfq.priority !== priorityFilter) return false;
      if (categoryFilter && rfq.category !== categoryFilter) return false;
      if (projectFilter && rfq.project !== projectFilter) return false;
      if (requesterFilter && rfq.requester !== requesterFilter) return false;
      if (buyerFilter && rfq.buyer !== buyerFilter) return false;
      if (currencyFilter && rfq.currency !== currencyFilter) return false;
      if (vendorFilter && !(rfq.vendors || []).includes(vendorFilter)) return false;
      if (rfqNo && !String(rfq.rfqNo).toLowerCase().includes(String(rfqNo).trim().toLowerCase())) return false;
      if (title && !String(rfq.title).toLowerCase().includes(String(title).trim().toLowerCase())) return false;
      if (dateFrom && safeGetTime(rfq.createdAt) < safeGetTime(dateFrom)) return false;
      if (dateTo && safeGetTime(rfq.createdAt) > safeGetTime(`${dateTo}T23:59:59`)) return false;
      if (closingFrom && safeGetTime(rfq.dueDate) < safeGetTime(closingFrom)) return false;
      if (closingTo && safeGetTime(rfq.dueDate) > safeGetTime(`${closingTo}T23:59:59`)) return false;
      if (valueFrom && estimatedValueOf(rfq) < Number(valueFrom)) return false;
      if (valueTo && estimatedValueOf(rfq) > Number(valueTo)) return false;
      if (query) {
        const haystack = [rfq.rfqNo, rfq.title, rfq.description, rfq.reference, rfq.department, rfq.project, rfq.requester, rfq.buyer, ...(rfq.vendors || [])]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });

    const STRING_SORT_KEYS = ['rfqNo', 'title', 'department', 'project', 'requester', 'buyer', 'category', 'status', 'priority', 'currency', 'poNo', 'vendors'];
    const NUMERIC_SORT_KEYS = ['estimatedValue', 'vendorCount', 'quotationReceived'];
    const DATE_SORT_KEYS = ['dueDate', 'createdAt'];
    const sortable = [...STRING_SORT_KEYS, ...NUMERIC_SORT_KEYS, ...DATE_SORT_KEYS, 'approval'];
    const safeKey = sortable.includes(sortBy) ? sortBy : 'createdAt';
    filtered = [...filtered].sort((a, b) => {
      let aValue;
      let bValue;
      if (safeKey === 'approval') {
        aValue = approvalLabel(a);
        bValue = approvalLabel(b);
      } else if (NUMERIC_SORT_KEYS.includes(safeKey)) {
        aValue = Number(a[safeKey]) || 0;
        bValue = Number(b[safeKey]) || 0;
      } else if (DATE_SORT_KEYS.includes(safeKey)) {
        aValue = safeGetTime(a[safeKey]);
        bValue = safeGetTime(b[safeKey]);
      } else {
        aValue = String(a[safeKey] || '');
        bValue = String(b[safeKey] || '');
      }
      if (aValue === bValue) return 0;
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return sortDir === 'asc' ? aValue - bValue : bValue - aValue;
      }
      return sortDir === 'asc' ? String(aValue).localeCompare(String(bValue)) : String(bValue).localeCompare(String(aValue));
    });

    const pageData = paginate(filtered.map(enrichRfq), { page, pageSize });
    return pageData;
  },

  async getRfq(id) {
    repairInconsistentRfqStatuses();
    repairRfqApprovalStatuses();
    await delay();
    const rfq = resolveRfqRecord(id);
    if (!rfq) throw new Error('RFQ not found');
    return clone(enrichRfq(rfq));
  },

  async createRfq(payload = {}) {
    await delay();
    const records = rfqsStore.all;
    /* Auto-generated RFQ number: RFQ-YYYY-0001 style, sequenced from the
       highest existing number (seed starts at 0008). User may supply a custom number. */
    const rfqNo = payload.rfqNo || nextSeqNo(records, 'RFQ', 'rfqNo', 0);
    /* Prevent duplicate RFQ numbers. */
    if (records.some((entry) => entry.rfqNo === rfqNo)) {
      throw new Error(`RFQ number ${rfqNo} already exists`);
    }
    const vendorNames = Array.isArray(payload.vendorNames) ? payload.vendorNames : [];
    const actor = getCurrentActor();
    const now = new Date().toISOString();
    const normalized = {
      id: rfqNo,
      rfqNo,
      title: payload.title || 'Untitled RFQ',
      description: payload.description || '',
      /* The originating Purchase Requisition number (PR-YYYY-NNNN).
         `prNo` is the explicit PR link the workflow reads; `reference`
         stays as the backward-compatible alias so existing consumers
         (PO raise, list search, print) keep working unchanged. */
      reference: payload.reference || '',
      prNo: payload.reference || '',
      category: payload.category || 'General',
      department: payload.department || '',
      project: payload.project || '',
      requester: payload.requester || '',
      buyer: payload.buyer || '',
      priority: payload.priority || PRIORITIES[2],
      validity: Number(payload.validity) || 30,
      vendors: vendorNames,
      vendorCount: vendorNames.length,
      dueDate: payload.dueDate || '',
      status: payload.status || RFQ_STATUS.DRAFT,
      /* Actual procurement stage — a new RFQ starts at the RFQ stage. */
      workflowStage: 'RFQ',
      /* Real approval workflow state: Pending → Approved / Rejected,
         with the decision record (approver, date, decision, remarks).
         Stored under `approvalDecision` — `approval` on the enriched
         record is the derived display label. */
      approvalStatus: APPROVAL_STATUS.PENDING,
      approvalDecision: null,
      sentAt: null,
      awardedVendor: null,
      awardedQuoteId: null,
      awardedValue: null,
      awardedAt: null,
      currency: payload.currency || getDefaultCurrency(),
      incoterm: payload.incoterm || '',
      deliveryAddress: payload.deliveryAddress || '',
      commercialTerms: { ...DEFAULT_COMMERCIAL_TERMS, ...(payload.commercialTerms || {}) },
      createdAt: now,
      updatedAt: now,
      createdBy: payload.requester || actor.name || 'System',
      notes: payload.notes || '',
      items: payload.items || [],
      attachments: Array.isArray(payload.attachments) ? payload.attachments : [],
      comments: Array.isArray(payload.comments) ? payload.comments : [],
      activity: [activityEntry('create', `${rfqNo} created`)]
    };
    records.push(normalized);
    rfqsStore.persist(records);
    return clone(enrichRfq(normalized));
  },

  /**
   * Once an RFQ has left Draft/Pending Approval, vendors already have —
   * or are about to have — a live copy of its scope and pricing terms.
   * Silently rewriting `items` or `commercialTerms` at that point would
   * corrupt what vendors already quoted against, with no audit trail.
   * Vendor-only patches (e.g. VendorSourcing inviting a late vendor to
   * an open RFQ) stay allowed in any non-terminal state; item/commercial
   * changes are only allowed while the RFQ is still Draft or Pending
   * Approval — the module doesn't yet have a formal revision workflow,
   * so post-send changes to scope/terms are blocked rather than silently
   * applied.
   */
  async updateRfq(id, patch = {}) {
    await delay();
    const records = rfqsStore.all;
    const index = records.findIndex((entry) => entry.id === id);
    if (index === -1) throw new Error('RFQ not found');
    const target = records[index];
    /* Scope / commercial-terms edits are only allowed before vendors are
       engaged.  Draft and Pending Approval (without quotations) are
       always editable.  Approved RFQs are also editable when no
       quotations have been received — the vendor is selected but has
       not yet responded.  Once quotations are on file the RFQ must not
       be rewritten under the engaged vendors. */
    const quotationsOnFile = receivedQuotationCount(target.rfqNo) > 0;
    const editableScope =
      target.status === RFQ_STATUS.DRAFT ||
      ((target.status === RFQ_STATUS.PENDING_APPROVAL || target.status === RFQ_STATUS.APPROVED) && !quotationsOnFile);
    const changesScopeOrTerms =
      Object.prototype.hasOwnProperty.call(patch, 'items') ||
      Object.prototype.hasOwnProperty.call(patch, 'commercialTerms');
    if (changesScopeOrTerms && !editableScope) {
      throw new Error(
        `${target.rfqNo} is ${target.status} — items and commercial terms can no longer be edited once vendors are engaged.`
      );
    }
    records[index] = {
      ...records[index],
      ...patch,
      id: records[index].id,
      rfqNo: records[index].rfqNo,
      /* prNo always mirrors the reference so a stale patch can never
         desynchronise the explicit PR link. */
      prNo: patch.reference ?? records[index].prNo ?? records[index].reference ?? '',
      vendorCount: Array.isArray(patch.vendors) ? patch.vendors.length : records[index].vendorCount,
      commercialTerms: { ...DEFAULT_COMMERCIAL_TERMS, ...records[index].commercialTerms, ...(patch.commercialTerms || {}) },
      updatedAt: nowIso()
    };
    rfqsStore.persist(records);
    return clone(enrichRfq(records[index]));
  },

  async submitForReview(id, note = '') {
    await delay();
    const records = rfqsStore.all;
    const index = records.findIndex((entry) => entry.id === id);
    if (index === -1) throw new Error('RFQ not found');
    if (records[index].status !== RFQ_STATUS.DRAFT) throw new Error('Only draft RFQs can be submitted for approval');
    /* Workflow rule — an RFQ without line items cannot enter the approval
       cycle (the form schema enforces it too; this is the service-level
       guard so no caller can bypass it). */
    if (!Array.isArray(records[index].items) || records[index].items.length === 0) {
      throw new Error('Add at least one line item before submitting the RFQ for approval');
    }
    records[index] = {
      ...records[index],
      status: RFQ_STATUS.PENDING_APPROVAL,
      /* A resubmission restarts the approval cycle — the previous
         decision (if any) no longer applies. */
      approvalStatus: APPROVAL_STATUS.PENDING,
      approvalDecision: null,
      activity: [...(records[index].activity || []), activityEntry('submit', `${records[index].rfqNo} submitted for approval`, note)]
    };
    rfqsStore.persist(records);
    return clone(enrichRfq(records[index]));
  },

  async approveRfq(id, note = '') {
    await delay();
    const records = rfqsStore.all;
    const index = records.findIndex((entry) => entry.id === id);
    if (index === -1) throw new Error('RFQ not found');
    if (records[index].status !== RFQ_STATUS.PENDING_APPROVAL) throw new Error('Only pending RFQs can be approved');
    /* Pending Approval is also the post-sourcing Approval Flow stage — a
       supplier-selection / award approval, NOT the initial RFQ approval.
       Once vendors have engaged (quotations on file), the initial
       approve/reject cycle no longer applies; awarding goes through the
       Approval Flow (NFA) and the award action instead. */
    if (receivedQuotationCount(records[index].rfqNo) > 0) {
      throw new Error(
        `${records[index].rfqNo} is pending the Approval Flow decision — sourcing is already in progress and the initial RFQ approval no longer applies.`
      );
    }
    const actor = getCurrentActor();
    const now = nowIso();
    records[index] = {
      ...records[index],
      status: RFQ_STATUS.APPROVED,
      approvalStatus: APPROVAL_STATUS.APPROVED,
      approvalDecision: {
        approver: actor.name || 'System',
        date: now,
        decision: APPROVAL_STATUS.APPROVED,
        remarks: note || ''
      },
      updatedAt: now,
      activity: [...(records[index].activity || []), activityEntry('approve', `${records[index].rfqNo} approved`, note)]
    };
    rfqsStore.persist(records);
    return clone(enrichRfq(records[index]));
  },

  /**
   * Rejects an RFQ at the approval stage — the only real rejection point
   * in the sourcing workflow. The RFQ records the decision (approver,
   * date, decision, remarks) and moves to the terminal Cancelled state,
   * consistent with the audit mapping (reject → Cancelled). A rejected
   * RFQ can never be sent to vendors.
   */
  async rejectRfq(id, note = '') {
    await delay();
    const records = rfqsStore.all;
    const index = records.findIndex((entry) => entry.id === id);
    if (index === -1) throw new Error('RFQ not found');
    if (records[index].status !== RFQ_STATUS.PENDING_APPROVAL) throw new Error('Only pending RFQs can be rejected');
    /* Same post-sourcing guard as approve — once vendors have engaged,
       the initial rejection no longer applies; use Cancel instead. */
    if (receivedQuotationCount(records[index].rfqNo) > 0) {
      throw new Error(
        `${records[index].rfqNo} is pending the Approval Flow decision — sourcing is already in progress and the initial RFQ rejection no longer applies.`
      );
    }
    const actor = getCurrentActor();
    const now = nowIso();
    records[index] = {
      ...records[index],
      status: RFQ_STATUS.CANCELLED,
      approvalStatus: APPROVAL_STATUS.REJECTED,
      approvalDecision: {
        approver: actor.name || 'System',
        date: now,
        decision: APPROVAL_STATUS.REJECTED,
        remarks: note || ''
      },
      updatedAt: now,
      activity: [
        ...(records[index].activity || []),
        activityEntry('reject', `${records[index].rfqNo} rejected — approval not granted`, note)
      ]
    };
    rfqsStore.persist(records);
    return clone(enrichRfq(records[index]));
  },

  async sendRfq(id) {
    await delay();
    const records = rfqsStore.all;
    const index = records.findIndex((entry) => entry.id === id);
    if (index === -1) throw new Error('RFQ not found');
    if (records[index].status !== RFQ_STATUS.APPROVED) throw new Error('Only approved RFQs can be sent to vendors');
    const invited = records[index].vendors || [];
    if (invited.length === 0) {
      throw new Error('Select at least one vendor before sending the RFQ');
    }
    /* Enforce the vendor master rule at the workflow boundary: every
       invited vendor must be Approved in the master (the same eligibility
       the RFQ form selector exposes). Pending / Rejected /
       Blocked / Archived vendors block the send. Names are
       loose-matched against the master so legacy invited names like
       "Tata Steel Ltd" still resolve to "Tata Steel". */
    const ineligible = invited.filter((name) => !isVendorRfqEligible(resolveVendorByName(name)));
    if (ineligible.length > 0) {
      throw new Error(
        `Cannot send: ${ineligible.join(', ')} ${ineligible.length === 1 ? 'is' : 'are'} not approved vendors`
      );
    }
    const now = nowIso();
    records[index] = {
      ...records[index],
      status: RFQ_STATUS.SENT,
      /* Sent to vendors → the follow-up stage (a follow-up is auto-created). */
      workflowStage: 'FOLLOW_UP',
      sentAt: now,
      activity: [
        ...(records[index].activity || []),
        activityEntry('send', `${records[index].rfqNo} sent to ${records[index].vendorCount || 0} vendor(s)`),
        ...(records[index].vendors || []).map((vendor) =>
          /* There is no email integration in this project — record the
             invitation without claiming an email was actually dispatched. */
          activityEntry('mail', `Invitation sent to ${vendor}`, records[index].rfqNo)
        )
      ]
    };
    rfqsStore.persist(records);
    /* Auto-created follow-up (business rule): an RFQ sent to vendors
       with no responses yet gets a "Vendor Response Pending" reminder
       on the Follow-ups page. Idempotent — never duplicates an open
       follow-up for the same RFQ. */
    ensureSentFollowUp(records[index]);
    return clone(enrichRfq(records[index]));
  },

  async startEvaluation(id, note = '') {
    await delay();
    const records = rfqsStore.all;
    const index = records.findIndex((entry) => entry.id === id);
    if (index === -1) throw new Error('RFQ not found');
    if (![RFQ_STATUS.SENT, RFQ_STATUS.QUOTATION_RECEIVED].includes(records[index].status)) {
      throw new Error('Only sent RFQs can move to evaluation');
    }
    /* The workflow only advances to Evaluation with real vendor responses —
       an RFQ that is still waiting for quotations cannot be evaluated. */
    if (receivedQuotationCount(records[index].rfqNo) === 0) {
      throw new Error('At least one quotation must be received before starting evaluation');
    }
    records[index] = {
      ...records[index],
      status: RFQ_STATUS.EVALUATION,
      /* Evaluation opened → the comparison stage of the canonical workflow. */
      workflowStage: 'COMPARISON',
      activity: [...(records[index].activity || []), activityEntry('review', `${records[index].rfqNo} evaluation started`, note)]
    };
    rfqsStore.persist(records);
    return clone(enrichRfq(records[index]));
  },

  /**
   * Awards the RFQ to the supplier(s) selected during evaluation —
   * accepts the selected vendors' quotations and rejects the rest. The
   * award is ITEM-WISE: every RFQ line carries its own supplier, so a
   * single RFQ may be split across multiple suppliers (split award).
   * The awarded lines, per-vendor totals and the overall award value
   * are persisted on the RFQ record; the primary supplier (largest
   * value share) also populates the legacy single-vendor award fields
   * so RFQ list / view pages keep working unchanged. Award is refused
   * until the supplier selection has been completed AND approved.
   */
  async awardRfq(id, vendorName, note = '') {
    await delay();
    const records = rfqsStore.all;
    const index = records.findIndex((entry) => entry.id === id);
    if (index === -1) throw new Error('RFQ not found');
    const existing = records[index];
    /* Award is allowed from Evaluation and from the post-sourcing
       Approval Flow states — Pending Approval through Approved (the
       technical evaluation completed with a qualified vendor, see
       evaluation.syncRfqApprovalStatus and nfa.syncRfqStatus). The
       post-sourcing Approved state is distinguishable from the INITIAL
       approval (which never has quotations) by its live quotations; an
       initial-approval RFQ without quotes is refused here. */
    const inApprovalFlow = [
      RFQ_STATUS.SENT,
      RFQ_STATUS.QUOTATION_RECEIVED,
      RFQ_STATUS.EVALUATION,
      RFQ_STATUS.PENDING_APPROVAL,
      RFQ_STATUS.FIRST_APPROVAL,
      RFQ_STATUS.SECOND_APPROVAL,
      RFQ_STATUS.FINAL_APPROVAL
    ].includes(existing.status);
    const postSourcingApproved =
      existing.status === RFQ_STATUS.APPROVED && receivedQuotationCount(existing.rfqNo) > 0;
    if (!inApprovalFlow && !postSourcingApproved) {
      throw new Error('Only RFQs with received quotations can be awarded');
    }
    /* Award requires an approved supplier selection. */
    const evaluation = evaluationsStore.all.find(
      (entry) => entry.id === id || entry.rfqNo === existing.rfqNo
    );
    if (!evaluation?.selection) {
      throw new Error('Complete supplier selection before awarding the RFQ');
    }
    if (evaluation.approval?.status !== APPROVAL_STATUS.APPROVED) {
      throw new Error('Supplier selection must be approved before awarding');
    }
    const selection = evaluation.selection;
    const quotes = quotationsStore.all;
    const rfqQuotes = quotes.filter((quote) => quote.rfqNo === existing.rfqNo);

    /* Item-wise allocations — the approved selection defines which
       supplier gets each line (split awards award different lines to
       different suppliers). */
    const allocations = buildAwardAllocations(existing, selection, rfqQuotes);
    if (allocations.length === 0) {
      throw new Error('No quotation found for the selected supplier');
    }
    const acceptedQuoteIds = new Set(
      allocations
        .map((allocation) =>
          rfqQuotes.find(
            (quote) => quote.id === allocation.quoteId && quote.vendor === allocation.vendor
          )?.id
        )
        .filter(Boolean)
    );
    if (acceptedQuoteIds.size === 0) {
      throw new Error('No quotation found for the selected supplier');
    }
    const suppliers = [...new Set(allocations.map((allocation) => allocation.vendor))];
    const splitAward = suppliers.length > 1;
    const awardValue =
      selection.finalValue ??
      Math.round(allocations.reduce((sum, allocation) => sum + (allocation.lineTotal || 0), 0) * 100) / 100;
    const now = nowIso();

    quotationsStore.persist(
      quotes.map((quote) =>
        quote.rfqNo === existing.rfqNo
          ? { ...quote, status: acceptedQuoteIds.has(quote.id) ? QUOTATION_STATUS.ACCEPTED : QUOTATION_STATUS.REJECTED }
          : quote
      )
    );

    /* Primary supplier = largest value share (single-vendor award keeps
       the legacy fields; a split award still names the primary vendor so
       the RFQ list / view render meaningful award info). */
    let primary = suppliers[0];
    if (splitAward) {
      const share = {};
      allocations.forEach((allocation) => {
        share[allocation.vendor] = (share[allocation.vendor] || 0) + (allocation.lineTotal || 0);
      });
      primary = Object.entries(share).sort((a, b) => b[1] - a[1])[0]?.[0] || suppliers[0];
    }
    const primaryAllocation = allocations.find((allocation) => allocation.vendor === primary) || allocations[0];

    records[index] = {
      ...existing,
      status: RFQ_STATUS.AWARDED,
      /* Awarded → the purchase-order stage of the canonical workflow. */
      workflowStage: 'PURCHASE_ORDER',
      awardedVendor: primary,
      awardedQuoteId: primaryAllocation.quoteId,
      awardedValue: awardValue,
      awardedAt: now,
      splitAward,
      awardedAllocations: allocations.map((allocation) => ({ ...allocation })),
      activity: [
        ...(existing.activity || []),
        activityEntry(
          'award',
          splitAward
            ? `${existing.rfqNo} awarded — split across ${suppliers.length} suppliers (${suppliers.join(', ')})`
            : `${existing.rfqNo} awarded to ${primary}`,
          note || `Award value ${formatAmount(awardValue, existing.currency || 'INR')} · ${allocations.length} line(s)`
        )
      ]
    };
    rfqsStore.persist(records);
    return clone(enrichRfq(records[index]));
  },

  /**
   * Raises purchase order(s) from an awarded RFQ. A single-vendor award
   * creates one PO pre-filled from the winning quotation; a SPLIT award
   * (different lines awarded to different suppliers) creates one PO per
   * awarded vendor, each carrying only that vendor's allocated lines at
   * their quoted rates. Every PO inherits the document chain (PR → RFQ →
   * Quotation → Award value), payment terms, delivery address and a
   * lead-time-derived expected date. The RFQ keeps its Awarded status and
   * records the PO references + activity entries; a second raise is
   * refused. The linked PR (via the RFQ's PR reference) is marked PO
   * Raised here — the only event that legitimately sets that status.
   */
  async raisePurchaseOrder(id, note = '') {
    await delay();
    const records = rfqsStore.all;
    const index = records.findIndex((entry) => entry.id === id);
    if (index === -1) throw new Error('RFQ not found');
    const existing = records[index];
    if (existing.status !== RFQ_STATUS.AWARDED || !existing.awardedVendor) {
      throw new Error('Only awarded RFQs can raise a purchase order');
    }
    if (existing.poNo) throw new Error(`Purchase order ${existing.poNo} already raised for this RFQ`);

    /* Item-wise allocations — persisted at award time (split awards), or
       derived for the single-vendor legacy award. */
    const awardedAllocations = Array.isArray(existing.awardedAllocations) && existing.awardedAllocations.length > 0
      ? existing.awardedAllocations
      : (() => {
          const quote =
            quotationsStore.all.find((q) => q.id === existing.awardedQuoteId && q.rfqNo === existing.rfqNo) ||
            quotationsStore.all.find((q) => q.rfqNo === existing.rfqNo && q.status === QUOTATION_STATUS.ACCEPTED) ||
            null;
          if (!quote) return [];
          return (existing.items || []).map((item, itemIndex) => {
            const line = quote.items?.[itemIndex] || {};
            const unitPrice = Math.round((Number(line.rate ?? item.rate ?? item.expectedRate) || 0) * 100) / 100;
            const qty = Number(item.qty ?? line.qty) || 0;
            return {
              itemKey: `${existing.id}:${itemIndex}`,
              product: item.product || line.product || '',
              uom: item.uom || line.uom || '',
              qty,
              vendor: quote.vendor,
              quoteId: quote.id,
              unitPrice,
              lineTotal: Math.round(unitPrice * qty * 100) / 100
            };
          });
        })();
    if (awardedAllocations.length === 0) {
      throw new Error('No awarded lines found for this RFQ');
    }

    const commercialTerms = existing.commercialTerms || {};
    const taxRate = Number(commercialTerms.taxRate) || 18;
    /* Group the awarded lines by supplier — one PO per supplier. */
    const byVendor = {};
    awardedAllocations.forEach((allocation) => {
      (byVendor[allocation.vendor] = byVendor[allocation.vendor] || []).push(allocation);
    });

    const pos = [];
    for (const [vendor, allocations] of Object.entries(byVendor)) {
      const quote =
        quotationsStore.all.find((q) => q.id === allocations[0].quoteId && q.rfqNo === existing.rfqNo) ||
        quotationsStore.all.find((q) => q.rfqNo === existing.rfqNo && q.vendor === vendor && q.status === QUOTATION_STATUS.ACCEPTED) ||
        null;
      const leadDays = Number(quote?.leadTime) || 0;
      /* Local-date expected date (lead time from the quotation) — avoids
         the UTC day-offset Date.toISOString() can introduce. */
      let expectedDate = '';
      if (leadDays > 0) {
        const expected = new Date();
        expected.setDate(expected.getDate() + leadDays);
        const pad = (n) => String(n).padStart(2, '0');
        expectedDate = `${expected.getFullYear()}-${pad(expected.getMonth() + 1)}-${pad(expected.getDate())}`;
      }
      const quoteItems = quote?.items && quote.items.length > 0 ? quote.items : [];
      const vendorValue = Math.round(
        allocations.reduce((sum, allocation) => sum + (allocation.lineTotal || 0), 0) * 100
      ) / 100;
      const freight = Number(quote?.freight) || 0;
      const insurance = Number(quote?.insurance) || 0;
      /* Freight + insurance fold into the non-taxable charges so the PO's
         computed total equals the awarded quotation lines exactly. */
      const charges = (Number(quote?.charges) || 0) + freight + insurance;

      const po = await mockPurchaseOrderService.createOrder({
        title: Object.keys(byVendor).length > 1
          ? `${existing.title || `Purchase order against ${existing.rfqNo}`} — ${vendor}`
          : existing.title || `Purchase order against ${existing.rfqNo}`,
        vendor,
        /* PO carries the complete document chain — the originating PR
           reference, the RFQ, the awarded quotation number and the final
           (negotiated) award value for this supplier's lines. */
        reference: existing.reference || existing.rfqNo,
        prNo: existing.prNo || existing.reference || '',
        rfqNo: existing.rfqNo,
        quotationNo: quote?.quotationNo || quote?.id || '',
        /* Single-vendor awards keep the final (negotiated) award value;
           split awards carry each supplier's allocated line total. */
        awardedValue: Object.keys(byVendor).length > 1 ? vendorValue : existing.awardedValue ?? vendorValue,
        orderDate: todayLocal(),
        expectedDate,
        /* Finalized payment terms flow straight from the evaluation onto
           the PO (each split-award PO inherits them and computes its own
           advance/balance amounts). When the RFQ was raised without
           finalized terms the PO is flagged paymentTermsRequired so the
           release step refuses a silent release. */
        paymentTerms: existing.paymentTerms || null,
        paymentTermsRequired: !existing.paymentTerms,
        terms: quote?.paymentTerms || commercialTerms.paymentTerms || '30 Days',
        deliveryTerms: commercialTerms.deliveryTerms || '',
        warranty: quote?.warranty || commercialTerms.warranty || '',
        freight,
        insurance,
        currency: existing.currency || getDefaultCurrency(),
        incoterm: existing.incoterm || '',
        deliveryAddress: existing.deliveryAddress || '',
        discount: Number(quote?.discount) || 0,
        charges,
        notes: quote?.notes || `Raised from ${existing.rfqNo} awarded quotation (${vendor})`,
        items: allocations.map((allocation) => {
          const lineIndex = Number(String(allocation.itemKey).split(':')[1]) || 0;
          const line = quoteItems[lineIndex] || {};
          return {
            product: allocation.product || line.product || '',
            hsn: line.hsn || '',
            uom: line.uom || allocation.uom || 'Nos',
            qty: Number(allocation.qty) || 0,
            rate: Number(allocation.unitPrice) || 0,
            gstRate: taxRate,
            specification: line.specification || ''
          };
        }),
        status: PO_STATUS.PENDING_APPROVAL
      });
      pos.push(clone(po));
    }

    records[index] = {
      ...existing,
      /* PO raised → the PO approval stage of the canonical workflow
         (the PO now needs approval before release). */
      workflowStage: 'PO_APPROVAL',
      poNo: pos[0]?.poNo || existing.poNo,
      poNos: pos.map((po) => po.poNo),
      activity: [
        ...(existing.activity || []),
        ...pos.map((po) =>
          activityEntry(
            'order',
            `Purchase order ${po.poNo} raised from ${po.rfqNo} (${po.vendor})`,
            note || `${po.poNo} · ${formatAmount(po.amount, po.currency)}`
          )
        )
      ]
    };
    rfqsStore.persist(records);

    /* Mark the originating PR as PO Raised — only now, after a real PO
       exists. A converted PR (Approved → Converted to RFQ) moves to
       PO Raised; the activity entry makes the PR timeline show the PO
       event instead of leaving the PR stuck on Converted. */
    const prRef = existing.reference || '';
    if (prRef) {
      const prRecords = requisitionsStore.all;
      const prIndex = prRecords.findIndex((req) => req.prNo === prRef);
      if (prIndex !== -1) {
        const pr = prRecords[prIndex];
        if (pr.status === PR_STATUS.APPROVED || pr.status === PR_STATUS.CONVERTED) {
          prRecords[prIndex] = normalizePurchaseRequest({
            ...pr,
            status: PR_STATUS.PO_RAISED,
            activity: [
              ...(Array.isArray(pr.activity) ? pr.activity : []),
              ...pos.map((po) => ({
                type: 'po',
                label: `Purchase Order ${po.poNo} raised`,
                actor: getCurrentActor().name || 'System',
                timestamp: nowIso(),
                note: `PO ${po.poNo} created from awarded RFQ ${existing.rfqNo}`
              }))
            ]
          });
          requisitionsStore.persist(prRecords);
        }
      }
    }

    return { rfq: clone(enrichRfq(records[index])), po: clone(pos[0]), pos: pos.map((po) => clone(po)) };
  },

  async closeRfq(id) {
    await delay();
    const records = rfqsStore.all;
    const index = records.findIndex((entry) => entry.id === id);
    if (index === -1) throw new Error('RFQ not found');
    if ([RFQ_STATUS.CLOSED, RFQ_STATUS.CANCELLED].includes(records[index].status)) {
      throw new Error(`RFQ is already ${records[index].status.toLowerCase()}`);
    }
    records[index] = {
      ...records[index],
      status: RFQ_STATUS.CLOSED,
      /* Closed → the terminal stage of the canonical workflow. */
      workflowStage: 'CLOSED',
      activity: [...(records[index].activity || []), activityEntry('close', `${records[index].rfqNo} closed`)]
    };
    rfqsStore.persist(records);
    return clone(enrichRfq(records[index]));
  },

  async cancelRfq(id, note = '') {
    await delay();
    const records = rfqsStore.all;
    const index = records.findIndex((entry) => entry.id === id);
    if (index === -1) throw new Error('RFQ not found');
    if (records[index].status === RFQ_STATUS.CANCELLED) {
      throw new Error('RFQ is already cancelled');
    }
    records[index] = {
      ...records[index],
      status: RFQ_STATUS.CANCELLED,
      activity: [...(records[index].activity || []), activityEntry('reject', `${records[index].rfqNo} cancelled`, note)]
    };
    rfqsStore.persist(records);
    return clone(enrichRfq(records[index]));
  },

  async duplicateRfq(id) {
    await delay();
    const records = rfqsStore.all;
    const source = records.find((entry) => entry.id === id);
    if (!source) throw new Error('RFQ not found');
    const rfqNo = nextSeqNo(records, 'RFQ', 'rfqNo', 0);
    const now = nowIso();
    const copy = {
      ...clone(source),
      id: rfqNo,
      rfqNo,
      status: RFQ_STATUS.DRAFT,
      /* A fresh copy starts a fresh approval cycle — and a fresh
         workflow at the RFQ stage. */
      workflowStage: 'RFQ',
      /* A fresh copy starts a fresh approval cycle. The PR link is kept
         (read-only provenance) but the copy is never auto-linked to the
         PR — converting a PR stays a one-time event. */
      approvalStatus: APPROVAL_STATUS.PENDING,
      approvalDecision: null,
      createdAt: now,
      updatedAt: now,
      dueDate: '',
      sentAt: null,
      awardedVendor: null,
      awardedQuoteId: null,
      awardedValue: null,
      awardedAt: null,
      comments: [],
      activity: [activityEntry('create', `${rfqNo} created (duplicate of ${source.rfqNo})`)]
    };
    records.push(copy);
    rfqsStore.persist(records);
    return clone(enrichRfq(copy));
  },

  /**
   * Delete is only safe before an RFQ has any vendor-facing commitment
   * or downstream document. Once it has been Sent, has quotations, has
   * been Awarded, or has a PO raised against it, deleting it would
   * orphan those records (quotations/negotiations key off rfqNo, and
   * the PO keeps a live rfqNo reference) — so those states must go
   * through Cancel instead, which is reversible-safe and keeps the
   * audit trail intact. Draft / Pending Approval / Cancelled are the
   * only deletable states.
   */
  async deleteRfq(id) {
    await delay();
    const records = rfqsStore.all;
    const index = records.findIndex((entry) => entry.id === id);
    if (index === -1) throw new Error('RFQ not found');
    const target = records[index];
    const deletable = [RFQ_STATUS.DRAFT, RFQ_STATUS.PENDING_APPROVAL, RFQ_STATUS.CANCELLED];
    if (!deletable.includes(target.status)) {
      throw new Error(
        `${target.rfqNo} is ${target.status} and cannot be deleted — vendors may already be engaged. Cancel it instead.`
      );
    }
    const linkedQuotes = quotationsStore.all.filter((quote) => quote.rfqNo === target.rfqNo);
    if (linkedQuotes.length > 0) {
      throw new Error(`${target.rfqNo} has ${linkedQuotes.length} quotation(s) on file and cannot be deleted.`);
    }
    records.splice(index, 1);
    rfqsStore.persist(records);
    return { id };
  },

  async addComment(id, text) {
    await delay();
    const records = rfqsStore.all;
    const index = records.findIndex((entry) => entry.id === id);
    if (index === -1) throw new Error('RFQ not found');
    const actor = getCurrentActor();
    const comment = {
      id: `cm-${Date.now()}`,
      author: actor.name || 'User',
      createdAt: nowIso(),
      text: String(text).trim()
    };
    records[index] = {
      ...records[index],
      comments: [...(records[index].comments || []), comment],
      activity: [...(records[index].activity || []), activityEntry('comment', 'Comment added', comment.text)]
    };
    rfqsStore.persist(records);
    return clone(enrichRfq(records[index]));
  },

  async getRfqTimeline(id) {
    await delay();
    const rfq = resolveRfqRecord(id);
    if (!rfq) throw new Error('RFQ not found');
    return clone([...(rfq.activity || [])].sort((a, b) => safeGetTime(a.timestamp) - safeGetTime(b.timestamp)));
  },

  async getRfqStats() {
    repairInconsistentRfqStatuses();
    repairRfqApprovalStatuses();
    await delay();
    const records = rfqsStore.all.map(enrichRfq);
    const allQuotes = quotationsStore.all;
    const total = records.length;
    const draft = records.filter((rfq) => rfq.status === RFQ_STATUS.DRAFT).length;
    const pendingApproval = records.filter((rfq) => rfq.status === RFQ_STATUS.PENDING_APPROVAL).length;
    const approved = records.filter((rfq) => rfq.status === RFQ_STATUS.APPROVED).length;
    const sent = records.filter((rfq) => rfq.status === RFQ_STATUS.SENT).length;
    const quotationReceivedStatus = records.filter((rfq) => rfq.status === RFQ_STATUS.QUOTATION_RECEIVED).length;
    const evaluation = records.filter((rfq) => rfq.status === RFQ_STATUS.EVALUATION).length;
    /* Approval Flow (NFA) stages — the RFQ status tracks the note's
       approval stage (see nfa.syncRfqStatus / repairRfqApprovalStatuses),
       so the KPI cards / sidebar badges count them like the other status
       buckets. */
    const firstApproval = records.filter((rfq) => rfq.status === RFQ_STATUS.FIRST_APPROVAL).length;
    const secondApproval = records.filter((rfq) => rfq.status === RFQ_STATUS.SECOND_APPROVAL).length;
    const finalApproval = records.filter((rfq) => rfq.status === RFQ_STATUS.FINAL_APPROVAL).length;
    const awarded = records.filter((rfq) => rfq.status === RFQ_STATUS.AWARDED).length;
    const closed = records.filter((rfq) => rfq.status === RFQ_STATUS.CLOSED).length;
    const cancelled = records.filter((rfq) => rfq.status === RFQ_STATUS.CANCELLED).length;
    const overdue = records.filter(isOverdueRfq).length;
    const open = records.filter(isOpenRfq).length;
    const invitedVendors = records.reduce((sum, rfq) => sum + (rfq.vendorCount || 0), 0);
    const quotesReceived = records.reduce((sum, rfq) => sum + (rfq.quotationReceived || 0), 0);
    /* Active = every status except the terminal Closed / Cancelled states —
       the exact same bucket the list's Active filter uses (isActiveRfq), so
       the tab count always matches the rows shown. */
    const activeRfqs = records.filter(isActiveRfq);

    const now = new Date();
    const nextWeek = new Date(now.getTime() + 7 * 86400000);
    const expiringThisWeek = records.filter(
      (rfq) => rfq.dueDate && safeGetTime(rfq.dueDate) >= now.getTime() && safeGetTime(rfq.dueDate) <= nextWeek.getTime()
    ).length;

    /* Average response time: mean days between the RFQ being sent and its
       first quotation being received (only for RFQs with both timestamps). */
    const responseTimes = [];
    records.forEach((rfq) => {
      if (!rfq.sentAt) return;
      const rfqQuotes = allQuotes
        .filter((quote) => quote.rfqNo === rfq.rfqNo && quote.submittedOn)
        .map((quote) => safeGetTime(quote.submittedOn))
        .filter((time) => time > 0);
      if (rfqQuotes.length === 0) return;
      const firstResponse = Math.min(...rfqQuotes);
      responseTimes.push(Math.max(0, (firstResponse - safeGetTime(rfq.sentAt)) / 86400000));
    });
    const avgResponseTime =
      responseTimes.length > 0
        ? Math.round((responseTimes.reduce((sum, days) => sum + days, 0) / responseTimes.length) * 10) / 10
        : 0;

    /* Vendor participation: unique vendors invited across all RFQs. */
    const invitedVendorSet = new Set();
    records.forEach((rfq) => (rfq.vendors || []).forEach((vendor) => invitedVendorSet.add(vendor)));
    const vendorParticipation = invitedVendorSet.size;

    /* RFQ value: total estimated value of active (open) RFQs. */
    const rfqValue = records
      .filter(isOpenRfq)
      .reduce((sum, rfq) => sum + (rfq.estimatedValue || 0), 0);

    /* Total RFQ value: sum of the estimated value across all RFQs. */
    const totalValue = records.reduce((sum, rfq) => sum + (rfq.estimatedValue || 0), 0);

    /* Savings achieved: estimated budget minus the awarded quote value,
       compared on a pre-GST basis (quote taxable value) so budget and
       quote are on equal footing. */
    const savingsAchieved = records.reduce((sum, rfq) => {
      if (!rfq.awardedVendor) return sum;
      const acceptedQuote = allQuotes.find(
        (quote) => quote.rfqNo === rfq.rfqNo && quote.status === QUOTATION_STATUS.ACCEPTED
      );
      const baseline = acceptedQuote?.taxable ?? rfq.awardedValue ?? 0;
      return sum + Math.max(0, (rfq.estimatedValue || 0) - baseline);
    }, 0);

    /* Pending quotations across all open RFQs. */
    const pendingQuotations = records
      .filter(isOpenRfq)
      .reduce((sum, rfq) => sum + (rfq.quotationPending || 0), 0);

    const avgVendors = total > 0 ? invitedVendors / total : 0;
    const avgResponseRate = invitedVendors > 0 ? Math.round((quotesReceived / invitedVendors) * 1000) / 10 : 0;
    const avgValue = total > 0 ? records.reduce((sum, rfq) => sum + (rfq.estimatedValue || 0), 0) / total : 0;

    return {
      total,
      draft,
      pendingApproval,
      approved,
      sent,
      quotationReceived: quotationReceivedStatus,
      evaluation,
      firstApproval,
      secondApproval,
      finalApproval,
      awarded,
      closed,
      cancelled,
      overdue,
      open,
      expiringThisWeek,
      avgVendors,
      avgResponseRate,
      avgValue,
      avgResponseTime,
      vendorParticipation,
      rfqValue,
      totalValue,
      savingsAchieved,
      pendingQuotations,
      active: activeRfqs.length
    };
  },

  /** ---------------------------- Quotations -------------------------------- */
  async getQuotations({ search = '', status = 'All', rfqNo = 'All', page = 1, pageSize = 10, sortBy = 'submittedOn', sortDir = 'desc' } = {}) {
    await delay();
    const records = quotationsStore.all;
    const query = String(search).trim().toLowerCase();
    const statusFilter = toFilter(status);
    const rfqFilter = toFilter(rfqNo);

    let filtered = records.filter((quote) => {
      if (statusFilter && quote.status !== statusFilter) return false;
      if (rfqFilter && quote.rfqNo !== rfqFilter) return false;
      if (query) {
        const haystack = [quote.vendor, quote.rfqNo].filter(Boolean).join(' ').toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });

    /* Column sorting — same contract as the RFQ / PR list services. */
    const STRING_SORT_KEYS = ['id', 'rfqNo', 'vendor', 'paymentTerms', 'status', 'currency'];
    const NUMERIC_SORT_KEYS = ['total', 'delivery', 'leadTime', 'score', 'discount'];
    const DATE_SORT_KEYS = ['submittedOn', 'validUntil'];
    const sortable = [...STRING_SORT_KEYS, ...NUMERIC_SORT_KEYS, ...DATE_SORT_KEYS];
    const safeKey = sortable.includes(sortBy) ? sortBy : 'submittedOn';
    filtered = [...filtered].sort((a, b) => {
      let aValue;
      let bValue;
      if (NUMERIC_SORT_KEYS.includes(safeKey)) {
        aValue = Number(a[safeKey]) || 0;
        bValue = Number(b[safeKey]) || 0;
      } else if (DATE_SORT_KEYS.includes(safeKey)) {
        aValue = safeGetTime(a[safeKey]);
        bValue = safeGetTime(b[safeKey]);
      } else {
        aValue = String(a[safeKey] || '');
        bValue = String(b[safeKey] || '');
      }
      if (aValue === bValue) return 0;
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return sortDir === 'asc' ? aValue - bValue : bValue - aValue;
      }
      return sortDir === 'asc' ? String(aValue).localeCompare(String(bValue)) : String(bValue).localeCompare(String(aValue));
    });
    return paginate(filtered, { page, pageSize });
  },

  async getQuotation(id) {
    await delay();
    const quote = quotationsStore.all.find((entry) => entry.id === id);
    if (!quote) throw new Error('Quotation not found');
    return clone(quote);
  },

  async getQuotationStats() {
    await delay();
    const records = quotationsStore.all;
    const received = records.filter((quote) => quote.status === QUOTATION_STATUS.RECEIVED).length;
    const pending = records.filter((quote) => quote.status === QUOTATION_STATUS.PENDING).length;
    const accepted = records.filter((quote) => quote.status === QUOTATION_STATUS.ACCEPTED).length;
    const rejected = records.filter((quote) => quote.status === QUOTATION_STATUS.REJECTED).length;
    const receivedQuotes = records.filter((quote) => quote.status === QUOTATION_STATUS.RECEIVED || quote.status === QUOTATION_STATUS.ACCEPTED);
    const totals = receivedQuotes.map((quote) => quote.total);
    const average = totals.length > 0 ? totals.reduce((sum, value) => sum + value, 0) / totals.length : 0;
    const lowest = totals.length > 0 ? Math.min(...totals) : 0;
    return { received, pending, accepted, rejected, total: records.length, average, lowest };
  },

  /**
   * Records / updates a vendor quotation against an RFQ.
   *
   * Business rules enforced on every NEW quotation (id-less payloads):
   *   - a quotation must reference a valid, open RFQ (Sent / Quotation
   *     Received / Evaluation) — Cancelled / Closed / unopened RFQs are
   *     refused;
   *   - the vendor must be one of the RFQ's invited vendors;
   *   - the vendor master record must be Approved AND active (the same
   *     eligibility rule the RFQ send guard enforces);
   *   - quotation numbers are unique;
   *   - a live (Received / Accepted) quotation from the same vendor is
   *     never overwritten. A Pending placeholder (invited, not yet
   *     responded) or a Rejected quote is filled in place instead, so
   *     vendors can respond or resubmit without duplicating.
   *
   * When no line items are supplied the RFQ items are inherited
   * automatically (quoted at the RFQ's expected rates). The quotation
   * carries the full commercial field set — number, RFQ / PR / vendor
   * references, date, validity, currency, payment & delivery terms, lead
   * time, warranty, freight, insurance, discount, tax, other charges,
   * total, remarks and attachments — with freight and insurance added
   * to the grand total. Id-bearing payloads (the accept / reject status
   * flow) update the stored quotation in place.
   */
  async saveQuotation(payload = {}) {
    await delay();
    const records = quotationsStore.all;
    const rfq = rfqsStore.all.find((entry) => entry.rfqNo === payload.rfqNo) || null;
    const updateIndex = payload.id ? records.findIndex((entry) => entry.id === payload.id) : -1;
    const isCreate = updateIndex === -1;

    let targetIndex = updateIndex;

    if (isCreate) {
      /* RULE — quotation without a valid RFQ is refused. */
      if (!payload.rfqNo || !rfq) {
        throw new Error('Quotation must reference a valid RFQ');
      }
      /* RULE — quotation for a cancelled / closed RFQ is refused. */
      if ([RFQ_STATUS.CANCELLED, RFQ_STATUS.CLOSED].includes(rfq.status)) {
        throw new Error('Cannot record a quotation for a cancelled RFQ');
      }
      /* RULE — quotations only land once the RFQ is open for bids. */
      if (![RFQ_STATUS.SENT, RFQ_STATUS.QUOTATION_RECEIVED, RFQ_STATUS.EVALUATION].includes(rfq.status)) {
        throw new Error('Only sent RFQs can receive quotations');
      }
      /* RULE — the vendor must be one of the RFQ's invited vendors. */
      if (!(rfq.vendors || []).includes(payload.vendor)) {
        throw new Error(`${payload.vendor} is not invited to this RFQ`);
      }
      /* RULE — quotations only from Approved vendor masters. */
      if (!isVendorRfqEligible(resolveVendorByName(payload.vendor))) {
        throw new Error(`Cannot record a quotation from ${payload.vendor} — vendor is not approved`);
      }
      /* RULE — never overwrite a live quotation. A Pending placeholder
         (invited, no response yet) or a Rejected quote is filled in
         place so its number and identity stay stable. Names are matched
         loosely (same resolution as the eligibility rule) so legacy
         vendor spellings cannot bypass the guard. */
      const vendorMasterName = resolveVendorByName(payload.vendor)?.name || payload.vendor;
      const sameVendor =
        records.find((entry) => entry.rfqNo === payload.rfqNo && entry.vendor === payload.vendor) ||
        records.find(
          (entry) =>
            entry.rfqNo === payload.rfqNo &&
            entry.vendor &&
            (resolveVendorByName(entry.vendor)?.name || entry.vendor) === vendorMasterName
        );
      if (sameVendor) {
        if ([QUOTATION_STATUS.RECEIVED, QUOTATION_STATUS.ACCEPTED].includes(sameVendor.status)) {
          throw new Error(`${payload.vendor} has already submitted a quotation for this RFQ`);
        }
        targetIndex = records.indexOf(sameVendor);
      }
    }

    const existing = targetIndex !== -1 ? records[targetIndex] : null;

    /* RULE — quotation numbers are unique across the store. An explicitly
       supplied number (caller or a record being edited) that already belongs
       to a different quotation is refused, never overwritten. An auto-
       generated number walks forward until it finds a free slot, so rapid
       successive saves can never collide even mid-operation. */
    let quotationNo = payload.quotationNo || existing?.quotationNo || nextQuotationNo(records);
    const takenByOther = (no) => records.some((entry, index) => index !== targetIndex && entry.quotationNo === no);
    if (takenByOther(quotationNo)) {
      if (payload.quotationNo || existing?.quotationNo) {
        throw new Error(`Quotation number ${quotationNo} already exists`);
      }
      let seq = records.reduce((max, record) => Math.max(max, quotationSeq(record)), 0);
      do {
        seq += 1;
        quotationNo = `QT-${String(seq).padStart(3, '0')}`;
      } while (takenByOther(quotationNo));
    }

    /* RULE — quotation items automatically inherit the RFQ items when
       none are supplied (quoted at the RFQ's expected rates). */
    const items =
      Array.isArray(payload.items) && payload.items.length > 0
        ? payload.items
        : (rfq?.items || []).map((item) => ({
            product: item.product || '',
            hsn: item.hsn || '',
            uom: item.uom || 'Nos',
            qty: Number(item.qty) || 0,
            rate: Number(item.rate ?? item.expectedRate) || 0,
            specification: item.specification || '',
            gstRate: Number(rfq?.commercialTerms?.taxRate) || 18
          }));

    const freight = Number(payload.freight) || 0;
    const insurance = Number(payload.insurance) || 0;
    const totals = calcDocumentTotals(items, payload.discount, payload.charges);
    const record = {
      id: existing?.id || payload.id || `QT-${String(records.length + 1).padStart(3, '0')}`,
      quotationNo,
      rfqNo: payload.rfqNo || '',
      /* The quotation references the RFQ AND its originating PR. */
      prNo: payload.prNo || rfq?.prNo || rfq?.reference || '',
      /* Explicit link keys — the RFQ id and the vendor-master id (null when
         the vendor name cannot be resolved), so consumers never have to
         re-derive the relationship. */
      rfqId: rfq?.id || existing?.rfqId || null,
      vendorId: resolveVendorByName(payload.vendor)?.id || existing?.vendorId || null,
      vendor: payload.vendor || '',
      vendorRating: vendorRatingOf(payload.vendor),
      submittedOn: payload.submittedOn || todayLocal(),
      validUntil: payload.validUntil || '',
      currency: payload.currency || rfq?.currency || getDefaultCurrency(),
      discount: Number(payload.discount) || 0,
      charges: Number(payload.charges) || 0,
      freight,
      insurance,
      deliveryTerms: payload.deliveryTerms || '',
      items,
      subtotal: totals.subtotal,
      discountAmount: totals.discountAmount,
      taxable: totals.taxable,
      gstTotal: totals.gstTotal,
      total: round2(totals.total + freight + insurance),
      leadTime: Number(payload.leadTime) || 0,
      delivery: Number(payload.delivery) || 0,
      paymentTerms: payload.paymentTerms || PAYMENT_TERMS[4],
      warranty: payload.warranty || WARRANTY_TERMS[3],
      score: Number(payload.score) || 0,
      scoreBreakdown: payload.scoreBreakdown || null,
      status: payload.status || QUOTATION_STATUS.RECEIVED,
      notes: payload.notes || '',
      remarks: payload.remarks || payload.notes || '',
      attachments: Array.isArray(payload.attachments) ? payload.attachments : []
    };
    if (targetIndex === -1) records.push(record);
    else records[targetIndex] = record;
    quotationsStore.persist(records);

    /* Re-score against the full peer group for this RFQ. */
    const peers = records.filter((quote) => quote.rfqNo === record.rfqNo);
    const scoring = computeQuoteScore(record, peers);
    record.score = scoring.score;
    record.scoreBreakdown = scoring.scoreBreakdown;
    records[targetIndex === -1 ? records.length - 1 : targetIndex] = record;
    quotationsStore.persist(records);

    /* Auto-transition: first received quotation moves the RFQ from
       Sent → Quotation Received so the workflow advances itself. */
    if ([QUOTATION_STATUS.RECEIVED, QUOTATION_STATUS.ACCEPTED].includes(record.status)) {
      const rfqs = rfqsStore.all;
      const rfqIndex = rfqs.findIndex((rfq) => rfq.rfqNo === record.rfqNo);
      if (rfqIndex !== -1 && rfqs[rfqIndex].status === RFQ_STATUS.SENT) {
        rfqs[rfqIndex] = {
          ...rfqs[rfqIndex],
          status: RFQ_STATUS.QUOTATION_RECEIVED,
          activity: [
            ...(rfqs[rfqIndex].activity || []),
            activityEntry('quote', `Quotation received from ${record.vendor}`, record.id)
          ]
        };
        rfqsStore.persist(rfqs);
      }
    }
    return clone(record);
  },

  /** Delete a quotation by id. */
  async deleteQuotation(quotationId) {
    await delay();
    const records = quotationsStore.all;
    const index = records.findIndex((entry) => entry.id === quotationId);
    if (index === -1) throw new Error('Quotation not found');
    const deleted = records[index];
    if (deleted.status === QUOTATION_STATUS.ACCEPTED) {
      throw new Error('Cannot delete an accepted quotation. Revoke the award first.');
    }
    records.splice(index, 1);
    quotationsStore.persist(records);
    /* If the RFQ was in EVALUATION/QUOTATION_RECEIVED and all quotations
       are now gone, reset the RFQ status back to SENT */
    const rfqNo = deleted.rfqNo;
    const remaining = records.filter((q) => q.rfqNo === rfqNo);
    if (remaining.length === 0 && rfqNo) {
      const rfqRecords = rfqsStore.all;
      const rfqIdx = rfqRecords.findIndex((r) => r.rfqNo === rfqNo);
      if (rfqIdx !== -1) {
        const rfq = rfqRecords[rfqIdx];
        if ([RFQ_STATUS.QUOTATION_RECEIVED, RFQ_STATUS.EVALUATION].includes(rfq.status)) {
          rfqRecords[rfqIdx] = { ...rfq, status: RFQ_STATUS.SENT };
          rfqsStore.persist(rfqRecords);
        }
      }
    }
    return clone(deleted);
  },

  /** ------------------------- Quotation comparison ------------------------- */
  async getQuotationComparison(rfqId) {
    await delay();
    /* Accept the RFQ id (view / list / compare page) or its rfqNo (the
       vendor-quotations list navigates with the quote's rfqNo field). */
    const rfq =
      rfqsStore.all.find((entry) => entry.id === rfqId) ||
      rfqsStore.all.find((entry) => entry.rfqNo === rfqId);
    if (!rfq) throw new Error('RFQ not found');
    const quotes = quotationsStore.all
      .filter((quote) => quote.rfqNo === rfq.rfqNo)
      .sort((a, b) => b.score - a.score || a.total - b.total)
      .map((quote, index) => ({ ...clone(quote), rank: index + 1 }));

    const accepted = quotes.find((quote) => quote.status === QUOTATION_STATUS.ACCEPTED);
    const winner = accepted || quotes.find((quote) => quote.status !== QUOTATION_STATUS.REJECTED) || null;

    const lowest = quotes.length > 0 ? quotes.reduce((best, quote) => (quote.total < best.total ? quote : best), quotes[0]) : null;
    const fastest = quotes.length > 0 ? quotes.reduce((best, quote) => (quote.delivery < best.delivery ? quote : best), quotes[0]) : null;
    const bestScore = quotes.length > 0 ? quotes.reduce((best, quote) => (quote.score > best.score ? quote : best), quotes[0]) : null;

    const estimated = estimatedValueOf(rfq);
    const bestTotal = lowest?.total ?? null;
    return {
      /* Enriched so the comparison page can show the PR link (prNo) and
         live quotation counts alongside the stored quotation data. */
      rfq: clone(enrichRfq(rfq)),
      quotes,
      winner: winner ? clone(winner) : null,
      savings: quotes.length > 1 ? Math.max(0, Math.max(...quotes.map((q) => q.total)) - Math.min(...quotes.map((q) => q.total))) : 0,
      estimatedValue: estimated,
      savingsVsEstimate: bestTotal != null ? Math.max(0, estimated - bestTotal) : 0,
      awarded:
        rfq.status === RFQ_STATUS.AWARDED && rfq.awardedVendor
          ? { vendor: rfq.awardedVendor, quoteId: rfq.awardedQuoteId, total: rfq.awardedValue, awardedAt: rfq.awardedAt }
          : null,
      scoringWeights: { ...RFQ_SCORING_WEIGHTS },
      highlights: {
        lowestPrice: lowest ? clone(lowest) : null,
        fastestDelivery: fastest ? clone(fastest) : null,
        bestScore: bestScore ? clone(bestScore) : null
      }
    };
  },

  /** ---------------------------- Cost estimation --------------------------- */
  async getCostEstimates() {
    await delay();
    const rfqs = rfqsStore.all.map(enrichRfq);
    const rows = rfqs.map((rfq) => {
      const quotes = quotationsStore.all
        .filter((quote) => quote.rfqNo === rfq.rfqNo && (quote.status === QUOTATION_STATUS.RECEIVED || quote.status === QUOTATION_STATUS.ACCEPTED))
        .sort((a, b) => a.total - b.total);
      const totals = quotes.map((quote) => quote.total);
      const estimated = rfq.estimatedValue || 0;
      const lowest = totals.length > 0 ? Math.min(...totals) : null;
      const highest = totals.length > 0 ? Math.max(...totals) : null;
      const average = totals.length > 0 ? totals.reduce((sum, value) => sum + value, 0) / totals.length : null;
      const difference = lowest != null ? lowest - estimated : null;
      const savings = lowest != null && estimated > lowest ? estimated - lowest : 0;
      return {
        ...rfq,
        estimated,
        lowest,
        highest,
        average,
        difference,
        variance: difference != null && estimated > 0 ? Math.round((difference / estimated) * 1000) / 10 : null,
        savings,
        winnerVendor: quotes[0]?.vendor || null
      };
    });
    const withQuotes = rows.filter((row) => row.lowest != null);
    const estimated = rows.reduce((sum, row) => sum + row.estimated, 0);
    const lowest = withQuotes.reduce((sum, row) => sum + (row.lowest || 0), 0);
    const highest = withQuotes.reduce((sum, row) => sum + (row.highest || 0), 0);
    const average = withQuotes.reduce((sum, row) => sum + (row.average || 0), 0);
    const savings = withQuotes.reduce((sum, row) => sum + row.savings, 0);
    return {
      rows,
      stats: { estimated, lowest, highest, average, savings, difference: lowest - estimated }
    };
  },

  /** ------------------------------- Audit log ------------------------------ */

  /**
   * Builds the audit trail for an RFQ. Entries carry old/new values plus
   * a deterministic (mock) IP and device per event — the compliance view
   * of every state change.
   */
  async getRfqAudit(id) {
    await delay();
    const rfq = resolveRfqRecord(id);
    if (!rfq) throw new Error('RFQ not found');

    const mockIps = ['10.20.4.15', '10.20.4.23', '10.20.5.7', '172.16.8.12', '10.20.4.31'];
    const mockDevices = ['Chrome 126 · Windows 11', 'Chrome 126 · macOS 14', 'Edge 126 · Windows 11', 'Firefox 127 · Windows 11'];
    const changeFor = {
      create: { oldValue: '', newValue: RFQ_STATUS.DRAFT },
      submit: { oldValue: RFQ_STATUS.DRAFT, newValue: RFQ_STATUS.PENDING_APPROVAL },
      approve: { oldValue: RFQ_STATUS.PENDING_APPROVAL, newValue: RFQ_STATUS.APPROVED },
      send: { oldValue: RFQ_STATUS.APPROVED, newValue: RFQ_STATUS.SENT },
      quote: { oldValue: RFQ_STATUS.SENT, newValue: RFQ_STATUS.QUOTATION_RECEIVED },
      review: { oldValue: RFQ_STATUS.QUOTATION_RECEIVED, newValue: RFQ_STATUS.EVALUATION },
      award: { oldValue: RFQ_STATUS.EVALUATION, newValue: RFQ_STATUS.AWARDED },
      po: { oldValue: RFQ_STATUS.AWARDED, newValue: RFQ_STATUS.CLOSED },
      order: { oldValue: RFQ_STATUS.AWARDED, newValue: 'PO Raised' },
      reject: { oldValue: '', newValue: RFQ_STATUS.CANCELLED },
      comment: { oldValue: '', newValue: '' },
      mail: { oldValue: '', newValue: 'Vendor emailed' },
      print: { oldValue: '', newValue: 'PDF exported' },
      attach: { oldValue: '', newValue: 'Attachment uploaded' }
    };

    const entries = (rfq.activity || []).map((entry, index) => {
      const change = changeFor[entry.type] || { oldValue: '', newValue: entry.note || '' };
      return {
        id: entry.id || `${rfq.id}-act-${index + 1}`,
        date: entry.timestamp,
        user: entry.actor || 'System',
        action: entry.label || entry.type,
        oldValue: change.oldValue,
        newValue: change.newValue,
        ip: mockIps[index % mockIps.length],
        device: mockDevices[index % mockDevices.length],
        remarks: entry.note || ''
      };
    });

    return { id, rfqNo: rfq.rfqNo, entries };
  },

  /** ---------------------------- Print preview ----------------------------- */

  /**
   * Returns a ready-to-render print document: RFQ record plus company
   * profile and signature placeholders (mirrors the requisition flow).
   */
  async printPreview(id) {
    await delay();
    const rfq = resolveRfqRecord(id);
    if (!rfq) throw new Error('RFQ not found');
    const actor = getCurrentActor();
    return {
      record: clone(enrichRfq(rfq)),
      company: {
        name: 'ABC Manufacturing Pvt Ltd',
        address: 'Plot 42, MIDC Industrial Area, Pune, Maharashtra 411026',
        gstin: '27AAACA1234A1Z5',
        phone: '+91 20 4890 1200',
        email: 'procurement@abcmfg.example'
      },
      preparedBy: rfq.buyer || rfq.requester || '—',
      approvedBy: rfq.status === RFQ_STATUS.APPROVED || rfq.status === RFQ_STATUS.SENT || rfq.status === RFQ_STATUS.QUOTATION_RECEIVED || rfq.status === RFQ_STATUS.EVALUATION || rfq.status === RFQ_STATUS.AWARDED || rfq.status === RFQ_STATUS.CLOSED
        ? (actor.name || 'Kavita Rao')
        : '—',
      generatedAt: new Date().toISOString()
    };
  },

  /** Records a `print` activity entry after the RFQ PDF has been exported. */
  async logPrintActivity(id) {
    await delay();
    const records = rfqsStore.all;
    const index = records.findIndex((entry) => entry.id === id || entry.rfqNo === id);
    if (index === -1) throw new Error('RFQ not found');
    const existing = records[index];
    const now = nowIso();
    records[index] = {
      ...existing,
      activity: [
        ...(Array.isArray(existing.activity) ? existing.activity : []),
        { type: 'print', label: 'PDF exported', actor: 'Current User', timestamp: now, note: existing.rfqNo }
      ]
    };
    rfqsStore.persist(records);
    return { ok: true, rfqNo: existing.rfqNo };
  },

  /** ------------------------------ Dashboard ------------------------------- */
  async getRfqDashboard() {
    repairInconsistentRfqStatuses();
    await delay();
    const records = rfqsStore.all.map(enrichRfq);
    const quotes = quotationsStore.all;

    const statusBreakdown = RFQ_STATUSES.map((status) => ({
      label: status,
      value: records.filter((rfq) => rfq.status === status).length,
      color: {
        Draft: '#94a3b8',
        'Pending Approval': '#f59e0b',
        Approved: '#16a34a',
        Sent: '#2563eb',
        'Quotation Received': '#0891b2',
        Evaluation: '#7c3aed',
        Awarded: '#4f46e5',
        Closed: '#64748b',
        Cancelled: '#dc2626'
      }[status] || '#94a3b8'
    }));

    const monthMap = {};
    const monthLabel = (iso) => {
      const date = new Date(iso);
      return Number.isNaN(date.getTime())
        ? '—'
        : date.toLocaleDateString('en-GB', { month: 'short' });
    };
    records.forEach((rfq) => {
      const key = monthLabel(rfq.createdAt);
      monthMap[key] = (monthMap[key] || 0) + 1;
    });
    const monthlyTrend = {
      labels: Object.keys(monthMap),
      values: Object.values(monthMap)
    };

    const categoryMap = {};
    records.forEach((rfq) => {
      categoryMap[rfq.category] = (categoryMap[rfq.category] || 0) + 1;
    });
    const categoryBreakdown = Object.entries(categoryMap)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);

    const vendorMap = {};
    records.forEach((rfq) => {
      (rfq.vendors || []).forEach((vendor) => {
        vendorMap[vendor] = (vendorMap[vendor] || 0) + 1;
      });
    });
    const vendorParticipation = Object.entries(vendorMap)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);

    /* Vendor response rate: for every invited vendor, how many of their
       invitations actually came back with a quotation. */
    const invitationMap = {};
    const respondedMap = {};
    records.forEach((rfq) => {
      (rfq.vendors || []).forEach((vendor) => {
        invitationMap[vendor] = (invitationMap[vendor] || 0) + 1;
      });
      const responded = new Set(
        quotes
          .filter((quote) => quote.rfqNo === rfq.rfqNo && quote.submittedOn && quote.status !== QUOTATION_STATUS.PENDING)
          .map((quote) => quote.vendor)
      );
      responded.forEach((vendor) => {
        respondedMap[vendor] = (respondedMap[vendor] || 0) + 1;
      });
    });
    const vendorResponseRate = Object.entries(invitationMap)
      .map(([label, invitations]) => ({
        label,
        invitations,
        responded: respondedMap[label] || 0,
        rate: invitations > 0 ? Math.round(((respondedMap[label] || 0) / invitations) * 100) : 0
      }))
      .sort((a, b) => b.rate - a.rate || b.invitations - a.invitations)
      .slice(0, 6);

    /* Award distribution: RFQs awarded to each winning vendor. */
    const awardMap = {};
    records.forEach((rfq) => {
      if (rfq.status === RFQ_STATUS.AWARDED && rfq.awardedVendor) {
        awardMap[rfq.awardedVendor] = (awardMap[rfq.awardedVendor] || 0) + 1;
      }
    });
    const awardDistribution = Object.entries(awardMap)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);

    const now = new Date();
    const nextWeek = new Date(now.getTime() + 7 * 86400000);
    const expiringRfqs = records
      .filter(
        (rfq) =>
          rfq.dueDate &&
          safeGetTime(rfq.dueDate) >= now.getTime() &&
          safeGetTime(rfq.dueDate) <= nextWeek.getTime() &&
          rfq.status !== RFQ_STATUS.CLOSED &&
          rfq.status !== RFQ_STATUS.CANCELLED
      )
      .sort((a, b) => safeGetTime(a.dueDate) - safeGetTime(b.dueDate));

    const openRfqs = records.filter(isOpenRfq);
    const valueTrend = {
      labels: openRfqs.map((rfq) => rfq.rfqNo),
      estimated: openRfqs.map((rfq) => rfq.estimatedValue || 0),
      quoted: openRfqs.map((rfq) => {
        const group = quotes.filter((quote) => quote.rfqNo === rfq.rfqNo && quote.total != null);
        return group.length > 0 ? Math.min(...group.map((quote) => quote.total)) : 0;
      })
    };

    return {
      stats: await mockRfqService.getRfqStats(),
      statusBreakdown,
      monthlyTrend,
      categoryBreakdown,
      vendorParticipation,
      vendorResponseRate,
      awardDistribution,
      expiringRfqs,
      valueTrend,
      topByValue: [...records].sort((a, b) => (b.estimatedValue || 0) - (a.estimatedValue || 0)).slice(0, 6),
      quotationStats: {
        received: quotes.filter((quote) => quote.status === QUOTATION_STATUS.RECEIVED).length,
        pending: quotes.filter((quote) => quote.status === QUOTATION_STATUS.PENDING).length,
        accepted: quotes.filter((quote) => quote.status === QUOTATION_STATUS.ACCEPTED).length,
        rejected: quotes.filter((quote) => quote.status === QUOTATION_STATUS.REJECTED).length
      }
    };
  }
};

/**
 * API-first RFQ service facade. Calls the real Spring Boot API;
 * falls back to the mock implementation only when the backend is
 * unreachable (network error). Public interface identical to the
 * mock's, so components are untouched.
 */
export const rfqService = {
  async getRfqs(options = {}) {
    return withFallback(() => rfqApi.list(options), () => mockRfqService.getRfqs(options));
  },

  async getRfq(id) {
    return withFallback(() => rfqApi.get(id), () => mockRfqService.getRfq(id));
  },

  async createRfq(payload = {}) {
    return withFallback(() => rfqApi.create(payload), () => mockRfqService.createRfq(payload));
  },

  async updateRfq(id, patch = {}) {
    return withFallback(() => rfqApi.update(id, patch), () => mockRfqService.updateRfq(id, patch));
  },

  async submitForReview(id, note = '') {
    return withFallback(() => rfqApi.submitForReview(id, note), () => mockRfqService.submitForReview(id, note));
  },

  async approveRfq(id, note = '') {
    return withFallback(() => rfqApi.approve(id, note), () => mockRfqService.approveRfq(id, note));
  },

  async rejectRfq(id, note = '') {
    return withFallback(() => rfqApi.reject(id, note), () => mockRfqService.rejectRfq(id, note));
  },

  async sendRfq(id) {
    return withFallback(() => rfqApi.send(id), () => mockRfqService.sendRfq(id));
  },

  async startEvaluation(id, note = '') {
    return withFallback(() => rfqApi.startEvaluation(id, note), () => mockRfqService.startEvaluation(id, note));
  },

  async awardRfq(id, vendorName, note = '') {
    return withFallback(() => rfqApi.award(id, vendorName, note), () => mockRfqService.awardRfq(id, vendorName, note));
  },

  async closeRfq(id) {
    return withFallback(() => rfqApi.close(id), () => mockRfqService.closeRfq(id));
  },

  async cancelRfq(id, note = '') {
    return withFallback(() => rfqApi.cancel(id, note), () => mockRfqService.cancelRfq(id, note));
  },

  async duplicateRfq(id) {
    return withFallback(() => rfqApi.duplicate(id), () => mockRfqService.duplicateRfq(id));
  },

  async deleteRfq(id) {
    return withFallback(() => rfqApi.delete(id), () => mockRfqService.deleteRfq(id));
  },

  async addComment(id, text) {
    return withFallback(() => rfqApi.comment(id, text), () => mockRfqService.addComment(id, text));
  },

  async getRfqTimeline(id) {
    return withFallback(() => rfqApi.timeline(id), () => mockRfqService.getRfqTimeline(id));
  },

  async getRfqStats() {
    return withFallback(() => rfqApi.stats(), () => mockRfqService.getRfqStats());
  },

  async getRfqAudit(id) {
    return withFallback(() => rfqApi.audit(id), () => mockRfqService.getRfqAudit(id));
  },

  async printPreview(id) {
    return withFallback(() => rfqApi.printPreview(id), () => mockRfqService.printPreview(id));
  },

  async logPrintActivity(id) {
    return withFallback(() => rfqApi.logPrint(id), () => mockRfqService.logPrintActivity(id));
  },

  async getRfqDashboard() {
    return withFallback(() => rfqApi.dashboard(), () => mockRfqService.getRfqDashboard());
  },

  async getQuotations(options = {}) {
    return withFallback(() => rfqApi.quotations(options), () => mockRfqService.getQuotations(options));
  },

  async getQuotation(id) {
    return withFallback(() => rfqApi.quotation(id), () => mockRfqService.getQuotation(id));
  },

  async getQuotationStats() {
    return withFallback(() => rfqApi.quotationStats(), () => mockRfqService.getQuotationStats());
  },

  async saveQuotation(payload = {}) {
    return withFallback(() => rfqApi.saveQuotation(payload), () => mockRfqService.saveQuotation(payload));
  },

  async deleteQuotation(quotationId) {
    return withFallback(() => rfqApi.deleteQuotation(quotationId), () => mockRfqService.deleteQuotation(quotationId));
  },

  async getQuotationComparison(rfqId) {
    return withFallback(() => rfqApi.comparison(rfqId), () => mockRfqService.getQuotationComparison(rfqId));
  },

  async raisePurchaseOrder(id, note = '') {
    return withFallback(() => rfqApi.raisePo(id, note), () => mockRfqService.raisePurchaseOrder(id, note));
  },

  async getCostEstimates() {
    return withFallback(() => rfqApi.costEstimates(), () => mockRfqService.getCostEstimates());
  },

  /**
   * Returns vendor quote status for a given RFQ — which vendors have
   * already quoted and which are still available. Used by the QuotationForm
   * vendor dropdown to show "Already Quoted" vs "Available" status.
   */
  async getVendorQuoteStatus(rfqNo) {
    const rfq = rfqsStore.all.find((r) => r.rfqNo === rfqNo);
    if (!rfq) return { quoted: [], available: [], all: [] };
    const rfqVendors = rfq.vendors || [];
    const quotes = quotationsStore.all.filter(
      (q) => q.rfqNo === rfqNo && [QUOTATION_STATUS.RECEIVED, QUOTATION_STATUS.ACCEPTED].includes(q.status)
    );
    const quotedVendors = new Set(quotes.map((q) => q.vendor));
    const quoted = rfqVendors
      .filter((v) => quotedVendors.has(v))
      .map((v) => {
        const quote = quotes.find((q) => q.vendor === v);
        return { vendor: v, quoteId: quote?.id, quotationNo: quote?.quotationNo, amount: quote?.total || 0 };
      });
    const available = rfqVendors.filter((v) => !quotedVendors.has(v));
    return {
      quoted,
      available,
      all: rfqVendors.map((v) => ({
        vendor: v,
        quoted: quotedVendors.has(v),
        quoteId: quotes.find((q) => q.vendor === v)?.id || null,
        quotationNo: quotes.find((q) => q.vendor === v)?.quotationNo || null,
        amount: quotes.find((q) => q.vendor === v)?.total || 0,
      })),
    };
  }
};
