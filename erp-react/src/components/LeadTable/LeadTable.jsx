import { useEffect, useMemo, useRef, useCallback, memo } from 'react';
import {
  X, AlertTriangle, RefreshCw, ChevronLeft, ChevronRight
} from 'lucide-react';
import ActionMenu from '../Common/ActionMenu';
// Shared `⇅` sort indicator (components/Common/SortIcon) — one symbol for
// every sortable header in the ERP.
import SortIcon from '../Common/SortIcon';
import { PAGE_SIZE_OPTIONS } from '../../utils/leadConstants';
import { getCellValue } from '../../utils/leadHelpers';

const SELECT_COLUMN_WIDTH = 48;

const BULK_VARIANTS = {
  danger: 'bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20',
  default: 'bg-[#334155] hover:bg-[#475569] text-white border border-[#475569]'
};

function TableRow({
  row,
  rowId,
  layout,
  selectable,
  isChecked,
  onSelectionChange,
  renderers,
  rowActions,
  onRowAction
}) {
  const actions = typeof rowActions === 'function' ? rowActions(row) : rowActions;
  const stickyCellBg = isChecked ? 'bg-emerald-500/10' : 'bg-surface';
  const cells = [];

  if (selectable) {
    cells.push(
      <td key="__select" className={`p-4 text-center sticky left-0 z-30 ${stickyCellBg} hover:bg-slate-50/70 transition-colors`}>
        <input
          type="checkbox"
          checked={isChecked}
          onChange={() => onSelectionChange?.(rowId)}
          className="w-4 h-4 accent-emerald-600 cursor-pointer rounded"
        />
      </td>
    );
  }

  layout.forEach((col) => {
    const style = { minWidth: col.width || 120 };
    if (col.leftOffset !== undefined) style.left = col.leftOffset;
    if (col.rightOffset !== undefined) style.right = col.rightOffset;
    const isSticky = col.sticky === 'left' || col.sticky === 'right';
    const alignClass = col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : '';
    const cellClass = isSticky
      ? `sticky z-30 ${stickyCellBg} hover:bg-slate-50/70`
      : '';
    cells.push(
      <td key={col.key} style={style} className={`p-4 ${cellClass} ${alignClass}`}>
        {col.key === 'actions' ? (
          <div className="inline-block">
            <ActionMenu
              items={actions}
              onAction={(key) => onRowAction?.(key, row)}
              buttonLabel="Row actions"
              triggerClassName="erp-row-action-btn"
              menuClassName="bg-surface border border-slate-200 rounded-lg shadow-lg py-1 overflow-y-auto font-medium text-left"
            />
          </div>
        ) : renderers[col.key] ? (
          renderers[col.key](row)
        ) : (
          getCellValue(row, col.key)
        )}
      </td>
    );
  });

  return (
    <tr className={`group hover:bg-slate-50/70 transition-colors ${isChecked ? 'bg-emerald-500/10' : ''}`}>
      {cells}
    </tr>
  );
}

const MemoizedTableRow = memo(TableRow);

