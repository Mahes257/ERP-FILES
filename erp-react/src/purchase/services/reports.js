/**
 * purchase/services/reports.js
 * ------------------------------------------------------------------
 * Comprehensive Reports service for the Purchase module.
 * Uses ALL application stores to produce accurate, real-time analytics.
 *
 * Data sources:
 *   requisitionsStore, rfqsStore, quotationsStore, evaluationsStore,
 *   ordersStore, grnsStore, inspectionsStore, invoicesStore,
 *   advicesStore, vendorsStore
 *
 * Every calculation reads from live stores — no static arrays,
 * no hardcoded numbers, no mock values.
 * ------------------------------------------------------------------
 */
import { delay } from './base';
import { isApiMode } from './api-client';
import { requisitionApi } from './api/requisitionApi';
import { purchaseOrderApi } from './api/purchaseOrderApi';
import { rfqApi } from './api/rfqApi';
import { logisticsApi } from './api/logisticsApi';
import { invoiceApi } from './api/invoiceApi';
import { vendorApi } from './api/vendorApi';
import { requisitionsStore } from './requisition';
import { rfqsStore, quotationsStore } from './rfq';
import { evaluationsStore } from './evaluation';
import { ordersStore } from './purchaseOrder';
import { grnsStore, inspectionsStore, inventoryStore } from './logistics';
import { invoicesStore, advicesStore, adjustmentTotalsForInvoice } from './invoice';
import { vendorsStore } from './vendor';

/* ------------------------------------------------------------------ */
/*  API-mode data loading                                              */
/* ------------------------------------------------------------------ */

/** Unwraps an array, a { data } page or a Spring { content } envelope. */
function asArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.data)) return payload.data;
  if (payload && Array.isArray(payload.content)) return payload.content;
  if (payload && Array.isArray(payload.records)) return payload.records;
  return [];
}

/* One unreachable endpoint must never blank out the whole report — it
   degrades to an empty collection, which the calculations already
   handle as "nothing to aggregate". */
async function safe(load) {
  try {
    return asArray(await load());
  } catch (err) {
    return [];
  }
}

/** The API invoice row carries the database balance but not the approved
    credit / debit notes (a client-side ledger), so merge the live note
    totals in — the report maths then reads exactly what the Invoice
    Management pages show. */
function withLiveAdjustments(invoice) {
  const live = adjustmentTotalsForInvoice(invoice);
  return {
    ...invoice,
    adjustments: { credit: live.credit, debit: live.debit, net: live.net, count: live.count }
  };
}

/** Evaluation records expose `updatedAt` only; the aging / range filters
    read `createdAt`, so alias it rather than dropping the row. */
function withCreatedAt(record) {
  return { ...record, createdAt: record.createdAt || record.updatedAt || '' };
}

/** The vendor master carries no delivery metric, so Vendor Analysis ranked
    every supplier at 0% on-time while the delivery reports (computed from
    receipts) said 100% for the same supplier. The backend's
    /vendors/performance endpoint already derives the real rate from GRN
    receipt dates — merge just that metric in, leaving the range-filtered
    spend / order counts authoritative. */
function mergeVendorPerformance(vendors, performanceRows) {
  if (!Array.isArray(performanceRows) || performanceRows.length === 0) return vendors;
  const byName = {};
  performanceRows.forEach((row) => {
    if (row && row.name) byName[row.name] = row;
  });
  return vendors.map((vendor) => {
    const perf = byName[vendor.name];
    if (!perf || perf.onTimeDelivery == null) return vendor;
    return { ...vendor, onTimeDelivery: Number(perf.onTimeDelivery) || 0 };
  });
}

/* ------------------------------------------------------------------ */
/*  Date helpers                                                       */
/* ------------------------------------------------------------------ */
function toTime(dateStr) {
  if (!dateStr) return 0;
  const t = new Date(dateStr).getTime();
  return isNaN(t) ? 0 : t;
}

/* ------------------------------------------------------------------ */
/*  Compute requisition value from items (no top-level amount field)    */
/* ------------------------------------------------------------------ */
function requisitionAmount(r) {
  return Number(r.amount) || (Array.isArray(r.items)
    ? r.items.reduce((sum, it) => sum + (Number(it.qty) || 0) * (Number(it.rate) || 0), 0)
    : 0);
}

function getMonthStart() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
}

function getQuarterStart() {
  const now = new Date();
  const q = Math.floor(now.getMonth() / 3);
  return new Date(now.getFullYear(), q * 3, 1).getTime();
}

function getYearStart() {
  return new Date(new Date().getFullYear(), 0, 1).getTime();
}

/* ------------------------------------------------------------------ */
/*  Date range presets                                                  */
/* ------------------------------------------------------------------ */
function resolveDateRange(range) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  switch (range) {
    case 'today':
      return { start: today, end: today + 86400000 - 1 };
    case 'this-week': {
      const day = now.getDay();
      const start = today - day * 86400000;
      return { start, end: start + 7 * 86400000 - 1 };
    }
    case 'this-month':
      return { start: getMonthStart(), end: today + 86400000 - 1 };
    case 'this-quarter':
      return { start: getQuarterStart(), end: today + 86400000 - 1 };
    case 'this-year':
      return { start: getYearStart(), end: today + 86400000 - 1 };
    case 'last-30-days': {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);
      return { start: d.getTime(), end: today + 86400000 - 1 };
    }
    case 'last-3-months': {
      const d = new Date(now.getFullYear(), now.getMonth() - 2, 1);
      return { start: d.getTime(), end: today + 86400000 - 1 };
    }
    case 'last-6-months': {
      const d = new Date(now.getFullYear(), now.getMonth() - 5, 1);
      return { start: d.getTime(), end: today + 86400000 - 1 };
    }
    case 'last-12-months': {
      const d = new Date(now.getFullYear(), now.getMonth() - 11, 1);
      return { start: d.getTime(), end: today + 86400000 - 1 };
    }
    case 'custom':
      return { start: today - 365 * 86400000, end: today + 86400000 - 1 };
    default: {
      const d = new Date(now.getFullYear(), now.getMonth() - 11, 1);
      return { start: d.getTime(), end: today + 86400000 - 1 };
    }
  }
}

function inRange(timestamp, range) {
  return timestamp >= range.start && timestamp <= range.end;
}

/* ------------------------------------------------------------------ */
/*  Vendor spend map — single source of truth                           */
/* ------------------------------------------------------------------ */
function buildVendorSpendMap(orders) {
  const map = {};
  orders.forEach((o) => {
    const v = o.vendor;
    if (!v) return;
    map[v] = (map[v] || 0) + (Number(o.amount) || 0);
  });
  return map;
}

function buildVendorOrderCountMap(orders) {
  const map = {};
  orders.forEach((o) => {
    const v = o.vendor;
    if (!v) return;
    map[v] = (map[v] || 0) + 1;
  });
  return map;
}

function buildCategorySpendMap(orders, vendors) {
  const vendorCategory = {};
  vendors.forEach((v) => { vendorCategory[v.name] = v.category || 'General'; });
  const map = {};
  orders.forEach((o) => {
    const cat = vendorCategory[o.vendor] || 'General';
    map[cat] = (map[cat] || 0) + (Number(o.amount) || 0);
  });
  return map;
}

