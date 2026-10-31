/**
 * purchase/utils/supplierPerformance.js
 * ------------------------------------------------------------------
 * Supplier performance engine — computes delivery performance, quality
 * / rejection, price variance, response time and purchase volume for a
 * supplier EXCLUSIVELY from real transaction records (RFQ →
 * Quotation → PO → GRN / QC → Invoice → Payment). No manually entered
 * scores: a supplier only has performance once real documents exist,
 * and every number is derived from the documents themselves.
 *
 * Pure functions — the caller collects the transaction records (see
 * services/supplierPerformance.js) and this module computes metrics.
 * Kept free of service imports so the scoring rules can be unit-tested
 * with small deterministic fixtures.
 * ------------------------------------------------------------------
 */
import { round2 } from './purchase';
import { normalizeVendorText } from './supplierIdentity';

/** Statuses that never represent real purchasing activity. */
const VOID_ORDER_STATUSES = new Set(['Draft', 'Pending Approval', 'Cancelled']);

/** Date-only ms index — safe for 'YYYY-MM-DD' and ISO strings. */
function dayIndex(value) {
  const datePart = String(value || '').slice(0, 10);
  const ms = Date.parse(`${datePart}T00:00:00Z`);
  return Number.isFinite(ms) ? Math.floor(ms / 86400000) : null;
}

function daysBetween(from, to) {
  const a = dayIndex(from);
  const b = dayIndex(to);
  if (a === null || b === null) return null;
  return b - a;
}

const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/** Strips punctuation/case so line descriptions line up across docs. */
const productKey = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

function vendorInvited(rfq, vendorName) {
  const want = normalizeVendorText(vendorName);
  if (!want) return false;
  return (rfq.vendors || []).some((name) => normalizeVendorText(name) === want);
}

function sameVendor(record, vendorName) {
  const got = normalizeVendorText(record?.vendor || record?.vendorName || '');
  const want = normalizeVendorText(vendorName);
  if (!got || !want) return false;
  if (got === want) return true;
  return (
    got.includes(want) ||
    want.includes(got)
  );
}

/** Orders that represent real committed spend (approved & not voided). */
export function committedOrders(orders = []) {
  return orders.filter((order) => {
    if (VOID_ORDER_STATUSES.has(String(order.status || ''))) return false;
    if (String(order.approvalStatus || '') === 'Approved') return true;
    /* Legacy records without an explicit approvalStatus that reached a
       released-stage status count as committed. */
    return [
      'Approved', 'Released', 'Supplier Acknowledged', 'In Progress',
      'Partially Delivered', 'Completed', 'Closed'
    ].includes(String(order.status || ''));
  });
}

/** Total value of an order — stored `amount` wins, computed fallback. */
export function orderValue(order) {
  const stored = num(order.amount);
  if (stored > 0) return round2(stored);
  const lines = Array.isArray(order.items) ? order.items : [];
  const taxable = lines.reduce((sum, line) => sum + num(line.qty) * num(line.rate ?? line.expectedRate), 0);
  const gst = lines.reduce(
    (sum, line) => sum + num(line.qty) * num(line.rate ?? line.expectedRate) * (num(line.gstRate) / 100),
    0
  );
  return round2(taxable + gst + num(order.charges) - (num(order.discount) / 100) * taxable);
}

/** Total ordered quantity of a PO. */
function orderQuantity(order) {
  return (order.items || []).reduce((sum, line) => sum + num(line.qty), 0);
}

/** Uniform empty shape — every field present so consumers never branch
 *  on missing keys; `hasData` stays false until real documents exist. */
export function emptyPerformance() {
  return {
    hasData: false,
    source: 'none',
    purchaseVolume: {
      poCount: 0,
      poValue: 0,
      openPoCount: 0,
      openPoValue: 0,
      grnCount: 0,
      receivedValue: 0,
      invoiceCount: 0,
      invoiceValue: 0,
      paidValue: 0
    },
    delivery: {
      total: 0,
      onTime: 0,
      late: 0,
      pending: 0,
      onTimeRate: null,
      avgLateDays: 0
    },
    quality: {
      inspections: 0,
      inspectedQty: 0,
      acceptedQty: 0,
      rejectedQty: 0,
      defects: 0,
      failed: 0,
      acceptedRate: null,
      rejectionRate: null
    },
    priceVariance: {
      comparedOrders: 0,
      comparedLines: 0,
      avgVariancePct: null
    },
    response: {
      invited: 0,
      responded: 0,
      avgResponseDays: null,
      onTimeResponses: 0,
      lateResponses: 0
    },
    compositeScore: null,
    rating: null
  };
}

