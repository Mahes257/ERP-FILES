/**
 * purchase/pages/rfq/RfqDashboard.jsx
 * ------------------------------------------------------------------
 * RFQ Dashboard — the RFQ & Quotations landing page. Live KPIs across
 * the full sourcing workflow (open / closed / awarded / pending
 * quotations / response time / participation / value / savings) and
 * analysis charts (status distribution, monthly trend, quotation
 * status, vendor response rate, award distribution, estimated vs
 * quoted value, category mix) plus quick actions. Data comes from the
 * mock rfqService (no backend).
 * ------------------------------------------------------------------
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight, Building2, CalendarClock, CheckCircle2, ClipboardList, FilePlus2, FileSpreadsheet,
  Inbox, Loader2, Mail, MailPlus, PieChart, RefreshCw, Timer, TrendingUp, Trophy, Users, Wallet
} from 'lucide-react';
import { rfqService } from '../../services/rfq';
import { formatAmount } from '../../utils/purchase';
import { formatDate } from '../../utils/helpers';
import PurchasePageLayout from '../../components/list/PurchasePageLayout';
import PurchaseHeader from '../../components/PurchaseHeader';
import PurchaseKpiCards from '../../components/PurchaseKpiCards';
import PurchaseSectionCard from '../../components/PurchaseSectionCard';
import PurchaseChartCard from '../../components/PurchaseChartCard';
import PurchaseMiniBarChart from '../../components/PurchaseMiniBarChart';
import PurchaseStatusBadge from '../../components/PurchaseStatusBadge';
import '../../styles/cpr-list.css';
import '../../styles/requisition-list-polish.css';

const Skeleton = ({ height = 'h-40' }) => <div className={`${height} bg-slate-100 rounded-lg animate-pulse`} />;

export default function RfqDashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const dashboard = await rfqService.getRfqDashboard();
      setData(dashboard);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    queueMicrotask(load);
  }, []);

  const ready = data != null;

  /* Enterprise KPI set: Open / Closed / Awarded RFQs, pending quotations,
     average response time, vendor participation, RFQ value and savings. */
  const kpiDefs = [
    { key: 'open', label: 'Open RFQs', icon: Mail, color: '#2563eb', bg: 'rgba(37,99,235,0.10)' },
    { key: 'closed', label: 'Closed RFQs', icon: CheckCircle2, color: '#16a34a', bg: 'rgba(22,163,74,0.10)' },
    { key: 'pendingQuotations', label: 'Pending Quotations', icon: Inbox, color: '#d97706', bg: 'rgba(217,119,6,0.10)' },
    /* Awarded = green (successful outcome) — no indigo for workflow. */
    { key: 'awarded', label: 'Awarded RFQs', icon: Trophy, color: '#16a34a', bg: 'rgba(22,163,74,0.10)' },
    { key: 'avgResponseTime', label: 'Avg Response Time', icon: Timer, color: '#0891b2', bg: 'rgba(8,145,178,0.10)' },
    { key: 'vendorParticipation', label: 'Vendor Participation', icon: Users, color: '#7c3aed', bg: 'rgba(124,58,237,0.10)' },
    { key: 'rfqValue', label: 'RFQ Value', icon: Wallet, color: '#0A4F44', bg: 'rgba(10,79,68,0.08)', currency: true },
    { key: 'savingsAchieved', label: 'Savings Achieved', icon: TrendingUp, color: '#16a34a', bg: 'rgba(22,163,74,0.10)', currency: true }
  ];

  const kpiCards = kpiDefs.map((def) => {
    const raw = data?.stats?.[def.key] ?? 0;
    let value;
    if (def.currency) value = formatAmount(raw);
    else if (def.key === 'avgResponseTime') value = `${Number(raw).toFixed(1)} days`;
    else value = String(raw);
    return { ...def, value };
  });

  const statusChartValues = (data?.statusBreakdown || []).map((item) => item.value);

  const valueChart = data?.valueTrend || { labels: [], estimated: [], quoted: [] };
  const combinedValue = valueChart.estimated.map((value, index) => Math.max(value, valueChart.quoted[index] || 0));

  const quotationStats = data?.quotationStats || { received: 0, pending: 0, accepted: 0, rejected: 0 };
  const quotationRows = [
    { label: 'Received', count: quotationStats.received, tone: 'blue' },
    { label: 'Pending', count: quotationStats.pending, tone: 'yellow' },
    { label: 'Accepted', count: quotationStats.accepted, tone: 'green' },
    { label: 'Rejected', count: quotationStats.rejected, tone: 'red' }
  ];
  const quotationTotal = Math.max(1, quotationStats.received + quotationStats.pending + quotationStats.accepted + quotationStats.rejected);

  return (
    <PurchasePageLayout>
      <PurchaseHeader
        variant="cpr"
        crumb="RFQ & Quotations"
        icon={PieChart}
        title="RFQ & Quotations Dashboard"
        subtitle="Live sourcing pipeline, quotation activity and vendor response metrics"
        actions={
          <>
            <button type="button" onClick={() => navigate('/purchase/rfq/new')} className="erp-btn-primary">
              <span className="erp-btn-icon"><FilePlus2 size={16} /></span> Create RFQ
            </button>
            <button type="button" onClick={() => navigate('/purchase/rfq')} className="btn btn-ghost btn-sm">
              <ClipboardList size={12} /> RFQ List
            </button>
            <button
              type="button"
              onClick={load}
              className="btn btn-ghost btn-sm"
              aria-label="Refresh dashboard data"
              title="Refresh"
            >
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            </button>
          </>
        }
      />

      {error && !ready && (
        <div className="cpr-error-banner" role="alert">
          <p>{error?.message || 'Unable to load RFQ dashboard data.'}</p>
          <button type="button" className="cpr-error-retry" onClick={load}>Retry</button>
        </div>
      )}

      <PurchaseKpiCards variant="cpr" cards={kpiCards} loading={!ready} gridClass="" />

      {/* ===== CHART ROW 1 ===== */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-4">
        <PurchaseChartCard
          title="Status Distribution"
          subtitle="RFQs by current workflow stage"
          icon={PieChart}
          loading={!ready}
          empty={ready && statusChartValues.every((value) => value === 0)}
          exportFilename="rfq-status-distribution"
        >
          {ready && (
            <PurchaseMiniBarChart
              labels={(data.statusBreakdown || []).map((item) => item.label)}
              values={statusChartValues}
              valueFormat={(value) => value}
            />
          )}
        </PurchaseChartCard>

        <PurchaseChartCard
          title="Monthly RFQ Trend"
          subtitle="RFQs created per month"
          icon={MailPlus}
          loading={!ready}
          empty={ready && (data.monthlyTrend?.values || []).every((value) => value === 0)}
          exportFilename="rfq-monthly-trend"
        >
          {ready && (
            <PurchaseMiniBarChart
              labels={data.monthlyTrend?.labels || []}
              values={data.monthlyTrend?.values || []}
              valueFormat={(value) => value}
              tone="blue"
            />
          )}
        </PurchaseChartCard>

        <PurchaseChartCard
          title="Quotation Status"
          subtitle="Quotes received, pending, accepted and rejected"
          icon={Inbox}
          loading={!ready}
          empty={ready && quotationTotal <= 1}
          legend={[
            { label: 'Received', color: '#2563eb' },
            { label: 'Accepted', color: '#16a34a' }
          ]}
          exportFilename="rfq-quotation-status"
        >
          {ready && (
            <div className="space-y-2.5 pt-1">
              {quotationRows.map((row) => (
                <div key={row.label}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-bold text-slate-700">{row.label}</span>
                    <span className="font-semibold text-slate-400">{row.count}</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        row.tone === 'blue' ? 'bg-sky-500' : row.tone === 'yellow' ? 'bg-amber-500' : row.tone === 'green' ? 'bg-emerald-500' : 'bg-rose-500'
                      }`}
                      style={{ width: `${(row.count / quotationTotal) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </PurchaseChartCard>
      </div>

      {/* ===== CHART ROW 2 ===== */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
        <PurchaseChartCard
          title="Vendor Response Rate"
          subtitle="% of invitations answered per vendor"
          icon={Building2}
          loading={!ready}
          empty={ready && (data.vendorResponseRate || []).length === 0}
          legend={[
            { label: 'Responded', color: '#16a34a' },
            { label: 'No response', color: '#e2e8f0' }
          ]}
          exportFilename="rfq-vendor-response-rate"
        >
          {ready && (
            <div className="space-y-2.5 pt-1">
              {(data.vendorResponseRate || []).map((item) => (
                <div key={item.label}>
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span className="font-bold text-slate-600 truncate">{item.label}</span>
                    <span className="text-slate-400 font-semibold">{item.responded}/{item.invitations} · {item.rate}%</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-emerald-500" style={{ width: `${item.rate}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </PurchaseChartCard>

        <PurchaseChartCard
          title="Award Distribution"
          subtitle="RFQs awarded to each winning vendor"
          icon={Trophy}
          loading={!ready}
          empty={ready && (data.awardDistribution || []).length === 0}
          exportFilename="rfq-award-distribution"
        >
          {ready && (
            <PurchaseMiniBarChart
              labels={(data.awardDistribution || []).map((item) => item.label)}
              values={(data.awardDistribution || []).map((item) => item.value)}
              valueFormat={(value) => value}
              tone="cyan"
            />
          )}
        </PurchaseChartCard>

        <div className="space-y-4">
          <PurchaseSectionCard
            title="Expiring This Week"
            subtitle="RFQs closing within the next 7 days"
            icon={CalendarClock}
            action={
              <span className="po-badge po-badge-red">{(data?.expiringRfqs || []).length} due</span>
            }
          >
            {!ready ? (
              <Skeleton height="h-40" />
            ) : (data.expiringRfqs || []).length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center">No RFQs expiring this week.</p>
            ) : (
              <div className="space-y-2.5">
                {(data.expiringRfqs || []).map((rfq) => (
                  <button
                    key={rfq.id}
                    type="button"
                    onClick={() => navigate(`/purchase/rfq/${rfq.id}`)}
                    className="w-full flex items-center justify-between gap-3 text-left border border-slate-100 rounded-lg px-3 py-2 hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-[#0B4A3D] truncate">{rfq.rfqNo}</div>
                      <div className="text-[11px] text-slate-400 truncate">{rfq.title}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[11px] font-bold text-rose-600">{formatDate(rfq.dueDate)}</div>
                      <div className="text-[10px] text-slate-400">{rfq.vendorCount} vendors</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </PurchaseSectionCard>

          <PurchaseSectionCard
            title="Vendor Participation"
            subtitle="Most invited vendors"
            icon={Building2}
            action={
              <span className="po-badge po-badge-gray">{data?.stats?.vendorParticipation ?? 0} unique</span>
            }
          >
            {!ready ? (
              <Skeleton height="h-40" />
            ) : (data.vendorParticipation || []).length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center">No vendor invitations yet.</p>
            ) : (
              <PurchaseMiniBarChart
                labels={(data.vendorParticipation || []).map((item) => item.label)}
                values={(data.vendorParticipation || []).map((item) => item.value)}
                valueFormat={(value) => value}
                tone="purple"
              />
            )}
          </PurchaseSectionCard>
        </div>
      </div>

      {/* ===== CHART ROW 3 ===== */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4 items-start">
        <PurchaseChartCard
          title="Estimated vs Best Quote"
          subtitle="Budget against lowest quotation for open RFQs"
          icon={Wallet}
          loading={!ready}
          empty={ready && combinedValue.every((value) => value === 0)}
          legend={[
            { label: 'Estimated Value', color: '#2563eb' },
            { label: 'Best Quote', color: '#16a34a' }
          ]}
          exportFilename="rfq-estimated-vs-quoted"
        >
          {ready && (
            <div className="space-y-3 pt-1">
              {(data.valueTrend?.labels || []).map((label, index) => {
                const max = Math.max(...combinedValue, 1);
                const estimated = valueChart.estimated[index] || 0;
                const quoted = valueChart.quoted[index] || 0;
                return (
                  <div key={label}>
                    <div className="flex items-center justify-between text-[11px] mb-1">
                      <span className="font-bold text-slate-600">{label}</span>
                      <span className="text-slate-400 font-semibold">{formatAmount(quoted)} / {formatAmount(estimated)}</span>
                    </div>
                    <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden flex gap-0.5">
                      <div className="h-full bg-sky-500 rounded-l-full" style={{ width: `${(estimated / max) * 50}%` }} />
                      <div className="h-full bg-emerald-500 rounded-r-full" style={{ width: `${(quoted / max) * 50}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </PurchaseChartCard>

        <PurchaseChartCard
          title="Category Mix"
          subtitle="RFQs grouped by category"
          icon={FileSpreadsheet}
          loading={!ready}
          empty={ready && data.categoryBreakdown?.length === 0}
          exportFilename="rfq-category-mix"
        >
          {ready && (
            <div className="space-y-2.5 pt-1">
              {(data.categoryBreakdown || []).slice(0, 6).map((item) => {
                const max = Math.max(...data.categoryBreakdown.map((c) => c.value), 1);
                return (
                  <div key={item.label}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-bold text-slate-700 truncate">{item.label}</span>
                      <span className="font-semibold text-slate-400">{item.value}</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400" style={{ width: `${(item.value / max) * 100}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </PurchaseChartCard>
      </div>

      {/* ===== TOP RFQ BY VALUE ===== */}
      <PurchaseSectionCard
        title="Highest Value RFQs"
        subtitle="Open and recently closed RFQs by estimated value"
        icon={Wallet}
        action={
          <button
            type="button"
            onClick={() => navigate('/purchase/rfq')}
            className="inline-flex items-center gap-1 text-xs font-bold text-[#0B4A3D] hover:text-[#083D34] cursor-pointer"
          >
            View All <ArrowRight className="w-3.5 h-3.5" />
          </button>
        }
        bodyClassName="p-0"
      >
        {!ready ? (
          <div className="p-5"><Skeleton height="h-44" /></div>
        ) : (
          <div className="pr-table-wrap">
            <table className="pr-table w-full text-left text-xs min-w-[720px]">
              <thead>
                <tr>
                  <th className="table-id-cell">RFQ No</th>
                  <th>RFQ</th>
                  <th>Department</th>
                  <th>Priority</th>
                  <th style={{ textAlign: 'center' }}>Vendors</th>
                  <th style={{ textAlign: 'center' }}>Status</th>
                  <th style={{ textAlign: 'right' }}>Estimated Value</th>
                  <th style={{ textAlign: 'center' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {(data.topByValue || []).map((rfq) => (
                  <tr key={rfq.id}>
                    <td className="table-id-cell">
                      <button
                        type="button"
                        onClick={() => navigate(`/purchase/rfq/${rfq.id}`)}
                        className="font-semibold text-[#0B4A3D] hover:text-[#083D34] hover:underline cursor-pointer"
                      >
                        {rfq.rfqNo}
                      </button>
                    </td>
                    <td className="text-slate-700 font-semibold truncate max-w-[240px]">{rfq.title}</td>
                    <td className="text-slate-500">{rfq.department || '—'}</td>
                    <td className="text-slate-600">{rfq.priority || '—'}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#E8F0EE] text-[#0B4A3D]">{rfq.vendorCount}</span>
                    </td>
                    <td style={{ textAlign: 'center' }}><PurchaseStatusBadge status={rfq.status} /></td>
                    <td style={{ textAlign: 'right' }} className="font-bold text-slate-800 whitespace-nowrap">
                      {formatAmount(rfq.estimatedValue, rfq.currency)}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <button
                        type="button"
                        onClick={() => navigate(`/purchase/rfq/${rfq.id}`)}
                        className="inline-flex items-center gap-1 text-xs font-bold text-[#0B4A3D] hover:text-[#083D34] cursor-pointer"
                      >
                        Open <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PurchaseSectionCard>

      {!ready && (
        <div className="flex justify-center py-8 text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      )}
    </PurchasePageLayout>
  );
}
