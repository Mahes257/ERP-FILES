/**
 * purchase/components/approval/ApprovalAnalytics.jsx
 * ------------------------------------------------------------------
 * Read-only analytics dashboard for the approval centre. Uses plain
 * CSS bar charts — no charting library. Computations are derived
 * client-side from the decorated record list.
 * ------------------------------------------------------------------
 */
import { useMemo } from 'react';
import { averageApprovalHours } from './approvalDecorators';
import { formatDate } from '../../utils/helpers';
import { formatAmountConverted } from '../../utils/purchase';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function BarChart({ data, formatter }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="ac-bar-chart">
      {data.map((d, i) => (
        <div className="ac-bar-col" key={`${d.label}-${i}`}>
          <div className="ac-bar-track" title={`${d.label}: ${formatter ? formatter(d.value) : d.value}`}>
            <div className="ac-bar" style={{ height: `${Math.max(4, Math.round((d.value / max) * 100))}%` }} />
          </div>
          <span className="ac-bar-label">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

function ListBar({ label, value, max, formatter }) {
  return (
    <div className="ac-listbar">
      <div className="flex items-center justify-between text-[11px] mb-1">
        <span className="font-semibold text-slate-700 truncate">{label}</span>
        <span className="text-slate-500">{formatter ? formatter(value) : value}</span>
      </div>
      <div className="ac-listbar-track">
        <div className="ac-listbar-fill" style={{ width: `${Math.max(4, Math.round((value / max) * 100))}%` }} />
      </div>
    </div>
  );
}

export default function ApprovalAnalytics({ records = [] }) {
  const data = useMemo(() => {
    const pendingValue = records
      .filter((r) => r.status === 'Pending Approval')
      .reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

    const statusCounts = {};
    records.forEach((r) => {
      statusCounts[r.status || 'Unknown'] = (statusCounts[r.status || 'Unknown'] || 0) + 1;
    });

    const byDept = {};
    const byBuyer = {};
    const byVendor = {};
    records.forEach((r) => {
      const dept = r.department || '—';
      const buyer = r.buyer || '—';
      const vendor = r.vendor || '—';
      byDept[dept] = (byDept[dept] || 0) + 1;
      byBuyer[buyer] = (byBuyer[buyer] || 0) + 1;
      byVendor[vendor] = (byVendor[vendor] || 0) + 1;
    });

    const now = new Date();
    const trend = [];
    for (let i = 5; i >= 0; i -= 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const label = MONTH_NAMES[d.getMonth()];
      const count = records.filter((r) => {
        const created = new Date(r.createdAt || r._createdTs);
        return `${created.getFullYear()}-${created.getMonth()}` === key;
      }).length;
      trend.push({ label, value: count });
    }

    const statusData = Object.entries(statusCounts).map(([label, value]) => ({ label, value }));
    const deptData = Object.entries(byDept).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
    const buyerData = Object.entries(byBuyer).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
    const vendorData = Object.entries(byVendor).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);

    return {
      total: records.length,
      pendingValue,
      avgHours: averageApprovalHours(records),
      statusData,
      deptData,
      buyerData,
      vendorData,
      trend
    };
  }, [records]);

  const maxVendor = Math.max(1, ...data.vendorData.map((d) => d.value));

  return (
    <div className="space-y-4">
      <div className="ac-analytics-strip">
        <div className="ac-analytics-stat">
          <span className="ac-analytics-label">Total Requisitions</span>
          <span className="ac-analytics-value">{data.total}</span>
        </div>
        <div className="ac-analytics-stat">
          <span className="ac-analytics-label">Pending Value</span>
          {/* Aggregate of stored INR totals — shown in the app's default
              display currency ('' resolves to the settings default). */}
          <span className="ac-analytics-value">{formatAmountConverted(data.pendingValue, '')}</span>
        </div>
        <div className="ac-analytics-stat">
          <span className="ac-analytics-label">Avg. Approval Time</span>
          <span className="ac-analytics-value">
            {Number.isFinite(data.avgHours) ? `${data.avgHours.toFixed(1)}h` : '—'}
          </span>
        </div>
        <div className="ac-analytics-stat">
          <span className="ac-analytics-label">Last Updated</span>
          <span className="ac-analytics-value text-sm">{formatDate(new Date().toISOString())}</span>
        </div>
      </div>

      <div className="ac-analytics-grid">
        <div className="ac-panel">
          <div className="ac-panel-title">Status Distribution</div>
          {data.statusData.length > 0 ? (
            <BarChart data={data.statusData} />
          ) : <p className="ac-muted">No data.</p>}
        </div>

        <div className="ac-panel">
          <div className="ac-panel-title">Monthly Trend (6 months)</div>
          <BarChart data={data.trend} />
        </div>

        <div className="ac-panel">
          <div className="ac-panel-title">By Department</div>
          {data.deptData.length > 0 ? (
            <BarChart data={data.deptData} />
          ) : <p className="ac-muted">No data.</p>}
        </div>

        <div className="ac-panel">
          <div className="ac-panel-title">By Buyer</div>
          {data.buyerData.length > 0 ? (
            <BarChart data={data.buyerData} />
          ) : <p className="ac-muted">No data.</p>}
        </div>

        <div className="ac-panel ac-panel-wide">
          <div className="ac-panel-title">Top Vendors by Requisition Count</div>
          {data.vendorData.length > 0 ? (
            <div className="space-y-2.5">
              {data.vendorData.slice(0, 6).map((v) => (
                <ListBar key={v.label} label={v.label} value={v.value} max={maxVendor} />
              ))}
            </div>
          ) : <p className="ac-muted">No data.</p>}
        </div>
      </div>
    </div>
  );
}
