/**
 * purchase/services/matchingEngine.js
 * ------------------------------------------------------------------
 * ERP-grade Three-Way Matching engine: Purchase Order ↔ Goods Receipt
 * (GRN) ↔ Vendor Invoice.
 *
 * Compared PER LINE for every invoice line:
 *   · quantity — invoice qty vs goods actually received (GRN)
 *   · rate     — invoice unit rate vs PO rate
 *   · tax      — invoice GST % vs PO GST %
 *   · value    — invoice line value (qty × rate) vs PO line value
 *
 * All comparisons honour CONFIGURABLE tolerances (Settings →
 * 3-Way Matching): quantityPct / ratePct / taxPct / valuePct, each
 * expressed as a percentage. Every line resolves to one of:
 *   · Matched           — all fields within tolerance
 *   · Partially Matched — quantity received exceeds the invoiced
 *                         quantity (legitimate partial invoicing) or
 *                         fields agree but not all of the receipt is
 *                         covered
 *   · Mismatch          — a field is out of tolerance; the exact
 *                         reason (with expected vs actual values) is
 *                         reported per line
 *
 * The overall match status is:
 *   · Exception         — invoice does not reference a valid PO
 *   · Pending Match     — no posted goods receipt for the PO yet
 *   · Matched           — every line matched and header checks pass
 *   · Partially Matched — no hard mismatches but not every line is
 *                         fully matched
 *   · Mismatch          — at least one hard mismatch (line or header)
 *
 * Invoice approval is gated on the configured rules: when
 * `requireMatchToApprove` is enabled, only a fully MATCHED invoice
 * may be approved for payment; Partially Matched / Mismatch /
 * Exception / Pending all block approval.
 *
 * The engine reads the REAL PO / GRN stores (never hardcoded data).
 * ------------------------------------------------------------------ */
import { MATCH_STATUS } from '../constants';
import { ordersStore } from './purchaseOrder';
import { GRN_STATUS, grnsStore } from './logistics';
import { readSettings } from './settings';

export { matchingConfigSeed } from './configSeeds';

