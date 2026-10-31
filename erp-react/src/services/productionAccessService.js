import api from '../api/axiosInstance';

/**
 * productionAccessService.js
 * ------------------------------------------------------------------
 * Production Access Management API — the same contract as Marketing and Sales
 * Access Management, on the Production routes.
 *
 *   GET    /production/access/me                  → the signed-in user's permissions
 *   GET    /production/access/options             → roles, users, areas, defaults (ADMIN)
 *   GET    /production/access/scope/:type/:key    → one scope's configuration     (ADMIN)
 *   PUT    /production/access/scope/:type/:key    → save one scope                (ADMIN)
 *   DELETE /production/access/scope/:type/:key    → reset one scope               (ADMIN)
 *
 * Nothing is cached in localStorage: the authoritative permissions live in the
 * backend and are re-read on every app load, so they survive a refresh, a new
 * tab, and a revoked permission without the client being able to keep access.
 * ------------------------------------------------------------------
 */

const productionAccessService = {
  async getMyPermissions() {
    const { data } = await api.get('/production/access/me');
    return data?.data || null;
  },

  async getOptions() {
    const { data } = await api.get('/production/access/options');
    return data?.data || null;
  },

  async getScope(scopeType, scopeKey) {
    const { data } = await api.get(
      `/production/access/scope/${encodeURIComponent(scopeType)}/${encodeURIComponent(scopeKey)}`
    );
    return data?.data || null;
  },

  async saveScope(scopeType, scopeKey, permissions) {
    const { data } = await api.put(
      `/production/access/scope/${encodeURIComponent(scopeType)}/${encodeURIComponent(scopeKey)}`,
      { permissions }
    );
    return data?.data || null;
  },

  async resetScope(scopeType, scopeKey) {
    const { data } = await api.delete(
      `/production/access/scope/${encodeURIComponent(scopeType)}/${encodeURIComponent(scopeKey)}`
    );
    return data?.data || null;
  }
};

export default productionAccessService;
