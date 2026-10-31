/**
 * purchase/services/invoice.js
 * ------------------------------------------------------------------
 * Mock Purchase Invoice service: vendor invoices against purchase
 * orders, payment recording and three-way-match bookkeeping. Data
 * persists to localStorage via the lazy collection.
 * ------------------------------------------------------------------
 */
import {
  INVOICE_STATUS, MATCH_STATUS, PAYMENT_METHODS, PAYMENT_STATUS, ADVICE_STATUS,
  INVOICE_TYPE, PAYMENT_ENTRY_STATUS, ADJUSTMENT_NOTE_TYPE, ADJUSTMENT_NOTE_STATUS
} from '../constants';
import { getActivePaymentTerms, getSequence, issueNextNumber, readSettings } from './settings';
import { calcDocumentTotals, nextSeqNo, round2 } from '../utils/purchase';
import { appendAudit } from '../utils/paymentUtils';
import {
  invoiceAdjustments as readInvoiceAdjustments,
  noteAmounts, noteTotal, noteTypeSign,
  effectiveNetPayable as adjustedNetPayableOf,
  effectiveOutstanding as adjustedOutstandingOf,
  vendorCreditBalance as vendorCreditBalanceOf
} from '../utils/adjustmentNotes';
import { ordersStore } from './purchaseOrder';
import { GRN_STATUS, grnsStore } from './logistics';
import { invoiceApi, adjustmentNoteApi } from './api/invoiceApi';
import { getCurrentActor, isApiMode, withFallback } from './api-client';
import { notifyWorkflowEvent, formatAmount } from './notificationFeed';
import { clone, createCollection, delay, paginate, storageKeys, todayLocal } from './base';
import {
  buildApprovalChain, chainToApprovalStatus, createApprovalState,
  approveStep as engineApproveStep, rejectStep as engineRejectStep,
  requestCorrection as engineRequestCorrection, resubmitState as engineResubmitState,
  currentStepIndex
} from './approvalEngine';
export { INVOICE_STATUS, MATCH_STATUS, PAYMENT_METHODS, PAYMENT_STATUS, ADVICE_STATUS };

export function isCreditNote(invoice) {
  return String(invoice?.invoiceType || '').toLowerCase().includes('credit note');
}

/** The numbering sequence a vendor finance document belongs to. */
export function sequenceForInvoiceType(invoiceType) {
  const t = String(invoiceType || '').toLowerCase();
  if (t.includes('credit note')) return 'Credit Note';
  if (t.includes('debit note')) return 'Debit Note';
  return 'Vendor Invoice';
}

/**
 * Generates the next vendor finance document number via the central
 * numbering engine.
 *
 * Vendor Invoices (VINV), Credit Notes (CN) and Debit Notes (DN) each
 * have their OWN independent sequence, so the numbers can never be
 * confused with — or collide with — Inventory Movement references
 * (INV-YYYY-NNN). Each sequence's counter + issued-ledger come from
 * Settings → Document Numbering.
 */
export function nextInvoiceNo(records = []) {
  return nextInvoiceDocumentNo({}, records);
}

/**
 * Next number for the invoice document type of the given payload
 * (Vendor Invoice / Credit Note / Debit Note), scoped to its own
 * sequence and prefix so the three namespaces advance independently.
 */
export function nextInvoiceDocumentNo(payload = {}, records = []) {
  const seqKey = sequenceForInvoiceType(payload.invoiceType);
  const seq = getSequence(readSettings()?.numbering, seqKey) || {};
  const prefix = seq.prefix || 'VINV';
  const existing = records
    .map((r) => String(r?.invoiceNo || ''))
    .filter((no) => no.startsWith(`${prefix}-`));
  return issueNextNumber(seqKey, existing).number;
}

/**
 * Derives the invoice due date from its payment terms when the caller
 * did not provide one: the credit period first comes from the PO's
 * finalized terms ({ creditDays }), then from the configured Settings
 * payment-terms list matched by code or name. Returns '' when nothing
 * can be derived.
 */
