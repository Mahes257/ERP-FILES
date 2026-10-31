/**
 * purchase/services/dashboard.js
 * ------------------------------------------------------------------
 * Dashboard service — calculates ALL metrics from live application
 * stores. All calculations accept a `period` parameter for global
 * date filtering. No static arrays, no hardcoded numbers.
 *
 * Data flow:
 *   Requisitions → RFQs → Quotations → Comparison → Negotiation →
 *   Evaluation → Selection → POs → Delivery → Invoices → Payments
 * ------------------------------------------------------------------
 */
import { delay } from './base';
import { safeGetTime } from '../utils/helpers';
import { PO_STATUS, PR_RECORD_STATE, PR_STATUS, RFQ_STATUS, normalizePoRecord } from '../constants';
import { requisitionsStore } from './requisition';
import { vendorsStore } from './vendor';
import { ordersStore } from './purchaseOrder';
import { invoicesStore } from './invoice';
import { isOpenRfq, rfqsStore } from './rfq';
import { grnsStore } from './logistics';
/* nfa only provides the Approval-Flow RFQ-status repair at call time
   (no cycle: nfa never imports dashboard). */
import { repairRfqApprovalStatuses } from './nfa';
import { purchaseGet } from '../api';
import { unwrapResponse } from './api-client';
import { requisitionApi } from './api/requisitionApi';

/* ------------------------------------------------------------------ */
/*  Non-deleted requisitions — canonical active pool for dashboard      */
/* ------------------------------------------------------------------ */
function activeRequisitions() {
  return requisitionsStore.all.filter(
    (r) => (r.recordState || PR_RECORD_STATE.ACTIVE) !== PR_RECORD_STATE.DELETED
  );
}

/* ------------------------------------------------------------------ */
/*  Centralized date filtering                                         */
/* ------------------------------------------------------------------ */

function getPeriodRange(period) {
  const now = new Date();

  switch (period) {
    case 'month': {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
      return { start: monthStart, end: Infinity, label: `${now.toLocaleString('en-US', { month: 'long' })} ${now.getFullYear()}` };
    }
    case 'quarter': {
      const q = Math.floor(now.getMonth() / 3);
      const quarterStart = new Date(now.getFullYear(), q * 3, 1).getTime();
      return { start: quarterStart, end: Infinity, label: `Q${q + 1} ${now.getFullYear()}` };
    }
    case 'year': {
      const yearStart = new Date(now.getFullYear(), 0, 1).getTime();
      return { start: yearStart, end: Infinity, label: `${now.getFullYear()}` };
    }
    case 'all':
    default:
      return { start: 0, end: Infinity, label: 'All Time' };
  }
}

function getEntityDate(record, dateField) {
  if (!record) return 0;
  /* Try the primary field, then common fallbacks */
  const val = record[dateField] || record.createdAt || record.date || record.orderDate;
  if (!val) return 0;
  const t = new Date(val).getTime();
  return isNaN(t) ? 0 : t;
}

function withinPeriod(record, period, dateField = 'createdAt') {
  if (period === 'all') return true;
  const { start, end } = getPeriodRange(period);
  const t = getEntityDate(record, dateField);
  return t >= start && t <= end;
}

function filterRecords(records, period, dateField = 'createdAt') {
  if (period === 'all') return records;
  const { start, end } = getPeriodRange(period);
  return records.filter((r) => {
    const t = getEntityDate(r, dateField);
    return t >= start && t <= end;
  });
}

/* ------------------------------------------------------------------ */
/*  Compute requisition value from items (requisitions have no top-level */
/*  amount field — it must be derived from qty × rate)                  */
/* ------------------------------------------------------------------ */
function requisitionAmount(r) {
  return Number(r.amount) || (Array.isArray(r.items)
    ? r.items.reduce((sum, it) => sum + (Number(it.qty) || 0) * (Number(it.rate) || 0), 0)
    : 0);
}

