/**
 * purchase/utils/paymentTerms.js
 * ------------------------------------------------------------------
 * Payment terms + advance payment helpers — the single source of
 * truth for how payment terms are normalized, validated and turned
 * into amounts. Pure functions (no service/storage dependencies) so
 * they can be shared by the evaluation service, the PO service and
 * every page without import cycles.
 *
 * Terms shape (normalized):
 *   {
 *     type: 'Partial Advance' | 'Full Advance' | 'Credit' |
 *           'Milestone Based' | 'Against Delivery' | 'Against Invoice'
 *           | 'Custom',
 *     advancePercentage, advanceTrigger,     // advance leg
 *     balancePercentage, balanceTrigger,     // balance leg (derived for
 *                                            //   Partial/Full Advance)
 *     creditPeriod,                          // days (Credit only)
 *     notes,
 *     milestones: [{ percentage, trigger, amount, status, dueDate, paidDate }]
 *   }
 *
 * Rules enforced here:
 *   - Advance % + Balance % must equal 100% (Partial Advance derives the
 *     balance automatically, so an invalid combination is impossible).
 *   - Milestone-based terms must total exactly 100%.
 *   - Credit terms need a credit period.
 *   - Nothing is hardcoded to 50/50 — any 0–100 split and any milestone
 *     combination is supported.
 * ------------------------------------------------------------------
 */
import { clone } from '../services/base';

/** Payment terms types (Commercial Evaluation). */
export const PAYMENT_TERMS_TYPE = {
  FULL_ADVANCE: 'Full Advance',
  PARTIAL_ADVANCE: 'Partial Advance',
  CREDIT: 'Credit',
  MILESTONE_BASED: 'Milestone Based',
  AGAINST_DELIVERY: 'Against Delivery',
  AGAINST_INVOICE: 'Against Invoice',
  CUSTOM: 'Custom'
};

export const PAYMENT_TERMS_TYPES = Object.values(PAYMENT_TERMS_TYPE);

/** Payment triggers used for advance / balance / milestone legs. */
export const PAYMENT_TRIGGERS = [
  'Against PO / Order Confirmation',
  'Against Drawing Approval',
  'Against Delivery',
  'Against Invoice',
  'After Installation',
  'After Commissioning',
  'On Acceptance'
];

/** Advance payment lifecycle statuses (on the PO). */
export const ADVANCE_STATUS = {
  NOT_REQUIRED: 'Not Required',
  REQUIRED: 'Required',
  PENDING_APPROVAL: 'Pending Approval',
  APPROVED: 'Approved',
  PAYMENT_PROCESSING: 'Payment Processing',
  PAID: 'Paid',
  REJECTED: 'Rejected'
};

export const ADVANCE_STATUSES = Object.values(ADVANCE_STATUS);

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

const isAdvanceLeg = (trigger) =>
  String(trigger || '').toLowerCase().includes('advance');

/** Normalizes a raw terms payload into the canonical shape, deriving the
 *  balance % from the advance % for Partial/Full Advance and setting the
 *  natural triggers for the simple types. Pure — returns a new object. */
export function normalizePaymentTerms(input = {}) {
  const type = input.type || '';
  let advancePercentage = Math.max(0, Math.min(100, Number(input.advancePercentage) || 0));

  let balancePercentage = Number(input.balancePercentage) || 0;
  let advanceTrigger = input.advanceTrigger || '';
  let balanceTrigger = input.balanceTrigger || '';

  if (type === PAYMENT_TERMS_TYPE.FULL_ADVANCE) {
    advancePercentage = 100;
    balancePercentage = 0;
    advanceTrigger = advanceTrigger || 'Against PO / Order Confirmation';
  } else if (type === PAYMENT_TERMS_TYPE.PARTIAL_ADVANCE) {
    /* Balance auto-derives so Advance % + Balance % = 100 always holds —
       an invalid combination can never be stored. */
    balancePercentage = round2(100 - advancePercentage);
    advanceTrigger = advanceTrigger || 'Against PO / Order Confirmation';
  } else if (type === PAYMENT_TERMS_TYPE.AGAINST_DELIVERY) {
    advancePercentage = 0;
    balancePercentage = 100;
    balanceTrigger = 'Against Delivery';
  } else if (type === PAYMENT_TERMS_TYPE.AGAINST_INVOICE) {
    advancePercentage = 0;
    balancePercentage = 100;
    balanceTrigger = 'Against Invoice';
  } else if (type === PAYMENT_TERMS_TYPE.CREDIT) {
    advancePercentage = 0;
    balancePercentage = 100;
    balanceTrigger = 'Against Invoice';
  }

  return {
    type,
    advancePercentage,
    advanceTrigger,
    balancePercentage,
    balanceTrigger,
    creditPeriod: Number(input.creditPeriod) || 0,
    notes: String(input.notes || ''),
    milestones: Array.isArray(input.milestones)
      ? input.milestones.map((milestone) => ({
          percentage: Number(milestone.percentage) || 0,
          trigger: milestone.trigger || '',
          amount: round2(Number(milestone.amount) || 0),
          status: milestone.status || '',
          dueDate: milestone.dueDate || '',
          paidDate: milestone.paidDate || ''
        }))
      : []
  };
}

