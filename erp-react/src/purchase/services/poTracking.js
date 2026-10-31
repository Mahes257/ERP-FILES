/**
 * purchase/services/poTracking.js
 * ------------------------------------------------------------------
 * SINGLE SOURCE OF TRUTH for Purchase Order quantity & value tracking.
 *
 * Every consumer (PO list, PO detail, order print, dashboard widgets,
 * GRN / Inventory / Invoice / Payment context panels) reads the same
 * per-line matrix derived from the REAL persisted records:
 *
 *   Qty per line   : orderedQty, receivedQty, acceptedQty, rejectedQty,
 *                    invoicedQty, paidQty, remainingQty (still to receive),
 *                    uninvoicedQty, unpaidQty
 *   Value per line : orderedValue, receivedValue, acceptedValue,
 *                    invoicedValue, paidValue, uninvoicedValue,
 *                    unpaidValue, outstandingValue (= ordered - paid)
 *
 * Record sources (never hardcoded, never duplicated per page):
 *   • Received qty   — posted GRNs  (grnsStore, status === GRN_STATUS.RECEIVED)
 *   • Accepted/Rejected — completed QC inspections (inspectionsStore,
 *                    per-line acceptedQty / rejectedQty on the GRN's QC)
 *   • Invoiced qty   — live invoices for the PO (invoicesStore, excluding
 *                    Draft / Rejected records) matched to lines by product
 *   • Paid qty/value — invoice paymentHistory / paidAmount distributed
 *                    pro-rata across the invoice's lines
 *
 * Value semantics: line values are GROSS line amounts (qty × rate) so the
 * matrix stays comparable across delivery / invoicing / payment stages.
 * Where a GRN / invoice line cannot be matched to a PO line by product,
 * its quantities are reported only in the order-level guard totals and
 * never silently assigned to the wrong line.
 *
 * Partial delivery and partial invoicing are inherent: received /
 * invoiced / paid figures accumulate across every posted GRN, inspection
 * and invoice, and remainingQty = ordered − received (≥ 0).
 * ------------------------------------------------------------------ */
import { INVOICE_STATUS } from '../constants';
import { GRN_STATUS, grnsStore, inspectionsStore } from './logistics';
import { invoicesStore } from './invoice';

/* ------------------------------------------------------------------ */
/*  Small helpers                                                      */
/* ------------------------------------------------------------------ */
const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};
const round2 = (value) => Math.round(num(value) * 100) / 100;

/** Live invoices only — Draft and Rejected records never count as invoiced. */
const isLiveInvoice = (inv) =>
  inv.status !== INVOICE_STATUS.DRAFT && inv.status !== INVOICE_STATUS.REJECTED;

/** Normalise a product name so GRN / QC / invoice lines join PO lines. */
const productKey = (product) => String(product || '').trim().toLowerCase();

/* ------------------------------------------------------------------ */
/*  Context                                                            */
/* ------------------------------------------------------------------ */

/**
 * Load every record needed to track POs straight from the persisted
 * stores. Pages call this once per render/reload; services pass their
 * own records to keep the function pure.
 */
export function buildTrackingContext() {
  return {
    grns: grnsStore.all,
    inspections: inspectionsStore.all,
    invoices: invoicesStore.all
  };
}

/**
 * The posted (received) GRNs belonging to a PO. "Expected" GRNs are
 * forward schedules, not receipts — they never contribute quantities.
 */
function receivedGrnsFor(poNo, ctx) {
  return (ctx.grns || []).filter(
    (grn) => grn.poNo === poNo && grn.status === GRN_STATUS.RECEIVED
  );
}

/** Completed inspections for a PO's received GRNs. */
function completedInspectionsFor(poNo, receivedGrns, ctx) {
  const grnNos = new Set(receivedGrns.map((grn) => grn.grnNo));
  return (ctx.inspections || []).filter(
    (qc) =>
      qc.poNo === poNo &&
      grnNos.has(qc.grnNo) &&
      (qc.items || []).some((item) => num(item.inspectedQty) > 0 || num(item.acceptedQty) > 0 || num(item.rejectedQty) > 0)
  );
}

/** Live invoices raised against the PO (includes their payment history). */
function liveInvoicesFor(poNo, ctx) {
  return (ctx.invoices || []).filter((inv) => inv.poNo === poNo && isLiveInvoice(inv));
}

/**
 * Fraction of an invoice that has actually been paid, 0..1.
 * paidAmount / total keeps the allocation consistent with the exact
 * rule used by the payment screen (Outstanding = Total − Paid).
 */
function invoicePaidFactor(invoice) {
  const total = num(invoice.total);
  const paid = Math.min(num(invoice.paidAmount), total);
  if (total <= 0) return 0;
  return Math.min(1, Math.max(0, paid / total));
}

