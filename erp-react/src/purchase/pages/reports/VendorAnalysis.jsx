/**
 * purchase/pages/reports/VendorAnalysis.jsx
 * ------------------------------------------------------------------
 * Vendor Analysis — comprehensive vendor analytics with spend
 * concentration, ranked performance, invoice/payment status, and
 * drill-down to vendor detail. All data from live stores.
 *
 * Enterprise ERP ranking table with 12 columns:
 *   Rank | Vendor | Category | Orders | Spend | Invoiced | Paid |
 *   Outstanding | Share | Rating | On-Time | Actions
 * ------------------------------------------------------------------ */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Award, Building2, Eye, FileText, IndianRupee, MoreVertical,
  Package, PackageCheck, RefreshCw, Star, Users, TrendingUp,
  CreditCard, BarChart3, X, Search, ChevronDown
} from 'lucide-react';
import ExportMenu from '../../components/ExportMenu';
import PurchaseHeader from '../../components/PurchaseHeader';
import PurchasePageLayout from '../../components/list/PurchasePageLayout';
import PurchaseKpiCards from '../../components/PurchaseKpiCards';
import PurchaseSectionCard from '../../components/PurchaseSectionCard';
import PurchaseChartCard from '../../components/PurchaseChartCard';
import ModuleTabNav from '../../components/ModuleTabNav';
import ReportFilters from '../../components/ReportFilters';
import { reportsService } from '../../services/reports';
import { formatAmount } from '../../utils/purchase';
import { formatINR } from '../../utils/helpers';
import { exportCsv } from '../../utils/export';
import useClickOutside from '../../hooks/useClickOutside';

/* ------------------------------------------------------------------ */
/*  KPI definitions                                                    */
/* ------------------------------------------------------------------ */
const KPI_DEFS = [
  { key: 'totalSpend', label: 'Total Vendor Spend', icon: Building2, color: 'text-emerald-600', bg: 'bg-emerald-50', currency: true },
  { key: 'totalVendors', label: 'Total Vendors', icon: Users, color: 'text-indigo-600', bg: 'bg-indigo-50' },
  { key: 'activeVendors', label: 'Active Vendors', icon: TrendingUp, color: 'text-sky-600', bg: 'bg-sky-50' },
  { key: 'preferredVendors', label: 'Preferred Vendors', icon: Award, color: 'text-amber-600', bg: 'bg-amber-50' },
  { key: 'avgSpendPerVendor', label: 'Avg Spend / Vendor', icon: IndianRupee, color: 'text-violet-600', bg: 'bg-violet-50', currency: true },
  { key: 'topShare', label: 'Top Vendor Share', icon: PackageCheck, color: 'text-rose-600', bg: 'bg-rose-50' }
];

/* ------------------------------------------------------------------ */
/*  Export columns — full detail for CSV/Excel                          */
/* ------------------------------------------------------------------ */
const EXPORT_COLUMNS = [
  { key: 'rank', label: 'Rank', visible: true, align: 'center' },
  { key: 'name', label: 'Vendor', visible: true },
  { key: 'category', label: 'Category', visible: true },
  { key: 'poCount', label: 'POs', visible: true, align: 'center' },
  { key: 'spend', label: 'Spend', visible: true, align: 'right' },
  { key: 'invoiceValue', label: 'Invoiced', visible: true, align: 'right' },
  { key: 'paidValue', label: 'Paid', visible: true, align: 'right' },
  { key: 'outstanding', label: 'Outstanding', visible: true, align: 'right' },
  { key: 'share', label: 'Share %', visible: true, align: 'center' },
  { key: 'rating', label: 'Rating', visible: true, align: 'center' },
  { key: 'onTimeDelivery', label: 'On-Time %', visible: true, align: 'center' }
];

/* ------------------------------------------------------------------ */
/*  Sortable column config                                             */
/* ------------------------------------------------------------------ */
const SORT_KEYS = [
  { key: 'spend', label: 'Spend' },
  { key: 'poCount', label: 'Orders' },
  { key: 'outstanding', label: 'Outstanding' },
  { key: 'rating', label: 'Rating' },
  { key: 'onTimeDelivery', label: 'On-Time' },
  { key: 'share', label: 'Share' }
];