/* ------------------------------------------------------------------ */
/*  Monthly spend calculation (configurable months)                     */
/* ------------------------------------------------------------------ */
function calcMonthlySpend(orders, monthCount = 12) {
  const months = [];
  const now = new Date();
  for (let i = monthCount - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const label = d.toLocaleString('en-US', { month: 'short', year: '2-digit' });
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const monthStart = d.getTime();
    const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999).getTime();
    const value = orders
      .filter((o) => inRange(toTime(o.orderDate || o.createdAt), { start: monthStart, end: monthEnd }))
      .reduce((sum, o) => sum + (Number(o.amount) || 0), 0);
    months.push({ label, key, value: Math.round(value) });
  }
  return months;
}

/* ------------------------------------------------------------------ */
/*  Department spend from requisitions                                  */
/* ------------------------------------------------------------------ */
function buildDepartmentSpendMap(requisitions) {
  const map = {};
  requisitions.forEach((r) => {
    const dept = r.department || 'Unassigned';
    map[dept] = (map[dept] || 0) + requisitionAmount(r);
  });
  return map;
}

/* ================================================================== */
/*  Comprehensive reports — 15 real-data analytics                     */
/* ================================================================== */

function round(value) { return Math.round(value); }

function poAmount(o) { return Number(o.amount) || Number(o.totals?.total) || 0; }
function invoiceTotal(i) { return Number(i.total) || 0; }
function invoicePaid(i) { return Number(i.paidAmount) || 0; }

/* Net movement of APPROVED credit / debit notes persisted on the
   invoice row (debit − credit) — negative for credit notes, so an
   approved credit note reduces every report outstanding figure. */
function invoiceAdjustmentNet(i) {
  const adj = i && typeof i.adjustments === 'object' && i.adjustments ? i.adjustments : null;
  if (!adj) return 0;
  return (Number(adj.debit) || 0) - (Number(adj.credit) || 0);
}

