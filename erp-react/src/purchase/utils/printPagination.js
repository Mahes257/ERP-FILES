/**
 * purchase/utils/printPagination.js
 * ------------------------------------------------------------------
 * Shared A4 print pagination for ALL Purchase print documents.
 *
 * paginatePrint() splits measured row heights across A4 pages:
 *   Page 1: contentHeight - topHeight - tableHeadHeight
 *   Page 2+: contentHeight - runningHeight - tableHeadHeight
 *
 * Returns: Array<{ rows: number[], used: number, avail: number, bottom?: boolean }>
 *   - rows: global row indices that fit on this page
 *   - bottom: true if the bottom block (notes/summary/signatures) fits on this page
 *
 * Both paginateRequisitionPrint and paginateRfqPrint were identical —
 * this is the single canonical implementation.
 * ------------------------------------------------------------------
 */

/**
 * Paginate measured row heights into A4 pages.
 *
 * @param {object} opts
 * @param {number[]} opts.rowHeights     — measured height (px) of each table row
 * @param {number}   opts.topHeight      — height of the first-page header block
 * @param {number}   opts.runningHeight  — height of the running header (pages 2+)
 * @param {number}   opts.tableHeadHeight — height of the <thead>
 * @param {number}   opts.bottomHeight   — height of the bottom block (notes/summary/sigs)
 * @param {number}   opts.contentHeight  — usable content area height of one A4 page
 * @returns {Array<{rows: number[], used: number, avail: number, bottom?: boolean}>}
 */
export function paginatePrint({
  rowHeights = [],
  topHeight = 0,
  runningHeight = 0,
  tableHeadHeight = 0,
  bottomHeight = 0,
  contentHeight = 0
}) {
  const avail1 = Math.max(0, contentHeight - topHeight - tableHeadHeight);
  const availN = Math.max(0, contentHeight - runningHeight - tableHeadHeight);
  const pages = [];
  let page = { rows: [], used: 0, avail: avail1 };

  rowHeights.forEach((height, index) => {
    if (page.rows.length > 0 && page.used + height > page.avail) {
      pages.push(page);
      page = { rows: [], used: 0, avail: availN };
    }
    page.rows.push(index);
    page.used += height;
  });

  if (page.rows.length === 0 && pages.length === 0) {
    pages.push(page);
  } else if (page.rows.length > 0) {
    pages.push(page);
  }

  /* Attach the bottom block to the last page if it fits, otherwise
     create a dedicated final page for it. */
  const last = pages[pages.length - 1];
  if (last && last.avail - last.used >= bottomHeight) {
    last.bottom = true;
  } else {
    pages.push({ rows: [], used: 0, avail: availN, bottom: true });
  }

  return pages;
}

/* ── Backward-compatible aliases ── */

/** @deprecated Use paginatePrint instead */
export const paginateRequisitionPrint = paginatePrint;

/** @deprecated Use paginatePrint instead */
export const paginateRfqPrint = paginatePrint;
