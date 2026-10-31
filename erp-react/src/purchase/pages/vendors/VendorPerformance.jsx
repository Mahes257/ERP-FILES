/**
 * purchase/pages/vendors/VendorPerformance.jsx
 * ------------------------------------------------------------------
 * Vendor Performance — ranked performance board across vendors using
 * rating, on-time delivery, order volume, lead time and spend, with a
 * composite score, KPI summary, chart cards and export. Mirrors the
 * Purchase Requisition List master design (purchase-page.cpr-page
 * shell + shared list components) with vendor business data.
 *
 * KPI set: Average Rating · On-Time Delivery · Quality Score · Active
 * Vendors · Preferred Vendors · Average Lead Time.
 *
 * Charts: Performance Trend · Delivery Score · Category Performance ·
 * Monthly Rating Trend · Lead Time Comparison · Spend vs Performance ·
 * Top 10 Vendors · Supplier Score Matrix. Every chart carries a legend
 * and a PNG / PDF export menu (shared ChartExportMenu component).
 * Scoring logic is shared via purchase/utils/vendorMetrics.js.
 * ------------------------------------------------------------------
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Award, BarChart3, Eye, Filter, PackageCheck, Printer,
  RefreshCw, ShieldCheck, Star, Timer, TrendingUp, X
} from 'lucide-react';
import PurchaseHeader from '../../components/PurchaseHeader';
import PurchaseKpiCards from '../../components/PurchaseKpiCards';
import { PurchaseStatusCell } from '../../components/list';
import PurchasePageLayout from '../../components/list/PurchasePageLayout';
import PurchaseSectionCard from '../../components/PurchaseSectionCard';
import PurchaseMiniBarChart from '../../components/PurchaseMiniBarChart';
import ChartExportMenu from '../../components/ChartExportMenu';
import {
  PurchaseToolbar,
  PurchaseSearch,
  PurchaseFilters,
  PurchaseTable,
  PurchasePagination,
  PurchaseExportDropdown,
  PurchaseColumnsDropdown
} from '../../components/list';
import { vendorService } from '../../services/vendor';
import { VENDOR_CATEGORIES } from '../../constants';
import { formatAmount } from '../../utils/purchase';
import { computeVendorScore, isPreferredVendor, metricNumber, qualityOfVendor } from '../../utils/vendorMetrics';
import { topVendorsBySpend } from '../../utils/vendorSelectors';
import { avatarColor, getInitials } from '../../utils/helpers';
import { exportCsv, exportExcel, exportPdf, printTable } from '../../utils/export';
import ModuleTabNav from '../../components/ModuleTabNav';
import '../../styles/cpr-list.css';
import '../../styles/requisition-list-polish.css';

const COLUMNS = [
  { key: 'name', label: 'Vendor', width: 200, sortable: true, visible: true, sticky: 'left' },
  { key: 'category', label: 'Category', width: 160, sortable: true, visible: true },
  { key: 'orders', label: 'Orders', width: 90, sortable: true, visible: true, align: 'right' },
  { key: 'spend', label: 'Spend', width: 140, sortable: true, visible: true, align: 'right' },
  { key: 'quality', label: 'Quality', width: 100, sortable: true, visible: true, align: 'center' },
  { key: 'delivery', label: 'Delivery', width: 110, sortable: true, visible: true, align: 'center' },
  { key: 'rating', label: 'Rating', width: 100, sortable: true, visible: true, align: 'center' },
  { key: 'performance', label: 'Performance', width: 130, sortable: true, visible: true, align: 'center' },
  { key: 'status', label: 'Status', width: 130, sortable: true, visible: true, align: 'center' },
  { key: 'actions', label: 'Actions', width: 96, sortable: false, visible: true, sticky: 'right', align: 'center' }
];

/** Performance-page KPIs. */
const KPI_CARDS = [
  { key: 'avgRating', label: 'Average Rating', icon: Star, color: '#d97706', bg: 'rgba(217,119,6,0.10)' },
  { key: 'avgOnTime', label: 'On-Time Delivery', icon: PackageCheck, color: '#16a34a', bg: 'rgba(22,163,74,0.10)' },
  { key: 'qualityScore', label: 'Quality Score', icon: Award, color: '#7c3aed', bg: 'rgba(124,58,237,0.10)' },
  { key: 'preferredCount', label: 'Preferred Vendors', icon: ShieldCheck, color: '#0A4F44', bg: 'rgba(10,79,68,0.08)' },
  { key: 'avgLeadTime', label: 'Average Lead Time', icon: Timer, color: '#dc2626', bg: 'rgba(220,38,38,0.10)' }
];

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

