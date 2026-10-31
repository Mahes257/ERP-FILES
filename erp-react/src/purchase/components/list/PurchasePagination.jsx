/**
 * purchase/components/list/PurchasePagination.jsx
 * ------------------------------------------------------------------
 * Shared list pagination (vt-pagination / page-btns / vt-pg-* classes,
 * styled by cpr-list.css), extracted from the Purchase Requisition
 * list. Renders page-info, rows-per-page select and first/prev/num/
 * next/last page buttons with the reference page-window logic.
 * ------------------------------------------------------------------
 */
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

function buildPageWindow(page, totalPages) {
  let start = Math.max(1, page - 2);
  let end = Math.min(totalPages, page + 2);
  if (end - start < 4 && totalPages > 5) {
    if (start === 1) end = Math.min(totalPages, start + 4);
    else start = Math.max(1, end - 4);
  }
  const numbers = [];
  for (let n = start; n <= end; n += 1) numbers.push(n);
  return numbers;
}

export default function PurchasePagination({
  page = 1,
  totalPages = 1,
  pageSize = 10,
  pageSizeOptions = [10, 25, 50, 100],
  pageInfo = '',
  onPageChange,
  onPageSizeChange
}) {
  const window = buildPageWindow(page, totalPages);

  return (
    <div className="vt-pagination" role="navigation" aria-label="Pagination">
      <div className="vt-pagination-left">
        {pageInfo && <span className="vt-pg-info">{pageInfo}</span>}
        <span className="vt-pg-rows">
          Rows:{' '}
          <select
            className="vt-pg-select"
            value={pageSize}
            onChange={(e) => onPageSizeChange && onPageSizeChange(Number(e.target.value))}
            aria-label="Rows per page"
          >
            {pageSizeOptions.map((size) => (
              <option key={size} value={size}>{size}</option>
            ))}
          </select>
        </span>
      </div>
      <div className="vt-pagination-right">
        <div className="page-btns">
          <button type="button" className="vt-pg-first" title="First" disabled={page <= 1} onClick={() => onPageChange && onPageChange(1)}>
            <ChevronsLeft size={12} aria-hidden="true" />
          </button>
          <button type="button" className="vt-pg-prev" title="Previous" disabled={page <= 1} onClick={() => onPageChange && onPageChange(page - 1)}>
            <ChevronLeft size={12} aria-hidden="true" />
          </button>
          {window.map((num) => (
            <button key={num} type="button" className={`vt-pg-num ${page === num ? 'active' : ''}`} aria-current={page === num ? 'page' : undefined} onClick={() => onPageChange && onPageChange(num)}>
              {num}
            </button>
          ))}
          <button type="button" className="vt-pg-next" title="Next" disabled={page >= totalPages} onClick={() => onPageChange && onPageChange(page + 1)}>
            <ChevronRight size={12} aria-hidden="true" />
          </button>
          <button type="button" className="vt-pg-last" title="Last" disabled={page >= totalPages} onClick={() => onPageChange && onPageChange(totalPages)}>
            <ChevronsRight size={12} aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}