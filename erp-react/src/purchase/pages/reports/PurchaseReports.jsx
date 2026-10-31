/**
 * purchase/pages/reports/PurchaseReports.jsx
 * ------------------------------------------------------------------
 * Advanced Purchase Reports — fifteen analytics computed from REAL
 * transactional records via services/reports.js (computeAllReports).
 * Nothing is hardcoded or demo data: every number is derived from the
 * live stores (requisitions, rfqs, quotations, orders, grns,
 * inspections, inventory, invoices, advices, vendors).
 *
 * Reports:
 *   Procurement Spend · Spend by Vendor · Spend by Category ·
 *   Spend by Department · PO Aging · PR Aging · RFQ Conversion ·
 *   Negotiation Savings · Supplier Performance · Delivery Performance ·
 *   Quality / Rejection · Inventory Movement · Invoice Aging ·
 *   Outstanding Payables · Overdue Payments · Payment Forecast
 *
 * Global filters: date range, vendor, department, project, status.
 *
 * Route: /purchase/reports/insights
 * ------------------------------------------------------------------
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle, Banknote, Building2, CalendarClock,
  ClipboardList, Handshake, IndianRupee, Layers,
  LineChart, Package, RefreshCw, ShieldCheck, TrendingUp, Truck
} from 'lucide-react';
import PurchaseHeader from '../../components/PurchaseHeader';
import PurchasePageLayout from '../../components/list/PurchasePageLayout';
import PurchaseSectionCard from '../../components/PurchaseSectionCard';
import PurchaseStatusBadge from '../../components/PurchaseStatusBadge';
import PurchaseMiniBarChart from '../../components/PurchaseMiniBarChart';
import ModuleTabNav from '../../components/ModuleTabNav';
import ReportFilters from '../../components/ReportFilters';
import { reportsService } from '../../services/reports';
import { formatAmount } from '../../utils/purchase';
import { formatINR } from '../../utils/helpers';
import '../../styles/cpr-list.css';

const VALUE = 'text-xs font-semibold text-slate-800';
const LABEL = 'text-[10px] font-bold uppercase tracking-wider text-slate-400';
const MONEY = (v) => formatINR(Math.round(Number(v) || 0));
const PCT = (v) => (v == null ? '—' : `${v}%`);

/* ------------------------------------------------------------------ */
/*  Shared building blocks                                             */
/* ------------------------------------------------------------------ */

function Metric({ label, value, tone = 'text-slate-800', sub }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3">
      <div className={LABEL}>{label}</div>
      <div className={`text-lg font-extrabold mt-1 tabular-nums ${tone}`}>{value}</div>
      {sub && <div className="text-[10px] text-slate-400 mt-0.5">{sub}</div>}
    </div>
  );
}

