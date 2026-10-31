import api from '../api/axiosInstance';

/**
 * purchaseAccessService.js
 * ------------------------------------------------------------------
 * Purchase Access Management API — the same contract as Marketing, Sales and
 * Production Access Management, on the Purchase routes.
 *
 *   GET    /purchase/access/me                  → the signed-in user's permissions
 *   GET    /purchase/access/options             → roles, users, areas, defaults (ADMIN)
 *   GET    /purchase/access/scope/:type/:key    → one scope's configuration     (ADMIN)
 *   PUT    /purchase/access/scope/:type/:key    → save one scope                (ADMIN)
 *   DELETE /purchase/access/scope/:type/:key    → reset one scope               (ADMIN)
 *
 * Nothing is cached in localStorage: the authoritative permissions live in the
 * backend and are re-read on every app load, so they survive a refresh, a new
 * tab, a sign-out/sign-in and a revoked permission without the client being able
 * to keep access.
 * ------------------------------------------------------------------
 */

const purchaseAccessService = {
  async getMyPermissions() {
    const { data } = await api.get('/purchase/access/me');
    return data?.data || null;
  },

  async getOptions() {
    const { data } = await api.get('/purchase/access/options');
    return data?.data || null;
  },

  async getScope(scopeType, scopeKey) {
    const { data } = await api.get(
      `/purchase/access/scope/${encodeURIComponent(scopeType)}/${encodeURIComponent(scopeKey)}`
    );
    return data?.data || null;
  },

  async saveScope(scopeType, scopeKey, permissions) {
    const { data } = await api.put(
      `/purchase/access/scope/${encodeURIComponent(scopeType)}/${encodeURIComponent(scopeKey)}`,
      { permissions }
    );
    return data?.data || null;
  },

  async resetScope(scopeType, scopeKey) {
    const { data } = await api.delete(
      `/purchase/access/scope/${encodeURIComponent(scopeType)}/${encodeURIComponent(scopeKey)}`
    );
    return data?.data || null;
  }
};

export default purchaseAccessService;
