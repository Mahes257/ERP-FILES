import { useRef } from 'react';
import { Archive, ClipboardList, Plus, Search, Trash2, X } from 'lucide-react';
import useStickyColumnLeft from '../../hooks/useStickyColumnLeft';
import { isRowPendingApproval } from '../../utils/pendingApproval';
import { ColumnResizer, useColumnResize } from '../GridColumns';
import { isProtectedColumn } from '../../utils/gridColumns';
// Shared `⇅` sort indicator (components/Common/SortIcon) — one symbol for
// every sortable header in the ERP.
import SortIcon from '../Common/SortIcon';

function EmptyState({ subtab, searchQuery, onClearSearch, onNewCpr, onGoActive, emptyTitle = 'CPR', emptyActionLabel = 'New CPR', foundTitle, foundMessage }) {
  if (subtab === 2) {
    return (
      <div className="text-center px-5 py-14">
        <Trash2 className="w-12 h-12 text-slate-300 mx-auto mb-4" />
        <h3 className="text-base font-bold text-slate-700 mb-1.5">No Deleted {emptyTitle}s</h3>
        <p className="text-xs text-slate-400 mb-5">Your trash is empty. Deleted {emptyTitle}s will appear here.</p>
        <button
          type="button"
          onClick={onGoActive}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-[#0B4A3D] hover:bg-[#083D34] px-4 py-2 rounded-lg transition-colors cursor-pointer"
        >
          Back to Active {emptyTitle}s
        </button>
      </div>
    );
  }

  if (subtab === 1) {
    return (
      <div className="text-center px-5 py-14">
        <Archive className="w-12 h-12 text-slate-300 mx-auto mb-4" />
        <h3 className="text-base font-bold text-slate-700 mb-1.5">No Archived {emptyTitle}s</h3>
        <p className="text-xs text-slate-400">
          {searchQuery ? `No archived ${emptyTitle}s matching your search criteria.` : `Archived ${emptyTitle}s will appear here.`}
        </p>
      </div>
    );
  }

  if (searchQuery) {
    return (
      <div className="text-center px-5 py-14">
        <Search className="w-12 h-12 text-slate-300 mx-auto mb-4" />
        <h3 className="text-base font-bold text-slate-700 mb-1.5">No Matching {emptyTitle}s</h3>
        <p className="text-xs text-slate-400 mb-5">No {emptyTitle}s matching your search criteria.</p>
        <button
          type="button"
          onClick={onClearSearch}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 bg-surface border border-slate-200 px-4 py-2 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
        >
          <X className="w-3.5 h-3.5" /> Clear Search
        </button>
      </div>
    );
  }

  return (
    <div className="text-center px-5 py-14">
      <ClipboardList className="w-12 h-12 text-slate-300 mx-auto mb-4" />
      <h3 className="text-base font-bold text-slate-700 mb-1.5">{foundTitle || `No ${emptyTitle} Found`}</h3>
      <p className="text-xs text-slate-400 mb-5">{foundMessage || `Create your first ${emptyTitle} to get started.`}</p>
      <button
        type="button"
        onClick={onNewCpr}
        className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-[#0B4A3D] hover:bg-[#083D34] px-4 py-2 rounded-lg transition-colors cursor-pointer"
      >
        <Plus className="w-3.5 h-3.5" /> {emptyActionLabel}
      </button>
    </div>
  );
}

function LoadingRows({ columns }) {
  return (
    <>
      {[0, 1, 2, 3, 4].map((row) => (
        <tr key={row}>
          {columns.map((col, index) => (
            <td key={index} className="px-3.5 py-3 border-b border-slate-100">
              <div className="h-3 bg-slate-100 rounded animate-pulse" style={{ width: col.loaderWidth || '70%' }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export default function CprTable({
  columns,
  rows,
  loading,
  subtab,
  searchQuery,
  sortKey,
  sortDir,
  onSort,
  selectedIds,
  onToggleSelect,
  onSelectAll,
  renderCell,
  actionMenu,
  onClearSearch,
  onNewCpr,
  onGoActive,
  emptyTitle = 'CPR',
  emptyActionLabel = 'New CPR',
  stickyKey,
  // Optional table min-width (px) — the horizontal-scroll FLOOR, not the
  // table's width. The table always renders at width:100% so it fills the
  // available content area; when the container is narrower than minWidth the
  // .pr-table-wrap scrolls horizontally (fixed layout keeps the configured
  // column widths, nothing is squeezed or clipped). Extra width beyond the
  // sum of the column widths is distributed proportionally by the browser,
  // so wider viewports get wider columns — never a dead right-side gap.
  minWidth,
  // Optional keys whose cells must never ellipsize/clip their content (e.g.
  // currency amount columns where the full value must stay visible).
  noEllipsisKeys = [],
  // Optional keys whose cells may wrap to multiple lines (long prose values
  // such as item descriptions). Identifiers stay single-line + ellipsis.
  wrapKeys = [],
  // Optional: when provided, every visible column header gets the shared
  // drag-to-resize handle and the committed width is written back through this
  // callback (which persists it — document JSON or the MySQL grid config).
  onColumnsChange,
  // Optional: keys of user-defined columns (their cells come from the caller).
  renderCustomCell,
  // Optional: when true the table's min-width becomes the SUM of the column
  // widths, so widened columns keep their width and the table scrolls
  // horizontally inside .pr-table-wrap. When false the table stays at
  // width:100% and the browser fills the available space (the untouched
  // default), so no dead right-side gap ever appears.
  honorColumnWidths = false
}) {
  const allOnPage = rows.length > 0 && rows.every((row) => selectedIds.has(row.id));
  const someSelected = rows.some((row) => selectedIds.has(row.id));

  // Drag-to-resize for every column (shared engine, so header and body stay
  // perfectly aligned: the widths are written into the SAME <colgroup> the
  // body uses). Serial number / checkbox / Actions stay compact and fixed.
  const resizable = typeof onColumnsChange === 'function';
  const resize = useColumnResize({ columns, onChange: onColumnsChange });

  // Document-number column pinned while the table scrolls horizontally
  // (same sticky-left behaviour as the CRM tables). The checkbox column is
  // pinned at left: 0 and the doc-number column right after it; the offset
  // is measured from the real rendered header widths so hidden columns via
  // the Columns dropdown never misalign the pinned cells. Width is part of
  // the signature so a resize re-measures the pinned offset.
  const headerRowRef = useRef(null);
  const stickyLeft = useStickyColumnLeft({
    headerRowRef,
    stickyKey,
    visibleKeys: columns.map((col) => `${col.key}@${col.width}`),
    // Pin the document-number column directly beside the preceding PINNED
    // column (the checkbox) using that column's real rendered width, even when
    // ordinary columns (e.g. Date) sit between them in the column order — those
    // scroll underneath the pinned area instead of leaving a gap of scrolling
    // content between the two frozen cells.
    precedingStickyOnly: true
  });
  const isStickyCell = (col) => stickyKey && col.key === stickyKey;

  // The table never shrinks below the sum of the configured column widths, so
  // widening a column extends the table and scrolls INSIDE .pr-table-wrap
  // instead of squeezing siblings or scrolling the page.
  const columnWidthOf = (col) => (resizable ? resize.widthOf(col) : col.width);
  const configMinWidth = honorColumnWidths
    ? Math.round(columns.reduce((sum, col) => sum + (Number(columnWidthOf(col)) || 0), 0))
    : 0;
  const effectiveMinWidth = Math.max(Number(minWidth) || 0, configMinWidth);

  return (
    <div className="pr-table-card">
      <div className="pr-table-wrap">
      {/* `sgrid` = the shared sticky data grid (styles/sticky-data-grid.css);
          `sgrid-sales` = this Sales-scope table is opted into its pinning,
          it pins the checkbox, the document number and Actions for every CPR
          / Cost Workout / Profit Workout list. */}
      <table className="pr-table sgrid sgrid-sales" style={{ tableLayout: 'fixed', ...(effectiveMinWidth ? { minWidth: effectiveMinWidth, width: '100%' } : {}) }}>
        <colgroup>
          {columns.map((col) => (
            <col key={col.key} style={{ width: columnWidthOf(col) }} />
          ))}
        </colgroup>
        <thead>
          <tr ref={headerRowRef} className="bg-[#0B4A3D]">
            {columns.map((col) => {
              if (col.key === 'checkbox') {
                return (
                  <th
                    key={col.key}
                    data-sticky-key={col.key}
                    data-sticky-col="true"
                    className={`sgrid-pin sgrid-first text-left h-[52px] px-3.5 font-semibold text-white`}
                  >
                    <input
                      type="checkbox"
                      aria-label="Select all rows"
                      checked={allOnPage}
                      ref={(el) => {
                        if (el) el.indeterminate = someSelected && !allOnPage;
                      }}
                      onChange={(e) => onSelectAll(e.target.checked)}
                      className="accent-emerald-600 w-3.5 h-3.5 cursor-pointer"
                    />
                  </th>
                );
              }
              const active = sortKey === col.key;
              const canResize = resizable && !isProtectedColumn(col);
              return (
                <th
                  key={col.key}
                  scope="col"
                  data-sticky-key={col.key}
                  data-sticky-col={isStickyCell(col) ? 'true' : undefined}
                  aria-sort={
                    col.sortable
                      ? active
                        ? sortDir === 'asc'
                          ? 'ascending'
                          : 'descending'
                        : 'none'
                      : undefined
                  }
                  onClick={col.sortable ? () => onSort(col.key) : undefined}
                  style={isStickyCell(col) ? { left: stickyLeft } : undefined}
                  className={`h-[52px] px-3.5 text-[13px] font-semibold tracking-[0.2px] text-white whitespace-nowrap ${
                    canResize ? 'grid-resizable-th' : ''
                  } ${
                    col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'
                  } ${col.sortable ? 'cursor-pointer select-none hover:text-white' : ''} ${
                    isStickyCell(col)
                      ? 'sgrid-pin'
                      : col.key === 'actions'
                        ? 'sgrid-pin-actions'
                        : ''
                  }`}
                >
                  <span className={`inline-flex items-center ${col.align === 'right' ? 'justify-end' : col.align === 'center' ? 'justify-center' : ''}`}>
                    {col.label}
                    {col.sortable && <SortIcon active={active} />}
                  </span>
                  {canResize && <ColumnResizer column={col} resize={resize} />}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <LoadingRows columns={columns} />
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length}>
                <EmptyState
                  subtab={subtab}
                  searchQuery={searchQuery}
                  onClearSearch={onClearSearch}
                  onNewCpr={onNewCpr}
                  onGoActive={onGoActive}
                  emptyTitle={emptyTitle}
                  emptyActionLabel={emptyActionLabel}
                />
              </td>
            </tr>
          ) : (
            rows.map((row) => {
              // This shared table highlights only the real awaiting-approval
              // states (CPR 'pending approval', CPR Technical Verification
              // 'under verification'). Cost/Profit Workout 'submitted' rows
              // are never pending and have no highlight.
              const pending = isRowPendingApproval(row.status);
              return (
              <tr
                key={row.id}
                className="group transition-colors hover:bg-[#E8F0EE]"
              >
                {columns.map((col) => {
                  if (col.key === 'checkbox') {
                    return (
                      <td
                        key={col.key}
                        data-sticky-col="true"
                        className="sgrid-pin sgrid-first px-3.5 py-3 border-b border-slate-100"
                      >
                        <input
                          type="checkbox"
                          checked={selectedIds.has(row.id)}
                          onChange={(e) => onToggleSelect(row.id, e.target.checked)}
                          aria-label={`Select ${row.prNo}`}
                          className="accent-emerald-600 w-3.5 h-3.5 cursor-pointer"
                        />
                      </td>
                    );
                  }
                  if (col.key === 'actions') {
                    return (
                      <td
                        key={col.key}
                        className="sgrid-pin-actions px-3.5 py-3 text-center border-b border-slate-100"
                      >
                        {actionMenu(row)}
                      </td>
                    );
                  }
                  if (!col.system && renderCustomCell) {
                    return (
                      <td
                        key={col.key}
                        className="px-3.5 py-3 text-[13px] text-slate-600 border-b border-slate-100"
                      >
                        {renderCustomCell(col, row)}
                      </td>
                    );
                  }
                  return (
                    <td
                      key={col.key}
                      data-sticky-col={isStickyCell(col) ? 'true' : undefined}
                      className={`px-3.5 py-3 text-[13px] text-slate-600 border-b border-slate-100 ${
                        col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'
                      } ${
                        isStickyCell(col)
                          ? `sgrid-pin ${pending ? 'po-cpr-pending-highlight' : ''}`
                          : ''
                      }`}
                      style={{
                        ...(isStickyCell(col) ? { left: stickyLeft } : {}),
                        ...(noEllipsisKeys.includes(col.key)
                          ? { whiteSpace: 'nowrap' }
                          : wrapKeys.includes(col.key)
                            ? { whiteSpace: 'normal', overflowWrap: 'break-word' }
                            : { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })
                      }}
                    >
                          {renderCell(col.key, row)}
                    </td>
                  );
                })}
              </tr>
              );
            })
          )}
        </tbody>
      </table>
      </div>
    </div>
  );
}
