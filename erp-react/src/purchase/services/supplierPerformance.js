/**
 * purchase/services/supplierPerformance.js
 * ------------------------------------------------------------------
 * Supplier Performance facade — collects REAL transaction records from
 * the RFQ / Quotation / PO / GRN / QC / Invoice / Payment stores for
 * one (or every) supplier and computes derived performance through the
 * pure engine in utils/supplierPerformance.js.
 *
 * The facade never invents scores. `withEffectiveMetrics` returns the
 * supplier record with the displayed performance aggregates (rating /
 * on-time delivery / orders / spend) REPLACED by transaction-derived
 * values whenever real transaction history exists, and keeps the
 * legacy stored aggregates as the documented fallback for suppliers
 * with zero transaction history.
 *
 * Circular imports (rfq → vendor → this module → rfq / purchaseOrder /
 * logistics / invoice) are safe: every store access happens at call
 * time, never during module evaluation.
 * ------------------------------------------------------------------
 */
import { rfqsStore, quotationsStore } from './rfq';
import { ordersStore } from './purchaseOrder';
import { grnsStore, inspectionsStore, shipmentsStore } from './logistics';
import { invoicesStore, advicesStore } from './invoice';
import { computeSupplierPerformance, emptyPerformance } from '../utils/supplierPerformance';
import { clone, delay } from './base';

/** Collects the full transaction context for one supplier master. */
export function supplierTransactionContext(vendor = {}) {
  return {
    vendorId: vendor.id || '',
    vendorName: vendor.name || '',
    rfqs: rfqsStore.all,
    quotations: quotationsStore.all,
    orders: ordersStore.all,
    grns: grnsStore.all,
    inspections: inspectionsStore.all,
    shipments: shipmentsStore.all,
    invoices: invoicesStore.all
  };
}

/** Computes the derived performance metrics for one supplier master. */
export function computeSupplierMetrics(vendor = {}) {
  return computeSupplierPerformance(supplierTransactionContext(vendor));
}

/**
 * Returns the supplier record with effective performance aggregates.
 * `source` is 'transactions' (real documents exist — derived numbers
 * win) or 'stored' (no transactions — legacy aggregates shown).
 */
export function withEffectiveMetrics(vendor = {}) {
  const record = clone(vendor);
  const metrics = computeSupplierMetrics(record);
  const hasTransactions = metrics.hasData;

  if (!hasTransactions) {
    record.metrics = emptyPerformance();
    record.performanceSource = 'stored';
    record.hasTransactionData = false;
    return record;
  }

  const volume = metrics.purchaseVolume;
  record.rating = metrics.rating; // composite score / 20 (0–5)
  record.onTimeDelivery = metrics.delivery.onTimeRate; // % or null
  record.orders = volume.poCount;
  record.spend = volume.poValue;
  record.metrics = metrics;
  record.performanceSource = 'transactions';
  record.hasTransactionData = true;
  return record;
}

/**
 * Payment ledger rows for one supplier (derived from the invoice
 * payment history) — each row carries the invoice + payment identity.
 */
function paymentRowsFor(vendorName, vendorId) {
  const rows = [];
  invoicesStore.all.forEach((invoice) => {
    const sameVendor =
      (vendorId && invoice.vendorId === vendorId) ||
      String(invoice.vendor || '').trim().toLowerCase() === String(vendorName || '').trim().toLowerCase();
    if (!sameVendor) return;
    (invoice.paymentHistory || []).forEach((entry) => {
      if (String(entry.status || 'Active') === 'Reversed') return;
      rows.push({
        paymentNo: entry.paymentNo || '',
        invoiceNo: invoice.invoiceNo,
        poNo: invoice.poNo || '',
        invoiceId: invoice.id,
        amount: Number(entry.amount) || 0,
        currency: entry.currency || invoice.currency || 'INR',
        method: entry.method || invoice.paymentMethod || '',
        paidOn: entry.paidOn || invoice.paymentDate || '',
        transactionReference: entry.transactionReference || '',
        bank: entry.bank || ''
      });
    });
  });
  advicesStore.all.forEach((advice) => {
    const sameVendor =
      (vendorId && advice.vendorId === vendorId) ||
      String(advice.vendor || '').trim().toLowerCase() === String(vendorName || '').trim().toLowerCase();
    if (!sameVendor) return;
    rows.push({
      paymentNo: advice.paymentNo || '',
      invoiceNo: advice.invoiceNo || '',
      poNo: advice.poNo || '',
      invoiceId: advice.invoiceNo || '',
      amount: Number(advice.amount) || 0,
      currency: advice.currency || 'INR',
      method: advice.method || '',
      paidOn: advice.paidOn || '',
      transactionReference: advice.transactionReference || '',
      bank: advice.bank || ''
    });
  });
  rows.sort((a, b) => String(b.paidOn).localeCompare(String(a.paidOn)));
  return rows;
}

/**
 * Full supplier master transaction view — every real document linked to
 * the supplier with a ready-to-render subset and its route.
 */
