import React from 'react';
import ProductionStatusBadge from './ProductionStatusBadge';
import { formatDateTime } from '../../utils/format';

const COLUMNS = ['Date / Time', 'Action', 'User', 'Previous Status', 'New Status', 'Remarks'];

export default function HistoryTab({ rows }) {
  return (
    <div className="table-scroll">
      {/* Sticky grid (shared Production scope): the leading Date / Time column is
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
          {rows.map((row, index) => (
            <tr key={`${row.action}-${index}`}>
              <td className="sgrid-pin sgrid-first">{formatDateTime(row.date)}</td>
              <td className="cell-strong">{row.action}</td>
              <td>{row.user}</td>
              <td>{row.previousStatus === '—' ? row.previousStatus : <ProductionStatusBadge status={row.previousStatus} />}</td>
              <td>
                <ProductionStatusBadge status={row.newStatus} />
              </td>
              <td className="cell-muted">{row.remarks}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