export function invoiceDueDate(payload = {}, order = null, invoiceDate = '') {
  const base = invoiceDate || payload.invoiceDate || '';
  if (!base) return '';
  const creditDays = (terms) => {
    if (terms && Number.isFinite(Number(terms.creditDays)) && Number(terms.creditDays) >= 0) return Number(terms.creditDays);
    return null;
  };
  let days = creditDays(order?.paymentTerms);
  if (days === null) {
    const label = String(payload.paymentTerms || order?.paymentTerms?.type || order?.terms || '');
    const pt = getActivePaymentTerms().find((t) => t.code === label || t.name === label);
    if (pt) days = creditDays(pt);
  }
  if (days === null) return '';
  const d = new Date(`${base}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  if (days === 0) return base;
  d.setDate(d.getDate() + days);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * Net payable for an invoice: gross total minus TDS / withholding and
 * retention — the amount actually owed to the vendor. Derived, never
 * user-typed.
 */
export function netPayableOf(invoice) {
  const total = Number(invoice.total) || 0;
  const tds = Number(invoice.tds) || 0;
  const retention = Number(invoice.retention) || 0;
  return round2(total - tds - retention);
}

/** Net payable AFTER approved credit / debit notes adjust the ledger. */
export function adjustedNetPayable(invoice) {
  return adjustedNetPayableOf(invoice);
}

/** Outstanding balance: adjusted net payable minus what has been paid. */
export function outstandingOf(invoice) {
  return adjustedOutstandingOf(invoice);
}

/** Vendor credit when payments + approved notes exceed the net payable. */
export function vendorCreditOf(invoice) {
  return vendorCreditBalanceOf(invoice);
}

/**
 * Resolves an exchange rate from the payment currency into the invoice
 * currency. Rates are sourced from the configured currency master
 * (relative to the base INR). Cross-currency conversions chain the two
 * INR-relative rates; a same-currency payment always uses 1.
 */
export function normalizeExchangeRate(provided, paymentCurrency, invoiceCurrency) {
  const base = invoiceCurrency || 'INR';
  const from = paymentCurrency || base;
  if (from === base) return 1;
  const rates = readSettings().currencies || [];
  const rateOf = (code) => {
    const entry = rates.find((c) => c.code === code);
    return entry ? Number(entry.rate) || 0 : 0;
  };
  if (Number(provided) > 0) return Number(provided);
  const fromRate = rateOf(from);
  const baseRate = rateOf(base);
  if (base === 'INR') return fromRate > 0 ? fromRate : 1;
  if (from === 'INR') return baseRate > 0 ? round2(1 / baseRate) : 1;
  return fromRate > 0 && baseRate > 0 ? round2(fromRate / baseRate) : 1;
}

/** Derives payment status from invoice fields (adjusted-net aware). */
function derivePaymentStatus(invoice) {
  const net = adjustedNetPayableOf(invoice);
  const paid = Number(invoice.paidAmount) || 0;
  /* A fully credited invoice has nothing due — treat as settled even
     before any cash moves (it must never re-enter the payable pool). */
  if (net <= 0.005) return PAYMENT_STATUS.PAID;
  if (paid <= 0) return PAYMENT_STATUS.UNPAID;
  if (paid >= net - 0.01) return PAYMENT_STATUS.PAID;
  return PAYMENT_STATUS.PARTIALLY_PAID;
}

/** Seed invoices — returns empty. Real data from the API. */
function buildSeedInvoices() {
  return [];
}

function invoiceSeed() {
  return buildSeedInvoices();
}

/** Lazy, localStorage-backed invoice collection. */
export const invoicesStore = createCollection(storageKeys.invoices, invoiceSeed);

/* ═══════════════════════════════════════════════════════════════════ */
/*  Credit / Debit Note adjustment ledger                              */
/* ═══════════════════════════════════════════════════════════════════ */

/** Seed adjustment notes — returns empty. */
function adjustmentNoteSeed() {
  return [];
}

/** Lazy, localStorage-backed adjustment-note collection. */
export const adjustmentNotesStore = createCollection(storageKeys.adjustmentNotes, adjustmentNoteSeed);

/** True when the note type is a Credit Note (reduces payable). */
export function isCreditAdjustment(note) {
  return noteTypeSign(note?.noteType) === -1;
}

/** Notes that currently move the ledger: Approved and not Reversed. */
export function activeAdjustmentNotes() {
  return (adjustmentNotesStore.all || []).filter(
    (note) => note && note.status === ADJUSTMENT_NOTE_STATUS.APPROVED
  );
}

/**
 * Sums the APPROVED notes of one invoice into an adjustment summary
 * { credit, debit, net, count } — the block persisted on the invoice
 * and attached on every read so all consumers price adjusted balances.
 */
export function adjustmentTotalsForInvoice(invoice = {}) {
  const invoiceNo = invoice.invoiceNo || invoice.id || '';
  const summary = { credit: 0, debit: 0, count: 0 };
  activeAdjustmentNotes().forEach((note) => {
    if (String(note.invoiceNo || '') !== String(invoiceNo)) return;
    const value = noteTotal(note);
    if (isCreditAdjustment(note)) summary.credit = round2(summary.credit + value);
    else summary.debit = round2(summary.debit + value);
    summary.count += 1;
  });
  return {
    credit: summary.credit,
    debit: summary.debit,
    net: round2(summary.debit - summary.credit),
    count: summary.count
  };
}

/** Attaches the fresh adjustment summary to an invoice row. */
function withAdjustmentSummary(invoice) {
  const adj = readInvoiceAdjustments(invoice);
  const live = adjustmentTotalsForInvoice(invoice);
  /* Prefer the live totals (authoritative); fall back to the persisted
     block only when the notes store is empty but the invoice carries
     one (e.g. restored legacy state). */
  const summary = live.count > 0 || !adj.count
    ? live
    : adj;
  return {
    ...invoice,
    adjustments: { credit: summary.credit, debit: summary.debit, net: summary.net, count: summary.count },
    creditBalance: vendorCreditOf({ ...invoice, adjustments: summary })
  };
}

/**
 * Next adjustment-note number. Credit / Debit Notes share the SAME
 * document-numbering sequences the module configures for invoice-type
 * CN / DN documents (Settings → Document Numbering), so note numbers
 * and legacy note documents can never collide — the counter and
 * issued-ledger are shared and advanced on every issue.
 */
export function nextAdjustmentNoteNo(noteType, records = []) {
  const seqKey = isCreditAdjustment({ noteType })
    ? ADJUSTMENT_NOTE_TYPE.CREDIT
    : ADJUSTMENT_NOTE_TYPE.DEBIT;
  const seq = getSequence(readSettings()?.numbering, seqKey) || {};
  const prefix = seq.prefix || (isCreditAdjustment({ noteType }) ? 'CN' : 'DN');
  const existing = (records || [])
    .map((r) => String(r?.noteNo || ''))
    .filter((no) => no.startsWith(`${prefix}-`));
  return issueNextNumber(seqKey, existing).number;
}

/**
 * Three-way match — re-exported from the ERP-grade matching engine
 * (services/matchingEngine.js). Compares PO ↔ GRN ↔ Vendor Invoice
 * per line (quantity / rate / tax / value) with configurable
 * tolerances and produces Matched / Partially Matched / Mismatch
 * statuses with exact reasons. The engine reads the REAL PO and GRN
 * stores and honours the Settings → 3-Way Matching configuration.
 */
import { computeThreeWayMatch, matchAllowsApproval, getMatchingConfig } from './matchingEngine';
export { computeThreeWayMatch, matchAllowsApproval, getMatchingConfig };

/**
 * Invoice coverage for a PO / GRN: which receipts are already invoiced
 * and how much of the received quantity is covered. Lets PO, GRN and
 * logistics pages show a live "Not Invoiced / Partially Invoiced /
 * Fully Invoiced" status and decide whether "Create Invoice" is
 * offered.
 */
export function invoiceCoverage({ poNo, grnNo } = {}) {
  if (!poNo) return { invoices: [], status: 'Not Invoiced', amount: 0, paid: 0 };
  const related = invoicesStore.all.filter(
    (inv) => inv.poNo === poNo && (!grnNo || inv.grnNo === grnNo)
  );
  const invoiced = {};
  let amount = 0;
  let paid = 0;
  related.forEach((inv) => {
    amount += Number(inv.total) || 0;
    paid += Number(inv.paidAmount) || 0;
    (inv.items || []).forEach((line) => {
      const key = String(line.product || '').trim().toLowerCase();
      invoiced[key] = (invoiced[key] || 0) + (Number(line.qty) || 0);
    });
  });
  const received = receivedQuantitiesByProduct(poNo);
  const keys = Object.keys(received).filter((key) => received[key] > 0);
  const fully =
    keys.length > 0 && keys.every((key) => (invoiced[key] || 0) >= received[key] - 0.001);
  const started =
    related.length > 0 && (keys.length === 0 || keys.some((key) => (invoiced[key] || 0) > 0));
  return {
    invoices: related.map((inv) => inv.id),
    status: !started ? 'Not Invoiced' : fully ? 'Fully Invoiced' : 'Partially Invoiced',
    amount: Math.round(amount * 100) / 100,
    paid: Math.round(paid * 100) / 100
  };
}

function withMatch(invoice) {
  /* Attach the live approved-note adjustment summary first so every
     balance below (and every consumer of service-returned rows) prices
     the invoice AFTER credit / debit note adjustments. */
  const adjusted = withAdjustmentSummary(invoice);
  /* Legacy credit-note documents adjust the ledger directly — they are
     never three-way matched. */
  if (isCreditNote(adjusted)) {
    return {
      ...adjusted,
      outstanding: outstandingOf(adjusted),
      matchStatus: adjusted.matchStatus || MATCH_STATUS.MATCHED,
      matchReasons: adjusted.matchReasons || ['Credit note — no three-way match required'],
      matchDetails: adjusted.matchDetails || [],
      vendorMatched: true
    };
  }
  /* Attach the computed three-way-match result under its own keys so the
     invoice's own `status` is never overwritten by the match status. */
  const match = computeThreeWayMatch(adjusted);
  return {
    ...adjusted,
    outstanding: outstandingOf(adjusted),
    matchStatus: adjusted.overrideStatus || match.status,
    matchReasons: adjusted.overrideReason ? [adjusted.overrideReason, ...(match.reasons || [])] : match.reasons,
    matchDetails: match.details,
    vendorMatched: match.vendorMatched
  };
}

/* ═══════════════════════════════════════════════════════════════════ */
/*  Three-Way Match Override / Resolve / Re-run                        */
/* ═══════════════════════════════════════════════════════════════════ */

/**
 * Re-runs the three-way match for an invoice. Clears any previous
 * override and recomputes from the current PO / GRN / Invoice data.
 * Records an audit entry for the re-match.
 */
async function rematchInvoice(id) {
  await delay();
  const records = invoicesStore.all;
  const index = records.findIndex((entry) => entry.id === id);
  if (index === -1) throw new Error('Invoice not found');
  const invoice = records[index];
  const match = computeThreeWayMatch(invoice);
  const auditHistory = appendAudit(invoice, 'match_rerun', {
    previousStatus: invoice.overrideStatus || invoice.matchStatus,
    newStatus: match.status,
    reasons: match.reasons
  });
  records[index] = {
    ...invoice,
    overrideStatus: null,
    overrideReason: null,
    overrideBy: null,
    overrideAt: null,
    matchStatus: match.status,
    matchReasons: match.reasons,
    matchDetails: match.details,
    auditHistory
  };
  invoicesStore.persist(records);
  return clone(withMatch(records[index]));
}

/**
 * Overrides a mismatched or excepted invoice with a user-supplied
 * status (typically Matched) and a mandatory reason. The override
 * allows the invoice to proceed through the payment workflow despite
 * the computed mismatch. Every override is recorded in the audit trail.
 */
async function overrideMatch(id, { status, reason = '', resolvedField = '', tolerance = '' } = {}) {
  await delay();
  if (!reason || !reason.trim()) throw new Error('Override reason is required');
  if (!Object.values(MATCH_STATUS).includes(status)) throw new Error('Invalid match status');
  const records = invoicesStore.all;
  const index = records.findIndex((entry) => entry.id === id);
  if (index === -1) throw new Error('Invoice not found');
  const invoice = records[index];
  const previousStatus = invoice.overrideStatus || invoice.matchStatus || MATCH_STATUS.PENDING;
  const auditHistory = appendAudit(invoice, 'match_override', {
    previousStatus,
    newStatus: status,
    reason: reason.trim(),
    resolvedField,
    tolerance
  });
  records[index] = {
    ...invoice,
    overrideStatus: status,
    overrideReason: reason.trim(),
    overrideBy: getCurrentActor().name || 'System',
    overrideAt: new Date().toISOString(),
    matchStatus: status,
    matchReasons: [reason.trim()],
    auditHistory
  };
  invoicesStore.persist(records);
  return clone(withMatch(records[index]));
}

/**
 * Rejects a mismatched invoice — records the rejection reason in the
 * audit trail and marks the invoice as rejected so it cannot proceed
 * to payment approval. The invoice can be corrected and resubmitted.
 */
async function rejectMatch(id, { reason = '' } = {}) {
  await delay();
  if (!reason || !reason.trim()) throw new Error('Rejection reason is required');
  const records = invoicesStore.all;
  const index = records.findIndex((entry) => entry.id === id);
  if (index === -1) throw new Error('Invoice not found');
  const invoice = records[index];
  const auditHistory = appendAudit(invoice, 'match_rejected', {
    reason: reason.trim(),
    previousStatus: invoice.matchStatus || MATCH_STATUS.PENDING
  });
  records[index] = {
    ...invoice,
    status: INVOICE_STATUS.REJECTED,
    overrideStatus: MATCH_STATUS.MISMATCH,
    overrideReason: `Rejected: ${reason.trim()}`,
    rejectionReason: reason.trim(),
    auditHistory
  };
  invoicesStore.persist(records);
  return clone(withMatch(records[index]));
}

/**
 * Approves an exception — the invoice had no valid PO reference or
 * other blocking issue. The override records the approval reason.
 */
async function approveException(id, { reason = '' } = {}) {
  await delay();
  if (!reason || !reason.trim()) throw new Error('Approval reason is required');
  const records = invoicesStore.all;
  const index = records.findIndex((entry) => entry.id === id);
  if (index === -1) throw new Error('Invoice not found');
  const invoice = records[index];
  const previousStatus = invoice.overrideStatus || invoice.matchStatus;
  if (previousStatus !== MATCH_STATUS.EXCEPTION) {
    throw new Error('Only excepted invoices can have exceptions approved');
  }
  const auditHistory = appendAudit(invoice, 'exception_approved', {
    previousStatus,
    reason: reason.trim()
  });
  records[index] = {
    ...invoice,
    overrideStatus: MATCH_STATUS.MATCHED,
    overrideReason: reason.trim(),
    overrideBy: getCurrentActor().name || 'System',
    overrideAt: new Date().toISOString(),
    matchStatus: MATCH_STATUS.MATCHED,
    matchReasons: [reason.trim()],
    auditHistory
  };
  invoicesStore.persist(records);
  return clone(withMatch(records[index]));
}

/** Seed payment advices — returns empty. */
function adviceSeed() {
  return [];
}

/** Stored payment advices — one advice per settled payment, never duplicated. */
export const advicesStore = createCollection(storageKeys.advices, adviceSeed);

function addPaymentAdvice(invoice, paidAmount, method) {
  const advices = advicesStore.all;
  /* One advice per payment event — the unique payment number is the
     dedupe key, so two legitimate same-day partial payments of the same
     amount each still get their own advice. */
  const duplicate = advices.some(
    (advice) => advice.invoiceNo === invoice.invoiceNo && advice.paymentNo === invoice.paymentNo
  );
  if (duplicate) return;
  const adviceNo = nextSeqNo(advices, 'ADV', 'adviceNo', 4200);
  const actor = getCurrentActor();
  const advice = {
    id: adviceNo,
    adviceNo,
    /* The advice carries the complete settlement chain — the payment
       number and transaction reference plus the upstream invoice, PO
       and vendor references (PR → RFQ → PO → GRN → Invoice → Payment
       → Payment Advice). */
    paymentNo: invoice.paymentNo || '',
    transactionReference: invoice.transactionReference || '',
    invoiceNo: invoice.invoiceNo,
    vendor: invoice.vendor || '',
    poNo: invoice.poNo || '',
    paidOn: invoice.paymentDate || todayLocal(),
    method: method || invoice.paymentMethod || PAYMENT_METHODS[0],
    bank: invoice.bank || '',
    currency: invoice.paymentCurrency || invoice.currency || 'INR',
    exchangeRate: Number(invoice.exchangeRate) || 1,
    amount: paidAmount,
    status: invoice.status,
    paidBy: invoice.paidBy || actor.name || 'System',
    issuedBy: actor.name || 'System',
    createdAt: new Date().toISOString()
  };
  advices.push(advice);
  advicesStore.persist(advices);
}

function toFilter(value) {
  return value === undefined || value === null || value === '' || value === 'All' ? null : value;
}

/* ------------------------------------------------------------------ */
/*  Receipt-driven invoice sources & line math (shared with the form)  */
/* ------------------------------------------------------------------ */

/** Sum of goods received per product across all non-expected GRNs of a PO. */
export function receivedQuantitiesByProduct(poNo) {
  const map = {};
  grnsStore.all.forEach((grn) => {
    if (grn.poNo !== poNo || grn.status === GRN_STATUS.EXPECTED) return;
    (grn.items || []).forEach((item) => {
      const key = String(item.product || '').trim().toLowerCase();
      map[key] = (map[key] || 0) + (Number(item.received) || 0);
    });
  });
  return map;
}

/** Quantities already invoiced per product across invoices of the same PO. */
function invoicedQuantitiesByProduct(poNo) {
  const map = {};
  invoicesStore.all.forEach((inv) => {
    if (inv.poNo !== poNo) return;
    (inv.items || []).forEach((line) => {
      const key = String(line.product || '').trim().toLowerCase();
      map[key] = (map[key] || 0) + (Number(line.qty) || 0);
    });
  });
  return map;
}

/**
 * Derives the amount / gst / charges / freight / tds / retention /
 * netPayable / total fields stored on an invoice.
 *
 * When line items are supplied the totals are computed with the same
 * calcDocumentTotals used by the PO module (never duplicated inline);
 * otherwise the legacy header-level amount + GST entry is preserved.
 *
 * Financial stack (all derived, never hardcoded):
 *   grossTotal = taxable + GST + charges + freight
 *   tds        = taxable × tdsPercent%   (TDS / withholding on the
 *                                         taxable value, not on GST)
 *   retention  = grossTotal × retentionPercent%
 *   netPayable = grossTotal − tds − retention
 *   outstanding= netPayable − paid (0 at creation)
 */
function invoiceAmounts(payload) {
  const tdsPercent = Number(payload.tdsPercent) || 0;
  const retentionPercent = Number(payload.retentionPercent) || 0;
  const freight = Number(payload.freight) || 0;
  const discount = Number(payload.discount) || 0;

  const items =
    Array.isArray(payload.items) && payload.items.length > 0
      ? payload.items.map((line) => ({
          ...line,
          qty: Number(line.qty) || 0,
          rate: Number(line.rate ?? line.price) || 0,
          discount: Number(line.discount) || 0,
          gstRate: Number(line.gstRate ?? line.gst) || 0
        }))
      : null;

  let amount;
  let gst;
  let charges;
  let gross;
  let totals = null;
  let roundOff;

  if (!items) {
    amount = Number(payload.amount) || 0;
    gst = Number(payload.gst) || 0;
    charges = Number(payload.charges) || 0;
    gross = round2(amount + gst + charges + freight);
    roundOff = Number(payload.roundOff) || 0;
  } else {
    totals = calcDocumentTotals(items, discount, Number(payload.charges) || 0, payload.gstType || '');
    amount = totals.taxable;
    gst = totals.gstTotal;
    charges = totals.charges;
    roundOff = totals.roundOff;
    /* Freight is a separate non-taxable line on top of the document
       totals (which already include charges). */
    gross = round2(totals.total + freight);
  }

  const tds = round2(amount * (tdsPercent / 100));
  const retention = round2(gross * (retentionPercent / 100));
  const netPayable = round2(gross - tds - retention);

  return {
    items: items || [],
    amount,
    gst,
    charges,
    freight,
    tdsPercent,
    tds,
    retentionPercent,
    retention,
    netPayable,
    outstanding: netPayable,
    roundOff,
    discount,
    total: gross,
    totals
  };
}

/* ═══════════════════════════════════════════════════════════════════ */
/*  Credit / Debit Note ledger application                            */
/* ═══════════════════════════════════════════════════════════════════ */

/** Shared vendor-payable bucket math — used by the mock store and by the
    API-mode aggregation so both produce identical figures. */
function accumulateVendorBalances(records = []) {
  const map = {};
  (records || []).forEach((rawInvoice) => {
    /* Approved credit / debit notes adjust every balance below. */
    const invoice = withAdjustmentSummary(rawInvoice);
    const vendor = invoice.vendor || 'Unknown Vendor';
    const bucket = map[vendor] || (map[vendor] = {
      vendor,
      invoices: 0,
      invoiced: 0,
      netPayable: 0,
      paid: 0,
      outstanding: 0,
      creditNotes: 0,
      debitNotes: 0,
      vendorCredit: 0
    });
    const adj = invoice.adjustments || {};
    bucket.invoices += 1;
    bucket.invoiced = round2(bucket.invoiced + (Number(invoice.total) || 0));
    bucket.netPayable = round2(bucket.netPayable + adjustedNetPayable(invoice));
    bucket.paid = round2(bucket.paid + (Number(invoice.paidAmount) || 0));
    bucket.outstanding = round2(bucket.outstanding + outstandingOf(invoice));
    bucket.creditNotes = round2(bucket.creditNotes + (Number(adj.credit) || 0));
    bucket.debitNotes = round2(bucket.debitNotes + (Number(adj.debit) || 0));
    bucket.vendorCredit = round2(bucket.vendorCredit + vendorCreditOf(invoice));
  });
  return Object.values(map).sort((a, b) => b.outstanding - a.outstanding);
}

/**
 * Resolves a credit / debit note's original invoice, hydrating the local
 * invoices store from the API when running in API mode.
 *
 * The note engine (approve / reverse / ledger recalc) always looks the
 * invoice up in the local store, which is empty when data comes from the
 * backend — so approving a note failed with "original invoice X no longer
 * exists" even though the invoice was right there in the database.
 */
async function resolveNoteInvoice(reference = {}) {
  const local = findOriginalInvoice(reference);
  if (local || !isApiMode()) return local;
  try {
    const result = await invoiceApi.list({ page: 1, pageSize: 500 });
    const match = (result.data || []).find((inv) => (
      (reference.invoiceNo && inv.invoiceNo === reference.invoiceNo)
      || (reference.invoiceId && String(inv.id) === String(reference.invoiceId))
    ));
    if (!match) return null;
    const records = invoicesStore.all;
    const index = records.findIndex((row) => row.invoiceNo === match.invoiceNo);
    invoicesStore.persist(index === -1 ? [...records, match] : records.map((row, i) => (i === index ? match : row)));
    return match;
  } catch (err) {
    return null;
  }
}

/** Finds the ORIGINAL vendor invoice a note adjusts, by no or id. */
export function findOriginalInvoice(reference = {}) {
  const records = invoicesStore.all;
  const byNo = reference?.invoiceNo
    ? records.find((r) => r.invoiceNo === reference.invoiceNo)
    : null;
  const byId = reference?.invoiceId
    ? records.find((r) => r.id === reference.invoiceId || r.invoiceNo === reference.invoiceId)
    : null;
  return byNo || byId || null;
}

/**
 * Recomputes and persists the ledger fields of one invoice from its
 * APPROVED notes: the `adjustments` summary, outstanding balance and
 * payment status. Runs whenever a note is approved or reversed so the
 * stored row (read by reports / payment pages / raw-store consumers)
 * never carries a stale balance.
 */
export function recalcInvoiceLedger(invoiceNo) {
  const records = invoicesStore.all;
  const index = records.findIndex((r) => r.invoiceNo === invoiceNo);
  if (index === -1) return null;
  const invoice = records[index];
  const adj = adjustmentTotalsForInvoice(invoice);
  const updated = {
    ...invoice,
    adjustments: adj,
    outstanding: round2(Math.max(0, adjustedNetPayableOf({ ...invoice, adjustments: adj }) - (Number(invoice.paidAmount) || 0)))
  };
  updated.paymentStatus = derivePaymentStatus(updated);
  records[index] = updated;
  invoicesStore.persist(records);
  return clone(updated);
}

/**
 * Credit-note capacity guard shared by create + approve: a credit note
 * may not exceed the original invoice's current outstanding balance
 * unless the note was explicitly raised with `allowExcess`.
 */
function assertNoteWithinBalance(note, invoice) {
  if (noteTypeSign(note?.noteType) !== -1) return; // debit notes increase payable
  const adj = adjustmentTotalsForInvoice(invoice);
  const capacity = round2(Math.max(0, adjustedNetPayableOf({ ...invoice, adjustments: adj }) - (Number(invoice.paidAmount) || 0)));
  const value = noteTotal(note);
  if (value > capacity + 0.01 && !note?.allowExcess) {
    throw new Error(
      `Credit note ${note.noteNo || ''} (${value.toFixed(2)}) exceeds the outstanding balance of ${invoice.invoiceNo} (${capacity.toFixed(2)})` +
      ` — raise the note with "Allow excess credit" enabled if this is intended`
    );
  }
  return { capacity, value, allowExcess: Boolean(note?.allowExcess) };
}

/** Note to the module's event bus after the ledger moved. */
function noteAuditEntry(invoice, note, action, extra = {}) {
  return appendAudit(invoice, action, {
    noteNo: note.noteNo,
    noteType: note.noteType,
    value: noteTotal(note),
    ...extra
  });
}

export const mockInvoiceService = {
  /**
   * Eligible invoice sources: goods-receipt documents (with the joined
   * PO vendor / terms / rates / tax) that have received stock and are
   * not yet fully invoiced. Each source is returned once per GRN.
   */
  async getInvoiceSources() {
    await delay();
    const sources = [];
    grnsStore.all.forEach((grn) => {
      if (grn.status === GRN_STATUS.EXPECTED) return;
      const order = ordersStore.all.find((entry) => entry.poNo === grn.poNo);
      if (!order) return;
      const poLines = order.items || [];
      const items = (grn.items || [])
        .map((item) => {
          const key = String(item.product || '').trim().toLowerCase();
          const poLine = poLines.find((l) => String(l.product || '').trim().toLowerCase() === key) || {};
          const received = Number(item.received) || 0;
          if (received <= 0) return null;
          return {
            product: item.product || '',
            hsn: poLine.hsn || item.hsn || '',
            uom: poLine.uom || item.uom || '',
            orderQty: Number(poLine.qty) || Number(item.qty) || 0,
            received,
            rate: Number(poLine.rate) || 0,
            gstRate: Number(poLine.gstRate) || 0,
            qty: received,
            discount: 0
          };
        })
        .filter(Boolean);
      if (!items.length) return;
      const totals = calcDocumentTotals(
        items.map(({ qty, rate, discount, gstRate }) => ({ qty, rate, discount, gstRate })),
        Number(order.discount) || 0,
        Number(order.charges) || 0,
        order.gstType || ''
      );
      const invoiced = invoicedQuantitiesByProduct(grn.poNo);
      const fullyInvoiced = items.every(
        (item) => (invoiced[String(item.product).trim().toLowerCase()] || 0) >= item.received - 0.001
      );
      sources.push({
        grnNo: grn.grnNo,
        poNo: grn.poNo,
        vendor: order.vendor || '',
        currency: order.currency || 'INR',
        gstType: order.gstType || '',
        terms: order.terms || '',
        discount: Number(order.discount) || 0,
        charges: Number(order.charges) || 0,
        freight: Number(order.freight) || 0,
        paymentTerms: order.paymentTerms || order.terms || '',
        receivedOn: grn.receivedOn || '',
        status: grn.status,
        items,
        totals,
        fullyInvoiced
      });
    });
    sources.sort((a, b) => String(b.receivedOn || '').localeCompare(String(a.receivedOn || '')) || String(b.grnNo).localeCompare(String(a.grnNo)));
    return sources;
  },

  async getInvoices({ search = '', status = 'All', page = 1, pageSize = 10, sortBy = 'invoiceDate', sortDir = 'desc' } = {}) {
    await delay();
    const records = invoicesStore.all;
    const query = String(search).trim().toLowerCase();
    const statusFilter = toFilter(status);

    let filtered = records.filter((invoice) => {
      if (statusFilter && invoice.status !== statusFilter) return false;
      if (query) {
        const haystack = [invoice.invoiceNo, invoice.poNo, invoice.vendor]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });

    filtered = [...filtered].sort((a, b) => {
      const aValue = sortBy === 'total' ? a.total : new Date(a.invoiceDate).getTime();
      const bValue = sortBy === 'total' ? b.total : new Date(b.invoiceDate).getTime();
      if (aValue === bValue) return 0;
      return sortDir === 'asc' ? aValue - bValue : bValue - aValue;
    });

    const result = paginate(filtered, { page, pageSize });
    result.data = result.data.map(withMatch);
    return result;
  },

  async getInvoice(id) {
    await delay();
    const invoice = invoicesStore.all.find((entry) => entry.id === id);
    if (!invoice) throw new Error('Invoice not found');
    return clone(withMatch(invoice));
  },

  async createInvoice(payload = {}) {
    await delay();
    /* RULE: an invoice must reference a valid, existing purchase order. */
    if (!payload.poNo) throw new Error('Invoice must reference a valid purchase order');
    const order = ordersStore.all.find((entry) => entry.poNo === payload.poNo);
    if (!order) {
      throw new Error(`Purchase order ${payload.poNo} not found — invoice must reference a valid PO`);
    }
    /* RULE: the invoice vendor must match the PO vendor. */
    if (
      payload.vendor &&
      order.vendor &&
      String(payload.vendor).trim().toLowerCase() !== String(order.vendor).trim().toLowerCase()
    ) {
      throw new Error(`Invoice vendor ${payload.vendor} does not match the PO vendor ${order.vendor}`);
    }
    const records = invoicesStore.all;
    /* Credit / Debit notes get their own numbering sequences (CN / DN)
       instead of the Vendor Invoice (VINV) sequence. */
    const invoiceNo = payload.invoiceNo || nextInvoiceDocumentNo(payload, records);
    if (records.some((entry) => entry.invoiceNo === invoiceNo)) {
      throw new Error(`Invoice number ${invoiceNo} already exists`);
    }
    /* RULE: a vendor invoice number may not repeat for the same vendor. */
    if (payload.vendorInvoiceNo) {
      const duplicate = records.some(
        (entry) =>
          String(entry.vendor || '').trim().toLowerCase() === String(payload.vendor || '').trim().toLowerCase() &&
          String(entry.vendorInvoiceNo || '').trim().toLowerCase() === String(payload.vendorInvoiceNo).trim().toLowerCase()
      );
      if (duplicate) {
        throw new Error(`Vendor invoice ${payload.vendorInvoiceNo} already exists for ${payload.vendor}`);
      }
    }
    /* Invoice quantities that exceed the goods received are recorded but
       flagged by the three-way match (never silently paid). */
    const amounts = invoiceAmounts(payload);
    const normalized = {
      id: invoiceNo,
      invoiceNo,
      poNo: payload.poNo || '',
      grnNo: payload.grnNo || '',
      vendor: payload.vendor || '',
      vendorEmail: payload.vendorEmail || '',
      vendorInvoiceNo: payload.vendorInvoiceNo || '',
      vendorReference: payload.vendorReference || '',
      invoiceType: payload.invoiceType || INVOICE_TYPE.STANDARD,
      invoiceDate: payload.invoiceDate || todayLocal(),
      dueDate: payload.dueDate || invoiceDueDate(payload, order, payload.invoiceDate || todayLocal()),
      amount: amounts.amount,
      gst: amounts.gst,
      charges: amounts.charges,
      freight: amounts.freight,
      tdsPercent: amounts.tdsPercent,
      tds: amounts.tds,
      retentionPercent: amounts.retentionPercent,
      retention: amounts.retention,
      netPayable: amounts.netPayable,
      outstanding: amounts.outstanding,
      roundOff: amounts.roundOff,
      discount: amounts.discount,
      total: amounts.total,
      totals: amounts.totals,
      status: payload.status || INVOICE_STATUS.DRAFT,
      gstType: payload.gstType || '',
      /* Real commercial context inherited from the source GRN / PO. */
      currency: payload.currency || order.currency || 'INR',
      paymentMethod: payload.paymentMethod || '',
      paymentTerms: payload.paymentTerms || '',
      paymentDate: payload.paymentDate || '',
      paidAmount: 0,
      notes: payload.notes || '',
      items: amounts.items,
      attachments: Array.isArray(payload.attachments) ? payload.attachments : [],
      auditHistory: [{ action: 'created', actor: getCurrentActor().name || 'System', timestamp: new Date().toISOString(), details: {} }],
      createdAt: new Date().toISOString()
    };
    /* Credit / Debit notes never enter the approval queue or payment
       flow — they adjust the vendor ledger directly. */
    if (isCreditNote(normalized)) {
      normalized.approvalRequired = false;
      normalized.approval = null;
      normalized.matchStatus = MATCH_STATUS.MATCHED;
      normalized.matchReasons = ['Credit note — no three-way match or payment approval required'];
      normalized.matchDetails = [];
    }
    records.push(normalized);
    invoicesStore.persist(records);
    notifyWorkflowEvent({
      type: 'Invoice Created',
      title: `${invoiceNo} created`,
      message: `${invoiceNo} for ${payload.vendor || order.vendor || 'vendor'} was recorded — ${formatAmount(amounts.total)} (${payload.invoiceType || INVOICE_TYPE.STANDARD}).`,
      route: `/purchase/invoices/${normalized.id}`,
      documentNo: invoiceNo,
      related: { type: 'invoice', id: normalized.id, poNo: payload.poNo || '', vendor: normalized.vendor || '' },
      sourceEvent: 'createInvoice'
    });
    return clone(normalized);
  },

  async updateInvoice(id, patch = {}) {
    await delay();
    const records = invoicesStore.all;
    const index = records.findIndex((entry) => entry.id === id);
    if (index === -1) throw new Error('Invoice not found');
    /* Status transitions are managed by dedicated methods (submitInvoice,
       approveInvoice, recordPayment, etc.). Prevent direct status patching
       to maintain workflow integrity. Pass _bypassStatusGuard to skip this check
       from internal workflow methods. */
    if (patch.status && patch.status !== records[index].status && !patch._bypassStatusGuard) {
      throw new Error(`Cannot change status directly. Use the appropriate workflow action.`);
    }
    /* RULE: a vendor invoice number may not repeat for the same vendor
       (excluding this record itself on edit). */
    const vendorInvoiceNo = patch.vendorInvoiceNo ?? records[index].vendorInvoiceNo;
    if (vendorInvoiceNo) {
      const duplicate = records.some(
        (entry) =>
          entry.id !== id &&
          String(entry.vendor || '').trim().toLowerCase() === String(records[index].vendor || '').trim().toLowerCase() &&
          String(entry.vendorInvoiceNo || '').trim().toLowerCase() === String(vendorInvoiceNo).trim().toLowerCase()
      );
      if (duplicate) {
        throw new Error(`Vendor invoice ${vendorInvoiceNo} already exists for ${records[index].vendor}`);
      }
    }
    const amounts = invoiceAmounts({ ...records[index], ...patch });
    const hasItems = Array.isArray(patch.items) && patch.items.length > 0;
    records[index] = {
      ...records[index],
      ...patch,
      id: records[index].id,
      invoiceNo: records[index].invoiceNo,
      vendorInvoiceNo,
      items: hasItems ? amounts.items : records[index].items || [],
      amount: amounts.amount,
      gst: amounts.gst,
      charges: amounts.charges,
      freight: amounts.freight,
      tdsPercent: amounts.tdsPercent,
      tds: amounts.tds,
      retentionPercent: amounts.retentionPercent,
      retention: amounts.retention,
      netPayable: amounts.netPayable,
      outstanding: amounts.outstanding,
      roundOff: amounts.roundOff,
      discount: amounts.discount,
      total: amounts.total,
      totals: amounts.totals || records[index].totals || null
    };
    invoicesStore.persist(records);
    return clone(records[index]);
  },

  async deleteInvoice(id) {
    await delay();
    const records = invoicesStore.all;
    const index = records.findIndex((entry) => entry.id === id);
    if (index === -1) throw new Error('Invoice not found');
    if ([INVOICE_STATUS.PAID, INVOICE_STATUS.PARTIAL].includes(records[index].status)) {
      throw new Error(`Cannot delete ${records[index].invoiceNo}: paid invoices cannot be deleted`);
    }
    /* Credit / debit notes are linked documents — remove them first so a
       note never dangles behind a deleted original invoice. */
    const linkedNotes = (adjustmentNotesStore.all || []).filter(
      (note) => note && String(note.invoiceNo) === String(records[index].invoiceNo) && note.status !== ADJUSTMENT_NOTE_STATUS.REVERSED
    );
    if (linkedNotes.length > 0) {
      throw new Error(
        `Cannot delete ${records[index].invoiceNo}: it has ${linkedNotes.length} linked credit / debit note(s) — delete or reverse them first`
      );
    }
    const deleted = records.splice(index, 1)[0];
    invoicesStore.persist(records);
    /* Clean up associated payment advices */
    const adviceRecords = advicesStore.all;
    const filtered = adviceRecords.filter((a) => a.invoiceNo !== deleted?.invoiceNo);
    if (filtered.length !== adviceRecords.length) {
      advicesStore.persist(filtered);
    }
    return { id, invoiceNo: deleted?.invoiceNo };
  },

  /* ═══════════════════════════════════════════════════════════════ */
  /*  Credit / Debit Notes                                           */
  /* ═══════════════════════════════════════════════════════════════ */

  /**
   * Original invoices a note may be raised against: real vendor
   * invoices (never legacy CN / DN documents) that are live enough to
   * adjust — Approved, Partially Paid, Paid or Overdue — each with its
   * effective outstanding / vendor credit and a copy of its lines so
   * the note form can prefill the returned / re-charged items.
   */
  async getAdjustmentNoteSources() {
    await delay();
    const eligibleStatuses = [
      INVOICE_STATUS.APPROVED, INVOICE_STATUS.PARTIAL,
      INVOICE_STATUS.PAID, INVOICE_STATUS.OVERDUE
    ];
    return invoicesStore.all
      .filter((inv) => !isCreditNote(inv) && eligibleStatuses.includes(inv.status))
      .map((inv) => withAdjustmentSummary(inv))
      .map((inv) => ({
        id: inv.id,
        invoiceNo: inv.invoiceNo,
        vendor: inv.vendor || '',
        vendorEmail: inv.vendorEmail || '',
        poNo: inv.poNo || '',
        grnNo: inv.grnNo || '',
        invoiceDate: inv.invoiceDate || '',
        dueDate: inv.dueDate || '',
        currency: inv.currency || 'INR',
        gstType: inv.gstType || '',
        total: Number(inv.total) || 0,
        netPayable: inv.netPayable ?? (Number(inv.total) || 0),
        paidAmount: Number(inv.paidAmount) || 0,
        outstanding: outstandingOf(inv),
        vendorCredit: vendorCreditOf(inv),
        adjustments: inv.adjustments || { credit: 0, debit: 0, net: 0, count: 0 },
        items: Array.isArray(inv.items)
          ? inv.items.map((line) => ({
              product: line.product || '',
              hsn: line.hsn || '',
              uom: line.uom || '',
              qty: Number(line.qty) || 0,
              rate: Number(line.rate ?? line.price) || 0,
              gstRate: Number(line.gstRate ?? line.gst) || 0,
              discount: 0
            }))
          : []
      }))
      .sort((a, b) => String(b.invoiceDate || '').localeCompare(String(a.invoiceDate || '')) || String(a.invoiceNo).localeCompare(String(b.invoiceNo)));
  },

  async getAdjustmentNotes({
    search = '',
    status = 'All',
    type = 'All',
    vendor = 'All',
    page = 1,
    pageSize = 10,
    sortBy = 'noteDate',
    sortDir = 'desc'
  } = {}) {
    await delay();
    const query = String(search).trim().toLowerCase();
    let filtered = (adjustmentNotesStore.all || []).filter((note) => {
      if (toFilter(status) && note.status !== status) return false;
      if (toFilter(type) && note.noteType !== type) return false;
      if (toFilter(vendor) && note.vendor !== vendor) return false;
      if (query) {
        const haystack = [note.noteNo, note.invoiceNo, note.vendor, note.reason, note.reference]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
    filtered = [...filtered].sort((a, b) => {
      const aVal = sortBy === 'total' ? noteTotal(a) : String(a[sortBy] || '');
      const bVal = sortBy === 'total' ? noteTotal(b) : String(b[sortBy] || '');
      if (sortBy === 'total') return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
      const cmp = aVal.localeCompare(bVal);
      return sortDir === 'asc' ? cmp : -cmp;
    });
    const result = paginate(filtered, { page, pageSize });
    result.data = result.data.map((note) => ({
      ...clone(note),
      total: noteTotal(note),
      originalInvoiceExists: Boolean(findOriginalInvoice({ invoiceNo: note.invoiceNo }))
    }));
    return result;
  },

  async getAdjustmentNote(id) {
    await delay();
    const note = (adjustmentNotesStore.all || []).find((entry) => entry.id === id || entry.noteNo === id);
    if (!note) throw new Error('Adjustment note not found');
    const invoice = findOriginalInvoice({ invoiceNo: note.invoiceNo });
    return {
      ...clone(note),
      total: noteTotal(note),
      originalInvoice: invoice ? withAdjustmentSummary(invoice) : null
    };
  },

  /** All notes linked to one original invoice (any status). */
  async getAdjustmentNotesForInvoice(reference = {}) {
    await delay();
    const invoice = findOriginalInvoice(reference);
    const invoiceNo = invoice?.invoiceNo || reference.invoiceNo || '';
    const notes = (adjustmentNotesStore.all || [])
      .filter((note) => String(note.invoiceNo || '') === String(invoiceNo))
      .map((note) => ({ ...clone(note), total: noteTotal(note) }))
      .sort((a, b) => String(b.noteDate || '').localeCompare(String(a.noteDate || '')) || String(a.noteNo).localeCompare(String(b.noteNo)));
    return {
      invoice: invoice ? withAdjustmentSummary(invoice) : null,
      invoiceNo,
      notes
    };
  },

  /**
   * Raises a Credit / Debit note against an ORIGINAL vendor invoice.
   *
   * Validations: the original invoice must exist and be a real vendor
   * invoice (not a legacy CN/DN document); the note's vendor must match
   * the invoice vendor; a credit note may not exceed the invoice's
   * current outstanding balance unless `allowExcess` is explicitly set;
   * a note's gross value must be positive. The note only moves the
   * ledger once Approved.
   */
  async createAdjustmentNote(payload = {}) {
    await delay();
    const noteType = payload.noteType;
    if (noteType !== ADJUSTMENT_NOTE_TYPE.CREDIT && noteType !== ADJUSTMENT_NOTE_TYPE.DEBIT) {
      throw new Error('Select a note type — Credit Note or Debit Note');
    }
    /* _originalInvoice lets the API-mode caller hand over the real saved
       invoice, since the local store is empty when data comes from the API. */
    const invoice = payload._originalInvoice
      || findOriginalInvoice({ invoiceId: payload.invoiceId, invoiceNo: payload.invoiceNo });
    if (!invoice) {
      throw new Error('The original vendor invoice was not found — pick an invoice to adjust');
    }
    if (isCreditNote(invoice)) {
      throw new Error('Credit / Debit notes can only adjust vendor invoices — not note documents');
    }
    if (payload.vendor && String(payload.vendor).trim().toLowerCase() !== String(invoice.vendor || '').trim().toLowerCase()) {
      throw new Error(`Note vendor ${payload.vendor} does not match the original invoice vendor ${invoice.vendor}`);
    }
    if (!String(payload.reason || '').trim()) {
      throw new Error('A reason is required for the credit / debit note');
    }
    const amounts = noteAmounts(payload);
    if (amounts.total <= 0) {
      throw new Error('Note value must be greater than zero — add items or an amount');
    }
    const allowExcess = payload.allowExcess === true || payload.allowExcess === 'true';
    const status = payload.status === ADJUSTMENT_NOTE_STATUS.SUBMITTED
      ? ADJUSTMENT_NOTE_STATUS.SUBMITTED
      : ADJUSTMENT_NOTE_STATUS.DRAFT;

    const records = adjustmentNotesStore.all;
    const noteNo = payload.noteNo || nextAdjustmentNoteNo(noteType, records);
    if (records.some((entry) => entry.noteNo === noteNo)) {
      throw new Error(`Adjustment note number ${noteNo} already exists`);
    }
    const draft = {
      id: noteNo,
      noteNo,
      noteType,
      status,
      allowExcess,
      invoiceId: invoice.id,
      invoiceNo: invoice.invoiceNo,
      poNo: invoice.poNo || '',
      vendor: invoice.vendor || '',
      vendorEmail: invoice.vendorEmail || '',
      currency: invoice.currency || 'INR',
      noteDate: payload.noteDate || todayLocal(),
      reason: String(payload.reason || '').trim(),
      reference: payload.reference || '',
      notes: payload.notes || '',
      gstType: payload.gstType || invoice.gstType || '',
      discount: amounts.discount,
      charges: amounts.charges,
      freight: amounts.freight,
      amount: amounts.amount,
      gst: amounts.gst,
      total: amounts.total,
      totals: amounts.totals,
      items: amounts.items,
      attachments: Array.isArray(payload.attachments) ? payload.attachments : [],
      approval: {
        required: true,
        submittedAt: '',
        submittedBy: '',
        approvedAt: '',
        approvedBy: '',
        rejectedAt: '',
        rejectedBy: '',
        rejectionReason: '',
        reversalReason: ''
      },
      auditHistory: [{
        action: 'created',
        actor: getCurrentActor().name || 'System',
        timestamp: new Date().toISOString(),
        details: { noteType, value: amounts.total, allowExcess }
      }],
      createdAt: new Date().toISOString(),
      createdBy: getCurrentActor().name || 'System'
    };

    const note = clone(draft);
    /* Creation-time guard — a credit note cannot exceed the invoice's
       current outstanding balance unless explicitly allowed. */
    assertNoteWithinBalance(note, invoice);
    records.push(note);
    adjustmentNotesStore.persist(records);
    const saved = clone(note);
    /* A note raised directly as Submitted still needs its submit stamp. */
    if (status === ADJUSTMENT_NOTE_STATUS.SUBMITTED) {
      return this.submitAdjustmentNote(saved.id);
    }
    return saved;
  },

  /** Edits a Draft note (the only mutable state) and revalidates math. */
  async updateAdjustmentNote(id, patch = {}) {
    await delay();
    const records = adjustmentNotesStore.all;
    const index = records.findIndex((entry) => entry.id === id);
    if (index === -1) throw new Error('Adjustment note not found');
    const existing = records[index];
    if (existing.status !== ADJUSTMENT_NOTE_STATUS.DRAFT) {
      throw new Error('Only Draft adjustment notes can be edited');
    }
    const merged = { ...existing, ...patch, id: existing.id, noteNo: existing.noteNo };
    const amounts = noteAmounts(merged);
    if (amounts.total <= 0) throw new Error('Note value must be greater than zero');
    records[index] = {
      ...merged,
      discount: amounts.discount,
      charges: amounts.charges,
      freight: amounts.freight,
      amount: amounts.amount,
      gst: amounts.gst,
      total: amounts.total,
      totals: amounts.totals,
      items: Array.isArray(patch.items) ? amounts.items : existing.items || [],
      auditHistory: appendAudit(existing, 'updated', { value: amounts.total })
    };
    adjustmentNotesStore.persist(records);
    return clone(records[index]);
  },

  /** Deletes a Draft note before it ever reaches the ledger. */
  async deleteAdjustmentNote(id) {
    await delay();
    const records = adjustmentNotesStore.all;
    const index = records.findIndex((entry) => entry.id === id);
    if (index === -1) throw new Error('Adjustment note not found');
    if (records[index].status !== ADJUSTMENT_NOTE_STATUS.DRAFT) {
      throw new Error('Only Draft adjustment notes can be deleted — approved notes must be reversed');
    }
    const deleted = records.splice(index, 1)[0];
    adjustmentNotesStore.persist(records);
    return { id, noteNo: deleted.noteNo };
  },

  /** Submits a Draft (or rejected) note for approval. */
  async submitAdjustmentNote(id) {
    await delay();
    const records = adjustmentNotesStore.all;
    const index = records.findIndex((entry) => entry.id === id);
    if (index === -1) throw new Error('Adjustment note not found');
    const existing = records[index];
    if (![ADJUSTMENT_NOTE_STATUS.DRAFT, ADJUSTMENT_NOTE_STATUS.REJECTED].includes(existing.status)) {
      throw new Error(`Cannot submit ${existing.noteNo}: current status is ${existing.status}`);
    }
    const actor = getCurrentActor();
    records[index] = {
      ...existing,
      status: ADJUSTMENT_NOTE_STATUS.SUBMITTED,
      approval: {
        ...(existing.approval || {}),
        required: true,
        submittedAt: new Date().toISOString(),
        submittedBy: actor.name || 'System'
      },
      auditHistory: appendAudit(existing, 'submitted', {})
    };
    adjustmentNotesStore.persist(records);
    return clone(records[index]);
  },

  /**
   * Approves a submitted note — the ONLY action that moves the ledger.
   * The outstanding-balance guard is re-run at approval time (the
   * invoice may have been paid or adjusted since the note was drafted).
   * The linked invoice's adjustments / outstanding are then recomputed
   * and persisted so vendor payable, payments and reports all move.
   */
  async approveAdjustmentNote(id, options = {}) {
    await delay();
    const records = adjustmentNotesStore.all;
    const index = records.findIndex((entry) => entry.id === id);
    if (index === -1) throw new Error('Adjustment note not found');
    const existing = records[index];
    if (existing.status !== ADJUSTMENT_NOTE_STATUS.SUBMITTED) {
      throw new Error(`Only submitted adjustment notes can be approved — ${existing.noteNo} is ${existing.status}`);
    }
    const invoice = findOriginalInvoice({ invoiceNo: existing.invoiceNo });
    if (!invoice) {
      throw new Error(`Original invoice ${existing.invoiceNo} no longer exists — the note cannot be approved`);
    }
    assertNoteWithinBalance(existing, invoice);
    const actor = getCurrentActor();
    const approver = String(options.approver || '').trim() || actor.name || 'System';
    records[index] = {
      ...existing,
      status: ADJUSTMENT_NOTE_STATUS.APPROVED,
      approval: {
        ...(existing.approval || {}),
        required: true,
        approvedAt: new Date().toISOString(),
        approvedBy: approver
      },
      auditHistory: appendAudit(existing, 'approved', { approver, value: noteTotal(existing) })
    };
    adjustmentNotesStore.persist(records);
    /* Move the ledger — persists the invoice's adjustments summary. */
    const refreshedInvoice = recalcInvoiceLedger(existing.invoiceNo);
    if (refreshedInvoice) {
      const auditHistory = noteAuditEntry(refreshedInvoice, records[index], 'adjustment_note_applied');
      const invoiceRecords = invoicesStore.all;
      const iIndex = invoiceRecords.findIndex((r) => r.invoiceNo === existing.invoiceNo);
      if (iIndex !== -1) {
        invoiceRecords[iIndex] = { ...invoiceRecords[iIndex], auditHistory };
        invoicesStore.persist(invoiceRecords);
      }
    }
    return clone(records[index]);
  },

  /** Rejects a submitted note — no ledger movement. */
  async rejectAdjustmentNote(id, { reason = '' } = {}) {
    await delay();
    if (!String(reason || '').trim()) throw new Error('Rejection reason is required');
    const records = adjustmentNotesStore.all;
    const index = records.findIndex((entry) => entry.id === id);
    if (index === -1) throw new Error('Adjustment note not found');
    const existing = records[index];
    if (existing.status !== ADJUSTMENT_NOTE_STATUS.SUBMITTED) {
      throw new Error(`Only submitted adjustment notes can be rejected — ${existing.noteNo} is ${existing.status}`);
    }
    const actor = getCurrentActor();
    records[index] = {
      ...existing,
      status: ADJUSTMENT_NOTE_STATUS.REJECTED,
      approval: {
        ...(existing.approval || {}),
        rejectedAt: new Date().toISOString(),
        rejectedBy: actor.name || 'System',
        rejectionReason: String(reason).trim()
      },
      auditHistory: appendAudit(existing, 'rejected', { reason })
    };
    adjustmentNotesStore.persist(records);
    return clone(records[index]);
  },

  /** Resubmits a rejected note for approval. */
  async resubmitAdjustmentNote(id) {
    await delay();
    const records = adjustmentNotesStore.all;
    const index = records.findIndex((entry) => entry.id === id);
    if (index === -1) throw new Error('Adjustment note not found');
    const existing = records[index];
    if (existing.status !== ADJUSTMENT_NOTE_STATUS.REJECTED) {
      throw new Error(`Only rejected adjustment notes can be resubmitted — ${existing.noteNo} is ${existing.status}`);
    }
    const actor = getCurrentActor();
    records[index] = {
      ...existing,
      status: ADJUSTMENT_NOTE_STATUS.SUBMITTED,
      approval: {
        ...(existing.approval || {}),
        submittedAt: new Date().toISOString(),
        submittedBy: actor.name || 'System'
      },
      auditHistory: appendAudit(existing, 'resubmitted', {})
    };
    adjustmentNotesStore.persist(records);
    return clone(records[index]);
  },

  /**
   * Reverses an APPROVED note (e.g. a mistaken credit). The note stays
   * on the register flagged Reversed and stops counting toward the
   * invoice's ledger — adjustments / outstanding are recomputed.
   */
  async reverseAdjustmentNote(id, { reason = '' } = {}) {
    await delay();
    if (!String(reason || '').trim()) throw new Error('Reversal reason is required');
    const records = adjustmentNotesStore.all;
    const index = records.findIndex((entry) => entry.id === id);
    if (index === -1) throw new Error('Adjustment note not found');
    const existing = records[index];
    if (existing.status !== ADJUSTMENT_NOTE_STATUS.APPROVED) {
      throw new Error(`Only approved adjustment notes can be reversed — ${existing.noteNo} is ${existing.status}`);
    }
    const actor = getCurrentActor();
    records[index] = {
      ...existing,
      status: ADJUSTMENT_NOTE_STATUS.REVERSED,
      approval: {
        ...(existing.approval || {}),
        reversalReason: String(reason).trim(),
        reversedAt: new Date().toISOString(),
        reversedBy: actor.name || 'System'
      },
      auditHistory: appendAudit(existing, 'reversed', { reason })
    };
    adjustmentNotesStore.persist(records);
    const refreshedInvoice = recalcInvoiceLedger(existing.invoiceNo);
    if (refreshedInvoice) {
      const auditHistory = noteAuditEntry(refreshedInvoice, records[index], 'adjustment_note_reversed', { reason });
      const invoiceRecords = invoicesStore.all;
      const iIndex = invoiceRecords.findIndex((r) => r.invoiceNo === existing.invoiceNo);
      if (iIndex !== -1) {
        invoiceRecords[iIndex] = { ...invoiceRecords[iIndex], auditHistory };
        invoicesStore.persist(invoiceRecords);
      }
    }
    return clone(records[index]);
  },

  /** Submit a Draft (or rejected) invoice for approval. */
  async submitInvoice(id) {
    await delay();
    const records = invoicesStore.all;
    const index = records.findIndex((entry) => entry.id === id);
    if (index === -1) throw new Error('Invoice not found');
    const record = records[index];
    if (record.status !== INVOICE_STATUS.DRAFT && record.status !== INVOICE_STATUS.REJECTED) {
      throw new Error(`Cannot submit ${record.invoiceNo}: current status is ${record.status}`);
    }
    /* Build the approval chain from the configured rules (doc type
       Invoice + amount / department / project / cost centre). Credit
       notes skip the queue entirely. */
    const actor = getCurrentActor();
    let approval = null;
    if (!isCreditNote(record)) {
      const chain = buildApprovalChain({
        docType: 'Invoice',
        amount: Number(record.total) || 0,
        department: record.department || '',
        project: record.project || '',
        costCenter: record.costCenter || '',
        role: String(actor.role || '').trim(),
        requestedBy: String(actor.name || '').trim()
      }, readSettings());
      approval = createApprovalState(chain);
    }
    records[index] = {
      ...record,
      status: INVOICE_STATUS.SUBMITTED,
      approvalRequired: !isCreditNote(record),
      approval,
      approvalStatus: isCreditNote(record) ? 'Approved' : 'Pending',
      submittedAt: new Date().toISOString(),
      activity: [
        ...(record.activity || []),
        { action: 'submitted', actor: actor.name || 'System', timestamp: new Date().toISOString() }
      ]
    };
    invoicesStore.persist(records);
    notifyWorkflowEvent({
      type: 'Pending Approval',
      title: `${record.invoiceNo} pending approval`,
      message: `${record.invoiceNo} was submitted for approval by ${actor.name || 'System'} — ${formatAmount(record.total)}.`,
      route: `/purchase/invoices/${record.id}`,
      documentNo: record.invoiceNo,
      related: { type: 'invoice', id: record.id, vendor: record.vendor || '', poNo: record.poNo || '' },
      sourceEvent: 'submitInvoice'
    });
    return clone(records[index]);
  },

  /**
   * Approves a submitted invoice for payment.
   *
   * Two gates, both driven by CONFIGURED rules:
   *   1. Three-way match — approval is blocked when the matching rules
   *      require a successful match and the match is not fully Matched.
   *   2. Approval engine — the invoice must clear every step of its
   *      configured approval chain (sequential or parallel).
   *
   * Options: { stepIndex, approver, note }.
   */
  async approveInvoice(id, options = {}) {
    await delay();
    const records = invoicesStore.all;
    const index = records.findIndex((entry) => entry.id === id);
    if (index === -1) throw new Error('Invoice not found');
    const invoice = records[index];
    if (invoice.status !== INVOICE_STATUS.SUBMITTED) {
      throw new Error('Only submitted invoices can be approved for payment');
    }
    if (isCreditNote(invoice)) {
      throw new Error('Credit notes do not require payment approval');
    }
    const match = computeThreeWayMatch(invoice);
    const gate = matchAllowsApproval(match);
    if (!gate.allowed) {
      notifyWorkflowEvent({
        type: 'Invoice Mismatch',
        title: `Three-way mismatch — ${invoice.invoiceNo}`,
        message: `${invoice.invoiceNo} cannot be approved — ${gate.reason}.`,
        route: `/purchase/invoices/${invoice.id}`,
        documentNo: invoice.invoiceNo,
        related: { type: 'invoice', id: invoice.id, vendor: invoice.vendor || '', poNo: invoice.poNo || '' },
        sourceEvent: 'approveInvoice'
      });
      throw new Error(`Invoice cannot be approved — ${gate.reason}`);
    }
    const actor = getCurrentActor();
    const approver = String(options.approver || '').trim() || actor.name || '';
    const note = String(options.note || '').trim();

    /* Approval-engine chain — approve the current step; the invoice is
       APPROVED once every step has approved. */
    if (invoice.approval && Array.isArray(invoice.approval.steps) && invoice.approval.steps.length > 0) {
      const stepIndex =
        options.stepIndex !== undefined ? Number(options.stepIndex) : currentStepIndex(invoice.approval);
      if (stepIndex === -1) {
        throw new Error(`All approval steps for ${invoice.invoiceNo} are already decided`);
      }
      const nextApproval = engineApproveStep(invoice.approval, { stepIndex, approver, note });
      const allApproved = nextApproval.status === 'Approved';
      const auditHistory = appendAudit(invoice, allApproved ? 'approved' : 'approval_step', { stepIndex, approver, note });
      records[index] = {
        ...invoice,
        approval: nextApproval,
        approvalStatus: chainToApprovalStatus(nextApproval),
        status: allApproved ? INVOICE_STATUS.APPROVED : invoice.status,
        matchStatus: match.status,
        matchReasons: match.reasons,
        auditHistory
      };
      invoicesStore.persist(records);
      if (allApproved) {
        notifyWorkflowEvent({
          type: 'Invoice Approval',
          title: `${invoice.invoiceNo} approved`,
          message: `${invoice.invoiceNo} cleared its approval chain and is ready for payment.`,
          route: `/purchase/invoices/${invoice.id}`,
          documentNo: invoice.invoiceNo,
          related: { type: 'invoice', id: invoice.id, vendor: invoice.vendor || '', poNo: invoice.poNo || '' },
          sourceEvent: 'approveInvoice'
        });
      }
      return clone(records[index]);
    }

    /* Legacy single-step approval (records without an engine chain). */
    const auditHistory = appendAudit(invoice, 'approved');
    records[index] = {
      ...invoice,
      status: INVOICE_STATUS.APPROVED,
      approvalStatus: 'Approved',
      matchStatus: match.status,
      matchReasons: match.reasons,
      auditHistory
    };
    invoicesStore.persist(records);
    notifyWorkflowEvent({
      type: 'Invoice Approval',
      title: `${invoice.invoiceNo} approved`,
      message: `${invoice.invoiceNo} was approved and is ready for payment.`,
      route: `/purchase/invoices/${invoice.id}`,
      documentNo: invoice.invoiceNo,
      related: { type: 'invoice', id: invoice.id, vendor: invoice.vendor || '', poNo: invoice.poNo || '' },
      sourceEvent: 'approveInvoice'
    });
    return clone(records[index]);
  },

  /**
   * Records a payment against an approved invoice. Guards enforce the
   * payment controls: no double payment (RULE 10), only approved
   * invoices can be paid, the three-way match must have passed
   * (RULE 9), and a partial payment cannot exceed the outstanding
   * balance. Each settled payment produces exactly one stored payment
   * advice (no duplicates).
   */
  async recordPayment(id, {
    method = PAYMENT_METHODS[0],
    full = true,
    amount,
    transactionReference = '',
    paymentNo: paymentNoOverride = '',
    notes = '',
    paymentDate = '',
    bank = '',
    currency = '',
    exchangeRate: exchangeRateParam = 0,
    charges: chargesParam = 0,
    tds: tdsParam = 0
  } = {}) {
    await delay();
    const records = invoicesStore.all;
    const index = records.findIndex((entry) => entry.id === id);
    if (index === -1) throw new Error('Invoice not found');
    const invoice = records[index];
    if (invoice.status === INVOICE_STATUS.PAID) {
      throw new Error(`${invoice.invoiceNo} is already paid`);
    }
    if (isCreditNote(invoice)) {
      throw new Error('Credit notes cannot be paid — they adjust the vendor ledger directly');
    }
    /* Approved invoices are payable, and PARTIAL invoices remain payable
       so a partial payment can be followed by further installments. */
    if (![INVOICE_STATUS.APPROVED, INVOICE_STATUS.PARTIAL].includes(invoice.status)) {
      throw new Error('Only approved invoices can be paid — complete payment approval first');
    }
    const match = computeThreeWayMatch(invoice);
    const gate = matchAllowsApproval(match);
    if (!gate.allowed) {
      throw new Error(`Payment blocked — ${gate.reason}`);
    }

    /* Payable amount is the ADJUSTED NET payable (gross − TDS −
       retention, then ± approved credit / debit notes). */
    const net = adjustedNetPayable(invoice);
    const paidSoFar = Number(invoice.paidAmount) || 0;
    const remaining = round2(Math.max(0, net - paidSoFar));
    if (remaining <= 0.005) {
      throw new Error(`${invoice.invoiceNo} has no outstanding balance — fully paid or fully covered by approved credit notes`);
    }

    /* Payment currency → invoice-currency conversion. The ledger stores
       the amount in the payment currency plus the exchange rate and the
       converted base amount; balances (paid / outstanding) are always
       tracked in the invoice currency so multi-currency payments stay
       consistent. */
    const paymentCurrency = currency || invoice.currency || 'INR';
    const exchangeRate = normalizeExchangeRate(
      Number(exchangeRateParam) || 0,
      paymentCurrency,
      invoice.currency || 'INR'
    );

    let paidAmount;
    if (full) {
      paidAmount = remaining;
    } else {
      const rawAmount = Math.round((Number(amount) || 0) * 100) / 100;
      if (rawAmount <= 0) throw new Error('Enter a payment amount for a partial payment');
      const amountBase = round2(rawAmount * exchangeRate);
      const allowOverpayment = Boolean(readSettings().payment?.allowOverpayment);
      if (amountBase > remaining + 0.001 && !allowOverpayment) {
        throw new Error(`Payment amount exceeds the outstanding balance of ${remaining.toFixed(2)}`);
      }
      paidAmount = amountBase;
    }
    const charges = Math.round((Number(chargesParam) || 0) * 100) / 100;
    const tds = Math.round((Number(tdsParam) || 0) * 100) / 100;

    const nextPaid = round2(paidSoFar + paidAmount);
    const newStatus = nextPaid >= net - 0.01 ? INVOICE_STATUS.PAID : INVOICE_STATUS.PARTIAL;
    const paymentNo = paymentNoOverride || nextSeqNo(records, 'PAY', 'paymentNo', 100);
    /* Prevent duplicate payment numbers. */
    if (records.some((entry) => entry.paymentNo === paymentNo)) {
      throw new Error(`Payment number ${paymentNo} already exists`);
    }
    const actor = getCurrentActor();
    const auditHistory = appendAudit(invoice, 'payment_recorded', {
      paymentNo, method, paidAmount, paymentDate, bank,
      currency: paymentCurrency, exchangeRate, charges, tds
    });
    const historyEntry = {
      paymentNo,
      method,
      amount: paidAmount,
      currency: paymentCurrency,
      exchangeRate,
      charges,
      tds,
      bank: bank || '',
      paidBy: actor.name || 'System',
      paidOn: paymentDate || todayLocal(),
      transactionReference: transactionReference || '',
      notes: notes || '',
      status: PAYMENT_ENTRY_STATUS.ACTIVE,
      timestamp: new Date().toISOString()
    };
    const updated = {
      ...invoice,
      status: newStatus,
      paymentMethod: method,
      paymentDate: historyEntry.paidOn,
      paymentNo,
      paidAmount: nextPaid,
      /* Outstanding is recomputed after every (partial) payment so the
         stored balance never goes stale — the ledger, reports, work
         queue and detail views all read it. */
      outstanding: round2(Math.max(0, net - nextPaid)),
      paidBy: actor.name || 'System',
      bank: bank || '',
      paymentCurrency,
      exchangeRate,
      transactionReference: transactionReference || '',
      matchStatus: match.status,
      matchReasons: match.reasons,
      paymentStatus: newStatus === INVOICE_STATUS.PAID ? PAYMENT_STATUS.PAID : PAYMENT_STATUS.PARTIALLY_PAID,
      adviceStatus: ADVICE_STATUS.ISSUED,
      paymentHistory: [...(invoice.paymentHistory || []), historyEntry],
      auditHistory
    };
    records[index] = updated;
    invoicesStore.persist(records);
    addPaymentAdvice(updated, paidAmount, method);
    notifyWorkflowEvent({
      type: 'Payment Completed',
      title: `Payment recorded — ${updated.invoiceNo}`,
      message: `${formatAmount(paidAmount)} paid on ${updated.invoiceNo}${updated.paymentNo ? ` (${updated.paymentNo})` : ''} — invoice status ${newStatus}.`,
      route: `/purchase/invoices/${updated.id}`,
      documentNo: updated.invoiceNo,
      related: { type: 'invoice', id: updated.id, vendor: updated.vendor || '', poNo: updated.poNo || '' },
      sourceEvent: 'recordPayment'
    });
    return clone(updated);
  },

  /**
   * Rejects a submitted invoice. Records the rejection reason in the
   * audit trail. The invoice can be resubmitted after correction.
   */
  async rejectInvoice(id, { reason = '' } = {}) {
    await delay();
    const records = invoicesStore.all;
    const index = records.findIndex((entry) => entry.id === id);
    if (index === -1) throw new Error('Invoice not found');
    if (records[index].status !== INVOICE_STATUS.SUBMITTED) {
      throw new Error('Only submitted invoices can be rejected');
    }
    const invoice = records[index];
    const actor = getCurrentActor();
    /* Engine chain — record the rejection on the current actionable step. */
    let approval = invoice.approval;
    if (approval && Array.isArray(approval.steps) && approval.steps.length > 0) {
      const stepIndex = currentStepIndex(approval);
      approval = engineRejectStep(approval, {
        stepIndex,
        approver: actor.name || '',
        note: reason
      });
    }
    const auditHistory = appendAudit(invoice, 'rejected', { reason });
    records[index] = {
      ...invoice,
      approval,
      approvalStatus: 'Rejected',
      status: INVOICE_STATUS.REJECTED,
      rejectionReason: reason,
      auditHistory
    };
    invoicesStore.persist(records);
    return clone(records[index]);
  },

  /**
   * Requests correction on a submitted invoice. The invoice stays in
   * Submitted status but is flagged with a correction request so the
   * vendor/originator knows action is needed.
   */
  async requestCorrection(id, { reason = '' } = {}) {
    await delay();
    if (!reason) throw new Error('Correction reason is required');
    const records = invoicesStore.all;
    const index = records.findIndex((entry) => entry.id === id);
    if (index === -1) throw new Error('Invoice not found');
    if (records[index].status !== INVOICE_STATUS.SUBMITTED) {
      throw new Error('Only submitted invoices can have corrections requested');
    }
    const invoice = records[index];
    /* Engine chain — flag the pending approval as needing correction. */
    const approval = invoice.approval && Array.isArray(invoice.approval.steps)
      ? engineRequestCorrection(invoice.approval, { reason })
      : invoice.approval;
    const auditHistory = appendAudit(invoice, 'correction_requested', { reason });
    records[index] = {
      ...invoice,
      approval,
      correctionRequested: true,
      correctionReason: reason,
      auditHistory
    };
    invoicesStore.persist(records);
    return clone(records[index]);
  },

  /**
   * Resubmits a rejected invoice for approval. Clears the rejection
   * reason and moves back to Submitted.
   */
  async resubmitInvoice(id) {
    await delay();
    const records = invoicesStore.all;
    const index = records.findIndex((entry) => entry.id === id);
    if (index === -1) throw new Error('Invoice not found');
    if (records[index].status !== INVOICE_STATUS.REJECTED) {
      throw new Error('Only rejected invoices can be resubmitted');
    }
    const invoice = records[index];
    /* Engine chain — resubmission resets every step to Pending. */
    const approval = invoice.approval && Array.isArray(invoice.approval.steps)
      ? engineResubmitState(invoice.approval)
      : invoice.approval;
    const auditHistory = appendAudit(invoice, 'resubmitted');
    records[index] = {
      ...invoice,
      approval,
      approvalStatus: 'Pending',
      status: INVOICE_STATUS.SUBMITTED,
      rejectionReason: '',
      correctionRequested: false,
      correctionReason: '',
      auditHistory
    };
    invoicesStore.persist(records);
    return clone(records[index]);
  },

  /**
   * Schedules a payment for an approved invoice. Sets the payment date
   * and method without recording actual payment.
   */
  async schedulePayment(id, { paymentDate, method = PAYMENT_METHODS[0] } = {}) {
    await delay();
    const records = invoicesStore.all;
    const index = records.findIndex((entry) => entry.id === id);
    if (index === -1) throw new Error('Invoice not found');
    const invoice = records[index];
    if (![INVOICE_STATUS.APPROVED, INVOICE_STATUS.PARTIAL].includes(invoice.status)) {
      throw new Error('Only approved invoices can have payments scheduled');
    }
    const auditHistory = appendAudit(invoice, 'payment_scheduled', { paymentDate, method });
    records[index] = {
      ...invoice,
      paymentStatus: PAYMENT_STATUS.SCHEDULED,
      paymentMethod: method,
      scheduledPaymentDate: paymentDate || invoice.scheduledPaymentDate || '',
      auditHistory
    };
    invoicesStore.persist(records);
    return clone(records[index]);
  },

  /**
   * Generates a payment advice for a paid invoice. The advice is
   * created as a side-effect of recordPayment, but this method allows
   * explicit generation for already-paid invoices.
   */
  async generateAdvice(id) {
    await delay();
    const records = invoicesStore.all;
    const index = records.findIndex((entry) => entry.id === id);
    if (index === -1) throw new Error('Invoice not found');
    const invoice = records[index];
    const paymentStatus = derivePaymentStatus(invoice);
    if (paymentStatus !== PAYMENT_STATUS.PAID) {
      throw new Error('Advice can only be generated for fully paid invoices');
    }
    if (invoice.paymentNo) {
      throw new Error('Advice already exists for this payment');
    }
    const paymentNo = nextSeqNo(records, 'PAY', 'paymentNo', 100);
    if (records.some((entry) => entry.paymentNo === paymentNo)) {
      throw new Error(`Payment number ${paymentNo} already exists`);
    }
    const actor = getCurrentActor();
    const auditHistory = appendAudit(invoice, 'advice_generated');
    records[index] = {
      ...invoice,
      paymentNo,
      paymentStatus: PAYMENT_STATUS.PAID,
      adviceStatus: ADVICE_STATUS.ISSUED,
      paidBy: actor.name || 'System',
      auditHistory
    };
    invoicesStore.persist(records);
    addPaymentAdvice(records[index], round2(Math.max(0, adjustedNetPayable(records[index]) - (Number(invoice.paidAmount) || 0))), invoice.paymentMethod);
    return clone(records[index]);
  },

  /**
   * Marks a payment advice as sent to the vendor.
   */
  async sendAdvice(id) {
    await delay();
    const records = invoicesStore.all;
    const index = records.findIndex((entry) => entry.id === id);
    if (index === -1) throw new Error('Invoice not found');
    const invoice = records[index];
    if (!invoice.paymentNo) {
      throw new Error('No payment advice to send — generate advice first');
    }
    const auditHistory = appendAudit(invoice, 'advice_sent');
    records[index] = {
      ...invoice,
      adviceStatus: ADVICE_STATUS.SENT,
      adviceSentOn: todayLocal(),
      auditHistory
    };
    invoicesStore.persist(records);
    return clone(records[index]);
  },

  /** Stored payment advices — one per settled payment, never duplicated. */
  async getPaymentAdvices() {
    await delay();
    return clone([...advicesStore.all].sort((a, b) => String(b.adviceNo).localeCompare(String(a.adviceNo))));
  },

  /**
   * Returns paid invoices that are eligible for advice generation.
   * An invoice is eligible when it is fully paid (PAID status) and
   * does not yet have a payment number (no advice generated).
   * This is the input for the Payment Advice page's Awaiting Advice view.
   * It is separate from Credit / Debit Notes, which adjust the invoice
   * ledger and are not part of the payment-advice generation flow.
   */
  async getEligibleInvoices() {
    await delay();
    const records = invoicesStore.all;
    const eligible = records.filter((invoice) => {
      const isPaid = invoice.status === INVOICE_STATUS.PAID;
      const hasNoAdvice = !invoice.paymentNo;
      return isPaid && hasNoAdvice;
    });
    return clone(eligible);
  },

  /**
   * Regenerates a payment advice for an existing paid invoice.
   * Creates a new advice record and updates the invoice's adviceStatus.
   */
  async regenerateAdvice(invoiceId) {
    await delay();
    const records = invoicesStore.all;
    const index = records.findIndex((entry) => entry.id === invoiceId);
    if (index === -1) throw new Error('Invoice not found');
    const invoice = records[index];
    if (invoice.status !== INVOICE_STATUS.PAID) {
      throw new Error('Advice can only be regenerated for fully paid invoices');
    }
    const actor = getCurrentActor();
    const auditHistory = appendAudit(invoice, 'advice_regenerated');
    records[index] = {
      ...invoice,
      adviceStatus: ADVICE_STATUS.ISSUED,
      adviceRegeneratedAt: new Date().toISOString(),
      adviceRegeneratedBy: actor.name || 'System',
      auditHistory
    };
    invoicesStore.persist(records);
    /* Ensure an advice record exists in the advices store. */
    if (!invoice.paymentNo) {
      const paymentNo = nextSeqNo(records, 'PAY', 'paymentNo', 100);
      records[index].paymentNo = paymentNo;
      records[index].paidBy = actor.name || 'System';
      invoicesStore.persist(records);
    }
    /* Remove existing advice for this invoice and recreate. */
    const advices = advicesStore.all.filter((a) => a.invoiceNo !== invoice.invoiceNo);
    advicesStore.persist(advices);
    addPaymentAdvice(records[index], Number(invoice.paidAmount) || Number(invoice.total), invoice.paymentMethod);
    return clone(withMatch(records[index]));
  },

  /**
   * Sends a payment advice to the vendor with full details.
   * Records the send details (recipient, subject, message) in the
   * advice record and audit trail.
   */
  async sendAdviceWithDetails(invoiceId, { recipient = '', subject = '', message = '' } = {}) {
    await delay();
    const records = invoicesStore.all;
    const index = records.findIndex((entry) => entry.id === invoiceId);
    if (index === -1) throw new Error('Invoice not found');
    const invoice = records[index];
    if (!invoice.paymentNo) {
      throw new Error('No payment advice to send — generate advice first');
    }
    const actor = getCurrentActor();
    const auditHistory = appendAudit(invoice, 'advice_sent', {
      recipient: recipient || invoice.vendorEmail || '',
      subject,
      message
    });
    records[index] = {
      ...invoice,
      adviceStatus: ADVICE_STATUS.SENT,
      adviceSentOn: todayLocal(),
      adviceRecipient: recipient || invoice.vendorEmail || '',
      adviceSubject: subject || `Payment Advice — ${invoice.invoiceNo}`,
      adviceMessage: message,
      adviceSentBy: actor.name || 'System',
      auditHistory
    };
    invoicesStore.persist(records);
    /* Also update the advice record in the advices store. */
    const advices = advicesStore.all;
    const adviceIndex = advices.findIndex((a) => a.invoiceNo === invoice.invoiceNo);
    if (adviceIndex !== -1) {
      advices[adviceIndex] = {
        ...advices[adviceIndex],
        status: ADVICE_STATUS.SENT,
        sentOn: todayLocal(),
        recipient: recipient || invoice.vendorEmail || '',
        subject: subject || `Payment Advice — ${invoice.invoiceNo}`,
        sentBy: actor.name || 'System'
      };
      advicesStore.persist(advices);
    }
    return clone(withMatch(records[index]));
  },

  /**
   * Bulk generates payment advices for multiple paid invoices.
   * Returns a summary of successes and failures.
   */
  async bulkGenerateAdvices(invoiceIds = []) {
    await delay();
    const results = { success: 0, failed: 0, errors: [] };
    for (const id of invoiceIds) {
      try {
        await mockInvoiceService.generateAdvice(id);
        results.success++;
      } catch (err) {
        results.failed++;
        results.errors.push({ id, error: err.message });
      }
    }
    return results;
  },

  /**
   * Bulk sends payment advices for multiple invoices.
   * Returns a summary of successes and failures.
   */
  async bulkSendAdvices(invoiceIds = [], { subject = '', message = '' } = {}) {
    await delay();
    const results = { success: 0, failed: 0, errors: [] };
    for (const id of invoiceIds) {
      try {
        await mockInvoiceService.sendAdviceWithDetails(id, { subject, message });
        results.success++;
      } catch (err) {
        results.failed++;
        results.errors.push({ id, error: err.message });
      }
    }
    return results;
  },

  /** Re-runs the three-way match for an invoice, clearing any override. */
  async rematchInvoice(id) {
    return rematchInvoice(id);
  },

  /** Overrides a mismatch/exception with a user-supplied status and mandatory reason. */
  async overrideMatch(id, options = {}) {
    return overrideMatch(id, options);
  },

  /** Rejects a mismatched invoice with a mandatory reason. */
  async rejectMatch(id, options = {}) {
    return rejectMatch(id, options);
  },

  /** Approves an exception with a mandatory reason. */
  async approveException(id, options = {}) {
    return approveException(id, options);
  },

  /** Returns the payment history array for an invoice. */
  async getPaymentHistory(id) {
    await delay();
    const invoice = invoicesStore.all.find((entry) => entry.id === id);
    if (!invoice) throw new Error('Invoice not found');
    return clone(invoice.paymentHistory || []);
  },

  /**
   * Reverses a recorded payment on the payment ledger.
   *
   * The payment entry is kept on the ledger but marked Reversed with
   * the reversal reason / actor / timestamp, its amount stops counting
   * toward the invoice's paid balance, the invoice status and
   * outstanding are recomputed, the payment's advice is removed, and
   * the reversal is written to the audit trail. Only an Active payment
   * can be reversed — a reversed entry cannot be reversed again.
   */
  async reversePayment(id, paymentNo, { reason = '' } = {}) {
    await delay();
    if (!reason || !reason.trim()) throw new Error('Reversal reason is required');
    const records = invoicesStore.all;
    const index = records.findIndex((entry) => entry.id === id);
    if (index === -1) throw new Error('Invoice not found');
    const invoice = records[index];
    const history = Array.isArray(invoice.paymentHistory) ? [...invoice.paymentHistory] : [];
    const entryIndex = history.findIndex((entry) => entry.paymentNo === paymentNo);
    if (entryIndex === -1) throw new Error(`Payment ${paymentNo} not found on ${invoice.invoiceNo}`);
    const entry = history[entryIndex];
    if ((entry.status || PAYMENT_ENTRY_STATUS.ACTIVE) === PAYMENT_ENTRY_STATUS.REVERSED) {
      throw new Error(`Payment ${paymentNo} is already reversed`);
    }
    const actor = getCurrentActor();
    history[entryIndex] = {
      ...entry,
      status: PAYMENT_ENTRY_STATUS.REVERSED,
      reversedAt: new Date().toISOString(),
      reversedBy: actor.name || 'System',
      reversalReason: reason.trim()
    };

    /* Recompute the paid balance from the surviving active payments
       (always in the invoice currency). */
    const activeAmount = history
      .filter((e) => (e.status || PAYMENT_ENTRY_STATUS.ACTIVE) !== PAYMENT_ENTRY_STATUS.REVERSED)
      .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    const nextPaid = round2(activeAmount);
    /* Adjusted net keeps the reversal consistent when credit / debit
       notes already changed what the invoice is worth. */
    const net = adjustedNetPayable(invoice);
    const newStatus =
      nextPaid <= 0 ? INVOICE_STATUS.APPROVED :
      nextPaid >= net - 0.01 ? INVOICE_STATUS.PAID : INVOICE_STATUS.PARTIAL;

    const auditHistory = appendAudit(invoice, 'payment_reversed', {
      paymentNo, reason: reason.trim(), amount: entry.amount
    });

    /* Drop the advice that was issued for this payment. */
    const advices = advicesStore.all;
    const kept = advices.filter(
      (a) => !(a.invoiceNo === invoice.invoiceNo && a.paymentNo === paymentNo)
    );
    if (kept.length !== advices.length) advicesStore.persist(kept);

    /* Derive the invoice-level payment fields from the most recent
       active payment, or clear them when nothing remains. */
    const latestActive = [...history].reverse().find(
      (e) => (e.status || PAYMENT_ENTRY_STATUS.ACTIVE) !== PAYMENT_ENTRY_STATUS.REVERSED
    );
    const updated = {
      ...invoice,
      paymentHistory: history,
      paidAmount: nextPaid,
      status: newStatus,
      paymentStatus:
        nextPaid <= 0 ? PAYMENT_STATUS.UNPAID :
        nextPaid >= net - 0.01 ? PAYMENT_STATUS.PAID : PAYMENT_STATUS.PARTIALLY_PAID,
      paymentNo: latestActive ? latestActive.paymentNo : '',
      paymentMethod: latestActive ? (latestActive.method || invoice.paymentMethod) : '',
      paymentDate: latestActive ? (latestActive.paidOn || '') : '',
      bank: latestActive ? (latestActive.bank || '') : '',
      paymentCurrency: latestActive ? (latestActive.currency || invoice.currency || 'INR') : '',
      exchangeRate: latestActive ? (latestActive.exchangeRate || 1) : 1,
      transactionReference: latestActive ? (latestActive.transactionReference || '') : '',
      adviceStatus: latestActive ? ADVICE_STATUS.ISSUED : ADVICE_STATUS.NOT_ISSUED,
      auditHistory
    };
    records[index] = updated;
    invoicesStore.persist(records);
    return clone(updated);
  },

  /**
   * Payment ledger — every payment entry across all invoices, newest
   * first, with invoice context (invoice no, PO, vendor) and full
   * payment metadata. Reversed entries stay visible with their status.
   */
  async getPaymentLedger({ search = '', page = 1, pageSize = 50 } = {}) {
    await delay();
    const query = String(search).trim().toLowerCase();
    const rows = [];
    invoicesStore.all.forEach((invoice) => {
      (invoice.paymentHistory || []).forEach((entry) => {
        const row = {
          id: `${invoice.id}-${entry.paymentNo}`,
          invoiceId: invoice.id,
          invoiceNo: invoice.invoiceNo,
          poNo: invoice.poNo || '',
          vendor: invoice.vendor || '',
          paymentNo: entry.paymentNo,
          amount: Number(entry.amount) || 0,
          currency: entry.currency || invoice.currency || 'INR',
          exchangeRate: Number(entry.exchangeRate) || 1,
          charges: Number(entry.charges) || 0,
          tds: Number(entry.tds) || 0,
          bank: entry.bank || '',
          method: entry.method || '',
          paymentDate: entry.paidOn || '',
          transactionReference: entry.transactionReference || '',
          paidBy: entry.paidBy || '',
          notes: entry.notes || '',
          status: entry.status || PAYMENT_ENTRY_STATUS.ACTIVE,
          reversedAt: entry.reversedAt || '',
          reversedBy: entry.reversedBy || '',
          reversalReason: entry.reversalReason || '',
          timestamp: entry.timestamp || ''
        };
        if (query) {
          const haystack = [
            row.invoiceNo, row.poNo, row.vendor, row.paymentNo,
            row.transactionReference, row.bank, row.method
          ].filter(Boolean).join(' ').toLowerCase();
          if (!haystack.includes(query)) return;
        }
        rows.push(row);
      });
    });
    rows.sort((a, b) => String(b.paymentDate).localeCompare(String(a.paymentDate)) || String(b.timestamp).localeCompare(String(a.timestamp)));
    return paginate(rows, { page, pageSize });
  },

  /**
   * Vendor balances — aggregated payable / paid / outstanding per
   * vendor, computed live from the invoice ledger so the numbers always
   * match what the payment pages show.
   */
  async getVendorPaymentBalances() {
    await delay();
    return accumulateVendorBalances(invoicesStore.all);
  },

  async getInvoiceStats() {
    await delay();
    const records = invoicesStore.all;
    const byStatus = Object.values(INVOICE_STATUS).reduce((acc, status) => {
      acc[status] = records.filter((invoice) => invoice.status === status).length;
      return acc;
    }, {});
    /* Legacy behaviour summed the (net) payable of every non-paid,
       non-draft invoice; approved notes now shrink / grow that figure. */
    const outstanding = records
      .filter((invoice) => ![INVOICE_STATUS.PAID, INVOICE_STATUS.DRAFT].includes(invoice.status))
      .reduce((sum, invoice) => sum + adjustedNetPayable(invoice), 0);
    return {
      total: records.length,
      ...byStatus,
      outstanding: Math.round(outstanding * 100) / 100,
      paidValue: records
        .filter((invoice) => invoice.status === INVOICE_STATUS.PAID)
        .reduce((sum, invoice) => sum + invoice.total, 0),
      adjustmentNotes: adjustmentNotesStore.all.length,
      approvedAdjustments: activeAdjustmentNotes().length
    };
  }
};

/**
 * Shapes an invoice that carries an issued / sent payment advice into the
 * advice-row the Payment Advice page renders. The advice identity is the
 * latest settlement on the invoice (payment number), so one advice per
 * payment event — the same dedupe rule the mock uses.
 */
function toAdviceRow(invoice) {
  const paymentNo = invoice.paymentNo || '';
  const suffix = String(paymentNo).replace(/^PAY-/, '') || String(invoice.id).padStart(4, '0');
  const sent = invoice.adviceStatus === ADVICE_STATUS.SENT;
  return {
    id: invoice.id,
    adviceNo: `ADV-${suffix}`,
    paymentNo,
    transactionReference: invoice.paymentReference || '',
    invoiceNo: invoice.invoiceNo,
    vendor: invoice.vendor || '',
    poNo: invoice.poNo || '',
    paidOn: invoice.paymentDate || '',
    method: invoice.paymentMethod || '',
    bank: invoice.paymentBank || '',
    currency: invoice.currency || 'INR',
    amount: Number(invoice.paidAmount) || 0,
    status: invoice.adviceStatus,
    sentOn: sent ? invoice.updatedAt || '' : ''
  };
}

/**
 * API-first invoice service facade. Calls the real Spring Boot API;
 * falls back to the mock implementation only when the backend is
 * unreachable (network error). Public interface identical to the
 * mock's, so components are untouched.
 */
export const invoiceService = {
  async getInvoices(options = {}) {
    return withFallback(() => invoiceApi.list(options), () => mockInvoiceService.getInvoices(options));
  },

  async getInvoice(id) {
    return withFallback(() => invoiceApi.get(id), () => mockInvoiceService.getInvoice(id));
  },

  async getNextInvoiceNumber() {
    return withFallback(
      async () => {
        const result = await invoiceApi.nextNumber();
        return result?.invoiceNo || result?.nextNumber || result;
      },
      async () => nextInvoiceNo(invoicesStore.all)
    );
  },

  async createInvoice(payload = {}) {
    return withFallback(() => invoiceApi.create(payload), () => mockInvoiceService.createInvoice(payload));
  },

  async updateInvoice(id, patch = {}) {
    return withFallback(() => invoiceApi.update(id, patch), () => mockInvoiceService.updateInvoice(id, patch));
  },

  async deleteInvoice(id) {
    return withFallback(() => invoiceApi.delete(id), () => mockInvoiceService.deleteInvoice(id));
  },

  async recordPayment(id, options = {}) {
    return withFallback(
      () => invoiceApi.recordPayment(id, options),
      () => mockInvoiceService.recordPayment(id, options)
    );
  },

  async approveInvoice(id) {
    return withFallback(() => invoiceApi.approve(id), () => mockInvoiceService.approveInvoice(id));
  },

  async submitInvoice(id) {
    return withFallback(() => invoiceApi.submit(id), () => mockInvoiceService.submitInvoice(id));
  },

  async getInvoiceStats() {
    return withFallback(() => invoiceApi.stats(), () => mockInvoiceService.getInvoiceStats());
  },

  async rejectInvoice(id, options = {}) {
    /* Rejection is a server-side status transition. It must go through the
       API, otherwise the database keeps the invoice as-is while the UI
       reports it rejected (and the local store is empty once invoices come
       from the API, so the local path only ever throws "not found"). */
    return withFallback(
      () => invoiceApi.reject(id, options.reason || options.comments || ''),
      () => mockInvoiceService.rejectInvoice(id, options)
    );
  },

  async requestCorrection(id, options = {}) {
    return mockInvoiceService.requestCorrection(id, options);
  },

  async resubmitInvoice(id) {
    return mockInvoiceService.resubmitInvoice(id);
  },

  async schedulePayment(id, options = {}) {
    return mockInvoiceService.schedulePayment(id, options);
  },

  async generateAdvice(id) {
    return withFallback(
      () => invoiceApi.generateAdvice(id),
      () => mockInvoiceService.generateAdvice(id)
    );
  },

  async sendAdvice(id) {
    return withFallback(
      () => invoiceApi.sendAdvice(id),
      () => mockInvoiceService.sendAdvice(id)
    );
  },

  async getPaymentAdvices() {
    /* The advice state lives on the invoice (advice_status). In API mode the
       local advice store is empty, so derive the advice rows from the real
       invoices that already carry an issued / sent advice. */
    return withFallback(
      async () => {
        const result = await invoiceApi.list({ page: 1, pageSize: 500 });
        return (result.data || [])
          .filter((inv) => inv.adviceStatus)
          .map(toAdviceRow)
          .sort((a, b) => String(b.adviceNo).localeCompare(String(a.adviceNo)));
      },
      () => mockInvoiceService.getPaymentAdvices()
    );
  },

  async getEligibleInvoices() {
    /* Paid invoices without an advice yet — the Awaiting Advice view. */
    return withFallback(
      async () => {
        const result = await invoiceApi.list({ page: 1, pageSize: 500 });
        return (result.data || []).filter(
          (inv) => inv.status === INVOICE_STATUS.PAID && !inv.adviceStatus
        );
      },
      () => mockInvoiceService.getEligibleInvoices()
    );
  },

  async getInvoiceSources() {
    /* The receipt-driven invoice form builds its line items from these
       sources. In API mode the local stores are empty, so aggregate the
       live GRN + PO + invoice data instead of falling back to the mock
       (which returned nothing and left the form with no source to pick). */
    return withFallback(
      async () => {
        const [{ logisticsService }, { purchaseOrderService }] = await Promise.all([
          import('./logistics'),
          import('./purchaseOrder')
        ]);
        const grnResult = await logisticsService.getGrns();
        const grnList = Array.isArray(grnResult) ? grnResult : (grnResult?.data || []);
        const poResult = await purchaseOrderService.getOrders({ page: 1, pageSize: 500 });
        const poList = Array.isArray(poResult)
          ? poResult
          : (poResult?.data || poResult?.items || []);
        const invoiceResult = await invoiceApi.list({ page: 1, pageSize: 500 });
        const invoiceList = Array.isArray(invoiceResult)
          ? invoiceResult
          : (invoiceResult?.data || []);

        /* Quantities already invoiced per product, keyed by PO number. */
        const invoiced = {};
        invoiceList.forEach((inv) => {
          const poNo = inv?.poNo;
          if (!poNo) return;
          const bucket = invoiced[poNo] || (invoiced[poNo] = {});
          (inv.items || []).forEach((line) => {
            const key = String(line.product || '').trim().toLowerCase();
            bucket[key] = (bucket[key] || 0) + (Number(line.qty) || 0);
          });
        });

        const sources = [];
        grnList.forEach((grn) => {
          if (!grn || grn.status === GRN_STATUS.EXPECTED) return;
          const order = poList.find((entry) => entry.poNo === grn.poNo);
          if (!order) return;
          const poLines = order.items || [];
          const items = (grn.items || [])
            .map((item) => {
              const key = String(item.product || '').trim().toLowerCase();
              const poLine = poLines.find(
                (l) => String(l.product || '').trim().toLowerCase() === key
              ) || {};
              const received = Number(item.received) || 0;
              if (received <= 0) return null;
              return {
                product: item.product || '',
                hsn: poLine.hsn || item.hsn || '',
                uom: poLine.uom || item.uom || '',
                orderQty: Number(poLine.qty) || Number(item.orderedQty) || Number(item.qty) || 0,
                received,
                rate: Number(poLine.rate) || Number(item.rate) || 0,
                gstRate: Number(poLine.gstRate) || 0,
                qty: received,
                discount: 0
              };
            })
            .filter(Boolean);
          if (!items.length) return;
          const totals = calcDocumentTotals(
            items.map(({ qty, rate, discount, gstRate }) => ({ qty, rate, discount, gstRate })),
            Number(order.discount) || 0,
            Number(order.charges) || 0,
            order.gstType || ''
          );
          const bucket = invoiced[grn.poNo] || {};
          const fullyInvoiced = items.every(
            (item) => (bucket[String(item.product).trim().toLowerCase()] || 0) >= item.received - 0.001
          );
          sources.push({
            grnNo: grn.grnNo,
            poNo: grn.poNo,
            vendor: order.vendor || grn.vendor || '',
            currency: order.currency || 'INR',
            gstType: order.gstType || '',
            terms: order.terms || '',
            discount: Number(order.discount) || 0,
            charges: Number(order.charges) || 0,
            freight: Number(order.freight) || 0,
            paymentTerms: order.paymentTerms || order.terms || '',
            receivedOn: grn.receivedOn || '',
            status: grn.status,
            items,
            totals,
            fullyInvoiced
          });
        });
        sources.sort(
          (a, b) =>
            String(b.receivedOn || '').localeCompare(String(a.receivedOn || '')) ||
            String(b.grnNo).localeCompare(String(a.grnNo))
        );
        return sources;
      },
      () => mockInvoiceService.getInvoiceSources()
    );
  },

  async regenerateAdvice(id) {
    return withFallback(
      async () => {
        const invoice = await invoiceApi.get(id);
        if (invoice?.adviceStatus) return invoice;
        return invoiceApi.generateAdvice(id);
      },
      () => mockInvoiceService.regenerateAdvice(id)
    );
  },

  async sendAdviceWithDetails(id, options = {}) {
    return withFallback(
      () => invoiceApi.sendAdvice(id),
      () => mockInvoiceService.sendAdviceWithDetails(id, options)
    );
  },

  async bulkGenerateAdvices(invoiceIds = []) {
    return withFallback(
      async () => {
        const results = [];
        for (const invoiceId of invoiceIds) {
          try { results.push(await invoiceApi.generateAdvice(invoiceId)); } catch (err) { /* skip ineligible */ }
        }
        return { generated: results.length, results };
      },
      () => mockInvoiceService.bulkGenerateAdvices(invoiceIds)
    );
  },

  async bulkSendAdvices(invoiceIds = [], options = {}) {
    return withFallback(
      async () => {
        const results = [];
        for (const invoiceId of invoiceIds) {
          try { results.push(await invoiceApi.sendAdvice(invoiceId)); } catch (err) { /* skip unsent */ }
        }
        return { sent: results.length, results };
      },
      () => mockInvoiceService.bulkSendAdvices(invoiceIds, options)
    );
  },

  async rematchInvoice(id) {
    /* Re-runs the three-way match on the server so the stored match status
       and tolerances are the ones the database actually holds. */
    return withFallback(
      () => invoiceApi.rematch(id),
      () => mockInvoiceService.rematchInvoice(id)
    );
  },

  async overrideMatch(id, options = {}) {
    return mockInvoiceService.overrideMatch(id, options);
  },

  async rejectMatch(id, options = {}) {
    /* Rejecting a mismatched invoice is the same server-side transition as
       rejecting a submitted invoice — reuse that endpoint so the match
       rejection actually reaches the database instead of the empty local
       store. */
    return withFallback(
      () => invoiceApi.reject(id, options.reason || ''),
      () => mockInvoiceService.rejectMatch(id, options)
    );
  },

  async approveException(id, options = {}) {
    return mockInvoiceService.approveException(id, options);
  },

  async getPaymentHistory(id) {
    /* The payment ledger endpoint is the server's source of truth for
       payments; the local history is a fabricated copy. Filter the real
       ledger by invoice and map the server's field names to the ones this
       modal renders. */
    return withFallback(
      async () => {
        const ledger = await invoiceApi.paymentLedger('');
        const rows = ledger?.data || (Array.isArray(ledger) ? ledger : []);
        return rows
          .filter((p) => String(p.invoiceId) === String(id))
          .map((p) => ({ ...p, paidOn: p.paymentDate || p.paidOn || '', notes: p.notes || p.remarks || '' }));
      },
      () => mockInvoiceService.getPaymentHistory(id)
    );
  },

  async reversePayment(id, paymentNo, options = {}) {
    /* Reversal moves money in the ledger — it has to reach the database. */
    return withFallback(
      () => invoiceApi.reversePayment(id, paymentNo, { reason: options.reason || '' }),
      () => mockInvoiceService.reversePayment(id, paymentNo, options)
    );
  },

  async getPaymentLedger(options = {}) {
    /* Real vendor payment ledger. The endpoint returns the rows but no total,
       so the total is derived from the rows; `search` is applied server-side. */
    return withFallback(
      async () => {
        const result = await invoiceApi.paymentLedger(options.search || '');
        const rows = result?.data || (Array.isArray(result) ? result : []);
        return {
          ...(result && !Array.isArray(result) ? result : {}),
          data: rows,
          total: result?.total ?? rows.length
        };
      },
      () => mockInvoiceService.getPaymentLedger(options)
    );
  },

  async getVendorPaymentBalances() {
    /* Vendor balances are aggregated from every invoice. The local store is
       empty when invoices come from the API, so the "Live from the payment
       ledger" card rendered no rows at all — aggregate the real invoices. */
    return withFallback(
      async () => {
        const result = await invoiceApi.list({ page: 1, pageSize: 500 });
        return accumulateVendorBalances(result.data || []);
      },
      () => mockInvoiceService.getVendorPaymentBalances()
    );
  },

  /* ── Credit / Debit Notes ─────────────────────────────────────── */
  async getAdjustmentNoteSources() {
    /* Original invoices a note can be raised against. The mock store is empty
       in API mode, so build this from the real invoices instead of returning
       nothing (the note form's Original Invoice picker was always empty). */
    return withFallback(
      async () => {
        const result = await invoiceApi.list({ page: 1, pageSize: 500 });
        const eligibleStatuses = [
          INVOICE_STATUS.APPROVED, INVOICE_STATUS.PARTIAL,
          INVOICE_STATUS.PAID, INVOICE_STATUS.OVERDUE
        ];
        return (result.data || [])
          .filter((inv) => !isCreditNote(inv) && eligibleStatuses.includes(inv.status))
          .map((inv) => ({
            id: inv.id,
            invoiceNo: inv.invoiceNo,
            vendor: inv.vendor || '',
            vendorEmail: inv.vendorEmail || '',
            poNo: inv.poNo || '',
            grnNo: inv.grnNo || '',
            invoiceDate: inv.invoiceDate || '',
            dueDate: inv.dueDate || '',
            currency: inv.currency || 'INR',
            gstType: inv.gstType || '',
            total: Number(inv.total) || 0,
            netPayable: Number(inv.total) || 0,
            paidAmount: Number(inv.paidAmount) || 0,
            outstanding: Number(inv.outstanding) || 0,
            vendorCredit: 0,
            adjustments: { credit: 0, debit: 0, net: 0, count: 0 },
            items: Array.isArray(inv.items)
              ? inv.items.map((line) => ({
                  product: line.product || '',
                  hsn: line.hsn || '',
                  uom: line.uom || '',
                  qty: Number(line.qty) || 0,
                  rate: Number(line.rate ?? line.price) || 0,
                  gstRate: Number(line.gstRate ?? line.gst) || 0,
                  discount: 0
                }))
              : []
          }))
          .sort(
            (a, b) =>
              String(b.invoiceDate || '').localeCompare(String(a.invoiceDate || '')) ||
              String(a.invoiceNo).localeCompare(String(b.invoiceNo))
          );
      },
      () => mockInvoiceService.getAdjustmentNoteSources()
    );
  },

  async getAdjustmentNotes(options = {}) {
    if (isApiMode()) {
      try { return await adjustmentNoteApi.list(options); } catch (e) { /* fall through */ }
    }
    return mockInvoiceService.getAdjustmentNotes(options);
  },

  async getAdjustmentNote(id) {
    if (isApiMode()) {
      try { return await adjustmentNoteApi.get(id); } catch (e) { /* fall through */ }
    }
    return mockInvoiceService.getAdjustmentNote(id);
  },

  async getAdjustmentNotesForInvoice(reference = {}) {
    if (isApiMode()) {
      try {
        const result = await adjustmentNoteApi.list({ search: reference.invoiceNo || '', pageSize: 100 });
        const notes = (result.data || []).filter(n => n.invoiceNo === reference.invoiceNo);
        return { invoice: null, invoiceNo: reference.invoiceNo || '', notes };
      } catch (e) { /* fall through to mock */ }
    }
    return mockInvoiceService.getAdjustmentNotesForInvoice(reference);
  },

  async createAdjustmentNote(payload = {}) {
    if (isApiMode()) {
      const apiPayload = {
        invoiceId: payload.invoiceId,
        noteType: payload.noteType,
        noteDate: payload.noteDate || todayLocal(),
        reason: payload.reason || '',
        reference: payload.reference || '',
        notes: payload.notes || '',
        status: payload.status || 'Draft',
        allowExcess: payload.allowExcess || false,
        items: (payload.items || []).map(item => ({
          product: item.product || '',
          hsn: item.hsn || '',
          uom: item.uom || '',
          qty: Number(item.qty) || 0,
          rate: Number(item.rate) || 0,
          gstRate: Number(item.gstRate) || 0,
          discount: Number(item.discount) || 0
        })),
        amount: Number(payload.amount) || 0,
        gst: Number(payload.gst) || 0,
        discount: Number(payload.discount) || 0,
        charges: Number(payload.charges) || 0,
        freight: Number(payload.freight) || 0
      };
      return adjustmentNoteApi.create(apiPayload);
    }
    /* Mock mode fallback */
    return withFallback(
      async () => {
        let invoice = findOriginalInvoice({ invoiceId: payload.invoiceId, invoiceNo: payload.invoiceNo });
        if (!invoice) {
          const result = await invoiceApi.list({ page: 1, pageSize: 500 });
          invoice = (result.data || []).find((inv) => (
            String(inv.id) === String(payload.invoiceId) || inv.invoiceNo === payload.invoiceNo
          )) || null;
        }
        if (!invoice) {
          throw new Error('The original vendor invoice was not found — pick an invoice to adjust');
        }
        return mockInvoiceService.createAdjustmentNote({ ...payload, _originalInvoice: invoice });
      },
      () => mockInvoiceService.createAdjustmentNote(payload)
    );
  },

  async updateAdjustmentNote(id, patch = {}) {
    if (isApiMode()) {
      try { return await adjustmentNoteApi.update(id, patch); } catch (e) { /* fall through */ }
    }
    return mockInvoiceService.updateAdjustmentNote(id, patch);
  },

  async deleteAdjustmentNote(id) {
    if (isApiMode()) {
      try { return await adjustmentNoteApi.remove(id); } catch (e) { /* fall through */ }
    }
    return mockInvoiceService.deleteAdjustmentNote(id);
  },

  async submitAdjustmentNote(id) {
    if (isApiMode()) {
      try { return await adjustmentNoteApi.submit(id); } catch (e) { /* fall through */ }
    }
    return mockInvoiceService.submitAdjustmentNote(id);
  },

  async approveAdjustmentNote(id, options = {}) {
    if (isApiMode()) {
      try { return await adjustmentNoteApi.approve(id, options.comments || ''); } catch (e) { /* fall through */ }
    }
    return withFallback(
      async () => {
        const note = await mockInvoiceService.getAdjustmentNote(id);
        if (note) await resolveNoteInvoice({ invoiceNo: note.invoiceNo, invoiceId: note.invoiceId });
        return mockInvoiceService.approveAdjustmentNote(id, options);
      },
      () => mockInvoiceService.approveAdjustmentNote(id, options)
    );
  },

  async rejectAdjustmentNote(id, options = {}) {
    if (isApiMode()) {
      try { return await adjustmentNoteApi.reject(id, options.comments || ''); } catch (e) { /* fall through */ }
    }
    return mockInvoiceService.rejectAdjustmentNote(id, options);
  },

  async resubmitAdjustmentNote(id) {
    return mockInvoiceService.resubmitAdjustmentNote(id);
  },

  async reverseAdjustmentNote(id, options = {}) {
    /* Reversing restores the balance — same invoice dependency as approving. */
    return withFallback(
      async () => {
        const note = await mockInvoiceService.getAdjustmentNote(id);
        if (note) await resolveNoteInvoice({ invoiceNo: note.invoiceNo, invoiceId: note.invoiceId });
        return mockInvoiceService.reverseAdjustmentNote(id, options);
      },
      () => mockInvoiceService.reverseAdjustmentNote(id, options)
    );
  }
};
