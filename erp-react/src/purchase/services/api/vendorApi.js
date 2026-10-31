/**
 * purchase/services/api/vendorApi.js
 * ------------------------------------------------------------------
 * REST calls for Vendor Management. Consumed by the `vendorService`
 * facade in ../vendor.js, which falls back to the mock implementation
 * when the backend is unreachable.
 * ------------------------------------------------------------------
 */
import { purchaseDelete, purchaseGet, purchasePatch, purchasePost, purchasePut } from '../../api';
import { getCurrentActor, normalizePage, unwrapResponse } from '../api-client';

/** Builds actor headers from the logged-in JWT user (never hardcoded). */
function actorHeaders() {
  const actor = getCurrentActor();
  return {
    'X-Actor-Id': actor.id,
    'X-Actor-Name': actor.name,
    'X-Actor-Role': actor.role
  };
}

/** Numeric PK when the vendor code is not a plain number. */
function numericVendorId(id) {
  const num = Number(id);
  return Number.isFinite(num) && String(num) === String(id) ? num : null;
}

/**
 * The whole Purchase UI identifies a vendor by its human code (V-0001):
 * the Vendor Code list column, detail Supplier Code, routes and the
 * nextVendorCode() draft all read `id`. The backend returns the numeric
 * PK in `id` and the code in `id2`/`vendorCode`, so responses are
 * normalised here — `id` becomes the code and the PK travels as
 * `numericId` for numeric-only endpoints (PUT /vendors/{id}).
 */
function normalizeVendor(record = {}) {
  if (!record || typeof record !== 'object') return record;
  const code = record.vendorCode ?? record.id2 ?? record.id;
  const numericId = numericVendorId(record.id) ?? numericVendorId(record.numericId);
  return {
    ...record,
    /* Aggregate metrics the master response does not carry (they are
       transaction-derived, so a supplier with no documents yet has
       none). Normalising them here — the same shape mock records
       always have — keeps KPI maths, sort keys and the list/report
       cells on 0 instead of leaking NaN/undefined into the UI. */
    onTimeDelivery: Number(record.onTimeDelivery) || 0,
    orders: Number(record.orders) || 0,
    spend: Number(record.spend) || 0,
    id: code,
    vendorCode: code,
    ...(numericId !== null ? { numericId } : {})
  };
}

export const vendorApi = {
  async names() {
    const { data } = await purchaseGet('/vendors', { size: 1000 });
    const page = normalizePage(unwrapResponse(data));
    return page.data.map((vendor) => vendor.name);
  },

  async list({ search, status, category, state, page = 1, pageSize = 10, sortBy = 'spend', sortDir = 'desc' } = {}) {
    const params = {
      page: page - 1,
      size: pageSize,
      ...(search ? { search } : {}),
      ...(status && status !== 'All' ? { status } : {}),
      ...(category && category !== 'All' ? { category } : {}),
      /* State was previously dropped here, so the Vendor List State filter
         was silently ignored even though the screen sent it. */
      ...(state && state !== 'All' ? { state } : {}),
      ...(sortBy ? { sort: sortDir === 'asc' ? sortBy : `-${sortBy}` } : {})
    };
    const { data } = await purchaseGet('/vendors', params);
    const normalized = normalizePage(unwrapResponse(data));
    return { ...normalized, data: normalized.data.map(normalizeVendor) };
  },

  async all() {
    const { data } = await purchaseGet('/vendors', { size: 10000 });
    const page = normalizePage(unwrapResponse(data));
    return page.data.map(normalizeVendor);
  },

  async get(id) {
    const { data } = await purchaseGet(`/vendors/${id}`);
    return normalizeVendor(unwrapResponse(data));
  },

  async create(payload) {
    const { data } = await purchasePost('/vendors', payload, { headers: actorHeaders() });
    return normalizeVendor(unwrapResponse(data));
  },

  async update(id, patch) {
    const numeric = numericVendorId(id);
    const target = numeric ?? id;
    const { data } = await purchasePut(`/vendors/${target}`, { ...patch, vendorCode: id }, { headers: actorHeaders() });
    return normalizeVendor(unwrapResponse(data));
  },

  async delete(id) {
    const numeric = numericVendorId(id);
    const { data } = await purchaseDelete(`/vendors/${numeric ?? id}`);
    return unwrapResponse(data);
  },

  async setStatus(id, status) {
    const numeric = numericVendorId(id);
    const { data } = await purchasePatch(`/vendors/${numeric ?? id}/status`, { status }, { headers: actorHeaders() });
    return normalizeVendor(unwrapResponse(data));
  },

  async duplicate(id) {
    const numeric = numericVendorId(id);
    const { data } = await purchasePost(`/vendors/${numeric ?? id}/duplicate`, null, { headers: actorHeaders() });
    return normalizeVendor(unwrapResponse(data));
  },

  async archive(id) {
    const numeric = numericVendorId(id);
    const { data } = await purchasePatch(`/vendors/${numeric ?? id}/archive`, null, { headers: actorHeaders() });
    return normalizeVendor(unwrapResponse(data));
  },

  async restore(id) {
    const numeric = numericVendorId(id);
    const { data } = await purchasePatch(`/vendors/${numeric ?? id}/restore`, null, { headers: actorHeaders() });
    return normalizeVendor(unwrapResponse(data));
  },

  async activity(id) {
    const numeric = numericVendorId(id);
    const { data } = await purchaseGet(`/vendors/${numeric ?? id}/activity`);
    return unwrapResponse(data);
  },

  async addComment(id, text) {
    const numeric = numericVendorId(id);
    const { data } = await purchasePost(`/vendors/${numeric ?? id}/comments`, { text }, { headers: actorHeaders() });
    return normalizeVendor(unwrapResponse(data));
  },

  async stats() {
    const { data } = await purchaseGet('/vendors/stats');
    return unwrapResponse(data);
  },

  async performance() {
    const { data } = await purchaseGet('/vendors/performance');
    return unwrapResponse(data);
  }
};
