/**
 * purchase/services/api/requisitionApi.js
 * ------------------------------------------------------------------
 * REST calls for the Purchase Requisition workflow. Consumed by the
 * `requisitionService` facade in ../requisition.js, which falls back
 * to the mock implementation when the backend is unreachable.
 *
 * Endpoints mirror the CprController conventions:
 *   GET    /api/purchase/requisitions            (paged, filtered, sorted)
 *   GET    /api/purchase/requisitions/stats
 *   GET    /api/purchase/requisitions/next-number
 *   POST   /api/purchase/requisitions
 *   GET    /api/purchase/requisitions/:id
 *   PUT    /api/purchase/requisitions/:id
 *   PATCH  /api/purchase/requisitions/:id/archive | /restore | /delete
 *   POST   /api/purchase/requisitions/:id/submit | /approve | /reject |
 *          /return | /duplicate | /raise-po
 *   POST   /api/purchase/requisitions/:id/technical-review
 *   GET    /api/purchase/requisitions/:id/activity
 *   POST   /api/purchase/requisitions/:id/comments
 *   GET    /api/purchase/requisitions/:id/attachments
 *   POST   /api/purchase/requisitions/:id/attachments  (multipart)
 *   DELETE /api/purchase/requisitions/:id/attachments/:attachmentId
 * ------------------------------------------------------------------
 */
import { purchaseDelete, purchaseGet, purchasePatch, purchasePost, purchasePut, purchaseUpload } from '../../api';
import { getCurrentActor, normalizePage, unwrapResponse } from '../api-client';
import { buildQueueQuery } from '../../utils/technicalReviewQueue';

/** Builds actor headers from the logged-in JWT user (never hardcoded). */
function actorHeaders() {
  const actor = getCurrentActor();
  return {
    'X-Actor-Id': actor.id,
    'X-Actor-Name': actor.name,
    'X-Actor-Role': actor.role
  };
}

/** True when the value is already a numeric database id (not a PR number). */
function isNumericId(value) {
  return /^\d+$/.test(String(value ?? '').trim());
}

