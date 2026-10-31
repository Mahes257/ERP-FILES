/**
 * production/utils/kpiQuery.js
 * ------------------------------------------------------------------
 * Query contract for the Production KPI screens.
 *
 * Every KPI is answered by the backend, not by the browser:
 *
 *   GET /production-kpi/{module}/kpi/{kpiKey}?page&size&search&status
 *       → one bounded page: { content, page, size, totalElements, totalPages }
 *   GET /production-kpi/{module}/counts
 *       → the module's KPI counters (draft, prodApproval, approved, …)
 *
 * This module is the single place that turns screen state into those requests
 * and the responses back into what the screens render. Pure — no network.
 */

/** Rows per page when the caller does not choose one (mirrors the backend). */
export const KPI_PAGE_SIZE_DEFAULT = 25;

/** Hard ceiling the backend clamps every page size to. */
export const KPI_PAGE_SIZE_MAX = 100;

/**
 * Production Orders tab → KPI counter key. The tab labels are the UI's own
 * (ProductionOrders.jsx TAB_STATUSES); the keys are the KPI definitions the
 * backend counts in SQL.
 */
export const ORDER_TAB_KPI_KEYS = {
  All: 'total',
  Draft: 'draft',
  'Production Approval': 'prodApproval',
  'Admin Approval': 'adminApproval',
  Approved: 'approved',
  'Production Rejected': 'prodRejected',
  'Admin Rejected': 'adminRejected',
  Cancelled: 'cancelled'
};

/** Clamps a requested page size into [1, KPI_PAGE_SIZE_MAX]. */
export function clampKpiPageSize(pageSize) {
  const value = Number(pageSize);
  if (!Number.isFinite(value) || value <= 0) return KPI_PAGE_SIZE_DEFAULT;
  return Math.min(Math.floor(value), KPI_PAGE_SIZE_MAX);
}

/** 1-based UI page → 0-based page index (never negative). */
export function toApiPage(page) {
  const value = Number(page);
  if (!Number.isFinite(value) || value <= 1) return 0;
  return Math.floor(value - 1);
}

/**
 * Builds the KPI page request for the current screen state.
 *
 * @returns {{page:number, size:number, search?:string, status?:string}}
 */
export function buildKpiParams({ page = 1, pageSize = KPI_PAGE_SIZE_DEFAULT, search = '', status = 'All' } = {}) {
  const params = { page: toApiPage(page), size: clampKpiPageSize(pageSize) };

  const term = String(search ?? '').trim();
  if (term) params.search = term;

  const statusValue = String(status ?? '').trim();
  if (statusValue && statusValue !== 'All') params.status = statusValue;

  return params;
}

/** Normalises a KPI page response into what the table renders. */
export function normalizeKpiPage(payload) {
  const data = payload || {};
  const rows = Array.isArray(data.content) ? data.content : [];
  const total = Number(data.totalElements);
  const totalPages = Number(data.totalPages);
  return {
    rows,
    total: Number.isFinite(total) ? total : rows.length,
    totalPages: Number.isFinite(totalPages) && totalPages > 0 ? totalPages : 1,
    page: Number.isFinite(Number(data.page)) ? Number(data.page) : 0
  };
}

/** Maps the orders counters onto the tab labels the orders page renders. */
export function orderTabCounts(counts) {
  const source = counts || {};
  return Object.fromEntries(
    Object.entries(ORDER_TAB_KPI_KEYS).map(([tab, key]) => {
      const value = Number(source[key]);
      return [tab, Number.isFinite(value) ? value : 0];
    })
  );
}

export default {
  KPI_PAGE_SIZE_DEFAULT,
  KPI_PAGE_SIZE_MAX,
  ORDER_TAB_KPI_KEYS,
  clampKpiPageSize,
  toApiPage,
  buildKpiParams,
  normalizeKpiPage,
  orderTabCounts
};
