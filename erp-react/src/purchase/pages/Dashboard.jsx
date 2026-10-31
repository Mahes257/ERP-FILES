/**
 * purchase/pages/Dashboard.jsx
 * ------------------------------------------------------------------
 * Procurement Command Center — the single-pane-of-glass for the entire
 * Purchase module.  Every metric is computed from live application stores
 * via the dashboard, rfq, evaluation, purchaseOrder, invoice, and
 * logistics services.  No hardcoded numbers.
 *
 * Layout:
 *   1. Header — "Procurement Command Center" + workflow summary
 *   2. Pipeline — visual PR → RFQ → … → Payment with counts
 *   3. KPI Row — 8 compact metric cards
 *   4. Action Center + Activity Timeline (2-col)
 *   5. Quick Actions bar
 * ------------------------------------------------------------------
 */
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle, ArrowRight, BarChart3, Building2,
  CheckCircle2, ClipboardList, Clock3, Copy, FileText, Handshake,
  IndianRupee, Inbox, Mail, MailPlus, Package, Plus,
  Receipt, RefreshCw, Send, ShoppingCart, Truck, Wallet, XCircle,
} from 'lucide-react';
import { formatINR, formatDate } from '../utils/helpers';
import usePurchaseDashboard from '../hooks/usePurchaseDashboard';
import { useToast } from '../components/ui/ToastContext';
import PurchasePageLayout from '../components/list/PurchasePageLayout';
import PurchaseHeader from '../components/PurchaseHeader';
import PurchaseSectionCard from '../components/PurchaseSectionCard';
import '../styles/cpr-list.css';
import '../styles/requisition-list-polish.css';
import '../styles/dashboard.css';

/* ================================================================== */
/*  Helpers                                                           */
/* ================================================================== */
const Skeleton = ({ height = 200 }) => (
  <div className="rounded-xl animate-pulse" style={{ height, background: 'linear-gradient(135deg, var(--dc-skel-1) 0%, var(--dc-skel-2) 100%)' }} />
);

