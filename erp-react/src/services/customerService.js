import api from '../api/axiosInstance';
import { normalizeApiError } from './cprService';

async function request(executor) {
  try {
    return await executor();
  } catch (error) {
    throw normalizeApiError(error);
  }
}

const customerService = {
  // Generic list used by the CRM Clients page (endpoint 'customers').
  async listCrm(endpoint, params = {}, options = {}) {
    return request(async () => {
      const { data } = await api.get(`/${endpoint}`, {
        params: { q: params.search || undefined, status: params.status || undefined },
        signal: options.signal
      });
      return data;
    });
  },

  async list(q) {
    return request(async () => {
      const { data } = await api.get('/customers', { params: q ? { q } : {} });
      return data;
    });
  },

  // `config` is forwarded as-is; `{ suppressGlobalError: true }` marks an
  // auxiliary lookup whose failure the caller renders itself.
  async get(id, config = {}) {
    return request(async () => {
      const { data } = await api.get(`/customers/${id}`, config);
      return data;
    });
  },

  /** Check for duplicate clients by business name, GSTIN, or PAN. */
  async checkDuplicate({ businessName, gstin, pan, excludeId } = {}) {
    return request(async () => {
      const params = {};
      if (businessName) params.businessName = businessName;
      if (gstin) params.gstin = gstin;
      if (pan) params.pan = pan;
      if (excludeId) params.excludeId = excludeId;
      const { data } = await api.get('/customers/check-duplicate', { params });
      return data;
    });
  },

  async create(payload) {
    return request(async () => {
      const { data } = await api.post('/customers', payload);
      return data;
    });
  },

  async update(id, payload) {
    return request(async () => {
      const { data } = await api.put(`/customers/${id}`, payload);
      return data;
    });
  },

  async remove(id) {
    return request(async () => {
      const { data } = await api.delete(`/customers/${id}`);
      return data;
    });
  },

  async permanentDelete(id) {
    return request(async () => {
      const { data } = await api.delete(`/customers/${id}/permanent`);
      return data;
    });
  },

  async bulkPermanentDelete(ids) {
    return request(async () => {
      const { data } = await api.post('/customers/bulk-permanent-delete', { ids });
      return data;
    });
  },

  async archive(id) {
    return request(async () => {
      const { data } = await api.patch(`/customers/archive/${id}`);
      return data;
    });
  },

  async restore(id) {
    return request(async () => {
      const { data } = await api.patch(`/customers/restore/${id}`);
      return data;
    });
  },

  async duplicate(id) {
    return request(async () => {
      const { data } = await api.post(`/customers/${id}/duplicate`);
      return data;
    });
  },

  async setStatus(id, status) {
    return request(async () => {
      const { data } = await api.patch(`/customers/${id}/status`, { status });
      return data;
    });
  },

  async getTimeline(id) {
    return request(async () => {
      const { data } = await api.get(`/customers/${id}/timeline`);
      return data;
    });
  },

  async getActivities(id) {
    return request(async () => {
      const { data } = await api.get(`/customers/${id}/activities`);
      return data;
    });
  },

  async getStatement(id) {
    return request(async () => {
      const { data } = await api.get(`/customers/${id}/statement`);
      return data;
    });
  },

  async getAttachments(id) {
    return request(async () => {
      const { data } = await api.get(`/customers/${id}/attachments`);
      return data;
    });
  },

  async addAttachment(id, formData) {
    return request(async () => {
      const { data } = await api.post(`/customers/${id}/attachments`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      return data;
    });
  }
};

export default customerService;
