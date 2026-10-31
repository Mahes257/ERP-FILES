/**
 * purchase/api/index.js
 * ------------------------------------------------------------------
 * Purchase module API client.
 *
 * Uses the app-wide shared Axios instance (src/api/axiosInstance.js),
 * which already attaches the JWT bearer token to every request and
 * redirects to /signin on 401/403.
 *
 * The mock data layer is test-only. Production Purchase services call these
 * endpoints and surface backend/network errors instead of showing stale data.
 *
 * NOTE (navigation performance): this file imports nothing from the
 * Purchase service layer except the tiny `base.js` notification helper —
 * plus the dependency-free `utils/readCache` — so it stays a leaf module
 * and no import cycle is created.
 * ------------------------------------------------------------------
 */
import api from '../../api/axiosInstance';
import { notifyPurchaseDataChanged } from '../services/base';
import { invalidateReadCache } from '../../utils/readCache';

/**
 * Base path for the Purchase REST API on the Spring Boot server
 * (served under the /v1 context path, e.g. /v1/api/purchase/...).
 * Set VITE_PURCHASE_API_BASE to override in .env.
 */
export const PURCHASE_API_BASE = import.meta.env?.VITE_PURCHASE_API_BASE || '/api/purchase';

const withBase = (path) => `${PURCHASE_API_BASE}${path}`;

/** GET helper. */
export const purchaseGet = (path, params, opts) => api.get(withBase(path), { params, ...opts });

/**
 * Every Purchase write goes through here. On success the shared
 * "purchase data changed" event is fired ONCE so cross-cutting consumers
 * (the sidebar badge counts) refresh in place — no polling and no
 * per-navigation refetching required.
 *
 * Every cached Purchase read is dropped at the same time: a create / update /
 * delete can change the vendor, department, company or user pickers, so the
 * next read must come from the API rather than from a stale cache entry.
 */
const writeRequest = (executor) =>
  executor().then((response) => {
    invalidateReadCache('purchase:');
    notifyPurchaseDataChanged();
    return response;
  });

/** POST helper (JSON body). */
export const purchasePost = (path, body, opts) =>
  writeRequest(() => api.post(withBase(path), body, opts));

/** PATCH helper. */
export const purchasePatch = (path, body, opts) =>
  writeRequest(() => api.patch(withBase(path), body, opts));

/** PUT helper. */
export const purchasePut = (path, body, opts) =>
  writeRequest(() => api.put(withBase(path), body, opts));

/** DELETE helper. */
export const purchaseDelete = (path, opts) =>
  writeRequest(() => api.delete(withBase(path), opts));

/** Multipart upload helper (used for attachments). */
export const purchaseUpload = (path, formData) =>
  writeRequest(() =>
    api.post(withBase(path), formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
  );

/** Raw client (exposed for advanced callers). */
export default api;