/** Returns the list of validation errors (empty when valid). */
export function validatePaymentTerms(terms) {
  const errors = [];
  if (!terms || !terms.type) {
    errors.push('Payment terms type is required');
    return errors;
  }
  const { type } = terms;

  if ([PAYMENT_TERMS_TYPE.PARTIAL_ADVANCE, PAYMENT_TERMS_TYPE.FULL_ADVANCE].includes(type)) {
    const advance = Number(terms.advancePercentage) || 0;
    const balance = Number(terms.balancePercentage) || 0;
    if (type === PAYMENT_TERMS_TYPE.FULL_ADVANCE && advance !== 100) {
      errors.push('Full Advance requires a 100% advance');
    }
    if (advance < 0 || advance > 100) {
      errors.push('Advance percentage must be between 0 and 100');
    }
    if (Math.abs(advance + balance - 100) > 0.001) {
      errors.push(`Advance % + Balance % must equal 100% (currently ${round2(advance + balance)}%)`);
    }
    if (!terms.advanceTrigger) errors.push('Advance trigger is required');
    if (!terms.balanceTrigger) errors.push('Balance trigger is required');
  }

  if ([PAYMENT_TERMS_TYPE.AGAINST_DELIVERY, PAYMENT_TERMS_TYPE.AGAINST_INVOICE].includes(type)) {
    if (Math.abs(Number(terms.advancePercentage) + Number(terms.balancePercentage) - 100) > 0.001) {
      errors.push('Advance % + Balance % must equal 100%');
    }
  }

  if (type === PAYMENT_TERMS_TYPE.CREDIT && !(Number(terms.creditPeriod) > 0)) {
    errors.push('Credit period is required for Credit terms');
  }

  if (type === PAYMENT_TERMS_TYPE.MILESTONE_BASED) {
    const list = (terms.milestones || []).filter((milestone) => Number(milestone.percentage) > 0);
    if (list.length === 0) errors.push('Add at least one payment milestone');
    const sum = round2(list.reduce((total, milestone) => total + (Number(milestone.percentage) || 0), 0));
    if (Math.abs(sum - 100) > 0.001) {
      errors.push(`Total milestone percentage must equal 100% (currently ${sum}%)`);
    }
    if (list.some((milestone) => !milestone.trigger)) {
      errors.push('Every milestone needs a trigger');
    }
  }

  return errors;
}

/** True when the terms require an advance payment (> 0% advance, or an
 *  advance-triggered milestone). */
export function hasAdvance(terms) {
  if (!terms || !terms.type) return false;
  if (Number(terms.advancePercentage) > 0) return true;
  if (Array.isArray(terms.milestones)) {
    return terms.milestones.some((milestone) => Number(milestone.percentage) > 0 && isAdvanceLeg(milestone.trigger));
  }
  return false;
}

/** Advance amount = advance % (or advance-triggered milestones) × total. */
export function advanceAmount(terms, total) {
  const value = Number(total) || 0;
  if (terms?.type === PAYMENT_TERMS_TYPE.MILESTONE_BASED && Array.isArray(terms.milestones)) {
    const advancePercent = terms.milestones
      .filter((milestone) => isAdvanceLeg(milestone.trigger))
      .reduce((sum, milestone) => sum + (Number(milestone.percentage) || 0), 0);
    return round2((value * advancePercent) / 100);
  }
  return round2((value * (Number(terms?.advancePercentage) || 0)) / 100);
}

/** Balance amount = total − advance amount. */
export function balanceAmount(terms, total) {
  return round2((Number(total) || 0) - advanceAmount(terms, total));
}

