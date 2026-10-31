/**
 * purchase/utils/technicalReviewQueue.js
 * ------------------------------------------------------------------
 * Query contract for the Technical Specification Review queue.
 *
 * The queue is served as ONE bounded, database-filtered page:
 *
 *   GET /api/purchase/requisitions/technical-review?page&size&search&sort…
 *   GET /api/purchase/requisitions/technical-review/stats
 *
 * These helpers are the single place that turns the screen's state
 * (search text, filter drawer values, the active KPI card, the sort
 * column) into that query, and the stats payload back into the KPI
 * cards and filter options. They also carry the local-data-mode
 * equivalent of the backend predicate/ordering, so both modes answer
 * the same question. Pure — no network, no imports.
 *
 * NOTE: the two literals below mirror the Purchase constants
 * (PR_STATUS.TECHNICAL_REVIEW = 'Technical Specification Review',
 * REVIEW_STATUS.REVIEWED = 'Reviewed'). They are declared here so this
 * module stays dependency-free (see tests/purchase-technical-review-queue
 * .test.js, which pins them to the constants file).
 */

/** Canonical review stage — the only stage the queue serves. */
export const QUEUE_STAGE = 'Technical Specification Review';

/** Stored review status that marks a review as complete. */
export const QUEUE_REVIEWED = 'Reviewed';

/** Derived status of a queue row still awaiting its review. */
export const QUEUE_READY = 'Ready for Review';

/** Lifecycle status of a requisition returned to its requester. */
export const QUEUE_RETURNED = 'Returned';

/** Active record state (archived / deleted records never queue). */
export const QUEUE_ACTIVE = 'active';

/** Rows per page when the caller does not choose one (mirrors the backend). */
export const QUEUE_PAGE_SIZE_DEFAULT = 25;

/** Hard ceiling the backend clamps every page size to. */
export const QUEUE_PAGE_SIZE_MAX = 100;

/** Widest single read allowed — used by exports, which must stay bounded. */
export const QUEUE_PAGE_SIZE_EXPORT = QUEUE_PAGE_SIZE_MAX;

/** Priority order used by the sortable Priority column (Critical first). */
export const PRIORITY_RANK = { Critical: 0, High: 1, Medium: 2, Low: 3 };

/**
 * The three KPI cards are click-to-filter. Each maps onto real queue
 * criteria so the server can answer it — nothing is filtered in the
 * browser any more.
 */
export const KPI_FILTERS = {
  pendingReview: { reviewStatus: QUEUE_READY },
  reviewedToday: { reviewedToday: true },
  highPriority: { priority: 'High,Critical' }
};

/** Sort parameter for the API: FIFO (no sort) unless a column is chosen. */
export function buildQueueSort(sortKey, sortDirection = 'asc') {
  if (!sortKey) return '';
  return sortDirection === 'desc' ? `-${sortKey}` : String(sortKey);
}

/** Clamps a requested page size into [1, QUEUE_PAGE_SIZE_MAX]. */
export function clampQueuePageSize(pageSize) {
  const value = Number(pageSize);
  if (!Number.isFinite(value) || value <= 0) return QUEUE_PAGE_SIZE_DEFAULT;
  return Math.min(Math.floor(value), QUEUE_PAGE_SIZE_MAX);
}

/** True when a timestamp falls on the given day (local time, default today). */
export function isReviewedOn(timestamp, day = new Date()) {
  if (!timestamp) return false;
  const value = new Date(timestamp);
  if (Number.isNaN(value.getTime())) return false;
  return value.getFullYear() === day.getFullYear()
    && value.getMonth() === day.getMonth()
    && value.getDate() === day.getDate();
}

/**
 * Review status shown for a queue row. A queue row is always in the review
 * stage, so only two states occur: reviewed, or still ready for review.
 */
function queueReviewStatus(record) {
  return record?.technicalReview?.reviewStatus === QUEUE_REVIEWED ? QUEUE_REVIEWED : QUEUE_READY;
}

/**
 * Builds the queue query for the current screen state.
 *
 * @returns {{page:number, size:number, search?:string, sort?:string,
 *            reviewStatus?:string, department?:string, vendor?:string,
 *            assignedBy?:string, priority?:string, dateFrom?:string,
 *            dateTo?:string, reviewedToday:boolean}}
 */
