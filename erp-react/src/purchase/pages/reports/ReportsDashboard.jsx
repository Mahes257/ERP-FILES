/**
 * purchase/pages/reports/ReportsDashboard.jsx
 * ------------------------------------------------------------------
 * Reports Dashboard — live KPIs, real spend trend, category analytics,
 * vendor analytics, procurement lifecycle, and alerts.
 * All data driven from live stores via reportsService.
 * ------------------------------------------------------------------
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight, BarChart3, Building2, Clock3, FileText, IndianRupee,
  LineChart, PackageCheck, PieChart, RefreshCw, TrendingUp, AlertTriangle,
  CheckCircle2, CircleDollarSign, FileCheck2, ShoppingCart, CreditCard
} from 'lucide-react';
import PurchaseHeader from '../../components/PurchaseHeader';
import PurchasePageLayout from '../../components/list/PurchasePageLayout';
import PurchaseKpiCards from '../../components/PurchaseKpiCards';
import PurchaseChartCard from '../../components/PurchaseChartCard';
import PurchaseMiniBarChart from '../../components/PurchaseMiniBarChart';
import ModuleTabNav from '../../components/ModuleTabNav';
import ReportFilters from '../../components/ReportFilters';
import { reportsService } from '../../services/reports';
import { formatAmount } from '../../utils/purchase';
import { formatINR } from '../../utils/helpers';

const KPI_DEFS = [
  { key: 'totalSpend', label: 'Total Spend', icon: IndianRupee, color: 'text-emerald-600', bg: 'bg-emerald-50', currency: true },
  { key: 'orderValue', label: 'Order Value', icon: ShoppingCart, color: 'text-sky-600', bg: 'bg-sky-50', currency: true },
  { key: 'requisitionCount', label: 'Requisitions', icon: FileText, color: 'text-indigo-600', bg: 'bg-indigo-50' },
  { key: 'orderCount', label: 'Purchase Orders', icon: FileCheck2, color: 'text-amber-600', bg: 'bg-amber-50' },
  { key: 'invoiceCount', label: 'Invoices', icon: PieChart, color: 'text-violet-600', bg: 'bg-violet-50' },
  { key: 'pendingApprovals', label: 'Pending Approvals', icon: Clock3, color: 'text-rose-600', bg: 'bg-rose-50' },
  { key: 'paidValue', label: 'Paid Value', icon: CreditCard, color: 'text-emerald-600', bg: 'bg-emerald-50', currency: true },
  { key: 'outstandingValue', label: 'Outstanding', icon: CircleDollarSign, color: 'text-orange-600', bg: 'bg-orange-50', currency: true },
  { key: 'savings', label: 'Savings', icon: TrendingUp, color: 'text-teal-600', bg: 'bg-teal-50', currency: true },
  { key: 'avgPoValue', label: 'Avg PO Value', icon: BarChart3, color: 'text-sky-600', bg: 'bg-sky-50', currency: true },
  { key: 'onTimeDeliveryPct', label: 'On-Time Delivery', icon: PackageCheck, color: 'text-emerald-600', bg: 'bg-emerald-50', suffix: '%' },
  { key: 'qualityPassRate', label: 'Quality Pass Rate', icon: CheckCircle2, color: 'text-violet-600', bg: 'bg-violet-50', suffix: '%' }
];

export default function ReportsDashboard() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState({ dateRange: 'last-12-months' });
  const [kpis, setKpis] = useState(null);
  const [spend, setSpend] = useState(null);
  const [vendorData, setVendorData] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [financial, setFinancial] = useState(null);
  const [filterOptions, setFilterOptions] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [k, s, v, a, al, f, fo] = await Promise.all([
        reportsService.getDashboardKpis(filters),
        reportsService.getSpendAnalysis(filters),
        reportsService.getVendorAnalysis(filters),
        reportsService.getProcurementAnalytics(filters),
        reportsService.getAlerts(),
        reportsService.getFinancialSummary(filters),
        reportsService.getFilterOptions()
      ]);
      setKpis(k);
      setSpend(s);
      setVendorData(v);
      setAnalytics(a);
      setAlerts(al);
      setFinancial(f);
      setFilterOptions(fo);
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    queueMicrotask(load);
  }, [load, refreshKey]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);
  const applyFilters = useCallback((f) => setFilters(f), []);
  const resetFilters = useCallback(() => setFilters({ dateRange: 'last-12-months' }), []);

  const kpiCards = useMemo(() =>
    KPI_DEFS.map((def) => ({
      ...def,
      value: def.currency
        ? formatAmount(kpis?.[def.key] ?? 0)
        : def.suffix
          ? `${kpis?.[def.key] ?? 0}${def.suffix}`
          : String(kpis?.[def.key] ?? 0)
    })),
    [kpis]
  );

  const reportLinks = [
    { label: 'Advanced Reports', desc: '15 analytics — aging, conversion, savings, payables', icon: LineChart, path: '/purchase/reports/insights', classes: 'from-[#136754] to-[#0B4A3D]' },
    { label: 'Spend Analysis', desc: 'Monthly and category-wise purchase spend', icon: BarChart3, path: '/purchase/reports/spend-analysis', classes: 'from-violet-600 to-violet-700' },
    { label: 'Vendor Analysis', desc: 'Spend concentration and vendor performance', icon: Building2, path: '/purchase/reports/vendor-analysis', classes: 'from-emerald-600 to-emerald-700' },
    { label: 'Procurement Analytics', desc: 'Full lifecycle KPIs and conversion funnel', icon: LineChart, path: '/purchase/reports/procurement', classes: 'from-sky-600 to-sky-700' }
  ];

  /* Keep the report card grid in sync with the number of links. */
  const reportGridClass = reportLinks.length === 4
    ? 'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-6'
    : 'grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6';

  return (
    <PurchasePageLayout
      staticHeader={
        <>
          <PurchaseHeader
            crumb="Purchase · Reports"
            title="Purchase Reports"
            subtitle="Analytics across spend, vendors and the procurement lifecycle"
            actions={
              <button
                type="button"
                onClick={refresh}
                className="flex items-center gap-1.5 text-xs font-bold text-slate-600 bg-surface border border-slate-200 px-3 py-2.5 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer select-none"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-slate-400 ${loading ? 'animate-spin' : ''}`} /> Refresh
              </button>
            }
          />
          <ModuleTabNav module="reports" />
          <ReportFilters
            filters={filters}
            onApply={applyFilters}
            onReset={resetFilters}
            loading={loading}
            filterOptions={filterOptions}
          />
        </>
      }
    >
      {error && (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-4 flex items-center justify-between gap-3">
          <p className="text-xs font-semibold text-rose-600">{error?.message || 'Failed to load report data.'}</p>
          <button type="button" onClick={refresh} className="text-xs font-bold text-rose-600 underline cursor-pointer">Retry</button>
        </div>
      )}

      {/* Report navigation cards */}
      <div className={reportGridClass}>
        {reportLinks.map((link) => {
          const Icon = link.icon;
          return (
            <button
              key={link.label}
              type="button"
              onClick={() => navigate(link.path)}
              className={`flex items-center gap-3 bg-gradient-to-r ${link.classes} text-white text-left px-4 py-3.5 rounded-xl shadow-sm transition-all hover:brightness-105 cursor-pointer select-none`}
            >
              <span className="p-2 rounded-lg bg-white/15">
                <Icon className="w-4 h-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-bold">{link.label}</span>
                <span className="block text-[11px] text-white/80 truncate">{link.desc}</span>
              </span>
              <ArrowRight className="w-4 h-4 shrink-0" />
            </button>
          );
        })}
      </div>

      {/* KPI Cards */}
      <PurchaseKpiCards cards={kpiCards} loading={loading} />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 mt-6 items-start">
        <div className="xl:col-span-2 space-y-5">
          {/* Monthly Spend Trend */}
          <PurchaseChartCard
            title="Monthly Spend Trend"
            subtitle="Purchase value across the last 12 months"
            loading={loading}
            empty={!loading && !spend?.byMonth?.some((m) => m.value > 0)}
            emptyTitle="No spend trend data"
            emptyMessage="Create purchase orders to see spend trends."
            exportFilename="reports-spend-trend"
            action={
              <button
                type="button"
                onClick={() => navigate('/purchase/reports/spend-analysis')}
                className="inline-flex items-center gap-1 text-xs font-bold text-[#0B4A3D] hover:text-[#083D34] cursor-pointer"
              >
                Detail <ArrowRight className="w-3.5 h-3.5" />
              </button>
            }
          >
            <PurchaseMiniBarChart
              labels={(spend?.byMonth || []).map((e) => e.label)}
              values={(spend?.byMonth || []).map((e) => e.value)}
              valueFormat={(v) => formatINR(v)}
            />
          </PurchaseChartCard>

          {/* Spend by Category */}
          <PurchaseChartCard
            title="Spend by Category"
            subtitle="Total purchase value grouped by commodity category"
            loading={loading}
            empty={!loading && !spend?.byCategory?.length}
            emptyTitle="No category spend data"
            emptyMessage="Purchase orders will be grouped by vendor category."
            exportFilename="reports-spend-category"
            action={
              <button
                type="button"
                onClick={() => navigate('/purchase/reports/spend-analysis')}
                className="inline-flex items-center gap-1 text-xs font-bold text-[#0B4A3D] hover:text-[#083D34] cursor-pointer"
              >
                Detail <ArrowRight className="w-3.5 h-3.5" />
              </button>
            }
          >
            <div className="space-y-3">
              {(spend?.byCategory || []).slice(0, 6).map((entry) => {
                const max = spend.byCategory[0]?.spend || 1;
                return (
                  <div key={entry.category}>
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="font-bold text-slate-700">{entry.category}</span>
                      <span className="font-semibold text-slate-400">
                        {formatINR(entry.spend)} · {entry.percentage}%
                      </span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-gradient-to-r from-[#059669] to-[#34d399]" style={{ width: `${Math.min(100, (entry.spend / max) * 100)}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </PurchaseChartCard>

          {/* Financial Summary */}
          {financial && (
            <PurchaseChartCard
              title="Financial Summary"
              subtitle="Reconciled with Invoice Management and Vendor Payment"
              loading={loading}
              exportFilename="reports-financial"
            >
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {[
                  { label: 'Gross PO Value', value: financial.grossPoValue, color: 'text-sky-600' },
                  { label: 'Invoiced Value', value: financial.invoicedValue, color: 'text-violet-600' },
                  { label: 'Paid Value', value: financial.paidValue, color: 'text-emerald-600' },
                  { label: 'Outstanding', value: financial.outstandingValue, color: 'text-orange-600' },
                  { label: 'Overdue', value: financial.overdueValue, color: 'text-rose-600' },
                  { label: 'Partial Paid', value: financial.partialPaidValue, color: 'text-amber-600' }
                ].map((row) => (
                  <div key={row.label} className="text-center p-3 bg-slate-50 rounded-lg">
                    <div className={`text-sm font-bold tabular-nums ${row.color}`}>{formatINR(row.value)}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">{row.label}</div>
                  </div>
                ))}
              </div>
            </PurchaseChartCard>
          )}
        </div>

        <div className="space-y-5">
          {/* Top Vendors by Spend */}
          <PurchaseChartCard
            title="Top Vendors by Spend"
            subtitle="Spend concentration across suppliers"
            loading={loading}
            empty={!loading && !vendorData?.concentration?.length}
            emptyTitle="No vendor data available"
            exportFilename="reports-top-vendors"
            action={
              <button
                type="button"
                onClick={() => navigate('/purchase/reports/vendor-analysis')}
                className="inline-flex items-center gap-1 text-xs font-bold text-[#0B4A3D] hover:text-[#083D34] cursor-pointer"
              >
                Detail <ArrowRight className="w-3.5 h-3.5" />
              </button>
            }
          >
            <div className="space-y-3">
              {(vendorData?.concentration || []).slice(0, 5).map((entry, index) => (
                <div key={entry.name} className="flex items-center gap-3">
                  <span className={`w-5 text-center text-xs font-bold ${index < 3 ? 'text-amber-500' : 'text-slate-300'}`}>{index + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold text-slate-800 truncate">{entry.name}</div>
                    <div className="text-[11px] text-slate-400">{entry.category}</div>
                  </div>
                  <span className="text-xs font-bold text-slate-700 whitespace-nowrap">{formatINR(entry.spend)}</span>
                </div>
              ))}
            </div>
          </PurchaseChartCard>

          {/* Procurement Lifecycle */}
          <PurchaseChartCard
            title="Procurement Lifecycle"
            subtitle="End-to-end procurement funnel"
            loading={loading}
            empty={!loading && !analytics?.lifecycle?.length}
            emptyTitle="No lifecycle data"
            exportFilename="reports-lifecycle"
            action={
              <button
                type="button"
                onClick={() => navigate('/purchase/reports/procurement')}
                className="inline-flex items-center gap-1 text-xs font-bold text-[#0B4A3D] hover:text-[#083D34] cursor-pointer"
              >
                Detail <ArrowRight className="w-3.5 h-3.5" />
              </button>
            }
          >
            <div className="space-y-2.5">
              {(analytics?.lifecycle || []).map((stage) => {
                const maxCount = analytics?.lifecycle?.[0]?.count || 1;
                const pct = Math.round((stage.count / maxCount) * 100);
                return (
                  <button
                    key={stage.stage}
                    type="button"
                    onClick={() => stage.route && navigate(stage.route)}
                    className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer text-left"
                  >
                    <div className="min-w-[90px]">
                      <div className="text-xs font-bold text-slate-800">{stage.stage}</div>
                      <div className="text-[11px] text-slate-400">{formatINR(stage.value)}</div>
                    </div>
                    <div className="flex-1 h-6 bg-slate-100 rounded-md overflow-hidden">
                      <div className="h-full bg-[#075E54] flex items-center justify-end pr-2 transition-all" style={{ width: `${Math.max(8, pct)}%` }}>
                        <span className="text-[10px] font-bold text-white">{stage.count}</span>
                      </div>
                    </div>
                    <span className="w-10 text-right text-[11px] font-bold text-slate-500 tabular-nums">{pct}%</span>
                  </button>
                );
              })}
            </div>
          </PurchaseChartCard>

          {/* Alerts / Exceptions */}
          {alerts.length > 0 && (
            <PurchaseChartCard
              title="Alerts & Exceptions"
              subtitle={`${alerts.length} actionable issue${alerts.length !== 1 ? 's' : ''}`}
              loading={loading}
              exportable={false}
            >
              <div className="space-y-2">
                {alerts.slice(0, 6).map((alert) => (
                  <button
                    key={alert.id}
                    type="button"
                    onClick={() => navigate(alert.route)}
                    className="w-full flex items-start gap-2.5 p-2.5 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer text-left"
                  >
                    <AlertTriangle className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${alert.severity === 'critical' ? 'text-rose-500' : 'text-amber-500'}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-bold text-slate-700">{alert.type}</span>
                        <span className="text-[10px] text-slate-400">{alert.document}</span>
                      </div>
                      <div className="text-[11px] text-slate-500 truncate">{alert.description}</div>
                    </div>
                    <ArrowRight className="w-3 h-3 text-slate-300 mt-1 shrink-0" />
                  </button>
                ))}
              </div>
            </PurchaseChartCard>
          )}
        </div>
      </div>
    </PurchasePageLayout>
  );
}
