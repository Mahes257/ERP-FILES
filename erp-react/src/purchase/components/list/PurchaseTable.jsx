/**
 * purchase/components/list/PurchaseTable.jsx
 * ------------------------------------------------------------------
 * Shared table shell for Purchase list pages (pr-table-card /
 * pr-table-wrap / pr-table / cpr-* classes, styled by cpr-list.css),
 * extracted from the Purchase Requisition list. Handles the colgroup,
 * sticky-thead headers with sort affordances, optional selection
 * checkboxes, a trailing Actions column fed by `rowActions`, loading
 * skeletons, empty/error content and optional expandable rows.
 *
 * Props:
 *   columns        full visible column defs (may include the 'actions'
 *                  column; it is excluded from data columns)
 *   rows           data rows
 *   getRowId       (row) => id
 *   loading        whether to render skeleton rows
 *   skeletonRows   count of skeleton rows (default 5)
 *   selectable     render the selection checkbox column (default true)
 *   selectedIds, allSelected, someSelected,
 *   onSelectAll, onToggleRow              selection wiring (omit when
 *     selectable is false)
 *   sortKey, sortDirection, onSort        header sort wiring (omit to
 *     make headers plain)
 *   renderers      { colKey: (row) => node }; falls back to raw value
 *   statusDotTone  optional string OR (row) => tone — when set, renders a
 *                  small workflow status dot next to the row. The tone
 *                  comes from the shared semantic map
 *                  (utils/statusTone: green / orange / red / blue /
 *                  gray) so the dot ALWAYS matches the status badge
 *                  color — pages gate it to pending / action-required
 *                  rows via utils/pendingStatus. In selectable tables it
 *                  sits after the selection checkbox inside the same
 *                  selection column; in non-selectable tables it renders
 *                  at the start of the id column cell.
 *   rowClass       optional (row) => string — an extra class applied to
 *                  the row's <tr> (e.g. a status-tinted row highlight;
 *                  pages gate it to the exact status they want to tint).
 *                  Combined with the existing is-selected class.
 *   idColumn       key treated as the document id cell (default 'prNo')
 *   alignCenter    col keys to center in data cells (default ['priority','status'])
 *   alignRight     col keys to right-align in data cells (default ['amount'])
 *   colClass       (key) => className override (defaults to col-<key>)
 *   rowActions     fn(row) => action array OR null; renders Actions column
 *   onRowAction    fn(key, row)
 *   actionMenuLabel per-row menu button aria-label override
 *   emptyContent   node rendered in the empty cell (full colSpan)
 *   onRowClick     fn(row) for clickable rows
 *   renderExpandedRow fn(row) => node OR null (expandable rows)
 *   tableId        id attribute for the <table>
 *   wrapMaxHeight  optional maxHeight for the scroll wrapper
 *   growWrap       opt-in natural-height wrap: removes the shared
 *                  max-height / internal vertical scroll so the table
 *                  grows with its rows and only the page scrolls.
 *                  Horizontal scrolling is kept for narrow screens.
 *                  (Opposite of wrapMaxHeight; wins if both are set.)
 *   footer         optional node rendered inside pr-table-card, right
 *                  after the scroll wrapper (e.g. PurchasePagination)
 *   density        'comfortable' (default) | 'compact' | 'relaxed' —
 *                  row padding presets (opt-in; existing pages keep the
 *                  default rendering).
 *   onRowKeydown   fn(event, row) — keyboard hook for arrow-key row
 *                  navigation (opt-in).
 * ------------------------------------------------------------------
 */
import { ChevronsUpDown } from 'lucide-react';
import PurchaseRowActions from './PurchaseRowActions';
import PurchaseSkeleton from './PurchaseSkeleton';

const EMPTY = [];

