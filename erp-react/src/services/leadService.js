import api from '../api/axiosInstance';

export function normalizeApiError(error) {
  // Axios timeout (global 30s cap): surface it clearly instead of the generic
  // "network connection" message, which hides the real recovery path.
  if (error?.code === 'ECONNABORTED' || /timeout of \d+ms exceeded/.test(error?.message || '')) {
    return {
      message: 'The request timed out. Please try again.',
      status: null,
      data: null,
      timedOut: true
    };
  }
  if (error.response) {
    const serverMessage =
      error.response.data?.message ||
      error.response.data?.error ||
      error.response.data?.detail ||
      `Request failed with status ${error.response.status}`;
    return {
      message: serverMessage,
      status: error.response.status,
      data: error.response.data
    };
  }
  if (error.request) {
    return {
      message: 'Unable to reach the server. Please check your network connection.',
      status: null,
      data: null
    };
  }
  return {
    message: error.message || 'An unexpected error occurred.',
    status: null,
    data: null
  };
}

async function request(executor) {
  try {
    return await executor();
  } catch (error) {
    throw normalizeApiError(error);
  }
}

const leadService = {
  async listLeads(params = {}) {
    return request(async () => {
      const { data } = await api.get('/leads', { params });
      return data;
    });
  },

  // Clients come from the real `customers` table via the /customers API — NOT
  // from leads (the ERP's leads WHERE stage=WON shortcut is not used).
  async listClients(params = {}) {
    return request(async () => {
      const { data } = await api.get('/customers', { params });
      return data;
    });
  },

  // `config` is forwarded to the request as-is, so a caller making an
  // auxiliary lookup (one whose failure it renders itself) can opt out of the
  // global error page with `{ suppressGlobalError: true }`.
  async getLead(id, config = {}) {
    return request(async () => {
      const { data } = await api.get(`/leads/${id}`, config);
      return data;
    });
  },

  async createLead(payload) {
    return request(async () => {
      const { data } = await api.post('/leads', payload);
      return data;
    });
  },

  async updateLead(id, payload) {
    return request(async () => {
      const { data } = await api.put(`/leads/${id}`, payload);
      return data;
    });
  },

  async deleteLead(id) {
    return request(async () => {
      const { data } = await api.delete(`/leads/${id}`);
      return data;
    });
  },

  async permanentDeleteLead(id) {
    return request(async () => {
      const { data } = await api.delete(`/leads/${id}/permanent`);
      return data;
    });
  },

  async archiveLead(id) {
    return request(async () => {
      const { data } = await api.patch(`/leads/archive/${id}`);
      return data;
    });
  },

  async restoreLead(id) {
    return request(async () => {
      const { data } = await api.patch(`/leads/restore/${id}`);
      return data;
    });
  },

  async markInactive(id) {
    return request(async () => {
      const { data } = await api.patch(`/leads/inactive/${id}`);
      return data;
    });
  },

  /**
   * Close Lead: the lead leaves the active pipeline for good (it stays readable
   * and keeps its history). The backend persists it and rejects new follow-ups,
   * CPRs, quotations and edits for it; closing twice is a harmless no-op.
   */
  async closeLead(id) {
    return request(async () => {
      const { data } = await api.patch(`/leads/close/${id}`);
      return data;
    });
  },

  async markActive(id) {
    return request(async () => {
      const { data } = await api.patch(`/leads/active/${id}`);
      return data;
    });
  },

  async listCrm(endpoint, params = {}, options = {}) {
    return request(async () => {
      const { data } = await api.get(`/${endpoint}`, { params, signal: options.signal });
      return data;
    });
  },

  async bulkDelete(ids) {
    return request(async () => {
      const { data } = await api.post('/leads/bulk-delete', { ids });
      return data;
    });
  },

  async bulkPermanentDelete(ids) {
    return request(async () => {
      const { data } = await api.post('/leads/bulk-permanent-delete', { ids });
      return data;
    });
  },

  async bulkArchive(ids) {
    return request(async () => {
      const { data } = await api.post('/leads/bulk-archive', { ids });
      return data;
    });
  },

  async bulkRestore(ids) {
    return request(async () => {
      const { data } = await api.post('/leads/bulk-restore', { ids });
      return data;
    });
  },

  async assignOwner(id, owner) {
    return request(async () => {
      const { data } = await api.patch(`/leads/${id}/owner`, { owner });
      return data;
    });
  },

  async changeStage(id, stage) {
    return request(async () => {
      const { data } = await api.patch(`/leads/${id}/stage`, { stage });
      return data;
    });
  },

  async changePriority(id, priority) {
    return request(async () => {
      const { data } = await api.patch(`/leads/${id}/priority`, { priority });
      return data;
    });
  },

  async exportLeads(payload = {}, options = {}) {
    return request(async () => {
      const { data } = await api.post('/leads/export', payload, options);
      return data;
    });
  },

  async importLeads(formData) {
    return request(async () => {
      const { data } = await api.post('/leads/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      return data;
    });
  },

  async duplicateLead(id) {
    return request(async () => {
      const { data } = await api.post(`/leads/${id}/duplicate`);
      return data;
    });
  },

  // Automatic Lead → Follow-up conversion (idempotent — returns the existing
  // follow-up when one is already present for the lead).
  async createFollowUp(leadId) {
    return request(async () => {
      const { data } = await api.post(`/leads/${leadId}/follow-up`);
      return data;
    });
  },

  async getTimeline(id) {
    return request(async () => {
      const { data } = await api.get(`/leads/${id}/timeline`);
      return data;
    });
  },

  async getActivities(id) {
    return request(async () => {
      const { data } = await api.get(`/leads/${id}/activities`);
      return data;
    });
  },

  async getNotes(id) {
    return request(async () => {
      const { data } = await api.get(`/leads/${id}/notes`);
      return data;
    });
  },

  async addNote(id, payload) {
    return request(async () => {
      const { data } = await api.post(`/leads/${id}/notes`, payload);
      return data;
    });
  },

  async getAttachments(id) {
    return request(async () => {
      const { data } = await api.get(`/leads/${id}/attachments`);
      return data;
    });
  },

  async addAttachment(id, formData) {
    return request(async () => {
      const { data } = await api.post(`/leads/${id}/attachments`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      return data;
    });
  },

  async getHistory(id) {
    return request(async () => {
      const { data } = await api.get(`/leads/${id}/history`);
      return data;
    });
  },

  async getUsers() {
    return request(async () => {
      const { data } = await api.get('/users');
      return data;
    });
  }
};

export default leadService;
