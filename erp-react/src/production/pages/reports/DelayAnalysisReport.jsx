import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import ReportShell from '../../components/production/reports/ReportShell';
import ReportFilters from '../../components/production/reports/ReportFilters';
import ReportSummaryCard from '../../components/production/reports/ReportSummaryCard';
import ReportTable from '../../components/production/reports/ReportTable';
import ProductionStatusBadge from '../../components/production/ProductionStatusBadge';
import { reportService, emptyReportFilters } from '../../services/production/reportService';
import useReportData from '../../hooks/useReportData';
import { formatDate } from '../../utils/format';

/**
 * Delay Analysis.
 *
 * Orders past their due date that are not finished, with the delay days and
 * reason computed in the backend from the persisted orders
 * (GET /production/reports/delay-analysis). Nothing is pre-recorded, so an
 * order that is on time simply does not appear.
 */
export default function DelayAnalysisReport() {
  const location = useLocation();
  const [filters, setFilters] = useState(() => location.state?.filterState || emptyReportFilters());
  const { data, loading, error } = useReportData(reportService.getDelayAnalysis, filters);

  const delays = data?.records || [];
  const summary = data?.summary || null;

  const columns = [
    { key: 'wo', label: 'Work Order', render: (row) => <td className="cell-strong">{row.workOrder}</td> },
    { key: 'product', label: 'Item Name', render: (row) => <td>{row.product}</td> },
    { key: 'department', label: 'Department', render: (row) => <td>{row.department}</td> },
    { key: 'due', label: 'Planned Due Date', render: (row) => <td>{formatDate(row.dueDate)}</td> },
    { key: 'expected', label: 'Actual/Expected Date', render: (row) => <td>{formatDate(row.expectedDate)}</td> },
    {
      key: 'delay',
      label: 'Delay Days',
      render: (row) => <td><span className={`delay-days${row.delayDays > 0 ? ' delay-days-over' : ''}`}>{row.delayDays}</span></td>,
    },
    { key: 'stage', label: 'Current Stage', render: (row) => <td>{row.currentStage}</td> },
    { key: 'reason', label: 'Reason', render: (row) => <td className="cell-strong">{row.reason}</td> },
    { key: 'status', label: 'Status', render: (row) => <td><ProductionStatusBadge status={row.status} /></td> },
  ];

  const exportData = {
    filename: 'delay-analysis.csv',
    columns: columns.map((column) => column.label),
    rows: delays.map((row) => [
      row.workOrder,
      row.product,
      row.department,
      formatDate(row.dueDate),
      formatDate(row.expectedDate),
      row.delayDays,
      row.currentStage,
      row.reason,
      row.status,
    ]),
  };

  return (
    <ReportShell
      activeKey="delay-analysis"
      title="Delay Analysis"
      description="Delayed production orders with reasons and computed delay days."
      exportData={exportData}
      filterState={filters}
    >
      <ReportFilters initial={filters} onApply={setFilters} />

      {error && <p className="report-empty">{error}</p>}
      {!error && loading && <p className="report-empty">Loading report…</p>}

      {!error && !loading && summary && (
        <>
          <div className="report-summary-grid">
            <ReportSummaryCard icon="clock" tone="red" label="Delayed Orders" value={summary.delayedOrders} sub="past planned due date" />
            <ReportSummaryCard icon="calendar" tone="amber" label="Total Delay Days" value={summary.totalDelayDays} sub="days across delays" />
            <ReportSummaryCard icon="bar-chart" tone="blue" label="Average Delay Days" value={summary.averageDelayDays} sub="per delayed order" />
            <ReportSummaryCard icon="pause" tone="neutral" label="Orders On Hold" value={summary.ordersOnHold} sub="pending or on QC hold" />
          </div>

          <section className="report-section">
            <h3 className="report-section-title">Delay Detail</h3>
            {delays.length > 0 ? (
              <ReportTable columns={columns} rows={delays.map((row, index) => ({ ...row, key: `${row.workOrder}-${index}` }))} />
            ) : (
              <p className="report-empty">No delayed production orders — every order is within its due date.</p>
            )}
          </section>
        </>
      )}
    </ReportShell>
  );
}