function invoiceOutstanding(i) {
  return Math.max(0, invoiceTotal(i) + invoiceAdjustmentNet(i) - invoicePaid(i));
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

/** Whole days between a stored date (YYYY-MM-DD or ISO) and `from`. */
function daysBetween(dateStr, from = todayStr()) {
  if (!dateStr) return null;
  const t = new Date(String(dateStr).slice(0, 10)).getTime();
  if (isNaN(t)) return null;
  const f = new Date(String(from).slice(0, 10)).getTime();
  return Math.floor((f - t) / 86400000);
}

/** Days between now and a future date (positive = still in the future). */
function daysUntil(dateStr, from = todayStr()) {
  if (!dateStr) return null;
  const t = new Date(String(dateStr).slice(0, 10)).getTime();
  if (isNaN(t)) return null;
  const f = new Date(String(from).slice(0, 10)).getTime();
  return Math.floor((t - f) / 86400000);
}

const AGING_BUCKETS = ['0-30 days', '31-60 days', '61-90 days', '91-180 days', '180+ days'];

function agingBucket(ageDays) {
  if (ageDays == null) return AGING_BUCKETS[AGING_BUCKETS.length - 1];
  if (ageDays <= 30) return AGING_BUCKETS[0];
  if (ageDays <= 60) return AGING_BUCKETS[1];
  if (ageDays <= 90) return AGING_BUCKETS[2];
  if (ageDays <= 180) return AGING_BUCKETS[3];
  return AGING_BUCKETS[4];
}

function bucketize(rows, bucketOf) {
  const buckets = AGING_BUCKETS.map((label) => ({ label, count: 0, value: 0 }));
  rows.forEach((row) => {
    const bucket = buckets.find((b) => b.label === bucketOf(row));
    if (bucket) {
      bucket.count += 1;
      bucket.value += Number(row.value) || 0;
    }
  });
  return buckets.map((b) => ({ ...b, value: round(b.value) }));
}

/** 1. Procurement spend — total, trend and PO-status mix. */
function computeProcurementSpend(f) {
  const total = f.orders.reduce((sum, o) => sum + poAmount(o), 0);
  const orderCount = f.orders.length;
  const invoiceCount = f.invoices.length;
  const byStatus = {};
  f.orders.forEach((o) => {
    const s = o.status || 'Unknown';
    byStatus[s] = (byStatus[s] || 0) + poAmount(o);
  });
  return {
    total: round(total),
    orderCount,
    invoiceCount,
    avgOrder: orderCount ? round(total / orderCount) : 0,
    byMonth: calcMonthlySpend(f.orders, 12),
    byStatus: Object.entries(byStatus)
      .map(([status, value]) => ({ status, value: round(value), pct: total ? round((value / total) * 1000) / 10 : 0 }))
      .sort((a, b) => b.value - a.value)
  };
}

/** 2. Spend by vendor — from purchase orders. */
function computeSpendByVendor(f) {
  const map = buildVendorSpendMap(f.orders);
  const countMap = buildVendorOrderCountMap(f.orders);
  const total = Object.values(map).reduce((s, v) => s + v, 0);
  return {
    total: round(total),
    rows: Object.entries(map)
      .map(([vendor, spend]) => ({
        vendor,
        spend: round(spend),
        orderCount: countMap[vendor] || 0,
        pct: total ? round((spend / total) * 1000) / 10 : 0
      }))
      .sort((a, b) => b.spend - a.spend)
  };
}

/** 3. Spend by category — vendor category of the PO vendor. */
function computeSpendByCategory(f, vendors) {
  const vendorCategory = {};
  vendors.forEach((v) => { vendorCategory[v.name] = v.category || 'General'; });
  const map = {};
  const countMap = {};
  f.orders.forEach((o) => {
    const cat = vendorCategory[o.vendor] || 'General';
    map[cat] = (map[cat] || 0) + poAmount(o);
    countMap[cat] = (countMap[cat] || 0) + 1;
  });
  const total = Object.values(map).reduce((s, v) => s + v, 0);
  return {
    total: round(total),
    rows: Object.entries(map)
      .map(([category, spend]) => ({
        category,
        spend: round(spend),
        orderCount: countMap[category] || 0,
        pct: total ? round((spend / total) * 1000) / 10 : 0
      }))
      .sort((a, b) => b.spend - a.spend)
  };
}

/** 4. Spend by department — requisition value grouped by department. */
function computeSpendByDepartment(f) {
  const map = buildDepartmentSpendMap(f.requisitions);
  const countMap = {};
  f.requisitions.forEach((r) => {
    const dept = r.department || 'Unassigned';
    countMap[dept] = (countMap[dept] || 0) + 1;
  });
  const total = Object.values(map).reduce((s, v) => s + v, 0);
  return {
    total: round(total),
    rows: Object.entries(map)
      .map(([department, spend]) => ({
        department,
        spend: round(spend),
        requisitionCount: countMap[department] || 0,
        pct: total ? round((spend / total) * 1000) / 10 : 0
      }))
      .sort((a, b) => b.spend - a.spend)
  };
}

const OPEN_PO_EXCLUDED = new Set(['Completed', 'Closed', 'Cancelled']);

/** 5. PO aging — open orders by days since the order date. */
function computePoAging(f) {
  const rows = f.orders
    .filter((o) => !OPEN_PO_EXCLUDED.has(o.status))
    .map((o) => {
      const date = o.orderDate || o.createdAt;
      const age = daysBetween(date);
      return {
        poNo: o.poNo,
        vendor: o.vendor || '',
        project: o.project || '',
        date: String(date || '').slice(0, 10),
        ageDays: age ?? 0,
        status: o.status || '',
        amount: poAmount(o),
        value: poAmount(o)
      };
    })
    .sort((a, b) => b.ageDays - a.ageDays);
  return { rows, buckets: bucketize(rows, (r) => agingBucket(r.ageDays)), openCount: rows.length };
}

const OPEN_PR_STATUSES = new Set([
  'Draft', 'Pending Approval', 'Returned',
  'Technical Specification Review', 'Ready for RFQ', 'Approved'
]);

/** 6. PR aging — open requisitions by days since creation. */
function computePrAging(f) {
  const rows = f.requisitions
    .filter((r) => OPEN_PR_STATUSES.has(r.status))
    .map((r) => {
      const date = r.createdAt || r.date;
      const age = daysBetween(date);
      return {
        prNo: r.prNo,
        department: r.department || '',
        project: r.project || '',
        requester: r.requester || '',
        date: String(date || '').slice(0, 10),
        ageDays: age ?? 0,
        status: r.status || '',
        amount: requisitionAmount(r),
        value: requisitionAmount(r)
      };
    })
    .sort((a, b) => b.ageDays - a.ageDays);
  return { rows, buckets: bucketize(rows, (r) => agingBucket(r.ageDays)), openCount: rows.length };
}

/** 7. RFQ conversion — per-RFQ progress through quotations → award → PO. */
function computeRfqConversion(f) {
  const poByRfq = {};
  f.orders.forEach((o) => {
    if (!o.rfqNo) return;
    poByRfq[o.rfqNo] = (poByRfq[o.rfqNo] || []).concat(o.poNo);
  });
  const quoteCountByRfq = {};
  f.quotations.forEach((q) => {
    quoteCountByRfq[q.rfqNo] = (quoteCountByRfq[q.rfqNo] || 0) + 1;
  });

  const rows = f.rfqs.map((rfq) => {
    const quotationCount = quoteCountByRfq[rfq.rfqNo] || 0;
    const awarded = rfq.status === 'Awarded' || Boolean(rfq.awardedVendor) || rfq.awardedValue != null;
    const pos = poByRfq[rfq.rfqNo] || [];
    return {
      rfqNo: rfq.rfqNo,
      title: rfq.title || rfq.rfqNo,
      status: rfq.status || '',
      quotationCount,
      awarded,
      convertedToPo: pos.length > 0,
      poNo: pos[0] || '',
      estimatedValue: Number(rfq.estimatedValue) || 0
    };
  });

  const total = rows.length;
  const withQuotations = rows.filter((r) => r.quotationCount > 0).length;
  const awarded = rows.filter((r) => r.awarded).length;
  const converted = rows.filter((r) => r.convertedToPo).length;
  const pct = (part) => (total ? round((part / total) * 1000) / 10 : 0);

  return {
    rows,
    totals: { total, withQuotations, awarded, converted },
    rates: {
      withQuotationPct: pct(withQuotations),
      awardPct: pct(awarded),
      conversionPct: pct(converted)
    }
  };
}

/** 8. Negotiation savings — estimated vs awarded value per RFQ. */
function computeNegotiationSavings(f) {
  const rows = f.rfqs
    .filter((rfq) => (Number(rfq.estimatedValue) || 0) > 0 && rfq.awardedValue != null)
    .map((rfq) => {
      const estimated = Number(rfq.estimatedValue) || 0;
      const awarded = Number(rfq.awardedValue) || 0;
      const savings = Math.max(0, estimated - awarded);
      return {
        rfqNo: rfq.rfqNo,
        title: rfq.title || rfq.rfqNo,
        vendor: rfq.awardedVendor || '',
        estimatedValue: estimated,
        awardedValue: awarded,
        savings,
        savingsPct: estimated ? round((savings / estimated) * 1000) / 10 : 0
      };
    })
    .sort((a, b) => b.savings - a.savings);

  const totalEstimated = rows.reduce((s, r) => s + r.estimatedValue, 0);
  const totalAwarded = rows.reduce((s, r) => s + r.awardedValue, 0);
  const totalSavings = rows.reduce((s, r) => s + r.savings, 0);
  return {
    rows,
    totals: {
      count: rows.length,
      withSavings: rows.filter((r) => r.savings > 0).length,
      totalEstimated: round(totalEstimated),
      totalAwarded: round(totalAwarded),
      totalSavings: round(totalSavings),
      savingsPct: totalEstimated ? round((totalSavings / totalEstimated) * 1000) / 10 : 0
    }
  };
}

/** 9. Supplier performance — spend, delivery and quality per vendor. */
function computeSupplierPerformance(f, stores) {
  const ordersMap = {};
  stores.orders.forEach((o) => { ordersMap[o.poNo] = o; });

  const grnByVendor = {};
  f.grns.forEach((g) => {
    const v = g.vendor || ordersMap[g.poNo]?.vendor || 'Unknown';
    if (!grnByVendor[v]) grnByVendor[v] = [];
    grnByVendor[v].push(g);
  });

  const inspByVendor = {};
  f.inspections.forEach((i) => {
    const v = i.vendor || grnByVendor[i.grnNo]?.[0]?.vendor || ordersMap[i.poNo]?.vendor || 'Unknown';
    if (!inspByVendor[v]) inspByVendor[v] = [];
    inspByVendor[v].push(i);
  });

  const vendorMaster = {};
  stores.vendors.forEach((v) => { vendorMaster[v.name] = v; });

  const spendMap = buildVendorSpendMap(f.orders);
  const countMap = buildVendorOrderCountMap(f.orders);
  const vendorNames = [...new Set([...Object.keys(spendMap), ...Object.keys(grnByVendor), ...Object.keys(inspByVendor)])];

  const rows = vendorNames.map((name) => {
    const grns = grnByVendor[name] || [];
    const onTime = grns.filter((g) => {
      const po = ordersMap[g.poNo];
      if (!po?.expectedDate) return true;
      const received = g.receivedOn || g.receivedAt || '';
      return !received || received <= po.expectedDate;
    }).length;
    const inspections = inspByVendor[name] || [];
    const passed = inspections.filter((i) => i.status === 'Passed').length;
    const failed = inspections.filter((i) => i.status === 'Failed').length;
    const master = vendorMaster[name];
    const quotes = f.quotations.filter((q) => q.vendor === name && q.leadTime);
    const avgLeadTime = quotes.length
      ? round(quotes.reduce((s, q) => s + (Number(q.leadTime) || 0), 0) / quotes.length)
      : (master?.leadTimeDays || null);

    return {
      vendor: name,
      category: master?.category || 'General',
      orderCount: countMap[name] || 0,
      spend: round(spendMap[name] || 0),
      grnCount: grns.length,
      onTime,
      onTimePct: grns.length ? round((onTime / grns.length) * 100) : null,
      inspectionCount: inspections.length,
      passed,
      failed,
      qualityPassRate: inspections.length ? round((passed / inspections.length) * 100) : null,
      rating: master?.rating ?? 0,
      avgLeadTime
    };
  }).sort((a, b) => b.spend - a.spend);

  const grnTotal = f.grns.length;
  const onTimeTotal = rows.reduce((s, r) => s + r.onTime, 0);
  const inspTotal = f.inspections.length;
  const passedTotal = f.inspections.filter((i) => i.status === 'Passed').length;

  return {
    rows,
    totals: {
      vendorCount: rows.length,
      onTimeDeliveryPct: grnTotal ? round((onTimeTotal / grnTotal) * 100) : null,
      qualityPassRate: inspTotal ? round((passedTotal / inspTotal) * 100) : null
    }
  };
}

/** 10. Delivery performance — per-GRN on-time comparison vs PO expectation. */
function computeDeliveryPerformance(f, stores) {
  const ordersMap = {};
  stores.orders.forEach((o) => { ordersMap[o.poNo] = o; });

  const rows = f.grns
    .map((g) => {
      const po = ordersMap[g.poNo];
      const expectedDate = po?.expectedDate || '';
      const receivedOn = g.receivedOn || g.receivedAt || '';
      const onTime = !expectedDate || !receivedOn || receivedOn <= expectedDate;
      const delay = !onTime && receivedOn && expectedDate
        ? Math.max(0, daysBetween(expectedDate, receivedOn))
        : 0;
      return {
        grnNo: g.grnNo,
        poNo: g.poNo || '',
        vendor: g.vendor || po?.vendor || '',
        expectedDate,
        receivedOn: String(receivedOn || '').slice(0, 10),
        onTime,
        delayDays: delay
      };
    })
    .sort((a, b) => b.delayDays - a.delayDays || String(b.receivedOn).localeCompare(String(a.receivedOn)));

  const total = rows.length;
  const onTime = rows.filter((r) => r.onTime).length;
  const late = rows.filter((r) => !r.onTime);
  return {
    rows,
    totals: {
      total,
      onTime,
      late: late.length,
      onTimePct: total ? round((onTime / total) * 100) : null,
      avgDelayDays: late.length ? round(late.reduce((s, r) => s + r.delayDays, 0) / late.length) : 0
    }
  };
}

/** 11. Quality / rejection — inspection status distribution + per vendor. */
function computeQuality(f) {
  const distribution = {};
  f.inspections.forEach((i) => {
    const s = i.status || 'Unknown';
    distribution[s] = (distribution[s] || 0) + 1;
  });
  const distRows = Object.entries(distribution)
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => b.count - a.count);

  const total = f.inspections.length;
  const passed = distribution['Passed'] || 0;
  const failed = distribution['Failed'] || 0;
  const partial = distribution['Partially Accepted'] || 0;

  const byVendor = {};
  f.inspections.forEach((i) => {
    const v = i.vendor || 'Unknown';
    if (!byVendor[v]) byVendor[v] = { vendor: v, total: 0, passed: 0, failed: 0 };
    byVendor[v].total += 1;
    if (i.status === 'Passed') byVendor[v].passed += 1;
    if (i.status === 'Failed') byVendor[v].failed += 1;
  });

  return {
    distribution: distRows,
    byVendor: Object.values(byVendor)
      .map((v) => ({
        ...v,
        passRate: v.total ? round((v.passed / v.total) * 100) : null,
        rejectionRate: v.total ? round((v.failed / v.total) * 100) : null
      }))
      .sort((a, b) => b.total - a.total),
    totals: {
      total,
      passed,
      failed,
      partial,
      passRate: total ? round((passed / total) * 100) : null,
      rejectionRate: total ? round((failed / total) * 100) : null
    },
    rows: f.inspections
      .map((i) => ({
        inspectionNo: i.inspectionNo,
        vendor: i.vendor || '',
        poNo: i.poNo || '',
        grnNo: i.grnNo || '',
        status: i.status || '',
        inspectedOn: String((i.inspectedOn || i.createdAt || '') + '').slice(0, 10)
      }))
      .sort((a, b) => String(b.inspectedOn).localeCompare(String(a.inspectedOn)))
  };
}