/**
 * Computes a supplier's performance from its real transaction records.
 *
 * @param {Object} args
 * @param {string} args.vendorId   Supplier master id (V-0001)
 * @param {string} args.vendorName Supplier master name
 * @param {Array}  args.rfqs       RFQ records inviting the supplier
 * @param {Array}  args.quotations Quotation records from the supplier
 * @param {Array}  args.orders     PO records for the supplier
 * @param {Array}  args.grns       GRN records for the supplier
 * @param {Array}  args.inspections Quality inspection records
 * @param {Array}  args.shipments  Shipment records (delivery fallback)
 * @param {Array}  args.invoices   Purchase invoices from the supplier
 */
export function computeSupplierPerformance({
  vendorName = '',
  rfqs = [],
  quotations = [],
  orders = [],
  grns = [],
  inspections = [],
  shipments = [],
  invoices = []
} = {}) {
  const metrics = emptyPerformance();
  metrics.source = 'transactions';

  /* ── RFQs this supplier was invited to ── */
  const invitedRfqs = rfqs.filter((rfq) => vendorInvited(rfq, vendorName));

  /* ── Quotations submitted by this supplier ── */
  const vendorQuotes = quotations.filter((quote) => sameVendor(quote, vendorName));
  const respondedQuotes = vendorQuotes.filter((quote) => {
    const submitted = String(quote.submittedOn || '').slice(0, 10);
    return submitted && !['', 'null', 'undefined'].includes(submitted);
  });

  /* ── Committed purchase orders ── */
  const supplierOrders = orders.filter((order) => sameVendor(order, vendorName));
  const committed = committedOrders(supplierOrders);

  /* ── GRNs / QC / shipments / invoices ── */
  const supplierGrns = grns.filter((grn) => sameVendor(grn, vendorName));
  const postedGrns = supplierGrns.filter((grn) => grn.status !== 'Expected');
  const supplierInspections = inspections.filter((inspection) => sameVendor(inspection, vendorName));
  const supplierInvoices = invoices.filter((invoice) => sameVendor(invoice, vendorName));

  /* ================= PURCHASE VOLUME ================= */
  const volume = metrics.purchaseVolume;
  volume.poCount = committed.length;
  volume.poValue = round2(committed.reduce((sum, order) => sum + orderValue(order), 0));
  const openOrders = committed.filter(
    (order) => !['Completed', 'Closed'].includes(String(order.status || ''))
  );
  volume.openPoCount = openOrders.length;
  volume.openPoValue = round2(openOrders.reduce((sum, order) => sum + orderValue(order), 0));

  volume.grnCount = postedGrns.length;
  /* Received value = the committed PO value × the share of its ordered
     quantity actually received (per PO, capped at 100%). */
  const receivedByPo = {};
  postedGrns.forEach((grn) => {
    (grn.items || []).forEach((line) => {
      const qty = num(line.received);
      if (qty <= 0) return;
      const key = grn.poNo || 'no-po';
      receivedByPo[key] = (receivedByPo[key] || 0) + qty;
    });
  });
  committed.forEach((order) => {
    const totalQty = orderQuantity(order);
    const received = num(receivedByPo[order.poNo]);
    if (totalQty > 0 && received > 0) {
      volume.receivedValue = round2(volume.receivedValue + orderValue(order) * Math.min(1, received / totalQty));
    }
  });

  const liveInvoices = supplierInvoices.filter(
    (invoice) => !['Draft', 'Rejected'].includes(String(invoice.status || ''))
  );
  volume.invoiceCount = liveInvoices.length;
  volume.invoiceValue = round2(liveInvoices.reduce((sum, invoice) => sum + num(invoice.total), 0));
  volume.paidValue = round2(liveInvoices.reduce((sum, invoice) => sum + num(invoice.paidAmount), 0));

  /* ================= DELIVERY PERFORMANCE ================= */
  /* Receipts pool: posted GRNs with a received date (the PO's promised
     date is the benchmark). Shipments add a receipt only when the PO
     has no GRN receipt (no double counting). */
  const receipts = [];
  postedGrns.forEach((grn) => {
    if (grn.receivedOn || grn.receivedAt) {
      receipts.push({ poNo: grn.poNo, receivedOn: grn.receivedOn || grn.receivedAt, via: 'grn' });
    }
  });
  const grnPoNos = new Set(receipts.map((entry) => entry.poNo));
  shipments
    .filter((shipment) => sameVendor(shipment, vendorName))
    .forEach((shipment) => {
      const delivered = String(shipment.status || '') === 'Delivered';
      if (delivered && (shipment.receivedOn || shipment.deliveredOn) && !grnPoNos.has(shipment.poNo)) {
        receipts.push({ poNo: shipment.poNo, receivedOn: shipment.receivedOn || shipment.deliveredOn, via: 'shipment' });
      }
    });

  const poByNo = new Map(supplierOrders.map((order) => [order.poNo, order]));
  const delivery = metrics.delivery;
  let lateDaysTotal = 0;
  receipts.forEach((receipt) => {
    const order = poByNo.get(receipt.poNo);
    if (!order) return;
    const promised = dayIndex(order.expectedDate);
    const actual = dayIndex(receipt.receivedOn);
    if (promised === null || actual === null) return;
    delivery.total += 1;
    if (actual <= promised) {
      delivery.onTime += 1;
    } else {
      delivery.late += 1;
      lateDaysTotal += actual - promised;
    }
  });
  /* Orders past their promised date with no receipt at all are late. */
  const today = dayIndex(new Date().toISOString());
  const receivedOrderNos = new Set(receipts.map((entry) => entry.poNo));
  committed.forEach((order) => {
    const promised = dayIndex(order.expectedDate);
    if (promised !== null && today !== null && promised < today && !receivedOrderNos.has(order.poNo)) {
      const completed = ['Completed', 'Closed'].includes(String(order.status || ''));
      if (!completed) {
        delivery.pending += 1;
      }
    }
  });
  if (delivery.total > 0) {
    delivery.onTimeRate = round2((delivery.onTime / delivery.total) * 100);
    delivery.avgLateDays = delivery.late > 0 ? Math.round(lateDaysTotal / delivery.late) : 0;
  }

  /* ================= QUALITY / REJECTION ================= */
  const quality = metrics.quality;
  quality.inspections = supplierInspections.length;
  let decidedCount = 0;
  let acceptedByCount = 0;
  let qtyBased = false;
  supplierInspections.forEach((inspection) => {
    const lines = Array.isArray(inspection.items) ? inspection.items : [];
    const hasQty = lines.some(
      (line) => num(line.inspectedQty) > 0 || num(line.rejectedQty) > 0 || num(line.acceptedQty) > 0
    );
    if (hasQty) {
      qtyBased = true;
      lines.forEach((line) => {
        const inspected = num(line.inspectedQty);
        const accepted = num(line.acceptedQty);
        const rejected = num(line.rejectedQty);
        quality.inspectedQty += inspected;
        quality.acceptedQty += accepted;
        quality.rejectedQty += rejected;
      });
    }
    if (['Passed', 'Failed', 'Partially Accepted'].includes(String(inspection.status || ''))) {
      decidedCount += 1;
      if (['Passed', 'Partially Accepted'].includes(String(inspection.status || ''))) {
        acceptedByCount += 1;
      } else {
        quality.failed += 1;
      }
    }
    quality.defects += num(inspection.defects);
  });
  /* When inspections carry per-item quantities, quality = accepted /
     (accepted + rejected). Inspection-status-only records fall back to
     a passed / decided ratio. */
  const inspectedTotal = quality.acceptedQty + quality.rejectedQty;
  if (qtyBased && inspectedTotal > 0) {
    quality.acceptedRate = round2((quality.acceptedQty / inspectedTotal) * 100);
  } else if (decidedCount > 0) {
    quality.acceptedRate = round2((acceptedByCount / decidedCount) * 100);
  }
  if (quality.acceptedRate !== null) {
    quality.rejectionRate = round2(100 - quality.acceptedRate);
  }

  /* ================= PRICE VARIANCE ================= */
  const price = metrics.priceVariance;
  /* Baseline unit rates: accepted/received quotation first, then the
     originating RFQ's expected rates. */
  const baselineForOrder = (order) => {
    const quote =
      vendorQuotes.find((q) => q.quotationNo === order.quotationNo || q.id === order.quotationNo) ||
      vendorQuotes.find((q) => q.rfqNo && order.rfqNo && q.rfqNo === order.rfqNo) ||
      null;
    if (quote && Array.isArray(quote.items) && quote.items.length > 0) {
      const rates = {};
      quote.items.forEach((line) => {
        const key = productKey(line.product);
        if (key) rates[key] = num(line.rate);
      });
      return { source: 'quotation', rates, reference: quote.quotationNo || quote.id };
    }
    const rfq = rfqs.find((entry) => entry.rfqNo && entry.rfqNo === order.rfqNo);
    if (rfq && Array.isArray(rfq.items) && rfq.items.length > 0) {
      const rates = {};
      rfq.items.forEach((line) => {
        const key = productKey(line.product);
        if (key) rates[key] = num(line.rate ?? line.expectedRate);
      });
      return { source: 'rfq', rates, reference: rfq.rfqNo };
    }
    return null;
  };

  let weightedVariance = 0;
  let comparedLines = 0;
  committed.forEach((order) => {
    const baseline = baselineForOrder(order);
    if (!baseline) return;
    const rates = baseline.rates;
    let linesCompared = 0;
    let lineVarianceSum = 0;
    let lineQtySum = 0;
    (order.items || []).forEach((line) => {
      const key = productKey(line.product);
      const baseRate = rates[key];
      const actualRate = num(line.rate ?? line.expectedRate);
      if (!key || !(baseRate > 0) || !(actualRate > 0)) return;
      const variance = ((actualRate - baseRate) / baseRate) * 100;
      const qty = num(line.qty) || 1;
      lineVarianceSum += variance * qty;
      lineQtySum += qty;
      linesCompared += 1;
    });
    if (linesCompared > 0) {
      comparedLines += linesCompared;
      weightedVariance += lineVarianceSum / lineQtySum;
      price.comparedOrders += 1;
    }
  });
  if (comparedLines > 0) {
    price.comparedLines = comparedLines;
    price.avgVariancePct = round2(weightedVariance / price.comparedOrders);
  }

  /* ================= RESPONSE TIME ================= */
  const response = metrics.response;
  const sentRfqs = invitedRfqs.filter((rfq) => String(rfq.sentAt || '').length > 0);
  response.invited = sentRfqs.length;
  let responseDayTotal = 0;
  sentRfqs.forEach((rfq) => {
    const quote = respondedQuotes.find((q) => q.rfqNo === rfq.rfqNo);
    if (!quote) return;
    const delay = daysBetween(rfq.sentAt, quote.submittedOn);
    if (delay === null) return;
    response.responded += 1;
    responseDayTotal += delay;
    const onTime =
      !rfq.dueDate || daysBetween(quote.submittedOn, rfq.dueDate) <= 0;
    if (onTime) response.onTimeResponses += 1;
    else response.lateResponses += 1;
  });
  if (response.responded > 0) {
    response.avgResponseDays = Math.round(responseDayTotal / response.responded);
  }

  /* ================= COMPOSITE SCORE ================= */
  const weighted = [];
  if (delivery.total > 0 && delivery.onTimeRate !== null) {
    weighted.push({ weight: 30, score: delivery.onTimeRate });
  }
  if (quality.acceptedRate !== null) {
    weighted.push({ weight: 25, score: quality.acceptedRate });
  }
  if (price.avgVariancePct !== null) {
    const penalty = Math.max(0, price.avgVariancePct) * 1.5;
    weighted.push({ weight: 20, score: clamp(100 - penalty, 0, 100) });
  }
  if (response.responded > 0) {
    const onTimeRate = (response.onTimeResponses / response.responded) * 100;
    const speed = response.avgResponseDays !== null ? clamp(100 - response.avgResponseDays * 7, 0, 30) : 0;
    weighted.push({ weight: 15, score: round2(onTimeRate * 0.7 + speed) });
  }
  if (volume.poCount > 0 || volume.invoiceCount > 0) {
    /* Volume is a scale factor, not a quality judgment: 10 committed
       orders (or their value equivalent) is the full marker. */
    const activity = volume.poCount + volume.grnCount * 0.5 + volume.invoiceCount * 0.5;
    weighted.push({ weight: 10, score: clamp(activity / 10, 0, 1) * 100 });
  }

  metrics.hasData =
    volume.poCount > 0 ||
    volume.grnCount > 0 ||
    quality.inspections > 0 ||
    price.comparedLines > 0 ||
    response.responded > 0 ||
    volume.invoiceCount > 0;

  if (weighted.length > 0) {
    const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0);
    const composite = weighted.reduce((sum, item) => sum + item.weight * item.score, 0) / totalWeight;
    metrics.compositeScore = Math.round(composite * 10) / 10;
    metrics.rating = round2(metrics.compositeScore / 20);
  }

  return metrics;
}