/* ------------------------------------------------------------------ */
/*  Dashboard Stats — real-time KPI calculations                       */
/* ------------------------------------------------------------------ */
function calcDashboardStats(period = 'all') {
  const requisitions = filterRecords(activeRequisitions(), period, 'createdAt');
  const orders = filterRecords(ordersStore.all, period, 'orderDate');
  const invoices = filterRecords(invoicesStore.all, period, 'invoiceDate');

  const pendingApproval = requisitions.filter(
    (r) => r.status === 'Pending Approval'
  ).length;

  const openRfq = rfqsStore.all.filter((r) => isOpenRfq(r) && withinPeriod(r, period, 'createdAt')).length;

  const activeStatuses = [
    PO_STATUS.DRAFT, PO_STATUS.PENDING_APPROVAL, PO_STATUS.APPROVED,
    PO_STATUS.RELEASED, PO_STATUS.SUPPLIER_ACKNOWLEDGED,
    PO_STATUS.IN_PROGRESS, PO_STATUS.PARTIALLY_DELIVERED
  ];
  const openOrders = orders.filter((o) => activeStatuses.includes(normalizePoRecord(o).status)).length;
  const pendingInvoice = invoices.filter((i) =>
    ['Submitted', 'Approved', 'Overdue'].includes(i.status)
  ).length;

  /* Period purchase value — sum of orders within period */
  const periodPurchaseValue = orders
    .reduce((sum, o) => sum + (Number(o.amount) || 0), 0);

  return {
    totalPurchaseRequests: requisitions.length,
    pendingApproval,
    openRfq,
    openPurchaseOrders: openOrders,
    pendingInvoice,
    periodPurchaseValue,
  };
}

/* ------------------------------------------------------------------ */
/*  Recent Requests — latest PRs sorted by creation date               */
/* ------------------------------------------------------------------ */
function calcRecentRequests(limit = 8, period = 'all') {
  const filtered = filterRecords(activeRequisitions(), period, 'createdAt');
  return [...filtered]
    .sort((a, b) => safeGetTime(b.createdAt) - safeGetTime(a.createdAt))
    .slice(0, limit)
    .map((r) => ({
      id: r.id,
      prNo: r.prNo,
      title: r.title || r.description || '',
      department: r.department || '',
      requester: r.requester || '',
      priority: r.priority || 'Medium',
      status: r.status || '',
      amount: requisitionAmount(r),
      expectedDate: r.expectedDate || r.requiredDate || '',
      createdAt: r.createdAt || '',
    }));
}

/* ------------------------------------------------------------------ */
/*  Pending Approvals — all types of pending approvals                  */
/* ------------------------------------------------------------------ */
function calcPendingApprovals(period = 'all') {
  return activeRequisitions()
    .filter((r) => r.status === 'Pending Approval' && withinPeriod(r, period, 'createdAt'))
    .sort((a, b) => {
      /* Priority sort: Critical > High > Medium > Low */
      const order = { Critical: 0, High: 1, Medium: 2, Low: 3 };
      const pa = order[a.priority] ?? 2;
      const pb = order[b.priority] ?? 2;
      if (pa !== pb) return pa - pb;
      /* Then oldest first */
      return safeGetTime(a.createdAt) - safeGetTime(b.createdAt);
    })
    .map((r) => ({
      id: r.id,
      prNo: r.prNo,
      title: r.title || r.description || '',
      requester: r.requester || '',
      department: r.department || '',
      amount: requisitionAmount(r),
      priority: r.priority || 'Medium',
      status: r.status,
      date: r.date || r.createdAt || '',
      createdAt: r.createdAt || '',
    }));
}

/* ------------------------------------------------------------------ */
/*  PO Status — real-time counts including overdue                     */
/* ------------------------------------------------------------------ */
function calcPurchaseOrderStatus(period = 'all') {
  const records = filterRecords(ordersStore.all, period, 'orderDate').map(normalizePoRecord);
  const activeStages = [
    PO_STATUS.DRAFT, PO_STATUS.PENDING_APPROVAL, PO_STATUS.APPROVED,
    PO_STATUS.RELEASED, PO_STATUS.SUPPLIER_ACKNOWLEDGED, PO_STATUS.IN_PROGRESS
  ];
  const open = records.filter((o) => activeStages.includes(o.status)).length;
  const partial = records.filter((o) => o.status === PO_STATUS.PARTIALLY_DELIVERED).length;
  const completed = records.filter((o) => o.status === PO_STATUS.COMPLETED).length;
  const total = open + partial + completed;
  return { open, partial, completed, total };
}

