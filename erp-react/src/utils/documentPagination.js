// ============================================================================
// Document pagination — the single source of truth for slicing a continuously
// rendered A4 sheet (Sales Design documents, Proforma Invoice, Export Invoice,
// Packing List, Cost/Profit Workout, Packing List preview ...) into printed
// pages.
//
// Every consumer renders ONE long sheet and then crops it, so a page is always
// a window [top, bottom) over that sheet. Two things must never happen:
//
//   1. content may not be drawn inside the band reserved for the repeated
//      letterhead at the top of a continuation page, and
//   2. a page's content may not run past the bottom of the physical page.
//
// Both are decided here, once, and the caller only draws what is returned —
// every page carries an explicit `offset` (how far down the page its source
// content starts) and an optional `repeatHeader` to redraw the item table's
// bar + <thead> on continuation pages.
//
// Dependency-free on purpose: pure geometry, testable without a DOM.
// ============================================================================

/** Minimum height (source px) for a block to be worth placing on its own. */
const MIN_BLOCK_PX = 2;

/**
 * Plan the page windows for one document sheet.
 *
 * @param {Object}   opts
 * @param {Array<{top:number,bottom:number}>} opts.units
 *        Atomic content blocks in source (canvas) px — a block is never split
 *        across pages.
 * @param {Array<{headTop:number,headBottom:number,bottom:number}>} [opts.splittable]
 *        Tables that MAY split across pages. A page starting strictly inside
 *        one repeats its header (bar + thead), so that header's height is
 *        reserved on that page.
 * @param {number}   opts.pageHpx        Full page height in source px.
 * @param {number}   [opts.totalHeight]  Total source height (last page's end).
 * @param {number}   [opts.firstPageOffset=0]
 *        Source px already consumed at the top of page 1 by page-1 chrome that
 *        is part of the capture (0 for a sheet whose own letterhead is
 *        captured in the pixels).
 * @param {number}   [opts.continuationOffset=0]
 *        Band reserved at the top of every page 2+ for the repeated
 *        letterhead. Content on those pages starts at this offset, so it can
 *        never be drawn underneath the letterhead.
 * @returns {Array<{top:number,bottom:number,offset:number,repeatHeader:{sourceTop:number,height:number}|null}>}
 */
export function planDocumentPages({
  units = [],
  splittable = [],
  pageHpx,
  totalHeight = 0,
  firstPageOffset = 0,
  continuationOffset = 0
} = {}) {
  if (!Number.isFinite(pageHpx) || pageHpx <= 0) return [];

  const blocks = units
    .filter((u) => u && Number.isFinite(u.top) && Number.isFinite(u.bottom) && u.bottom - u.top >= MIN_BLOCK_PX)
    .sort((a, b) => a.top - b.top || a.bottom - b.bottom);

  /**
   * The header that has to be redrawn when a page starts in the middle of a
   * splittable table (null when the page starts on a clean boundary).
   */
  const repeatedHeader = (pageStart) => {
    const table = splittable.find((t) => pageStart > t.headTop + 0.5 && pageStart < t.bottom - 0.5);
    if (!table) return null;
    const height = Math.round(table.headBottom - table.headTop);
    return height > 0 ? { sourceTop: Math.round(table.headTop), height } : null;
  };

  /** The last y a page starting at `start` may fill. */
  const pageLimit = (start, isFirst) => {
    const offset = isFirst ? firstPageOffset : continuationOffset;
    const header = repeatedHeader(start);
    return start + pageHpx - offset - (header ? header.height : 0);
  };

  const starts = [];
  let pageStart = 0;
  let limit = pageLimit(0, true);
  let guard = 0;

  for (let i = 0; i < blocks.length && guard++ < 200000; ) {
    const block = blocks[i];
    if (block.bottom <= limit) {
      i += 1;
      continue;
    }
    // The block that would straddle the page boundary starts the next page —
    // unless it is taller than a whole page, in which case it is hard-sliced
    // at the safe limit (pathological input only; every other break lands on a
    // clean section / row boundary).
    const next = block.top > pageStart + 1 ? block.top : limit;
    if (next - pageStart < MIN_BLOCK_PX) break; // no progress possible
    starts.push(pageStart);
    pageStart = next;
    limit = pageLimit(pageStart, false);
  }
  starts.push(pageStart);

  // Pages that consume no source content (a blank tail) are dropped.
  const end = Math.max(totalHeight, pageStart);
  const pages = [];
  for (let i = 0; i < starts.length; i += 1) {
    const top = starts[i];
    const bottom = i + 1 < starts.length ? starts[i + 1] : end;
    if (bottom - top < MIN_BLOCK_PX && pages.length > 0) continue;
    // Page 1 keeps its own captured letterhead in the pixels; every later page
    // starts below the band reserved for the repeated one.
    const offset = pages.length === 0 ? firstPageOffset : continuationOffset;
    pages.push({
      top: Math.round(top),
      bottom: Math.round(bottom),
      offset: Math.round(offset),
      repeatHeader: repeatedHeader(top)
    });
  }
  return pages;
}

export default planDocumentPages;