function BarRow({ label, value, max, pct, tone = '#0B4A3D' }) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1.5">
        <span className="font-bold text-slate-700 truncate pr-2">{label}</span>
        <span className="font-semibold text-slate-400 tabular-nums shrink-0">
          {value}{pct != null ? ` · ${pct}%` : ''}
        </span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${max > 0 ? Math.min(100, (Number(pct ?? value) / max) * 100) : 0}%`, background: tone }}
        />
      </div>
    </div>
  );
}

function ReportTable({ columns, rows, empty = 'No records in this range.' }) {
  if (!rows || rows.length === 0) {
    return <p className="text-xs text-slate-400 py-6 text-center">{empty}</p>;
  }
  return (
    <div className="overflow-x-auto max-h-[380px] overflow-y-auto border border-slate-200 rounded-xl">
      <table className="w-full text-xs min-w-[640px]">
        <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
          <tr>
            {columns.map((col) => (
              <th key={col.key} className={`px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 ${col.align === 'right' ? 'text-right' : 'text-left'}`}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row, idx) => (
            <tr key={idx} className="hover:bg-slate-50/60">
              {columns.map((col) => (
                <td key={col.key} className={`px-3 py-2 align-middle ${col.align === 'right' ? 'text-right' : 'text-left'}`}>
                  {col.render ? col.render(row) : (row[col.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const NUM = (v) => <span className="font-semibold text-slate-700 tabular-nums">{v ?? '—'}</span>;
const MONEY_CELL = (v) => <span className="font-bold text-slate-800 tabular-nums">{MONEY(v)}</span>;
const STATUS_CELL = (status) => (status ? <PurchaseStatusBadge status={status} variant="cpr" className="!text-[10px]" /> : '—');
const LINK_CELL = (text, to, navigate) => (
  text ? (
    <button type="button" onClick={() => navigate(to)} className="font-bold text-[#0B4A3D] hover:text-[#083D34] hover:underline cursor-pointer whitespace-nowrap">
      {text}
    </button>
  ) : '—'
);

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function PurchaseReports() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState({ dateRange: 'last-12-months' });
  const [filterOptions, setFilterOptions] = useState({});
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [reports, options] = await Promise.all([
        reportsService.getAllReports(filters),
        reportsService.getFilterOptions()
      ]);
      setData(reports);
      setFilterOptions(options);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    queueMicrotask(load);
  }, [load]);

  const applyFilters = useCallback((f) => setFilters(f), []);
  const resetFilters = useCallback(() => setFilters({ dateRange: 'last-12-months' }), []);

  const kpi = useMemo(() => {
    if (!data) return [];
    const { procurementSpend, supplierPerformance, quality, payments, outstandingPayables } = data;
    return [
      { label: 'Total Spend', value: MONEY(procurementSpend.total), tone: 'text-[#0B4A3D]' },
      { label: 'On-Time Delivery', value: PCT(supplierPerformance.totals.onTimeDeliveryPct), tone: 'text-emerald-700' },
      { label: 'Quality Pass Rate', value: PCT(quality.totals.passRate), tone: 'text-emerald-700' },
      { label: 'Outstanding Payables', value: MONEY(outstandingPayables.totalOutstanding), tone: 'text-amber-700' },
      { label: 'Overdue Payments', value: MONEY(payments.overdue.totalOverdue), tone: 'text-rose-700' },
      { label: 'Upcoming 90-Day Payments', value: MONEY(payments.forecast.totalUpcoming), tone: 'text-sky-700' }
    ];
  }, [data]);

  if (loading && !data) {
    return (
      <PurchasePageLayout>
        <PurchaseHeader crumb="Purchase · Reports" title="Advanced Purchase Reports" subtitle="Computing analytics from live transactional records…" />
        <ModuleTabNav module="reports" />
        <ReportFilters filters={filters} onApply={applyFilters} onReset={resetFilters} loading={loading} filterOptions={filterOptions} />
        <div className="flex items-center justify-center min-h-[50vh] text-slate-400">
          <RefreshCw className="w-6 h-6 animate-spin" />
        </div>
      </PurchasePageLayout>
    );
  }

  return (
    <PurchasePageLayout
      staticHeader={
        <>
          <PurchaseHeader
            crumb="Purchase · Reports"
            title="Advanced Purchase Reports"
            subtitle="15 analytics computed from actual purchase records — filtered, not fabricated"
            actions={
              <button
                type="button"
                onClick={load}
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
          <button type="button" onClick={load} className="text-xs font-bold text-rose-600 underline cursor-pointer">Retry</button>
        </div>
      )}

      {/* ── Headline metrics ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 mb-6">
        {kpi.map((m) => <Metric key={m.label} label={m.label} value={m.value} tone={m.tone} />)}
      </div>

      <div className="space-y-6">
        {data && (
          <>
            {/* ═══ SPEND ═══ */}
            <ReportSection
              icon={IndianRupee}
              title="Procurement Spend"
              subtitle={`${data.procurementSpend.orderCount} purchase orders · ${data.procurementSpend.invoiceCount} invoices in the selected range`}
            >
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                <Metric label="Total Spend" value={MONEY(data.procurementSpend.total)} tone="text-[#0B4A3D]" />
                <Metric label="Purchase Orders" value={NUM(data.procurementSpend.orderCount)} />
                <Metric label="Avg PO Value" value={MONEY(data.procurementSpend.avgOrder)} />
                <Metric label="Invoices" value={NUM(data.procurementSpend.invoiceCount)} />
              </div>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                <div>
                  <div className={LABEL + ' mb-2'}>Monthly Spend Trend (12 months)</div>
                  <PurchaseMiniBarChart
                    labels={(data.procurementSpend.byMonth || []).map((m) => m.label)}
                    values={(data.procurementSpend.byMonth || []).map((m) => m.value)}
                    valueFormat={formatINR}
                  />
                </div>
                <div className="space-y-3">
                  <div className={LABEL}>Spend by PO Status</div>
                  {(data.procurementSpend.byStatus || []).slice(0, 8).map((row) => (
                    <BarRow key={row.status} label={row.status} value={MONEY(row.value)} pct={row.pct} max={data.procurementSpend.byStatus[0]?.pct || 1} />
                  ))}
                </div>
              </div>
            </ReportSection>

            {/* ═══ SPEND BREAKDOWN ═══ */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <ReportSection icon={Building2} title="Spend by Vendor" subtitle={`${data.spendByVendor.rows.length} vendor(s) · ${MONEY(data.spendByVendor.total)}`}>
                <div className="space-y-3">
                  {(data.spendByVendor.rows || []).slice(0, 10).map((row) => (
                    <BarRow key={row.vendor} label={row.vendor} value={MONEY(row.spend)} pct={row.pct} max={data.spendByVendor.rows[0]?.pct || 1} />
                  ))}
                </div>
              </ReportSection>

              <ReportSection icon={Layers} title="Spend by Category" subtitle={`${data.spendByCategory.rows.length} categor(ies) · ${MONEY(data.spendByCategory.total)}`}>
                <div className="space-y-3">
                  {(data.spendByCategory.rows || []).slice(0, 10).map((row) => (
                    <BarRow key={row.category} label={row.category} value={MONEY(row.spend)} pct={row.pct} max={data.spendByCategory.rows[0]?.pct || 1} />
                  ))}
                </div>
              </ReportSection>

              <ReportSection icon={Building2} title="Spend by Department" subtitle={`${data.spendByDepartment.rows.length} department(s) · ${MONEY(data.spendByDepartment.total)}`}>
                <div className="space-y-3">
                  {(data.spendByDepartment.rows || []).slice(0, 10).map((row) => (
                    <BarRow key={row.department} label={row.department} value={MONEY(row.spend)} pct={row.pct} max={data.spendByDepartment.rows[0]?.pct || 1} />
                  ))}
                </div>
              </ReportSection>
            </div>

            {/* ═══ AGING ═══ */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <ReportSection icon={CalendarClock} title="PO Aging" subtitle={`${data.poAging.openCount} open purchase order(s)`}>
                <AgingBuckets buckets={data.poAging.buckets} money />
                <div className="mt-4">
                  <ReportTable
                    columns={[
                      { key: 'poNo', label: 'PO', render: (r) => LINK_CELL(r.poNo, `/purchase/orders/${r.poNo}`, navigate) },
                      { key: 'vendor', label: 'Vendor' },
                      { key: 'date', label: 'Order Date' },
                      { key: 'ageDays', label: 'Age (days)', align: 'right', render: (r) => NUM(r.ageDays) },
                      { key: 'status', label: 'Status', render: (r) => STATUS_CELL(r.status) },
                      { key: 'amount', label: 'Value', align: 'right', render: (r) => MONEY_CELL(r.amount) }
                    ]}
                    rows={data.poAging.rows.slice(0, 8)}
                    empty="No open purchase orders in the selected range."
                  />
                </div>
              </ReportSection>

              <ReportSection icon={ClipboardList} title="PR Aging" subtitle={`${data.prAging.openCount} open requisition(s)`}>
                <AgingBuckets buckets={data.prAging.buckets} money />
                <div className="mt-4">
                  <ReportTable
                    columns={[
                      { key: 'prNo', label: 'PR', render: (r) => LINK_CELL(r.prNo, `/purchase/requisition/${r.prNo}`, navigate) },
                      { key: 'department', label: 'Department' },
                      { key: 'date', label: 'Created' },
                      { key: 'ageDays', label: 'Age (days)', align: 'right', render: (r) => NUM(r.ageDays) },
                      { key: 'status', label: 'Status', render: (r) => STATUS_CELL(r.status) },
                      { key: 'amount', label: 'Value', align: 'right', render: (r) => MONEY_CELL(r.amount) }
                    ]}
                    rows={data.prAging.rows.slice(0, 8)}
                    empty="No open requisitions in the selected range."
                  />
                </div>
              </ReportSection>
            </div>

            {/* ═══ CONVERSION & SAVINGS ═══ */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <ReportSection icon={LineChart} title="RFQ Conversion" subtitle={`${data.rfqConversion.totals.total} RFQ(s) in range`}>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                  <Metric label="RFQs" value={NUM(data.rfqConversion.totals.total)} />
                  <Metric label="With Quotations" value={NUM(data.rfqConversion.totals.withQuotations)} sub={PCT(data.rfqConversion.rates.withQuotationPct)} />
                  <Metric label="Awarded" value={NUM(data.rfqConversion.totals.awarded)} sub={PCT(data.rfqConversion.rates.awardPct)} />
                  <Metric label="Converted to PO" value={NUM(data.rfqConversion.totals.converted)} sub={PCT(data.rfqConversion.rates.conversionPct)} />
                </div>
                <ReportTable
                  columns={[
                    { key: 'rfqNo', label: 'RFQ', render: (r) => LINK_CELL(r.rfqNo, `/purchase/rfq/${r.rfqNo}`, navigate) },
                    { key: 'title', label: 'Title' },
                    { key: 'quotationCount', label: 'Quotes', align: 'right', render: (r) => NUM(r.quotationCount) },
                    { key: 'awarded', label: 'Awarded', render: (r) => (r.awarded ? <span className="text-emerald-600 font-bold">Yes</span> : <span className="text-slate-400">No</span>) },
                    { key: 'convertedToPo', label: 'PO Raised', render: (r) => (r.convertedToPo ? <span className="text-emerald-600 font-bold">Yes</span> : <span className="text-slate-400">No</span>) },
                    { key: 'status', label: 'Status', render: (r) => STATUS_CELL(r.status) }
                  ]}
                  rows={data.rfqConversion.rows.slice(0, 8)}
                  empty="No RFQs in the selected range."
                />
              </ReportSection>

              <ReportSection icon={Handshake} title="Negotiation Savings" subtitle={`${data.negotiationSavings.totals.count} awarded RFQ(s) with estimates`}>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                  <Metric label="Estimated Value" value={MONEY(data.negotiationSavings.totals.totalEstimated)} />
                  <Metric label="Awarded Value" value={MONEY(data.negotiationSavings.totals.totalAwarded)} />
                  <Metric label="Total Savings" value={MONEY(data.negotiationSavings.totals.totalSavings)} tone="text-emerald-700" />
                  <Metric label="Savings vs Estimate" value={PCT(data.negotiationSavings.totals.savingsPct)} tone="text-emerald-700" />
                </div>
                <ReportTable
                  columns={[
                    { key: 'rfqNo', label: 'RFQ', render: (r) => LINK_CELL(r.rfqNo, `/purchase/rfq/${r.rfqNo}`, navigate) },
                    { key: 'vendor', label: 'Awarded Vendor' },
                    { key: 'estimatedValue', label: 'Estimate', align: 'right', render: (r) => MONEY_CELL(r.estimatedValue) },
                    { key: 'awardedValue', label: 'Awarded', align: 'right', render: (r) => MONEY_CELL(r.awardedValue) },
                    { key: 'savings', label: 'Savings', align: 'right', render: (r) => <span className="font-bold text-emerald-700 tabular-nums">{MONEY(r.savings)}</span> },
                    { key: 'savingsPct', label: 'Savings %', align: 'right', render: (r) => NUM(`${r.savingsPct}%`) }
                  ]}
                  rows={data.negotiationSavings.rows.slice(0, 8)}
                  empty="No awarded RFQs with estimated values in the selected range."
                />
              </ReportSection>
            </div>

            {/* ═══ SUPPLIER & DELIVERY ═══ */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <ReportSection icon={Building2} title="Supplier Performance" subtitle={`${data.supplierPerformance.rows.length} supplier(s) with activity`}>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
                  <Metric label="On-Time Delivery" value={PCT(data.supplierPerformance.totals.onTimeDeliveryPct)} tone="text-emerald-700" />
                  <Metric label="Quality Pass Rate" value={PCT(data.supplierPerformance.totals.qualityPassRate)} tone="text-emerald-700" />
                  <Metric label="Active Vendors" value={NUM(data.supplierPerformance.rows.length)} />
                </div>
                <ReportTable
                  columns={[
                    { key: 'vendor', label: 'Vendor' },
                    { key: 'spend', label: 'Spend', align: 'right', render: (r) => MONEY_CELL(r.spend) },
                    { key: 'orderCount', label: 'Orders', align: 'right', render: (r) => NUM(r.orderCount) },
                    { key: 'onTimePct', label: 'On-Time', align: 'right', render: (r) => NUM(PCT(r.onTimePct)) },
                    { key: 'qualityPassRate', label: 'Quality', align: 'right', render: (r) => NUM(PCT(r.qualityPassRate)) },
                    { key: 'rating', label: 'Rating', align: 'right', render: (r) => NUM(r.rating || '—') }
                  ]}
                  rows={data.supplierPerformance.rows}
                  empty="No supplier activity in the selected range."
                />
              </ReportSection>

              <ReportSection icon={Truck} title="Delivery Performance" subtitle={`${data.deliveryPerformance.totals.total} goods receipt(s) in range`}>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                  <Metric label="GRNs" value={NUM(data.deliveryPerformance.totals.total)} />
                  <Metric label="On-Time" value={NUM(data.deliveryPerformance.totals.onTime)} sub={PCT(data.deliveryPerformance.totals.onTimePct)} tone="text-emerald-700" />
                  <Metric label="Late" value={NUM(data.deliveryPerformance.totals.late)} tone={data.deliveryPerformance.totals.late > 0 ? 'text-rose-700' : 'text-slate-800'} />
                  <Metric label="Avg Delay (late)" value={NUM(`${data.deliveryPerformance.totals.avgDelayDays}d`)} />
                </div>
                <ReportTable
                  columns={[
                    { key: 'grnNo', label: 'GRN', render: (r) => LINK_CELL(r.grnNo, `/purchase/logistics/grn/${r.grnNo}`, navigate) },
                    { key: 'poNo', label: 'PO', render: (r) => LINK_CELL(r.poNo, `/purchase/orders/${r.poNo}`, navigate) },
                    { key: 'vendor', label: 'Vendor' },
                    { key: 'expectedDate', label: 'Expected' },
                    { key: 'receivedOn', label: 'Received' },
                    { key: 'onTime', label: 'On-Time', render: (r) => (r.onTime ? <span className="text-emerald-600 font-bold">Yes</span> : <span className="text-rose-600 font-bold">Late {r.delayDays > 0 ? `${r.delayDays}d` : ''}</span>) }
                  ]}
                  rows={data.deliveryPerformance.rows.slice(0, 10)}
                  empty="No goods receipts in the selected range."
                />
              </ReportSection>
            </div>

            {/* ═══ QUALITY & INVENTORY ═══ */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <ReportSection icon={ShieldCheck} title="Quality / Rejection" subtitle={`${data.quality.totals.total} inspection(s) in range`}>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                  <Metric label="Pass Rate" value={PCT(data.quality.totals.passRate)} tone="text-emerald-700" />
                  <Metric label="Rejection Rate" value={PCT(data.quality.totals.rejectionRate)} tone={data.quality.totals.rejectionRate > 0 ? 'text-rose-700' : 'text-slate-800'} />
                  <Metric label="Passed" value={NUM(data.quality.totals.passed)} />
                  <Metric label="Failed" value={NUM(data.quality.totals.failed)} tone={data.quality.totals.failed > 0 ? 'text-rose-700' : 'text-slate-800'} />
                </div>
                <div className="space-y-3 mb-4">
                  {(data.quality.distribution || []).map((row) => (
                    <BarRow key={row.status} label={row.status} value={NUM(row.count)} pct={data.quality.totals.total ? Math.round((row.count / data.quality.totals.total) * 100) : 0} max={data.quality.distribution[0]?.count || 1} tone={row.status === 'Failed' ? '#DC2626' : '#0B4A3D'} />
                  ))}
                </div>
                <ReportTable
                  columns={[
                    { key: 'vendor', label: 'Vendor' },
                    { key: 'total', label: 'Inspections', align: 'right', render: (r) => NUM(r.total) },
                    { key: 'passed', label: 'Passed', align: 'right', render: (r) => NUM(r.passed) },
                    { key: 'failed', label: 'Rejected', align: 'right', render: (r) => NUM(r.failed) },
                    { key: 'passRate', label: 'Pass %', align: 'right', render: (r) => NUM(PCT(r.passRate)) }
                  ]}
                  rows={data.quality.byVendor}
                  empty="No inspections in the selected range."
                />
              </ReportSection>

              <ReportSection icon={Package} title="Inventory Movement" subtitle={`${data.inventoryMovement.totals.totalMovements} movement(s) in range`}>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                  <Metric label="Movements" value={NUM(data.inventoryMovement.totals.totalMovements)} />
                  <Metric label="Net Qty" value={NUM(data.inventoryMovement.totals.netQty)} tone={data.inventoryMovement.totals.netQty >= 0 ? 'text-emerald-700' : 'text-rose-700'} />
                  <Metric label="Receipts (qty)" value={NUM(data.inventoryMovement.totals.receiptQty)} />
                  <Metric label="Issues (qty)" value={NUM(data.inventoryMovement.totals.issueQty)} />
                </div>
                <div className="space-y-3 mb-4">
                  {(data.inventoryMovement.byType || []).map((row) => (
                    <BarRow key={row.type} label={row.type} value={NUM(row.count)} max={data.inventoryMovement.byType[0]?.count || 1} tone="#0B4A3D" />
                  ))}
                </div>
                <ReportTable
                  columns={[
                    { key: 'id', label: 'Movement' },
                    { key: 'product', label: 'Product' },
                    { key: 'warehouse', label: 'Warehouse' },
                    { key: 'type', label: 'Type', render: (r) => STATUS_CELL(r.type) },
                    { key: 'delta', label: 'Qty', align: 'right', render: (r) => <span className={`font-bold tabular-nums ${Number(r.delta) < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{Number(r.delta) > 0 ? `+${r.delta}` : r.delta}</span> },
                    { key: 'date', label: 'Date' }
                  ]}
                  rows={data.inventoryMovement.rows.slice(0, 8)}
                  empty="No inventory movements in the selected range."
                />
              </ReportSection>
            </div>

            {/* ═══ RECEIVABLES / PAYABLES ═══ */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <ReportSection icon={CalendarClock} title="Invoice Aging" subtitle={`${MONEY(data.invoiceAging.totalOutstanding)} outstanding across ${data.invoiceAging.rows.length} invoice(s)`}>
                <AgingBuckets buckets={data.invoiceAging.buckets} money />
                <div className="mt-4">
                  <ReportTable
                    columns={[
                      { key: 'invoiceNo', label: 'Invoice', render: (r) => LINK_CELL(r.invoiceNo, `/purchase/invoices/${r.invoiceNo}`, navigate) },
                      { key: 'vendor', label: 'Vendor' },
                      { key: 'invoiceDate', label: 'Invoice Date' },
                      { key: 'ageDays', label: 'Age (days)', align: 'right', render: (r) => NUM(r.ageDays) },
                      { key: 'outstanding', label: 'Outstanding', align: 'right', render: (r) => MONEY_CELL(r.outstanding) },
                      { key: 'status', label: 'Status', render: (r) => STATUS_CELL(r.status) }
                    ]}
                    rows={data.invoiceAging.rows.slice(0, 8)}
                    empty="No outstanding invoices in the selected range."
                  />
                </div>
              </ReportSection>

              <ReportSection icon={Banknote} title="Outstanding Payables" subtitle={`${MONEY(data.outstandingPayables.totalOutstanding)} across ${data.outstandingPayables.byVendor.length} vendor(s)`}>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <Metric label="Total Invoiced (unpaid)" value={MONEY(data.outstandingPayables.totalInvoiced)} />
                  <Metric label="Total Outstanding" value={MONEY(data.outstandingPayables.totalOutstanding)} tone="text-amber-700" />
                </div>
                <ReportTable
                  columns={[
                    { key: 'vendor', label: 'Vendor' },
                    { key: 'invoiceCount', label: 'Invoices', align: 'right', render: (r) => NUM(r.invoiceCount) },
                    { key: 'invoiced', label: 'Invoiced', align: 'right', render: (r) => MONEY_CELL(r.invoiced) },
                    { key: 'paid', label: 'Paid', align: 'right', render: (r) => MONEY_CELL(r.paid) },
                    { key: 'outstanding', label: 'Outstanding', align: 'right', render: (r) => <span className="font-bold text-amber-700 tabular-nums">{MONEY(r.outstanding)}</span> }
                  ]}
                  rows={data.outstandingPayables.byVendor}
                  empty="No outstanding payables in the selected range."
                />
              </ReportSection>
            </div>

            {/* ═══ PAYMENTS ═══ */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <ReportSection icon={AlertTriangle} title="Overdue Payments" subtitle={`${MONEY(data.payments.overdue.totalOverdue)} overdue across ${data.payments.overdue.count} invoice(s)`}>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <Metric label="Overdue Invoices" value={NUM(data.payments.overdue.count)} />
                  <Metric label="Overdue Value" value={MONEY(data.payments.overdue.totalOverdue)} tone="text-rose-700" />
                </div>
                <ReportTable
                  columns={[
                    { key: 'invoiceNo', label: 'Invoice', render: (r) => LINK_CELL(r.invoiceNo, `/purchase/invoices/${r.invoiceNo}`, navigate) },
                    { key: 'vendor', label: 'Vendor' },
                    { key: 'dueDate', label: 'Due Date' },
                    { key: 'daysOverdue', label: 'Days Overdue', align: 'right', render: (r) => <span className="font-bold text-rose-600 tabular-nums">{r.daysOverdue ?? '—'}</span> },
                    { key: 'outstanding', label: 'Amount', align: 'right', render: (r) => MONEY_CELL(r.outstanding) }
                  ]}
                  rows={data.payments.overdue.rows}
                  empty="No overdue payments in the selected range."
                />
              </ReportSection>

              <ReportSection icon={TrendingUp} title="Payment Forecast" subtitle={`${MONEY(data.payments.forecast.totalUpcoming)} due within the next 90 days (${data.payments.forecast.count} invoice(s))`}>
                <div className="space-y-3 mb-4">
                  {(data.payments.forecast.buckets || []).map((row) => (
                    <BarRow key={row.label} label={row.label} value={`${row.count} · ${MONEY(row.amount)}`} max={data.payments.forecast.buckets[0]?.amount || 1} tone="#0284C7" />
                  ))}
                </div>
                <ReportTable
                  columns={[
                    { key: 'invoiceNo', label: 'Invoice', render: (r) => LINK_CELL(r.invoiceNo, `/purchase/invoices/${r.invoiceNo}`, navigate) },
                    { key: 'vendor', label: 'Vendor' },
                    { key: 'dueDate', label: 'Due Date' },
                    { key: 'daysUntilDue', label: 'Days To Due', align: 'right', render: (r) => NUM(r.daysUntilDue) },
                    { key: 'outstanding', label: 'Amount', align: 'right', render: (r) => MONEY_CELL(r.outstanding) }
                  ]}
                  rows={data.payments.forecast.rows}
                  empty="No upcoming payments in the next 90 days."
                />
              </ReportSection>
            </div>
          </>
        )}
      </div>
    </PurchasePageLayout>
  );
}