/* ------------------------------------------------------------------ */
/*  Monthly Analytics — spend per month calculated from PO data        */
/* ------------------------------------------------------------------ */
function calcMonthlyAnalytics(period = 'all') {
  const allOrders = ordersStore.all;
  const months = [];
  const values = [];
  const now = new Date();
  const range = getPeriodRange(period);

  if (period === 'all') {
    /* Show last 6 months */
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const label = d.toLocaleString('en-US', { month: 'short', year: '2-digit' });
      const monthStart = d.getTime();
      const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0).getTime();
      const value = allOrders
        .filter((o) => {
          const t = getEntityDate(o, 'orderDate');
          return t >= monthStart && t <= monthEnd;
        })
        .reduce((sum, o) => sum + (Number(o.amount) || 0), 0);
      months.push(label);
      values.push(Math.round(value));
    }
  } else {
    /* For period filter, show weeks within the period */
    const start = new Date(range.start);
    const end = new Date();
    const totalWeeks = Math.max(1, Math.ceil((end - start) / (7 * 24 * 60 * 60 * 1000)));
    const showWeeks = Math.min(6, totalWeeks);
    const weekSize = totalWeeks / showWeeks;

    for (let i = 0; i < showWeeks; i++) {
      const weekStart = new Date(start.getTime() + (i * weekSize) * 7 * 24 * 60 * 60 * 1000);
      const weekEnd = new Date(start.getTime() + ((i + 1) * weekSize) * 7 * 24 * 60 * 60 * 1000);
      const label = weekStart.toLocaleString('en-US', { month: 'short', day: 'numeric' });
      const value = allOrders
        .filter((o) => {
          const t = getEntityDate(o, 'orderDate');
          return t >= weekStart.getTime() && t <= weekEnd.getTime();
        })
        .reduce((sum, o) => sum + (Number(o.amount) || 0), 0);
      months.push(label);
      values.push(Math.round(value));
    }
  }

  return { labels: months, values };
}

/* ------------------------------------------------------------------ */
/*  Top Vendors — ranked by actual purchase spend                      */
/* ------------------------------------------------------------------ */
function calcTopVendors(limit = 5, period = 'all') {
  const orders = filterRecords(ordersStore.all, period, 'orderDate');
  const vendors = vendorsStore.all;

  /* Build spend map from actual PO data */
  const spendMap = {};
  const ordersMap = {};
  orders.forEach((o) => {
    const v = o.vendor;
    if (!v) return;
    spendMap[v] = (spendMap[v] || 0) + (Number(o.amount) || 0);
    ordersMap[v] = (ordersMap[v] || 0) + 1;
  });

  /* Merge with vendor master data */
  const result = vendors.map((v) => ({
    id: v.id,
    name: v.name,
    category: v.category || 'General',
    orders: ordersMap[v.name] || 0,
    spend: spendMap[v.name] || 0,
    rating: v.rating ?? 0,
  }));

  return result
    .sort((a, b) => b.spend - a.spend)
    .slice(0, limit);
}

/* ------------------------------------------------------------------ */
/*  Sourcing Snapshot — RFQ pipeline from live data                     */
/* ------------------------------------------------------------------ */
function calcSourcingSnapshot(period = 'all') {
  const rfqs = filterRecords(rfqsStore.all, period, 'createdAt');
  const openRfqs = rfqs.filter(isOpenRfq).length;
  const quotationsReceived = rfqs.filter(
    (r) => r.status === RFQ_STATUS.QUOTATION_RECEIVED
  ).length;
  const inEvaluation = rfqs.filter(
    (r) => r.status === RFQ_STATUS.EVALUATION
  ).length;
  const negotiationPending = rfqs.filter(
    (r) => r.status === RFQ_STATUS.SENT || r.status === RFQ_STATUS.QUOTATION_RECEIVED
  ).length;
  const selectionPending = rfqs.filter(
    (r) => r.status === RFQ_STATUS.EVALUATION
  ).length;

  return { openRfqs, quotationsReceived, inEvaluation, negotiationPending, selectionPending };
}