/** Reads the persisted matching configuration with safe defaults. */
export function getMatchingConfig(settings) {
  const s = settings || readSettings() || {};
  const cfg = s.matching || {};
  const tol = cfg.tolerances || {};
  return {
    enabled: cfg.enabled !== false,
    requireMatchToApprove: cfg.requireMatchToApprove !== false,
    allowOverride: cfg.allowOverride !== false,
    tolerances: {
      quantityPct: Number(tol.quantityPct) || 0,
      ratePct: Number(tol.ratePct) || 0,
      taxPct: Number(tol.taxPct) || 0,
      valuePct: Number.isFinite(Number(tol.valuePct)) ? Number(tol.valuePct) : 2
    }
  };
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

function withinTolerance(actual, expected, pct) {
  const base = Math.abs(expected);
  if (base === 0) return Math.abs(actual) <= 0.001;
  return Math.abs(actual - expected) / base <= (Number(pct) || 0) / 100;
}

/** Per-line statuses (mirrors MATCH_STATUS vocabulary at line level). */
export const LINE_STATUS = {
  MATCHED: 'Matched',
  PARTIAL: 'Partially Matched',
  MISMATCH: 'Mismatch'
};

/* ------------------------------------------------------------------ */
/*  Line comparison                                                   */
/* ------------------------------------------------------------------ */

/**
 * Compares one invoice line against the PO line and the goods
 * received for the same product. Returns the line status plus the
 * exact reasons for any mismatch.
 */
export function matchLine(line, poLine, receivedQty, tolerances) {
  const product = String(line.product || '').trim() || 'Item';
  const invQty = Number(line.qty) || 0;
  const invRate = Number(line.rate ?? line.price) || 0;
  const invGst = Number(line.gst ?? line.gstRate) || 0;
  const poQty = Number(poLine?.qty) || 0;
  const poRate = Number(poLine?.rate) || 0;
  const poGst = Number(poLine?.gstRate) || 0;
  const invValue = round2(invQty * invRate);
  const poValue = round2(poQty * poRate);

  /* `reasons` carries only HARD mismatch reasons (shown at header
     level); partial-quantity notes live in `notes` and in the line
     status so legitimate partial invoicing never blocks a match. */
  const reasons = [];
  const notes = [];

  /* ── Quantity: invoice vs goods RECEIVED (GRN) ── */
  let qtyStatus = 'ok';
  if (receivedQty <= 0 && invQty > 0) {
    qtyStatus = 'mismatch';
    reasons.push(`Invoice quantity for ${product} (${invQty}) exceeds the GRN quantity (0)`);
  } else if (!withinTolerance(invQty, receivedQty, tolerances.quantityPct)) {
    if (invQty > receivedQty) {
      qtyStatus = 'mismatch';
      reasons.push(`Invoice quantity for ${product} (${invQty}) exceeds the GRN quantity (${receivedQty})`);
    } else {
      qtyStatus = 'partial';
      notes.push(`Invoice quantity for ${product} (${invQty}) is less than the received quantity (${receivedQty}) — partial invoicing`);
    }
  }

  /* ── Rate: invoice unit price vs PO rate ── */
  if (poRate > 0 && invRate > 0 && !withinTolerance(invRate, poRate, tolerances.ratePct)) {
    reasons.push(`Invoice unit price for ${product} (${invRate.toFixed(2)}) differs from the PO rate (${poRate.toFixed(2)})`);
  }

  /* ── Tax: invoice GST % vs PO GST % ── */
  if (poGst > 0 && invGst > 0 && !withinTolerance(invGst, poGst, tolerances.taxPct)) {
    reasons.push(`Invoice tax for ${product} (${invGst}) differs from the PO tax (${poGst}%)`);
  }

  /* ── Value: invoice line value vs PO line value ──
     Only meaningful when the invoiced quantity covers the PO
     quantity: a partial invoice legitimately invoices a smaller line
     value, so the value check must not flag it (the quantity
     comparison already reported the partial coverage). */
  const qtyCoversPo = withinTolerance(invQty, poQty, tolerances.quantityPct);
  if (poValue > 0 && qtyCoversPo && !withinTolerance(invValue, poValue, tolerances.valuePct)) {
    reasons.push(`Invoice line value for ${product} (${invValue.toFixed(2)}) differs from the PO line value (${poValue.toFixed(2)})`);
  }

  const hardMismatch = reasons.length > 0;
  let status;
  if (hardMismatch) status = LINE_STATUS.MISMATCH;
  else if (qtyStatus === 'partial' || (invQty > 0 && invQty < receivedQty)) status = LINE_STATUS.PARTIAL;
  else if (invQty === 0 && receivedQty === 0 && poQty === 0) status = LINE_STATUS.PARTIAL;
  else status = LINE_STATUS.MATCHED;

  return {
    product,
    poQty,
    grnQty: receivedQty,
    invoiceQty: invQty,
    poRate,
    invoiceRate: invRate,
    poGst,
    invoiceGst: invGst,
    poValue,
    invoiceValue: invValue,
    status,
    matched: status === LINE_STATUS.MATCHED,
    reasons,
    notes
  };
}

/* ------------------------------------------------------------------ */
/*  Full match computation                                            */
/* ------------------------------------------------------------------ */

/**
 * Computes the three-way match for an invoice using the persisted
 * matching configuration (or an explicitly supplied config in tests).
 * Result shape is backward-compatible with the legacy engine:
 *   { status, reasons, details, vendorMatched, config }
 */
export function computeThreeWayMatch(invoice, configOverride) {
  const config = configOverride || getMatchingConfig();
  const order = ordersStore.all.find((entry) => entry.poNo === invoice.poNo);

  /* Exception — no valid PO reference. */
  if (!order) {
    return {
      status: MATCH_STATUS.EXCEPTION,
      reasons: ['Invoice does not reference a valid purchase order'],
      details: [],
      vendorMatched: true,
      config
    };
  }

  const receivedGrns = grnsStore.all.filter(
    (grn) => grn.poNo === invoice.poNo && grn.status !== GRN_STATUS.EXPECTED
  );
  const grnQtyByProduct = {};
  receivedGrns.forEach((grn) => {
    (grn.items || []).forEach((item) => {
      const key = String(item.product || '').trim().toLowerCase();
      grnQtyByProduct[key] = (grnQtyByProduct[key] || 0) + (Number(item.received) || 0);
    });
  });
  const totalReceived = Object.values(grnQtyByProduct).reduce((sum, qty) => sum + qty, 0);

  /* Pending — goods not yet received. */
  if (receivedGrns.length === 0 || totalReceived <= 0) {
    return {
      status: MATCH_STATUS.PENDING,
      reasons: [`No goods receipt posted for ${invoice.poNo}`],
      details: [],
      vendorMatched: true,
      config
    };
  }

  const reasons = [];

  /* ── Header check: vendor must match the PO ── */
  const poVendor = String(order.vendor || '').trim().toLowerCase();
  const invVendor = String(invoice.vendor || '').trim().toLowerCase();
  const vendorMatched = !invVendor || !poVendor || invVendor === poVendor;
  if (!vendorMatched) {
    reasons.push(`Invoice vendor ${invoice.vendor} does not match the PO vendor ${order.vendor}`);
  }

  /* ── Header check: total value within configured tolerance ──
     Only OVER-invoicing beyond the tolerance is a hard mismatch;
     under-invoicing is legitimate partial invoicing and is reported
     at line level (Partially Matched). */
  const invoiceTotal = Number(invoice.total) || 0;
  const orderTotal = Number(order.amount) || 0;
  if (orderTotal > 0 && invoiceTotal > orderTotal && !withinTolerance(invoiceTotal, orderTotal, config.tolerances.valuePct)) {
    reasons.push(
      `Invoice total ${invoiceTotal.toFixed(2)} exceeds PO value ${orderTotal.toFixed(2)} ` +
      `(tolerance ±${config.tolerances.valuePct}%)`
    );
  }

  /* ── Per-line comparison ── */
  const details = (invoice.items || []).map((line) => {
    const key = String(line.product || '').trim().toLowerCase();
    const poLine = (order.items || []).find(
      (item) => String(item.product || '').trim().toLowerCase() === key
    );
    return matchLine(line, poLine, grnQtyByProduct[key] || 0, config.tolerances);
  });

  /* Aggregate hard line reasons at header level so the UI and callers
     see the complete, exact reason list (legacy contract). */
  details.forEach((detail) => {
    (detail.reasons || []).forEach((reason) => reasons.push(reason));
  });

  /* Invoice lines with NO counterpart on the PO are mismatches too. */
  (invoice.items || []).forEach((line) => {
    const key = String(line.product || '').trim().toLowerCase();
    const poLine = (order.items || []).find(
      (item) => String(item.product || '').trim().toLowerCase() === key
    );
    if (!poLine && (Number(line.qty) || 0) > 0) {
      reasons.push(`Invoice line ${String(line.product || '').trim() || 'Item'} is not present on the purchase order`);
    }
  });
  /* Deduplicate reasons (a line issue may repeat per line). */
  const uniqueReasons = [...new Set(reasons)];
  reasons.length = 0;
  reasons.push(...uniqueReasons);

  /* ── Overall status ──
     · any hard line mismatch or header issue  → Mismatch
     · lines all within tolerance but some only partially cover the
       received quantities                              → Partially Matched
     · header-only invoice (no lines)                   → value check
     · otherwise                                        → Matched       */
  const lineMismatches = details.filter((d) => d.status === LINE_STATUS.MISMATCH);
  const linePartials = details.filter((d) => d.status === LINE_STATUS.PARTIAL);
  let status;
  if (lineMismatches.length > 0 || reasons.length > 0) {
    status = MATCH_STATUS.MISMATCH;
  } else if (details.length > 0 && linePartials.length > 0) {
    status = MATCH_STATUS.PARTIAL;
  } else if (details.length === 0) {
    /* Header-level invoice without line items: rely on the value check. */
    status = MATCH_STATUS.MATCHED;
  } else {
    status = MATCH_STATUS.MATCHED;
  }

  return {
    status,
    reasons,
    details,
    vendorMatched,
    config
  };
}

/**
 * Whether invoice approval is permitted given a computed match result
 * and the persisted configuration. When matching is required, only a
 * fully MATCHED result passes; otherwise Partially Matched is also
 * admissible (mismatch / exception / pending always block).
 */
export function matchAllowsApproval(matchResult, configOverride) {
  const config = configOverride || getMatchingConfig();
  if (!config.enabled) return { allowed: true, reason: '' };
  if (matchResult.status === MATCH_STATUS.MATCHED) return { allowed: true, reason: '' };
  if (!config.requireMatchToApprove && matchResult.status === MATCH_STATUS.PARTIAL) {
    return { allowed: true, reason: 'Partially matched — allowed because matching rules do not require a full match for approval' };
  }
  return {
    allowed: false,
    reason: `three-way match is ${String(matchResult.status).toLowerCase()}: ${(matchResult.reasons || []).join('; ')}`
  };
}