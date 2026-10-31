import api from '../api/axiosInstance';

/**
 * The seven visibility values of com.vishatech.erp.entity.DocumentVisibility.
 * Shared label source for settings UIs (Documents.jsx keeps its own
 * icon/badge meta, which is presentation-coupled to that page).
 */
export const DOCUMENT_VISIBILITY_OPTIONS = [
  { value: 'ADMIN_ONLY', label: 'Admin Only' },
  { value: 'SALES_TEAM_ONLY', label: 'Sales Team' },
  { value: 'ACCOUNTS_TEAM_ONLY', label: 'Accounts Team' },
  { value: 'PURCHASE_TEAM_ONLY', label: 'Purchase Team' },
  { value: 'TEAM_ONLY', label: 'Team Only' },
  { value: 'CUSTOMER', label: 'Customer' },
  { value: 'BOTH', label: 'Both' }
];

/**
 * Document Settings (Settings → Documents): the default visibility applied to
 * NEW general documents when no specific visibility is supplied.
 * Backed by the persisted app_settings key `document_default_visibility`
 * (backend default ADMIN_ONLY). Writes are ADMIN-only server-side.
 */
const documentSettingsService = {
  /**
   * @param {{suppressGlobalError?: boolean}} [options] A page that only *shows*
   *   this value next to its own settings can pass `suppressGlobalError: true`
   *   so a caller without SETTINGS_MANAGE keeps its page instead of the global
   *   error page; the read still rejects and the caller keeps its own default.
   * @returns {Promise<{defaultVisibility: string, lastUpdated: string|null}>}
   */
  async get({ suppressGlobalError = false } = {}) {
    const { data } = await api.get('/settings/documents',
      suppressGlobalError ? { suppressGlobalError: true } : undefined);
    return data?.data ?? data;
  },

  /**
   * Persist the default visibility for new general documents.
   * @param {string} defaultVisibility one of DOCUMENT_VISIBILITY_OPTIONS values
   */
  async updateDefaultVisibility(defaultVisibility) {
    const { data } = await api.put('/settings/documents', { defaultVisibility });
    return data?.data ?? data;
  }
};

export default documentSettingsService;