function StarRating({ rating = 0 }) {
  const filled = Math.round(Number(rating) || 0);
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${filled} out of 5 stars`}>
      {Array.from({ length: 5 }, (_, i) => (
        <svg key={i} width="10" height="10" viewBox="0 0 20 20" fill={i < filled ? '#F59E0B' : '#E2E8F0'}>
          <path d="M10 1.3l2.39 4.84 5.34.78-3.87 3.77.91 5.33L10 13.28l-4.77 2.51.91-5.33-3.87-3.77 5.34-.78z" />
        </svg>
      ))}
    </span>
  );
}

function SeverityBadge({ severity }) {
  const s = {
    critical: { bg: 'rgba(239,68,68,0.08)', color: '#DC2626', border: 'rgba(239,68,68,0.15)' },
    warning:  { bg: 'rgba(245,158,11,0.08)', color: '#D97706', border: 'rgba(245,158,11,0.15)' },
    info:     { bg: 'rgba(37,99,235,0.08)', color: '#2563EB', border: 'rgba(37,99,235,0.15)' },
  }[severity] || { bg: 'rgba(37,99,235,0.08)', color: '#2563EB', border: 'rgba(37,99,235,0.15)' };
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide"
      style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>
      {severity}
    </span>
  );
}

function PriorityBadge({ priority }) {
  const s = { Critical: { bg: 'var(--dc-sev-red-bg)', color: 'var(--dc-sev-red)' }, High: { bg: 'var(--dc-sev-amber-bg)', color: 'var(--dc-sev-amber)' }, Medium: { bg: 'var(--dc-sev-slate-bg)', color: 'var(--dc-sev-slate)' }, Low: { bg: 'var(--dc-sev-green-bg)', color: 'var(--dc-sev-green)' } }[priority] || { bg: 'var(--dc-sev-slate-bg)', color: 'var(--dc-sev-slate)' };
  return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold" style={{ background: s.bg, color: s.color }}>{priority}</span>;
}

/* First usable number from a list of candidates (null-safe). Used when
   the same metric can arrive from more than one API payload. */
function firstNumber(...candidates) {
  for (const candidate of candidates) {
    if (candidate === null || candidate === undefined || candidate === '') continue;
    const value = Number(candidate);
    if (Number.isFinite(value)) return value;
  }
  return 0;
}

function TimeAgo({ date }) {
  if (!date) return null;
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return <span>just now</span>;
  if (mins < 60) return <span>{mins}m ago</span>;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return <span>{hrs}h ago</span>;
  const days = Math.floor(hrs / 24);
  return <span>{days}d ago</span>;
}

/* ================================================================== */
/*  Pipeline stages — the full procurement workflow                    */
/*  Each stage maps a key from calcPipelineStages() to a route.       */
/*  Keys that don't exist in the backend response will default to 0.  */
/* ================================================================== */
const PIPELINE = [
  { key: 'pr',           label: 'PR',           icon: ClipboardList, route: '/purchase/requisition' },
  { key: 'rfq',          label: 'RFQ',          icon: Mail,          route: '/purchase/rfq' },
  { key: 'quotations',   label: 'Quotations',   icon: FileText,      route: '/purchase/rfq/quotations' },
  { key: 'techEval',     label: 'Tech Eval',    icon: BarChart3,     route: '/purchase/rfq/technical-evaluation' },
  { key: 'pcs',          label: 'PCS',          icon: BarChart3,     route: '/purchase/rfq/price-comparative-statement' },
  { key: 'negotiation',  label: 'Negotiation',  icon: Handshake,     route: '/purchase/rfq/negotiation' },
  { key: 'approval',     label: 'Approval',     icon: CheckCircle2,  route: '/purchase/rfq/approval' },
  { key: 'po',           label: 'PO',           icon: ShoppingCart,  route: '/purchase/orders' },
  { key: 'grn',          label: 'GRN',          icon: Package,       route: '/purchase/logistics' },
  { key: 'invoice',      label: 'Invoice',      icon: Receipt,       route: '/purchase/invoices' },
  { key: 'payment',      label: 'Payment',      icon: Wallet,        route: '/purchase/invoices/vendor-payment' },
];

/* Accessible label for each pipeline stage */
const PIPELINE_ARIA = {
  pr: 'View Purchase Requisitions',
  rfq: 'View RFQs',
  quotations: 'View Quotations',
  techEval: 'View Technical Evaluations',
  pcs: 'View Price Comparative Statements',
  negotiation: 'View Negotiations',
  approval: 'View Approval Flow',
  po: 'View Purchase Orders',
  grn: 'View Goods Receipt Notes',
  invoice: 'View Invoices',
  payment: 'View Vendor Payments',
};

/* ================================================================== */
/*  KPI card definitions                                               */
/*  Values read from the real backend contract where the dashboard     */
/*  endpoints provide it, falling back to the per-module stat services */
/*  (local/mock mode) and finally to 0. Every read is null-safe: a     */
/*  missing/undefined API field never renders NaN or undefined.        */
/* ================================================================== */
function kpiDefs(stats, rfqS, quoteS, evalS, orderS, grnS, invS) {
  /* PurchaseRfqService.stats() reports per-status RFQ counts under
     `byStatus` — the only place the backend exposes these stages. */
  const rfqByStatus = rfqS?.byStatus ?? {};
  return [
    { key: 'openRfq',            label: 'Open RFQs',            value: stats?.openRfq ?? 0,             icon: Mail,          color: '#2563EB', bg: 'rgba(37,99,235,0.08)',  route: '/purchase/rfq' },
    { key: 'pendingQuotations',  label: 'Pending Quotations',   value: rfqS?.pendingQuotations ?? quoteS?.pending ?? rfqByStatus.Sent ?? 0, icon: FileText, color: '#7C3AED', bg: 'rgba(124,58,237,0.08)', route: '/purchase/rfq/quotations' },
    { key: 'pendingEvaluation',  label: 'Pending Evaluation',   value: rfqS?.evaluation ?? evalS?.pending ?? rfqByStatus.Evaluation ?? 0, icon: BarChart3, color: '#D97706', bg: 'rgba(217,119,6,0.08)',  route: '/purchase/rfq/technical-evaluation' },
    { key: 'negotiations',       label: 'Negotiations',         value: rfqS?.sent ?? rfqByStatus['Quotation Received'] ?? 0, icon: Handshake, color: '#0284C7', bg: 'rgba(2,132,199,0.08)',   route: '/purchase/rfq/negotiation' },
    { key: 'pendingApprovals',   label: 'Pending Approvals',    value: stats?.pendingApproval ?? 0,     icon: Clock3,        color: '#D97706', bg: 'rgba(217,119,6,0.08)',   route: '/purchase/requisition' },
    { key: 'openPos',            label: 'Open POs',             value: stats?.openPurchaseOrders ?? orderS?.open ?? 0, icon: ShoppingCart, color: 'var(--dc-brand-ink)', bg: 'rgba(7,94,84,0.08)', route: '/purchase/orders' },
    { key: 'pendingGrns',        label: 'Pending GRNs',         value: grnS?.expected ?? stats?.pendingGRNs ?? 0, icon: Package,       color: '#0284C7', bg: 'rgba(2,132,199,0.08)',   route: '/purchase/logistics' },
    { key: 'invoiceExceptions',  label: 'Invoice Exceptions',   value: stats?.pendingInvoice ?? 0, icon: AlertTriangle, color: '#DC2626', bg: 'rgba(220,38,38,0.08)', route: '/purchase/invoices' },
  ];
}

/* ================================================================== */
/*  Dashboard                                                         */
/* ================================================================== */
export default function Dashboard() {
  const navigate = useNavigate();

  /* Toast feedback for load / refresh. The toast API is held in a ref so
     the feedback effects below never need it in a dependency array. */
  const toast = useToast();
  const toastRef = useRef(toast);
  useEffect(() => {
    toastRef.current = toast;
  }, [toast]);

  /* One data source for the whole dashboard: dashboard sections AND the
     per-module section statistics are loaded (and refreshed) together by
     this hook — no separate effect, no partial refresh. */
  const { data, loading, error, statsError, refresh } = usePurchaseDashboard('all');

  const lastError = useRef(null);
  const lastStatsError = useRef(null);

  /* Error feedback — exactly one toast per distinct failure. */
  useEffect(() => {
    if (!error) { lastError.current = null; return; }
    if (lastError.current === error) return;
    lastError.current = error;
    toastRef.current.error(error?.message || 'Unable to load dashboard data.');
  }, [error]);

  /* Section statistics may fail independently — reported once, and only
     when the whole dashboard did not fail (that error is already shown). */
  useEffect(() => {
    if (!statsError) { lastStatsError.current = null; return; }
    if (error) return;
    if (lastStatsError.current === statsError) return;
    lastStatsError.current = statsError;
    toastRef.current.error(statsError.message);
  }, [statsError, error]);

  const ready = data != null;
  const stats = data?.stats;
  const alerts = data?.alerts ?? [];
  const recentApprovals = data?.pendingApprovals ?? [];
  const topVendors = data?.topVendors ?? [];

  /* --- section statistics (loaded alongside the dashboard sections) --- */
  const rfqStats = data?.rfqStats ?? null;
  const quoteStats = data?.quoteStats ?? null;
  const evalBoard = data?.evalBoard ?? null;
  const orderStats = data?.orderStats ?? null;
  const grnStats = data?.grnStats ?? null;
  const invStats = data?.invStats ?? null;

  /* `totalPRs` / `openPOs` are emitted verbatim by the dashboard stats
     endpoint, so their presence identifies a real backend payload (as
     opposed to a local calculation over empty stores). */
  const hasBackendStats = stats != null && (stats.totalPRs !== undefined || stats.openPOs !== undefined);

  /* Invoice exceptions / overdue — the backend reports these under
     match-based and date-based keys respectively. */
  const invoiceMismatches = firstNumber(invStats?.Exception, stats?.pendingInvoiceMatching, 0);
  const invoiceOverdue = firstNumber(invStats?.Overdue, invStats?.overdueInvoices, 0);

  /* --- Pipeline counts --------------------------------------------------
     Derived from the statistics endpoints already fetched above (no extra
     requests) when a real backend payload is present; otherwise the
     dashboard service's own pipeline calculation is used unchanged. */
  const pipeline = useMemo(() => {
    const base = data?.pipelineStages ?? {};
    if (!hasBackendStats) return base;
    const byStatus = rfqStats?.byStatus ?? {};
    const evaluation = byStatus.Evaluation;
    const quotations = rfqStats?.quotationReceived;
    return {
      ...base,
      pr: firstNumber(stats?.totalPurchaseRequests, base.pr),
      rfq: firstNumber(rfqStats?.total, base.rfq),
      quotations: firstNumber(quotations, base.quotations),
      techEval: firstNumber(evaluation, base.techEval),
      pcs: firstNumber(quotations, base.pcs),
      negotiation: firstNumber(rfqStats?.sent, byStatus.Sent, base.negotiation),
      approval: firstNumber(stats?.pendingRFQApprovals, base.approval),
      po: firstNumber(stats?.totalPOs, base.po),
      grn: firstNumber(grnStats?.total, base.grn),
      invoice: firstNumber(invStats?.total, base.invoice),
      payment: firstNumber(stats?.paymentsDue, base.payment),
      /* Legacy keys kept in sync for existing consumers. */
      comparison: firstNumber(evaluation, base.comparison),
      evaluation: firstNumber(evaluation, base.evaluation),
      selection: firstNumber(evaluation, base.selection),
      delivery: firstNumber(grnStats?.total, base.delivery),
    };
  }, [data, hasBackendStats, stats, rfqStats, grnStats, invStats]);

  /* --- KPI cards --- */
  const kpis = useMemo(() => kpiDefs(stats, rfqStats, quoteStats, evalBoard, orderStats, grnStats, invStats), [stats, rfqStats, quoteStats, evalBoard, orderStats, grnStats, invStats]);

  /* --- Action Center: build from real alerts + pipeline data --- */
  const actionItems = useMemo(() => {
    const items = [];
    /* From dashboard alerts (already real data) */
    alerts.forEach((a) => items.push({
      id: a.id, label: a.type, detail: `${a.document || ''} · ${a.vendor || a.description || ''}`,
      severity: a.severity, route: a.route,
    }));
    /* Overdue RFQs */
    if (rfqStats?.overdue > 0) {
      items.push({ id: 'rfq-overdue', label: 'RFQs Overdue', detail: `${rfqStats.overdue} RFQ${rfqStats.overdue > 1 ? 's' : ''} past due date`, severity: 'critical', route: '/purchase/rfq' });
    }
    /* Expiring this week */
    if (rfqStats?.expiringThisWeek > 0) {
      items.push({ id: 'rfq-expiring', label: 'RFQs Expiring Soon', detail: `${rfqStats.expiringThisWeek} RFQ${rfqStats.expiringThisWeek > 1 ? 's' : ''} due this week`, severity: 'warning', route: '/purchase/rfq' });
    }
    /* Pending quotations */
    if ((rfqStats?.pendingQuotations ?? 0) > 0) {
      items.push({ id: 'pending-quotes', label: 'Quotations Pending', detail: `${rfqStats.pendingQuotations} vendor${rfqStats.pendingQuotations > 1 ? 's' : ''} yet to respond`, severity: 'warning', route: '/purchase/rfq/quotations' });
    }
    /* Invoice mismatch */
    if (invoiceMismatches > 0) {
      items.push({ id: 'inv-exception', label: 'Invoice Mismatch', detail: `${invoiceMismatches} invoice${invoiceMismatches > 1 ? 's' : ''} failed 3-way match`, severity: 'critical', route: '/purchase/invoices' });
    }
    /* Invoice overdue */
    if (invoiceOverdue > 0) {
      items.push({ id: 'inv-overdue', label: 'Overdue Invoices', detail: `${invoiceOverdue} invoice${invoiceOverdue > 1 ? 's' : ''} past due`, severity: 'warning', route: '/purchase/invoices' });
    }
    /* Pending GRNs */
    if ((grnStats?.expected ?? 0) > 0) {
      items.push({ id: 'pending-grn', label: 'GRN Pending', detail: `${grnStats.expected} delivery${grnStats.expected > 1 ? 'ies' : ''} awaiting receipt`, severity: 'info', route: '/purchase/logistics' });
    }
    return items;
  }, [alerts, rfqStats, invoiceMismatches, invoiceOverdue, grnStats]);

  /* --- Recent Activity: pull from RFQ activity trails + approvals --- */
  const activity = useMemo(() => {
    const events = [];
    /* From pending approvals (real data) */
    recentApprovals.slice(0, 5).forEach((r) => {
      events.push({
        id: `pr-${r.id}`, type: 'approval', label: `${r.prNo} pending approval`,
        detail: `${r.requester} · ${r.department}`, date: r.createdAt,
        route: `/purchase/requisition/${r.id}`, icon: Clock3, color: '#D97706',
      });
    });
    /* From pipeline stage data (real counts) */
    if (pipeline.pr > 0) events.push({ id: 'pipe-pr', type: 'create', label: `${pipeline.pr} purchase requisition${pipeline.pr > 1 ? 's' : ''}`, detail: 'Total in system', date: null, route: '/purchase/requisition', icon: ClipboardList, color: 'var(--dc-brand-ink)' });
    if (pipeline.rfq > 0) events.push({ id: 'pipe-rfq', type: 'create', label: `${pipeline.rfq} RFQ${pipeline.rfq > 1 ? 's' : ''} active`, detail: 'Sourcing in progress', date: null, route: '/purchase/rfq', icon: Mail, color: '#2563EB' });
    if (pipeline.po > 0) events.push({ id: 'pipe-po', type: 'create', label: `${pipeline.po} purchase order${pipeline.po > 1 ? 's' : ''}`, detail: 'Orders placed', date: null, route: '/purchase/orders', icon: ShoppingCart, color: 'var(--dc-brand-ink)' });
    if (pipeline.delivery > 0) events.push({ id: 'pipe-del', type: 'receive', label: `${pipeline.delivery} goods receipt${pipeline.delivery > 1 ? 's' : ''}`, detail: 'GRNs recorded', date: null, route: '/purchase/logistics', icon: Package, color: '#0284C7' });
    if (pipeline.invoice > 0) events.push({ id: 'pipe-inv', type: 'create', label: `${pipeline.invoice} invoice${pipeline.invoice > 1 ? 's' : ''} processed`, detail: 'Invoices in system', date: null, route: '/purchase/invoices', icon: Receipt, color: '#D97706' });
    return events;
  }, [recentApprovals, pipeline]);

  /* --- Quick Actions --- */
  const quickActions = [
    { label: 'Create PR',     icon: Plus,         route: '/purchase/requisition/new',                       color: 'var(--dc-brand-ink)' },
    { label: 'Create RFQ',    icon: MailPlus,     route: '/purchase/rfq/new',                                color: '#2563EB' },
    { label: 'Add Quotation', icon: FileText,     route: '/purchase/rfq/quotations/new',                     color: '#7C3AED' },
    { label: 'Open PCS',      icon: BarChart3,    route: '/purchase/rfq/price-comparative-statement',        color: '#0284C7' },
    { label: 'Negotiation',   icon: Handshake,    route: '/purchase/rfq/negotiation',                        color: '#D97706' },
    { label: 'Create PO',     icon: ShoppingCart, route: '/purchase/orders/new',                              color: 'var(--dc-brand-ink)' },
  ];

  /* --- Workflow summary --- */
  const workflowSummary = useMemo(() => {
    if (!ready) return '';
    const active = firstNumber(rfqStats?.active, stats?.openRfq, 0);
    const pos = orderStats?.open ?? stats?.openPurchaseOrders ?? 0;
    const pending = stats?.pendingApproval ?? 0;
    return `${active} active RFQ${active !== 1 ? 's' : ''} · ${pos} open PO${pos !== 1 ? 's' : ''} · ${pending} approval${pending !== 1 ? 's' : ''} pending`;
  }, [ready, rfqStats, orderStats, stats]);

  /* Refresh — the hook reloads every section once and resolves with the
     outcome, so the toast reflects what actually happened. Overlapping
     clicks resolve to null and are ignored (no duplicate requests). */
  const handleRefresh = useCallback(async () => {
    const result = await refresh();
    if (!result) return;
    /* Failures are already reported by the error effects above. */
    if (result.ok && !result.statsError) toastRef.current.success('Dashboard refreshed');
  }, [refresh]);

  return (
    <PurchasePageLayout>
      {/* ============================================================ */}
      {/*  HEADER                                                      */}
      {/* ============================================================ */}
      <PurchaseHeader
        variant="cpr"
        crumb="Dashboard"
        icon={Building2}
        title="Procurement Command Center"
        subtitle={workflowSummary || 'Real-time procurement status across the entire workflow.'}
        actions={
          <>
            <button type="button" onClick={() => navigate('/purchase/requisition/new')} className="erp-btn-primary" style={{ height: '34px', padding: '0 14px', fontSize: '12px' }}>
              <Plus size={13} /> New PR
            </button>
            <button type="button" onClick={() => navigate('/purchase/rfq/new')} className="erp-btn-primary" style={{ height: '34px', padding: '0 14px', fontSize: '12px' }}>
              <MailPlus size={13} /> New RFQ
            </button>
            <button type="button" onClick={() => navigate('/purchase/orders/new')} className="erp-btn-primary" style={{ height: '34px', padding: '0 14px', fontSize: '12px' }}>
              <ShoppingCart size={13} /> New PO
            </button>
            <button
              type="button"
              onClick={handleRefresh}
              className="btn btn-ghost btn-sm"
              aria-label="Refresh"
              title="Refresh"
              disabled={loading}
              aria-busy={loading}
            >
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            </button>
          </>
        }
      />

      {error && !ready && (
        <div className="cpr-error-banner" role="alert">
          <p>{error?.message || 'Unable to load dashboard data.'}</p>
          <button type="button" className="cpr-error-retry" onClick={handleRefresh}>Retry</button>
        </div>
      )}

      {/* ============================================================ */}
      {/*  PROCUREMENT PIPELINE                                        */}
      {/* ============================================================ */}
      <PurchaseSectionCard
        title="Procurement Pipeline"
        subtitle="Workflow progression from request to payment"
        icon={ArrowRight}
        action={ready ? <span className="po-badge po-badge-gray">{Object.values(pipeline).reduce((s, v) => s + (v || 0), 0)} records</span> : null}
      >          {!ready ? <Skeleton height={80} /> : (
          <div style={{ overflowX: 'auto', paddingBottom: 4 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0, minWidth: 'max-content', padding: '8px 0' }}>
              {PIPELINE.map((stage, i) => {
                const count = pipeline[stage.key] ?? 0;
                const hasCount = count > 0;
                return (
                  <div key={stage.key} style={{ display: 'flex', alignItems: 'center' }}>
                    <button
                      type="button"
                      onClick={() => navigate(stage.route)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(stage.route); } }}
                      data-pipeline-stage={stage.key}
                      aria-label={`${PIPELINE_ARIA[stage.key] || `View ${stage.label}`}: ${count} record${count !== 1 ? 's' : ''}`}
                      style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center',
                        minWidth: 70, padding: '4px 2px',
                        border: 'none', borderRadius: 12,
                        background: 'transparent', cursor: 'pointer',
                        transition: 'all 0.15s', outline: 'none',
                      }}
                      className="pipeline-stage-btn"
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(7,94,84,0.06)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                      onFocus={(e) => { e.currentTarget.style.boxShadow = '0 0 0 2px rgba(7,94,84,0.3)'; }}
                      onBlur={(e) => { e.currentTarget.style.boxShadow = 'none'; }}
                    >
                      <div
                        style={{
                          width: 44, height: 44, borderRadius: 12,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          border: hasCount ? '2px solid var(--dc-brand)' : '1.5px solid var(--dc-line)',
                          background: hasCount ? 'var(--dc-brand-soft)' : 'var(--dc-surface-3)',
                          transition: 'all 0.15s',
                        }}
                      >
                        <span style={{ fontSize: 13, fontWeight: 700, color: hasCount ? 'var(--dc-brand-ink)' : '#94A3B8', fontVariantNumeric: 'tabular-nums' }}>
                          {count}
                        </span>
                      </div>
                      <span style={{ marginTop: 4, fontSize: 10, fontWeight: 600, color: 'var(--dc-muted)', textAlign: 'center' }}>
                        {stage.label}
                      </span>
                    </button>
                    {i < PIPELINE.length - 1 && (
                      <div style={{ width: 20, height: 1, background: 'var(--dc-line)', marginTop: 18, flexShrink: 0 }} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </PurchaseSectionCard>

      {/* ============================================================ */}
      {/*  KPI ROW — 8 compact metric cards                            */}
      {/* ============================================================ */}
      <div className="pr-kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        {kpis.map((kpi) => (
          <button
            key={kpi.key}
            type="button"
            onClick={() => navigate(kpi.route)}
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '14px 16px', borderRadius: 12,
              background: 'var(--dc-surface)', border: '1px solid var(--dc-line)',
              cursor: 'pointer', transition: 'all 0.15s', textAlign: 'left', width: '100%',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--dc-brand)'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(7,94,84,0.08)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--dc-line)'; e.currentTarget.style.boxShadow = 'none'; }}
          >
            <div style={{ width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: kpi.bg, flexShrink: 0 }}>
              <kpi.icon size={18} style={{ color: kpi.color }} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--dc-muted)', lineHeight: 1.2 }}>{kpi.label}</div>
              <div style={{ fontSize: 20, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: 'var(--dc-ink)', lineHeight: 1.2, marginTop: 2 }}>{kpi.value}</div>
            </div>
          </button>
        ))}
      </div>

      {/* ============================================================ */}
      {/*  ROW: Action Center + Activity Timeline                      */}
      {/* ============================================================ */}
      <div className="dashboard-grid-2col">

        {/* ---- Needs Attention ---- */}
        <PurchaseSectionCard
          title="Needs Attention"
          subtitle="Actionable items requiring your input"
          icon={AlertTriangle}
          action={ready ? (
            <span className="po-badge" style={actionItems.length > 0
              ? { background: 'rgba(239,68,68,0.08)', color: '#F87171', border: '1px solid rgba(239,68,68,0.15)' }
              : { background: 'var(--dc-ok-bg)', color: 'var(--dc-ok)', border: '1px solid rgba(22,163,74,0.15)' }}>
              {actionItems.length} item{actionItems.length !== 1 ? 's' : ''}
            </span>
          ) : null}
        >
          {!ready ? <Skeleton height={240} /> : actionItems.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 8 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(22,163,74,0.06)', marginBottom: 12 }}>
                <CheckCircle2 size={20} style={{ color: 'var(--dc-ok)' }} />
              </div>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--dc-ink)' }}>All Clear</p>
              <p style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>No items require immediate attention.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {actionItems.slice(0, 8).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => navigate(item.route)}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10,
                    padding: '8px 10px', borderRadius: 8,
                    background: 'var(--dc-row-hover-soft)', border: '1px solid transparent',
                    cursor: 'pointer', transition: 'all 0.15s', width: '100%', textAlign: 'left',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--dc-row-hover)'; e.currentTarget.style.borderColor = 'var(--dc-line)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--dc-row-hover-soft)'; e.currentTarget.style.borderColor = 'transparent'; }}
                >
                  <div style={{ marginTop: 1, flexShrink: 0 }}><SeverityBadge severity={item.severity} /></div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--dc-ink)' }}>{item.label}</div>
                    <div style={{ fontSize: 11, marginTop: 1, color: 'var(--dc-muted)' }}>{item.detail}</div>
                  </div>
                  <ArrowRight style={{ width: 14, height: 14, flexShrink: 0, marginTop: 3, color: '#CBD5E1' }} />
                </button>
              ))}
            </div>
          )}
        </PurchaseSectionCard>

        {/* ---- Recent Activity ---- */}
        <PurchaseSectionCard
          title="Recent Activity"
          subtitle="Latest procurement events"
          icon={Clock3}
          action={
            <button type="button" onClick={() => navigate('/purchase/reports')} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700, cursor: 'pointer', color: 'var(--dc-brand-ink)', background: 'none', border: 'none', padding: 0 }}>
              View Reports <ArrowRight style={{ width: 14, height: 14 }} />
            </button>
          }
        >
          {!ready ? <Skeleton height={240} /> : activity.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 8 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(7,94,84,0.06)', marginBottom: 12 }}>
                <Inbox size={20} style={{ color: '#94A3B8' }} />
              </div>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--dc-ink)' }}>No Recent Activity</p>
              <p style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>Activity will appear here as events occur.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0, position: 'relative' }}>
              {/* Vertical timeline line */}
              <div style={{ position: 'absolute', left: 19, top: 8, bottom: 8, width: 2, background: 'var(--dc-line)', borderRadius: 1 }} />
              {activity.slice(0, 8).map((evt, idx) => (
                <button
                  key={evt.id}
                  type="button"
                  onClick={() => navigate(evt.route)}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 12,
                    padding: '8px 10px', borderRadius: 0,
                    background: 'transparent', border: 'none',
                    cursor: 'pointer', transition: 'all 0.15s', width: '100%', textAlign: 'left', position: 'relative',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--dc-row-hover-soft)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <div style={{
                    width: 20, height: 20, borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: `${evt.color}15`, border: `2px solid ${evt.color}`,
                    flexShrink: 0, zIndex: 1,
                  }}>
                    <evt.icon size={10} style={{ color: evt.color }} />
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--dc-ink)' }}>{evt.label}</div>
                    <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 1 }}>{evt.detail}</div>
                  </div>
                  {evt.date && <span style={{ fontSize: 10, color: '#CBD5E1', flexShrink: 0, marginTop: 2 }}><TimeAgo date={evt.date} /></span>}
                </button>
              ))}
            </div>
          )}
        </PurchaseSectionCard>
      </div>

      {/* ============================================================ */}
      {/*  ROW: Quick Actions + Top Vendors                            */}
      {/* ============================================================ */}
      <div className="dashboard-grid-2col" style={{ marginTop: 16 }}>

        {/* ---- Quick Actions ---- */}
        <PurchaseSectionCard
          title="Quick Actions"
          subtitle="Jump to key procurement tasks"
          icon={Plus}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {quickActions.map((qa) => (
              <button
                key={qa.label}
                type="button"
                onClick={() => navigate(qa.route)}                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    gap: 8, padding: '16px 12px', borderRadius: 10,
                    background: 'var(--dc-surface-2)', border: '1px solid var(--dc-line)',
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = qa.color; e.currentTarget.style.background = `${qa.color}12`; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--dc-line)'; e.currentTarget.style.background = 'var(--dc-surface-2)'; }}
              >
                <div style={{ width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${qa.color}10` }}>
                  <qa.icon size={16} style={{ color: qa.color }} />
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--dc-ink-2)' }}>{qa.label}</span>
              </button>
            ))}
          </div>
        </PurchaseSectionCard>

        {/* ---- Top Vendors ---- */}
        <PurchaseSectionCard
          title="Top Vendors"
          subtitle="Ranked by procurement spend"
          icon={Building2}
          action={
            <button type="button" onClick={() => navigate('/purchase/vendors')} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700, cursor: 'pointer', color: 'var(--dc-brand-ink)', background: 'none', border: 'none', padding: 0 }}>
              View All <ArrowRight style={{ width: 14, height: 14 }} />
            </button>
          }
        >
          {!ready ? <Skeleton height={224} /> : topVendors.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 8 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(7,94,84,0.06)', marginBottom: 12 }}>
                <Building2 size={20} style={{ color: '#94A3B8' }} />
              </div>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--dc-ink)' }}>No Vendor Data</p>
              <p style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>Vendor rankings will appear here.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {topVendors.map((vendor, index) => (
                <button
                  key={vendor.id}
                  type="button"
                  onClick={() => navigate(`/purchase/vendors/${vendor.id}`)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '8px 10px', borderRadius: 8,
                    background: index === 0 ? 'var(--dc-row-hover)' : 'transparent',
                    border: 'none', cursor: 'pointer', transition: 'all 0.15s', width: '100%', textAlign: 'left',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--dc-row-hover)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = index === 0 ? 'var(--dc-row-hover)' : 'transparent'}
                >
                  <span style={{ width: 24, textAlign: 'center', fontSize: 10, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: index === 0 ? 'var(--dc-brand-ink)' : '#CBD5E1' }}>
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: 36, height: 36, borderRadius: 12, fontSize: 11, fontWeight: 700, flexShrink: 0,
                    ...(index === 0 ? { background: 'var(--dc-brand)', color: '#fff', boxShadow: '0 2px 8px rgba(7,94,84,0.15)' } : { background: 'var(--dc-sev-slate-bg)', color: 'var(--dc-muted)' }),
                  }}>
                    {vendor.name?.slice(0, 2)?.toUpperCase() || 'V'}
                  </span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--dc-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{vendor.name}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                      <span style={{ fontSize: 11, color: '#94A3B8' }}>{vendor.category} · {vendor.orders} orders</span>
                      {vendor.rating > 0 && <StarRating rating={vendor.rating} />}
                    </div>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', color: 'var(--dc-ink-2)' }}>{formatINR(vendor.spend)}</span>
                </button>
              ))}
            </div>
          )}
        </PurchaseSectionCard>
      </div>
    </PurchasePageLayout>
  );
}