export function buildQueueQuery({
  page = 1,
  pageSize = QUEUE_PAGE_SIZE_DEFAULT,
  search = '',
  filters = {},
  kpiActive = null,
  sortKey = null,
  sortDirection = 'asc'
} = {}) {
  const kpi = KPI_FILTERS[kpiActive] || {};
  const params = { page: Math.max(1, Number(page) || 1), size: clampQueuePageSize(pageSize) };

  const term = String(search ?? '').trim();
  if (term) params.search = term;

  const sort = buildQueueSort(sortKey, sortDirection);
  if (sort) params.sort = sort;

  /* KPI filters win over the drawer: clicking a KPI card is the more
     specific, more recent intent. */
  const values = {
    reviewStatus: kpi.reviewStatus ?? filters.reviewStatus,
    department: filters.department,
    vendor: filters.vendor,
    assignedBy: filters.assignedBy,
    priority: kpi.priority ?? filters.priority,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo
  };
  Object.entries(values).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    const text = String(value).trim();
    if (!text || text === 'All') return;
    params[key] = text;
  });

  params.reviewedToday = kpi.reviewedToday === true;
  return params;
}

/**
 * Local-data-mode equivalent of the backend queue predicate: the review
 * stage only, then every filter the server understands.
 */
export function matchesQueueRow(record, query = {}) {
  if (!record) return false;
  if (record.status !== QUEUE_STAGE) return false;
  if ((record.recordState || QUEUE_ACTIVE) !== QUEUE_ACTIVE) return false;

  if (query.reviewStatus && queueReviewStatus(record) !== query.reviewStatus) return false;
  if (query.department && record.department !== query.department) return false;
  if (query.vendor && record.vendor !== query.vendor) return false;
  if (query.assignedBy && (record.buyer || '') !== query.assignedBy) return false;
  if (query.priority) {
    const wanted = String(query.priority).split(',').map((value) => value.trim()).filter(Boolean);
    if (wanted.length > 0 && !wanted.includes(record.priority)) return false;
  }
  if (query.dateFrom && (record.date || '') < query.dateFrom) return false;
  if (query.dateTo && (record.date || '') > query.dateTo) return false;
  if (query.reviewedToday && !isReviewedOn(record.technicalReview?.reviewedAt)) return false;
  if (query.search) {
    const haystack = [
      record.prNo, record.title, record.vendor, record.department, record.requester,
      record.priority, record.buyer, ...(record.items || []).map((item) => item?.product)
    ].filter(Boolean).join(' ').toLowerCase();
    if (!haystack.includes(String(query.search).toLowerCase())) return false;
  }
  return true;
}

/**
 * Local-data-mode equivalent of the backend queue ordering: FIFO (oldest
 * awaiting review first) unless a whitelisted column is chosen. The Item
 * column falls back to the PR title, exactly like the server.
 */
export function compareQueueRows(a, b, sort = '') {
  const raw = String(sort || '');
  const desc = raw.startsWith('-') || /,desc$/i.test(raw);
  const field = (raw.startsWith('-') ? raw.slice(1) : raw).split(',')[0].trim();

  const keyOf = (row) => {
    switch (field) {
      case 'priority': return PRIORITY_RANK[row?.priority] ?? PRIORITY_RANK.Low;
      case 'reviewStatus': return queueReviewStatus(row);
      case 'assignedBy': return row?.buyer || '';
      case 'item': return row?.items?.[0]?.product || row?.title || '';
      case 'prNo':
      case 'title':
      case 'department':
      case 'vendor':
      case 'date':
      case 'status': return row?.[field] || '';
      default: return new Date(row?.createdAt || 0).getTime() || 0;
    }
  };

  const first = keyOf(a);
  const second = keyOf(b);
  const compare = typeof first === 'number' && typeof second === 'number'
    ? first - second
    : String(first).localeCompare(String(second), undefined, { numeric: true });
  return desc ? -compare : compare;
}

/** Normalises the queue stats payload into KPI numbers and option lists. */
export function mapQueueStats(payload) {
  const raw = payload || {};
  const list = (value) => (Array.isArray(value) ? value.filter(Boolean) : []);
  const count = (value) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
  };
  return {
    pendingReview: count(raw.pendingReview),
    reviewedToday: count(raw.reviewedToday),
    highPriority: count(raw.highPriority),
    reviewed: count(raw.reviewed),
    departments: list(raw.departments),
    vendors: list(raw.vendors),
    assignees: list(raw.assignees)
  };
}

export default {
  QUEUE_STAGE,
  QUEUE_REVIEWED,
  QUEUE_READY,
  QUEUE_ACTIVE,
  QUEUE_PAGE_SIZE_DEFAULT,
  QUEUE_PAGE_SIZE_MAX,
  QUEUE_PAGE_SIZE_EXPORT,
  PRIORITY_RANK,
  KPI_FILTERS,
  buildQueueSort,
  clampQueuePageSize,
  isReviewedOn,
  buildQueueQuery,
  matchesQueueRow,
  compareQueueRows,
  mapQueueStats
};
