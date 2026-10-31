/**
 * purchase/services/budgetControl.js
 * ------------------------------------------------------------------
 * Purchase Budget Control.
 *
 * Budgets are configured in Settings (settings.budgetControl.budgets)
 * per dimension — Department, Project, Cost Centre, Financial Year —
 * and NEVER hardcoded here. Utilisation is computed LIVE from the real
 * PO and Vendor Invoice records:
 *
 *   · committed        — Σ PO value for POs in commitment states
 *                         (Approved → Closed; Draft / Pending Approval /
 *                         Cancelled do not reserve budget)
 *   · actualInvoiced   — Σ vendor-invoice totals on those POs
 *                         (Credit Notes reduce the actual)
 *   · paid             — Σ paidAmount across those invoices
 *   · openCommitment   — committed not yet invoiced
 *   · available        — budget − openCommitment − actualInvoiced
 *
 * Validation runs when creating / submitting / approving a Purchase
 * Order:
 *   · if the proposed value exceeds the available budget the exact
 *     SHORTAGE is reported,
 *   · when blockApprovalWhenExceeded is configured the action is
 *     refused,
 *   · when allowExceptionWorkflow is configured the document is
 *     allowed through but flagged with a budget exception (recorded
 *     on the document for the audit trail).
 * ------------------------------------------------------------------ */
import { PO_STATUS } from '../constants';
import { ordersStore } from './purchaseOrder';
import { invoicesStore } from './invoice';
import { readSettings } from './settings';

export { budgetControlSeed } from './configSeeds';

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

/**
 * Resolves the settings object to read budget rows from. Callers may
 * pass their own settings blob, but when none (or a partial object
 * without the budget master) is supplied the persisted settings are
 * used — budgets always come from configuration, never hardcoded.
 */
function resolveSettings(settings) {
  if (settings && typeof settings === 'object' && (settings.budgetControl || settings.approvalRules)) {
    return settings;
  }
  return readSettings() || {};
}

const COMMITMENT_STATES = [
  PO_STATUS.APPROVED,
  PO_STATUS.RELEASED,
  PO_STATUS.SUPPLIER_ACKNOWLEDGED,
  PO_STATUS.IN_PROGRESS,
  PO_STATUS.PARTIALLY_DELIVERED,
  PO_STATUS.COMPLETED,
  PO_STATUS.CLOSED
];

function eq(a, b) {
  return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
}

/** A context value is considered a match when either side is blank. */
function dimMatches(configured, actual) {
  if (!configured) return true;
  if (!actual) return true;
  return eq(configured, actual);
}

/**
 * Ranks how specifically a budget row matches a context: counts the
 * non-empty dimensions that agree. Higher = more specific match.
 */
function specificity(row, context) {
  let score = 0;
  if (row.department && eq(row.department, context.department)) score += 1;
  if (row.project && eq(row.project, context.project)) score += 1;
  if (row.costCenter && eq(row.costCenter, context.costCenter)) score += 1;
  if (row.fiscalYear && eq(row.fiscalYear, context.fiscalYear)) score += 1;
  return score;
}

/**
 * Finds the best-matching active budget row for a context
 * { department, project, costCenter, fiscalYear }. Every non-empty
 * dimension of a row must match (or the context side is blank);
 * the most specific match wins. Returns null when no row matches.
 */
export function findBudgetRow(context, settings) {
  const s = resolveSettings(settings);
  const budgets = (s.budgetControl?.budgets || []).filter((row) => row.active !== false);
  const candidates = budgets.filter((row) =>
    dimMatches(row.department, context.department) &&
    dimMatches(row.project, context.project) &&
    dimMatches(row.costCenter, context.costCenter) &&
    dimMatches(row.fiscalYear, context.fiscalYear)
  );
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => specificity(b, context) - specificity(a, context));
  return candidates[0];
}

/** Fiscal year for a PO — its order date year, falling back to config. */
export function fiscalYearFor(dateStr = '', settings = {}) {
  const year = String(dateStr || '').slice(0, 4);
  if (/^\d{4}$/.test(year)) return year;
  return String(settings.budgetControl?.fiscalYear || new Date().getFullYear());
}

/* ------------------------------------------------------------------ */
/*  Utilisation (computed from real records)                          */
/* ------------------------------------------------------------------ */

function isCreditNote(invoice) {
  return String(invoice.invoiceType || '').toLowerCase().includes('credit note');
}

