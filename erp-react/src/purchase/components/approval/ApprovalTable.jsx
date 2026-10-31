/**
 * purchase/components/approval/ApprovalTable.jsx
 * ------------------------------------------------------------------
 * Purpose-built table for the Approval Center:
 *   · sticky header inside a scroll container
 *   · resizable column widths (drag handles)
 *   · sorting, selection (checkbox + select-all), bulk action bar
 *   · click-to-expand rows with a detail panel
 *   · loading skeleton, empty + error states, pagination
 * ------------------------------------------------------------------
 */
import { Fragment, useRef, useState } from 'react';
import {
  AlertTriangle, ArrowDown, ArrowUp, ChevronsUpDown, ChevronLeft,
  ChevronRight, MoreVertical, RefreshCw, ChevronDown, ChevronRight as ExpandIcon
} from 'lucide-react';
import useClickOutside from '../../hooks/useClickOutside';
import { PAGE_SIZE_OPTIONS } from '../../constants';
import { getCellValue } from '../../utils/helpers';
import ApprovalRowDetail from './ApprovalRowDetail';

const BULK_VARIANT = {
  danger: 'ac-bulk-danger',
  default: 'ac-bulk-default',
  success: 'ac-bulk-success'
};

function RowMenu({ actions, onSelect }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useClickOutside(ref, () => setOpen(false), open);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-label="Row actions"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((prev) => !prev);
        }}
        className="ac-row-menu-btn"
      >
        <MoreVertical className="w-4 h-4" />
      </button>
      {open && (
        <div className="ac-row-menu">
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.key}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                  onSelect(action.key);
                }}
                className={`ac-row-menu-item ${action.danger ? 'danger' : ''}`}
              >
                {Icon && <Icon className="w-3.5 h-3.5" />}
                {action.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function ApprovalTable({
  columns = [],
  records = [],
  loading = false,
  error = null,
  onRetry,
  sortKey = '',
  sortDirection = 'asc',
  onSort,
  selectedIds = [],
  onSelectionChange,
  renderers = {},
  quickActions = () => [],
  rowActions = () => [],
  onRowAction,
  expandedId = null,
  onToggleExpand,
  bulkActions = [],
  onBulkAction,
  pagination = {},
  onPageChange,
  onPageSizeChange,
  emptyMessage = 'No requisitions found.',
  maxHeight = 640,
  getRowId = (row) => row.id,
  skeletonRows = 7
}) {
  const [widths, setWidths] = useState({});
  const visible = columns.filter((col) => col.visible !== false);
  const { page = 1, pageSize = 10, totalPages = 1 } = pagination;

  const rowIds = records.map(getRowId);
  const allSelected = records.length > 0 && rowIds.every((id) => selectedIds.includes(id));
  const someSelected = rowIds.some((id) => selectedIds.includes(id));

  const colCount = visible.length + 3; // checkbox · expand · actions

  const startResize = (e, key) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = widths[key] || 140;
    const move = (ev) => {
      const next = Math.max(80, startW + ev.clientX - startX);
      setWidths((prev) => ({ ...prev, [key]: next }));
    };
    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      document.body.style.cursor = '';
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
    document.body.style.cursor = 'col-resize';
  };

  const renderSortIcon = (col) => {
    if (sortKey !== col.key) return <ChevronsUpDown className="w-3 h-3 opacity-40" />;
    return sortDirection === 'asc'
      ? <ArrowUp className="w-3 h-3 text-[#0B4A3D]" />
      : <ArrowDown className="w-3 h-3 text-[#0B4A3D]" />;
  };

  const cellStyle = (col) => {
    const width = widths[col.key] || col.width || 140;
    return { minWidth: width, width };
  };

  const renderHeader = () => (
    <tr>
      <th className="ac-th ac-th-check">
        <input
          type="checkbox"
          checked={allSelected}
          ref={(el) => {
            if (el) el.indeterminate = someSelected && !allSelected;
          }}
          onChange={(e) => onSelectionChange?.(e.target.checked ? rowIds : [])}
          aria-label="Select all rows"
        />
      </th>
      <th className="ac-th ac-th-expand" aria-hidden="true" />
      {visible.map((col) => {
        const alignClass = col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : '';
        return (
          <th key={col.key} style={cellStyle(col)} className={`ac-th ${alignClass}`}>
            <div className="ac-th-inner">
              {col.sortable ? (
                <button type="button" onClick={() => onSort?.(col.key)} className="ac-th-sort">
                  {col.label}
                  {renderSortIcon(col)}
                </button>
              ) : (
                <span>{col.label}</span>
              )}
              <span
                role="presentation"
                className="ac-resize-handle"
                onMouseDown={(e) => startResize(e, col.key)}
                aria-hidden="true"
              />
            </div>
          </th>
        );
      })}
      <th className="ac-th ac-th-actions" style={{ width: 132 }}>Actions</th>
    </tr>
  );

  const renderSkeleton = () =>
    Array.from({ length: skeletonRows }, (_, index) => (
      <tr key={`sk-${index}`} className="ac-tr">
        <td className="ac-td ac-td-check"><div className="ac-skeleton w-4 h-4" /></td>
        <td className="ac-td ac-td-expand"><div className="ac-skeleton w-4" /></td>
        {visible.map((col) => (
          <td key={col.key} className="ac-td"><div className={`ac-skeleton ${col.align === 'center' ? 'mx-auto w-14' : 'w-24'}`} /></td>
        ))}
        <td className="ac-td"><div className="ac-skeleton w-8" /></td>
      </tr>
    ));

  const renderEmpty = () => (
    <tr>
      <td colSpan={colCount} className="ac-empty">{emptyMessage}</td>
    </tr>
  );

  const renderError = () => (
    <tr>
      <td colSpan={colCount} className="ac-empty">
        <AlertTriangle className="w-8 h-8 text-rose-300 mx-auto mb-2" />
        <span className="text-slate-500">{error?.message || 'Failed to load approval queue.'}</span>
        <button type="button" onClick={onRetry} className="ac-retry-btn">
          <RefreshCw className="w-3.5 h-3.5" /> Retry
        </button>
      </td>
    </tr>
  );

  const renderPagination = () => {
    const pageBtn = (item) => (
      <button
        key={item}
        type="button"
        onClick={() => onPageChange?.(item)}
        className={`ac-page-btn ${item === page ? 'active' : ''}`}
      >
        {item}
      </button>
    );
    const pages = [];
    for (let i = 1; i <= totalPages; i += 1) pages.push(i);
    return (
      <div className="ac-pagination">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span>Rows per page</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange?.(Number(e.target.value))}
            className="ac-page-size"
          >
            {PAGE_SIZE_OPTIONS.map((size) => <option key={size} value={size}>{size}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" className="ac-page-nav" onClick={() => onPageChange?.(page - 1)} disabled={page <= 1} aria-label="Previous page">
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          {pages.map(pageBtn)}
          <button type="button" className="ac-page-nav" onClick={() => onPageChange?.(page + 1)} disabled={page >= totalPages} aria-label="Next page">
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="ac-table-card">
      {selectedIds.length > 0 && (
        <div className="ac-bulk-bar">
          <div className="flex items-center gap-2">
            <span className="ac-bulk-count">{selectedIds.length}</span>
            <span className="text-xs font-bold">requisition(s) selected</span>
          </div>
          <div className="ac-bulk-actions">
            {bulkActions.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.key}
                  type="button"
                  onClick={() => onBulkAction?.(action.key, selectedIds)}
                  className={`ac-bulk-btn ${BULK_VARIANT[action.variant] || BULK_VARIANT.default}`}
                >
                  {Icon && <Icon className="w-3.5 h-3.5" />}
                  {action.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="ac-table-scroll" style={{ maxHeight }}>
        <table className="ac-table">
          <thead className="ac-thead">{renderHeader()}</thead>
          <tbody>
            {loading
              ? renderSkeleton()
              : records.length === 0
                ? error ? renderError() : renderEmpty()
                : records.map((row) => {
                    const id = getRowId(row);
                    const expanded = id === expandedId;
                    const actions = typeof rowActions === 'function' ? rowActions(row) : rowActions;
                    const quick = typeof quickActions === 'function' ? quickActions(row) : quickActions;
                    return (
                      <Fragment key={id}>
                        <tr
                          className={`ac-tr ${selectedIds.includes(id) ? 'selected' : ''} ${expanded ? 'expanded' : ''}`}
                          onClick={() => onToggleExpand?.(id)}
                        >
                          <td className="ac-td ac-td-check" data-label="Select">
                            <input
                              type="checkbox"
                              checked={selectedIds.includes(id)}
                              onChange={(e) => {
                                e.stopPropagation();
                                onSelectionChange?.(
                                  e.target.checked
                                    ? [...selectedIds, id]
                                    : selectedIds.filter((x) => x !== id)
                                );
                              }}
                              aria-label={`Select ${row.prNo || id}`}
                            />
                          </td>
                          <td className="ac-td ac-td-expand" data-label=" ">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onToggleExpand?.(id);
                              }}
                              className={`ac-expand-btn ${expanded ? 'open' : ''}`}
                              aria-label={expanded ? 'Collapse details' : 'Expand details'}
                              title={expanded ? 'Collapse details' : 'Expand details'}
                            >
                              {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ExpandIcon className="w-3.5 h-3.5" />}
                            </button>
                          </td>
                          {visible.map((col) => {
                            const alignClass = col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : '';
                            return (
                              <td key={col.key} style={cellStyle(col)} className={`ac-td ${alignClass}`} data-label={col.label}>
                                {renderers[col.key] ? renderers[col.key](row) : (getCellValue(row, col.key) || '—')}
                              </td>
                            );
                          })}
                          <td className="ac-td ac-td-actions" data-label="Actions">
                            <div className="flex items-center justify-end gap-1">
                              {quick.map((action) => {
                                const Icon = action.icon;
                                return (
                                  <button
                                    key={action.key}
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onRowAction?.(action.key, row);
                                    }}
                                    className={`ac-quick-btn ${action.tone || ''}`}
                                    title={action.label}
                                    aria-label={action.label}
                                  >
                                    <Icon className="w-3.5 h-3.5" />
                                  </button>
                                );
                              })}
                              <RowMenu actions={actions} onSelect={(key) => onRowAction?.(key, row)} />
                            </div>
                          </td>
                        </tr>
                        {expanded && (
                          <tr className="ac-expand-row">
                            <td colSpan={colCount} className="ac-expand-cell">
                              <ApprovalRowDetail record={row} onViewDetails={() => onRowAction?.('view', row)} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
          </tbody>
        </table>
      </div>
      {!loading && totalPages > 1 && renderPagination()}
    </div>
  );
}
