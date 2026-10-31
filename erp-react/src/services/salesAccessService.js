import api from '../api/axiosInstance';

/**
 * salesAccessService.js
 * ------------------------------------------------------------------
 * Sales Access Management API — the same contract as Marketing Access
 * Management, on the Sales routes.
 *
 *   GET    /sales/access/me                  → the signed-in user's permissions
 *   GET    /sales/access/options             → roles, users, areas, defaults (ADMIN)
 *   GET    /sales/access/scope/:type/:key    → one scope's configuration     (ADMIN)
 *   PUT    /sales/access/scope/:type/:key    → save one scope                (ADMIN)
 *   DELETE /sales/access/scope/:type/:key    → reset one scope               (ADMIN)
 *
 * Nothing is cached in localStorage: the authoritative permissions live in the
 * backend and are re-read on every app load, so they survive a refresh, a new
 * tab, and a revoked permission without the client being able to keep access.
 * ------------------------------------------------------------------
 */

const salesAccessService = {
  async getMyPermissions() {
    const { data } = await api.get('/sales/access/me');
    return data?.data || null;
  },

  async getOptions() {
    const { data } = await api.get('/sales/access/options');
    return data?.data || null;
  },

  async getScope(scopeType, scopeKey) {
    const { data } = await api.get(
      `/sales/access/scope/${encodeURIComponent(scopeType)}/${encodeURIComponent(scopeKey)}`
    );
    return data?.data || null;
  },

  async saveScope(scopeType, scopeKey, permissions) {
    const { data } = await api.put(
      `/sales/access/scope/${encodeURIComponent(scopeType)}/${encodeURIComponent(scopeKey)}`,
      { permissions }
    );
    return data?.data || null;
  },

  async resetScope(scopeType, scopeKey) {
    const { data } = await api.delete(
      `/sales/access/scope/${encodeURIComponent(scopeType)}/${encodeURIComponent(scopeKey)}`
    );
    return data?.data || null;
  }
};

export default salesAccessService;
