import { useLayoutEffect, useState } from 'react';

/**
 * useStickyColumnLeft
 * Measures the real rendered left offset (px) of a table column whose header
 * carries data-sticky-key={stickyKey}, so the column can be pinned with
 * position: sticky while the table scrolls horizontally. The offset is the
 * sum of the rendered widths of every visible header cell before the sticky
 * column, so it stays correct even when columns are hidden via the Columns
 * dropdown (hidden cells are not present in the DOM).
 *
 * Note: the table must use border-collapse: separate (border-spacing: 0) for
 * sticky table cells to pin reliably — same requirement as the CRM tables.
 *
 * @param {object} opts
 * @param {React.RefObject<HTMLTableRowElement>} opts.headerRowRef ref of the <thead> <tr>
 * @param {string} opts.stickyKey  column key to pin (e.g. 'prNo', 'quotationNo')
 * @param {string[]} opts.visibleKeys  keys of the currently visible columns
 *                                     (re-measures when they change)
 * @param {boolean} opts.precedingStickyOnly  when true, only the widths of the
 *                                     PRECEDING PINNED columns are summed (cells
 *                                     marked data-sticky-col="true"), so a pinned
 *                                     column always sits directly beside the pinned
 *                                     column before it even when ordinary columns
 *                                     sit between them in the column order. Cells
 *                                     without the marker are skipped (they scroll
 *                                     underneath the pinned area). Defaults to
 *                                     false — every ordinary leading column counts,
 *                                     which is right when the pinned column already
 *                                     follows the checkbox / is the first data column.
 * @returns {number} left offset in px (0 when the column is not rendered)
 */
export default function useStickyColumnLeft({ headerRowRef, stickyKey, visibleKeys = [], precedingStickyOnly = false }) {
  const [left, setLeft] = useState(0);
  const signature = visibleKeys.join('|');

  useLayoutEffect(() => {
    const row = headerRowRef.current;
    if (!row || !stickyKey) {
      setLeft(0);
      return;
    }
    let acc = 0;
    let found = false;
    for (const th of Array.from(row.children)) {
      if (th.dataset.stickyKey === stickyKey) {
        found = true;
        break;
      }
      // Only the pinned columns before this one take part of the offset when
      // the caller opts in: the offset must be the rendered width of the
      // key before it (e.g. the checkbox), never an arbitrary constant.
      if (precedingStickyOnly && th.dataset.stickyCol !== 'true') continue;
      acc += th.getBoundingClientRect().width;
    }
    setLeft(found ? acc : 0);
  }, [headerRowRef, stickyKey, signature, precedingStickyOnly]);

  return left;
}