/* ------------------------------------------------------------------ */
/*  Approval Breakdown — counts by document type                       */
/* ------------------------------------------------------------------ */
function calcApprovalBreakdown(period = 'all') {
  const prPending = activeRequisitions().filter(
    (r) => r.status === 'Pending Approval' && withinPeriod(r, period, 'createdAt')
  ).length;
  /* Pending RFQ approvals include the Approval Flow stages — the RFQ
     status tracks the NFA note (Pending → 1st → 2nd → Final Approval)
     until the final approval, see nfa.syncRfqStatus. */
  const rfqPending = rfqsStore.all.filter(
    (r) =>
      [
        RFQ_STATUS.PENDING_APPROVAL,
        RFQ_STATUS.FIRST_APPROVAL,
        RFQ_STATUS.SECOND_APPROVAL,
        RFQ_STATUS.FINAL_APPROVAL
      ].includes(r.status) &&
      withinPeriod(r, period, 'createdAt')
  ).length;
  const poPending = ordersStore.all.filter(
    (o) => (o.approvalStatus === 'Pending' || o.status === 'Pending Approval') && withinPeriod(o, period, 'orderDate')
  ).length;
  const invoicePending = invoicesStore.all.filter(
    (i) => i.status === 'Submitted' && withinPeriod(i, period, 'invoiceDate')
  ).length;
  return { prPending, rfqPending, poPending, invoicePending };
}

/* ------------------------------------------------------------------ */
/*  Financial Snapshot — values matching Invoice/Payment/Reports        */
/* ------------------------------------------------------------------ */

/* Net movement of APPROVED credit / debit notes persisted on the
   invoice row (debit − credit) — negative for credit notes, so an
   approved credit note reduces every dashboard balance figure, exactly
   as it does in Reports (services/reports.js). */
function invoiceAdjustmentNet(invoice) {
  const adj = invoice && typeof invoice.adjustments === 'object' && invoice.adjustments ? invoice.adjustments : null;
  if (!adj) return 0;
  return (Number(adj.debit) || 0) - (Number(adj.credit) || 0);
}

function calcFinancialSnapshot(period = 'all') {
  const orders = filterRecords(ordersStore.all, period, 'orderDate');
  const invoices = filterRecords(invoicesStore.all, period, 'invoiceDate');

  const totalPoValue = orders.reduce((sum, o) => sum + (Number(o.amount) || 0), 0);
  const totalInvoiced = invoices.reduce((sum, i) => sum + (Number(i.total) || 0), 0);
  const adjustmentNet = invoices.reduce((sum, i) => sum + invoiceAdjustmentNet(i), 0);
  const totalPaid = invoices
    .filter((i) => i.status === 'Paid')
    .reduce((sum, i) => sum + (Number(i.total) || 0), 0);
  const outstanding = Math.max(0, totalInvoiced + adjustmentNet - totalPaid);
  const overdue = invoices
    .filter((i) => i.status === 'Overdue')
    .reduce((sum, i) => sum + (Number(i.total) || 0) + invoiceAdjustmentNet(i), 0);

  /* Period spend */
  const periodSpend = orders.reduce((sum, o) => sum + (Number(o.amount) || 0), 0);

  return { totalPoValue, totalInvoiced, totalPaid, outstanding, overdue, periodSpend };
}

