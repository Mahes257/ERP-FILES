import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users, Star, BadgeCheck, Building2, FileText, FileSignature, PackageCheck, Wallet,
  RefreshCw, AlertTriangle, Clock, PhoneCall, TrendingUp, ArrowRight, ChevronRight,
  Receipt, Banknote, ClipboardList, UserPlus, Plus, ExternalLink,
  BarChart3, Inbox, Building2 as BuildingIcon
} from 'lucide-react';
import { Modal } from '../../components/Common';
import StatusBadge from '../../components/Common/StatusBadge';
import SalesKpiCards from '../../components/SalesTable/SalesKpiCards';
import { LineTrendChart, BarChart, FunnelChart } from '../../components/SalesCharts/SalesMiniCharts';
import salesDashboardService from '../../services/salesDashboardService';
import '../../pages/crm/crm-erp.css';
import './sales-dashboard.css';

// ============================== Helpers ==============================

const fmtINR = (v) => {
  const n = Number(v);
  if (v == null || Number.isNaN(n)) return '—';
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
};

const fmtINRCompact = (v) => {
  const n = Number(v);
  if (v == null || Number.isNaN(n)) return '—';
  if (Math.abs(n) >= 10000000) return `₹${(n / 10000000).toFixed(1).replace(/\.0$/, '')} Cr`;
  if (Math.abs(n) >= 100000) return `₹${(n / 100000).toFixed(1).replace(/\.0$/, '')} L`;
  return fmtINR(n);
};

const fmtDate = (v) => (v ? String(v).slice(0, 10) : '—');
const fmtDateTime = (v) => {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
};

const num = (x) => (typeof x === 'number' ? x : 0);
const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);

const QUOTATION_STATUS_META = [
  { key: 'draft', label: 'Draft', color: '#6B7280', bg: '#F3F4F6' },
  { key: 'sent', label: 'Sent', color: '#0284C7', bg: '#E0F2FE' },
  { key: 'underEvaluation', label: 'Under Evaluation', color: '#D97706', bg: '#FEF3C7' },
  { key: 'negotiation', label: 'Negotiation', color: '#7C3AED', bg: '#F3E8FF' },
  { key: 'approved', label: 'Approved', color: '#059669', bg: '#D1FAE5' },
  { key: 'rejected', label: 'Rejected', color: '#DC2626', bg: '#FEE2E2' },
  { key: 'expired', label: 'Expired', color: '#64748B', bg: '#E2E8F0' },
];

const PIPELINE_ROUTES = {
  leads: '/leads',
  clients: '/clients',
  followups: '/followups',
  cpr: '/cprs',
  technicalverification: '/cpr/technical-verification',
  costworkout: '/cost-workouts',
  profitworkout: '/profit-workouts',
  cprreports: '/cprs/reports',
  quotation: '/quotations',
  contract: '/sales-contracts',
  cpo: '/sales-orders',
  productiontracker: '/production/orders',
  qc: '/production/quality',
  packinglist: '/production/packing',
  proformainvoice: '/proforma-invoices',
  deliverychallan: '/delivery-challans',
  invoice: '/invoices',
  creditnote: '/credit-notes',
  payment: '/payment-receipts',
};

const QUICK_ACTIONS = [
  { label: 'New Lead', to: '/leads/new', icon: UserPlus, color: '#2563EB' },
  { label: 'New Client', to: '/clients/new', icon: Building2, color: '#16A34A' },
  { label: 'New CPR', to: '/cprs/new', icon: ClipboardList, color: '#0D9488' },
  { label: 'New Quotation', to: '/quotations/new', icon: FileText, color: '#D97706' },
  { label: 'New Sales Contract', to: '/sales-contracts/new', icon: FileSignature, color: '#4F46E5' },
  { label: 'New CPO', to: '/sales-orders/new', icon: PackageCheck, color: '#0891B2' },
  { label: 'New Invoice', to: '/invoices/new', icon: Receipt, color: '#7C3AED' },
  { label: 'New Payment Receipt', to: '/payment-receipts/new', icon: Banknote, color: '#E11D48' },
];

const ACTIVITY_COLORS = {
  Lead: '#2563EB', Client: '#16A34A', CPR: '#0D9488', Quotation: '#D97706',
  'Sales Contract': '#4F46E5', CPO: '#0891B2', Invoice: '#7C3AED', Payment: '#E11D48',
};

