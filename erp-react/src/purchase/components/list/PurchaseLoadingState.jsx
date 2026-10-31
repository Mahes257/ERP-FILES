/**
 * purchase/components/list/PurchaseLoadingState.jsx
 * ------------------------------------------------------------------
 * Shared whole-list loading placeholder (pr-table-card / cpr-skeleton-
 * row restyled via cpr-list.css). Used on pages that show a full
 * skeleton before any data is available (e.g. the review page).
 * ------------------------------------------------------------------
 */
import { PurchaseSkeletonRow } from './PurchaseSkeleton';

export default function PurchaseLoadingState({ rows = 6, columns = [], selectable = false, hasActions = true }) {
  const dataColumns = columns.filter((col) => col.key !== 'actions');
  return (
    <div className="pr-table-card">
      <div className="pr-table-wrap">
        <table className="pr-table" style={{ tableLayout: 'fixed' }}>
          <colgroup>
            {selectable && <col className="col-checkbox" style={{ width: 50 }} />}
            {dataColumns.map((col) => (
              <col key={col.key} className={`col-${col.key}`} style={{ width: col.width }} />
            ))}
            {hasActions && <col className="col-actions" style={{ width: 96 }} />}
          </colgroup>
          <tbody>
            {Array.from({ length: rows }).map((_, rowIndex) => (
              <PurchaseSkeletonRow
                key={`loading-${rowIndex}`}
                columns={dataColumns}
                selectable={selectable}
                hasActions={hasActions}
                rowIndex={rowIndex}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}