/* ------------------------------------------------------------------ */
/*  Procurement Alerts — real actionable issues                        */
/* ------------------------------------------------------------------ */
function calcAlerts(period = 'all') {
  const alerts = [];
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);

  /* PR approval overdue (pending > 3 days) */
  activeRequisitions()
    .filter((r) => r.status === 'Pending Approval' && withinPeriod(r, period, 'createdAt'))
    .forEach((r) => {
      const created = safeGetTime(r.createdAt);
      const daysPending = Math.floor((now.getTime() - created) / (1000 * 60 * 60 * 24));
      if (daysPending > 3) {
        alerts.push({
          id: `alert-pr-${r.id}`,
          severity: daysPending > 7 ? 'critical' : 'warning',
          type: 'PR Approval Overdue',
          document: r.prNo,
          vendor: r.requester || '',
          description: `Pending approval for ${daysPending} days`,
          date: r.createdAt || '',
          route: '/purchase/requisition/approval',
        });
      }
    });

  /* PO delivery overdue */
  ordersStore.all
    .filter((o) => o.status !== 'Completed' && o.status !== 'Cancelled' && withinPeriod(o, period, 'orderDate'))
    .forEach((o) => {
      if (o.expectedDate && o.expectedDate < todayStr) {
        alerts.push({
          id: `alert-po-${o.id}`,
          severity: 'critical',
          type: 'PO Delivery Overdue',
          document: o.poNo,
          vendor: o.vendor || '',
          description: `Expected by ${o.expectedDate}`,
          date: o.orderDate || '',
          route: '/purchase/orders',
        });
      }
    });

  /* Invoice mismatch */
  invoicesStore.all
    .filter((i) => (i.matchStatus === 'Mismatch' || i.matchStatus === 'Exception') && withinPeriod(i, period, 'invoiceDate'))
    .forEach((i) => {
      alerts.push({
        id: `alert-inv-${i.id}`,
        severity: 'warning',
        type: 'Invoice Mismatch',
        document: i.invoiceNo,
        vendor: i.vendor || '',
        description: `Match status: ${i.matchStatus}`,
        date: i.invoiceDate || '',
        route: '/purchase/invoices/three-way-matching',
      });
    });

  /* Payment overdue */
  invoicesStore.all
    .filter((i) => i.status === 'Overdue' && withinPeriod(i, period, 'invoiceDate'))
    .forEach((i) => {
      alerts.push({
        id: `alert-pay-${i.id}`,
        severity: 'critical',
        type: 'Payment Overdue',
        document: i.invoiceNo,
        vendor: i.vendor || '',
        description: `Amount: ₹${Number(i.total || 0).toLocaleString('en-IN')}`,
        date: i.dueDate || '',
        route: '/purchase/invoices/vendor-payment',
      });
    });

  /* Sort: critical first, then by date */
  const severityOrder = { critical: 0, warning: 1, info: 2 };
  return alerts
    .sort((a, b) => (severityOrder[a.severity] ?? 2) - (severityOrder[b.severity] ?? 2))
    .slice(0, 10);
}

/* ------------------------------------------------------------------ */
/*  Pipeline Stages — real counts per procurement stage                 */
/*  Keys match the PIPELINE config in Dashboard.jsx.                   */
/*  Stages with no backend data source default to 0.                   */
/* ------------------------------------------------------------------ */
function calcPipelineStages(period = 'all') {
  const requisitions = filterRecords(activeRequisitions(), period, 'createdAt');
  const allRfqs = filterRecords(rfqsStore.all, period, 'createdAt');
  const orders = filterRecords(ordersStore.all, period, 'orderDate');
  const invoices = filterRecords(invoicesStore.all, period, 'invoiceDate');
  const grns = filterRecords(grnsStore.all, period, 'createdAt');

  return {
    pr: requisitions.length,
    rfq: allRfqs.length,
    quotations: allRfqs.filter((r) =>
      r.status === RFQ_STATUS.QUOTATION_RECEIVED || r.status === RFQ_STATUS.EVALUATION
    ).length,
    techEval: allRfqs.filter((r) => r.status === RFQ_STATUS.EVALUATION).length,
    pcs: allRfqs.filter((r) =>
      r.status === RFQ_STATUS.QUOTATION_RECEIVED || r.status === RFQ_STATUS.EVALUATION
    ).length,
    negotiation: allRfqs.filter((r) => r.status === RFQ_STATUS.SENT || r.status === RFQ_STATUS.QUOTATION_RECEIVED).length,
    approval: 0,
    po: orders.length,
    grn: grns.length,
    invoice: invoices.length,
    payment: 0,
    /* Legacy keys kept for backwards compatibility with other consumers */
    comparison: allRfqs.filter((r) => r.status === RFQ_STATUS.EVALUATION).length,
    evaluation: allRfqs.filter((r) => r.status === RFQ_STATUS.EVALUATION).length,
    selection: allRfqs.filter((r) => r.status === RFQ_STATUS.EVALUATION).length,
    delivery: grns.length,
  };
}

