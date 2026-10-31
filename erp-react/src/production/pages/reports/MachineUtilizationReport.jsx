import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import ReportShell from '../../components/production/reports/ReportShell';
import ReportFilters from '../../components/production/reports/ReportFilters';
import ReportSummaryCard from '../../components/production/reports/ReportSummaryCard';
import ReportTable from '../../components/production/reports/ReportTable';
import ProductionProgress from '../../components/production/ProductionProgress';
import { reportService, emptyReportFilters } from '../../services/production/reportService';
import useReportData from '../../hooks/useReportData';

const chipClass = (status) => {
  if (status === 'Running') return 'chip-running';
  if (status === 'Idle') return 'chip-idle';
  return 'chip-maint';
};

/**
 * Machine Utilization.
 *
 * Available / running / idle / maintenance hours per machine, read from the
 * persisted machine master (Production → Settings → Machines) through
 * GET /production/reports/machine-utilization. The hours used to live in the
 * browser, which is why this report could not be trusted after a reload.
 *
 * The Machine Shop stage entries carry no machine name, so they take no part in
 * this calculation — a machine's utilization is its own recorded hours.
 */
export default function MachineUtilizationReport() {
  const location = useLocation();
  const [filters, setFilters] = useState(() => location.state?.filterState || emptyReportFilters());
  const { data, loading, error } = useReportData(reportService.getMachineUtilization, filters);

  const machines = data?.machines || [];
  const summary = data?.summary || null;

  const columns = [
    { key: 'machine', label: 'Machine', render: (row) => <td className="cell-strong">{row.machine}</td> },
    { key: 'department', label: 'Department', render: (row) => <td>{row.department}</td> },
    { key: 'available', label: 'Available Hours', render: (row) => <td>{row.availableHours}</td> },
    { key: 'running', label: 'Running Hours', render: (row) => <td>{row.runningHours}</td> },
    { key: 'idle', label: 'Idle Hours', render: (row) => <td>{row.idleHours}</td> },
    { key: 'maint', label: 'Maintenance Hours', render: (row) => <td>{row.maintenanceHours}</td> },
    { key: 'utilization', label: 'Utilization %', render: (row) => <td><ProductionProgress value={row.utilization} /></td> },
    { key: 'status', label: 'Status', render: (row) => <td><span className={`chip ${chipClass(row.status)}`}>{row.status}</span></td> },
  ];

  const exportData = {
    filename: 'machine-utilization.csv',
    columns: columns.map((column) => column.label),
    rows: machines.map((row) => [
      row.machine,
      row.department,
      row.availableHours,
      row.runningHours,
      row.idleHours,
      row.maintenanceHours,
      `${row.utilization}%`,
      row.status,
    ]),
  };

  return (
    <ReportShell
      activeKey="machine-utilization"
      title="Machine Utilization"
      description="Available, running, idle and maintenance hours per machine."
      exportData={exportData}
      filterState={filters}
    >
      <ReportFilters initial={filters} onApply={setFilters} showDateRange={false} showStatus={false} />

      {error && <p className="report-empty">{error}</p>}
      {!error && loading && <p className="report-empty">Loading report…</p>}

      {!error && !loading && summary && (
        <>
          <div className="report-summary-grid">
            <ReportSummaryCard icon="settings" tone="neutral" label="Total Machines" value={summary.totalMachines} sub="across selected department" />
            <ReportSummaryCard icon="play" tone="green" label="Running Machines" value={summary.runningMachines} sub="actively producing" />
            <ReportSummaryCard icon="pause" tone="amber" label="Idle Machines" value={summary.idleMachines} sub="awaiting work" />
            <ReportSummaryCard icon="bar-chart" tone="blue" label="Average Utilization" value={`${summary.averageUtilization}%`} sub="running ÷ available hours" />
          </div>

          <section className="report-section">
            <h3 className="report-section-title">Machine Detail</h3>
            {machines.length > 0 ? (
              <ReportTable columns={columns} rows={machines.map((machine, index) => ({ ...machine, key: `${machine.machine}-${index}` }))} />
            ) : (
              <p className="report-empty">
                No machines have been configured yet. Add them in Production → Settings → Machines to see
                utilization here.
              </p>
            )}
          </section>
        </>
      )}
    </ReportShell>
  );
}