/* ------------------------------------------------------------------ */
/*  Table column definitions                                           */
/* ------------------------------------------------------------------ */
const COLS = [
  { key: 'rank', label: 'Rank', width: 60, align: 'center' },
  { key: 'vendor', label: 'Vendor', width: 190, align: 'left' },
  { key: 'category', label: 'Category', width: 170, align: 'left' },
  { key: 'orders', label: 'Orders', width: 90, align: 'center' },
  { key: 'spend', label: 'Spend', width: 120, align: 'right' },
  { key: 'invoiced', label: 'Invoiced', width: 120, align: 'right' },
  { key: 'paid', label: 'Paid', width: 110, align: 'right' },
  { key: 'outstanding', label: 'Outstanding', width: 130, align: 'right' },
  { key: 'share', label: 'Share', width: 110, align: 'center' },
  { key: 'rating', label: 'Rating', width: 90, align: 'center' },
  { key: 'onTime', label: 'On-Time', width: 100, align: 'center' },
  { key: 'actions', label: '', width: 70, align: 'center' }
];

/* ------------------------------------------------------------------ */
/*  Filter preset options                                               */
/* ------------------------------------------------------------------ */
const PERF_FILTERS = [
  { value: '', label: 'All' },
  { value: 'excellent', label: 'Excellent (4+)' },
  { value: 'good', label: 'Good (3–4)' },
  { value: 'needs-attention', label: 'Needs Attention (2–3)' },
  { value: 'poor', label: 'Poor (<2)' }
];

const OUTSTANDING_FILTERS = [
  { value: '', label: 'All' },
  { value: 'has', label: 'Has Outstanding' },
  { value: 'none', label: 'No Outstanding' }
];

const RATING_FILTERS = [
  { value: '', label: 'All' },
  { value: '4+', label: '4+ Stars' },
  { value: '3+', label: '3+ Stars' },
  { value: 'below3', label: 'Below 3' }
];

/* ================================================================== */
/*  Action Menu Component                                              */
/* ================================================================== */

/**
 * Export one vendor's report as CSV. Reuses the same EXPORT_COLUMNS and
 * record shape as the full-table export so a single-vendor file and the
 * ranking export line up column for column.
 */
function exportVendorReport(row) {
  const record = {
    rank: row.rank,
    name: row.name,
    category: row.category,
    poCount: row.poCount,
    spend: formatINR(row.spend),
    invoiceValue: formatINR(row.invoiceValue),
    paidValue: formatINR(row.paidValue),
    outstanding: formatINR(row.outstanding),
    share: `${row.share}%`,
    rating: Number(row.rating || 0).toFixed(1),
    onTimeDelivery: `${row.onTimeDelivery}%`
  };
  const slug = String(row.name || row.id || 'vendor').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  exportCsv(EXPORT_COLUMNS, [record], `vendor-report-${slug}`);
}

