/**
 * purchase/pages/reports/ProcurementAnalytics.jsx
 * ------------------------------------------------------------------
 * Procurement Analytics — full lifecycle KPIs, conversion funnel,
 * value flow, and alerts. All data from live stores.
 * ------------------------------------------------------------------
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Clock3, FileStack, FileText, RefreshCw,
  ArrowRight, AlertTriangle, ArrowDownRight, Truck, ShieldCheck, Receipt,
  CreditCard, Package
} from 'lucide-react';
import PurchaseHeader from '../../components/PurchaseHeader';
import PurchasePageLayout from '../../components/list/PurchasePageLayout';
import PurchaseKpiCards from '../../components/PurchaseKpiCards';
import PurchaseChartCard from '../../components/PurchaseChartCard';
import PurchaseSectionCard from '../../components/PurchaseSectionCard';
import ModuleTabNav from '../../components/ModuleTabNav';
import ReportFilters from '../../components/ReportFilters';
import { reportsService } from '../../services/reports';
import { formatINR } from '../../utils/helpers';

const KPI_DEFS = [
  { key: 'requisitionCount', label: 'Requisitions', icon: FileText, color: 'text-indigo-600', bg: 'bg-indigo-50' },
  { key: 'rfqCount', label: 'RFQs', icon: FileStack, color: 'text-purple-600', bg: 'bg-purple-50' },
  { key: 'orderCount', label: 'Purchase Orders', icon: FileStack, color: 'text-sky-600', bg: 'bg-sky-50' },
  { key: 'invoiceCount', label: 'Invoices', icon: Receipt, color: 'text-violet-600', bg: 'bg-violet-50' },
  { key: 'openOrders', label: 'Open Orders', icon: Clock3, color: 'text-amber-600', bg: 'bg-amber-50' },
  { key: 'pendingApprovals', label: 'Pending Approvals', icon: Clock3, color: 'text-rose-600', bg: 'bg-rose-50' },
  { key: 'grnCount', label: 'GRNs', icon: Package, color: 'text-emerald-600', bg: 'bg-emerald-50' },
  { key: 'inspectionCount', label: 'Inspections', icon: ShieldCheck, color: 'text-teal-600', bg: 'bg-teal-50' }
];

const STAGE_ICONS = {
  Requisitions: FileText,
  RFQs: FileStack,
  Quotations: Receipt,
  Evaluations: ShieldCheck,
  'Purchase Orders': FileStack,
  Delivery: Truck,
  Inspections: ShieldCheck,
  Invoices: Receipt,
  Paid: CreditCard
};

const STAGE_ROUTES = {
  Requisitions: '/purchase/requisition',
  RFQs: '/purchase/rfq',
  Quotations: '/purchase/rfq',
  Evaluations: '/purchase/rfq',
  'Purchase Orders': '/purchase/orders',
  Delivery: '/purchase/logistics/grn',
  Inspections: '/purchase/logistics/quality',
  Invoices: '/purchase/invoices',
  Paid: '/purchase/invoices/vendor-payment'
};

export default function ProcurementAnalytics() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [filters, setFilters] = useState({ dateRange: 'last-12-months' });
  const [filterOptions, setFilterOptions] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [analyticsData, alertData, fo] = await Promise.all([
        reportsService.getProcurementAnalytics(filters),
        reportsService.getAlerts(),
        reportsService.getFilterOptions()
      ]);
      setData(analyticsData);
      setAlerts(alertData);
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
      value: String(data?.kpis?.[def.key] ?? 0)
    })),
    [data]
  );

  const conversion = data?.conversion || {};
  const lifecycle = data?.lifecycle || [];
  const valueFlow = data?.valueFlow || [];

  return (
    <PurchasePageLayout
      staticHeader={
        <>
          <PurchaseHeader
            crumb="Purchase · Reports · Procurement"
            title="Procurement Analytics"
            subtitle="End-to-end procurement lifecycle KPIs and conversion"
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
          <p className="text-xs font-semibold text-rose-600">{error?.message || 'Failed to load procurement analytics.'}</p>
          <button type="button" onClick={refresh} className="text-xs font-bold text-rose-600 underline cursor-pointer">Retry</button>
        </div>
      )}

      <PurchaseKpiCards cards={kpiCards} loading={loading} />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 mt-6 items-start">
        {/* Procurement Lifecycle Funnel */}
        <PurchaseChartCard
          title="Procurement Lifecycle Funnel"
          subtitle="Document counts at each stage of the purchase flow"
          loading={loading}
          empty={!loading && !lifecycle.length}
          emptyTitle="No lifecycle data"
          exportFilename="procurement-lifecycle-funnel"
          action={
            !loading && data ? (
              <span className="text-xs font-bold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-full">
                {formatINR(data.kpis.orderValue)} order value
              </span>
            ) : null
          }
        >
          <div className="space-y-2">
            {lifecycle.map((stage) => {
              const maxCount = lifecycle[0]?.count || 1;
              const pct = Math.round((stage.count / maxCount) * 100);
              const Icon = STAGE_ICONS[stage.stage] || FileText;
              return (
                <button
                  key={stage.stage}
                  type="button"
                  onClick={() => navigate(STAGE_ROUTES[stage.stage] || '/purchase')}
                  className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer text-left"
                >
                  <Icon className="w-4 h-4 text-slate-400 shrink-0" />
                  <div className="min-w-[110px] shrink-0">
                    <div className="text-xs font-bold text-slate-800">{stage.stage}</div>
                    <div className="text-[11px] text-slate-400">{formatINR(stage.value)}</div>
                  </div>
                  <div className="flex-1 h-7 bg-slate-50 border border-slate-100 rounded-lg overflow-hidden flex items-center">
                    <div
                      className="h-full bg-[#075E54] flex items-center justify-end pr-2 transition-all"
                      style={{ width: `${Math.max(8, pct)}%` }}
                    >
                      <span className="text-[11px] font-bold text-white">{stage.count}</span>
                    </div>
                  </div>
                  <div className="w-14 shrink-0 text-right text-xs font-bold text-slate-500 tabular-nums">
                    {pct}%
                  </div>
                </button>
              );
            })}
          </div>
        </PurchaseChartCard>

        {/* Value Flow */}
        <PurchaseChartCard
          title="Value Flow"
          subtitle="Value moved at each lifecycle stage"
          loading={loading}
          empty={!loading && !valueFlow.length}
          emptyTitle="No value data"
          exportFilename="procurement-value-flow"
        >
          <div className="space-y-4">
            {valueFlow.map((row) => {
              const max = data?.kpis?.requisitionValue || 1;
              return (
                <div key={row.label}>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="font-bold text-slate-700">{row.label}</span>
                    <span className={`font-bold tabular-nums ${row.tone}`}>{formatINR(row.value)}</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-to-r from-[#059669] to-[#34d399]" style={{ width: `${Math.min(100, (row.value / max) * 100)}%` }} />
                  </div>
                </div>
              );
            })}
            <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-600 uppercase tracking-wide">Conversion to Paid</span>
              <span className="text-sm font-bold text-slate-900 tabular-nums">
                {conversion.overallConversion ?? 0}%
              </span>
            </div>
          </div>
        </PurchaseChartCard>
      </div>

      {/* Conversion Analytics */}
      <div className="mt-5">
        <PurchaseChartCard
          title="Conversion Analytics"
          subtitle="Stage-to-stage conversion rates"
          loading={loading}
          empty={!loading && !conversion.prToRfq}
          emptyTitle="No conversion data"
          exportFilename="procurement-conversion"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {[
              { from: 'PR', to: 'RFQ', rate: conversion.prToRfq, count: data?.kpis?.rfqCount },
              { from: 'RFQ', to: 'Quotation', rate: conversion.rfqToQuotation, count: data?.kpis?.rfqCount },
              { from: 'Quotation', to: 'PO', rate: conversion.quotationToPo, count: data?.kpis?.orderCount },
              { from: 'PO', to: 'Invoice', rate: conversion.poToInvoice, count: data?.kpis?.invoiceCount },
              { from: 'Invoice', to: 'Paid', rate: conversion.invoiceToPaid, count: data?.kpis?.invoiceCount }
            ].map((item) => (
              <div key={`${item.from}-${item.to}`} className="p-3 bg-slate-50 rounded-lg text-center">
                <div className="text-[11px] text-slate-500 font-semibold">{item.from}</div>
                <ArrowDownRight className="w-3 h-3 text-slate-300 mx-auto my-1" />
                <div className="text-[11px] text-slate-500 font-semibold">{item.to}</div>
                <div className="text-lg font-bold text-[#075E54] tabular-nums mt-1">{item.rate ?? 0}%</div>
              </div>
            ))}
          </div>
        </PurchaseChartCard>
      </div>

      {/* Alerts & Exceptions */}
      {alerts.length > 0 && (
        <div className="mt-5">
          <PurchaseSectionCard
            title="Alerts & Exceptions"
            subtitle={`${alerts.length} actionable issue${alerts.length !== 1 ? 's' : ''} requiring attention`}
            action={
              <span className="text-xs font-bold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-full">
                {alerts.filter((a) => a.severity === 'critical').length} critical
              </span>
            }
          >
            <div className="space-y-2">
              {alerts.slice(0, 8).map((alert) => (
                <button
                  key={alert.id}
                  type="button"
                  onClick={() => navigate(alert.route)}
                  className="w-full flex items-start gap-2.5 p-2.5 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer text-left"
                >
                  <AlertTriangle className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${
                    alert.severity === 'critical' ? 'text-rose-500' : 'text-amber-500'
                  }`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold text-slate-700">{alert.type}</span>
                      <span className="text-[10px] text-slate-400">{alert.document}</span>
                      {alert.vendor && <span className="text-[10px] text-slate-400">· {alert.vendor}</span>}
                    </div>
                    <div className="text-[11px] text-slate-500">{alert.description}</div>
                  </div>
                  <ArrowRight className="w-3 h-3 text-slate-300 mt-1 shrink-0" />
                </button>
              ))}
            </div>
          </PurchaseSectionCard>
        </div>
      )}
    </PurchasePageLayout>
  );
}
