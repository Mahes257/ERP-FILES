import React from 'react';
import { Link } from 'react-router-dom';
import { textCell, qtyCell, pendingCell, timeCell, statusCell, progressCell } from './columnCells';
import './ShopFloorTable.css';

/**
 * Column-driven shop floor table. Column names are mapped to
 * shared cell renderers; 'Work Order' renders as a link to the
 * Work Order detail page (jobs reference the Work Order via their
 * `productionOrder` field — migrated from the old PO number).
 */
export default function ShopFloorTable({ jobs, columns, renderActions }) {
  const renderCell = (column, job) => {
    switch (column) {
      case 'Stage':
      case 'Assembly Task':
        return textCell(job.stage ?? job.assemblyTask);
      case 'Work Order':
        return (
          <td className="cell-strong">
            <Link className="po-link" to={`/production/orders/${job.productionOrder}`}>
              {job.productionOrder}
            </Link>
          </td>
        );
      case 'Item Name':
        return textCell(job.product);
      case 'Machine':
        return textCell(job.machine);
      case 'Planned Qty':
        return qtyCell(job.plannedQuantity);
      case 'Completed Qty':
        return qtyCell(job.completedQuantity);
      case 'Rejected Qty':
        return qtyCell(job.rejectedQuantity ?? 0);
      case 'Pending Qty':
        return pendingCell(job);
      case 'Operator':
        return textCell(job.operator);
      case 'Start Time':
        return timeCell(job.startTime);
      case 'End Time':
        return timeCell(job.endTime);
      case 'Status':
        return statusCell(job.status);
      case 'Progress':
        return progressCell(job.progress);
      case 'Action':
      case 'Actions':
        return <td>{renderActions ? renderActions(job) : null}</td>;
      default:
        return null;
    }
  };

  // Sticky grid (shared Production scope): this per-job table has no selection
  // column, so the FIRST column is frozen at left: 0 and (when the board declares
  // one) the trailing Action(s) column is frozen at right: 0.
  const firstColumn = columns[0];
  const actionsColumn = columns.find((c) => c === 'Action' || c === 'Actions') || null;
  const stickyClass = (column) =>
    column === firstColumn ? 'sgrid-pin sgrid-first'
      : actionsColumn && column === actionsColumn ? 'sgrid-pin-actions'
        : '';

  return (
    <div className="table-scroll">
      <table className={`data-table sgrid sgrid-prod${actionsColumn ? ' sgrid-actions' : ''}`}>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column} className={stickyClass(column) || undefined}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => (
            <tr key={job.id}>
              {columns.map((column) => {
                const cell = renderCell(column, job);
                const sticky = stickyClass(column);
                if (!sticky || !React.isValidElement(cell)) {
                  return <React.Fragment key={column}>{cell}</React.Fragment>;
                }
                const merged = [cell.props.className, sticky].filter(Boolean).join(' ');
                return <React.Fragment key={column}>{React.cloneElement(cell, { className: merged })}</React.Fragment>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