function ActionMenu({ row, navigate, onViewVendor }) {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(() => setOpen(false), open);

  const actions = [
    { key: 'view', label: 'View Vendor', icon: Eye, onClick: () => onViewVendor(row) },
    { key: 'performance', label: 'Vendor Performance', icon: BarChart3, onClick: () => navigate('/purchase/vendors/performance') },
    { key: 'orders', label: 'Purchase Orders', icon: Package, onClick: () => navigate('/purchase/orders') },
    { key: 'invoices', label: 'Invoices', icon: CreditCard, onClick: () => navigate('/purchase/invoices') },
    { key: 'payment', label: 'Payment History', icon: IndianRupee, onClick: () => navigate('/purchase/invoices/vendor-payment') },
    { key: 'edit', label: 'Edit Vendor', icon: FileText, onClick: () => navigate(`/purchase/vendors/${row.id}/edit`) },
    { key: 'export', label: 'Export Vendor Report', icon: FileText, onClick: () => exportVendorReport(row) }
  ];

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((p) => !p)} className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer" aria-label="Actions" aria-haspopup="menu" aria-expanded={open}>
        <MoreVertical className="w-4 h-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-52 bg-white border border-slate-200 rounded-xl shadow-lg py-1 z-50" role="menu">
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <button key={action.key} type="button" onClick={() => { setOpen(false); action.onClick(); }} className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center gap-2 text-xs font-semibold text-slate-700 transition-colors cursor-pointer" role="menuitem">
                <Icon className="w-3.5 h-3.5 text-slate-400" />
                {action.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ================================================================== */
/*  Vendor Detail Modal                                                 */
/* ================================================================== */
function VendorDetailModal({ vendor, open, onClose, navigate }) {
  if (!open || !vendor) return null;
  const perfLabel = vendor.rating >= 4 ? 'Excellent' : vendor.rating >= 3 ? 'Good' : vendor.rating >= 2 ? 'Needs Attention' : 'Poor';
  const perfColor = vendor.rating >= 4 ? 'text-emerald-600 bg-emerald-50' : vendor.rating >= 3 ? 'text-sky-600 bg-sky-50' : vendor.rating >= 2 ? 'text-amber-600 bg-amber-50' : 'text-rose-600 bg-rose-50';

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative bg-white rounded-xl border border-slate-200 shadow-[0_20px_60px_rgba(15,23,42,0.25)] w-full max-w-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <div>
            <h3 className="text-sm font-bold text-slate-900">{vendor.name}</h3>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[11px] text-slate-400">{vendor.id}</span>
              <span className="text-slate-300">·</span>
              <span className="text-[11px] text-slate-500">{vendor.category}</span>
              <span className={`ml-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${perfColor}`}>{perfLabel}</span>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer" aria-label="Close"><X className="w-4 h-4" /></button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 overflow-y-auto space-y-5">
          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Total Spend', value: formatINR(vendor.spend), color: 'text-emerald-600' },
              { label: 'Total POs', value: vendor.poCount, color: 'text-indigo-600' },
              { label: 'Invoiced', value: formatINR(vendor.invoiceValue), color: 'text-violet-600' },
              { label: 'Paid', value: formatINR(vendor.paidValue), color: 'text-emerald-600' },
              { label: 'Outstanding', value: formatINR(vendor.outstanding), color: vendor.outstanding > 0 ? 'text-rose-600' : 'text-slate-600' },
              { label: 'Rating', value: `${vendor.rating.toFixed(1)} / 5`, color: 'text-amber-600' },
              { label: 'On-Time', value: `${vendor.onTimeDelivery}%`, color: vendor.onTimeDelivery >= 90 ? 'text-emerald-600' : vendor.onTimeDelivery >= 70 ? 'text-amber-600' : 'text-rose-600' },
              { label: 'Share', value: `${vendor.share}%`, color: 'text-sky-600' }
            ].map((kpi) => (
              <div key={kpi.label} className="bg-slate-50 rounded-lg border border-slate-200 p-3 text-center">
                <div className={`text-sm font-bold tabular-nums ${kpi.color}`}>{kpi.value}</div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wide mt-0.5">{kpi.label}</div>
              </div>
            ))}
          </div>

          {/* Performance summary */}
          <div>
            <h4 className="text-xs font-bold text-slate-700 mb-2">Performance Summary</h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-50 rounded-lg p-3">
                <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Delivery Performance</div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${vendor.onTimeDelivery >= 90 ? 'bg-emerald-500' : vendor.onTimeDelivery >= 70 ? 'bg-amber-500' : 'bg-rose-500'}`} style={{ width: `${vendor.onTimeDelivery}%` }} />
                  </div>
                  <span className="text-xs font-bold tabular-nums text-slate-700">{vendor.onTimeDelivery}%</span>
                </div>
              </div>
              <div className="bg-slate-50 rounded-lg p-3">
                <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Payment Status</div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-emerald-500" style={{ width: vendor.invoiceValue > 0 ? `${(vendor.paidValue / vendor.invoiceValue) * 100}%` : '0%' }} />
                  </div>
                  <span className="text-xs font-bold tabular-nums text-slate-700">{vendor.invoiceValue > 0 ? Math.round((vendor.paidValue / vendor.invoiceValue) * 100) : 0}%</span>
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => { onClose(); navigate(`/purchase/vendors/${vendor.id}`); }} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-[#0B4A3D] bg-[#EDF7F4] border border-[#BFE0D6] hover:bg-[#E8F0EE] transition-colors cursor-pointer"><Eye className="w-3.5 h-3.5" /> Full Profile</button>
            <button type="button" onClick={() => { onClose(); navigate('/purchase/orders'); }} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-slate-600 bg-slate-100 border border-slate-200 hover:bg-slate-200 transition-colors cursor-pointer"><Package className="w-3.5 h-3.5" /> Purchase Orders</button>
            <button type="button" onClick={() => { onClose(); navigate('/purchase/invoices'); }} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-slate-600 bg-slate-100 border border-slate-200 hover:bg-slate-200 transition-colors cursor-pointer"><CreditCard className="w-3.5 h-3.5" /> Invoices</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Main Component                                                     */
/* ================================================================== */
export default function VendorAnalysis() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [filters, setFilters] = useState({ dateRange: 'last-12-months' });
  const [filterOptions, setFilterOptions] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  /* Table state */
  const [sortKey, setSortKey] = useState('spend');
  const [sortDir, setSortDir] = useState('desc');

  /* Inline filter state */
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [perfFilter, setPerfFilter] = useState('');
  const [outstandingFilter, setOutstandingFilter] = useState('');
  const [ratingFilter, setRatingFilter] = useState('');

  /* Vendor detail modal */
  const [detailVendor, setDetailVendor] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [result, fo] = await Promise.all([
        reportsService.getVendorAnalysis(filters),
        reportsService.getFilterOptions()
      ]);
      setData(result);
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

  /* Sorting handler — tri-state: desc → asc → neutral (default spend desc) */
  const handleSort = useCallback((key) => {
    setSortKey((prev) => {
      if (prev === key) {
        setSortDir((d) => (d === 'desc' ? 'asc' : d === 'asc' ? '' : 'desc'));
        return prev === 'spend' && sortDir === 'asc' ? '' : key;
      }
      setSortDir('desc');
      return key;
    });
  }, [sortDir]);

  /* Clear inline filters */
  const clearInlineFilters = useCallback(() => {
    setSearchQuery('');
    setCategoryFilter('');
    setPerfFilter('');
    setOutstandingFilter('');
    setRatingFilter('');
  }, []);

  const hasInlineFilters = searchQuery || categoryFilter || perfFilter || outstandingFilter || ratingFilter;

  /* ------------------------------------------------------------------ */
  /*  Centrally computed vendor data — filtered + sorted                  */
  /* ------------------------------------------------------------------ */
  const filteredData = useMemo(() => {
    if (!data?.performance) return [];
    let list = [...data.performance];

    /* Apply inline filters */
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter((v) => v.name.toLowerCase().includes(q) || (v.id || '').toLowerCase().includes(q));
    }
    if (categoryFilter) {
      list = list.filter((v) => v.category === categoryFilter);
    }
    if (perfFilter) {
      list = list.filter((v) => {
        if (perfFilter === 'excellent') return v.rating >= 4;
        if (perfFilter === 'good') return v.rating >= 3 && v.rating < 4;
        if (perfFilter === 'needs-attention') return v.rating >= 2 && v.rating < 3;
        if (perfFilter === 'poor') return v.rating < 2;
        return true;
      });
    }
    if (outstandingFilter === 'has') list = list.filter((v) => v.outstanding > 0);
    if (outstandingFilter === 'none') list = list.filter((v) => v.outstanding === 0);
    if (ratingFilter === '4+') list = list.filter((v) => v.rating >= 4);
    if (ratingFilter === '3+') list = list.filter((v) => v.rating >= 3);
    if (ratingFilter === 'below3') list = list.filter((v) => v.rating < 3);

    /* Sort */
    if (sortKey && sortDir) {
      list.sort((a, b) => {
        const aVal = Number(a[sortKey]) || 0;
        const bVal = Number(b[sortKey]) || 0;
        return sortDir === 'desc' ? bVal - aVal : aVal - bVal;
      });
    } else {
      /* Default: sort by spend desc */
      list.sort((a, b) => (Number(b.spend) || 0) - (Number(a.spend) || 0));
    }

    return list.map((v, i) => ({ ...v, rank: i + 1 }));
  }, [data, searchQuery, categoryFilter, perfFilter, outstandingFilter, ratingFilter, sortKey, sortDir]);

  /* ------------------------------------------------------------------ */
  /*  KPI cards                                                          */
  /* ------------------------------------------------------------------ */
  const kpiCards = useMemo(() =>
    KPI_DEFS.map((def) => ({
      ...def,
      value: def.key === 'topShare'
        ? `${data?.concentration?.[0]?.share ?? 0}%`
        : def.currency
          ? formatAmount(data?.[def.key] ?? 0)
          : String(data?.[def.key] ?? 0)
    })),
    [data]
  );

  /* ------------------------------------------------------------------ */
  /*  Export records — from filtered data                                 */
  /* ------------------------------------------------------------------ */
  const exportRecords = useMemo(() =>
    filteredData.map((v) => ({
      rank: v.rank,
      name: v.name,
      category: v.category,
      poCount: v.poCount,
      spend: formatINR(v.spend),
      invoiceValue: formatINR(v.invoiceValue),
      paidValue: formatINR(v.paidValue),
      outstanding: formatINR(v.outstanding),
      share: `${v.share}%`,
      rating: v.rating.toFixed(1),
      onTimeDelivery: `${v.onTimeDelivery}%`
    })),
    [filteredData]
  );

  /* ------------------------------------------------------------------ */
  /*  Spend concentration — top 5 + Others                               */
  /* ------------------------------------------------------------------ */
  const concentrationData = useMemo(() => {
    if (!data?.concentration?.length) return [];
    const top = data.concentration.slice(0, 5);
    const topSpend = top.reduce((s, v) => s + v.spend, 0);
    const totalAll = data.concentration.reduce((s, v) => s + v.spend, 0);
    const othersSpend = totalAll - topSpend;
    const maxSpend = top[0]?.spend || 1;
    const result = top.map((v) => ({ ...v, barWidth: Math.min(100, (v.spend / maxSpend) * 100) }));
    if (othersSpend > 0) {
      result.push({ name: 'Others', spend: othersSpend, share: totalAll ? Math.round((othersSpend / totalAll) * 1000) / 10 : 0, barWidth: Math.min(100, (othersSpend / maxSpend) * 100), isOthers: true });
    }
    return result;
  }, [data]);

  /* ------------------------------------------------------------------ */
  /*  Outstanding by vendor                                              */
  /* ------------------------------------------------------------------ */
  const outstandingData = useMemo(() => {
    if (!data?.performance) return [];
    return data.performance.filter((v) => v.outstanding > 0).sort((a, b) => b.outstanding - a.outstanding).slice(0, 6);
  }, [data]);

  const totalOutstanding = useMemo(() => outstandingData.reduce((s, v) => s + v.outstanding, 0), [outstandingData]);
  const maxOutstanding = outstandingData.length > 0 ? outstandingData[0].outstanding : 1;

  /* ------------------------------------------------------------------ */
  /*  Categories for filter dropdown                                      */
  /* ------------------------------------------------------------------ */
  const categories = useMemo(() => {
    if (!data?.performance) return [];
    return [...new Set(data.performance.map((v) => v.category))].filter(Boolean).sort();
  }, [data]);

  /* ------------------------------------------------------------------ */
  /*  Sort direction indicator                                            */
  /* ------------------------------------------------------------------ */
  const sortIndicator = (key) => {
    if (sortKey !== key) return null;
    return sortDir === 'desc' ? ' ↓' : sortDir === 'asc' ? ' ↑' : '';
  };

  /* ================================================================ */
  /*  RENDER                                                            */
  /* ================================================================ */
  return (
    <PurchasePageLayout
      staticHeader={
        <>
          <PurchaseHeader
            crumb="Purchase · Reports · Vendors"
            title="Vendor Analysis"
            subtitle="Spend concentration and ranked vendor performance"
            actions={
              <button type="button" onClick={refresh} className="flex items-center gap-1.5 text-xs font-bold text-slate-600 bg-surface border border-slate-200 px-3 py-2.5 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer select-none">
                <RefreshCw className={`w-3.5 h-3.5 text-slate-400 ${loading ? 'animate-spin' : ''}`} /> Refresh
              </button>
            }
          />
          <ModuleTabNav module="reports" />
          <ReportFilters filters={filters} onApply={applyFilters} onReset={resetFilters} loading={loading} filterOptions={filterOptions} />
        </>
      }
    >
      {error && (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-4 flex items-center justify-between gap-3">
          <p className="text-xs font-semibold text-rose-600">{error?.message || 'Failed to load vendor analysis.'}</p>
          <button type="button" onClick={refresh} className="text-xs font-bold text-rose-600 underline cursor-pointer">Retry</button>
        </div>
      )}

      <PurchaseKpiCards cards={kpiCards} loading={loading} gridClass="grid-cols-1 sm:grid-cols-3" />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 mt-6 items-start">

        {/* ===================== LEFT: Ranking Table ===================== */}
        <div className="xl:col-span-2 space-y-5">
          <PurchaseSectionCard
            title="Vendor Performance Ranking"
            subtitle="All vendors ranked by procurement spend and performance"
            bodyClassName="p-0"
            action={
              <ExportMenu
                columns={EXPORT_COLUMNS}
                records={exportRecords}
                filename="vendor-analysis"
                title="Vendor Analysis"
              />
            }
          >
            {/* Sort controls */}
            <div className="flex flex-wrap items-center gap-2 px-4 pt-3 pb-2">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Sort by:</span>
              {SORT_KEYS.map((cfg) => (
                <button key={cfg.key} type="button" onClick={() => handleSort(cfg.key)} className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${sortKey === cfg.key && sortDir ? 'bg-[#0B4A3D] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                  {cfg.label}{sortIndicator(cfg.key)}
                </button>
              ))}
              {hasInlineFilters && (
                <button type="button" onClick={clearInlineFilters} className="ml-auto flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-rose-50 text-rose-600 hover:bg-rose-100 transition-colors cursor-pointer">
                  <X className="w-3 h-3" /> Clear Filters
                </button>
              )}
            </div>

            {/* Inline filters */}
            <div className="flex flex-wrap items-end gap-3 px-4 pb-3">
              <div className="min-w-[180px]">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Search Vendor</label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Name or code..." className="w-full h-8 pl-8 pr-3 rounded-lg border border-slate-200 bg-slate-50 text-[11px] text-slate-700 placeholder-slate-400 outline-none focus:border-[#0B4A3D] focus:bg-white transition-all" />
                </div>
              </div>
              <div className="min-w-[140px]">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Category</label>
                <div className="relative">
                  <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="w-full h-8 pl-2.5 pr-7 rounded-lg border border-slate-200 bg-slate-50 text-[11px] text-slate-700 appearance-none outline-none focus:border-[#0B4A3D] cursor-pointer">
                    <option value="">All Categories</option>
                    {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
                </div>
              </div>
              <div className="min-w-[130px]">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Performance</label>
                <div className="relative">
                  <select value={perfFilter} onChange={(e) => setPerfFilter(e.target.value)} className="w-full h-8 pl-2.5 pr-7 rounded-lg border border-slate-200 bg-slate-50 text-[11px] text-slate-700 appearance-none outline-none focus:border-[#0B4A3D] cursor-pointer">
                    {PERF_FILTERS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
                </div>
              </div>
              <div className="min-w-[130px]">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Outstanding</label>
                <div className="relative">
                  <select value={outstandingFilter} onChange={(e) => setOutstandingFilter(e.target.value)} className="w-full h-8 pl-2.5 pr-7 rounded-lg border border-slate-200 bg-slate-50 text-[11px] text-slate-700 appearance-none outline-none focus:border-[#0B4A3D] cursor-pointer">
                    {OUTSTANDING_FILTERS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
                </div>
              </div>
              <div className="min-w-[120px]">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Rating</label>
                <div className="relative">
                  <select value={ratingFilter} onChange={(e) => setRatingFilter(e.target.value)} className="w-full h-8 pl-2.5 pr-7 rounded-lg border border-slate-200 bg-slate-50 text-[11px] text-slate-700 appearance-none outline-none focus:border-[#0B4A3D] cursor-pointer">
                    {RATING_FILTERS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
                </div>
              </div>
            </div>

            {/* Table */}
            <div className="pr-table-card" style={{ marginBottom: 0, borderRadius: 0, border: 'none', boxShadow: 'none' }}>
              <div className="pr-table-wrap">
                <table className="pr-table" style={{ tableLayout: 'fixed' }}>
                  <colgroup>
                    {COLS.map((c) => <col key={c.key} style={{ width: c.width }} />)}
                  </colgroup>
                  <thead>
                    <tr>
                      {COLS.map((c) => (
                        <th key={c.key} scope="col" style={{ textAlign: c.align === 'right' ? 'right' : c.align === 'center' ? 'center' : 'left' }}>
                          {c.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      Array.from({ length: 5 }).map((_, i) => (
                        <tr key={`skel-${i}`}>
                          {COLS.map((c) => (
                            <td key={c.key}>
                              <div className="h-4 bg-slate-100 rounded animate-pulse" style={{ width: c.key === 'actions' ? 20 : '70%' }} />
                            </td>
                          ))}
                        </tr>
                      ))
                    ) : filteredData.length === 0 ? (
                      <tr>
                        <td colSpan={COLS.length} className="text-center py-10">
                          <p className="text-sm font-semibold text-slate-500">No vendors match your filters</p>
                          <p className="text-xs text-slate-400 mt-1">Try adjusting your search or filter criteria</p>
                        </td>
                      </tr>
                    ) : (
                      filteredData.map((row) => (
                        <tr key={row.id || row.name}>
                          {/* Rank */}
                          <td style={{ textAlign: 'center' }}>
                            <span className={`inline-flex items-center justify-center w-7 h-7 rounded-lg text-[11px] font-bold ${row.rank <= 3 ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-200' : 'bg-slate-50 text-slate-500'}`}>{row.rank}</span>
                          </td>
                          {/* Vendor */}
                          <td>
                            <div className="min-w-0">
                              <div className="text-[11px] font-bold text-slate-800 truncate leading-tight">{row.name}</div>
                              {row.id && <div className="text-[10px] text-slate-400 font-medium mt-0.5">{row.id}</div>}
                            </div>
                          </td>
                          {/* Category */}
                          <td>
                            <span className="text-[11px] text-slate-600 font-medium truncate block" title={row.category}>{row.category}</span>
                          </td>
                          {/* Orders */}
                          <td style={{ textAlign: 'center' }}>
                            <span className="text-[11px] font-semibold text-slate-700 tabular-nums">{row.poCount} {row.poCount === 1 ? 'PO' : 'POs'}</span>
                          </td>
                          {/* Spend */}
                          <td style={{ textAlign: 'right' }}>
                            <span className="text-[11px] font-bold text-slate-800 tabular-nums whitespace-nowrap">{formatAmount(row.spend)}</span>
                          </td>
                          {/* Invoiced */}
                          <td style={{ textAlign: 'right' }}>
                            <span className="text-[11px] font-semibold text-slate-600 tabular-nums whitespace-nowrap">{formatAmount(row.invoiceValue)}</span>
                          </td>
                          {/* Paid */}
                          <td style={{ textAlign: 'right' }}>
                            <span className={`text-[11px] font-semibold tabular-nums whitespace-nowrap ${row.paidValue > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>{formatAmount(row.paidValue)}</span>
                          </td>
                          {/* Outstanding */}
                          <td style={{ textAlign: 'right' }}>
                            <span className={`text-[11px] font-bold tabular-nums whitespace-nowrap ${row.outstanding > 0 ? 'text-rose-600' : 'text-slate-400'}`}>{formatAmount(row.outstanding)}</span>
                          </td>
                          {/* Share */}
                          <td style={{ textAlign: 'center' }}>
                            <div className="flex items-center justify-center gap-1.5">
                              <div className="w-12 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                <div className="h-full rounded-full bg-violet-500" style={{ width: `${Math.min(100, row.share)}%` }} />
                              </div>
                              <span className="text-[10px] font-bold text-slate-600 tabular-nums">{row.share}%</span>
                            </div>
                          </td>
                          {/* Rating */}
                          <td style={{ textAlign: 'center' }}>
                            <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-slate-700 tabular-nums">
                              <Star className="w-3 h-3 text-amber-500 fill-amber-500" /> {row.rating.toFixed(1)}
                            </span>
                          </td>
                          {/* On-Time */}
                          <td style={{ textAlign: 'center' }}>
                            <span className={`inline-flex items-center gap-0.5 text-[11px] font-bold tabular-nums ${row.onTimeDelivery >= 90 ? 'text-emerald-600' : row.onTimeDelivery >= 70 ? 'text-amber-600' : 'text-rose-600'}`}>
                              <PackageCheck className="w-3 h-3" /> {row.onTimeDelivery}%
                            </span>
                          </td>
                          {/* Actions */}
                          <td style={{ textAlign: 'center', overflow: 'visible' }}>
                            <ActionMenu row={row} navigate={navigate} onViewVendor={setDetailVendor} />
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </PurchaseSectionCard>
        </div>

        {/* ===================== RIGHT: Sidebar Cards ===================== */}
        <div className="space-y-5">
          <PurchaseChartCard title="Spend Concentration" subtitle="Distribution of total spend" loading={loading} empty={!loading && !concentrationData.length} emptyTitle="No vendor data available" emptyMessage="Spend distribution will appear here." exportFilename="vendor-spend-concentration">
            <div className="space-y-3.5">
              {concentrationData.map((entry, index) => (
                <div key={entry.name}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className={`w-5 text-center text-[11px] font-bold ${!entry.isOthers && index < 3 ? 'text-amber-500' : 'text-slate-300'}`}>{entry.isOthers ? '+' : index + 1}</span>
                      <span className={`text-xs font-bold truncate ${entry.isOthers ? 'text-slate-400 italic' : 'text-slate-700'}`}>{entry.name}</span>
                    </div>
                    <div className="text-right ml-2 flex-shrink-0">
                      <span className="text-xs font-bold text-slate-700 tabular-nums">{formatINR(entry.spend)}</span>
                      <span className="text-[10px] text-slate-400 ml-1.5 tabular-nums">{entry.share}%</span>
                    </div>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${entry.barWidth}%`, backgroundColor: entry.isOthers ? '#cbd5e1' : index < 3 ? '#059669' : '#6ee7b7' }} />
                  </div>
                </div>
              ))}
            </div>
          </PurchaseChartCard>

          <PurchaseChartCard title="Outstanding by Vendor" subtitle="Pending payment balances" loading={loading} empty={!loading && outstandingData.length === 0} emptyTitle="No outstanding amounts" emptyMessage="All vendor invoices are paid." exportFilename="vendor-outstanding">
            <div className="space-y-3">
              {outstandingData.map((v) => (
                <div key={v.name}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-semibold text-slate-700 truncate max-w-[130px]">{v.name}</span>
                    <span className="text-rose-600 font-bold tabular-nums whitespace-nowrap">{formatINR(v.outstanding)}</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-rose-400 rounded-full transition-all" style={{ width: `${maxOutstanding > 0 ? (v.outstanding / maxOutstanding) * 100 : 0}%` }} />
                  </div>
                </div>
              ))}
              {outstandingData.length > 0 && (
                <div className="pt-3 mt-1 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-600">Total Outstanding</span>
                  <span className="text-sm font-bold text-rose-600 tabular-nums">{formatINR(totalOutstanding)}</span>
                </div>
              )}
            </div>
          </PurchaseChartCard>
        </div>
      </div>

      {/* Vendor Detail Modal */}
      <VendorDetailModal vendor={detailVendor} open={!!detailVendor} onClose={() => setDetailVendor(null)} navigate={navigate} />
    </PurchasePageLayout>
  );
}
