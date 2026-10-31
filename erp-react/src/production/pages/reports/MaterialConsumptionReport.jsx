import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import ReportShell from '../../components/production/reports/ReportShell';
import ReportFilters from '../../components/production/reports/ReportFilters';
import ReportSummaryCard from '../../components/production/reports/ReportSummaryCard';
import ReportTable from '../../components/production/reports/ReportTable';
import ProductionProgress from '../../components/production/ProductionProgress';
import { reportService, emptyReportFilters } from '../../services/production/reportService';
import useReportData from '../../hooks/useReportData';

/**
 * Material Consumption.
 *
 * Planned, issued, consumed and remaining quantity per work-order item, from
 * GET /production/reports/material-consumption — which aggregates the persisted
 * production_order_items rows. These figures used to be derived in the browser
 * from the orderDetails demo generator, so they had no database backing at all.
 *
 * The schema has no separate stores-issue record for production: an item's
 * planned quantity is the quantity released to the floor (issued) and its
 * produced quantity is what has been consumed off it.
 */
export default function MaterialConsumptionReport() {
  const location = useLocation();
  const [filters, setFilters] = useState(() => location.state?.filterState || emptyReportFilters());
  const { data, loading, error } = useReportData(reportService.getMaterialConsumption, filters);

  const materials = data?.materials || [];
  const summary = data?.summary || null;

  const columns = [
    { key: 'code', label: 'Material Code', render: (row) => <td className="cell-strong">{row.materialCode}</td> },
    { key: 'name', label: 'Material Name', render: (row) => <td>{row.materialName}</td> },
    { key: 'department', label: 'Department', render: (row) => <td>{row.department}</td> },
    { key: 'unit', label: 'Unit', render: (row) => <td>{row.unit}</td> },
    { key: 'planned', label: 'Planned Quantity', render: (row) => <td>{row.plannedQuantity}</td> },
    { key: 'issued', label: 'Issued Quantity', render: (row) => <td>{row.issuedQuantity}</td> },
    { key: 'consumed', label: 'Consumed Quantity', render: (row) => <td>{row.consumedQuantity}</td> },
    { key: 'remaining', label: 'Remaining Quantity', render: (row) => <td className="cell-strong">{row.remainingQuantity}</td> },
    { key: 'consumption', label: 'Consumption %', render: (row) => <td><ProductionProgress value={row.consumption} /></td> },
  ];

  const exportData = {
    filename: 'material-consumption.csv',
    columns: columns.map((column) => column.label),
    rows: materials.map((row) => [
      row.materialCode,
      row.materialName,
      row.department,
      row.unit,
      row.plannedQuantity,
      row.issuedQuantity,
      row.consumedQuantity,
      row.remainingQuantity,
      `${row.consumption}%`,
    ]),
  };

  return (
    <ReportShell
      activeKey="material-consumption"
      title="Material Consumption"
      description="Issued, consumed and remaining quantities by material."
      exportData={exportData}
      filterState={filters}
    >
      <ReportFilters initial={filters} onApply={setFilters} showDateRange={false} showStatus={false} />

      {error && <p className="report-empty">{error}</p>}
      {!error && loading && <p className="report-empty">Loading report…</p>}

      {!error && !loading && summary && (
        <>
          <div className="report-summary-grid">
            <ReportSummaryCard icon="package" tone="neutral" label="Total Materials" value={summary.totalMaterials} sub="after filters" />
            <ReportSummaryCard icon="clipboard" tone="blue" label="Total Planned" value={summary.totalPlanned} sub="units" />
            <ReportSummaryCard icon="upload" tone="amber" label="Total Issued" value={summary.totalIssued} sub="units released to the floor" />
            <ReportSummaryCard icon="check" tone="green" label="Total Consumed" value={summary.totalConsumed} sub="units in production" />
          </div>

          <section className="report-section">
            <h3 className="report-section-title">Material Detail</h3>
            {materials.length > 0 ? (
              <ReportTable columns={columns} rows={materials.map((material, index) => ({ ...material, key: `${material.materialCode}-${index}` }))} />
            ) : (
              <p className="report-empty">
                No work-order items are recorded yet, so there is nothing to report for material consumption.
              </p>
            )}
          </section>
        </>
      )}
    </ReportShell>
  );
}