/** Milestone rows with their amounts attached (milestone mode only). */
export function attachMilestoneAmounts(terms, total) {
  if (!Array.isArray(terms?.milestones)) return [];
  const value = Number(total) || 0;
  return terms.milestones
    .filter((milestone) => Number(milestone.percentage) > 0)
    .map((milestone) => ({
      ...clone(milestone),
      amount: round2((value * (Number(milestone.percentage) || 0)) / 100)
    }));
}

/** Human-readable one-line summary, e.g. "50% Advance (Against PO /
 *  Order Confirmation) + 50% Balance (Against Delivery)" or
 *  "20% Advance + 30% Drawing Approval + 40% Delivery + 10% Installation". */
export function paymentTermsLabel(terms) {
  if (!terms || !terms.type) return '';
  if (terms.type === PAYMENT_TERMS_TYPE.MILESTONE_BASED) {
    return (terms.milestones || [])
      .filter((milestone) => Number(milestone.percentage) > 0)
      .map((milestone) => `${milestone.percentage}% ${milestone.trigger || 'Milestone'}`)
      .join(' + ');
  }
  if (terms.type === PAYMENT_TERMS_TYPE.CREDIT) {
    return `${terms.creditPeriod || 0} Days Credit`;
  }
  const advance = Number(terms.advancePercentage) || 0;
  const balance = Number(terms.balancePercentage) || 0;
  const parts = [];
  if (advance > 0) parts.push(`${advance}% Advance${terms.advanceTrigger ? ` (${terms.advanceTrigger})` : ''}`);
  if (balance > 0) parts.push(`${balance}% Balance${terms.balanceTrigger ? ` (${terms.balanceTrigger})` : ''}`);
  return parts.join(' + ') || terms.type;
}

/**
 * Display rows for print / PDF templates — the ONLY sanctioned way to
 * turn the (possibly structured) payment-terms value into visible text.
 *
 * Returns an array of row descriptors that renderers may safely map to
 * JSX:
 *   { key, label, value }       — scalar row (Payment Type, Advance,
 *                                 Balance, Credit Period, Notes, legacy
 *                                 string)
 *   { key, label, milestones }  — milestone list for Milestone Based
 *                                 terms: [{ percentage, trigger,
 *                                 dueDate, status }]
 *
 * Handles every storage shape without ever returning the raw object:
 *   - normalized object ({ type, advancePercentage, ... milestones })
 *   - legacy string  ("30 Days")
 *   - null / undefined / empty / non-object — returns [] (renders as
 *     "not set" in the template, never a crash)
 */
export function paymentTermRows(terms) {
  if (!terms) return [];
  /* Legacy string terms (older records) — display as a single row. */
  if (typeof terms === 'string') {
    const text = terms.trim();
    return text ? [{ key: 'terms', label: 'Payment Terms', value: text }] : [];
  }
  if (typeof terms !== 'object' || Array.isArray(terms)) return [];

  const type = String(terms.type || '').trim();
  const rows = [];
  if (type) rows.push({ key: 'type', label: 'Payment Type', value: type });

  const advance = Number(terms.advancePercentage) || 0;
  const balance = Number(terms.balancePercentage) || 0;

  if (type === PAYMENT_TERMS_TYPE.MILESTONE_BASED) {
    const milestones = (Array.isArray(terms.milestones) ? terms.milestones : [])
      .filter((milestone) => milestone && Number(milestone.percentage) > 0)
      .map((milestone) => ({
        percentage: Number(milestone.percentage) || 0,
        trigger: String(milestone.trigger || '').trim(),
        dueDate: String(milestone.dueDate || ''),
        status: String(milestone.status || '')
      }));
    if (milestones.length > 0) rows.push({ key: 'milestones', label: 'Milestones', milestones });
  } else {
    if (advance > 0) {
      rows.push({ key: 'advance', label: 'Advance', value: pctWithTrigger(advance, terms.advanceTrigger) });
    }
    if (balance > 0) {
      rows.push({ key: 'balance', label: 'Balance', value: pctWithTrigger(balance, terms.balanceTrigger) });
    }
  }

  if (type === PAYMENT_TERMS_TYPE.CREDIT && Number(terms.creditPeriod) > 0) {
    rows.push({ key: 'credit', label: 'Credit Period', value: `${Number(terms.creditPeriod) || 0} days` });
  }

  const notes = String(terms.notes || '').trim();
  if (notes) rows.push({ key: 'notes', label: 'Notes', value: notes });
  return rows;
}

/** "50%" or "50% (Against PO / Order Confirmation)". */
function pctWithTrigger(percentage, trigger) {
  const text = String(trigger || '').trim();
  return text ? `${percentage}% (${text})` : `${percentage}%`;
}