export async function getSupplierTransactions(vendor = {}) {
  await delay();
  const name = vendor.name || '';
  const ctx = supplierTransactionContext(vendor);
  const quotedVendor = (record) =>
    String(record.vendor || record.vendorName || '').trim().toLowerCase() === String(name).trim().toLowerCase();

  const invitedRfqs = ctx.rfqs.filter((rfq) =>
    (rfq.vendors || []).some((invited) =>
      String(invited).trim().toLowerCase() === String(name).trim().toLowerCase() ||
      String(invited).trim().toLowerCase().includes(String(name).trim().toLowerCase())
    )
  );
  const quotations = ctx.quotations.filter(quotedVendor);
  const orders = ctx.orders.filter(quotedVendor);
  const grns = ctx.grns.filter(quotedVendor);
  const inspections = ctx.inspections.filter(quotedVendor);
  const shipments = ctx.shipments.filter(quotedVendor);
  const invoices = ctx.invoices.filter(quotedVendor);

  const sortByDateDesc = (records, key = 'createdAt') =>
    [...records].sort((a, b) => String(b[key] || '').localeCompare(String(a[key] || '')));

  return {
    vendor: clone(vendor),
    metrics: computeSupplierMetrics(vendor),
    counts: {
      rfq: invitedRfqs.length,
      quotation: quotations.length,
      po: orders.length,
      grn: grns.length,
      inspection: inspections.length,
      shipment: shipments.length,
      invoice: invoices.length,
      payment: paymentRowsFor(name, vendor.id).length
    },
    rows: {
      rfqs: sortByDateDesc(invitedRfqs.map((rfq) => ({
        id: rfq.rfqNo,
        docNo: rfq.rfqNo,
        title: rfq.title || '',
        date: rfq.createdAt || '',
        amount: rfq.estimatedValue ?? (rfq.items || []).reduce(
          (sum, item) => sum + Number(item.qty || 0) * Number((item.rate ?? item.expectedRate) || 0),
          0
        ),
        currency: rfq.currency || 'INR',
        status: rfq.status || '',
        url: `/purchase/rfq/${encodeURIComponent(rfq.rfqNo)}`
      }))),
      quotations: sortByDateDesc(quotations, 'submittedOn').map((quote) => ({
        id: quote.id,
        docNo: quote.quotationNo || quote.id,
        title: quote.rfqNo || '',
        date: quote.submittedOn || '',
        amount: Number(quote.total) || 0,
        currency: quote.currency || 'INR',
        status: quote.status || '',
        url: `/purchase/rfq/quotations/${encodeURIComponent(quote.id)}`
      })),
      orders: sortByDateDesc(orders, 'orderDate').map((order) => ({
        id: order.poNo,
        docNo: order.poNo,
        title: order.title || '',
        date: order.orderDate || '',
        amount: Number(order.amount) || 0,
        currency: order.currency || 'INR',
        status: order.status || '',
        url: `/purchase/orders/${encodeURIComponent(order.poNo)}`
      })),
      grns: sortByDateDesc(grns, 'receivedAt').map((grn) => ({
        id: grn.grnNo,
        docNo: grn.grnNo,
        title: grn.poNo || '',
        date: grn.receivedAt || grn.receivedOn || '',
        amount: 0,
        currency: '',
        status: grn.status || '',
        url: `/purchase/logistics/grn/${encodeURIComponent(grn.grnNo)}`
      })),
      inspections: sortByDateDesc(inspections, 'inspectedOn').map((inspection) => ({
        id: inspection.inspectionNo,
        docNo: inspection.inspectionNo,
        title: inspection.grnNo || inspection.poNo || '',
        date: inspection.inspectedOn || '',
        amount: 0,
        currency: '',
        status: inspection.status || '',
        url: `/purchase/logistics/quality/${encodeURIComponent(inspection.inspectionNo)}`
      })),
      invoices: sortByDateDesc(invoices, 'invoiceDate').map((invoice) => ({
        id: invoice.id || invoice.invoiceNo,
        docNo: invoice.invoiceNo,
        title: invoice.poNo || '',
        date: invoice.invoiceDate || '',
        amount: Number(invoice.total) || 0,
        currency: invoice.currency || 'INR',
        status: invoice.status || '',
        url: `/purchase/invoices/${encodeURIComponent(invoice.id || invoice.invoiceNo)}`
      })),
      payments: paymentRowsFor(name, vendor.id).map((payment) => ({
        ...payment,
        url: payment.invoiceId
          ? `/purchase/invoices/${encodeURIComponent(payment.invoiceId)}`
          : `/purchase/payments/${encodeURIComponent(payment.paymentNo || '')}/360`
      }))
    }
  };
}

/**
 * Performance board rows for the active supplier list — each row is the
 * supplier record with effective (transaction-derived, fallback-stored)
 * aggregates applied.
 */
export async function supplierPerformanceBoard(activeVendors = []) {
  await delay();
  return activeVendors.map((vendor) => withEffectiveMetrics(vendor));
}
