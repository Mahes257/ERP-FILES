import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  LayoutDashboard, RefreshCw, RotateCcw,
  Users, Factory, FileText, Route, DollarSign, MapPin, ClipboardList,
  Receipt, Navigation, BarChart3, ArrowRight, Activity
, ChevronRight } from 'lucide-react';
import { useToast } from '../Common';
import marketingService from '../../services/marketingService';
import { DoughnutChart } from '../SalesCharts/SalesMiniCharts';
import SalesKpiCards from '../SalesTable/SalesKpiCards';
import './marketing-dashboard.css';
import '../../pages/crm/crm-erp.css';

// ============================== Helpers ==============================

const fmtINR = (v) => v == null || Number(v) === 0
  ? '₹0'
  : Number(v).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

const toLocalISO = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
};

const addDays = (d, n) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

const unwrap = (res) => (res && res.data !== undefined ? res.data : res);

function timeAgo(iso) {
  if (!iso) return '';
  const then = new Date(iso);
  const mins = Math.floor((Date.now() - then.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return toLocalISO(then);
}


function FSelect({ label, value, onChange, options, placeholder = 'All' }) {
  return (
    <label className="md-filter">
      <span className="md-filter-label">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}

// ============================== Section card ==============================

function Section({ title, icon: Icon, action, children, className = '' }) {
  return (
    <div className={`md-section ${className}`}>
      <div className="md-section-head">
        <span className="md-section-title">
          {Icon && <Icon size={14} />}
          {title}
        </span>
        {action && <span className="md-section-action">{action}</span>}
      </div>
      <div className="md-section-body">{children}</div>
    </div>
  );
}

// ============================== Empty / Error / Loading ==============================

function EmptyBanner({ onReset }) {
  return (
    <div className="md-empty">
      <BarChart3 size={26} />
      <p>No marketing data available for the selected period.</p>
      <button onClick={onReset} type="button">Reset Filters</button>
    </div>
  );
}

function ErrorState({ message, onRetry }) {
  return (
    <div className="md-error">
      <p>Failed to load dashboard: {message}</p>
      <button onClick={onRetry} type="button">
        <RefreshCw size={13} /> Retry
      </button>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-4">          <div className="pr-kpi-grid">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="pr-kpi-card qtn-kpi-card">
            <span className="qtn-kpi-icon sd-skeleton sd-skeleton-icon" aria-hidden="true" />
            <div className="qtn-kpi-body">
              <div className="sd-skeleton sd-skeleton-num" aria-hidden="true" />
              <div className="sd-skeleton sd-skeleton-label" aria-hidden="true" />
            </div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="md-skel-card" />
        <div className="md-skel-card" />
        <div className="md-skel-card" />
      </div>
    </div>
  );
}

// ============================== Data fetching ==============================

async function runFetch(params) {
  const statusParams = { dateFrom: params.dateFrom, dateTo: params.dateTo, marketer: params.marketer || undefined, plant: params.plant || undefined };
  const topParams = { dateFrom: params.dateFrom, dateTo: params.dateTo, marketer: params.marketer || undefined, plant: params.plant || undefined, qFormStatus: params.qFormStatus || undefined };
  const expenseParams = { dateFrom: params.dateFrom, dateTo: params.dateTo, marketer: params.marketer || undefined, expenseStatus: params.expenseStatus || undefined };
  const activeTripsParams = { dateFrom: params.dateFrom, dateTo: params.dateTo, marketer: params.marketer || undefined };
  const [summaryRes, trendRes, statusRes, activitiesRes, topRes, expRes, tripsRes] = await Promise.all([
    marketingService.getDashboardSummary(params),
    marketingService.getDashboardVisitsTrend(params),
    marketingService.getDashboardVisitStatus(statusParams),
    marketingService.getDashboardRecentActivities(params),
    marketingService.getDashboardTopPlants(topParams),
    marketingService.getDashboardExpensesByCategory(expenseParams),
    marketingService.getDashboardActiveTrips(activeTripsParams)
  ]);
  return {
    summary: unwrap(summaryRes),
    trend: unwrap(trendRes),
    status: unwrap(statusRes),
    activities: unwrap(activitiesRes),
    topPlants: unwrap(topRes),
    expenseCategories: unwrap(expRes),
    activeTrips: unwrap(tripsRes)
  };
}

// ============================== Main component ==============================

export default function MarketingDashboard({ onNavigate }) {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [marketers, setMarketers] = useState([]);

  const [preset, setPreset] = useState('30');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [filters, setFilters] = useState({
    marketer: '', plant: '', visitStatus: '', tripStatus: '', qFormStatus: '', expenseStatus: ''
  });

  const dates = useMemo(() => {
    if (preset === 'custom') {
      return {
        from: customFrom || toLocalISO(addDays(new Date(), -29)),
        to: customTo || toLocalISO(new Date())
      };
    }
    const n = preset === 'today' ? 0 : preset === '7' ? 6 : 29;
    return { from: toLocalISO(addDays(new Date(), -n)), to: toLocalISO(new Date()) };
  }, [preset, customFrom, customTo]);

  const params = useMemo(() => {
    const p = { dateFrom: dates.from, dateTo: dates.to };
    Object.entries(filters).forEach(([k, v]) => {
      if (v) p[k] = v;
    });
    return p;
  }, [dates, filters]);

  const load = useCallback(async () => {
    try {
      const d = await runFetch(params);
      setError(null);
      setData(d);
      setLastRefresh(new Date());
    } catch (err) {
      const msg = err?.message || 'Failed to load dashboard';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [params, toast]);

  useEffect(() => {
    let cancelled = false;
    runFetch(params)
      .then((d) => {
        if (cancelled) return;
        setError(null);
        setData(d);
        setLastRefresh(new Date());
      })
      .catch((err) => {
        if (cancelled) return;
        const msg = err?.message || 'Failed to load dashboard';
        setError(msg);
        toast.error(msg);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [params, toast]);

  useEffect(() => {
    marketingService.performance()
      .then((res) => {
        const d = unwrap(res);
        const names = [...new Set((d?.marketers || []).map((m) => m.marketer).filter(Boolean))];
        setMarketers(names);
      })
      .catch(() => { /* marketer dropdown is a convenience filter */ });
  }, []);

  const navigate = (page, filter) => {
    if (onNavigate && page) onNavigate(page, filter || '');
  };

  const resetFilters = () => {
    setPreset('30');
    setCustomFrom('');
    setCustomTo('');
    setFilters({ marketer: '', plant: '', visitStatus: '', tripStatus: '', qFormStatus: '', expenseStatus: '' });
  };

  const sum = data?.summary || {};
  const statusItems = data?.status || [];
  const activities = data?.activities || [];
  const topPlants = data?.topPlants || [];
  const expenseBreakdown = data?.expenseCategories || {};
  const activeTrips = data?.activeTrips || [];

  const isEmpty = !!data
    && !Number(sum.totalVisits?.value)
    && !Number(sum.plantsVisited?.value)
    && !Number(sum.qFormsFilled?.value)
    && !Number(sum.travelTrips?.value)
    && !Number(sum.expensesAmount?.value)
    && !activities.length
    && !topPlants.length;

  const quickActions = [
    { label: 'New Visit', icon: MapPin, page: '/marketing/visits/new/edit', color: '#0B4A3D' },
    { label: 'New Q Form', icon: ClipboardList, page: '/marketing/q-forms', color: '#7c3aed' },
    { label: 'New Registry', icon: Route, page: '/marketing/travel-planners', color: '#0891b2' },
    { label: 'Add Expense', icon: Receipt, page: '/marketing/expenses', color: '#d97706' },
    { label: 'Marketing Map', icon: Navigation, page: '/marketing/map', color: '#059669' },
    { label: 'Reports', icon: BarChart3, page: '/marketing', color: '#9333ea' }
  ];

  const activityIcon = (type) => {
    const map = { visit: MapPin, qform: FileText, travel: Route, expense: Receipt };
    const Icon = map[type] || Activity;
    const cls = `md-act-icon md-act-${type || 'other'}`;
    return <span className={cls}><Icon size={13} /></span>;
  };

  return (
    <div className="purchase-page cpr-page">
      {/* Breadcrumb (Purchase PR design) */}
      <nav className="pr-breadcrumb" aria-label="Breadcrumb">
        <button type="button" className="bc-link" onClick={() => navigate('/dashboard')}>Dashboard</button>
        <ChevronRight size={10} className="bc-sep" aria-hidden="true" />
        <button type="button" className="bc-link" onClick={() => navigate('/marketing')}>Marketing</button>
        <ChevronRight size={10} className="bc-sep" aria-hidden="true" />
        <span className="bc-current">Dashboard</span>
      </nav>

      {/* Page Header (Purchase PR design) */}
      <div className="pr-page-header">
        <div className="pr-page-header-title">
          <h1>
            <LayoutDashboard size={22} />
            Marketing Dashboard
          </h1>
          <p className="po-page-header-subtitle">Live overview of visits, Q Forms, trips and expenses</p>
        </div>
        <div className="pr-page-header-actions">
          {lastRefresh && <span className="toolbar-count">Updated {lastRefresh.toLocaleTimeString()}</span>}
          <button onClick={load} className="btn btn-ghost btn-sm" type="button">
            <RefreshCw size={13} /> Refresh
          </button>
        </div>
      </div>

      <div className="md-wrap">

      {/* ===== Controls ===== */}
      <div className="md-controls">
        <div className="md-range">
          {[['today', 'Today'], ['7', '7 Days'], ['30', '30 Days'], ['custom', 'Custom']].map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`md-range-btn ${preset === key ? 'md-range-active' : ''}`}
              onClick={() => setPreset(key)}
            >
              {label}
            </button>
          ))}
          {preset === 'custom' && (
            <span className="md-date-row">
              <input type="date" value={customFrom} max={customTo || undefined}
                onChange={(e) => setCustomFrom(e.target.value)} />
              <span>to</span>
              <input type="date" value={customTo} min={customFrom || undefined}
                onChange={(e) => setCustomTo(e.target.value)} />
            </span>
          )}
        </div>
        <div className="md-filters">
          <FSelect label="Marketing User" value={filters.marketer} options={marketers}
            onChange={(v) => setFilters((f) => ({ ...f, marketer: v }))} placeholder="All Users" />
          <label className="md-filter md-filter-text">
            <span className="md-filter-label">Plant / Customer</span>
            <input type="text" value={filters.plant} placeholder="Search plant…"
              onChange={(e) => setFilters((f) => ({ ...f, plant: e.target.value }))} />
          </label>
          <FSelect label="Visit Status" value={filters.visitStatus}
            options={['Planned', 'Scheduled', 'In Progress', 'Completed', 'Rescheduled', 'Cancelled', 'No Visit']}
            onChange={(v) => setFilters((f) => ({ ...f, visitStatus: v }))} />
          <FSelect label="Trip Status" value={filters.tripStatus}
            options={['Planned', 'Active', 'Completed', 'Cancelled']}
            onChange={(v) => setFilters((f) => ({ ...f, tripStatus: v }))} />
          <FSelect label="Q Form Status" value={filters.qFormStatus}
            options={['Not Prepared', 'Draft', 'Filled & Submitted', 'Pending', 'Not Required']}
            onChange={(v) => setFilters((f) => ({ ...f, qFormStatus: v }))} />
          <FSelect label="Expense Status" value={filters.expenseStatus}
            options={['WITH BILL', 'WITHOUT BILL']}
            onChange={(v) => setFilters((f) => ({ ...f, expenseStatus: v }))} />
          <button onClick={resetFilters} className="md-reset" type="button" title="Reset filters">
            <RotateCcw size={13} /> Reset
          </button>
        </div>
      </div>

      {/* ===== Loading ===== */}
      {loading && !data && <Skeleton />}

      {/* ===== Error ===== */}
      {!loading && error && !data && <ErrorState message={error} onRetry={load} />}

      {/* ===== Data ===== */}
      {data && (
        <>
          {isEmpty && <EmptyBanner onReset={resetFilters} />}
          {error && data && <div className="md-error md-error-inline">{error}</div>}

          {/* ===== KPI cards — click opens the matching destination in a new tab ===== */}
          <SalesKpiCards
            cards={[
              { key: 'totalVisits', label: 'Total Visits', value: Number(sum.totalVisits?.value) || 0, icon: Users, color: '#0B4A3D', newTabUrl: '/marketing?view=today' },
              { key: 'plantsVisited', label: 'Plants Visited', value: Number(sum.plantsVisited?.value) || 0, icon: Factory, color: '#0B4A3D', newTabUrl: '/marketing?view=upcoming' },
              { key: 'qFormsFilled', label: 'Q Forms Filled', value: Number(sum.qFormsFilled?.value) || 0, icon: FileText, color: '#7c3aed', newTabUrl: '/marketing/q-forms' },
              { key: 'travelTrips', label: 'Travel Trips', value: Number(sum.travelTrips?.value) || 0, icon: Route, color: '#0891b2', newTabUrl: '/marketing/travel-planners' },
              { key: 'expenses', label: 'Expenses (INR)', value: fmtINR(sum.expensesAmount?.value), icon: DollarSign, color: '#d97706', newTabUrl: '/marketing/expenses' }
            ]}
            activeKpi=""
            onSelect={(key) => {
              const card = [
                { key: 'totalVisits', newTabUrl: '/marketing?view=today' },
                { key: 'plantsVisited', newTabUrl: '/marketing?view=upcoming' },
                { key: 'qFormsFilled', newTabUrl: '/marketing/q-forms' },
                { key: 'travelTrips', newTabUrl: '/marketing/travel-planners' },
                { key: 'expenses', newTabUrl: '/marketing/expenses' }
              ].find((c) => c.key === key);
              if (card?.newTabUrl) window.open(card.newTabUrl, '_blank', 'noopener');
            }}
          />

          {/* ===== Visit Status ===== */}
          <Section title="Visit Status" icon={Activity}>
            {statusItems.length ? (
              <DoughnutChart
                labels={statusItems.map((s) => s.status)}
                data={statusItems.map((s) => Number(s.count) || 0)}
                size={168}
              />
            ) : (
              <p className="md-note">No visits in the selected period.</p>
            )}
          </Section>

          {/* ===== Activities + Top plants ===== */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Section title="Recent Activities" icon={Activity}
              action={<span className="md-count">{activities.length} events</span>}>
              {activities.length ? (
                <div className="md-activity-list">
                  {activities.slice(0, 8).map((a, i) => (
                    <button key={i} type="button" className="md-activity"
                      onClick={() => navigate(a.targetPage, a.filterParam)}>
                      {activityIcon(a.type)}
                      <div className="md-act-body">
                        <div className="md-act-head">
                          <span className="md-act-title">{a.title}</span>
                          <time className="md-act-time">{timeAgo(a.timestamp)}</time>
                        </div>
                        <div className="md-act-desc">{a.description}</div>
                      </div>
                      <ArrowRight size={12} className="md-act-arrow" />
                    </button>
                  ))}
                </div>
              ) : (
                <p className="md-note">No recent activity.</p>
              )}
            </Section>

            <Section title="Top Plants / Customers" icon={Factory}
              action={
                <button type="button" className="md-link" onClick={() => navigate('/marketing', '')}>
                  View All
                </button>
              }>
              {topPlants.length ? (
                <div className="overflow-x-auto">
                <table className="md-table">
                  <thead>
                    <tr>
                      <th>Plant / Customer</th>
                      <th>Visits</th>
                      <th>Q Forms</th>
                      <th>Completion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topPlants.map((p, i) => (
                      <tr key={i}>
                        <td className="md-td-strong" title={p.name || ''}>{p.name}</td>
                        <td>{p.visits}</td>
                        <td>{p.qForms}</td>
                        <td>
                          <div className="md-progress">
                            <span style={{ width: `${Math.min(100, Number(p.completionPercent) || 0)}%` }} />
                          </div>
                          <span className="md-progress-pct">{Number(p.completionPercent) || 0}%</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              ) : (
                <p className="md-note">No plant visits in the selected period.</p>
              )}
            </Section>
          </div>

          {/* ===== Expenses category + Active trips ===== */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Section title="Expenses by Category" icon={DollarSign}>
              {expenseBreakdown.categories?.length ? (
                <div className="md-expense-grid">
                  <DoughnutChart
                    labels={expenseBreakdown.categories.map((c) => c.category)}
                    data={expenseBreakdown.categories.map((c) => Number(c.amount) || 0)}
                    size={168}
                  />
                  <div className="md-expense-side">
                    <div className="md-expense-total">
                      <span>Total Expenses</span>
                      <strong>{fmtINR(expenseBreakdown.total)}</strong>
                    </div>
                    <div className="md-expense-bills">
                      <div><i className="md-dot md-dot-bill" />With Bill <b>{fmtINR(expenseBreakdown.withBillAmount)}</b></div>
                      <div><i className="md-dot md-dot-nobill" />Without Bill <b>{fmtINR(expenseBreakdown.withoutBillAmount)}</b></div>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="md-note">No expenses in the selected period.</p>
              )}
            </Section>

            <Section title="Active Trips" icon={Route}
              action={
                <button type="button" className="md-link" onClick={() => navigate('/marketing/expenses', 'Active')}>
                  View All Trips
                </button>
              }>
              {activeTrips.length ? (
                <div className="overflow-x-auto">
                <table className="md-table">
                  <thead>
                    <tr>
                      <th>Trip ID</th>
                      <th>Marketer</th>
                      <th>From</th>
                      <th>To</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeTrips.slice(0, 5).map((t, i) => (
                      <tr key={i}>
                        <td className="md-td-blue" title={t.tripNo}>{t.tripNo}</td>
                        <td title={t.marketer || ''}>{t.marketer || '—'}</td>
                        <td title={t.from || ''}>{t.from || '—'}</td>
                        <td title={t.to || ''}>{t.to || '—'}</td>
                        <td><span className="md-badge md-badge-active">Active</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              ) : (
                <p className="md-note">No active trips right now.</p>
              )}
            </Section>
          </div>

          {/* ===== Quick actions ===== */}
          <Section title="Quick Actions" icon={LayoutDashboard}>
            <div className="md-quick">
              {quickActions.map((qa, i) => {
                const Icon = qa.icon;
                return (
                  <button key={i} type="button" className="md-quick-btn"
                    onClick={() => navigate(qa.page, '')}>
                    <span style={{ color: qa.color, background: `${qa.color}14` }}><Icon size={18} /></span>
                    <b>{qa.label}</b>
                  </button>
                );
              })}
            </div>
          </Section>
        </>
      )}
    </div>
    </div>
  );
}