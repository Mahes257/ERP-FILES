import api from '../api/axiosInstance';

/**
 * marketingAccessService.js
 * ------------------------------------------------------------------
 * Marketing Access Management API.
 *
 *   GET    /marketing/access/me                 → the signed-in user's permissions
 *   GET    /marketing/access/options            → roles, users, areas, defaults (ADMIN)
 *   GET    /marketing/access/scope/:type/:key   → one scope's configuration (ADMIN)
 *   PUT    /marketing/access/scope/:type/:key   → save one scope        (ADMIN)
 *   DELETE /marketing/access/scope/:type/:key   → reset one scope       (ADMIN)
 *
 * Nothing is cached in localStorage: the authoritative permissions live in the
 * backend and are re-read on every app load, so they survive a refresh, a new
 * tab, and a revoked permission without the client being able to keep access.
 * ------------------------------------------------------------------
 */

const marketingAccessService = {
  async getMyPermissions() {
    const { data } = await api.get('/marketing/access/me');
    return data?.data || null;
  },

  async getOptions() {
    const { data } = await api.get('/marketing/access/options');
    return data?.data || null;
  },

  async getScope(scopeType, scopeKey) {
    const { data } = await api.get(
      `/marketing/access/scope/${encodeURIComponent(scopeType)}/${encodeURIComponent(scopeKey)}`
    );
    return data?.data || null;
  },

  async saveScope(scopeType, scopeKey, permissions) {
    const { data } = await api.put(
      `/marketing/access/scope/${encodeURIComponent(scopeType)}/${encodeURIComponent(scopeKey)}`,
      { permissions }
    );
    return data?.data || null;
  },

  async resetScope(scopeType, scopeKey) {
    const { data } = await api.delete(
      `/marketing/access/scope/${encodeURIComponent(scopeType)}/${encodeURIComponent(scopeKey)}`
    );
    return data?.data || null;
  }
};

export default marketingAccessService;