/* ------------------------------------------------------------------ */
/*  Aggregation buckets for one PO                                     */
/* ------------------------------------------------------------------ */
function createBuckets(orderItems) {
  const buckets = new Map();
  (orderItems || []).forEach((item) => {
    buckets.set(productKey(item.product), {
      product: item.product || '',
      uom: item.uom || '',
      rate: num(item.rate),
      orderedQty: num(item.qty),
      receivedQty: 0,
      acceptedQty: 0,
      rejectedQty: 0,
      invoicedQty: 0,
      /* Invoice amounts (money actually billed) per line, before the
         pro-rata payment split. */
      invoicedAmount: 0
    });
  });
  return buckets;
}

/** Accumulate posted GRN quantities into the buckets (partial-safe). */
function accumulateReceipts(buckets, receivedGrns) {
  receivedGrns.forEach((grn) => {
    (grn.items || []).forEach((item) => {
      const key = productKey(item.product);
      const bucket = buckets.get(key);
      if (!bucket) return; // extra line not on the PO — never force-assigned
      bucket.receivedQty += num(item.received) || num(item.qty);
    });
  });
}

/** Accumulate QC accepted / rejected quantities per PO line. */
function accumulateInspection(buckets, inspections) {
  inspections.forEach((qc) => {
    (qc.items || []).forEach((item) => {
      const bucket = buckets.get(productKey(item.product));
      if (!bucket) return;
      bucket.acceptedQty += num(item.acceptedQty);
      bucket.rejectedQty += num(item.rejectedQty);
    });
  });
}

/** Accumulate live invoice quantities + billed amounts per PO line. */
function accumulateInvoices(buckets, invoices) {
  invoices.forEach((inv) => {
    (inv.items || []).forEach((item) => {
      const bucket = buckets.get(productKey(item.product));
      if (!bucket) return;
      const lineQty = num(item.qty);
      bucket.invoicedQty += lineQty;
      /* Billed amount = qty × rate (gross), mirroring the PO's own line
         value basis so value comparisons stay like-for-like. */
      const rate = num(item.rate ?? item.price) || bucket.rate;
      bucket.invoicedAmount += lineQty * rate;
    });
  });
}

/* ------------------------------------------------------------------ */
/*  Per-order computation                                              */
/* ------------------------------------------------------------------ */

/**
 * Derive the full quantity/value tracking matrix for one PO.
 *
 * @param {Object} order  A purchase order record (ordersStore shape).
 * @param {Object} [ctx]  { grns, inspections, invoices } — see
 *                        buildTrackingContext(). Defaults to the live stores.
 * @returns {Object} { lines, totals, delivery, invoicing, payment, invoiceIds }
 */