/* ------------------------------------------------------------------ */
/*  Public API — mocked service with real calculations                  */
/* ------------------------------------------------------------------ */
export const mockDashboardService = {
  async getDashboardStats(period) {
    await delay();
    return calcDashboardStats(period);
  },
  async getRecentRequests(limit, period) {
    await delay();
    return calcRecentRequests(limit, period);
  },
  async getPendingApprovals(period) {
    await delay();
    return calcPendingApprovals(period);
  },
  async getPurchaseOrderStatus(period) {
    await delay();
    return calcPurchaseOrderStatus(period);
  },
  async getMonthlyAnalytics(period) {
    await delay();
    return calcMonthlyAnalytics(period);
  },
  async getTopVendors(limit, period) {
    await delay();
    return calcTopVendors(limit, period);
  },
  async getSourcingSnapshot(period) {
    await delay();
    return calcSourcingSnapshot(period);
  },
  async getApprovalBreakdown(period) {
    await delay();
    /* Approval counts read the shared RFQ status — heal any stale
       record first so the dashboard reports the Approval Flow state. */
    repairRfqApprovalStatuses();
    return calcApprovalBreakdown(period);
  },
  async getFinancialSnapshot(period) {
    await delay();
    return calcFinancialSnapshot(period);
  },
  async getAlerts(period) {
    await delay();
    return calcAlerts(period);
  },
  async getPipelineStages(period) {
    await delay();
    return calcPipelineStages(period);
  },
};

/**
 * API-first dashboard service facade. Currently delegates to mock
 * calculations which read from live stores. When real endpoints are
 * available, the API branch can be activated.
 */
export const dashboardService = {
  async getDashboardStats() {
    const { data } = await purchaseGet('/dashboard/stats');
    const stats = unwrapResponse(data) || {};
    return {
      ...stats,
      totalPurchaseRequests: stats.totalPRs ?? stats.totalRequisitions ?? 0,
      pendingApproval: stats.pendingPRApprovals ?? 0,
      openRfq: stats.openRFQs ?? stats.openRfq ?? 0,
      openPurchaseOrders: stats.openPOs ?? 0,
      pendingInvoice: (stats.pendingInvoiceMatching ?? 0) + (stats.pendingInvoiceApprovals ?? 0)
    };
  },
  async getRecentRequests(limit) {
    const page = await requisitionApi.list({ page: 1, pageSize: limit || 8, sortBy: 'createdAt', sortDir: 'desc' });
    const records = (page.data || []).filter((record) => record.recordState !== PR_RECORD_STATE.DELETED);
    return records.slice(0, limit || 8).map((record) => ({
      id: record.id,
      prNo: record.prNo,
      title: record.title || '',
      department: record.department || '',
      requester: record.requester || '',
      priority: record.priority || 'Medium',
      status: record.status || '',
      amount: Number(record.amount) || 0,
      expectedDate: record.expectedDate || '',
      createdAt: record.createdAt || ''
    }));
  },
  async getPendingApprovals() {
    const page = await requisitionApi.list({
      page: 1,
      pageSize: 500,
      status: PR_STATUS.PENDING_APPROVAL,
      sortBy: 'createdAt',
      sortDir: 'asc'
    });
    return (page.data || [])
      .filter((record) => record.recordState !== PR_RECORD_STATE.DELETED)
      .map((record) => ({
        id: record.id,
        prNo: record.prNo,
        title: record.title || record.prNo,
        requester: record.requester || '',
        department: record.department || '',
        amount: Number(record.amount) || 0,
        priority: record.priority || 'Medium',
        status: record.status,
        date: record.date || record.createdAt || '',
        createdAt: record.createdAt || ''
      }));
  },
  async getPurchaseOrderStatus(period) {
    return mockDashboardService.getPurchaseOrderStatus(period);
  },
  async getMonthlyAnalytics(period) {
    return mockDashboardService.getMonthlyAnalytics(period);
  },
  async getTopVendors(limit, period) {
    return mockDashboardService.getTopVendors(limit, period);
  },
  async getSourcingSnapshot(period) {
    return mockDashboardService.getSourcingSnapshot(period);
  },
  async getApprovalBreakdown(period) {
    return mockDashboardService.getApprovalBreakdown(period);
  },
  async getFinancialSnapshot(period) {
    return mockDashboardService.getFinancialSnapshot(period);
  },
  async getAlerts(period) {
    return mockDashboardService.getAlerts(period);
  },
  async getPipelineStages(period) {
    return mockDashboardService.getPipelineStages(period);
  },
};
