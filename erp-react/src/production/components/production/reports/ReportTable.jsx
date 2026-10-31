import React from 'react';

/**
 * Generic report table. `columns` is [{ key, label, render(row) }];
 * reuses the shared .data-table / .table-scroll ERP styles.
 */
export default function ReportTable({ columns, rows }) {
  if (!rows || rows.length === 0) {
    return (
      <div className="sf-empty">
        <h4>No records match the selected filters</h4>
        <p>Try widening the date range, department or status.</p>
      </div>
    );
  }

  // Sticky grid (shared Production scope): report tables have no Actions column,
  // so only the FIRST column is frozen (left: 0) while the metric columns scroll.
  const firstKey = columns[0]?.key;

  return (
    <div className="table-scroll">
      <table className="data-table sgrid sgrid-prod">
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                className={column.key === firstKey ? 'sgrid-pin sgrid-first' : undefined}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.key ?? index}>
              {columns.map((column) => {
                const cell = column.render(row);
                if (column.key !== firstKey || !React.isValidElement(cell)) {
                  return <React.Fragment key={column.key}>{cell}</React.Fragment>;
                }
                const merged = [cell.props.className, 'sgrid-pin sgrid-first'].filter(Boolean).join(' ');
                return <React.Fragment key={column.key}>{React.cloneElement(cell, { className: merged })}</React.Fragment>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
