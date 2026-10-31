import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users, Star, FileText, BadgeCheck, PackageCheck, Truck, Receipt,
  FileSpreadsheet, Banknote, CreditCard, FolderKanban, TrendingUp,
  Clock, AlertTriangle, CheckCircle, ArrowRight, ChevronRight,
  FileSignature, PhoneCall, MapPin, CalendarDays,
  ClipboardList, ClipboardCheck, DollarSign, Navigation, Megaphone, Settings, LayoutDashboard,
  Handshake, Factory, ShieldCheck, Package, Wallet, Wrench, BarChart3,
  PauseCircle, Send, Box, Flame, Building2, FileSearch, FileCheck2, ListChecks
} from 'lucide-react';
import api from '../api/axiosInstance';
import useVisibleInterval from '../hooks/useVisibleInterval';
import SalesKpiCards from '../components/SalesTable/SalesKpiCards';
import '../pages/crm/crm-erp.css';

// Indian-format currency for money KPIs (e.g. ₹30,970).
const fmtINR = (v) => v == null || Number(v) === 0
  ? '₹0'
  : Number(v).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

/**
 * Dashboard — Enterprise overview of Marketing + Sales operations.
 *
 * Architecture:
 *   1. Top KPI Summary — Marketing + Sales combined
 *   2. Marketing Overview — visits, travel, Q Forms, expenses
 *   3. Sales Workflow — stage-by-stage flow with real counts
 *   3b. Purchase Workflow — PR → Vendors → RFQ → PO → GRN → Invoice →
 *       Work Queue, read from the Purchase module's own aggregation
 *   4. Pending Actions — actionable items from both modules
 *   5. Attention Required — overdue/alert items
 *
 * All values from MySQL via backend APIs. The Purchase section reads
 * GET /api/purchase/dashboard/stats — the same endpoint (and the same
 * COUNT queries) the Purchase dashboard and Work Queue use, so a number here
 * can never disagree with the module it links to. If that read fails the
 * section says so instead of rendering zeros.
 * KPI clicks navigate to correct module with filter.
 */

