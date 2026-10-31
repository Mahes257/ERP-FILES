import React from 'react';
import ProductionStatusBadge from '../ProductionStatusBadge';
import { formatDateTime } from '../../../utils/format';

/**
 * Inspection activity / audit history. Every frontend status change
 * appends an entry in React state (see QualityContext.changeStatus).
 */
export default function QualityHistory({ rows }) {
  if (!rows || rows.length === 0) {
    return (
      <div className="sf-empty">
        <h4>No history recorded</h4>
        <p>Status changes for this inspection will appear here.</p>
      </div>
    );
  }

  return (
    <div className="table-scroll">
      {/* Sticky grid (shared Production scope): the leading Date/Time column stays
          frozen (left: 0) while the audit columns scroll. */}
      <table className="data-table sgrid sgrid-prod">
        <thead>
          <tr>
            <th className="sgrid-pin sgrid-first">Date/Time</th>
            <th>Action</th>
            <th>User</th>
            <th>Previous Status</th>
            <th>New Status</th>
            <th>Remarks</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row.date}-${index}`}>
              <td className="sgrid-pin sgrid-first">{formatDateTime(row.date)}</td>
              <td className="cell-strong">{row.action}</td>
              <td>{row.user}</td>
              <td>{row.previousStatus === '—' ? <span className="cell-muted">—</span> : <ProductionStatusBadge status={row.previousStatus} />}</td>
              <td>
                <ProductionStatusBadge status={row.newStatus} />
              </td>
              <td className="cell-muted">{row.remarks || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
