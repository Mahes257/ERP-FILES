/**
 * purchase/components/ui/Table.jsx
 * ------------------------------------------------------------------
 * Generic data table made framework-agnostic (vendored from the main
 * project's shared UI). Supports sticky columns, selection, bulk
 * actions, sortable headers, row action menus, pagination, skeletons
 * and inline error / empty states.
 *
 * New (backward compatible) props:
 *   className     – extra classes appended to the table card wrapper
 *   headerTheme   – 'light' (default) | 'dark'. Both now render the
 *                   shared dark Purchase-green header via the
 *                   .purchase-table-head token class (13px labels).
 *                   'light' keeps the legacy green-accented bulk bar,
 *                   pagination and skeletons; 'dark' uses the slate
 *                   variants.
 *   bulkBarAlways – always render the bulk bar (shows "0 selected"
 *                   with disabled actions when nothing is selected)
 * ------------------------------------------------------------------
 */
import { useState, useEffect, useMemo, useRef, useCallback, memo } from 'react';
import {
  ArrowUp, ArrowDown, ChevronsUpDown, MoreVertical, X, AlertTriangle, RefreshCw, ChevronLeft, ChevronRight
} from 'lucide-react';
import ActionMenu from '../../../components/Common/ActionMenu';
import { PAGE_SIZE_OPTIONS } from '../../constants';
import { getCellValue } from '../../utils/helpers';

const SELECT_COLUMN_WIDTH = 48;

const BULK_VARIANTS = {
  danger: 'bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20',
  default: 'bg-slate-700 hover:bg-slate-800 text-white border border-slate-700'
};