export default function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState({});
  const [mktDashboard, setMktDashboard] = useState(null);
  /* Purchase aggregation: `stats` null + `error` set means the read FAILED —
     the section then reports the failure instead of showing zero counts. */
  const [purchase, setPurchase] = useState({ stats: null, error: null });
  const [loading, setLoading] = useState(true);
  /* Async-read guards: a response that lands after unmount, or after a newer
     read has started, must never write state. */
  const mountedRef = useRef(true);
  const readSeqRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  /**
   * Read the three aggregations, then apply them.
   *
   * Every request is awaited BEFORE the first state write, which is why the
   * mount effect below is not a synchronous setState inside an effect: the
   * loader is already on screen because `loading` starts true.
   */
  const loadStats = useCallback(async () => {
    const seq = ++readSeqRef.current;
    const apply = (fn) => {
      if (!mountedRef.current || seq !== readSeqRef.current) return;
      fn();
    };

    try {
      const [salesRes, mktRes, purchaseRes] = await Promise.allSettled([
        api.get('/dashboard/stats'),
        api.get('/marketing/dashboard'),
        /* Purchase module aggregation. suppressGlobalError: the dashboard is
           readable by roles without PURCHASE_VIEW, and those must see the
           section's own "unavailable" state rather than a global error toast. */
        api.get('/api/purchase/dashboard/stats', { suppressGlobalError: true }),
      ]);
      apply(() => {
        if (salesRes.status === 'fulfilled') setStats(salesRes.value.data ?? {});
        // /marketing/dashboard returns ApiResponse { success, message, data } — unwrap
        // the envelope so the Marketing KPIs read the real aggregated values.
        if (mktRes.status === 'fulfilled') setMktDashboard(mktRes.value.data?.data ?? null);
        if (purchaseRes.status === 'fulfilled') {
          setPurchase({ stats: purchaseRes.value.data?.data ?? null, error: null });
        } else {
          setPurchase({
            stats: null,
            error: purchaseRes.reason?.response?.data?.message
              || purchaseRes.reason?.message
              || 'Purchase data could not be loaded.',
          });
        }
        setLoading(false);
      });
    } catch {
      apply(() => {
        setStats({});
        setMktDashboard(null);
        setPurchase({ stats: null, error: 'Purchase data could not be loaded.' });
        setLoading(false);
      });
    }
  }, []);

  // Initial read. `loading` is already true, so the loader is on screen while
  // these requests are in flight.
  useEffect(() => { loadStats(); }, [loadStats]);

  // Auto-refresh every 60 seconds — suspended while the tab is hidden, with a
  // single catch-up read when it becomes visible again. A refresh re-shows the
  // loader exactly as it always has.
  const refreshStats = useCallback(() => {
    setLoading(true);
    loadStats();
  }, [loadStats]);
  useVisibleInterval(refreshStats, 60000);

  const s = stats; // shorthand

  // ================================================================
  // Navigation helper
  // ================================================================
  const goTo = useCallback((path, filter) => {
    if (filter) {
      navigate(`${path}?status=${encodeURIComponent(filter)}`);
    } else {
      navigate(path);
    }
  }, [navigate]);

  // ================================================================
  // 1. TOP KPI SUMMARY — Marketing + Sales combined
  // ================================================================
  const topKpis = useMemo(() => {
    const items = [];
    // Marketing KPIs
    if (mktDashboard) {
      const om = mktDashboard.offlineMarketing || {};
      items.push(
        { key: 'totalVisits', label: 'Total Visits', value: om.totalVisits || 0, icon: MapPin, color: '#0891B2', bg: 'rgba(8,145,178,0.10)', route: '/marketing' },
        { key: 'todayVisits', label: "Today's Visits", value: om.todayVisits || 0, icon: CalendarDays, color: '#16A34A', bg: 'rgba(22,163,74,0.10)', route: '/marketing' },
        { key: 'upcomingVisits', label: 'Upcoming Visits', value: om.upcomingVisits || 0, icon: Navigation, color: '#2563EB', bg: 'rgba(37,99,235,0.10)', route: '/marketing' },
        { key: 'overdueFollowups', label: 'Overdue Follow-ups', value: om.overdueFollowUps || 0, icon: AlertTriangle, color: '#DC2626', bg: 'rgba(220,38,38,0.10)', route: '/marketing' },
      );
      const tp = mktDashboard.travelPlans || {};
      items.push(
        { key: 'travelPlans', label: 'Travel Registries', value: tp.total || 0, icon: Navigation, color: '#7C3AED', bg: 'rgba(124,58,237,0.10)', route: '/marketing/travel-planners' },
      );
      const qf = mktDashboard.qForms || {};
      items.push(
        { key: 'qForms', label: 'Q Forms', value: qf.total || 0, icon: ClipboardList, color: '#D97706', bg: 'rgba(217,119,6,0.10)', route: '/marketing/q-forms' },
      );
      const ex = mktDashboard.expenses || {};
      items.push(
        { key: 'marketingExpenses', label: 'Marketing Expenses', value: fmtINR(ex.totalAmount), icon: DollarSign, color: '#E11D48', bg: 'rgba(225,29,72,0.10)', route: '/marketing/expenses' },
      );
    }
    // Production KPIs — real values from GET /dashboard/stats (production_orders table)
    const p = {
      total: s.productionTotalOrders || 0,
      pendingApproval: s.productionPendingApproval || 0,
      inProgress: s.productionInProgress || 0,
      onHold: s.productionOnHold || 0,
      completed: s.productionCompleted || 0,
      averageProgress: s.productionAverageProgress ?? 0,
    };
    items.push(
      { key: 'productionTotalOrders', label: 'Total Production Work Orders', value: p.total, icon: Factory, color: '#0B4A3D', bg: 'rgba(11,74,61,0.10)', route: '/production/orders' },
      { key: 'productionPendingApproval', label: 'Pending Approval', value: p.pendingApproval, icon: Clock, color: '#f59e0b', bg: 'rgba(245,158,11,0.10)', route: '/production/orders' },
      { key: 'productionInProgress', label: 'In Progress', value: p.inProgress, icon: Wrench, color: '#2563EB', bg: 'rgba(37,99,235,0.10)', route: '/production/orders' },
      { key: 'productionOnHold', label: 'On Hold', value: p.onHold, icon: PauseCircle, color: '#6B7280', bg: 'rgba(107,114,128,0.10)', route: '/production/orders' },
      { key: 'productionCompleted', label: 'Completed', value: p.completed, icon: CheckCircle, color: '#16A34A', bg: 'rgba(22,163,74,0.10)', route: '/production/orders' },
      { key: 'productionAverageProgress', label: 'Average Progress', value: `${p.averageProgress}%`, icon: BarChart3, color: '#0891B2', bg: 'rgba(8,145,178,0.10)', route: '/production/orders' },
    );
    // Sales KPIs
    items.push(
      { key: 'totalCustomers', label: 'Total Clients', value: s.totalCustomers || 0, icon: Users, color: '#16A34A', bg: 'rgba(22,163,74,0.10)', route: '/crm' },
      { key: 'activeLeads', label: 'Active Leads', value: s.activeLeads || 0, icon: Star, color: '#D97706', bg: 'rgba(217,119,6,0.10)', route: '/crm' },
      { key: 'totalCprs', label: 'Total CPRs', value: s.totalCprs || 0, icon: FolderKanban, color: '#0D9488', bg: 'rgba(13,148,136,0.10)', route: '/cprs' },
      { key: 'totalQuotations', label: 'Quotations', value: s.totalQuotations || 0, icon: FileText, color: '#2563EB', bg: 'rgba(37,99,235,0.10)', route: '/sales' },
      { key: 'totalSalesContracts', label: 'Sales Contracts', value: s.totalSalesContracts || 0, icon: BadgeCheck, color: '#4F46E5', bg: 'rgba(79,70,229,0.10)', route: '/sales' },
      { key: 'salesOrders', label: 'Customer POs', value: s.salesOrders || 0, icon: PackageCheck, color: '#0891B2', bg: 'rgba(8,145,178,0.10)', route: '/sales' },
      { key: 'totalDeliveryChallans', label: 'Delivery Challans', value: s.totalDeliveryChallans || 0, icon: Truck, color: '#D97706', bg: 'rgba(217,119,6,0.10)', route: '/sales' },
      { key: 'totalProformaInvoices', label: 'Proforma Invoices', value: s.totalProformaInvoices || 0, icon: Receipt, color: '#0891B2', bg: 'rgba(8,145,178,0.10)', route: '/sales' },
      { key: 'totalInvoices', label: 'Invoices', value: s.totalInvoices || 0, icon: FileSpreadsheet, color: '#7C3AED', bg: 'rgba(124,58,237,0.10)', route: '/sales' },
      { key: 'totalCreditNotes', label: 'Credit Notes', value: s.totalCreditNotes || 0, icon: CreditCard, color: '#C026D3', bg: 'rgba(192,38,211,0.10)', route: '/sales' },
      { key: 'totalPaymentReceipts', label: 'Payment Receipts', value: s.totalPaymentReceipts || 0, icon: Banknote, color: '#E11D48', bg: 'rgba(225,29,72,0.10)', route: '/sales' },
    );
    return items;
  }, [s, mktDashboard]);

  // ================================================================
  // 2. SALES WORKFLOW — stage-by-stage
  // ================================================================
  const salesWorkflow = useMemo(() => [
    {
      title: 'Leads', icon: Star, path: '/leads',
      items: [
        { label: 'Total', count: (s.activeLeads || 0) + (s.qualifiedLeads || 0) + (s.wonLeads || 0) + (s.lostLeads || 0) },
        { label: 'Active', count: s.activeLeads || 0, filter: 'Active' },
        { label: 'Qualified', count: s.qualifiedLeads || 0, filter: 'Qualified' },
        { label: 'Won', count: s.wonLeads || 0, filter: 'Won' },
        { label: 'Lost', count: s.lostLeads || 0, filter: 'Lost' },
      ],
    },
    {
      title: 'Clients', icon: Users, path: '/crm',
      items: [
        { label: 'Total', count: (s.clientsTotal ?? s.totalCustomers) || 0 },
        { label: 'Active', count: s.clientsActive || 0 },
      ],
    },
    {
      title: 'Follow-ups', icon: PhoneCall, path: '/followups',
      items: [
        { label: 'Total', count: s.followupTotal || 0 },
        { label: 'Open', count: s.followupOpen || 0 },
        { label: 'Completed', count: s.followupCompleted || 0 },
        { label: 'Rescheduled', count: s.followupRescheduled || 0 },
        { label: 'Overdue', count: s.followupOverdue || 0, alert: (s.followupOverdue || 0) > 0 },
      ],
    },
    {
      title: 'CPR', icon: FolderKanban, path: '/cprs',
      items: [
        { label: 'Total', count: s.totalCprs || 0 },
        { label: 'Draft', count: s.draftCprs || 0, filter: 'draft' },
        { label: 'Pending', count: s.pendingCprs || 0, filter: 'pending approval' },
        { label: 'Approved', count: s.approvedCprs || 0, filter: 'approved' },
        { label: 'Rejected', count: s.rejectedCprs || 0, filter: 'rejected' },
        { label: 'Converted', count: s.convertedCprs || 0, filter: 'converted' },
      ],
    },
    {
      title: 'CPR TV', icon: ShieldCheck, path: '/cpr/technical-verification',
      items: [
        { label: 'Total', count: s.cprTvTotal || 0 },
        { label: 'Draft', count: s.cprTvDraft || 0 },
        { label: 'Under Verification', count: s.cprTvUnderVerification || 0 },
        { label: 'Verified', count: s.cprTvVerified || 0 },
        { label: 'Rejected', count: s.cprTvRejected || 0, alert: (s.cprTvRejected || 0) > 0 },
      ],
    },
    {
      title: 'Cost Workout', icon: Wrench, path: '/cost-workouts',
      items: [
        { label: 'Total', count: s.totalCostWorkouts || 0 },
        { label: 'Draft', count: s.draftCostWorkouts || 0, filter: 'draft' },
        { label: 'Pending', count: s.pendingCostWorkouts || 0, filter: 'pending approval' },
        { label: 'Approved', count: s.approvedCostWorkouts || 0, filter: 'approved' },
        { label: 'Rejected', count: s.rejectedCostWorkouts || 0, filter: 'rejected' },
      ],
    },
    {
      title: 'Profit Workout', icon: TrendingUp, path: '/profit-workouts',
      items: [
        { label: 'Total', count: s.totalProfitWorkouts || 0 },
        { label: 'Draft', count: s.draftProfitWorkouts || 0, filter: 'draft' },
        { label: 'Pending', count: s.pendingProfitWorkouts || 0, filter: 'pending approval' },
        { label: 'Approved', count: s.approvedProfitWorkouts || 0, filter: 'approved' },
        { label: 'Rejected', count: s.rejectedProfitWorkouts || 0, filter: 'rejected' },
      ],
    },
    {
      title: 'Quotations', icon: FileText, path: '/quotations',
      items: [
        { label: 'Total', count: s.totalQuotations || 0 },
        { label: 'Draft', count: s.draftQuotations || 0, filter: 'draft' },
        { label: 'Pending', count: s.pendingQuotations || 0, filter: 'pending approval' },
        { label: 'Approved', count: s.approvedQuotations || 0, filter: 'approved' },
        { label: 'Rejected', count: s.rejectedQuotations || 0, filter: 'rejected' },
        { label: 'Converted', count: s.convertedQuotations || 0, filter: 'converted' },
      ],
    },
    {
      title: 'Sales Contracts', icon: BadgeCheck, path: '/sales-contracts',
      items: [
        { label: 'Total', count: s.totalSalesContracts || 0 },
        { label: 'Draft', count: s.draftSalesContracts || 0, filter: 'draft' },
        { label: 'Submitted', count: s.submittedSalesContracts || 0, filter: 'submitted' },
        { label: 'Approved', count: s.approvedSalesContracts || 0, filter: 'approved' },
        { label: 'Active', count: s.activeSalesContracts || 0, filter: 'active' },
        { label: 'Completed', count: s.completedSalesContracts || 0, filter: 'completed' },
        { label: 'Cancelled', count: s.cancelledSalesContracts || 0, filter: 'cancelled' },
      ],
    },
    {
      title: 'CPO', icon: PackageCheck, path: '/sales-orders',
      items: [
        { label: 'Total', count: s.salesOrders || 0 },
        { label: 'Draft', count: s.draftSalesOrders || 0, filter: 'draft' },
        { label: 'Pending', count: s.pendingSalesOrders || 0, filter: 'pending review' },
        { label: 'Approved', count: s.approvedSalesOrders || 0, filter: 'approved' },
        { label: 'In Progress', count: s.inProgressSalesOrders || 0, filter: 'in progress' },
        { label: 'Completed', count: s.completedSalesOrders || 0, filter: 'completed' },
        { label: 'Cancelled', count: s.cancelledSalesOrders || 0, filter: 'cancelled' },
      ],
    },
    {
      title: 'Production', icon: Factory, path: '/production/orders',
      items: [
        { label: 'Total', count: s.productionTotalOrders || 0 },
        { label: 'Pending Approval', count: s.productionPendingApproval || 0, alert: (s.productionPendingApproval || 0) > 0 },
        { label: 'In Progress', count: s.productionInProgress || 0 },
        { label: 'On Hold', count: s.productionOnHold || 0 },
        { label: 'Completed', count: s.productionCompleted || 0 },
      ],
    },
    {
      title: 'QC', icon: ClipboardCheck, path: '/production/quality',
      items: [
        { label: 'Total', count: s.qcTotal || 0 },
        { label: 'Pending', count: s.qcPending || 0 },
        { label: 'In Progress', count: s.qcInProgress || 0 },
        { label: 'Passed', count: s.qcPassed || 0 },
        { label: 'Failed', count: s.qcFailed || 0, alert: (s.qcFailed || 0) > 0 },
        { label: 'On Hold', count: s.qcHold || 0 },
      ],
    },
    {
      title: 'Packing', icon: Package, path: '/production/packing',
      items: [
        { label: 'Total', count: s.packingTotal || 0 },
        { label: 'Pending', count: s.packingPending || 0 },
        { label: 'In Progress', count: s.packingInProgress || 0 },
        { label: 'Completed', count: s.packingCompleted || 0 },
        { label: 'Ready for Dispatch', count: s.packingReadyForDispatch || 0 },
      ],
    },
    {
      title: 'Dispatch', icon: Send, path: '/production/dispatch',
      items: [
        { label: 'Total', count: s.dispatchTotal || 0 },
        { label: 'Ready', count: s.dispatchReady || 0 },
        { label: 'Dispatched', count: s.dispatchDispatched || 0 },
        { label: 'In Transit', count: s.dispatchInTransit || 0 },
        { label: 'Delivered', count: s.dispatchDelivered || 0 },
      ],
    },
    {
      title: 'Proforma Invoices', icon: Receipt, path: '/proforma-invoices',
      items: [
        { label: 'Total', count: s.totalProformaInvoices || 0 },
        { label: 'Pending', count: s.pendingProformaInvoices || 0, filter: 'pending approval' },
        { label: 'Approved', count: s.approvedProformaInvoices || 0, filter: 'approved' },
      ],
    },
    {
      title: 'Delivery Challans', icon: Truck, path: '/delivery-challans',
      items: [
        { label: 'Total', count: s.totalDeliveryChallans || 0 },
        { label: 'Pending', count: s.pendingDeliveryChallans || 0, filter: 'pending approval' },
        { label: 'Approved', count: s.approvedDeliveryChallans || 0, filter: 'approved' },
      ],
    },
    {
      title: 'Invoices', icon: FileSpreadsheet, path: '/invoices',
      items: [
        { label: 'Total', count: s.totalInvoices || 0 },
        { label: 'Pending', count: s.pendingInvoices || 0, filter: 'pending approval' },
        { label: 'Approved', count: s.approvedInvoices || 0, filter: 'approved' },
        { label: 'Overdue', count: s.overdueInvoices || 0, filter: 'overdue', alert: (s.overdueInvoices || 0) > 0 },
        { label: 'Partial', count: s.partialInvoices || 0, filter: 'partial' },
        { label: 'Paid', count: s.paidInvoices || 0, filter: 'paid' },
      ],
    },
    {
      title: 'Credit Notes', icon: CreditCard, path: '/credit-notes',
      items: [
        { label: 'Total', count: s.totalCreditNotes || 0 },
        { label: 'Draft', count: s.draftCreditNotes || 0, filter: 'draft' },
        { label: 'Pending', count: s.pendingCreditNotes || 0, filter: 'pending approval' },
        { label: 'Approved', count: s.approvedCreditNotes || 0, filter: 'approved' },
      ],
    },
    {
      title: 'Payment Receipts', icon: Banknote, path: '/payment-receipts',
      items: [
        { label: 'Total', count: s.totalPaymentReceipts || 0 },
        { label: 'Pending', count: s.pendingPaymentReceipts || 0, filter: 'pending' },
        { label: 'Received', count: s.receivedPaymentReceipts || 0, filter: 'received' },
        { label: 'Partial', count: s.partialPaymentReceipts || 0, filter: 'partial' },
        { label: 'Cancelled', count: s.cancelledPaymentReceipts || 0, filter: 'cancelled' },
      ],
    },
  ], [s]);

  // ================================================================
  // 3a. PURCHASE WORKFLOW — mirrors the Purchase sidebar order:
  //     Requisitions → Vendors → RFQ & Quotations → Purchase Orders →
  //     Logistics (Packing → Shipments → GRN → Quality → Inventory) →
  //     Purchase Invoices (Invoices → Matching → Payments → Adjustment
  //     Notes) → Work Queue.
  //     Every number comes from GET /api/purchase/dashboard/stats, which
  //     COUNTs persisted rows with the same predicates the Purchase lists,
  //     dashboard and work queue use (active record states only).
  // ================================================================
  const purchaseWorkflow = useMemo(() => {
    const p = purchase.stats;
    if (!p) return [];
    const n = (value) => (typeof value === 'number' ? value : 0);
    return [
      {
        title: 'Requisitions', icon: ClipboardList, path: '/purchase/requisition',
        items: [
          { label: 'Total', count: n(p.totalPRs) },
          { label: 'Draft', count: n(p.draftPRs) },
          { label: 'Pending Approval', count: n(p.pendingPRApprovals), alert: n(p.pendingPRApprovals) > 0 },
          { label: 'Tech Spec Review', count: n(p.techSpecPRs) },
          { label: 'Ready for RFQ', count: n(p.readyForRfqPRs) },
          { label: 'Converted to RFQ', count: n(p.convertedPRs) },
        ],
      },
      {
        title: 'Vendors', icon: Building2, path: '/purchase/vendors',
        items: [
          { label: 'Total', count: n(p.totalVendors) },
          { label: 'Approved', count: n(p.approvedVendors) },
          { label: 'Pending Approval', count: n(p.pendingVendorApprovals), alert: n(p.pendingVendorApprovals) > 0 },
        ],
      },
      {
        title: 'RFQ & Quotations', icon: FileSearch, path: '/purchase/rfq',
        items: [
          { label: 'Total', count: n(p.totalRFQs) },
          { label: 'Pending Actions', count: n(p.pendingRFQActions), alert: n(p.pendingRFQActions) > 0 },
          { label: 'Quotation Received', count: n(p.quotationReceivedRFQs) },
          { label: 'Awarded', count: n(p.awardedRFQs) },
          { label: 'Closed', count: n(p.closedRFQs) },
          { label: 'Cancelled', count: n(p.cancelledRFQs) },
        ],
      },
      {
        title: 'Purchase Orders', icon: FileCheck2, path: '/purchase/orders',
        items: [
          { label: 'Total', count: n(p.totalPOs) },
          { label: 'Draft', count: n(p.draftPOs) },
          { label: 'Pending Approval', count: n(p.pendingPOApprovals), alert: n(p.pendingPOApprovals) > 0 },
          { label: 'Approved', count: n(p.approvedPOs) },
          { label: 'Released / In Progress', count: n(p.releasedPOs) },
          { label: 'Completed', count: n(p.completedPOs) },
          { label: 'Cancelled', count: n(p.cancelledPOs) },
        ],
      },
      {
        title: 'Packing Jobs', icon: Factory, path: '/purchase/logistics/manufacturing',
        items: [
          { label: 'Total', count: n(p.totalPackingJobs) },
          { label: 'In Production', count: n(p.packingInProduction) },
          { label: 'Packed', count: n(p.packingPacked) },
          { label: 'Ready to Ship', count: n(p.packingReadyToShip) },
        ],
      },
      {
        title: 'Shipments', icon: Truck, path: '/purchase/logistics/shipment',
        items: [
          { label: 'Total', count: n(p.totalShipments) },
          { label: 'Pending Dispatch', count: n(p.pendingShipments) },
          { label: 'In Transit', count: n(p.inTransitShipments) },
          { label: 'Delivered', count: n(p.deliveredShipments) },
          { label: 'Delayed', count: n(p.delayedShipments), alert: n(p.delayedShipments) > 0 },
        ],
      },
      {
        title: 'Logistics / GRN', icon: Package, path: '/purchase/logistics/grn',
        items: [
          { label: 'Total GRNs', count: n(p.totalGRNs) },
          { label: 'Expected', count: n(p.pendingGRNs), alert: n(p.pendingGRNs) > 0 },
          { label: 'Received', count: n(p.receivedGRNs) },
          { label: 'Awaiting Inspection', count: n(p.grnsPendingInspection) },
        ],
      },
      {
        title: 'Quality Inspection', icon: ClipboardCheck, path: '/purchase/logistics/quality',
        items: [
          { label: 'Total', count: n(p.totalInspections) },
          { label: 'Pending', count: n(p.pendingInspections), alert: n(p.pendingInspections) > 0 },
          { label: 'In Progress', count: n(p.inspectionsInProgress) },
          { label: 'Passed', count: n(p.passedInspections) },
          { label: 'Failed', count: n(p.failedInspections), alert: n(p.failedInspections) > 0 },
          { label: 'Partially Accepted', count: n(p.partiallyAcceptedInspections) },
        ],
      },
      {
        title: 'Inventory', icon: Box, path: '/purchase/logistics/inventory',
        items: [
          { label: 'Total Movements', count: n(p.totalInventoryMovements) },
          { label: 'Receipts', count: n(p.inventoryReceipts) },
          { label: 'Issues', count: n(p.inventoryIssues) },
          { label: 'Adjustments', count: n(p.inventoryAdjustments) },
          { label: 'Transfers', count: n(p.inventoryTransfers) },
        ],
      },
      {
        title: 'Purchase Invoices', icon: Receipt, path: '/purchase/invoices',
        items: [
          { label: 'Total', count: n(p.totalPurchaseInvoices) },
          { label: 'Draft', count: n(p.draftPurchaseInvoices) },
          { label: 'Submitted', count: n(p.pendingInvoiceApprovals) },
          { label: 'Approved', count: n(p.approvedPurchaseInvoices) },
          { label: 'Rejected', count: n(p.rejectedPurchaseInvoices) },
          { label: 'Paid', count: n(p.paidPurchaseInvoices) },
        ],
      },
      {
        title: 'Invoice Matching', icon: PackageCheck, path: '/purchase/invoices/three-way-matching',
        items: [
          { label: 'Pending Match', count: n(p.pendingMatchInvoices), alert: n(p.pendingMatchInvoices) > 0 },
          { label: 'Matched', count: n(p.matchedInvoices) },
          { label: 'Partially Matched', count: n(p.partiallyMatchedInvoices) },
          { label: 'Mismatch', count: n(p.mismatchedInvoices), alert: n(p.mismatchedInvoices) > 0 },
          { label: 'Exception', count: n(p.exceptionInvoices), alert: n(p.exceptionInvoices) > 0 },
        ],
      },
      {
        title: 'Payments', icon: Wallet, path: '/purchase/invoices/vendor-payment',
        items: [
          { label: 'Payments Due', count: n(p.paymentsDue), alert: n(p.paymentsDue) > 0 },
          { label: 'Partially Paid', count: n(p.partiallyPaidPurchaseInvoices) },
          { label: 'Overdue', count: n(p.overdueInvoicesWithBalance), alert: n(p.overdueInvoicesWithBalance) > 0 },
          { label: 'Paid', count: n(p.paidPurchaseInvoices) },
          { label: 'Advice Issued', count: n(p.paymentAdvicesIssued) },
          { label: 'Advice Sent', count: n(p.paymentAdvicesSent) },
        ],
      },
      {
        title: 'Adjustment Notes', icon: CreditCard, path: '/purchase/invoices/notes',
        items: [
          { label: 'Total', count: n(p.totalAdjustmentNotes) },
          { label: 'Draft', count: n(p.draftAdjustmentNotes) },
          { label: 'Submitted', count: n(p.submittedAdjustmentNotes), alert: n(p.submittedAdjustmentNotes) > 0 },
          { label: 'Approved', count: n(p.approvedAdjustmentNotes) },
          { label: 'Rejected', count: n(p.rejectedAdjustmentNotes) },
        ],
      },
      {
        /* Actionable totals — the same categories/counts the Purchase Work
           Queue page renders, reduced to their numbers by the backend. Every
           supported category is listed, so the card matches the queue page. */
        title: 'Work Queue', icon: ListChecks, path: '/purchase/work-queue',
        items: [
          { label: 'Total Actionable', count: n(p.workQueueTotal), alert: n(p.workQueueTotal) > 0 },
          ...(p.workQueueCategories || []).map((c) => ({
            label: c.label,
            count: n(c.count),
            alert: n(c.count) > 0,
          })),
        ],
      },
    ];
  }, [purchase.stats]);

  // ================================================================
  // 3. MARKETING WORKFLOW
  // ================================================================
  const mktWorkflow = useMemo(() => {
    if (!mktDashboard) return [];
    const om = mktDashboard.offlineMarketing || {};
    const tp = mktDashboard.travelPlans || {};
    const qf = mktDashboard.qForms || {};
    const ex = mktDashboard.expenses || {};
    return [
      {
        title: 'Offline Marketing', icon: Megaphone, path: '/marketing',
        items: [
          { label: "Today's Visits", count: om.todayVisits || 0 },
          { label: 'Upcoming', count: om.upcomingVisits || 0 },
          { label: 'Completed', count: om.completedVisits || 0 },
          { label: 'Overdue Follow-ups', count: om.overdueFollowUps || 0, alert: (om.overdueFollowUps || 0) > 0 },
          { label: 'Leads Generated', count: om.totalLeads || 0 },
          { label: 'Handover Pending', count: om.handoverPending || 0, alert: (om.handoverPending || 0) > 0 },
        ],
      },
      {
        title: 'Travel Registry', icon: Navigation, path: '/marketing/travel-planners',
        items: [
          { label: 'Total', count: tp.total || 0 },
          { label: 'Pending Approval', count: tp.pendingApproval || 0 },
          { label: 'Approved', count: tp.approved || 0 },
          { label: 'Active', count: tp.active || 0 },
          { label: 'Completed', count: tp.completed || 0 },
          { label: 'Cancelled', count: tp.cancelled || 0 },
        ],
      },
      {
        title: 'Q Forms', icon: ClipboardList, path: '/marketing/q-forms',
        items: [
          { label: 'Total', count: qf.total || 0 },
          { label: 'Not Prepared', count: qf.notPrepared || 0 },
          { label: 'Draft', count: qf.draft || 0 },
          { label: 'Submitted', count: qf.submitted || 0 },
        ],
      },
      {
        title: 'Expenses', icon: DollarSign, path: '/marketing/expenses',
        items: [
          { label: 'Pending Approval', count: ex.pendingApproval || 0 },
          { label: 'Approved', count: ex.approved || 0 },
          { label: 'Rejected', count: ex.rejected || 0 },
        ],
      },
    ];
  }, [mktDashboard]);

  // ================================================================
  // 3b. PRODUCTION WORKFLOW — mirrors the Production sidebar order exactly:
  //     Production Dashboard → Orders → Technical Verification → Drawings →
  //     Models → Casting → Fabrication → Assembly → Quality → Packing → Dispatch
  // ================================================================
  const productionWorkflow = useMemo(() => [
    {
      title: 'Production Dashboard', icon: LayoutDashboard, path: '/production',
      items: [
        { label: 'Total Orders', count: s.productionTotalOrders || 0 },
        { label: 'Pending Approval', count: s.productionPendingApproval || 0, alert: (s.productionPendingApproval || 0) > 0 },
        { label: 'In Progress', count: s.productionInProgress || 0 },
        { label: 'Completed', count: s.productionCompleted || 0 },
      ],
    },
    {
      title: 'Production Work Orders', icon: Factory, path: '/production/orders',
      items: [
        { label: 'Total', count: s.productionTotalOrders || 0 },
        { label: 'Pending Approval', count: s.productionPendingApproval || 0, alert: (s.productionPendingApproval || 0) > 0 },
        { label: 'In Progress', count: s.productionInProgress || 0 },
        { label: 'On Hold', count: s.productionOnHold || 0 },
        { label: 'Completed', count: s.productionCompleted || 0 },
      ],
    },
    {
      title: 'Technical Verification', icon: ShieldCheck, path: '/production/technical-verification',
      items: [
        { label: 'Total', count: s.productionTvTotal || 0 },
        { label: 'Pending', count: s.productionTvPending || 0 },
        { label: 'Verified', count: s.productionTvVerified || 0 },
        { label: 'Rejected', count: s.productionTvRejected || 0, alert: (s.productionTvRejected || 0) > 0 },
      ],
    },
    {
      title: 'Drawings', icon: FileText, path: '/production/drawings',
      items: [
        { label: 'Total', count: s.productionDrawingTotal || 0 },
        { label: 'Pending', count: s.productionDrawingPending || 0 },
        { label: 'Verified', count: s.productionDrawingVerified || 0 },
        { label: 'Rejected', count: s.productionDrawingRejected || 0, alert: (s.productionDrawingRejected || 0) > 0 },
      ],
    },
    {
      title: 'Models', icon: Box, path: '/production/models',
      items: [
        { label: 'Total', count: s.productionModelTotal || 0 },
        { label: 'Pending', count: s.productionModelPending || 0 },
        { label: 'Verified', count: s.productionModelVerified || 0 },
        { label: 'Rejected', count: s.productionModelRejected || 0, alert: (s.productionModelRejected || 0) > 0 },
      ],
    },
    {
      title: 'Casting', icon: Flame, path: '/production/casting',
      items: [
        { label: 'Total Jobs', count: s.castingTotal || 0 },
        { label: 'Pending', count: s.castingPending || 0 },
        { label: 'In Progress', count: s.castingInProgress || 0 },
        { label: 'On Hold', count: s.castingHold || 0 },
        { label: 'Completed', count: s.castingCompleted || 0 },
      ],
    },
    {
      title: 'Fabrication', icon: Wrench, path: '/production/fabrication',
      items: [
        { label: 'Total Jobs', count: s.fabricationTotal || 0 },
        { label: 'Pending', count: s.fabricationPending || 0 },
        { label: 'In Progress', count: s.fabricationInProgress || 0 },
        { label: 'On Hold', count: s.fabricationHold || 0 },
        { label: 'Completed', count: s.fabricationCompleted || 0 },
      ],
    },
    {
      title: 'Assembly', icon: Settings, path: '/production/assembly',
      items: [
        { label: 'Total Jobs', count: s.assemblyTotal || 0 },
        { label: 'Pending', count: s.assemblyPending || 0 },
        { label: 'In Progress', count: s.assemblyInProgress || 0 },
        { label: 'On Hold', count: s.assemblyHold || 0 },
        { label: 'Completed', count: s.assemblyCompleted || 0 },
      ],
    },
    {
      title: 'Quality', icon: ClipboardCheck, path: '/production/quality',
      items: [
        { label: 'Total', count: s.qcTotal || 0 },
        { label: 'Pending', count: s.qcPending || 0 },
        { label: 'In Progress', count: s.qcInProgress || 0 },
        { label: 'Passed', count: s.qcPassed || 0 },
        { label: 'Failed', count: s.qcFailed || 0, alert: (s.qcFailed || 0) > 0 },
        { label: 'On Hold', count: s.qcHold || 0 },
      ],
    },
    {
      title: 'Packing', icon: Package, path: '/production/packing',
      items: [
        { label: 'Total', count: s.packingTotal || 0 },
        { label: 'Pending', count: s.packingPending || 0 },
        { label: 'In Progress', count: s.packingInProgress || 0 },
        { label: 'Completed', count: s.packingCompleted || 0 },
        { label: 'Ready for Dispatch', count: s.packingReadyForDispatch || 0 },
      ],
    },
    {
      title: 'Dispatch', icon: Send, path: '/production/dispatch',
      items: [
        { label: 'Total', count: s.dispatchTotal || 0 },
        { label: 'Ready', count: s.dispatchReady || 0 },
        { label: 'Dispatched', count: s.dispatchDispatched || 0 },
        { label: 'In Transit', count: s.dispatchInTransit || 0 },
        { label: 'Delivered', count: s.dispatchDelivered || 0 },
      ],
    },
  ], [s]);

  // ================================================================
  // 4. PENDING ACTIONS — combined from Sales + Marketing
  // ================================================================
  const pendingActions = useMemo(() => {
    const actions = [];
    // Sales pending
    if (s.pendingCprs > 0) actions.push({ label: 'CPRs Pending Approval', count: s.pendingCprs, path: '/cprs', filter: 'pending approval', icon: FolderKanban, color: '#0D9488' });
    if (s.pendingCostWorkouts > 0) actions.push({ label: 'Cost Workouts Pending', count: s.pendingCostWorkouts, path: '/cost-workouts', filter: 'pending approval', icon: Wrench, color: '#D97706' });
    if (s.pendingProfitWorkouts > 0) actions.push({ label: 'Profit Workouts Pending', count: s.pendingProfitWorkouts, path: '/profit-workouts', filter: 'pending approval', icon: TrendingUp, color: '#16A34A' });
    if (s.pendingQuotations > 0) actions.push({ label: 'Quotations Pending Approval', count: s.pendingQuotations, path: '/quotations', filter: 'pending approval', icon: FileText, color: '#f59e0b' });
    if (s.pendingSalesContracts > 0) actions.push({ label: 'Contracts Under Review', count: s.pendingSalesContracts, path: '/sales-contracts', filter: 'under review', icon: FileSignature, color: '#4F46E5' });
    if (s.pendingSalesOrders > 0) actions.push({ label: 'CPOs Pending Review', count: s.pendingSalesOrders, path: '/sales-orders', filter: 'pending review', icon: PackageCheck, color: '#0891B2' });
    if (s.pendingInvoices > 0) actions.push({ label: 'Invoices Pending Approval', count: s.pendingInvoices, path: '/invoices', filter: 'pending approval', icon: FileSpreadsheet, color: '#7C3AED' });
    if (s.pendingCreditNotes > 0) actions.push({ label: 'Credit Notes Pending', count: s.pendingCreditNotes, path: '/credit-notes', filter: 'pending approval', icon: CreditCard, color: '#C026D3' });
    if (s.pendingPaymentReceipts > 0) actions.push({ label: 'Payment Receipts Pending', count: s.pendingPaymentReceipts, path: '/payment-receipts', filter: 'pending', icon: Banknote, color: '#E11D48' });
    // Marketing pending
    if (mktDashboard) {
      const tp = mktDashboard.travelPlans || {};
      if (tp.pendingApproval > 0) actions.push({ label: 'Travel Registries Pending Approval', count: tp.pendingApproval, path: '/marketing/travel-planners', filter: 'pending', icon: Navigation, color: '#7C3AED' });
      const ex = mktDashboard.expenses || {};
      if (ex.pendingApproval > 0) actions.push({ label: 'Marketing Expenses Pending', count: ex.pendingApproval, path: '/marketing/expenses', filter: 'pending', icon: DollarSign, color: '#E11D48' });
    }
    return actions;
  }, [s, mktDashboard]);

  // ================================================================
  // 5. ATTENTION REQUIRED — alerts from both modules
  // ================================================================
  const alerts = useMemo(() => {
    const list = [];
    if (s.overdueInvoices > 0) list.push({ type: 'error', icon: AlertTriangle, text: `${s.overdueInvoices} invoice${s.overdueInvoices > 1 ? 's' : ''} overdue`, path: '/invoices', filter: 'overdue' });
    if (s.pendingCprs > 0) list.push({ type: 'warning', icon: Clock, text: `${s.pendingCprs} CPR${s.pendingCprs > 1 ? 's' : ''} pending approval`, path: '/cprs', filter: 'pending approval' });
    if (s.pendingQuotations > 0) list.push({ type: 'warning', icon: Clock, text: `${s.pendingQuotations} quotation${s.pendingQuotations > 1 ? 's' : ''} pending approval`, path: '/quotations', filter: 'pending approval' });
    if (s.pendingCostWorkouts > 0) list.push({ type: 'warning', icon: Clock, text: `${s.pendingCostWorkouts} cost workout${s.pendingCostWorkouts > 1 ? 's' : ''} pending`, path: '/cost-workouts', filter: 'pending approval' });
    if (s.pendingProfitWorkouts > 0) list.push({ type: 'warning', icon: Clock, text: `${s.pendingProfitWorkouts} profit workout${s.pendingProfitWorkouts > 1 ? 's' : ''} pending`, path: '/profit-workouts', filter: 'pending approval' });
    if (mktDashboard) {
      const om = mktDashboard.offlineMarketing || {};
      if (om.overdueFollowUps > 0) list.push({ type: 'error', icon: AlertTriangle, text: `${om.overdueFollowUps} marketing follow-up${om.overdueFollowUps > 1 ? 's' : ''} overdue`, path: '/marketing', filter: 'overdue' });
      if (om.handoverPending > 0) list.push({ type: 'warning', icon: Handshake, text: `${om.handoverPending} sales handover${om.handoverPending > 1 ? 's' : ''} pending`, path: '/marketing', filter: 'handover' });
    }
    return list;
  }, [s, mktDashboard]);

  if (loading) {
    return (
      <div className="purchase-page cpr-page">
        <nav className="pr-breadcrumb" aria-label="Breadcrumb"><span className="bc-current">Dashboard</span></nav>
        <div className="pr-page-header"><div><h1><LayoutDashboard size={20} /> Dashboard</h1></div></div>
        <div className="pr-table-card">
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-slate-200 border-t-[#0B4A3D]" />
            <span className="ml-3 text-sm text-slate-400">Loading dashboard...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="purchase-page cpr-page">
      {/* Breadcrumb */}
      <nav className="pr-breadcrumb" aria-label="Breadcrumb">
        <span className="bc-current">Dashboard</span>
      </nav>

      {/* Page Header */}
      <div className="pr-page-header">
        <div>
          <h1><LayoutDashboard size={20} /> Dashboard</h1>
          <p className="po-page-header-subtitle">
            Enterprise overview — Marketing, Sales, Production + Purchase operations
          </p>
        </div>
      </div>

      {/* ================================================================ */}
      {/* 1. TOP KPI SUMMARY CARDS                                        */}
      {/* ================================================================ */}
      <SalesKpiCards
        cards={topKpis.map((item) => ({
          key: item.key,
          label: item.label,
          value: item.value,
          icon: item.icon,
          color: item.color,
          bg: item.bg,
        }))}
        activeKpi=""
        onSelect={(key) => {
          const kpi = topKpis.find((k) => k.key === key);
          if (kpi?.route) navigate(kpi.route);
        }}
      />

      {/* ================================================================ */}
      {/* 2. MARKETING OVERVIEW                                            */}
      {/* ================================================================ */}
      {mktWorkflow.length > 0 && (
        <section className="pr-table-card mb-4">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2.5">
            <Megaphone size={16} style={{ color: '#0891B2' }} />
            <h3 style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', margin: 0 }}>Marketing Overview</h3>
          </div>
          <div style={{ padding: '16px 20px', overflowX: 'auto' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'stretch', minWidth: 600 }}>
              {mktWorkflow.map((col, i) => (
                <div key={col.title} style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
                  {i > 0 && <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}><ChevronRight size={16} style={{ color: '#cbd5e1' }} /></div>}
                  <WorkflowColumn {...col} onClick={goTo} />
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ================================================================ */}
      {/* 2b. PRODUCTION WORKFLOW — mirrors the Production sidebar order    */}
      {/* ================================================================ */}
      <section className="pr-table-card mb-4">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2.5">
          <Factory size={16} style={{ color: '#0B4A3D' }} />
          <h3 style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', margin: 0 }}>Production Workflow</h3>
        </div>
        <div style={{ padding: '16px 20px', overflowX: 'auto' }}>
          {/* 11 stages — container scrolls horizontally instead of compressing cards */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'stretch', minWidth: 1750 }}>
            {productionWorkflow.map((col, i) => (
              <div key={col.title} style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
                {i > 0 && <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}><ChevronRight size={16} style={{ color: '#cbd5e1' }} /></div>}
                <WorkflowColumn {...col} onClick={goTo} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* 3. SALES WORKFLOW                                                */}
      {/* ================================================================ */}
      <section className="pr-table-card mb-4">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2.5">
          <ArrowRight size={16} style={{ color: '#0B4A3D' }} />
          <h3 style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', margin: 0 }}>Sales Workflow</h3>
        </div>
        <div style={{ padding: '16px 20px', overflowX: 'auto' }}>
          {/* 19 stages — container scrolls horizontally instead of compressing cards */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'stretch', minWidth: 2850 }}>
            {salesWorkflow.map((col, i) => (
              <div key={col.title} style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
                {i > 0 && <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}><ChevronRight size={16} style={{ color: '#cbd5e1' }} /></div>}
                <WorkflowColumn {...col} onClick={goTo} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* 3b. PURCHASE WORKFLOW                                            */}
      {/* Mirrors the Purchase sidebar order. A failed read is reported as a   */}
      {/* failure — never rendered as a set of zero counts.                    */}
      {/* ================================================================ */}
      <section className="pr-table-card mb-4">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2.5">
          <ClipboardList size={16} style={{ color: '#0B4A3D' }} />
          <h3 style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', margin: 0 }}>Purchase Workflow</h3>
        </div>
        {purchase.error ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '18px 20px', background: '#FFFBEB' }}>
            <AlertTriangle size={16} style={{ color: '#b45309', flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#92400e' }}>
                Purchase counts are unavailable right now
              </div>
              <div style={{ fontSize: 11, color: '#b45309' }}>
                {purchase.error} — no counts are shown, because an unavailable read is not a zero.
              </div>
            </div>
          </div>
        ) : (
          <div style={{ padding: '16px 20px', overflowX: 'auto' }}>
            {/* 13 stages — container scrolls horizontally instead of compressing cards */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'stretch', minWidth: 2200 }}>
              {purchaseWorkflow.map((col, i) => (
                <div key={col.title} style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
                  {i > 0 && <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}><ChevronRight size={16} style={{ color: '#cbd5e1' }} /></div>}
                  <WorkflowColumn {...col} onClick={goTo} />
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* ================================================================ */}
      {/* 4. PENDING ACTIONS + ATTENTION REQUIRED                          */}
      {/* ================================================================ */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }} className="dash-two-col">
        {/* Pending Actions */}
        <section className="pr-table-card">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2.5">
            <Clock size={16} style={{ color: '#f59e0b' }} />
            <h3 style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', margin: 0 }}>Pending Actions</h3>
          </div>
          <div style={{ padding: '8px 0', maxHeight: 360, overflowY: 'auto' }}>
            {pendingActions.length > 0 ? pendingActions.map((action) => (
              <button
                key={action.label}
                type="button"
                onClick={() => goTo(action.path, action.filter)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, width: '100%',
                  padding: '10px 20px', border: 'none', background: 'transparent',
                  cursor: 'pointer', textAlign: 'left', transition: 'background 0.15s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#F0FAF7'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                <action.icon size={15} style={{ color: action.color, flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: '#334155' }}>{action.label}</span>
                <span style={{
                  fontSize: 12, fontWeight: 700, color: action.color,
                  background: `${action.color}14`, padding: '2px 8px', borderRadius: 6
                }}>{action.count}</span>
                <ChevronRight size={13} style={{ color: '#cbd5e1', flexShrink: 0 }} />
              </button>
            )) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 20px', gap: 8 }}>
                <CheckCircle size={18} style={{ color: '#10b981' }} />
                <span style={{ fontSize: 12, color: '#6b7280' }}>No pending actions</span>
              </div>
            )}
          </div>
        </section>

        {/* Attention Required */}
        <section className="pr-table-card">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2.5">
            <AlertTriangle size={16} style={{ color: '#dc2626' }} />
            <h3 style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', margin: 0 }}>Attention Required</h3>
          </div>
          <div style={{ padding: '8px 0', maxHeight: 360, overflowY: 'auto' }}>
            {alerts.length > 0 ? alerts.map((alert, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => goTo(alert.path, alert.filter)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, width: '100%',
                  padding: '10px 20px', border: 'none', background: 'transparent',
                  cursor: 'pointer', textAlign: 'left', transition: 'background 0.15s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = alert.type === 'error' ? '#FEF2F2' : '#FFFBEB'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                <alert.icon size={15} style={{ color: alert.type === 'error' ? '#dc2626' : '#f59e0b', flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: '#334155' }}>{alert.text}</span>
                <ChevronRight size={13} style={{ color: '#cbd5e1', flexShrink: 0 }} />
              </button>
            )) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 20px', gap: 8 }}>
                <CheckCircle size={18} style={{ color: '#10b981' }} />
                <span style={{ fontSize: 12, color: '#6b7280' }}>All clear — no alerts</span>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

// ================================================================
// Workflow column component
// ================================================================
function WorkflowColumn({ title, icon: Icon, path, items, onClick }) {
  return (
    <div style={{
      flex: '1 1 0', minWidth: 120, background: '#f8fafc', borderRadius: 10,
      border: '1px solid #e2e8f0', overflow: 'hidden'
    }}>
      <button
        type="button"
        onClick={() => onClick(path)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, width: '100%',
          padding: '8px 12px', border: 'none', background: '#0B4A3D',
          color: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 700,
          textTransform: 'uppercase', letterSpacing: '0.3px'
        }}
      >
        <Icon size={13} /> {title}
      </button>
      <div style={{ padding: '6px 0' }}>
        {items.map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={() => item.filter ? onClick(path, item.filter) : onClick(path)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              width: '100%', padding: '5px 12px', border: 'none',
              background: item.alert ? '#FEF2F2' : 'transparent',
              cursor: 'pointer', fontSize: 11, transition: 'background 0.15s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = '#F0FAF7'}
            onMouseLeave={(e) => e.currentTarget.style.background = item.alert ? '#FEF2F2' : 'transparent'}
          >
            <span style={{ color: '#64748b' }}>{item.label}</span>
            <strong style={{ color: item.alert ? '#dc2626' : '#0B1F1A', fontWeight: 700 }}>{item.count}</strong>
          </button>
        ))}
      </div>
    </div>
  );
}
