/**
 * purchase/components/list/PurchaseSkeleton.jsx
 * ------------------------------------------------------------------
 * Shared table loading skeleton (cpr-skeleton-row / cpr-skeleton-bar,
 * styled by cpr-list.css), extracted from the Purchase Requisition
 * list. Renders `rows` skeleton rows across the given columns.
 * ------------------------------------------------------------------
 */
export function PurchaseSkeletonRow({ columns, selectable = true, hasActions = true, rowIndex = 0 }) {
  return (
    <tr className="cpr-skeleton-row">
      {selectable && <td />}
      {columns.map((col) => (
        <td key={col.key}>
          <div className="cpr-skeleton-bar" style={{ width: `${55 + (rowIndex + col.key.length) % 4 * 10}%` }} />
        </td>
      ))}
      {hasActions && <td className="col-actions" />}
    </tr>
  );
}

export default function PurchaseSkeleton({ rows = 5, columns = [], selectable = true, hasActions = true }) {
  if (!columns.length) return null;
  return (
    <>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <PurchaseSkeletonRow
          key={`skeleton-${rowIndex}`}
          columns={columns}
          selectable={selectable}
          hasActions={hasActions}
          rowIndex={rowIndex}
        />
      ))}
    </>
  );
}