/**
 * Computes the budget utilisation for a context across ALL real PO and
 * invoice records that map to the same budget dimensions.
 *
 * Every PO in a commitment state that matches the context contributes
 * its total to `committed`. Vendor invoices linked to those POs
 * contribute to `actualInvoiced` (Credit Notes subtract) and their
 * paid amounts to `paid`.
 */
export function computeBudgetUtilization(context, settings) {
  const s = resolveSettings(settings);
  const row = findBudgetRow(context, s);
  if (!row) {
    return {
      matched: false,
      budget: 0,
      committed: 0,
      actualInvoiced: 0,
      paid: 0,
      openCommitment: 0,
      available: 0
    };
  }

  const inContext = (dimension, value) => {
    const configured = row[dimension];
    if (!configured) return true;
    return eq(configured, value);
  };

  const matchingOrders = ordersStore.all.filter((order) => {
    if (!COMMITMENT_STATES.includes(order.status)) return false;
    return (
      inContext('department', order.department) &&
      inContext('project', order.project) &&
      inContext('costCenter', order.costCenter) &&
      inContext('fiscalYear', fiscalYearFor(order.orderDate, s))
    );
  });

  const poNumbers = new Set(matchingOrders.map((order) => order.poNo));
  const matchingInvoices = invoicesStore.all.filter((invoice) => poNumbers.has(invoice.poNo));

  let committed = 0;
  let actualInvoiced = 0;
  let paid = 0;
  matchingOrders.forEach((order) => {
    committed += Number(order.amount) || 0;
  });
  matchingInvoices.forEach((invoice) => {
    const total = Number(invoice.total) || 0;
    actualInvoiced += isCreditNote(invoice) ? -Math.abs(total) : total;
    paid += Number(invoice.paidAmount) || 0;
  });

  const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;
  committed = round2(committed);
  actualInvoiced = round2(actualInvoiced);
  paid = round2(paid);
  const openCommitment = round2(Math.max(0, committed - Math.max(0, actualInvoiced)));
  const available = round2(Number(row.amount) - openCommitment - Math.max(0, actualInvoiced));

  return {
    matched: true,
    budget: Number(row.amount),
    committed,
    actualInvoiced,
    paid,
    openCommitment,
    available,
    row
  };
}

/**
 * Full budget check for a proposed purchase amount. Returns the exact
 * shortage and whether the configured controls block or allow an
 * exception. `enabled` is false when budget control is off or no
 * budget row covers the context — callers must never hardcode a
 * budget figure.
 */
export function checkBudget(context, { amount = 0 } = {}) {
  const settings = readSettings();
  const config = settings.budgetControl || {};
  const utilization = computeBudgetUtilization(context, settings);
  const proposed = Number(amount) || 0;

  if (!config.enabled || !utilization.matched) {
    return {
      enabled: false,
      ok: true,
      blocked: false,
      exceptionAllowed: false,
      shortage: 0,
      proposed,
      ...utilization
    };
  }

  const short = Math.round((proposed - utilization.available) * 100) / 100;
  const ok = short <= 0;
  const blocked = !ok && config.blockApprovalWhenExceeded === true;
  const exceptionAllowed = !ok && config.allowExceptionWorkflow === true;

  return {
    enabled: true,
    ok,
    blocked,
    exceptionAllowed,
    shortage: ok ? 0 : short,
    proposed,
    ...utilization
  };
}

/**
 * Guard used by PO create / submit / approve. Throws with the exact
 * shortage when the configured controls block the action; otherwise
 * returns the check result so the caller can flag an exception.
 */
export function assertBudgetAllowed(context, { amount = 0 } = {}) {
  const check = checkBudget(context, { amount });
  if (check.enabled && check.blocked) {
    throw new Error(
      `Budget control: ${context.docType || 'PO'} value ${(Number(amount) || 0).toFixed(2)} exceeds the available budget ` +
      `of ${check.available.toFixed(2)} for ${budgetLabel(check.row)} — shortage ${check.shortage.toFixed(2)}`
    );
  }
  return check;
}

/** Human-readable label for the matched budget row. */
export function budgetLabel(row) {
  if (!row) return 'the applicable budget';
  const parts = [row.department, row.project, row.costCenter, row.fiscalYear ? `FY ${row.fiscalYear}` : ''].filter(Boolean);
  return parts.length > 0 ? parts.join(' / ') : 'the applicable budget';
}

/** Whether a PO record carries an approved (or allowed) budget exception. */
export function hasBudgetException(record) {
  return Boolean(record?.budget?.exception);
}