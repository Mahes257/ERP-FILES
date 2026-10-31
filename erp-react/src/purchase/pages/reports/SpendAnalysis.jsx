/**
 * purchase/pages/reports/SpendAnalysis.jsx
 * ------------------------------------------------------------------
 * Spend Analysis — comprehensive spend analytics with monthly trend,
 * category breakdown, department breakdown, vendor breakdown, and
 * financial KPIs. All data driven from live stores.
 * ------------------------------------------------------------------
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Building2, IndianRupee, PieChart, RefreshCw, TrendingUp,
  Users, ShoppingCart
} from 'lucide-react';
import ExportMenu from '../../components/ExportMenu';
import PurchaseHeader from '../../components/PurchaseHeader';
import PurchasePageLayout from '../../components/list/PurchasePageLayout';
import PurchaseKpiCards from '../../components/PurchaseKpiCards';
import PurchaseChartCard from '../../components/PurchaseChartCard';
import PurchaseMiniBarChart from '../../components/PurchaseMiniBarChart';
import ModuleTabNav from '../../components/ModuleTabNav';
import ReportFilters from '../../components/ReportFilters';
import { reportsService } from '../../services/reports';
import { formatINR } from '../../utils/helpers';
import { formatAmount } from '../../utils/purchase';

const KPI_DEFS = [
  { key: 'total', label: 'Total Spend', icon: IndianRupee, color: 'text-emerald-600', bg: 'bg-emerald-50', currency: true },
  { key: 'avgPerMonth', label: 'Avg / Month', icon: TrendingUp, color: 'text-sky-600', bg: 'bg-sky-50', currency: true },
  { key: 'categories', label: 'Categories', icon: PieChart, color: 'text-violet-600', bg: 'bg-violet-50' },
  { key: 'departments', label: 'Departments', icon: Building2, color: 'text-indigo-600', bg: 'bg-indigo-50' },
  { key: 'vendors', label: 'Vendors', icon: Users, color: 'text-amber-600', bg: 'bg-amber-50' },
  { key: 'orderCount', label: 'Orders', icon: ShoppingCart, color: 'text-sky-600', bg: 'bg-sky-50' }
];

const CATEGORY_COLUMNS = [
  { key: 'category', label: 'Category', sortable: true, visible: true },
  { key: 'spend', label: 'Spend', sortable: true, visible: true, align: 'right' },
  { key: 'percentage', label: 'Share %', sortable: true, visible: true, align: 'center' },
  { key: 'orderCount', label: 'Orders', sortable: true, visible: true, align: 'center' }
];

const DEPARTMENT_COLUMNS = [
  { key: 'department', label: 'Department', sortable: true, visible: true },
  { key: 'spend', label: 'Spend', sortable: true, visible: true, align: 'right' },
  { key: 'percentage', label: 'Share %', sortable: true, visible: true, align: 'center' }
];

const VENDOR_COLUMNS = [
  { key: 'vendor', label: 'Vendor', sortable: true, visible: true },
  { key: 'spend', label: 'Spend', sortable: true, visible: true, align: 'right' },
  { key: 'percentage', label: 'Share %', sortable: true, visible: true, align: 'center' },
  { key: 'orderCount', label: 'Orders', sortable: true, visible: true, align: 'center' }
];

export default function SpendAnalysis() {
  const [data, setData] = useState(null);
  const [financial, setFinancial] = useState(null);
  const [filters, setFilters] = useState({ dateRange: 'last-12-months' });
  const [filterOptions, setFilterOptions] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [spendData, finData, fo] = await Promise.all([
        reportsService.getSpendAnalysis(filters),
        reportsService.getFinancialSummary(filters),
        reportsService.getFilterOptions()
      ]);
      setData(spendData);
      setFinancial(finData);
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
      value: def.key === 'categories'
        ? String(data?.byCategory?.length ?? 0)
        : def.key === 'departments'
          ? String(data?.byDepartment?.length ?? 0)
          : def.key === 'vendors'
            ? String(data?.byVendor?.length ?? 0)
            : def.key === 'orderCount'
              ? String(data?.byCategory?.reduce((s, c) => s + c.orderCount, 0) ?? 0)
              : def.currency
                ? formatAmount(data?.[def.key] ?? 0)
                : String(data?.[def.key] ?? 0)
    })),
    [data]
  );

  const categoryExport = useMemo(() => ({
    columns: CATEGORY_COLUMNS,
    records: (data?.byCategory || []).map((e) => ({ ...e, spend: formatINR(e.spend) }))
  }), [data]);

  const departmentExport = useMemo(() => ({
    columns: DEPARTMENT_COLUMNS,
    records: (data?.byDepartment || []).map((e) => ({ ...e, spend: formatINR(e.spend) }))
  }), [data]);

  const vendorExport = useMemo(() => ({
    columns: VENDOR_COLUMNS,
    records: (data?.byVendor || []).map((e) => ({ ...e, spend: formatINR(e.spend) }))
  }), [data]);

  return (
    <PurchasePageLayout
      staticHeader={
        <>
          <PurchaseHeader
            crumb="Purchase · Reports · Spend"
            title="Spend Analysis"
            subtitle="Monthly purchase value and category-wise spend distribution"
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
          <ReportFilters filters={filters} onApply={applyFilters} onReset={resetFilters} loading={loading} filterOptions={filterOptions} />
        </>
      }
    >
      {error && (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-4 flex items-center justify-between gap-3">
          <p className="text-xs font-semibold text-rose-600">{error?.message || 'Failed to load spend analysis.'}</p>
          <button type="button" onClick={refresh} className="text-xs font-bold text-rose-600 underline cursor-pointer">Retry</button>
        </div>
      )}

      <PurchaseKpiCards cards={kpiCards} loading={loading} gridClass="grid-cols-1 sm:grid-cols-3" />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 mt-6 items-start">
        {/* Monthly Spend Trend */}
        <PurchaseChartCard
          title="Monthly Spend Trend"
          subtitle="Purchase value across the last 12 months"
          loading={loading}
          empty={!loading && !data?.byMonth?.some((m) => m.value > 0)}
          emptyTitle="No spend trend data"
          emptyMessage="Create purchase orders to see spend trends."
          exportFilename="spend-monthly-trend"
          action={
            !loading && data ? (
              <span className="text-xs font-bold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-full">
                {formatINR(data.total)} total
              </span>
            ) : null
          }
        >
          <PurchaseMiniBarChart
            labels={(data?.byMonth || []).map((e) => e.label)}
            values={(data?.byMonth || []).map((e) => e.value)}
            height={200}
            valueFormat={(v) => formatINR(v)}
          />
        </PurchaseChartCard>

        {/* Spend by Category */}
        <PurchaseChartCard
          title="Spend by Category"
          subtitle="Ranked by total purchase value"
          loading={loading}
          empty={!loading && !data?.byCategory?.length}
          emptyTitle="No category spend data"
          emptyMessage="Purchase orders will be grouped by vendor category."
          exportFilename="spend-by-category"
          action={
            <ExportMenu columns={categoryExport.columns} records={categoryExport.records} filename="spend-by-category" title="Spend by Category" />
          }
        >
          <div className="space-y-4">
            {(data?.byCategory || []).map((entry) => {
              const max = data.byCategory[0]?.spend || 1;
              return (
                <div key={entry.category}>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="font-bold text-slate-700">{entry.category}</span>
                    <span className="text-slate-400 font-semibold">{formatINR(entry.spend)} · {entry.percentage}%</span>
                  </div>
                  <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#059669] to-[#34d399] transition-all"
                      style={{ width: `${Math.min(100, (entry.spend / max) * 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </PurchaseChartCard>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 mt-5 items-start">
        {/* Spend by Department */}
        <PurchaseChartCard
          title="Spend by Department"
          subtitle="Purchase requisition spend by department"
          loading={loading}
          empty={!loading && !data?.byDepartment?.length}
          emptyTitle="No department spend data"
          emptyMessage="Requisitions with department data will appear here."
          exportFilename="spend-by-department"
          action={
            <ExportMenu columns={departmentExport.columns} records={departmentExport.records} filename="spend-by-department" title="Spend by Department" />
          }
        >
          <div className="space-y-4">
            {(data?.byDepartment || []).map((entry) => {
              const max = data.byDepartment[0]?.spend || 1;
              return (
                <div key={entry.department}>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="font-bold text-slate-700">{entry.department}</span>
                    <span className="text-slate-400 font-semibold">{formatINR(entry.spend)} · {entry.percentage}%</span>
                  </div>
                  <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-indigo-400 transition-all"
                      style={{ width: `${Math.min(100, (entry.spend / max) * 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </PurchaseChartCard>

        {/* Spend by Vendor */}
        <PurchaseChartCard
          title="Spend by Vendor"
          subtitle="Purchase value by supplier"
          loading={loading}
          empty={!loading && !data?.byVendor?.length}
          emptyTitle="No vendor spend data"
          emptyMessage="Purchase orders will be grouped by vendor."
          exportFilename="spend-by-vendor"
          action={
            <ExportMenu columns={vendorExport.columns} records={vendorExport.records} filename="spend-by-vendor" title="Spend by Vendor" />
          }
        >
          <div className="space-y-4">
            {(data?.byVendor || []).slice(0, 8).map((entry) => {
              const max = data.byVendor[0]?.spend || 1;
              return (
                <div key={entry.vendor}>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="font-bold text-slate-700">{entry.vendor}</span>
                    <span className="text-slate-400 font-semibold">{formatINR(entry.spend)} · {entry.percentage}%</span>
                  </div>
                  <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-400 transition-all"
                      style={{ width: `${Math.min(100, (entry.spend / max) * 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </PurchaseChartCard>
      </div>

      {/* Financial Reconciliation */}
      {financial && (
        <div className="mt-5">
          <PurchaseChartCard
            title="Financial Reconciliation"
            subtitle="Values reconciled with Invoice Management and Vendor Payment"
            loading={loading}
            exportFilename="spend-financial"
          >
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              {[
                { label: 'Gross PO Value', value: financial.grossPoValue, color: 'text-sky-600' },
                { label: 'Invoiced', value: financial.invoicedValue, color: 'text-violet-600' },
                { label: 'Paid', value: financial.paidValue, color: 'text-emerald-600' },
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
        </div>
      )}
    </PurchasePageLayout>
  );
}