/* ------------------------------------------------------------------ */
/*  Section + aging-bucket helpers                                     */
/* ------------------------------------------------------------------ */

function ReportSection({ icon: Icon, title, subtitle, children }) {
  return (
    <PurchaseSectionCard
      title={
        <span className="flex items-center gap-2">
          {Icon && <Icon className="w-4 h-4 text-[#0B4A3D]" />}
          {title}
        </span>
      }
      subtitle={subtitle}
    >
      {children}
    </PurchaseSectionCard>
  );
}

function AgingBuckets({ buckets, money = false }) {
  const max = Math.max(1, ...(buckets || []).map((b) => b.count));
  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
      {(buckets || []).map((bucket) => (
        <div key={bucket.label} className="rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[9px] font-bold uppercase tracking-wide text-slate-400">{bucket.label}</span>
            <span className="text-[10px] font-extrabold text-slate-600 tabular-nums">{bucket.count}</span>
          </div>
          <div className="h-1.5 bg-slate-100 rounded-full mt-1.5 overflow-hidden">
            <div className="h-full rounded-full bg-[#0B4A3D]" style={{ width: `${(bucket.count / max) * 100}%` }} />
          </div>
          <div className="text-[10px] font-bold text-slate-700 tabular-nums mt-1">{money ? MONEY(bucket.value) : `${bucket.value.toLocaleString('en-IN')} qty`}</div>
        </div>
      ))}
    </div>
  );
}

