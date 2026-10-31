import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import ReportShell from '../../components/production/reports/ReportShell';
import ReportFilters from '../../components/production/reports/ReportFilters';
import ReportSummaryCard from '../../components/production/reports/ReportSummaryCard';
import ReportTable from '../../components/production/reports/ReportTable';
import ProductionStatusBadge from '../../components/production/ProductionStatusBadge';
import ProductionProgress from '../../components/production/ProductionProgress';
import { reportService, emptyReportFilters } from '../../services/production/reportService';
import useReportData from '../../hooks/useReportData';
import { formatDate } from '../../utils/format';

/**
 * Production Summary.
 *
 * Order volumes, completion, rejects and progress: the filtered orders, the
 * computed summary and the per-department rows all come from
 * GET /production/reports/production-summary, which reads production_orders and
 * the stage entries recorded against them.
 */
export default function ProductionSummaryReport() {
  const location = useLocation();
  const [filters, setFilters] = useState(() => location.state?.filterState || emptyReportFilters());
  const { data, loading, error } = useReportData(reportService.getProductionSummary, filters);

  const orders = data?.orders || [];
  const summary = data?.summary || null;
  const departments = (data?.departments || []).filter((row) => row.plannedQuantity > 0);

  const columns = [
    { key: 'wo', label: 'Work Order', render: (row) => <td className="cell-strong">{row.workOrder}</td> },
    { key: 'product', label: 'Item Name', render: (row) => <td>{row.product}</td> },
    { key: 'department', label: 'Department', render: (row) => <td>{row.department}</td> },
    { key: 'planned', label: 'Planned Quantity', render: (row) => <td>{row.quantity}</td> },
    { key: 'completed', label: 'Completed Quantity', render: (row) => <td>{Math.round(row.quantity * (row.progress / 100))}</td> },
    { key: 'stage', label: 'Current Stage', render: (row) => <td>{row.currentStage}</td> },
    { key: 'status', label: 'Status', render: (row) => <td><ProductionStatusBadge status={row.status} /></td> },
    { key: 'progress', label: 'Progress', render: (row) => <td><ProductionProgress value={row.progress} /></td> },
    { key: 'start', label: 'Start Date', render: (row) => <td>{formatDate(row.startDate)}</td> },
    { key: 'due', label: 'Due Date', render: (row) => <td>{formatDate(row.dueDate)}</td> },
  ];

  const exportData = {
    filename: 'production-summary.csv',
    columns: columns.map((column) => column.label),
    rows: orders.map((row) => [
      row.workOrder,
      row.product,
      row.department,
      row.quantity,
      Math.round(row.quantity * (row.progress / 100)),
      row.currentStage,
      row.status,
      `${row.progress}%`,
      formatDate(row.startDate),
      formatDate(row.dueDate),
    ]),
  };

  return (
    <ReportShell
      activeKey="production-summary"
      title="Production Summary"
      description="Order volumes, completion and progress across the production floor."
      exportData={exportData}
      filterState={filters}
    >
      <ReportFilters initial={filters} onApply={setFilters} />

      {error && <p className="report-empty">{error}</p>}
      {!error && loading && <p className="report-empty">Loading report…</p>}

      {!error && !loading && summary && (
        <>
          <div className="report-summary-grid">
            <ReportSummaryCard icon="clipboard" tone="neutral" label="Total Work Orders" value={summary.totalOrders} sub="after filters" />
            <ReportSummaryCard icon="check" tone="green" label="Completed Orders" value={summary.completedOrders} sub="Packed / dispatched included" />
            <ReportSummaryCard icon="play" tone="blue" label="In Progress" value={summary.inProgress} sub="including pending QC" />
            <ReportSummaryCard icon="clock" tone="amber" label="Pending" value={summary.pending} sub="not yet started" />
            <ReportSummaryCard icon="package" tone="neutral" label="Total Planned Quantity" value={summary.plannedQuantity} sub="units" />
            <ReportSummaryCard icon="layers" tone="green" label="Total Completed Quantity" value={summary.completedQuantity} sub="units" />
            <ReportSummaryCard icon="info" tone="red" label="Total Rejected Quantity" value={summary.rejectedQuantity} sub="from stage entries" />
            <ReportSummaryCard icon="clock" tone="amber" label="Pending Quantity" value={summary.pendingQuantity} sub="planned − completed" />
            <ReportSummaryCard icon="layers" tone="blue" label="Current WIP" value={summary.wip} sub="in process after rejects" />
            <ReportSummaryCard icon="bar-chart" tone="green" label="Production Progress" value={`${summary.overallCompletion}%`} sub="completed ÷ planned" />
          </div>

          <section className="report-section">
            <h3 className="report-section-title">Production Progress by Department</h3>
            <div className="report-progress-list">
              {departments.map((row) => (
                <div key={row.department} className="hbar">
                  <div className="hbar-row">
                    <span className="hbar-label">{row.department}</span>
                    <span className="hbar-track">
                      <span className="hbar-fill" style={{ width: `${row.progress}%` }} />
                    </span>
                    <span className="hbar-value">{row.progress}%</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="report-section">
            <h3 className="report-section-title">Order Detail</h3>
            <ReportTable columns={columns} rows={orders.map((order, index) => ({ ...order, key: `${order.id}-${index}` }))} />
          </section>
        </>
      )}
    </ReportShell>
  );
}