// ============================== Main component ==============================

export default function SalesDashboard() {
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [openRecord, setOpenRecord] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await salesDashboardService.getSummary();
      setData(res || {});
    } catch (err) {
      setLoadError(err?.message || 'Failed to load the Sales Dashboard.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  // ===================== derived =====================
  // One stable model derived from the API payload so every useMemo below
  // depends on the same object references (no new arrays/objects per render).
  const model = useMemo(() => {
    const d = data || {};
    const c = d.counts || {};
    return {
      leads: c.leads || {},
      clients: c.clients || {},
      qtn: c.quotations || {},
      sc: c.contracts || {},
      so: c.cpos || {},
      inv: c.invoices || {},
      v: d.values || {},
      pipeline: Array.isArray(d.pipeline) ? d.pipeline : [],
      trend: d.trend || { months: [], quotation: [], cpo: [], invoice: [], collection: [] },
      quotesRecent: Array.isArray(d.quotationsRecent) ? d.quotationsRecent : [],
      cposRecent: Array.isArray(d.cposRecent) ? d.cposRecent : [],
      activities: Array.isArray(d.activities) ? d.activities : [],
      topCustomers: Array.isArray(d.topCustomers) ? d.topCustomers : [],
      alerts: d.alerts || {},
    };
  }, [data]);

  const {
    leads, clients, qtn, sc, so, inv, v, pipeline, trend,
    quotesRecent, cposRecent, activities, topCustomers, alerts,
  } = model;

  const kpiCards = useMemo(() => [
    { key: 'totalLeads', label: 'Total Leads', value: num(leads.total), icon: Users, color: '#0B4A3D', route: '/leads' },
    { key: 'activeLeads', label: 'Active Leads', value: num(leads.active), icon: Star, color: '#D97706', route: '/leads' },
    { key: 'qualifiedLeads', label: 'Qualified Leads', value: num(leads.qualified), icon: BadgeCheck, color: '#16A34A', route: '/leads' },
    { key: 'activeClients', label: 'Active Clients', value: num(clients.active), icon: Building2, color: '#0D9488', route: '/clients' },
    { key: 'openQuotations', label: 'Open Quotations', value: num(qtn.total), icon: FileText, color: '#2563EB', route: '/quotations' },
    { key: 'activeContracts', label: 'Active Sales Contracts', value: num(sc.active), icon: FileSignature, color: '#4F46E5', route: '/sales-contracts' },
    { key: 'totalCpoValue', label: 'Total CPO Value', value: fmtINR(v.cpoValue), icon: PackageCheck, color: '#0891B2', route: '/sales-orders' },
    { key: 'outstanding', label: 'Outstanding Amount', value: fmtINR(v.outstanding), icon: Wallet, color: '#E11D48', route: '/invoices' },
  ], [leads, clients, qtn, sc, v]);

  const conversion = useMemo(() => [
    { label: 'Lead → Qualified', value: pct(num(leads.qualified), num(leads.total)) },
    { label: 'Qualified → Proposal Sent', value: pct(num(leads.proposalSent), num(leads.qualified)) },
    { label: 'Proposal Sent → Won', value: pct(num(leads.won), num(leads.proposalSent)) },
  ], [leads]);

  const funnelData = useMemo(() => ({
    labels: ['New', 'Qualified', 'Proposal Sent', 'Won', 'Lost'],
    data: [num(leads.new), num(leads.qualified), num(leads.proposalSent), num(leads.won), num(leads.lost)],
  }), [leads]);

  const valueBars = useMemo(() => ({
    labels: ['Quotation', 'Contract', 'CPO', 'Invoiced', 'Collected'],
    data: [num(v.quotationValue), num(v.contractValue), num(v.cpoValue), num(v.invoiced), num(v.collected)],
  }), [v]);

  const valueRows = useMemo(() => [
    { label: 'Quotation Value', value: v.quotationValue, color: '#D97706' },
    { label: 'Sales Contract Value', value: v.contractValue, color: '#4F46E5' },
    { label: 'CPO Value', value: v.cpoValue, color: '#0891B2' },
    { label: 'Invoiced', value: v.invoiced, color: '#7C3AED' },
    { label: 'Collected', value: v.collected, color: '#059669' },
    { label: 'Outstanding', value: v.outstanding, color: '#DC2626' },
  ], [v]);

  const quotationStatuses = useMemo(() => {
    const total = num(qtn.total);
    return QUOTATION_STATUS_META.map((s) => {
      const count = s.key === 'sent'
        ? num(qtn.sent) + num(qtn.viewed)
        : s.key === 'underEvaluation' ? num(qtn.pendingapproval) : num(qtn[s.key]);
      return { ...s, count, pct: pct(count, total) };
    });
  }, [qtn]);

  const cpoStats = useMemo(() => ({
    total: num(so.total),
    pending: num(so.pendingreview),
    active: num(so.approved) + num(so.inprogress),
    completed: num(so.completed),
  }), [so]);

  const paymentStats = useMemo(() => {
    const paid = num(inv.paid);
    const partial = num(inv.partial);
    const overdue = num(inv.overdue);
    const total = Math.max(0, num(inv.total) - paid - partial - overdue);
    return [
      { label: 'Paid', count: paid, color: '#059669' },
      { label: 'Partially Paid', count: partial, color: '#D97706' },
      { label: 'Pending', count: total, color: '#94A3B8' },
      { label: 'Overdue', count: overdue, color: '#DC2626' },
    ];
  }, [inv]);

  const alertItems = useMemo(() => [
    { icon: AlertTriangle, tone: 'error', text: `${num(alerts.overdueFollowups)} Overdue Follow-ups`, route: '/followups', color: '#DC2626', bg: '#FEF2F2' },
    { icon: PhoneCall, tone: 'warn', text: `${num(alerts.todayFollowups)} Follow-ups Due Today`, route: '/followups', color: '#D97706', bg: '#FFFBEB' },
    { icon: Clock, tone: 'warn', text: `${num(alerts.dueThisWeek)} Follow-ups Due This Week`, route: '/followups', color: '#B45309', bg: '#FEF3C7' },
    { icon: Inbox, tone: 'info', text: `${num(alerts.inactiveLeads)} Leads Without Recent Activity`, route: '/leads', color: '#2563EB', bg: '#EFF6FF' },
  ], [alerts]);

  // Pipeline total for the section header badge (PR dashboard pattern:
  // "N records" count badge in the card header action slot).
  const pipelineTotal = useMemo(() => pipeline.reduce((s, st) => s + num(st.count), 0), [pipeline]);

  // ===================== actions =====================
  const openExistingPage = () => {
    const rec = openRecord;
    setOpenRecord(null);
    if (rec?.route) navigate(rec.route);
  };

  const openNewTab = (path) => window.open(path, '_blank', 'noopener');

  const renderRecordLink = (ref, route, extra = {}) => (
    <button
      type="button"
      onClick={() => setOpenRecord({ ref, route, ...extra })}
      title={`Open ${ref}`}
      style={{
        background: 'none', border: 'none', padding: 0, fontFamily: 'inherit',
        fontSize: 12, fontWeight: 700, color: '#0B4A3D', cursor: 'pointer', whiteSpace: 'nowrap'
      }}
    >
      {ref || '—'}
    </button>
  );

  const thStyle = {
    padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700,
    letterSpacing: '0.3px', textTransform: 'uppercase', color: '#FFFFFF',
    background: '#0B4A3D', borderBottom: '1px solid #083D34', whiteSpace: 'nowrap'
  };
  const tdStyle = {
    padding: '8px 12px', fontSize: 12, color: '#334155',
    borderBottom: '1px solid #E2E8F0', verticalAlign: 'middle'
  };

  /* PR-style Section Card helper — mirrors PurchaseSectionCard */
  function SectionCard({ title, subtitle, action, icon: HeaderIcon, children }) {
    return (
      <section className="prm-card" style={{ marginBottom: 16 }}>
        {(title || action) && (
          <div className="prm-card-header" style={{ padding: '12px 16px', borderBottom: '1px solid #F1F5F9' }}>
            <div style={{ minWidth: 0 }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                {HeaderIcon}
                {title}
              </h3>
              {subtitle && <p style={{ fontSize: 12, color: '#6B7280', margin: '2px 0 0' }}>{subtitle}</p>}
            </div>
            {action}
          </div>
        )}
        <div className="prm-card-body">{children}</div>
      </section>
    );
  }

  if (loading) {
    return (
      <div className="purchase-page cpr-page">
        <nav className="pr-breadcrumb" aria-label="Breadcrumb">
          <span className="bc-current">Sales Dashboard</span>
        </nav>
        <div className="pr-page-header">
          <div>
            <h1><BarChart3 size={20} /> Sales Dashboard</h1>
            <p className="po-page-header-subtitle">Overview of sales performance, pipeline, orders, invoicing and collections.</p>
          </div>
          <div className="pr-page-header-actions">
            <span className="sd-skeleton sd-skeleton-btn" aria-hidden="true" />
          </div>
        </div>
        <div aria-label="Loading sales dashboard" aria-busy="true">
          <div className="pr-kpi-grid">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="pr-kpi-card qtn-kpi-card">
                <span className="qtn-kpi-icon sd-skeleton sd-skeleton-icon" aria-hidden="true" />
                <div className="qtn-kpi-body">
                  <div className="sd-skeleton sd-skeleton-num" aria-hidden="true" />
                  <div className="sd-skeleton sd-skeleton-label" aria-hidden="true" />
                </div>
              </div>
            ))}
          </div>
          <div className="sd-skeleton-panel" style={{ marginTop: 16, height: 132 }} />
          <div className="dashboard-grid-2col" style={{ marginTop: 16 }}>
            <div className="sd-skeleton-panel" style={{ height: 280 }} />
            <div className="sd-skeleton-panel" style={{ height: 280 }} />
          </div>
          <div className="sd-skeleton-panel" style={{ marginTop: 16, height: 190 }} />
        </div>
      </div>
    );
  }

  return (
    <div className="purchase-page cpr-page">
      {/* Static header (breadcrumb + page header) — never scrolls */}
      <div className="cpr-page-static-header">
        <nav className="pr-breadcrumb" aria-label="Breadcrumb">
          <span className="bc-current">Sales Execution</span>
          <ChevronRight size={10} className="bc-sep" aria-hidden="true" />
          <span className="bc-current">Sales Dashboard</span>
        </nav>

        <div className="pr-page-header">
          <div className="pr-page-header-title">
            <h1><BarChart3 size={22} /> Sales Dashboard</h1>
            <p className="po-page-header-subtitle">Overview of sales performance, pipeline, orders, invoicing and collections.</p>
          </div>
          <div className="pr-page-header-actions">
            <button type="button" className="po-btn po-btn-ghost po-btn-sm" onClick={load} aria-label="Refresh dashboard">
              <RefreshCw size={13} /> Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Scrollable content area */}
      <div className="cpr-page-scroll-content">

      {/* Error banner (shown above stale data when a refresh fails) */}
      {loadError && data && (
        <div className="cpr-error-banner" style={{ marginBottom: 16 }}>
          <p>{loadError}</p>
          <button type="button" className="cpr-error-retry" onClick={load}>Retry</button>
        </div>
      )}

      {/* Full-page error state — the summary endpoint is one aggregation, so
          nothing else can render when it fails. Never show zeroed cards here. */}
      {loadError && !data && (
        <div className="pr-table-card">
          <div className="sd-error-state">
            <AlertTriangle size={28} style={{ color: '#dc2626' }} />
            <h3>Could not load the Sales Dashboard</h3>
            <p>{loadError}</p>
            <button type="button" className="po-btn po-btn-primary" onClick={load}>
              <RefreshCw size={13} /> Try Again
            </button>
          </div>
        </div>
      )}

      {data && (
        <>
      {/* 1. KPI CARDS */}
      <SalesKpiCards
        cards={kpiCards.map((k) => ({ ...k, bg: `${k.color}14`, static: true }))}
        activeKpi=""
        onSelect={(key) => {
          const k = kpiCards.find((x) => x.key === key);
          if (k?.route) navigate(k.route);
        }}
      />

      {/* 2. SALES PIPELINE — node track (PR dashboard pattern: count-in-circle
          nodes joined by arrows, labels + values below, responsive reflow) */}
      <SectionCard
        title="Sales Pipeline"
        subtitle="Progression from lead to payment — click a stage to open the module"
        icon={<ArrowRight size={16} style={{ color: '#0B4A3D' }} />}
        action={data ? <span className="po-badge po-badge-gray">{pipelineTotal} records</span> : null}
      >
        <div style={{ padding: '16px 20px', overflowX: 'auto' }}>
          <div className="sd-pipeline-track">
            {pipeline.map((stage) => {
              const count = num(stage.count);
              const hasCount = count > 0;
              return (
                <button
                  key={stage.key}
                  type="button"
                  className="sd-pipeline-stage-btn"
                  onClick={() => navigate(PIPELINE_ROUTES[stage.key] || '/sales')}
                  aria-label={`View ${stage.label}: ${count} record${count !== 1 ? 's' : ''}`}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                    minWidth: 0, padding: '4px 2px', border: 'none', borderRadius: 12,
                    background: 'transparent', cursor: 'pointer', transition: 'all 0.15s',
                    outline: 'none', fontFamily: 'inherit',
                  }}
                >
                  <span className={`sd-pipeline-node${hasCount ? ' active' : ''}`}>
                    <span className="sd-pipeline-count">{count}</span>
                  </span>
                  <span className="sd-pipeline-label">{stage.label}</span>
                  <span className="sd-pipeline-value">
                    {stage.value != null ? fmtINRCompact(stage.value) : ''}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </SectionCard>

      {/* 3. LEAD PERFORMANCE + SALES VALUE */}
      <div className="dashboard-grid-2col" style={{ marginBottom: 16 }}>
        <SectionCard
          title="Lead Performance"
          icon={<TrendingUp size={16} style={{ color: '#2563EB' }} />}
        >
          <div style={{ padding: 16 }}>
            <FunnelChart labels={funnelData.labels} data={funnelData.data} />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
              {conversion.map((conv) => (
                <div key={conv.label} style={{ flex: '1 1 160px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 12px' }}>
                  <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>{conv.label}</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#0B4A3D', marginTop: 2 }}>{conv.value}%</div>
                </div>
              ))}
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="Sales Value"
          icon={<Wallet size={16} style={{ color: '#059669' }} />}
        >
          <div style={{ padding: 16 }}>
            <BarChart labels={valueBars.labels} data={valueBars.data} />
            <div style={{ marginTop: 14 }}>
              {valueRows.map((row) => (
                <div key={row.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #F1F5F9', fontSize: 12 }}>
                  <span style={{ color: '#475569', fontWeight: 500 }}>{row.label}</span>
                  <strong style={{ color: row.color, fontWeight: 700 }}>{fmtINR(row.value)}</strong>
                </div>
              ))}
            </div>
          </div>
        </SectionCard>
      </div>

      {/* 4. MONTHLY SALES TREND */}
      <SectionCard
        title="Monthly Sales Trend"
        subtitle="Last 6 months · ₹ values"
        icon={<BarChart3 size={16} style={{ color: '#0891B2' }} />}
      >
        <div className="dashboard-grid-2col" style={{ padding: 16 }}>
          {[
            { title: 'Quotation Value', data: trend.quotation, color: '#D97706' },
            { title: 'CPO Value', data: trend.cpo, color: '#0891B2' },
            { title: 'Invoice Value', data: trend.invoice, color: '#7C3AED' },
            { title: 'Payment Collection', data: trend.collection, color: '#059669' },
          ].map((series) => (
            <div key={series.title} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: series.color, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                {series.title} · {fmtINRCompact((series.data || []).reduce((a, b) => a + num(b), 0))}
              </div>
              <LineTrendChart labels={trend.months || []} data={(series.data || []).map(num)} />
            </div>
          ))}
        </div>
      </SectionCard>

      {/* 5. QUOTATIONS + CPO */}
      <div className="dashboard-grid-2col" style={{ marginBottom: 16 }}>
        <SectionCard
          title="Quotations"
          subtitle={<span style={{ fontSize: 11, fontWeight: 700, color: '#D97706' }}>Value {fmtINR(v.quotationValue)}</span>}
          icon={<FileText size={16} style={{ color: '#D97706' }} />}
        >
          <div style={{ padding: '12px 16px', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {quotationStatuses.map((s) => (
              <div key={s.key} style={{ background: s.bg, color: s.color, borderRadius: 8, padding: '5px 10px', fontSize: 11, fontWeight: 700 }}>
                {s.label}: {s.count}
                <span style={{ opacity: 0.7, fontWeight: 600, marginLeft: 4 }}>({s.pct}%)</span>
              </div>
            ))}
          </div>
          <div className="pr-table-wrap" style={{ borderTop: '1px solid #F1F5F9' }}>
            <table className="pr-table" style={{ minWidth: 560 }}>
              <thead>
                <tr>
                  <th style={thStyle}>Quotation No</th>
                  <th style={thStyle}>Customer</th>
                  <th style={thStyle}>Date</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Value</th>
                  <th style={thStyle}>Status</th>
                </tr>
              </thead>
              <tbody>
                {quotesRecent.length === 0 ? (
                  <tr><td colSpan={5} style={{ ...tdStyle, textAlign: 'center', color: '#94A3B8', padding: 24 }}>No quotations yet.</td></tr>
                ) : quotesRecent.map((q) => (
                  <tr key={q.id}>
                    <td style={tdStyle}>{renderRecordLink(q.number || `QUO-${q.id}`, `/quotations/${q.id}/view`, { type: 'Quotation', name: q.client })}</td>
                    <td style={tdStyle}>{q.client || '—'}</td>
                    <td style={tdStyle}>{fmtDate(q.date)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>{fmtINR(q.value)}</td>
                    <td style={tdStyle}><StatusBadge status={q.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>

        <SectionCard
          title="CPO Overview"
          subtitle={<span style={{ fontSize: 11, fontWeight: 700, color: '#0891B2' }}>Value {fmtINR(v.cpoValue)}</span>}
          icon={<PackageCheck size={16} style={{ color: '#0891B2' }} />}
        >
          <div style={{ padding: '12px 16px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            {[
              { label: 'Total', value: cpoStats.total, color: '#334155' },
              { label: 'Pending', value: cpoStats.pending, color: '#D97706' },
              { label: 'Active', value: cpoStats.active, color: '#0891B2' },
              { label: 'Completed', value: cpoStats.completed, color: '#059669' },
            ].map((s) => (
              <div key={s.label} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 10px' }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>{s.label}</div>
              </div>
            ))}
          </div>
          <div className="pr-table-wrap" style={{ borderTop: '1px solid #F1F5F9' }}>
            <table className="pr-table" style={{ minWidth: 560 }}>
              <thead>
                <tr>
                  <th style={thStyle}>CPO No</th>
                  <th style={thStyle}>Customer</th>
                  <th style={thStyle}>Date</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Value</th>
                  <th style={thStyle}>Status</th>
                </tr>
              </thead>
              <tbody>
                {cposRecent.length === 0 ? (
                  <tr><td colSpan={5} style={{ ...tdStyle, textAlign: 'center', color: '#94A3B8', padding: 24 }}>No customer purchase orders yet.</td></tr>
                ) : cposRecent.map((o) => (
                  <tr key={o.id}>
                    <td style={tdStyle}>{renderRecordLink(o.number || `CPO-${o.id}`, `/sales-orders/${o.id}`, { type: 'CPO', name: o.client })}</td>
                    <td style={tdStyle}>{o.client || '—'}</td>
                    <td style={tdStyle}>{fmtDate(o.date)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>{fmtINR(o.value)}</td>
                    <td style={tdStyle}><StatusBadge status={o.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      </div>

      {/* 6. INVOICE & PAYMENT */}
      <SectionCard
        title="Invoice & Payment Overview"
        icon={<Receipt size={16} style={{ color: '#7C3AED' }} />}
      >
        <div className="dashboard-grid-3col" style={{ padding: 16 }}>
          {[
            { label: 'Total Invoiced', value: v.invoiced, color: '#7C3AED' },
            { label: 'Total Paid', value: v.collected, color: '#059669' },
            { label: 'Total Outstanding', value: v.outstanding, color: '#DC2626' },
          ].map((s) => (
            <div key={s.label} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '14px 16px' }}>
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>{s.label}</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: s.color, marginTop: 4 }}>{fmtINR(s.value)}</div>
            </div>
          ))}
        </div>
        <div style={{ padding: '0 16px 16px' }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            {paymentStats.map((s) => (
              <div key={s.label} style={{ flex: 1, fontSize: 11, fontWeight: 600, color: '#64748b' }}>
                <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: s.color, marginRight: 4 }} />
                {s.label}: <strong style={{ color: s.color }}>{s.count}</strong>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', height: 10, borderRadius: 6, overflow: 'hidden', background: '#F1F5F9' }}>
            {paymentStats.map((s) => (
              <div key={s.label} style={{ width: `${num(s.count) > 0 ? Math.max(2, (s.count / Math.max(1, num(inv.total))) * 100) : 0}%`, background: s.color }} />
            ))}
          </div>
        </div>
      </SectionCard>

      {/* 7. ATTENTION REQUIRED — PR "Needs Attention" pattern (count badge + subtitle) */}
      <SectionCard
        title="Attention Required"
        subtitle="Follow-ups and leads that need action"
        icon={<AlertTriangle size={16} style={{ color: '#dc2626' }} />}
        action={
          <span
            className="po-badge"
            style={alertItems.length > 0
              ? { background: 'rgba(239,68,68,0.08)', color: '#DC2626', border: '1px solid rgba(239,68,68,0.15)' }
              : { background: '#F0FDF4', color: '#16A34A', border: '1px solid rgba(22,163,74,0.15)' }}
          >
            {alertItems.length} item{alertItems.length !== 1 ? 's' : ''}
          </span>
        }
      >
        <div className="dashboard-grid-4col" style={{ padding: 16 }}>
          {alertItems.map((a, i) => (
            <button
              key={i}
              type="button"
              onClick={() => navigate(a.route)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', textAlign: 'left',
                background: a.bg, border: `1px solid ${a.color}22`, borderRadius: 10, cursor: 'pointer',
                fontFamily: 'inherit', transition: 'transform 0.12s, box-shadow 0.12s'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.boxShadow = `0 2px 8px ${a.color}33`; e.currentTarget.style.transform = 'translateY(-1px)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none'; }}
            >
              <a.icon size={16} style={{ color: a.color, flexShrink: 0 }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: '#334155' }}>{a.text}</span>
              <ChevronRight size={13} style={{ color: a.color, marginLeft: 'auto', flexShrink: 0 }} />
            </button>
          ))}
        </div>
      </SectionCard>

      {/* 8. RECENT SALES ACTIVITY — PR "Recent Activity" pattern (subtitle + View Reports link) */}
      <SectionCard
        title="Recent Sales Activity"
        subtitle="Latest records across leads, clients, CPR, quotations, CPOs and invoices"
        icon={<Clock size={16} style={{ color: '#0D9488' }} />}
        action={
          <button
            type="button"
            onClick={() => navigate('/sales/reports')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700, cursor: 'pointer', color: '#0B4A3D', background: 'none', border: 'none', padding: 0 }}
          >
            View Reports <ArrowRight style={{ width: 14, height: 14 }} />
          </button>
        }
      >
        <div className="pr-table-wrap">
          <table className="pr-table" style={{ minWidth: 720 }}>
            <thead>
              <tr>
                <th style={thStyle}>Type</th>
                <th style={thStyle}>Record No</th>
                <th style={thStyle}>Customer / Lead</th>
                <th style={thStyle}>Date</th>
                <th style={thStyle}>Status</th>
              </tr>
            </thead>
            <tbody>
              {activities.length === 0 ? (
                <tr><td colSpan={5} style={{ ...tdStyle, textAlign: 'center', color: '#94A3B8', padding: 24 }}>No recent activity.</td></tr>
              ) : activities.map((a, i) => (
                <tr key={`${a.type}-${a.ref}-${i}`}>
                  <td style={tdStyle}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 999,
                      fontSize: 10, fontWeight: 700, color: ACTIVITY_COLORS[a.type] || '#334155',
                      background: `${ACTIVITY_COLORS[a.type] || '#334155'}14`
                    }}>
                      {a.type}
                    </span>
                  </td>
                  <td style={tdStyle}>{renderRecordLink(a.ref, a.route, { type: a.type, name: a.name })}</td>
                  <td style={tdStyle}>{a.name || '—'}</td>
                  <td style={tdStyle}>{fmtDateTime(a.date)}</td>
                  <td style={tdStyle}><StatusBadge status={a.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* 9. TOP CUSTOMERS */}
      <SectionCard
        title="Top Customers"
        icon={<BuildingIcon size={16} style={{ color: '#16A34A' }} />}
      >
        <div className="pr-table-wrap">
          <table className="pr-table" style={{ minWidth: 760 }}>
            <thead>
              <tr>
                <th style={thStyle}>Customer</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>Orders</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Order Value</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Invoice Value</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Payment</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Outstanding</th>
              </tr>
            </thead>
            <tbody>
              {topCustomers.length === 0 ? (
                <tr><td colSpan={6} style={{ ...tdStyle, textAlign: 'center', color: '#94A3B8', padding: 24 }}>No customer sales data yet.</td></tr>
              ) : topCustomers.map((tc, i) => (
                <tr key={i}>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>{tc.name}</td>
                  <td style={{ ...tdStyle, textAlign: 'center' }}>{num(tc.orders)}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>{fmtINR(tc.orderValue)}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{fmtINR(tc.invoiceValue)}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', color: '#059669' }}>{fmtINR(tc.payment)}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', color: num(tc.outstanding) > 0 ? '#DC2626' : '#059669', fontWeight: 700 }}>
                    {fmtINR(tc.outstanding)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* 10. QUICK ACTIONS — PR "Quick Actions" grid pattern */}
      <SectionCard
        title="Quick Actions"
        subtitle="Jump to key sales tasks"
        icon={<Plus size={16} style={{ color: '#0B4A3D' }} />}
        action={<span style={{ fontSize: 11, color: '#94A3B8' }}>Opens in a new tab</span>}
      >
        <div className="dashboard-grid-4col" style={{ padding: 16 }}>
          {QUICK_ACTIONS.map((qa) => {
            const QIcon = qa.icon;
            return (
              <button
                key={qa.label}
                type="button"
                onClick={() => openNewTab(qa.to)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', textAlign: 'left',
                  background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10, cursor: 'pointer',
                  fontFamily: 'inherit', transition: 'border-color 0.15s, box-shadow 0.15s, transform 0.12s'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = qa.color; e.currentTarget.style.boxShadow = `0 2px 8px ${qa.color}22`; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#E2E8F0'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none'; }}
              >
                <span style={{ width: 32, height: 32, borderRadius: 8, background: `${qa.color}14`, color: qa.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <QIcon size={16} />
                </span>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#334155' }}>{qa.label}</span>
                <ExternalLink size={12} style={{ color: '#94A3B8', marginLeft: 'auto', flexShrink: 0 }} />
              </button>
            );
          })}
        </div>
      </SectionCard>

        </>
      )}

      {/* Record open modal */}
      <Modal
        open={!!openRecord}
        onClose={() => setOpenRecord(null)}
        title={openRecord ? `Open ${openRecord.ref}` : 'Open Record'}
        maxWidth="max-w-sm"
        footer={
          openRecord && (
            <div className="w-full flex flex-col gap-2">
              <button type="button" className="po-btn po-btn-primary w-full justify-center" onClick={openExistingPage}>
                Open in Existing Page
              </button>
              <button type="button" className="po-btn po-btn-ghost w-full justify-center" onClick={() => { const path = openRecord.route; setOpenRecord(null); openNewTab(path); }}>
                <ExternalLink size={13} /> Open in New Tab
              </button>
              <button type="button" className="po-btn po-btn-ghost w-full justify-center" onClick={() => setOpenRecord(null)}>
                Cancel
              </button>
            </div>
          )
        }
      >
        {openRecord && (
          <div className="space-y-2 text-[12px] text-slate-600">
            <div className="flex justify-between gap-2"><span className="text-slate-400">Type</span><strong className="text-slate-800 text-right">{openRecord.type || 'Record'}</strong></div>
            <div className="flex justify-between gap-2"><span className="text-slate-400">Record No</span><strong className="text-slate-800 text-right">{openRecord.ref || '—'}</strong></div>
            <div className="flex justify-between gap-2"><span className="text-slate-400">Customer / Lead</span><strong className="text-slate-800 text-right">{openRecord.name || '—'}</strong></div>
          </div>
        )}
      </Modal>
      </div> {/* cpr-page-scroll-content */}
    </div>
  );
}