function TableRow({
  row,
  rowId,
  rowIndex = 0,
  layout,
  selectable,
  isChecked,
  onSelectionChange,
  renderers,
  rowActions,
  onRowAction,
  headerTheme = 'dark'
}) {
  const [menuAnchor, setMenuAnchor] = useState(null);
  const light = headerTheme === 'light';

  const actions = typeof rowActions === 'function' ? rowActions(row) : rowActions;
  const zebraBg = light
    ? rowIndex % 2 === 1 ? 'bg-[#FBFCFC]' : 'bg-white'
    : rowIndex % 2 === 1 ? 'bg-slate-50/50' : 'bg-surface';
  const hoverBg = light ? 'hover:bg-[#F8FAFC]' : 'hover:bg-slate-100/80';
  const checkedBg = light ? 'bg-[#E8F0EE]/60' : 'bg-blue-500/10';
  const stickyCellBg = isChecked ? checkedBg : zebraBg;
  const accent = light ? 'accent-[#0B4A3D]' : 'accent-blue-600';
  const cells = [];

  if (selectable) {
    cells.push(
      <td key="__select" className={`p-4 text-center sticky left-0 z-30 ${stickyCellBg} ${hoverBg} transition-colors`}>
        <input
          type="checkbox"
          checked={isChecked}
          onChange={() => onSelectionChange?.(rowId)}
          className={`w-4 h-4 ${accent} cursor-pointer rounded`}
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
      ? `sticky z-30 ${stickyCellBg} ${hoverBg}`
      : '';
    cells.push(
      <td key={col.key} style={style} className={`p-4 ${cellClass} ${alignClass}`}>
        {col.key === 'actions' ? (
          <div className="relative inline-block">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setMenuAnchor((prev) => (prev === e.currentTarget ? null : e.currentTarget));
              }}
              className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700 transition-all inline-block cursor-pointer"
              aria-label="Row actions"
              aria-haspopup="menu"
              aria-expanded={Boolean(menuAnchor)}
            >
              <MoreVertical className="w-4 h-4" />
            </button>
            <ActionMenu
              items={actions}
              anchorEl={menuAnchor}
              open={Boolean(menuAnchor)}
              onClose={() => setMenuAnchor(null)}
              onActionClick={(key) => onRowAction?.(key, row)}
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
    <tr className={`group transition-colors ${isChecked ? checkedBg : zebraBg} ${hoverBg}`}>
      {cells}
    </tr>
  );
}

const MemoizedTableRow = memo(TableRow);

export default function Table({
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
  selectedLabel = 'record(s) selected',
  onRetry,
  emptyMessage = 'No records found matching your criteria.',
  errorMessage = 'Failed to load records. Please try again.',
  maxHeight = 560,
  skeletonRows = 8,
  getRowId = (row) => row.id,
  className = '',
  headerTheme = 'light',
  bulkBarAlways = false
}) {
  const selectAllRef = useRef(null);
  const selectedIdsRef = useRef(selectedIds);
  const light = headerTheme === 'light';
  const accent = light ? 'accent-[#0B4A3D]' : 'accent-blue-600';

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

  const renderSortIcon = (col) => {
    if (sortKey !== col.key) return <ChevronsUpDown className="w-3 h-3 opacity-40" />;
    return sortDirection === 'asc'
      ? <ArrowUp className={`w-3 h-3 ${light ? 'text-white' : 'text-amber-400'}`} />
      : <ArrowDown className={`w-3 h-3 ${light ? 'text-white' : 'text-amber-400'}`} />;
  };

  const renderHeader = () => {
    const cells = [];
    if (selectable) {
      cells.push(
        <th
          key="__select"
          className="p-[0_14px] h-[50px] w-12 text-center sticky left-0 z-50 purchase-table-head"
        >
          <input
            ref={selectAllRef}
            type="checkbox"
            onChange={handleSelectAll}
            checked={isAllSelected}
            className={`w-4 h-4 ${accent} cursor-pointer rounded`}
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
      const base = 'p-[0_14px] h-[50px] font-semibold text-[13px] tracking-[0.2px]';
      cells.push(
        <th
          key={col.key}
          style={style}
          className={`${base} ${alignClass} ${isSticky ? 'sticky z-50' : ''} purchase-table-head`}
        >
          {col.sortable ? (
            <button
              onClick={() => onSort?.(col.key)}
              className="inline-flex items-center gap-1 cursor-pointer transition-colors hover:text-[#8FDDCB]"
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
          <td className={`p-4 text-center sticky left-0 z-30 ${light ? 'bg-white' : 'bg-surface'}`}>
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
            <td key={col.key} style={style} className={`p-4 ${alignClass} ${isSticky ? `sticky z-30 ${light ? 'bg-white' : 'bg-surface'}` : ''}`}>
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
              className="po-btn po-btn-primary po-btn-sm"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Retry
            </button>
          )}
        </div>
      </td>
    </tr>
  );

  const renderPagination = () => {
    const pageBtnBase = light
      ? 'h-8 w-8 rounded-lg text-xs font-bold transition-colors cursor-pointer inline-flex items-center justify-center'
      : 'min-w-7 px-2 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer';
    const pageBtnInactive = light
      ? 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300'
      : 'bg-surface border border-slate-200 text-slate-600 hover:bg-slate-100';
    const pageBtnActive = light
      ? 'bg-[#0B4A3D] text-white border border-[#0B4A3D] shadow-[0_2px_8px_rgba(11,74,61,0.25)]'
      : 'bg-[#0B4A3D] text-white';
    const navBtn = light
      ? 'h-8 w-8 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-35 disabled:cursor-not-allowed transition-colors cursor-pointer inline-flex items-center justify-center'
      : 'p-1.5 rounded-lg border border-slate-200 bg-surface text-slate-500 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer';

    return (
      <div className={`flex flex-col sm:flex-row items-center justify-between gap-3 px-5 py-3 border-t border-slate-200 ${light ? 'bg-white' : 'bg-slate-50/60'}`}>
        <div className={`flex items-center gap-2 font-medium ${light ? 'text-[13px] text-[#6b7280]' : 'text-xs text-slate-500'}`}>
          <span>Rows per page</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange?.(Number(e.target.value))}
            className="bg-white border border-slate-200 rounded-md px-2 py-1 text-xs text-slate-700 outline-none cursor-pointer"
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
            className={navBtn}
            aria-label="Previous page"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          {Array.from({ length: totalPages }, (_, index) => index + 1).map((item) => (
            <button
              key={item}
              onClick={() => onPageChange?.(item)}
              className={`${pageBtnBase} ${item === page ? pageBtnActive : pageBtnInactive}`}
            >
              {item}
            </button>
          ))}
          <button
            onClick={() => onPageChange?.(page + 1)}
            disabled={page >= totalPages}
            className={navBtn}
            aria-label="Next page"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  };

  const showBulkBar = selectable && (selectedIds.length > 0 || bulkBarAlways);
  const bulkDisabled = selectedIds.length === 0;

  const renderBulkBar = () => {
    if (light) {
      return (
        <div className="bg-[#E8F0EE] border-[1.5px] border-[#0B4A3D] rounded-xl p-[10px_16px] flex flex-col sm:flex-row items-center justify-between gap-3 mb-3">
          <div className="text-sm font-bold text-[#0B4A3D] flex items-center gap-1.5 whitespace-nowrap">
            <span>{selectedIds.length}</span> {selectedLabel}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto justify-center">
            {bulkActions.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.key}
                  onClick={() => onBulkAction?.(action.key, selectedIds)}
                  disabled={bulkDisabled}
                  className={`h-8 px-3.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                    action.variant === 'danger'
                      ? 'bg-white border-slate-200 text-slate-600 hover:border-red-600 hover:text-red-600 hover:bg-red-50'
                      : 'bg-white border-slate-200 text-slate-600 hover:border-[#0B4A3D] hover:text-[#0B4A3D]'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" /> {action.label}
                </button>
              );
            })}
            {bulkBarExtra}
            {!bulkDisabled && (
              <button
                onClick={() => onSelectionChange?.([])}
                className="flex items-center justify-center h-8 w-8 bg-transparent hover:bg-[#0B4A3D]/10 text-[#0B4A3D] text-xs font-bold rounded-lg transition-colors cursor-pointer"
                aria-label="Clear selection"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      );
    }
    return (
      <div className="bg-[#0f172a] text-white rounded-xl p-3 flex flex-col sm:flex-row items-center justify-between gap-4 mb-4 shadow-lg">
        <div className="text-xs font-bold pl-2 flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-500/20 text-blue-400">
            {selectedIds.length}
          </span>
          {selectedLabel}
        </div>
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {bulkActions.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.key}
                onClick={() => onBulkAction?.(action.key, selectedIds)}
                disabled={bulkDisabled}
                className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${BULK_VARIANTS[action.variant] || BULK_VARIANTS.default}`}
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
    );
  };

  return (
    <>
      {showBulkBar && renderBulkBar()}

      <div className={`bg-surface border border-slate-200 rounded-[14px] shadow-sm overflow-hidden relative w-full ${className}`}>
        <div className="overflow-auto" style={{ maxHeight }}>
          <table className="w-full text-left border-separate border-spacing-0 text-xs table-auto min-w-[900px]">
            <thead
              className={`ptable-header tracking-wider select-none sticky top-0 z-40 ${
                light
                  ? 'purchase-table-head border-b border-[#003930] font-semibold'
                  : 'thead-sheen purchase-table-head border-b border-[#003930] font-bold'
              }`}
            >
              <tr>{renderHeader()}</tr>
            </thead>
            <tbody className={`divide-y ${light ? 'divide-slate-100 text-slate-700 font-medium' : 'divide-slate-200 text-slate-700 font-semibold'}`}>
              {loading
                ? renderSkeleton()
                : data.length > 0
                  ? data.map((row, index) => (
                      <MemoizedTableRow
                        key={getRowId(row)}
                        row={row}
                        rowId={getRowId(row)}
                        rowIndex={index}
                        layout={layout}
                        selectable={selectable}
                        isChecked={selectedIds.includes(getRowId(row))}
                        onSelectionChange={handleRowToggle}
                        renderers={renderers}
                        rowActions={rowActions}
                        onRowAction={onRowAction}
                        headerTheme={headerTheme}
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