/** 12. Inventory movement — receipts / issues / adjustments (already
 *  date-filtered with the rest of the stores). */
function computeInventoryMovement(f) {
  const records = f.inventory || [];
  const byType = {};
  records.forEach((m) => {
    const t = m.type || 'Movement';
    if (!byType[t]) byType[t] = { type: t, count: 0, quantity: 0 };
    byType[t].count += 1;
    byType[t].quantity += Number(m.delta) || 0;
  });
  const netQty = records.reduce((s, m) => s + (Number(m.delta) || 0), 0);
  const receiptQty = (byType['Receipt']?.quantity || 0);
  const issueQty = (byType['Issue']?.quantity || 0);

  return {
    rows: records
      .map((m) => ({
        id: m.id,
        product: m.product || m.sku || '',
        sku: m.sku || '',
        warehouse: m.warehouse || '',
        type: m.type || '',
        delta: Number(m.delta) || 0,
        reference: m.reference || '',
        date: String((m.createdAt || m.updatedOn || '')).slice(0, 10),
        updatedBy: m.updatedBy || ''
      }))
      .sort((a, b) => String(b.date).localeCompare(String(a.date))),
    byType: Object.values(byType).sort((a, b) => b.count - a.count),
    totals: {
      totalMovements: records.length,
      netQty: round(netQty),
      receiptQty: round(receiptQty),
      issueQty: round(Math.abs(issueQty))
    }
  };
}

/** 13. Invoice aging — outstanding receivables by days since invoice date. */
function computeInvoiceAging(f) {
  const rows = f.invoices
    .filter((i) => invoiceOutstanding(i) > 0)
    .map((i) => {
      const date = i.invoiceDate || i.createdAt;
      const age = daysBetween(date);
      const outstanding = invoiceOutstanding(i);
      return {
        invoiceNo: i.invoiceNo,
        vendor: i.vendor || '',
        invoiceDate: String(date || '').slice(0, 10),
        dueDate: i.dueDate || '',
        ageDays: age ?? 0,
        total: invoiceTotal(i),
        paid: invoicePaid(i),
        outstanding,
        value: outstanding,
        status: i.status || ''
      };
    })
    .sort((a, b) => b.ageDays - a.ageDays);

  return {
    rows,
    buckets: bucketize(rows, (r) => agingBucket(r.ageDays)),
    totalOutstanding: round(rows.reduce((s, r) => s + r.outstanding, 0))
  };
}

/** 14. Outstanding payables — per-vendor unpaid invoice value. */
function computeOutstandingPayables(f) {
  const rows = f.invoices
    .filter((i) => invoiceOutstanding(i) > 0)
    .map((i) => ({
      invoiceNo: i.invoiceNo,
      vendor: i.vendor || '',
      dueDate: i.dueDate || '',
      total: invoiceTotal(i),
      paid: invoicePaid(i),
      outstanding: invoiceOutstanding(i),
      status: i.status || ''
    }))
    .sort((a, b) => b.outstanding - a.outstanding);

  const byVendor = {};
  rows.forEach((r) => {
    if (!byVendor[r.vendor]) byVendor[r.vendor] = { vendor: r.vendor, invoiced: 0, paid: 0, outstanding: 0, invoiceCount: 0 };
    byVendor[r.vendor].invoiced += r.total;
    byVendor[r.vendor].paid += r.paid;
    byVendor[r.vendor].outstanding += r.outstanding;
    byVendor[r.vendor].invoiceCount += 1;
  });

  return {
    rows,
    byVendor: Object.values(byVendor)
      .map((v) => ({ ...v, invoiced: round(v.invoiced), paid: round(v.paid), outstanding: round(v.outstanding) }))
      .sort((a, b) => b.outstanding - a.outstanding),
    totalOutstanding: round(rows.reduce((s, r) => s + r.outstanding, 0)),
    totalInvoiced: round(rows.reduce((s, r) => s + r.total, 0))
  };
}

