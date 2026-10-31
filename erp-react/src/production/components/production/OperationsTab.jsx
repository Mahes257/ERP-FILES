import React from 'react';
import ProductionStatusBadge from './ProductionStatusBadge';
import ProductionProgress from './ProductionProgress';
import { formatDateTime } from '../../utils/format';

const COLUMNS = [
  'Operation',
  'Department',
  'Planned Qty',
  'Completed Qty',
  'Start Time',
  'End Time',
  'Operator',
  'Status',
  'Progress',
];

export default function OperationsTab({ operations }) {
  return (
    <div className="table-scroll">
      {/* Sticky grid (shared Production scope): the leading Operation column is
          frozen (left: 0) while the remaining columns scroll. */}
      <table className="data-table sgrid sgrid-prod">
        <thead>
          <tr>
            {COLUMNS.map((column) => (
              <th key={column} className={column === COLUMNS[0] ? 'sgrid-pin sgrid-first' : undefined}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {operations.map((op) => (
            <tr key={op.operation}>
              <td className="cell-strong sgrid-pin sgrid-first">{op.operation}</td>
              <td>{op.department}</td>
              <td>{op.plannedQuantity}</td>
              <td>{op.completedQuantity}</td>
              <td>{formatDateTime(op.startTime)}</td>
              <td>{formatDateTime(op.endTime)}</td>
              <td>{op.operator}</td>
              <td>
                <ProductionStatusBadge status={op.status} />
              </td>
              <td>
                <ProductionProgress value={op.progress} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
