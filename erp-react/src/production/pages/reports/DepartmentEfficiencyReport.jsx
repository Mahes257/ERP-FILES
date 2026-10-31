import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import ReportShell from '../../components/production/reports/ReportShell';
import ReportFilters from '../../components/production/reports/ReportFilters';
import ReportSummaryCard from '../../components/production/reports/ReportSummaryCard';
import ReportTable from '../../components/production/reports/ReportTable';
import ProductionProgress from '../../components/production/ProductionProgress';
import ProductionStatusBadge from '../../components/production/ProductionStatusBadge';
import { reportService, emptyReportFilters } from '../../services/production/reportService';
import useReportData from '../../hooks/useReportData';

/**
 * Department Efficiency.
 *
 * Output versus planned quantity per department, calculated in the backend from
 * the persisted production orders (GET /production/reports/department-efficiency).
 * The department rows, their efficiency and the headline summary all come from
 * that single response — nothing is tallied in the browser.
 */
export default function DepartmentEfficiencyReport() {
  const location = useLocation();
  const [filters, setFilters] = useState(() => location.state?.filterState || emptyReportFilters());
  const { data, loading, error } = useReportData(reportService.getDepartmentEfficiency, filters);

  const departments = data?.departments || [];
  const summary = data?.summary || null;

  const columns = [
    { key: 'department', label: 'Department', render: (row) => <td className="cell-strong">{row.department}</td> },
    { key: 'planned', label: 'Planned Quantity', render: (row) => <td>{row.plannedQuantity}</td> },
    { key: 'completed', label: 'Completed Quantity', render: (row) => <td>{row.completedQuantity}</td> },
    { key: 'pending', label: 'Pending Quantity', render: (row) => <td>{row.pendingQuantity}</td> },
    { key: 'efficiency', label: 'Efficiency %', render: (row) => <td><ProductionProgress value={row.efficiency} /></td> },
    { key: 'status', label: 'Status', render: (row) => <td>{row.status === '—' ? <span className="cell-muted">—</span> : <ProductionStatusBadge status={row.status} />}</td> },
  ];

  const exportData = {
    filename: 'department-efficiency.csv',
    columns: columns.map((column) => column.label),
    rows: departments.map((row) => [
      row.department,
      row.plannedQuantity,
      row.completedQuantity,
      row.pendingQuantity,
      `${row.efficiency}%`,
      row.status,
    ]),
  };

  return (
    <ReportShell
      activeKey="department-efficiency"
      title="Department Efficiency"
      description="Output versus planned effort per production department."
      exportData={exportData}
      filterState={filters}
    >
      <ReportFilters initial={filters} onApply={setFilters} />

      {error && <p className="report-empty">{error}</p>}
      {!error && loading && <p className="report-empty">Loading report…</p>}

      {!error && !loading && summary && (
        <>
          <div className="report-summary-grid">
            <ReportSummaryCard
              icon="shield-check"
              tone="green"
              label="Best Performing Department"
              value={summary.bestDepartment ? `${summary.bestDepartment} · ${summary.bestEfficiency}%` : '—'}
              sub="highest completed ÷ planned quantity"
            />
            <ReportSummaryCard icon="bar-chart" tone="blue" label="Average Efficiency" value={`${summary.average}%`} sub="across departments" />
            <ReportSummaryCard icon="package" tone="neutral" label="Total Planned" value={summary.totalPlanned} sub="units" />
            <ReportSummaryCard icon="check" tone="green" label="Total Completed" value={summary.totalCompleted} sub="units" />
          </div>

          <section className="report-section">
            <h3 className="report-section-title">Efficiency by Department</h3>
            {departments.some((row) => row.status !== '—') ? (
              <div className="report-progress-list">
                {departments
                  .filter((row) => row.status !== '—')
                  .map((row) => (
                    <div key={row.department} className="hbar">
                      <div className="hbar-row">
                        <span className="hbar-label">{row.department}</span>
                        <span className="hbar-track">
                          <span className="hbar-fill" style={{ width: `${row.efficiency}%` }} />
                        </span>
                        <span className="hbar-value">{row.efficiency}%</span>
                      </div>
                    </div>
                  ))}
              </div>
            ) : (
              <p className="report-empty">No department data available yet.</p>
            )}
          </section>

          <section className="report-section">
            <h3 className="report-section-title">Department Detail</h3>
            <ReportTable columns={columns} rows={departments.map((row) => ({ ...row, key: row.department }))} />
          </section>
        </>
      )}
    </ReportShell>
  );
}
