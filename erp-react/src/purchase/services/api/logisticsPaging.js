/**
 * purchase/services/api/logisticsPaging.js
 * ------------------------------------------------------------------
 * Query contract for the Purchase Receiving / Logistics list endpoints.
 *
 * The backend serves these lists — goods receipts (GRN), quality
 * inspections, manufacturing / packing jobs, shipments and inventory
 * movements — as BOUNDED PAGES: one request returns one page, the
 * database does the searching, filtering and sorting, and the response
 * carries totalElements / totalPages.
 *
 * This module is the single place that decides what a page request looks
 * like, so the rules cannot drift between the five lists:
 *
 *   · page     — 1-based here, sent 0-based to Spring Data
 *   · size     — 25 by default, never above 100 (the server-side cap)
 *   · search   — trimmed; blank means "no search"
 *   · filters  — trimmed; blank and the UI's "All" sentinel are dropped
 *                so an unset filter is never sent as a literal match
 *
 * Nothing here touches the network — it is pure and unit tested.
 */

/** Rows per page when a caller does not choose one. */
export const RECEIVING_PAGE_SIZE_DEFAULT = 25;

/** Hard ceiling enforced by the backend (PurchaseReceivingController). */
export const RECEIVING_PAGE_SIZE_MAX = 100;

/**
 * The widest single read a caller may ask for. Report / dashboard callers
 * that used to rely on "fetch everything" now receive the largest page the
 * API allows instead of the whole table.
 */
export const RECEIVING_PAGE_SIZE_SNAPSHOT = RECEIVING_PAGE_SIZE_MAX;

/**
 * Clamps a requested page size into [1, RECEIVING_PAGE_SIZE_MAX].
 * Missing / invalid / non-positive sizes fall back to the default.
 */
export function clampPageSize(size) {
  const value = Number(size);
  if (!Number.isFinite(value) || value <= 0) return RECEIVING_PAGE_SIZE_DEFAULT;
  return Math.min(Math.floor(value), RECEIVING_PAGE_SIZE_MAX);
}

/** 1-based page → 0-based page index, never negative. */
export function toPageIndex(page) {
  const value = Number(page);
  if (!Number.isFinite(value) || value <= 1) return 0;
  return Math.floor(value - 1);
}

/**
 * Builds the query string for one page of a receiving list.
 *
 * @param {object} options
 * @param {number} [options.page=1]          1-based page number
 * @param {number} [options.pageSize]        rows per page (clamped)
 * @param {string} [options.search]          free-text search term
 * @param {string} [options.sort]            whitelisted sort field
 * @param {...string} [options.filters]      status / type / vendor / poNo …
 * @returns {{page: number, size: number, search?: string, sort?: string}}
 */
export function buildPageParams({ page = 1, pageSize = RECEIVING_PAGE_SIZE_SNAPSHOT, search = '', sort = '', ...filters } = {}) {
  const params = { page: toPageIndex(page), size: clampPageSize(pageSize) };

  const term = String(search ?? '').trim();
  if (term) params.search = term;

  const sortField = String(sort ?? '').trim();
  if (sortField) params.sort = sortField;

  Object.entries(filters).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    const text = String(value).trim();
    if (!text || text === 'All') return;
    params[key] = text;
  });

  return params;
}

export default { RECEIVING_PAGE_SIZE_DEFAULT, RECEIVING_PAGE_SIZE_MAX, RECEIVING_PAGE_SIZE_SNAPSHOT, clampPageSize, toPageIndex, buildPageParams };
