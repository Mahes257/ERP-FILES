/**
 * purchase/services/api/purchaseOrderApi.js
 * ------------------------------------------------------------------
 * REST calls for Purchase Orders. Consumed by the `purchaseOrderService`
 * facade in ../purchaseOrder.js, which falls back to the mock
 * implementation when the backend is unreachable.
 * ------------------------------------------------------------------
 */
import { purchaseDelete, purchaseGet, purchasePatch, purchasePost, purchasePut } from '../../api';
import { getCurrentActor, normalizePage, unwrapResponse } from '../api-client';
import { normalizePoRecord, normalizePOStatus } from '../../constants';

function actorHeaders() {
  const actor = getCurrentActor();
  return { 'X-Actor-Id': actor.id, 'X-Actor-Name': actor.name, 'X-Actor-Role': actor.role };
}

/**
 * Normalizes a PO record and adds the derived `acknowledged` boolean the UI
 * (Released Orders / Supplier Acknowledgement / sidebar badge) reads. The
 * REST record stores the timestamp (`acknowledgedAt`) and exposes no boolean
 * flag, whereas the mock store persists `acknowledged` — so the boolean is
 * derived here to keep both modes identical.
 */
function normalizeOrder(order) {
  const normalized = normalizePoRecord(order);
  if (!normalized || normalized.acknowledged !== undefined) return normalized;
  return { ...normalized, acknowledged: Boolean(normalized.acknowledgedAt) };
}

/** True when the value is already a numeric database id (not a PO number). */
function isNumericId(value) {
  return /^\d+$/.test(String(value ?? '').trim());
}

export const purchaseOrderApi = {
  /**
   * Resolves a Purchase Order identifier to the numeric database id the
   * by-id routes require.
   *
   * Callers legitimately hold either form: list rows expose the numeric
   * `id`, while the invoice printer / viewer and the GRN printer only know
   * the PO document number (e.g. "PO-2026-0028"). `GET /orders/{id}` binds
   * a `Long` path variable, so handing it a document number yields a 400.
   * A document number is therefore resolved against the existing list
   * search — which already matches `poNo` — instead of guessing. Numeric
   * ids pass straight through, so existing callers are unaffected.
   */
  async resolveId(id) {
    if (isNumericId(id)) return id;
    const wanted = String(id ?? '').trim();
    if (!wanted) throw new Error('A purchase order id or number is required');
    const { data } = await purchaseGet('/orders', { page: 0, size: 10, search: wanted });
    const pageData = normalizePage(unwrapResponse(data));
    const match = (pageData.data || []).find(
      (row) => String(row.poNo) === wanted || String(row.orderNo) === wanted
    );
    if (!match || match.id == null) throw new Error(`Purchase order ${wanted} was not found`);
    return match.id;
  },
  async list({ search, status, page = 1, pageSize = 10, sortBy = 'orderDate', sortDir = 'desc' } = {}) {
    const { data } = await purchaseGet('/orders', {
      page: page - 1,
      size: pageSize,
      ...(search ? { search } : {}),
      ...(status && status !== 'All' ? { status } : {}),
      ...(sortBy ? { sort: sortDir === 'asc' ? sortBy : `-${sortBy}` } : {})
    });
    const pageData = normalizePage(unwrapResponse(data));
    return {
      ...pageData,
      data: (pageData.data || []).map(normalizeOrder)
    };
  },

  async get(id) {
    const resolved = await purchaseOrderApi.resolveId(id);
    const { data } = await purchaseGet(`/orders/${resolved}`);
    return normalizeOrder(unwrapResponse(data));
  },

  async create(payload) {
    const { data } = await purchasePost('/orders', payload, { headers: actorHeaders() });
    return normalizeOrder(unwrapResponse(data));
  },

  async update(id, patch) {
    const { data } = await purchasePut(`/orders/${id}`, patch, { headers: actorHeaders() });
    return normalizeOrder(unwrapResponse(data));
  },

  async delete(id) {
    const { data } = await purchaseDelete(`/orders/${id}`);
    return unwrapResponse(data);
  },

  async approve(id) {
    const { data } = await purchasePost(`/orders/${id}/approve`, null, { headers: actorHeaders() });
    return normalizeOrder(unwrapResponse(data));
  },

  async submit(id) {
    const { data } = await purchasePost(`/orders/${id}/submit`, null, { headers: actorHeaders() });
    return normalizeOrder(unwrapResponse(data));
  },

  async reject(id) {
    const { data } = await purchasePost(`/orders/${id}/reject`, null, { headers: actorHeaders() });
    return normalizeOrder(unwrapResponse(data));
  },

  async release(id) {
    const { data } = await purchasePost(`/orders/${id}/release`, null, { headers: actorHeaders() });
    return normalizeOrder(unwrapResponse(data));
  },

  async setDeliveryStatus(id, status) {
    const { data } = await purchasePatch(`/orders/${id}/delivery-status`, { status }, { headers: actorHeaders() });
    return normalizeOrder(unwrapResponse(data));
  },

  async acknowledge(id) {
    const { data } = await purchasePost(`/orders/${id}/acknowledge`, null, { headers: actorHeaders() });
    return normalizeOrder(unwrapResponse(data));
  },

  async remind(id, note = '') {
    const { data } = await purchasePost(`/orders/${id}/reminder`, { note }, { headers: actorHeaders() });
    return normalizeOrder(unwrapResponse(data));
  },

  async timeline(id) {
    const { data } = await purchaseGet(`/orders/${id}/timeline`);
    return unwrapResponse(data);
  },

  async nextNumber() {
    const { data } = await purchaseGet('/orders/next-number');
    return unwrapResponse(data);
  },

  async stats() {
    const { data } = await purchaseGet('/orders/stats');
    const raw = unwrapResponse(data) || {};
    const normalized = { ...raw };
    if (raw.Open != null && raw[normalizePOStatus('In Progress')] == null) normalized[normalizePOStatus('In Progress')] = raw.Open;
    if (raw.Partial != null && raw[normalizePOStatus('Partially Delivered')] == null) normalized[normalizePOStatus('Partially Delivered')] = raw.Partial;
    delete normalized.Open;
    delete normalized.Partial;
    return normalized;
  }
};