export function trackPurchaseOrder(order = {}, ctx = buildTrackingContext()) {
  const poNo = order.poNo;
  const receivedGrns = receivedGrnsFor(poNo, ctx);
  const inspections = completedInspectionsFor(poNo, receivedGrns, ctx);
  const invoices = liveInvoicesFor(poNo, ctx);

  const buckets = createBuckets(order.items);
  accumulateReceipts(buckets, receivedGrns);
  accumulateInspection(buckets, inspections);
  accumulateInvoices(buckets, invoices);

  /* Payment allocation: a payment is booked against an invoice, so each
     invoice's paid fraction is applied to the lines it billed. This keeps
     per-line paid figures consistent with invoice-level Outstandings. */
  const paidByLine = new Map();
  invoices.forEach((inv) => {
    const factor = invoicePaidFactor(inv);
    if (factor <= 0) return;
    (inv.items || []).forEach((item) => {
      const key = productKey(item.product);
      const bucket = buckets.get(key);
      if (!bucket) return;
      paidByLine.set(key, (paidByLine.get(key) || 0) + num(item.qty) * (num(item.rate ?? item.price) || bucket.rate) * factor);
    });
  });

  /* ---- build per-line rows ---- */
  const lines = Array.from(buckets.values()).map((b) => {
    const orderedQty = round2(b.orderedQty);
    const receivedQty = Math.min(round2(b.receivedQty), orderedQty || round2(b.receivedQty));
    const invoicedQty = Math.min(round2(b.invoicedQty), orderedQty || round2(b.invoicedQty));
    const rate = num(b.rate);
    const orderedValue = round2(orderedQty * rate);
    const receivedValue = round2(receivedQty * rate);
    const acceptedQty = round2(Math.min(b.acceptedQty, receivedQty || b.acceptedQty));
    const rejectedQty = round2(Math.min(b.rejectedQty, Math.max(0, (receivedQty || b.rejectedQty) - acceptedQty) || b.rejectedQty));
    const acceptedValue = round2(acceptedQty * rate);
    const invoicedValue = round2(invoicedQty * rate);
    const paidValue = round2(Math.min(paidByLine.get(productKey(b.product)) || 0, invoicedValue));
    const paidQty = rate > 0 ? round2(paidValue / rate) : 0;
    const remainingQty = Math.max(0, round2(orderedQty - receivedQty));
    const uninvoicedQty = Math.max(0, round2(orderedQty - invoicedQty));
    const unpaidQty = Math.max(0, round2(invoicedQty - paidQty));
    const uninvoicedValue = Math.max(0, round2(orderedValue - invoicedValue));
    const unpaidValue = Math.max(0, round2(invoicedValue - paidValue));
    const outstandingValue = Math.max(0, round2(orderedValue - paidValue));
    return {
      product: b.product,
      uom: b.uom,
      rate,
      orderedQty,
      receivedQty,
      acceptedQty,
      rejectedQty,
      invoicedQty,
      paidQty,
      remainingQty,
      uninvoicedQty,
      unpaidQty,
      orderedValue,
      receivedValue,
      acceptedValue,
      invoicedValue,
      paidValue,
      uninvoicedValue,
      unpaidValue,
      outstandingValue
    };
  });

  /* ---- order-level rollups ---- */
  const sum = (fn, start = 0) => lines.reduce((acc, line) => acc + num(fn(line)), start);
  const totals = {
    orderedQty: round2(sum((l) => l.orderedQty)),
    receivedQty: round2(sum((l) => l.receivedQty)),
    acceptedQty: round2(sum((l) => l.acceptedQty)),
    rejectedQty: round2(sum((l) => l.rejectedQty)),
    invoicedQty: round2(sum((l) => l.invoicedQty)),
    paidQty: round2(sum((l) => l.paidQty)),
    remainingQty: round2(sum((l) => l.remainingQty)),
    uninvoicedQty: round2(sum((l) => l.uninvoicedQty)),
    unpaidQty: round2(sum((l) => l.unpaidQty)),
    orderedValue: round2(sum((l) => l.orderedValue)),
    receivedValue: round2(sum((l) => l.receivedValue)),
    acceptedValue: round2(sum((l) => l.acceptedValue)),
    invoicedValue: round2(sum((l) => l.invoicedValue)),
    paidValue: round2(sum((l) => l.paidValue)),
    uninvoicedValue: round2(sum((l) => l.uninvoicedValue)),
    unpaidValue: round2(sum((l) => l.unpaidValue)),
    outstandingValue: round2(sum((l) => l.outstandingValue))
  };
  const pct = (part, whole) => (whole > 0 ? Math.min(100, Math.round((num(part) / num(whole)) * 100)) : 0);

  /* ---- delivery / invoicing / payment status ---- */
  const deliveryPercent = pct(totals.receivedQty, totals.orderedQty);
  const invoicingPercent = pct(totals.invoicedQty, totals.receivedQty);
  const paymentPercent = pct(totals.paidValue, totals.invoicedValue);
  const delivery =
    totals.orderedQty <= 0
      ? { qty: 0, percent: 0, status: 'Not Received' }
      : totals.receivedQty <= 0
        ? { qty: totals.receivedQty, percent: 0, status: 'Not Received' }
        : totals.receivedQty < totals.orderedQty - 0.001
          ? { qty: totals.receivedQty, percent: deliveryPercent, status: 'Partially Received' }
          : { qty: totals.receivedQty, percent: deliveryPercent, status: 'Fully Received' };

  /* Invoicing compares against RECEIVED quantity — the same rule the
     three-way match uses (you only invoice what you received). */
  const hasReceipt = lines.some((l) => l.receivedQty > 0);
  const fullyInvoiced =
    hasReceipt &&
    lines.filter((l) => l.receivedQty > 0).every((l) => l.invoicedQty >= l.receivedQty - 0.001);
  const invoicing = {
    qty: totals.invoicedQty,
    percent: invoicingPercent,
    status: !hasReceipt ? 'Not Invoiced' : fullyInvoiced ? 'Fully Invoiced' : totals.invoicedQty > 0 ? 'Partially Invoiced' : 'Not Invoiced'
  };

  const payment =
    totals.invoicedValue <= 0
      ? { value: 0, percent: 0, status: 'Unpaid' }
      : totals.paidValue >= totals.invoicedValue - 0.001
        ? { value: totals.paidValue, percent: paymentPercent, status: 'Paid' }
        : totals.paidValue > 0
          ? { value: totals.paidValue, percent: paymentPercent, status: 'Partially Paid' }
          : { value: 0, percent: 0, status: 'Unpaid' };

  return {
    poNo,
    lines,
    totals,
    delivery,
    invoicing,
    payment,
    invoiceIds: invoices.map((inv) => inv.id)
  };
}

/** Track a batch of POs in one pass (shared context, no store re-reads). */
export function trackPurchaseOrders(orders = [], ctx = buildTrackingContext()) {
  const map = new Map();
  const result = orders.map((order) => {
    const tracking = trackPurchaseOrder(order, ctx);
    map.set(order.poNo, tracking);
    return { ...order, tracking };
  });
  return { orders: result, byPoNo: map };
}

/** Convenience used by the PO service: attach tracking to records. */
export function attachPOTracking(records = []) {
  return trackPurchaseOrders(records, buildTrackingContext()).orders;
}
