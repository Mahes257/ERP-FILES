/**
 * purchase/utils/paymentUtils.js
 * ------------------------------------------------------------------
 * Shared utilities for the Purchase → Invoices / Payment module.
 * Single source of truth for action eligibility, status helpers,
 * formatting, and audit logging.
 * ------------------------------------------------------------------
 */
import { INVOICE_STATUS, MATCH_STATUS, PAYMENT_STATUS, ADVICE_STATUS } from '../constants';
import { effectiveOutstanding, effectiveNetPayable } from './adjustmentNotes';

/* ═══════════════════════════════════════════════════════════════════ */
/*  Currency Formatting                                               */
/* ═══════════════════════════════════════════════════════════════════ */

const CURRENCY_SYMBOLS = { INR: '₹', USD: '$', EUR: '€', GBP: '£' };

export function formatCurrency(amount, currency = 'INR') {
  const num = Number(amount) || 0;
  const symbol = CURRENCY_SYMBOLS[currency] || '₹';
  return `${symbol}${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatAmount(amount) {
  const num = Number(amount) || 0;
  return `₹${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/* ═══════════════════════════════════════════════════════════════════ */
/*  Status Helpers                                                     */
/* ═══════════════════════════════════════════════════════════════════ */

/** Returns the payment status badge config for an invoice. */
export function getPaymentStatusBadge(invoice) {
  const status = invoice.paymentStatus || derivePaymentStatus(invoice);
  const badges = {
    [PAYMENT_STATUS.UNPAID]: { label: 'Unpaid', color: 'bg-slate-100 text-slate-700' },
    [PAYMENT_STATUS.SCHEDULED]: { label: 'Scheduled', color: 'bg-blue-100 text-blue-700' },
    [PAYMENT_STATUS.PROCESSING]: { label: 'Processing', color: 'bg-amber-100 text-amber-700' },
    [PAYMENT_STATUS.PAID]: { label: 'Paid', color: 'bg-emerald-100 text-emerald-700' },
    [PAYMENT_STATUS.PARTIALLY_PAID]: { label: 'Partially Paid', color: 'bg-sky-100 text-sky-700' },
    [PAYMENT_STATUS.FAILED]: { label: 'Failed', color: 'bg-rose-100 text-rose-700' }
  };
  return badges[status] || badges[PAYMENT_STATUS.UNPAID];
}

/** Outstanding after approved credit / debit notes + payments. */
export function getInvoiceOutstanding(invoice) {
  return effectiveOutstanding(invoice);
}

/** Net payable after approved credit / debit notes (floored at 0). */
export function getInvoiceNetPayable(invoice) {
  return effectiveNetPayable(invoice);
}

/** Derives payment status from invoice fields.
 *  Net payable (gross − TDS − retention) is used when present so an
 *  invoice with TDS / retention is only "Paid" once the NET amount is
 *  settled; approved credit / debit notes move the same figure. */
export function derivePaymentStatus(invoice) {
  if (invoice.paymentStatus) return invoice.paymentStatus;
  const total = getInvoiceNetPayable(invoice);
  const paid = Number(invoice.paidAmount) || 0;
  /* Fully credited invoices have nothing due — settled even unpaid. */
  if (total <= 0.005) return PAYMENT_STATUS.PAID;
  if (paid <= 0) return PAYMENT_STATUS.UNPAID;
  if (paid >= total - 0.01) return PAYMENT_STATUS.PAID;
  return PAYMENT_STATUS.PARTIALLY_PAID;
}

/** Derives advice status from invoice fields. */
export function deriveAdviceStatus(invoice) {
  if (invoice.adviceStatus) return invoice.adviceStatus;
  if (invoice.paymentNo) return ADVICE_STATUS.ISSUED;
  return ADVICE_STATUS.NOT_ISSUED;
}

/** Returns the advice status badge config. */
export function getAdviceStatusBadge(invoice) {
  const status = deriveAdviceStatus(invoice);
  const badges = {
    [ADVICE_STATUS.NOT_ISSUED]: { label: 'Not Issued', color: 'bg-slate-100 text-slate-500' },
    [ADVICE_STATUS.ISSUED]: { label: 'Issued', color: 'bg-blue-100 text-blue-700' },
    [ADVICE_STATUS.SENT]: { label: 'Sent', color: 'bg-emerald-100 text-emerald-700' }
  };
  return badges[status] || badges[ADVICE_STATUS.NOT_ISSUED];
}

/* ═══════════════════════════════════════════════════════════════════ */
/*  Action Eligibility                                                */
/* ═══════════════════════════════════════════════════════════════════ */

/**
 * Returns an object of boolean flags indicating which actions are
 * valid for the given invoice in its current state. Every page should
 * use this instead of inline status checks.
 */
export function getInvoiceActions(invoice) {
  const status = invoice.status;
  const matchStatus = invoice.matchStatus || MATCH_STATUS.PENDING;
  const paymentStatus = derivePaymentStatus(invoice);

  return {
    view: true,
    edit: [INVOICE_STATUS.DRAFT, INVOICE_STATUS.SUBMITTED].includes(status),
    delete: [INVOICE_STATUS.DRAFT].includes(status),
    print: true,
    download: (Number(invoice.paidAmount) || 0) > 0,
    export: true,

    /* Three-way matching */
    match: status === INVOICE_STATUS.SUBMITTED && matchStatus !== MATCH_STATUS.MATCHED,
    resolveException: matchStatus === MATCH_STATUS.EXCEPTION,
    reviewMismatch: matchStatus === MATCH_STATUS.MISMATCH,

    /* Approval */
    submit: status === INVOICE_STATUS.DRAFT,
    approve: status === INVOICE_STATUS.SUBMITTED && matchStatus === MATCH_STATUS.MATCHED,
    reject: status === INVOICE_STATUS.SUBMITTED,
    resubmit: status === INVOICE_STATUS.REJECTED,

    /* Payment — isPayable() accepts Approved AND Partially Paid
       invoices so a partial payment can be followed by further
       installments until the invoice is fully settled. */
    schedulePayment: status === INVOICE_STATUS.APPROVED && paymentStatus === PAYMENT_STATUS.UNPAID,
    recordPayment: isPayable(invoice),
    viewPaymentHistory: (Number(invoice.paidAmount) || 0) > 0 || (Array.isArray(invoice.paymentHistory) && invoice.paymentHistory.length > 0),

    /* Advice */
    generateAdvice: paymentStatus === PAYMENT_STATUS.PAID && !invoice.paymentNo,
    sendAdvice: deriveAdviceStatus(invoice) === ADVICE_STATUS.ISSUED,

    /* Audit */
    viewAudit: true
  };
}

/**
 * Returns the list of row actions (icon + label + key) for a given
 * invoice, filtered to only valid actions.
 */
export function getRowActions(invoice) {
  const actions = getInvoiceActions(invoice);
  const items = [];

  if (actions.view) items.push({ key: 'view', label: 'View Invoice', section: 'view' });
  if (actions.edit) items.push({ key: 'edit', label: 'Edit Invoice', section: 'edit' });
  if (actions.match) items.push({ key: 'match', label: 'Run Match', section: 'match' });
  if (actions.reviewMismatch) items.push({ key: 'review', label: 'Review Mismatch', section: 'match' });
  if (actions.resolveException) items.push({ key: 'resolve', label: 'Resolve Exception', section: 'match' });
  if (actions.approve) items.push({ key: 'approve', label: 'Approve Invoice', section: 'approval' });
  if (actions.reject) items.push({ key: 'reject', label: 'Reject Invoice', section: 'approval', danger: true });
  if (actions.resubmit) items.push({ key: 'resubmit', label: 'Resubmit for Approval', section: 'approval' });
  if (actions.schedulePayment) items.push({ key: 'schedule', label: 'Schedule Payment', section: 'payment' });
  if (actions.recordPayment) items.push({ key: 'pay', label: 'Record Payment', section: 'payment' });
  if (actions.viewPaymentHistory) items.push({ key: 'history', label: 'Payment History', section: 'payment' });
  if (actions.generateAdvice) items.push({ key: 'advice', label: 'Generate Advice', section: 'advice' });
  if (actions.sendAdvice) items.push({ key: 'send-advice', label: 'Send Advice', section: 'advice' });
  if (actions.download) items.push({ key: 'download', label: 'Download Receipt', section: 'payment' });
  if (actions.viewAudit) items.push({ key: 'audit', label: 'View Audit', section: 'audit' });
  if (actions.delete) items.push({ key: 'delete', label: 'Delete', section: 'danger', danger: true });

  return items;
}

/* ═══════════════════════════════════════════════════════════════════ */
/*  Pending / Highlight Helpers                                       */
/* ═══════════════════════════════════════════════════════════════════ */

export function isInvoicePending(invoice) {
  return invoice.status === INVOICE_STATUS.SUBMITTED;
}

export function isMatchPending(invoice) {
  const ms = invoice.matchStatus;
  return ms === MATCH_STATUS.PENDING || ms === undefined || ms === null;
}

export function isPaymentPending(invoice) {
  const ms = invoice.matchStatus;
  const paid = Number(invoice.paidAmount) || 0;
  return ms === MATCH_STATUS.MATCHED && paid <= 0;
}

export function isAdvicePending(invoice) {
  return derivePaymentStatus(invoice) === PAYMENT_STATUS.PAID
    && deriveAdviceStatus(invoice) === ADVICE_STATUS.NOT_ISSUED;
}

/**
 * Returns true when an invoice is eligible for payment approval.
 * Approval requires: status === Submitted AND matchStatus === Matched.
 */
export function isApprovalEligible(invoice) {
  return invoice.status === INVOICE_STATUS.SUBMITTED
    && (invoice.matchStatus || MATCH_STATUS.PENDING) === MATCH_STATUS.MATCHED;
}

/**
 * Returns an array of blocking reasons why an invoice cannot be approved.
 * Empty array means eligible.
 */
export function getApprovalBlockReasons(invoice) {
  const reasons = [];
  if (invoice.status !== INVOICE_STATUS.SUBMITTED) {
    reasons.push(`Status is "${invoice.status}" — only Submitted invoices can be approved`);
  }
  const ms = invoice.matchStatus || MATCH_STATUS.PENDING;
  if (ms !== MATCH_STATUS.MATCHED) {
    reasons.push(`Three-way match is "${ms}" — must be Matched before approval`);
  }
  if (invoice.correctionRequested) {
    reasons.push('Correction has been requested — vendor must resubmit');
  }
  return reasons;
}

/**
 * Returns true when an invoice is eligible for another payment.
 * Approved invoices are payable; Partially Paid invoices remain
 * payable while an outstanding balance is left (the ₹118 → ₹50 →
 * ₹68 installment flow). Draft / Submitted / Paid / Rejected and
 * invoices fully settled by credit notes are not payable.
 */
export function isPayable(invoice) {
  const status = invoice.status;
  if (![INVOICE_STATUS.APPROVED, INVOICE_STATUS.PARTIAL].includes(status)) return false;
  const outstanding = getInvoiceOutstanding(invoice);
  if (outstanding <= 0.005) return false;
  return true;
}

export function getPaymentBlockReasons(invoice) {
  const reasons = [];
  if (invoice.status === INVOICE_STATUS.REJECTED) {
    reasons.push('Invoice has been rejected');
  } else if (invoice.status === INVOICE_STATUS.DRAFT) {
    reasons.push('Invoice is still in draft — not approved');
  } else if (invoice.status === INVOICE_STATUS.SUBMITTED) {
    reasons.push('Invoice is still under approval — approve it before paying');
  } else if (![INVOICE_STATUS.APPROVED, INVOICE_STATUS.PARTIAL].includes(invoice.status)) {
    reasons.push(`Status is "${invoice.status}" — only approved (or partially paid) invoices can be paid`);
  }
  const outstanding = getInvoiceOutstanding(invoice);
  if (outstanding <= 0.005) {
    reasons.push('Invoice has no outstanding balance — fully paid or fully covered by approved credit notes');
  }
  return reasons;
}

/* ═══════════════════════════════════════════════════════════════════ */
/*  Audit Logging                                                     */
/* ═══════════════════════════════════════════════════════════════════ */

/**
 * Appends an audit entry to the invoice's auditHistory array.
 * Each entry records: action, actor, timestamp, and optional details.
 */
export function appendAudit(invoice, action, details = {}) {
  const actor = (() => {
    try {
      const raw = localStorage.getItem('authUser');
      return raw ? JSON.parse(raw).fullName || 'System' : 'System';
    } catch {
      return 'System';
    }
  })();

  const entry = {
    action,
    actor,
    timestamp: new Date().toISOString(),
    details: typeof details === 'string' ? { note: details } : details
  };

  const history = Array.isArray(invoice.auditHistory) ? [...invoice.auditHistory] : [];
  history.push(entry);
  return history;
}

/**
 * Returns a formatted audit timeline suitable for rendering in detail views.
 */
export function formatAuditTimeline(auditHistory) {
  if (!Array.isArray(auditHistory)) return [];
  return auditHistory.map((entry) => ({
    ...entry,
    timeLabel: new Date(entry.timestamp).toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    })
  }));
}

/* ═══════════════════════════════════════════════════════════════════ */
/*  Bulk Selection Helpers                                            */
/* ═══════════════════════════════════════════════════════════════════ */

/**
 * Returns bulk actions valid for the given selection of invoices.
 * Only actions that are valid for ALL selected invoices are returned.
 */
export function getBulkActions(invoices) {
  if (!invoices || invoices.length === 0) return [];

  const allActions = invoices.map(getInvoiceActions);
  const actions = [];

  if (allActions.every((a) => a.view)) actions.push({ key: 'view', label: 'View' });
  if (allActions.every((a) => a.approve)) actions.push({ key: 'approve', label: 'Approve' });
  if (allActions.every((a) => a.reject)) actions.push({ key: 'reject', label: 'Reject', danger: true });
  if (allActions.every((a) => a.recordPayment)) actions.push({ key: 'pay', label: 'Record Payment' });
  if (allActions.every((a) => a.delete)) actions.push({ key: 'delete', label: 'Delete', danger: true });
  actions.push({ key: 'export', label: 'Export CSV' });

  return actions;
}