export default function PurchaseTable({
  columns,
  rows = EMPTY,
  getRowId = (row) => row?.id,
  loading = false,
  skeletonRows = 5,
  selectable = true,
  selectedIds = EMPTY,
  allSelected = false,
  someSelected = false,
  onSelectAll,
  onToggleRow,
  sortKey,
  sortDirection,
  onSort,
  renderers = {},
  statusDotTone,
  rowClass,
  idColumn = 'prNo',
  alignCenter = ['priority', 'status'],
  alignRight = ['amount'],
  colClass,
  rowActions,
  onRowAction,
  actionMenuLabel,
  emptyContent,
  onRowClick,
  renderExpandedRow,
  selectedRowId,
  tableId,
  wrapMaxHeight,
  growWrap,
  footer,
  density = 'comfortable',
  onRowKeydown
}) {
  const dataColumns = columns.filter((col) => col.key !== 'actions');

  const wrapStyle = growWrap
    ? { maxHeight: 'none', overflow: 'auto', scrollbarGutter: 'auto' }
    : wrapMaxHeight
      ? { maxHeight: wrapMaxHeight }
      : undefined;
  const hasActions = Boolean(rowActions) || columns.some((col) => col.key === 'actions');

  const resolveClass = colClass || ((key) => (key === idColumn ? `col-${idColumn} col-doc-id` : `col-${key}`));

  const cellAlign = (key) =>
    alignRight.includes(key) ? { textAlign: 'right' } : alignCenter.includes(key) ? { textAlign: 'center' } : undefined;

  const colSpan = dataColumns.length + (selectable ? 1 : 0) + (hasActions ? 1 : 0);

  return (
    <div className={`pr-table-card${density !== 'comfortable' ? ` pr-table-density-${density}` : ''}`}>
      <div className="pr-table-wrap" style={wrapStyle}>
        <table className="pr-table" id={tableId} style={{ tableLayout: 'fixed' }}>
          <colgroup>
            {selectable && <col className="col-checkbox" style={{ width: 50 }} />}
            {dataColumns.map((col) => (
              <col key={col.key} className={resolveClass(col.key)} style={{ width: col.width }} />
            ))}
            {hasActions && <col className="col-actions" style={{ width: 96 }} />}
          </colgroup>
          <thead>
            <tr>
              {selectable && (
                <th className="checkbox-cell" scope="col">
                  <input
                    type="checkbox"
                    id="prSelectAll"
                    checked={allSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someSelected;
                    }}
                    onChange={(e) => onSelectAll && onSelectAll(e.target.checked)}
                    aria-label="Select all rows"
                  />
                </th>
              )}
              {dataColumns.map((col) => {
                const sorted = onSort && sortKey === col.key;
                const style =
                  col.align === 'right'
                    ? { textAlign: 'right' }
                    : col.align === 'center'
                      ? { textAlign: 'center' }
                      : undefined;
                return (
                  <th
                    key={col.key}
                    scope="col"
                    data-sort={onSort && col.sortable ? col.key : undefined}
                    className={`${resolveClass(col.key)} ${col.key === idColumn ? 'table-id-cell' : ''} ${sorted ? (sortDirection === 'asc' ? 'sort-asc' : 'sort-desc') : ''}`}
                    style={style}
                    onClick={() => onSort && col.sortable && onSort(col.key)}
                  >
                    {col.label}
                    {onSort && col.sortable && <ChevronsUpDown size={12} className="sort-icon" aria-hidden="true" />}
                  </th>
                );
              })}
              {hasActions && <th className="col-actions" scope="col" style={{ textAlign: 'center' }}>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <PurchaseSkeleton rows={skeletonRows} columns={dataColumns} selectable={selectable} hasActions={hasActions} />
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={colSpan}>{emptyContent}</td>
              </tr>
            ) : (
              rows.map((row) => (
                <FragmentRow
                  key={getRowId(row)}
                  row={row}
                  id={getRowId(row)}
                  selectedRowId={selectedRowId}
                  selectable={selectable}
                  selected={selectedIds && selectedIds.includes(getRowId(row))}
                  onToggleRow={onToggleRow}
                  statusDotTone={statusDotTone}
                  rowClass={rowClass}
                  dataColumns={dataColumns}
                  resolveClass={resolveClass}
                  cellAlign={cellAlign}
                  renderers={renderers}
                  hasActions={hasActions}
                  rowActions={rowActions}
                  onRowAction={onRowAction}
                  actionMenuLabel={actionMenuLabel}
                  onRowClick={onRowClick}
                  renderExpandedRow={renderExpandedRow}
                  onRowKeydown={onRowKeydown}
                  idColumn={idColumn}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
      {footer}
    </div>
  );
}

function FragmentRow({
  row,
  id,
  selectedRowId,
  selectable,
  selected,
  onToggleRow,
  statusDotTone,
  rowClass,
  dataColumns,
  resolveClass,
  cellAlign,
  renderers,
  hasActions,
  rowActions,
  onRowAction,
  actionMenuLabel,
  onRowClick,
  renderExpandedRow,
  onRowKeydown,
  idColumn = 'prNo'
}) {
  const expanded = renderExpandedRow ? renderExpandedRow(row) : null;
  const isRowSelected = selectedRowId != null && selectedRowId === id;
  /* Resolve the optional status-dot tone once per row; `null` means no dot
     (e.g. Archived / Deleted rows have no workflow state). */
  const dotTone = statusDotTone
    ? typeof statusDotTone === 'function'
      ? statusDotTone(row) || null
      : statusDotTone
    : null;
  return (
    <>
      <tr
        className={`${rowClass ? rowClass(row) || '' : ''}${isRowSelected ? ' is-selected' : ''}`.trim()}
        tabIndex={onRowKeydown ? 0 : undefined}
        aria-selected={onRowKeydown ? isRowSelected || selected : undefined}
        onClick={() => onRowClick && onRowClick(row)}
        onKeyDown={onRowKeydown ? (e) => onRowKeydown(e, row) : undefined}
      >
        {selectable && (
          <td className="checkbox-cell">
            <span className="pr-checkbox-wrap">
              <input
                type="checkbox"
                className="pr-row-chk"
                checked={Boolean(selected)}
                onChange={() => onToggleRow && onToggleRow(id)}
                onClick={(e) => e.stopPropagation()}
              />
              {dotTone && <span className={`pr-row-status-dot ${dotTone}`} aria-hidden="true" />}
            </span>
          </td>
        )}
        {dataColumns.map((col) => (
          <td key={col.key} className={resolveClass(col.key)} style={cellAlign(col.key)}>
            {/* Non-selectable tables have no checkbox column, so the
                pending dot renders at the start of the id cell instead
                (keeps the dot at the beginning of the row). */}
            {!selectable && dotTone && col.key === idColumn && (
              <span className={`pr-row-status-dot pr-row-status-dot--inline ${dotTone}`} aria-hidden="true" />
            )}
            {renderers[col.key] ? renderers[col.key](row) : String(row[col.key] ?? '—')}
          </td>
        ))}
        {hasActions && (
          <td className="col-actions" style={{ textAlign: 'center', whiteSpace: 'nowrap', overflow: 'visible' }}>
            <PurchaseRowActions
              actions={rowActions ? rowActions(row) : []}
              onSelect={(key) => onRowAction && onRowAction(key, row)}
              buttonLabel={actionMenuLabel}
            />
          </td>
        )}
      </tr>
      {expanded && (
        <tr className="expand-row">
          <td colSpan={dataColumns.length + (selectable ? 1 : 0) + (hasActions ? 1 : 0)}>{expanded}</td>
        </tr>
      )}
    </>
  );
}