export const requisitionApi = {
  /**
   * Resolves a requisition id from either of the two forms callers
   * legitimately hold: list rows, row actions and app links expose the
   * numeric database `id`, while the report tables and shared deep links
   * only know the document number (e.g. "PR-2026-0007").
   *
   * `GET /requisitions/{id}` binds a `Long` path variable, so handing it a
   * PR number yields a 400 and the page cannot load. A PR number is
   * therefore resolved against the existing list search — which already
   * matches `prNo` — instead of guessing. Numeric ids pass straight
   * through, so existing callers are unaffected.
   */
  async resolveId(id) {
    if (isNumericId(id)) return id;
    const wanted = String(id ?? '').trim();
    if (!wanted) throw new Error('A requisition id or number is required');
    const { data } = await purchaseGet('/requisitions', { page: 0, size: 10, search: wanted });
    const page = normalizePage(unwrapResponse(data));
    const match = (page.data || []).find(
      (row) => String(row.prNo) === wanted || String(row.id) === wanted
    );
    if (!match || match.id == null) throw new Error(`Requisition ${wanted} was not found`);
    return match.id;
  },

  async nextNumber() {
    const { data } = await purchaseGet('/requisitions/next-number');
    return unwrapResponse(data);
  },

  async list({ search, tab, status, department, requester, vendor, priority, project, dateFrom, dateTo, page = 1, pageSize = 10, sortBy = 'createdAt', sortDir = 'desc' } = {}) {
    /* The backend expects a single status string. When the caller passes
       an array (e.g. PR_APPROVED_GROUP), flatten to a comma-separated
       value so the backend can match any of them. */
    const normalizedStatus = Array.isArray(status) ? status.join(',') : status;
    const params = {
      page: page - 1,
      size: pageSize,
      ...(search ? { search } : {}),
      ...(tab && tab !== 'active' ? { state: tab } : {}),
      ...(normalizedStatus && normalizedStatus !== 'All' ? { status: normalizedStatus } : {}),
      ...(department && department !== 'All' ? { department } : {}),
      ...(requester && requester !== 'All' ? { requester } : {}),
      ...(vendor && vendor !== 'All' ? { vendor } : {}),
      ...(priority && priority !== 'All' ? { priority } : {}),
      ...(project && project !== 'All' ? { project } : {}),
      ...(dateFrom ? { dateFrom } : {}),
      ...(dateTo ? { dateTo } : {}),
      ...(sortBy ? { sort: sortDir === 'asc' ? sortBy : `-${sortBy}` } : {})
    };
    const { data } = await purchaseGet('/requisitions', params);
    return normalizePage(unwrapResponse(data));
  },

  async get(id) {
    const { data } = await purchaseGet(`/requisitions/${await requisitionApi.resolveId(id)}`);
    return unwrapResponse(data);
  },

  async create(payload) {
    const { data } = await purchasePost('/requisitions', payload, { headers: actorHeaders() });
    return unwrapResponse(data);
  },

  async update(id, patch) {
    const { data } = await purchasePut(`/requisitions/${await requisitionApi.resolveId(id)}`, patch, { headers: actorHeaders() });
    return unwrapResponse(data);
  },

  async delete(id) {
    const { data } = await purchasePatch(`/requisitions/${await requisitionApi.resolveId(id)}/delete`);
    return unwrapResponse(data);
  },

  async archive(id) {
    const { data } = await purchasePatch(`/requisitions/${await requisitionApi.resolveId(id)}/archive`);
    return unwrapResponse(data);
  },

  async restore(id) {
    const { data } = await purchasePatch(`/requisitions/${await requisitionApi.resolveId(id)}/restore`);
    return unwrapResponse(data);
  },

  async submit(id) {
    const { data } = await purchasePost(`/requisitions/${await requisitionApi.resolveId(id)}/submit`, null, { headers: actorHeaders() });
    return unwrapResponse(data);
  },

  async approve(id, note = '') {
    const { data } = await purchasePost(`/requisitions/${await requisitionApi.resolveId(id)}/approve`, { remarks: note }, { headers: actorHeaders() });
    return unwrapResponse(data);
  },

  async reject(id, note = '') {
    const { data } = await purchasePost(`/requisitions/${await requisitionApi.resolveId(id)}/reject`, { remarks: note }, { headers: actorHeaders() });
    return unwrapResponse(data);
  },

  async returnToRequester(id, note = '') {
    const { data } = await purchasePost(`/requisitions/${await requisitionApi.resolveId(id)}/return`, { remarks: note }, { headers: actorHeaders() });
    return unwrapResponse(data);
  },

  async duplicate(id) {
    const { data } = await purchasePost(`/requisitions/${await requisitionApi.resolveId(id)}/duplicate`, null, { headers: actorHeaders() });
    return unwrapResponse(data);
  },

  /** Bulk-converts approved requisitions into RFQ drafts. */
  async convertToRfq(ids) {
    const { data } = await purchasePost('/requisitions/convert-to-rfq', { ids }, { headers: actorHeaders() });
    return unwrapResponse(data);
  },

  /** Marks one approved requisition as converted to a specific RFQ (Create RFQ flow). */
  async markConvertedToRfq(id, rfqNo) {
    const { data } = await purchasePost(`/requisitions/${await requisitionApi.resolveId(id)}/convert-to-rfq`, { rfqNo }, { headers: actorHeaders() });
    return unwrapResponse(data);
  },

  /**
   * Technical Specification Review queue — ONE bounded, server-filtered
   * page. The caller passes the screen state (search, filter drawer, KPI
   * card, sort column); the backend applies them in the database and
   * answers with { data, total, page, pageSize, totalPages }.
   */
  async technicalReviewQueue(options = {}) {
    const query = buildQueueQuery(options);
    const params = {
      page: query.page - 1,
      size: query.size,
      ...(query.search ? { search: query.search } : {}),
      ...(query.sort ? { sort: query.sort } : {}),
      ...(query.reviewStatus ? { reviewStatus: query.reviewStatus } : {}),
      ...(query.department ? { department: query.department } : {}),
      ...(query.vendor ? { vendor: query.vendor } : {}),
      ...(query.assignedBy ? { assignedBy: query.assignedBy } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
      ...(query.dateFrom ? { dateFrom: query.dateFrom } : {}),
      ...(query.dateTo ? { dateTo: query.dateTo } : {}),
      ...(query.reviewedToday ? { reviewedToday: true } : {})
    };
    const { data } = await purchaseGet('/requisitions/technical-review', params);
    return normalizePage(unwrapResponse(data));
  },

  /** Review-queue KPI counts + filter options (counted in the database). */
  async technicalReviewQueueStats() {
    const { data } = await purchaseGet('/requisitions/technical-review/stats');
    return unwrapResponse(data);
  },

  async saveTechnicalReview(id, review) {
    const { data } = await purchasePost(`/requisitions/${await requisitionApi.resolveId(id)}/technical-review`, review, { headers: actorHeaders() });
    return unwrapResponse(data);
  },

  /** Approves the technical specification review (Ready for RFQ). */
  async completeTechnicalReview(id, note = '') {
    const { data } = await purchasePost(`/requisitions/${await requisitionApi.resolveId(id)}/complete-technical-review`, { remarks: note }, { headers: actorHeaders() });
    return unwrapResponse(data);
  },

  async stats() {
    const { data } = await purchaseGet('/requisitions/stats');
    return unwrapResponse(data);
  },

  async activity(id) {
    const { data } = await purchaseGet(`/requisitions/${await requisitionApi.resolveId(id)}/activity`);
    return unwrapResponse(data);
  },

  async addComment(id, text) {
    const { data } = await purchasePost(`/requisitions/${await requisitionApi.resolveId(id)}/comments`, { text }, { headers: actorHeaders() });
    return unwrapResponse(data);
  },

  async attachments(id) {
    const { data } = await purchaseGet(`/requisitions/${await requisitionApi.resolveId(id)}/attachments`);
    return unwrapResponse(data);
  },

  async uploadAttachment(id, file) {
    const formData = new FormData();
    formData.append('file', file);
    const { data } = await purchaseUpload(`/requisitions/${await requisitionApi.resolveId(id)}/attachments`, formData);
    return unwrapResponse(data);
  },

  async deleteAttachment(id, attachmentId) {
    const { data } = await purchaseDelete(`/requisitions/${await requisitionApi.resolveId(id)}/attachments/${attachmentId}`);
    return unwrapResponse(data);
  }
};
