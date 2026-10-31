import api from '../api/axiosInstance';
import { normalizeApiError } from './cprService';

async function request(executor) {
  try {
    return await executor();
  } catch (error) {
    throw normalizeApiError(error);
  }
}

// Real Follow-up persistence — every call maps to the Spring Boot /followups
// endpoints backed by the `followups` MySQL table. Follow-ups are linked to a
// real lead via leadId; the backend snapshots the lead's fields at save time.
const followUpService = {
  // Generic list used by the CRM list pages (endpoint is 'followups').
  async listCrm(endpoint, params = {}, options = {}) {
    return request(async () => {
      const { data } = await api.get(`/${endpoint}`, { params, signal: options.signal });
      return data;
    });
  },

  async list(params = {}) {
    return request(async () => {
      const { data } = await api.get('/followups', { params });
      return data;
    });
  },

  // `config` is forwarded as-is; `{ suppressGlobalError: true }` marks an
  // auxiliary lookup whose failure the caller renders itself.
  async get(id, config = {}) {
    return request(async () => {
      const { data } = await api.get(`/followups/${id}`, config);
      return data;
    });
  },

  // Full follow-up history for one Lead/Client, newest first (server-sorted).
  async history(leadId, clientId) {
    return request(async () => {
      const params = {};
      if (leadId != null) params.leadId = leadId;
      if (clientId != null) params.clientId = clientId;
      const { data } = await api.get('/followups/history', { params });
      return data;
    });
  },

  async create(payload) {
    return request(async () => {
      const { data } = await api.post('/followups', payload);
      return data;
    });
  },

  async update(id, payload) {
    return request(async () => {
      const { data } = await api.put(`/followups/${id}`, payload);
      return data;
    });
  },

  async delete(id) {
    return request(async () => {
      const { data } = await api.delete(`/followups/${id}`);
      return data;
    });
  },

  async permanentDelete(id) {
    return request(async () => {
      const { data } = await api.delete(`/followups/${id}/permanent`);
      return data;
    });
  },

  async bulkPermanentDelete(ids) {
    return request(async () => {
      const { data } = await api.post('/followups/bulk-permanent-delete', { ids });
      return data;
    });
  },

  async archive(id) {
    return request(async () => {
      const { data } = await api.patch(`/followups/archive/${id}`);
      return data;
    });
  },

  async restore(id) {
    return request(async () => {
      const { data } = await api.patch(`/followups/restore/${id}`);
      return data;
    });
  },

  async duplicate(id) {
    return request(async () => {
      const { data } = await api.post(`/followups/${id}/duplicate`);
      return data;
    });
  },

  async getAttachments(id) {
    return request(async () => {
      const { data } = await api.get(`/followups/${id}/attachments`);
      return data;
    });
  },

  async addAttachment(id, formData) {
    return request(async () => {
      const { data } = await api.post(`/followups/${id}/attachments`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      return data;
    });
  }
};

export default followUpService;