/** 15. Overdue payments + payment forecast — from invoice due dates. */
function computePayments(f) {
  const today = todayStr();
  const unpaid = f.invoices.filter((i) => invoiceOutstanding(i) > 0);

  /* Overdue — past due date (or explicitly flagged Overdue) and unpaid. */
  const overdueRows = unpaid
    .filter((i) => i.status === 'Overdue' || (i.dueDate && i.dueDate < today))
    .map((i) => ({
      invoiceNo: i.invoiceNo,
      vendor: i.vendor || '',
      dueDate: i.dueDate || '',
      daysOverdue: i.dueDate ? Math.max(0, daysBetween(i.dueDate)) : null,
      outstanding: invoiceOutstanding(i),
      status: i.status || ''
    }))
    .sort((a, b) => (b.daysOverdue ?? -1) - (a.daysOverdue ?? -1));

  /* Forecast — unpaid invoices due within the next 90 days. */
  const FORECAST_BUCKETS = [
    { label: 'Due in 0-7 days', max: 7 },
    { label: 'Due in 8-14 days', max: 14 },
    { label: 'Due in 15-30 days', max: 30 },
    { label: 'Due in 31-60 days', max: 60 },
    { label: 'Due in 61-90 days', max: 90 }
  ];
  const forecastRows = unpaid
    .filter((i) => i.dueDate)
    .map((i) => {
      const days = daysUntil(i.dueDate, today);
      return {
        invoiceNo: i.invoiceNo,
        vendor: i.vendor || '',
        dueDate: i.dueDate,
        daysUntilDue: days,
        outstanding: invoiceOutstanding(i),
        status: i.status || ''
      };
    })
    .filter((r) => r.daysUntilDue >= 0 && r.daysUntilDue <= 90)
    .sort((a, b) => a.daysUntilDue - b.daysUntilDue);

  const forecastBuckets = FORECAST_BUCKETS.map((bucket) => {
    const items = forecastRows.filter((r) => r.daysUntilDue <= bucket.max);
    return {
      label: bucket.label,
      count: items.length,
      amount: round(items.reduce((s, r) => s + r.outstanding, 0))
    };
  });

  return {
    overdue: {
      rows: overdueRows,
      count: overdueRows.length,
      totalOverdue: round(overdueRows.reduce((s, r) => s + r.outstanding, 0))
    },
    forecast: {
      rows: forecastRows,
      buckets: forecastBuckets,
      totalUpcoming: round(forecastRows.reduce((s, r) => s + r.outstanding, 0)),
      count: forecastRows.length
    }
  };
}

/**
 * Computes ALL fifteen reports from real (already-filtered) stores.
 * Pure — safe to unit test with arbitrary inputs.
 */
export function computeAllReports(stores, filters = {}) {
  const f = reportsService._filterStores(stores, filters);
  const vendors = stores.vendors || [];

  return {
    procurementSpend: computeProcurementSpend(f),
    spendByVendor: computeSpendByVendor(f),
    spendByCategory: computeSpendByCategory(f, vendors),
    spendByDepartment: computeSpendByDepartment(f),
    poAging: computePoAging(f),
    prAging: computePrAging(f),
    rfqConversion: computeRfqConversion(f),
    negotiationSavings: computeNegotiationSavings(f),
    supplierPerformance: computeSupplierPerformance(f, stores),
    deliveryPerformance: computeDeliveryPerformance(f, stores),
    quality: computeQuality(f),
    inventoryMovement: computeInventoryMovement(f),
    invoiceAging: computeInvoiceAging(f),
    outstandingPayables: computeOutstandingPayables(f),
    payments: computePayments(f)
  };
}