/** Score-matrix quadrant thresholds. */
const MATRIX_RATING = 4.0;
const MATRIX_OTD = 90;

/** Small inline legend strip shared by every chart card. */
function ChartLegend({ items }) {
  return (
    <div className="flex flex-wrap items-center gap-4 mt-3 pt-3 border-t border-slate-100 dark:border-white/10">
      {items.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: item.color }} aria-hidden="true" />
          {item.label}
        </span>
      ))}
    </div>
  );
}

/** Ranked-row visual used by Top 10 Vendors. */
function RankedRow({ rank, vendor }) {
  return (
    <div className="flex items-center gap-3">
      <span
        className={`flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold shrink-0 ${
          rank <= 3 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
        }`}
      >
        {rank}
      </span>
      <span className={`flex items-center justify-center w-7 h-7 rounded-full text-[10px] font-bold shrink-0 ${avatarColor(vendor.name)}`}>
        {getInitials(vendor.name)}
      </span>
      <span className="min-w-0 flex-1 truncate text-xs font-bold text-slate-700" title={vendor.name}>
        {vendor.name}
      </span>
      <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-semibold text-slate-400">
        <Star className="w-3 h-3 text-amber-500" /> {vendor.rating.toFixed(1)}
      </span>
      <span className="text-[11px] font-semibold text-slate-400">{vendor.onTimeDelivery}%</span>
      <span className={`w-10 text-right text-xs font-bold tabular-nums ${vendor.score >= 80 ? 'text-emerald-600' : vendor.score >= 65 ? 'text-amber-600' : 'text-rose-600'}`}>
        {vendor.score}
      </span>
    </div>
  );
}

const Skeleton = ({ height = 'h-44' }) => <div className={`${height} bg-slate-100 rounded-lg animate-pulse`} />;

