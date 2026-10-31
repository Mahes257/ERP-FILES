import api from '../api/axiosInstance';
import { normalizeApiError } from './leadService';

/**
 * CRM Contacts API client — the Contacts submodule's own REST resource.
 *
 * Every method talks to the real /contacts endpoints (Spring Boot), so the list
 * the page renders is exactly what MySQL holds: nothing is filtered, cached or
 * invented in the browser. Method names follow the conventions the shared CRM
 * list already calls on a module service (listCrm / get / create / update /
 * archive / restore / remove / permanentDelete / bulk*), which lets the Contacts
 * page reuse the Clients list component unchanged.
 */
async function request(executor) {
  try {
    return await executor();
  } catch (error) {
    throw normalizeApiError(error);
  }
}

const contactService = {
  /**
   * Paged list used by the Contacts page (endpoint 'contacts').
   * All params are forwarded verbatim, so search, sorting, pagination and the
   * contact filters are applied by the backend, never to a downloaded array.
   */
  async listCrm(endpoint = 'contacts', params = {}, options = {}) {
    return request(async () => {
      const { data } = await api.get(`/${endpoint}`, { params, signal: options.signal });
      return data;
    });
  },

  /** Real KPI counts (Active/Inactive/Primary/Secondary/lead- and client-linked). */
  async stats() {
    return request(async () => {
      const { data } = await api.get('/contacts/stats');
      return data;
    });
  },

  /** `config` is forwarded as-is, so an auxiliary lookup can suppress the global error page. */
  async get(id, config = {}) {
    return request(async () => {
      const { data } = await api.get(`/contacts/${id}`, config);
      return data;
    });
  },

  /** The contacts captured for one lead (its primary and secondary person). */
  async forLead(leadId, config = {}) {
    return request(async () => {
      const { data } = await api.get(`/contacts/lead/${leadId}`, config);
      return data;
    });
  },

  async create(payload) {
    return request(async () => {
      const { data } = await api.post('/contacts', payload);
      return data;
    });
  },

  async update(id, payload) {
    return request(async () => {
      const { data } = await api.put(`/contacts/${id}`, payload);
      return data;
    });
  },

  async setStatus(id, status) {
    return request(async () => {
      const { data } = await api.patch(`/contacts/${id}/status`, { status });
      return data;
    });
  },

  async archive(id) {
    return request(async () => {
      const { data } = await api.patch(`/contacts/archive/${id}`);
      return data;
    });
  },

  async restore(id) {
    return request(async () => {
      const { data } = await api.patch(`/contacts/restore/${id}`);
      return data;
    });
  },

  /** Trash (soft delete) — restorable from the Deleted tab, like every CRM list. */
  async remove(id) {
    return request(async () => {
      const { data } = await api.delete(`/contacts/${id}`);
      return data;
    });
  },

  async permanentDelete(id) {
    return request(async () => {
      const { data } = await api.delete(`/contacts/${id}/permanent`);
      return data;
    });
  },

  async bulkArchive(ids) {
    return request(async () => {
      const { data } = await api.post('/contacts/bulk-archive', { ids });
      return data;
    });
  },

  async bulkRestore(ids) {
    return request(async () => {
      const { data } = await api.post('/contacts/bulk-restore', { ids });
      return data;
    });
  },

  async bulkDelete(ids) {
    return request(async () => {
      const { data } = await api.post('/contacts/bulk-delete', { ids });
      return data;
    });
  },

  async bulkPermanentDelete(ids) {
    return request(async () => {
      const { data } = await api.post('/contacts/bulk-permanent-delete', { ids });
      return data;
    });
  },

  /** Idempotent, additive re-run of the lead → contact mirror (no deletions). */
  async backfill() {
    return request(async () => {
      const { data } = await api.post('/contacts/backfill');
      return data;
    });
  }
};

export default contactService;