/* ================================================================== */
/*  PUBLIC API                                                         */
/* ================================================================== */
export const reportsService = {
  /* ---------------------------------------------------------------- */
  /*  Get all stores for a comprehensive snapshot                      */
  /* ---------------------------------------------------------------- */
  _getStores() {
    return {
      requisitions: requisitionsStore.all,
      rfqs: rfqsStore.all,
      quotations: quotationsStore.all,
      evaluations: evaluationsStore.all,
      orders: ordersStore.all,
      grns: grnsStore.all,
      inspections: inspectionsStore.all,
      inventory: inventoryStore.all,
      invoices: invoicesStore.all,
      advices: advicesStore.all,
      vendors: vendorsStore.all
    };
  },

  /* ---------------------------------------------------------------- */
  /*  Reports read from real data                                      */
  /* ---------------------------------------------------------------- */
  /* Every report below is a pure calculation over "stores". In local
     mode those are the live localStorage collections, but when the
     module runs against the API they are empty — so the dashboard
     reported 0 orders / 0 requisitions / no charts even though the
     documents exist in the database. Load the same records from the
     REST endpoints here; the business rules stay untouched. */
  async _loadStores() {
    if (!isApiMode()) return this._getStores();

    const [requisitions, orders, rfqs, quotations, evaluations, grns, inspections, inventory, invoices, vendors, vendorPerformance] = await Promise.all([
      safe(() => requisitionApi.list({ page: 1, pageSize: 1000 })),
      safe(() => purchaseOrderApi.list({ page: 1, pageSize: 1000 })),
      safe(() => rfqApi.list({ page: 1, pageSize: 1000 })),
      safe(() => rfqApi.quotations({ page: 1, pageSize: 1000 })),
      safe(() => rfqApi.evaluationRecords()),
      safe(() => logisticsApi.grns()),
      safe(() => logisticsApi.inspections()),
      safe(() => logisticsApi.inventory()),
      safe(() => invoiceApi.list({ page: 1, pageSize: 1000 })),
      safe(() => vendorApi.all()),
      safe(() => vendorApi.performance())
    ]);

    return {
      requisitions,
      orders,
      rfqs,
      quotations,
      evaluations: evaluations.map(withCreatedAt),
      grns,
      inspections,
      inventory,
      invoices: invoices.map(withLiveAdjustments),
      advices: advicesStore.all,
      vendors: mergeVendorPerformance(vendors, vendorPerformance)
    };
  },

  /* ---------------------------------------------------------------- */
  /*  Apply filters to stores                                          */
  /* ---------------------------------------------------------------- */
  /* Resolve the active date range from filters (shared by the store
     filter and the inventory report which needs the raw range). */
  _resolveRange(filters = {}) {
    const { dateRange = 'last-12-months', customStart, customEnd } = filters;
    return dateRange === 'custom' && customStart && customEnd
      ? { start: new Date(customStart).getTime(), end: new Date(customEnd + 'T23:59:59').getTime() }
      : resolveDateRange(dateRange);
  },

  _filterStores(stores, filters = {}) {
    const { department, vendor, project, poStatus, invoiceStatus, paymentStatus } = filters;
    const range = this._resolveRange(filters);

    const filtered = { ...stores };

    /* Filter orders by date */
    filtered.orders = stores.orders.filter((o) => {
      const t = toTime(o.orderDate || o.createdAt);
      if (!inRange(t, range)) return false;
      if (vendor && o.vendor !== vendor) return false;
      if (project && o.project !== project) return false;
      if (poStatus && o.status !== poStatus) return false;
      return true;
    });

    /* Filter requisitions by date and department */
    filtered.requisitions = stores.requisitions.filter((r) => {
      const t = toTime(r.createdAt);
      if (!inRange(t, range)) return false;
      if (department && r.department !== department) return false;
      if (project && r.project !== project) return false;
      return true;
    });

    /* Filter invoices by date and status */
    filtered.invoices = stores.invoices.filter((i) => {
      const t = toTime(i.invoiceDate || i.createdAt);
      if (!inRange(t, range)) return false;
      if (vendor && i.vendor !== vendor) return false;
      if (project && i.project !== project) return false;
      if (invoiceStatus && i.status !== invoiceStatus) return false;
      if (paymentStatus && i.paymentStatus !== paymentStatus) return false;
      return true;
    });

    /* Filter RFQs by date */
    filtered.rfqs = stores.rfqs.filter((r) => {
      const t = toTime(r.createdAt);
      if (!inRange(t, range)) return false;
      if (project && r.project !== project) return false;
      return true;
    });

    /* Filter quotations by date */
    filtered.quotations = stores.quotations.filter((q) => {
      const t = toTime(q.submittedOn || q.createdAt);
      return inRange(t, range);
    });

    /* Filter evaluations by date */
    filtered.evaluations = stores.evaluations.filter((e) => {
      const t = toTime(e.createdAt);
      return inRange(t, range);
    });

    /* Filter GRNs by date and vendor */
    filtered.grns = stores.grns.filter((g) => {
      const t = toTime(g.receivedOn || g.createdAt);
      if (!inRange(t, range)) return false;
      if (vendor && g.vendor !== vendor) return false;
      return true;
    });

    /* Filter inspections by date and vendor */
    filtered.inspections = stores.inspections.filter((i) => {
      const t = toTime(i.inspectedOn || i.createdAt);
      if (!inRange(t, range)) return false;
      if (vendor && i.vendor !== vendor) return false;
      return true;
    });

    /* Filter inventory movements by date */
    filtered.inventory = (stores.inventory || []).filter((m) => {
      const t = toTime(m.createdAt || m.updatedOn);
      return inRange(t, range);
    });

    return filtered;
  },

  /* ---------------------------------------------------------------- */
  /*  Reports Dashboard — comprehensive KPIs                          */
  /* ---------------------------------------------------------------- */
  async getDashboardKpis(filters = {}) {
    await delay();
    const stores = await this._loadStores();
    const f = this._filterStores(stores, filters);

    const totalPoValue = f.orders.reduce((sum, o) => sum + (Number(o.amount) || 0), 0);
    const totalInvoiced = f.invoices.reduce((sum, i) => sum + (Number(i.total) || 0), 0);
    const adjustmentNet = f.invoices.reduce((sum, i) => sum + invoiceAdjustmentNet(i), 0);
    const totalPaid = f.invoices
      .filter((i) => i.status === 'Paid')
      .reduce((sum, i) => sum + (Number(i.total) || 0), 0);
    const outstanding = Math.max(0, totalInvoiced + adjustmentNet - totalPaid);
    const overdueValue = f.invoices
      .filter((i) => i.status === 'Overdue')
      .reduce((sum, i) => sum + (Number(i.total) || 0) + invoiceAdjustmentNet(i), 0);

    const avgPoValue = f.orders.length ? Math.round(totalPoValue / f.orders.length) : 0;

    /* Pending approvals across all document types */
    const pendingPrApprovals = f.requisitions.filter((r) => r.status === 'Pending Approval').length;
    const pendingPoApprovals = f.orders.filter((o) => o.approvalStatus === 'Pending').length;
    const pendingInvoiceApprovals = f.invoices.filter((i) => i.status === 'Submitted').length;
    const pendingApprovals = pendingPrApprovals + pendingPoApprovals + pendingInvoiceApprovals;

    /* On-time delivery from GRNs — look up expected date from PO */
    const ordersMap = {};
    stores.orders.forEach((o) => { ordersMap[o.poNo] = o; });
    const totalGrns = f.grns.length;
    const onTimeGrns = f.grns.filter((g) => {
      const po = ordersMap[g.poNo];
      const expectedDate = po?.expectedDate;
      if (!expectedDate) return true;
      return toTime(g.receivedOn || g.createdAt) <= toTime(expectedDate);
    }).length;
    const onTimeDeliveryPct = totalGrns ? Math.round((onTimeGrns / totalGrns) * 100) : 0;

    /* Quality pass rate from inspections */
    const totalInspections = f.inspections.length;
    const passedInspections = f.inspections.filter((i) => i.status === 'Passed').length;
    const qualityPassRate = totalInspections ? Math.round((passedInspections / totalInspections) * 100) : 0;

    /* Savings from RFQs */
    const totalRfqValue = f.rfqs.reduce((sum, r) => sum + (Number(r.estimatedValue) || 0), 0);
    const totalAwardedValue = f.rfqs.reduce((sum, r) => sum + (Number(r.awardedValue) || 0), 0);
    const savings = totalRfqValue > totalAwardedValue && totalAwardedValue > 0 ? totalRfqValue - totalAwardedValue : 0;

    return {
      totalSpend: totalPoValue,
      orderValue: totalPoValue,
      requisitionCount: f.requisitions.length,
      orderCount: f.orders.length,
      invoiceCount: f.invoices.length,
      pendingApprovals,
      paidValue: totalPaid,
      outstandingValue: outstanding,
      overdueValue,
      avgPoValue,
      savings,
      onTimeDeliveryPct,
      qualityPassRate,
      rfqCount: f.rfqs.length,
      grnCount: totalGrns,
      inspectionCount: totalInspections
    };
  },

  /* ---------------------------------------------------------------- */
  /*  Spend Analysis — comprehensive spend breakdown                   */
  /* ---------------------------------------------------------------- */
  async getSpendAnalysis(filters = {}) {
    await delay();
    const stores = await this._loadStores();
    const f = this._filterStores(stores, filters);

    /* Monthly spend */
    const byMonth = calcMonthlySpend(f.orders, 12);

    /* Category spend */
    const categoryMap = buildCategorySpendMap(f.orders, stores.vendors);
    const totalSpend = Object.values(categoryMap).reduce((s, v) => s + v, 0);
    const byCategory = Object.entries(categoryMap)
      .map(([category, spend]) => {
        const count = f.orders.filter((o) => {
          const cat = stores.vendors.find((v) => v.name === o.vendor)?.category || 'General';
          return cat === category;
        }).length;
        return {
          category,
          spend: Math.round(spend),
          percentage: totalSpend ? Math.round((spend / totalSpend) * 1000) / 10 : 0,
          orderCount: count
        };
      })
      .sort((a, b) => b.spend - a.spend);

    /* Department spend — sourced from REQUISITIONS, so the share must be
       relative to the requisition total. Dividing by `totalSpend` (the PO
       total, a different series) produced shares like 3775.2% on the
       Spend Analysis chart. */
    const deptMap = buildDepartmentSpendMap(f.requisitions);
    const deptTotal = Object.values(deptMap).reduce((s, v) => s + v, 0);
    const byDepartment = Object.entries(deptMap)
      .map(([department, spend]) => ({
        department,
        spend: Math.round(spend),
        percentage: deptTotal ? Math.round((spend / deptTotal) * 1000) / 10 : 0
      }))
      .sort((a, b) => b.spend - a.spend);

    /* Vendor spend */
    const vendorSpendMap = buildVendorSpendMap(f.orders);
    const vendorOrderMap = buildVendorOrderCountMap(f.orders);
    const byVendor = Object.entries(vendorSpendMap)
      .map(([vendor, spend]) => ({
        vendor,
        spend: Math.round(spend),
        percentage: totalSpend ? Math.round((spend / totalSpend) * 1000) / 10 : 0,
        orderCount: vendorOrderMap[vendor] || 0
      }))
      .sort((a, b) => b.spend - a.spend);

    return {
      total: Math.round(totalSpend),
      avgPerMonth: (() => { const months = byMonth.filter((m) => m.value > 0).length; return months ? Math.round(totalSpend / months) : 0; })(),
      byMonth,
      byCategory,
      byDepartment,
      byVendor
    };
  },

  /* ---------------------------------------------------------------- */
  /*  Vendor Analysis — comprehensive vendor analytics                 */
  /* ---------------------------------------------------------------- */
  async getVendorAnalysis(filters = {}) {
    await delay();
    const stores = await this._loadStores();
    const f = this._filterStores(stores, filters);

    const vendorSpendMap = buildVendorSpendMap(f.orders);
    const vendorOrderMap = buildVendorOrderCountMap(f.orders);

    /* Invoice data per vendor — outstanding is the adjusted balance so
       approved credit / debit notes move the vendor payable here too. */
    const vendorInvoiceMap = {};
    const vendorPaidMap = {};
    const vendorOutstandingMap = {};
    f.invoices.forEach((i) => {
      const v = i.vendor;
      if (!v) return;
      vendorInvoiceMap[v] = (vendorInvoiceMap[v] || 0) + (Number(i.total) || 0);
      if (i.status === 'Paid') {
        vendorPaidMap[v] = (vendorPaidMap[v] || 0) + (Number(i.total) || 0);
      }
      vendorOutstandingMap[v] = (vendorOutstandingMap[v] || 0) + invoiceOutstanding(i);
    });

    const totalSpend = Object.values(vendorSpendMap).reduce((s, v) => s + v, 0);

    const vendors = stores.vendors
      .filter((v) => v.recordState !== 'Deleted')
      .map((vendor) => {
        const spend = vendorSpendMap[vendor.name] || 0;
        const invoiceValue = vendorInvoiceMap[vendor.name] || 0;
        return {
          id: vendor.id,
          name: vendor.name,
          category: vendor.category || 'General',
          spend: Math.round(spend),
          poCount: vendorOrderMap[vendor.name] || 0,
          invoiceValue: Math.round(invoiceValue),
          paidValue: Math.round(vendorPaidMap[vendor.name] || 0),
          outstanding: Math.round(vendorOutstandingMap[vendor.name] || 0),
          share: totalSpend ? Math.round((spend / totalSpend) * 1000) / 10 : 0,
          rating: vendor.rating ?? 0,
          onTimeDelivery: vendor.onTimeDelivery ?? 0,
          leadTimeDays: vendor.leadTimeDays ?? 0,
          orders: vendor.orders ?? 0
        };
      })
      .sort((a, b) => b.spend - a.spend);

    const totalVendorSpend = vendors.reduce((s, v) => s + v.spend, 0);
    const avgSpendPerVendor = vendors.length ? Math.round(totalVendorSpend / vendors.length) : 0;
    const activeVendors = vendors.filter((v) => v.poCount > 0).length;
    const preferredVendors = stores.vendors.filter((v) => v.status === 'Approved' && v.rating >= 4).length;

    return {
      totalSpend: Math.round(totalSpend),
      totalVendors: vendors.length,
      activeVendors,
      preferredVendors,
      avgSpendPerVendor,
      /* Spend concentration is a spend series, so it only carries vendors
         that actually transacted inside the selected range / filters.
         Listing every master vendor (each at ₹0) kept stale entries in the
         dashboard's "Top Vendors by Spend" when a range excluded all
         activity, and its empty state was unreachable. The full ranked
         list stays available via `performance` below. */
      concentration: vendors
        .filter((v) => v.spend > 0)
        .map((v) => ({
          ...v,
          share: totalSpend ? Math.round((v.spend / totalSpend) * 1000) / 10 : 0
        })),
      performance: vendors.map((v, i) => ({ ...v, rank: i + 1 }))
    };
  },

  /* ---------------------------------------------------------------- */
  /*  Procurement Analytics — full lifecycle                            */
  /* ---------------------------------------------------------------- */
  async getProcurementAnalytics(filters = {}) {
    await delay();
    const stores = await this._loadStores();
    const f = this._filterStores(stores, filters);

    /* Counts */
    const prCount = f.requisitions.length;
    const rfqCount = f.rfqs.length;
    const quotationCount = f.quotations.length;
    const evaluationCount = f.evaluations.length;
    const poCount = f.orders.length;
    const grnCount = f.grns.length;
    const inspectionCount = f.inspections.length;
    const invoiceCount = f.invoices.length;
    const paidCount = f.invoices.filter((i) => i.status === 'Paid').length;

    /* PO lookup for GRN values */
    const ordersMap = {};
    stores.orders.forEach((o) => { ordersMap[o.poNo] = o; });

    /* Values */
    const requisitionValue = f.requisitions.reduce((sum, r) => sum + requisitionAmount(r), 0);
    const rfqValue = f.rfqs.reduce((sum, r) => sum + (Number(r.estimatedValue) || 0), 0);
    const quotationValue = f.quotations.reduce((sum, q) => sum + (Number(q.total) || 0), 0);
    /* Evaluation, GRN, and inspection value — derive from related documents
       (evaluations don't store totalValue; GRNs don't store totalAmount;
       inspections don't store totalValue) */
    const evaluationValue = f.quotations.reduce((sum, q) => {
      const ev = f.evaluations.find((e) => e.rfqNo === q.rfqNo);
      return ev ? sum + (Number(q.total) || 0) : sum;
    }, 0);
    const orderValue = f.orders.reduce((sum, o) => sum + (Number(o.amount) || 0), 0);
    const grnValue = f.grns.reduce((sum, g) => {
      const po = ordersMap?.[g.poNo];
      return sum + (Number(po?.amount) || 0);
    }, 0);
    const inspectionValue = grnValue;
    const invoicedValue = f.invoices.reduce((sum, i) => sum + (Number(i.total) || 0), 0);
    const paidValue = f.invoices.filter((i) => i.status === 'Paid').reduce((sum, i) => sum + (Number(i.total) || 0), 0);

    /* Pending counts */
    const pendingPrApprovals = f.requisitions.filter((r) => r.status === 'Pending Approval').length;
    const pendingPoApprovals = f.orders.filter((o) => o.approvalStatus === 'Pending').length;
    const pendingInvoices = f.invoices.filter((i) => ['Submitted', 'Approved', 'Overdue'].includes(i.status)).length;
    const openOrders = f.orders.filter((o) => o.status !== 'Completed' && o.status !== 'Cancelled').length;

    /* Conversion rates */
    const prToRfq = prCount > 0 ? Math.round((rfqCount / prCount) * 1000) / 10 : 0;
    const rfqToQuotation = rfqCount > 0 ? Math.round((quotationCount / rfqCount) * 1000) / 10 : 0;
    const quotationToPo = quotationCount > 0 ? Math.round((poCount / quotationCount) * 1000) / 10 : 0;
    const poToInvoice = poCount > 0 ? Math.round((invoiceCount / poCount) * 1000) / 10 : 0;
    const invoiceToPaid = invoiceCount > 0 ? Math.round((paidCount / invoiceCount) * 1000) / 10 : 0;

    /* Lifecycle stages */
    const lifecycle = [
      { stage: 'Requisitions', count: prCount, value: requisitionValue, route: '/purchase/requisition' },
      { stage: 'RFQs', count: rfqCount, value: rfqValue, route: '/purchase/rfq' },
      { stage: 'Quotations', count: quotationCount, value: quotationValue, route: '/purchase/rfq/quotations' },
      { stage: 'Evaluations', count: evaluationCount, value: evaluationValue, route: '/purchase/rfq/technical-evaluation' },
      { stage: 'Purchase Orders', count: poCount, value: orderValue, route: '/purchase/orders' },
      { stage: 'Delivery', count: grnCount, value: grnValue, route: '/purchase/logistics/grn' },
      { stage: 'Inspections', count: inspectionCount, value: inspectionValue, route: '/purchase/logistics/quality' },
      { stage: 'Invoices', count: invoiceCount, value: invoicedValue, route: '/purchase/invoices' },
      { stage: 'Paid', count: paidCount, value: paidValue, route: '/purchase/invoices/vendor-payment' }
    ];

    /* Value flow */
    const valueFlow = [
      { label: 'Requisition Value', value: requisitionValue, tone: 'text-indigo-600' },
      { label: 'RFQ Value', value: rfqValue, tone: 'text-purple-600' },
      { label: 'Order Value', value: orderValue, tone: 'text-sky-600' },
      { label: 'Invoiced Value', value: invoicedValue, tone: 'text-violet-600' },
      { label: 'Paid Value', value: paidValue, tone: 'text-emerald-600' }
    ];

    return {
      kpis: {
        requisitionCount: prCount,
        requisitionValue,
        rfqCount,
        orderCount: poCount,
        orderValue,
        invoiceCount: invoicedValue ? invoiceCount : 0,
        invoicedValue,
        paidValue,
        openOrders,
        /* The KPI row renders grnCount / inspectionCount, but they were
           only present in `lifecycle` — so the cards showed 0 while the
           funnel on the same page showed the real counts. */
        grnCount,
        inspectionCount,
        pendingApprovals: pendingPrApprovals + pendingPoApprovals + pendingInvoices,
        pendingPrApprovals,
        pendingPoApprovals,
        pendingInvoices
      },
      lifecycle,
      valueFlow,
      conversion: {
        prToRfq,
        rfqToQuotation,
        quotationToPo,
        poToInvoice,
        invoiceToPaid,
        overallConversion: prCount > 0 ? Math.round((paidCount / prCount) * 1000) / 10 : 0
      }
    };
  },

  /* ---------------------------------------------------------------- */
  /*  Comprehensive reports — all 15 analytics in one pass             */
  /* ---------------------------------------------------------------- */
  async getAllReports(filters = {}) {
    await delay();
    return computeAllReports(await this._loadStores(), filters);
  },

  /* ---------------------------------------------------------------- */
  /*  Alerts / Exceptions — real actionable issues                     */
  /* ---------------------------------------------------------------- */
  async getAlerts() {
    await delay();
    const alerts = [];
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const stores = await this._loadStores();

    /* PR approval overdue (>3 days) */
    stores.requisitions
      .filter((r) => r.status === 'Pending Approval')
      .forEach((r) => {
        const created = toTime(r.createdAt);
        const days = Math.floor((now.getTime() - created) / 86400000);
        if (days > 3) {
          alerts.push({
            id: `pr-${r.id}`,
            severity: days > 7 ? 'critical' : 'warning',
            type: 'PR Approval Overdue',
            document: r.prNo,
            description: `Pending for ${days} days`,
            route: '/purchase/requisition'
          });
        }
      });

    /* PO delivery overdue */
    stores.orders
      .filter((o) => o.status !== 'Completed' && o.status !== 'Cancelled')
      .forEach((o) => {
        if (o.expectedDate && o.expectedDate < todayStr) {
          alerts.push({
            id: `po-${o.id}`,
            severity: 'critical',
            type: 'PO Delivery Overdue',
            document: o.poNo,
            vendor: o.vendor || '',
            description: `Expected by ${o.expectedDate}`,
            route: '/purchase/orders'
          });
        }
      });

    /* Invoice mismatch */
    stores.invoices
      .filter((i) => i.matchStatus === 'Mismatch' || i.matchStatus === 'Exception')
      .forEach((i) => {
        alerts.push({
          id: `inv-${i.id}`,
          severity: 'warning',
          type: 'Invoice Mismatch',
          document: i.invoiceNo,
          vendor: i.vendor || '',
          description: `Match: ${i.matchStatus}`,
          route: '/purchase/invoices/three-way-matching'
        });
      });

    /* Payment overdue */
    stores.invoices
      .filter((i) => i.status === 'Overdue')
      .forEach((i) => {
        alerts.push({
          id: `pay-${i.id}`,
          severity: 'critical',
          type: 'Payment Overdue',
          document: i.invoiceNo,
          vendor: i.vendor || '',
          description: `Amount: ₹${Number(i.total || 0).toLocaleString('en-IN')}`,
          route: '/purchase/invoices/vendor-payment'
        });
      });

    /* Failed quality inspections */
    stores.inspections
      .filter((i) => i.status === 'Failed')
      .forEach((i) => {
        alerts.push({
          id: `qi-${i.id}`,
          severity: 'critical',
          type: 'Quality Inspection Failed',
          document: i.inspectionNo,
          vendor: i.vendor || '',
          description: `PO: ${i.poNo}`,
          route: '/purchase/logistics/quality'
        });
      });

    const severityOrder = { critical: 0, warning: 1, info: 2 };
    return alerts
      .sort((a, b) => (severityOrder[a.severity] ?? 2) - (severityOrder[b.severity] ?? 2))
      .slice(0, 15);
  },

  /* ---------------------------------------------------------------- */
  /*  Financial Summary — reconcile with dashboard/invoices/payments    */
  /* ---------------------------------------------------------------- */
  async getFinancialSummary(filters = {}) {
    await delay();
    const stores = await this._loadStores();
    const f = this._filterStores(stores, filters);

    const totalPoValue = f.orders.reduce((sum, o) => sum + (Number(o.amount) || 0), 0);
    const totalInvoiced = f.invoices.reduce((sum, i) => sum + (Number(i.total) || 0), 0);
    const adjustmentNet = f.invoices.reduce((sum, i) => sum + invoiceAdjustmentNet(i), 0);
    const totalPaid = f.invoices.filter((i) => i.status === 'Paid').reduce((sum, i) => sum + (Number(i.total) || 0), 0);
    const outstanding = Math.max(0, totalInvoiced + adjustmentNet - totalPaid);
    const overdue = f.invoices.filter((i) => i.status === 'Overdue').reduce((sum, i) => sum + (Number(i.total) || 0) + invoiceAdjustmentNet(i), 0);
    const partialPaid = f.invoices.filter((i) => i.status === 'Partial').reduce((sum, i) => {
      const paid = Number(i.paidAmount) || 0;
      return sum + Math.max(0, (Number(i.total) || 0) + invoiceAdjustmentNet(i) - paid);
    }, 0);

    return {
      grossPoValue: Math.round(totalPoValue),
      invoicedValue: Math.round(totalInvoiced),
      paidValue: Math.round(totalPaid),
      outstandingValue: Math.round(outstanding),
      overdueValue: Math.round(overdue),
      partialPaidValue: Math.round(partialPaid)
    };
  },

  /* ---------------------------------------------------------------- */
  /*  Unique filter options (departments, vendors, categories)          */
  /* ---------------------------------------------------------------- */
  async getFilterOptions() {
    await delay();
    const stores = await this._loadStores();

    const departments = [...new Set(stores.requisitions.map((r) => r.department).filter(Boolean))].sort();
    const vendors = [...new Set(stores.orders.map((o) => o.vendor).filter(Boolean))].sort();
    const categories = [...new Set(stores.vendors.map((v) => v.category).filter(Boolean))].sort();
    const poStatuses = [...new Set(stores.orders.map((o) => o.status).filter(Boolean))].sort();
    const invoiceStatuses = [...new Set(stores.invoices.map((i) => i.status).filter(Boolean))].sort();
    const paymentStatuses = [...new Set(stores.invoices.map((i) => i.paymentStatus).filter(Boolean))].sort();
    const projects = [...new Set(
      [
        ...stores.requisitions.map((r) => r.project),
        ...stores.rfqs.map((r) => r.project),
        ...stores.orders.map((o) => o.project),
        ...stores.invoices.map((i) => i.project)
      ].filter(Boolean)
    )].sort();

    return { departments, vendors, categories, poStatuses, invoiceStatuses, paymentStatuses, projects };
  }
};
