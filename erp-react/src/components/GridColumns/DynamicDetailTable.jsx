/**
 * DynamicDetailTable — the ONE read-only detail table used by every Sales &
 * Marketing View / Preview surface.
 * ---------------------------------------------------------------------
 * It renders exactly the columns it is handed (which come from the SAME
 * persisted configuration the editable grid uses), in the saved order, with
 * the saved labels — nothing is hardcoded per page.
 *
 *   · widths follow the saved configuration; a column the user widened in the
 *     form is proportionally wider here too,
 *   · the table keeps a min-width equal to the sum of its columns and scrolls
 *     horizontally inside its own wrapper when there are many columns — it
 *     never clips data and never scrolls the page,
 *   · long values wrap instead of being cut off,
 *   · user-defined columns resolve their per-row saved value automatically.
 */
import { resolveDetailValue } from '../../utils/detailColumns';

const ALIGN_CLASS = {
  right: 'text-right',
  center: 'text-center',
  left: 'text-left'
};

const ALIGN_STYLE = {
  right: { textAlign: 'right' },
  center: { textAlign: 'center' },
  left: { textAlign: 'left' }
};

export default function DynamicDetailTable({
  columns = [],
  rows = [],
  resolve,
  ctx,
  /** Class applied to the <table> (reuse the page's existing table styling). */
  className = '',
  /** Class applied to the horizontal-scroll wrapper. */
  wrapClassName = 'qpo-table-wrap',
  /** Inline style merged onto the <table> (e.g. an existing min-width). */
  tableStyle,
  /** Minimum width floor in px (the existing page min-width, when any). */
  minWidth,
  /** Extra row rendered in <tfoot> (totals etc.). Receives the column count. */
  footer,
  emptyText = 'No records',
  /** Sentence-case noun for the empty state ("items", "details"). */
  emptyNoun = 'records',
  headerCellClass = '',
  bodyCellClass = '',
  rowKey = (row, i) => row.id ?? i,
  /**
   * Optional per-row class. Used by version comparison to tint ONLY the rows
   * that changed in the revision on screen; every normal view passes nothing,
   * so a read-only table renders exactly as before.
   */
  rowClassName = null,
  /**
   * Optional width resolver — lets an interactive surface (the Overview page's
   * Manage Columns + drag-to-resize) hand over the LIVE width of a column,
   * including the value being dragged. Defaults to the saved configuration.
   */
  resolveWidth,
  /**
   * Optional extra node rendered inside each header cell, after the label —
   * e.g. the drag-to-resize handle. Keeps the resize behaviour identical to
   * the editable grids instead of duplicating a second table implementation.
   */
  headerExtra
}) {
  const list = Array.isArray(rows) ? rows : [];
  const cols = Array.isArray(columns) ? columns : [];
  const widthFor = (col) => (resolveWidth ? resolveWidth(col) : col.width);

  // Widths come straight from the saved configuration; columns without one are
  // auto-sized by the browser (auto-layout grids keep their proportions).
  const declaredWidth = cols.reduce((sum, c) => sum + (Number(widthFor(c)) || 0), 0);
  const requiredWidth = Math.max(Number(minWidth) || 0, declaredWidth);

  if (cols.length === 0) {
    return (
      <div className={wrapClassName}>
        <div className="py-8 text-center text-xs text-slate-400">{emptyText}</div>
      </div>
    );
  }

  return (
    <div className={wrapClassName}>
      <table
        className={className}
        style={{
          tableLayout: 'fixed',
          width: '100%',
          ...(requiredWidth ? { minWidth: requiredWidth } : {}),
          ...tableStyle
        }}
      >
        <colgroup>
          {cols.map((col) => {
            const w = widthFor(col);
            return <col key={col.id} style={w ? { width: w } : undefined} />;
          })}
        </colgroup>
        <thead>
          <tr>
            {cols.map((col) => (
              <th
                key={col.id}
                scope="col"
                className={`grid-resizable-th ${headerCellClass} ${ALIGN_CLASS[col.align] || ''} whitespace-nowrap`.trim()}
                style={ALIGN_STYLE[col.align]}
              >
                {col.label}
                {headerExtra ? headerExtra(col) : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {list.length === 0 ? (
            <tr>
              <td colSpan={cols.length} className="py-8 text-center text-xs text-slate-400">
                No {emptyNoun}
              </td>
            </tr>
          ) : (
            list.map((row, rowIndex) => (
              <tr
                key={rowKey(row, rowIndex)}
                className={rowClassName ? rowClassName(row, rowIndex) : undefined}
              >
                {cols.map((col) => {
                  const value = resolve
                    ? resolve(col, row, ctx)
                    : resolveDetailValue(col, row, ctx);
                  return (
                    <td
                      key={col.id}
                      className={`${bodyCellClass} ${ALIGN_CLASS[col.align] || ''}`.trim()}
                      style={{ whiteSpace: 'normal', overflowWrap: 'anywhere', ...ALIGN_STYLE[col.align] }}
                    >
                      {value === '' || value === null || value === undefined ? '—' : value}
                    </td>
                  );
                })}
              </tr>
            ))
          )}
        </tbody>
        {footer ? <tfoot>{footer(cols.length, cols)}</tfoot> : null}
      </table>
    </div>
  );
}