export default function LeadTable({
  columns,
  data = [],
  loading = false,
  error = null,
  sortKey = '',
  sortDirection = 'asc',
  onSort,
  pagination,
  onPageChange,
  onPageSizeChange,
  selectedIds = [],
  onSelectionChange,
  selectable = true,
  renderers = {},
  rowActions = [],
  onRowAction,
  bulkActions = [],
  onBulkAction,
  bulkBarExtra = null,
  selectedLabel = 'lead(s)',
  onRetry,
  emptyMessage = 'No records found matching your criteria.',
  errorMessage = 'Failed to load records. Please try again.',
  maxHeight = 560,
  skeletonRows = 8,
  getRowId = (row) => row.id
}) {
  const selectAllRef = useRef(null);
  const selectedIdsRef = useRef(selectedIds);

  useEffect(() => {
    selectedIdsRef.current = selectedIds;
  }, [selectedIds]);

  const handleRowToggle = useCallback(
    (rowId) => {
      const current = selectedIdsRef.current;
      onSelectionChange?.(
        current.includes(rowId)
          ? current.filter((id) => id !== rowId)
          : [...current, rowId]
      );
    },
    [onSelectionChange]
  );

  const visibleColumns = useMemo(() => columns.filter((col) => col.visible !== false), [columns]);

  const layout = useMemo(() => {
    const leftLayout = visibleColumns.reduce(
      (acc, col) => {
        if (col.sticky === 'left') {
          return {
            cols: [...acc.cols, { ...col, leftOffset: acc.leftOffset }],
            leftOffset: acc.leftOffset + (col.width || 0)
          };
        }
        return { cols: [...acc.cols, col], leftOffset: acc.leftOffset };
      },
      { cols: [], leftOffset: selectable ? SELECT_COLUMN_WIDTH : 0 }
    );

    return leftLayout.cols.reduceRight(
      (acc, col) => {
        if (col.sticky === 'right') {
          return {
            cols: [{ ...col, rightOffset: acc.rightOffset }, ...acc.cols],
            rightOffset: acc.rightOffset + (col.width || 0)
          };
        }
        return { cols: [col, ...acc.cols], rightOffset: acc.rightOffset };
      },
      { cols: [], rightOffset: 0 }
    ).cols;
  }, [visibleColumns, selectable]);

  const colCount = layout.length + (selectable ? 1 : 0);
  const { page = 1, pageSize = 10, totalPages = 1 } = pagination || {};

  const isAllSelected = data.length > 0 && data.every((row) => selectedIds.includes(getRowId(row)));
  const isSomeSelected = data.some((row) => selectedIds.includes(getRowId(row)));

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = isSomeSelected && !isAllSelected;
    }
  }, [isAllSelected, isSomeSelected]);

  const handleSelectAll = (e) => {
    if (!onSelectionChange) return;
    if (e.target.checked) {
      onSelectionChange(data.map(getRowId));
    } else {
      onSelectionChange([]);
    }
  };

  // Same `⇅` glyph on every sortable column — the current sort direction is
  // conveyed through `aria-sort` on the <th>, not by a second icon.
  const renderSortIcon = (col) => <SortIcon active={sortKey === col.key} />;

  const renderHeader = () => {
    const cells = [];
    if (selectable) {
      cells.push(
        <th key="__select" className="p-4 w-12 text-center sticky left-0 z-50 bg-header">
          <input
            ref={selectAllRef}
            type="checkbox"
            onChange={handleSelectAll}
            checked={isAllSelected}
            className="w-4 h-4 accent-emerald-600 cursor-pointer rounded"
          />
        </th>
      );
    }
    layout.forEach((col) => {
      const style = { minWidth: col.width || 120 };
      if (col.leftOffset !== undefined) style.left = col.leftOffset;
      if (col.rightOffset !== undefined) style.right = col.rightOffset;
      const isSticky = col.sticky === 'left' || col.sticky === 'right';
      const alignClass = col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : '';
      cells.push(
        <th
          key={col.key}
          style={style}
          aria-sort={
            col.sortable
              ? sortKey === col.key
                ? sortDirection === 'asc'
                  ? 'ascending'
                  : 'descending'
                : 'none'
              : undefined
          }
          className={`p-4 font-semibold uppercase tracking-wider text-[11px] ${alignClass} ${isSticky ? 'sticky z-50 bg-header' : ''}`}
        >
          {col.sortable ? (
            <button
              onClick={() => onSort?.(col.key)}
              className="inline-flex items-center uppercase tracking-wider cursor-pointer hover:text-white transition-colors"
            >
              {col.label}
              {renderSortIcon(col)}
            </button>
          ) : (
            col.label
          )}
        </th>
      );
    });
    return cells;
  };

  const renderSkeleton = () =>
    Array.from({ length: Math.min(skeletonRows, 8) }, (_, index) => (
      <tr key={`skeleton-${index}`} className="border-b border-slate-100">
        {selectable && (
          <td className="p-4 text-center sticky left-0 z-30 bg-surface">
            <div className="w-4 h-4 mx-auto rounded bg-slate-200 animate-pulse" />
          </td>
        )}
        {layout.map((col) => {
          const style = { minWidth: col.width || 120 };
          if (col.leftOffset !== undefined) style.left = col.leftOffset;
          if (col.rightOffset !== undefined) style.right = col.rightOffset;
          const isSticky = col.sticky === 'left' || col.sticky === 'right';
          const alignClass = col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : '';
          return (
            <td key={col.key} style={style} className={`p-4 ${alignClass} ${isSticky ? 'sticky z-30 bg-surface' : ''}`}>
              <div className={`h-3 bg-slate-200 rounded animate-pulse ${col.align === 'center' ? 'mx-auto w-16' : 'w-24'}`} />
            </td>
          );
        })}
      </tr>
    ));

  const renderEmpty = () => (
    <tr>
      <td colSpan={colCount} className="p-12 text-center text-slate-400 font-medium">
        {emptyMessage}
      </td>
    </tr>
  );

  const renderError = () => (
    <tr>
      <td colSpan={colCount} className="p-12 text-center">
        <div className="flex flex-col items-center gap-3">
          <AlertTriangle className="w-8 h-8 text-rose-300" />
          <span className="text-slate-500 font-medium">{errorMessage}</span>
          {onRetry && (
            <button
              onClick={onRetry}
              className="flex items-center gap-1.5 text-xs font-bold text-white bg-[#0B4A3D] hover:bg-[#083D34] px-3 py-2 rounded-lg transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Retry
            </button>
          )}
        </div>
      </td>
    </tr>
  );

  const renderPagination = () => (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-slate-200 bg-slate-50/60">
      <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
        <span>Rows per page</span>
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange?.(Number(e.target.value))}
          className="bg-surface border border-slate-200 rounded-md px-2 py-1 text-xs text-slate-700 outline-none cursor-pointer"
        >
          {PAGE_SIZE_OPTIONS.map((size) => (
            <option key={size} value={size}>{size}</option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange?.(page - 1)}
          disabled={page <= 1}
          className="p-1.5 rounded-lg border border-slate-200 bg-surface text-slate-500 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
          aria-label="Previous page"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
        {Array.from({ length: totalPages }, (_, index) => index + 1).map((item) => (
          <button
            key={item}
            onClick={() => onPageChange?.(item)}
            className={`min-w-7 px-2 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
              item === page ? 'bg-[#0B4A3D] text-white' : 'bg-surface border border-slate-200 text-slate-600 hover:bg-slate-100'
            }`}
          >
            {item}
          </button>
        ))}
        <button
          onClick={() => onPageChange?.(page + 1)}
          disabled={page >= totalPages}
          className="p-1.5 rounded-lg border border-slate-200 bg-surface text-slate-500 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
          aria-label="Next page"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );

  return (
    <>
      {selectable && selectedIds.length > 0 && (
        <div className="bg-[#0f172a] text-white rounded-xl p-3 flex flex-col sm:flex-row items-center justify-between gap-4 mb-4 shadow-lg">
          <div className="text-xs font-bold pl-2 flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
              {selectedIds.length}
            </span>
            {selectedLabel} selected
          </div>
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            {bulkActions.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.key}
                  onClick={() => onBulkAction?.(action.key, selectedIds)}
                  className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg transition-colors cursor-pointer ${BULK_VARIANTS[action.variant] || BULK_VARIANTS.default}`}
                >
                  <Icon className="w-3.5 h-3.5" /> {action.label}
                </button>
              );
            })}
            {bulkBarExtra}
            <button
              onClick={() => onSelectionChange?.([])}
              className="flex items-center justify-center gap-1.5 bg-transparent hover:bg-[#334155] text-slate-300 text-xs font-bold px-2 py-2 rounded-lg transition-colors cursor-pointer"
              aria-label="Clear selection"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <div className="bg-surface border border-slate-200 rounded-xl shadow-sm overflow-hidden relative w-full">
        <div className="overflow-auto" style={{ maxHeight }}>
          <table className="w-full text-left border-collapse text-xs table-auto min-w-[900px]">
            <thead className="bg-header text-white font-bold tracking-wider select-none border-b border-[#083D34] sticky top-0 z-40">
              <tr>{renderHeader()}</tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-slate-700 font-semibold">
              {loading
                ? renderSkeleton()
                : data.length > 0
                  ? data.map((row) => (
                      <MemoizedTableRow
                        key={getRowId(row)}
                        row={row}
                        rowId={getRowId(row)}
                        layout={layout}
                        selectable={selectable}
                        isChecked={selectedIds.includes(getRowId(row))}
                        onSelectionChange={handleRowToggle}
                        renderers={renderers}
                        rowActions={rowActions}
                        onRowAction={onRowAction}
                      />
                    ))
                  : error
                    ? renderError()
                    : renderEmpty()}
            </tbody>
          </table>
        </div>
        {!loading && pagination && totalPages > 1 && renderPagination()}
      </div>
    </>
  );
}