export default function VendorPerformance() {
  const navigate = useNavigate();

  const [vendors, setVendors] = useState([]);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [filterOpen, setFilterOpen] = useState(false);
  const [columns, setColumns] = useState(() => COLUMNS.map((col) => ({ ...col })));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  /* Chart DOM refs for the per-chart PNG / PDF export menus. */
  const trendRef = useRef(null);
  const deliveryRef = useRef(null);
  const categoryRef = useRef(null);
  const monthlyRef = useRef(null);
  const leadTimeRef = useRef(null);
  const spendVsRef = useRef(null);
  const topTenRef = useRef(null);
  const matrixRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await vendorService.getVendorPerformance();
      /* Metrics are coerced once here so every downstream consumer — KPIs,
         charts, score matrix and table cells — renders a real number or the
         documented zero state instead of NaN. A supplier with no transaction
         history has no delivery/order/spend aggregate yet. */
      const rows = Array.isArray(data) ? data : [];
      const ranked = rows.map((vendor, index) => {
        const metrics = {
          rating: metricNumber(vendor?.rating),
          onTimeDelivery: metricNumber(vendor?.onTimeDelivery),
          leadTimeDays: metricNumber(vendor?.leadTimeDays),
          orders: metricNumber(vendor?.orders),
          spend: metricNumber(vendor?.spend)
        };
        return { ...vendor, ...metrics, rank: index + 1, score: computeVendorScore(metrics) };
      });
      setVendors(ranked);
      setError(null);
    } catch (err) {
      console.error('[VendorPerformance] load failed:', err);
      console.error(err?.stack);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(load);
  }, [load, refreshKey]);

  const refresh = useCallback(() => setRefreshKey((key) => key + 1), []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return vendors.filter((vendor) => {
      if (category !== 'All' && vendor.category !== category) return false;
      if (q && ![vendor.name, vendor.category, vendor.city, vendor.gstin].filter(Boolean).join(' ').toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [vendors, query, category]);

  const stats = useMemo(() => {
    const avgRating = vendors.length
      ? Math.round((vendors.reduce((sum, vendor) => sum + vendor.rating, 0) / vendors.length) * 10) / 10
      : 0;
    const avgOnTime = vendors.length
      ? Math.round(vendors.reduce((sum, vendor) => sum + vendor.onTimeDelivery, 0) / vendors.length)
      : 0;
    const qualityScore = vendors.length
      ? Math.round(vendors.reduce((sum, vendor) => sum + qualityOfVendor(vendor), 0) / vendors.length)
      : 0;
    const avgLeadTime = vendors.length
      ? Math.round((vendors.reduce((sum, vendor) => sum + vendor.leadTimeDays, 0) / vendors.length) * 10) / 10
      : 0;
    return {
      avgRating,
      avgOnTime,
      qualityScore,
      preferredCount: vendors.filter((vendor) => isPreferredVendor(vendor)).length,
      avgLeadTime
    };
  }, [vendors]);

  const kpiCards = KPI_CARDS.map((def) => ({
    ...def,
    value:
      def.key === 'avgOnTime' || def.key === 'qualityScore'
        ? `${stats[def.key]}%`
        : def.key === 'avgRating'
          ? stats[def.key].toFixed(1)
          : def.key === 'avgLeadTime'
            ? `${stats[def.key]}d`
            : String(stats[def.key] ?? 0)
  }));

  /* ---- Chart data (deterministic, derived from the performance board) ---- */
  const performanceTrend = useMemo(
    () => [...vendors].sort((a, b) => b.score - a.score).slice(0, 6),
    [vendors]
  );

  const deliveryTop = useMemo(
    () => [...vendors].sort((a, b) => b.onTimeDelivery - a.onTimeDelivery).slice(0, 6),
    [vendors]
  );

  const categoryCompare = useMemo(() => {
    const byCategory = {};
    vendors.forEach((vendor) => {
      const key = vendor.category || 'Other';
      if (!byCategory[key]) byCategory[key] = { total: 0, count: 0 };
      byCategory[key].total += vendor.onTimeDelivery;
      byCategory[key].count += 1;
    });
    return Object.entries(byCategory)
      .map(([categoryName, data]) => ({ category: categoryName, value: Math.round(data.total / data.count) }))
      .sort((a, b) => b.value - a.value);
  }, [vendors]);

  const topSpendVendors = useMemo(() => {
    return topVendorsBySpend(vendors, 6);
  }, [vendors]);

  const leadTimeCompare = useMemo(() => {
    const sorted = [...vendors].sort((a, b) => a.leadTimeDays - b.leadTimeDays).slice(0, 6);
    const maxLead = Math.max(1, ...vendors.map((vendor) => vendor.leadTimeDays));
    return sorted.map((vendor) => ({
      ...vendor,
      pct: Math.max(8, Math.round((1 - vendor.leadTimeDays / maxLead) * 100))
    }));
  }, [vendors]);

  const spendVsScore = useMemo(() => {
    const sorted = [...vendors].sort((a, b) => b.spend - a.spend).slice(0, 6);
    const maxSpend = Math.max(1, ...sorted.map((vendor) => vendor.spend));
    return sorted.map((vendor) => ({
      ...vendor,
      spendPct: Math.max(4, Math.round(((vendor.spend || 0) / maxSpend) * 100))
    }));
  }, [vendors]);

  const topTen = useMemo(() => [...vendors].sort((a, b) => b.score - a.score).slice(0, 10), [vendors]);

  const scoreMatrix = useMemo(() => {
    const quadrants = {
      strategic: { label: 'Strategic Partner', color: '#16a34a', vendors: [] },
      watch: { label: 'Watch Rating', color: '#2563eb', vendors: [] },
      improve: { label: 'Improve Delivery', color: '#d97706', vendors: [] },
      risk: { label: 'At Risk', color: '#dc2626', vendors: [] }
    };
    vendors.forEach((vendor) => {
      const highRating = vendor.rating >= MATRIX_RATING;
      const highOtd = vendor.onTimeDelivery >= MATRIX_OTD;
      const key = highRating && highOtd ? 'strategic' : highRating ? 'improve' : highOtd ? 'watch' : 'risk';
      quadrants[key].vendors.push(vendor);
    });
    return quadrants;
  }, [vendors]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);
  const pageInfo = `Showing ${filtered.length > 0 ? (page - 1) * pageSize + 1 : 0}-${Math.min(page * pageSize, filtered.length)} of ${filtered.length}`;

  const visibleColumns = useMemo(() => columns.filter((col) => col.visible !== false), [columns]);
  const toggleColumn = (key) =>
    setColumns((prev) => prev.map((col) => (col.key === key ? { ...col, visible: !col.visible } : col)));
  const showAllColumns = () =>
    setColumns((prev) => prev.map((col) => (col.key === 'actions' ? col : { ...col, visible: true })));
  const hideAllColumns = () =>
    setColumns((prev) =>
      prev.map((col) => (col.key === 'name' || col.key === 'actions' ? col : { ...col, visible: false }))
    );

  const activeFilterCount = category !== 'All' ? 1 : 0;
  const hasFilters = Boolean(query) || activeFilterCount > 0;

  const resetAll = () => {
    setQuery('');
    setCategory('All');
    setPage(1);
    setFilterOpen(false);
  };

  const handleExport = async (type) => {
    try {
      if (type === 'pdf') await exportPdf({ title: 'Vendor Performance', columns: COLUMNS, records: filtered, filename: 'vendor-performance' });
      else if (type === 'excel') await exportExcel(COLUMNS, filtered, 'vendor-performance');
      else if (type === 'csv') exportCsv(COLUMNS, filtered, 'vendor-performance');
      else if (type === 'print') printTable('Vendor Performance', COLUMNS, filtered);
    } catch (err) {
      setError(err);
    }
  };

  const renderCell = useMemo(
    () => ({
      name: (row) => (
        <button
          type="button"
          onClick={() => navigate(`/purchase/vendors/${row.id}`)}
          className="flex items-center gap-2.5 text-left group cursor-pointer"
        >
          <span className={`flex items-center justify-center w-8 h-8 rounded-full text-[11px] font-bold shrink-0 ${avatarColor(row.name)}`}>
            {getInitials(row.name)}
          </span>
          <span className="min-w-0">
            <span className="block text-xs font-bold text-slate-800 group-hover:text-[#0B4A3D] group-hover:underline truncate max-w-[160px]">
              {row.name}
            </span>
            <span className="block text-[11px] text-slate-400">{row.id}</span>
          </span>
        </button>
      ),
      category: (row) => <span className="cpr-cell-truncate">{row.category || '—'}</span>,
      orders: (row) => <span className="text-slate-600 tabular-nums">{row.orders}</span>,
      spend: (row) => (
        <span className="font-bold text-slate-800 tabular-nums whitespace-nowrap">{formatAmount(row.spend)}</span>
      ),
      quality: (row) => (
        <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-bold ${
          qualityOfVendor(row) >= 90 ? 'bg-violet-50 text-violet-700' : qualityOfVendor(row) >= 75 ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-100 text-slate-500'
        }`}>
          {qualityOfVendor(row)}%
        </span>
      ),
      delivery: (row) => (
        <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-bold ${
          row.onTimeDelivery >= 95 ? 'bg-emerald-50 text-emerald-700' : row.onTimeDelivery >= 85 ? 'bg-amber-50 text-amber-600' : 'bg-rose-50 text-rose-600'
        }`}>
          {row.onTimeDelivery}%
        </span>
      ),
      rating: (row) => (
        <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-700">
          <Star className="w-3 h-3 text-amber-500" /> {row.rating.toFixed(1)}
        </span>
      ),
      performance: (row) => (
        <div className="flex items-center justify-center gap-2">
          <span className="text-xs font-bold text-slate-800 tabular-nums">{row.score}</span>
          <div className="w-14 h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${row.score >= 80 ? 'bg-emerald-500' : row.score >= 65 ? 'bg-amber-500' : 'bg-rose-500'}`}
              style={{ width: `${Math.min(100, row.score)}%` }}
            />
          </div>
        </div>
      ),
      status: (row) => <PurchaseStatusCell status={row.status} />
    }),
    [navigate]
  );

  return (
    <PurchasePageLayout
      staticHeader={
        <>
          <PurchaseHeader
            variant="cpr"
            crumb={[
              { label: 'Vendor Management', to: '/purchase/vendors' },
              { label: 'Performance' }
            ]}
            icon={TrendingUp}
            title="Vendor Performance"
            subtitle="Composite scores from rating, on-time delivery, lead time and volume"
          />

          <ModuleTabNav module="vendors" />
        </>
      }
    >

      {error && (
        <div className="cpr-error-banner" role="alert">
          <p>{error?.message || 'Failed to load vendor performance.'}</p>
          <button type="button" className="cpr-error-retry" onClick={refresh}>Retry</button>
        </div>
      )}

      <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-center gap-2.5">
        <Award className="w-4 h-4 text-amber-600 shrink-0" />
        <p className="text-xs font-semibold text-amber-700">
          Scores are computed as 40% rating, 30% on-time delivery, 15% lead time and 15% order volume.
        </p>
      </div>

      <PurchaseKpiCards variant="cpr" cards={kpiCards} gridClass="" />

      {/* ===== MIDDLE ROW: Performance Trend / Delivery Score / Category ===== */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 mt-6 mb-5 items-start">
        <PurchaseSectionCard
          title="Performance Trend"
          subtitle="Top 6 vendors by composite score"
          icon={TrendingUp}
          action={<ChartExportMenu targetRef={trendRef} filename="vendor-performance-trend" />}
        >
          {loading ? <Skeleton /> : (
            <div ref={trendRef}>
              {performanceTrend.length > 0 ? (
                <PurchaseMiniBarChart
                  labels={performanceTrend.map((vendor) => vendor.name.split(' ')[0])}
                  values={performanceTrend.map((vendor) => vendor.score)}
                  height={190}
                  valueFormat={(value) => String(value)}
                />
              ) : (
                <p className="text-xs text-slate-400 py-8 text-center">No performance data available.</p>
              )}
              <ChartLegend items={[{ label: 'Composite score (0–100)', color: '#0F5B4C' }]} />
            </div>
          )}
        </PurchaseSectionCard>

        <PurchaseSectionCard
          title="Delivery Score"
          subtitle="Top 6 vendors by on-time delivery"
          icon={PackageCheck}
          action={<ChartExportMenu targetRef={deliveryRef} filename="vendor-delivery-score" />}
        >
          {loading ? <Skeleton /> : (
            <div ref={deliveryRef}>
              <div className="space-y-3.5">
                {deliveryTop.map((vendor) => (
                  <div key={vendor.id}>
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="font-bold text-slate-700 truncate">{vendor.name}</span>
                      <span className="text-slate-400 font-semibold">{vendor.onTimeDelivery}%</span>
                    </div>
                    <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${vendor.onTimeDelivery >= 95 ? 'bg-gradient-to-r from-emerald-600 to-emerald-400' : vendor.onTimeDelivery >= 85 ? 'bg-gradient-to-r from-amber-500 to-amber-400' : 'bg-gradient-to-r from-rose-500 to-rose-400'} transition-all`}
                        style={{ width: `${Math.min(100, vendor.onTimeDelivery)}%` }}
                      />
                    </div>
                  </div>
                ))}
                {deliveryTop.length === 0 && <p className="text-xs text-slate-400 py-6 text-center">No delivery data available.</p>}
              </div>
              <ChartLegend
                items={[
                  { label: '≥ 95%', color: '#059669' },
                  { label: '85–94%', color: '#f59e0b' },
                  { label: '< 85%', color: '#f43f5e' }
                ]}
              />
            </div>
          )}
        </PurchaseSectionCard>

        <PurchaseSectionCard
          title="Category Performance"
          subtitle="Average on-time delivery by category"
          icon={BarChart3}
          action={<ChartExportMenu targetRef={categoryRef} filename="vendor-category-performance" />}
        >
          {loading ? <Skeleton /> : (
            <div ref={categoryRef}>
              <div className="space-y-3.5">
                {categoryCompare.map((entry) => (
                  <div key={entry.category}>
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="font-bold text-slate-700 truncate">{entry.category}</span>
                      <span className="text-slate-400 font-semibold">{entry.value}%</span>
                    </div>
                    <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-sky-600 to-sky-400 transition-all"
                        style={{ width: `${Math.min(100, entry.value)}%` }}
                      />
                    </div>
                  </div>
                ))}
                {categoryCompare.length === 0 && <p className="text-xs text-slate-400 py-6 text-center">No category data available.</p>}
              </div>
              <ChartLegend items={[{ label: 'Avg on-time % by category', color: '#0284c7' }]} />
            </div>
          )}
        </PurchaseSectionCard>
      </div>

      {/* ===== BOTTOM ROW: Top Categories by Spend / Lead Time ===== */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 mb-5 items-start">
        <PurchaseSectionCard
          title="Top Vendor Categories by Spend"
          subtitle="Spend distribution across vendor categories"
          icon={BarChart3}
          action={<ChartExportMenu targetRef={monthlyRef} filename="vendor-category-spend" />}
        >
          {loading ? <Skeleton /> : (
            <div ref={monthlyRef}>
              {topSpendVendors.length > 0 ? (
                <PurchaseMiniBarChart
                  labels={topSpendVendors.map((entry) => entry.name.split(' ')[0])}
                  values={topSpendVendors.map((entry) => entry.value)}
                  height={190}
                  valueFormat={(value) => formatAmount(value)}
                />
              ) : (
                <p className="text-xs text-slate-400 py-8 text-center">No vendor spend data available.</p>
              )}
              <ChartLegend items={[{ label: 'Spend by vendor (top 6)', color: '#0F5B4C' }]} />
            </div>
          )}
        </PurchaseSectionCard>

        <PurchaseSectionCard
          title="Lead Time Comparison"
          subtitle="Shortest average lead time first (lower is better)"
          icon={Timer}
          action={<ChartExportMenu targetRef={leadTimeRef} filename="vendor-lead-time" />}
        >
          {loading ? <Skeleton /> : (
            <div ref={leadTimeRef}>
              <div className="space-y-3.5">
                {leadTimeCompare.map((vendor) => (
                  <div key={vendor.id}>
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="font-bold text-slate-700 truncate">{vendor.name}</span>
                      <span className="text-slate-400 font-semibold">{vendor.leadTimeDays}d</span>
                    </div>
                    <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-teal-400 transition-all"
                        style={{ width: `${vendor.pct}%` }}
                      />
                    </div>
                  </div>
                ))}
                {leadTimeCompare.length === 0 && <p className="text-xs text-slate-400 py-6 text-center">No lead time data available.</p>}
              </div>
              <ChartLegend items={[{ label: 'Lead time (shorter = fuller bar)', color: '#0d9488' }]} />
            </div>
          )}
        </PurchaseSectionCard>
      </div>

      {/* ===== BOTTOM ROW (cont.): Spend vs Performance / Top 10 ===== */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 mb-5 items-start">
        <PurchaseSectionCard
          title="Spend vs Performance"
          subtitle="Top 6 vendors by spend — spend vs composite score"
          icon={BarChart3}
          action={<ChartExportMenu targetRef={spendVsRef} filename="vendor-spend-vs-score" />}
        >
          {loading ? <Skeleton /> : (
            <div ref={spendVsRef}>
              <div className="space-y-4">
                {spendVsScore.map((vendor) => (
                  <div key={vendor.id}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-bold text-slate-700 truncate">{vendor.name}</span>
                      <span className="text-slate-400 font-semibold whitespace-nowrap">{formatAmount(vendor.spend)}</span>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="w-16 text-[10px] font-semibold text-slate-400 shrink-0">Spend</span>
                        <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-emerald-400" style={{ width: `${vendor.spendPct}%` }} />
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-16 text-[10px] font-semibold text-slate-400 shrink-0">Score</span>
                        <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-gradient-to-r from-violet-600 to-violet-400" style={{ width: `${Math.min(100, vendor.score)}%` }} />
                        </div>
                        <span className="w-8 text-right text-[11px] font-bold text-slate-600 tabular-nums">{vendor.score}</span>
                      </div>
                    </div>
                  </div>
                ))}
                {spendVsScore.length === 0 && <p className="text-xs text-slate-400 py-6 text-center">No spend data available.</p>}
              </div>
              <ChartLegend
                items={[
                  { label: 'Spend (share of top 6)', color: '#059669' },
                  { label: 'Composite score', color: '#7c3aed' }
                ]}
              />
            </div>
          )}
        </PurchaseSectionCard>

        <PurchaseSectionCard
          title="Top 10 Vendors"
          subtitle="Ranked by composite score"
          icon={Award}
          action={<ChartExportMenu targetRef={topTenRef} filename="vendor-top-10" />}
        >
          {loading ? <Skeleton height="h-56" /> : (
            <div ref={topTenRef}>
              <div className="space-y-2.5">
                {topTen.map((vendor, index) => (
                  <RankedRow key={vendor.id} rank={index + 1} vendor={vendor} />
                ))}
                {topTen.length === 0 && <p className="text-xs text-slate-400 py-6 text-center">No performance data available.</p>}
              </div>
              <ChartLegend
                items={[
                  { label: 'Score ≥ 80 (strong)', color: '#059669' },
                  { label: 'Score 65–79 (moderate)', color: '#d97706' },
                  { label: 'Score < 65 (attention)', color: '#e11d48' }
                ]}
              />
            </div>
          )}
        </PurchaseSectionCard>
      </div>

      {/* ===== BOTTOM ROW (cont.): Supplier Score Matrix ===== */}
      <PurchaseSectionCard
        title="Supplier Score Matrix"
        subtitle="Rating vs on-time delivery quadrants"
        icon={BarChart3}
        className="mb-5"
        action={<ChartExportMenu targetRef={matrixRef} filename="vendor-score-matrix" />}
      >
        {loading ? <Skeleton height="h-64" /> : (
          <div ref={matrixRef}>
            <div className="relative h-64 rounded-xl border border-slate-200 bg-white overflow-hidden">
              {/* Quadrant backgrounds */}
              <div className="absolute left-0 top-0 h-1/2 w-1/2 bg-emerald-50/70" aria-hidden="true" />
              <div className="absolute right-0 top-0 h-1/2 w-1/2 bg-amber-50/60" aria-hidden="true" />
              <div className="absolute left-0 bottom-0 h-1/2 w-1/2 bg-rose-50/60" aria-hidden="true" />
              <div className="absolute right-0 bottom-0 h-1/2 w-1/2 bg-sky-50/60" aria-hidden="true" />
              {/* Grid lines */}
              <div className="absolute left-0 right-0 top-1/2 border-t border-dashed border-slate-300" aria-hidden="true" />
              <div className="absolute top-0 bottom-0 left-1/2 border-l border-dashed border-slate-300" aria-hidden="true" />
              {/* Quadrant labels */}
              <span className="absolute left-2 top-2 text-[10px] font-bold uppercase tracking-wide text-emerald-600">High rating · High OTD</span>
              <span className="absolute right-2 top-2 text-[10px] font-bold uppercase tracking-wide text-amber-600">High rating · Low OTD</span>
              <span className="absolute left-2 bottom-2 text-[10px] font-bold uppercase tracking-wide text-rose-500">Low rating · Low OTD</span>
              <span className="absolute right-2 bottom-2 text-[10px] font-bold uppercase tracking-wide text-sky-600">Low rating · High OTD</span>
              {/* Vendor dots */}
              {vendors.map((vendor) => (
                <span
                  key={vendor.id}
                  className="absolute -translate-x-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border-2 border-white shadow"
                  style={{
                    left: `${Math.min(96, Math.max(4, vendor.onTimeDelivery))}%`,
                    bottom: `${Math.min(96, Math.max(4, (vendor.rating / 5) * 100))}%`,
                    background: vendor.score >= 80 ? '#059669' : vendor.score >= 65 ? '#d97706' : '#e11d48'
                  }}
                  title={`${vendor.name} · Rating ${vendor.rating.toFixed(1)} · OTD ${vendor.onTimeDelivery}% · Score ${vendor.score}`}
                />
              ))}
              {/* Axis labels */}
              <span className="absolute left-1/2 -translate-x-1/2 bottom-1 text-[10px] font-semibold text-slate-400">On-Time Delivery (0 → 100%)</span>
            </div>
            <div className="flex flex-wrap items-center gap-4 mt-3 pt-3 border-t border-slate-100 dark:border-white/10">
              {Object.entries(scoreMatrix).map(([key, quadrant]) => (
                <span key={key} className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  <span className="w-2.5 h-2.5 rounded-sm" style={{ background: quadrant.color }} aria-hidden="true" />
                  {quadrant.label} ({quadrant.vendors.length})
                </span>
              ))}
            </div>
          </div>
        )}
      </PurchaseSectionCard>

      <PurchaseToolbar
        count={pageInfo}
        left={
          <>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setFilterOpen((prev) => !prev)}
              aria-label="Toggle filters"
              aria-expanded={filterOpen}
            >
              <Filter size={12} /> {filterOpen ? 'Hide Filters' : 'Show Filters'}
            </button>
            {hasFilters && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={resetAll}>
                <X size={12} /> Clear
              </button>
            )}
            <button type="button" className="btn btn-ghost btn-sm" onClick={refresh}>
              <RefreshCw size={12} /> Refresh
            </button>
          </>
        }
        right={
          <>
            <PurchaseSearch
              id="perfSearchInput"
              placeholder="Search vendors..."
              value={query}
              onChange={setQuery}
              label="Search Vendors"
            />
            <PurchaseExportDropdown buttonLabel="Export Performance" onExport={handleExport} />
            <PurchaseColumnsDropdown
              columns={columns}
              onToggleColumn={toggleColumn}
              onShowAll={showAllColumns}
              onHideAll={hideAllColumns}
            />
          </>
        }
      />

      <PurchaseFilters
        open={filterOpen}
        panelId="perfFilterPanel"
        onApply={() => {
          setFilterOpen(false);
          setPage(1);
        }}
        onReset={resetAll}
        groups={[
          {
            key: 'category', id: 'perf-category', label: 'Category', value: category,
            options: [{ value: 'All', label: 'All Categories' }, ...VENDOR_CATEGORIES.map((v) => ({ value: v, label: v }))],
            onChange: (v) => {
              setCategory(v);
              setPage(1);
            }
          }
        ]}
      />

      <PurchaseTable
        columns={visibleColumns}
        rows={pageRows}
        loading={loading}
        selectable={false}
        renderers={renderCell}
        tableId="vendorPerfTable"
        alignCenter={['quality', 'delivery', 'rating', 'performance', 'status']}
        alignRight={['orders', 'spend']}
        rowActions={() => [
          { key: 'view', label: 'View Details', icon: Eye },
          { key: 'print', label: 'Print', icon: Printer }
        ]}
        onRowAction={(key, row) => {
          if (key === 'view') navigate(`/purchase/vendors/${row.id}`);
          else if (key === 'print') {
            printTable(`Vendor Performance — ${row.name}`, COLUMNS.filter((col) => col.key !== 'actions'), [row]);
          }
        }}
        emptyContent={
          <div className="cpr-empty">
            <TrendingUp size={48} aria-hidden="true" />
            <h3>No Performance Data</h3>
            <p>{hasFilters ? 'No vendors matching your search criteria.' : 'No vendor performance data available.'}</p>
            {hasFilters && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={resetAll}>
                <X size={12} /> Clear Filters
              </button>
            )}
          </div>
        }
        footer={!loading && (
          <PurchasePagination
            page={page}
            totalPages={totalPages}
            pageSize={pageSize}
            pageSizeOptions={PAGE_SIZE_OPTIONS}
            pageInfo={pageInfo}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
          />
        )}
      />
    </PurchasePageLayout>
  );
}
