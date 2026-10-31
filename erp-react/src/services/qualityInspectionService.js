import api from '../api/axiosInstance';

async function request(executor) {
  try {
    return await executor();
  } catch (error) {
    if (error?.code === 'ECONNABORTED' || /timeout of \d+ms exceeded/.test(error?.message || '')) {
      throw { message: 'The request timed out. Please try again.', status: null, data: null, timedOut: true };
    }
    if (error.response) {
      throw {
        message: error.response.data?.message || error.response.data?.error || `Request failed with status ${error.response.status}`,
        status: error.response.status,
        data: error.response.data
      };
    }
    if (error.request) {
      throw { message: 'Unable to reach the server. Please check your network connection.', status: null, data: null };
    }
    throw { message: error.message || 'An unexpected error occurred.', status: null, data: null };
  }
}

const qualityInspectionService = {
  async list(params = {}, options = {}) {
    return request(async () => {
      const { data } = await api.get('/quality-inspections', { params, signal: options.signal });
      return data;
    });
  },

  async getStats(productionOrder, options = {}) {
    return request(async () => {
      const params = {};
      if (productionOrder) params.productionOrder = productionOrder;
      const { data } = await api.get('/quality-inspections/stats', { params, signal: options.signal });
      return data;
    });
  },

  async getByOrder(productionOrderId) {
    return request(async () => {
      const { data } = await api.get(`/quality-inspections/by-order/${productionOrderId}`);
      return data;
    });
  },

  async get(id) {
    return request(async () => {
      const { data } = await api.get(`/quality-inspections/${id}`);
      return data;
    });
  },

  async create(payload) {
    return request(async () => {
      const { data } = await api.post('/quality-inspections', payload);
      return data;
    });
  },

  async update(id, payload) {
    return request(async () => {
      const { data } = await api.put(`/quality-inspections/${id}`, payload);
      return data;
    });
  },

  async delete(id) {
    return request(async () => {
      const { data } = await api.delete(`/quality-inspections/${id}`);
      return data;
    });
  },

  async updateStatus(id, status, action, remarks) {
    return request(async () => {
      const { data } = await api.patch(`/quality-inspections/${id}/status`, { status, action, remarks });
      return data;
    });
  },

  async startInspection(id) {
    return request(async () => {
      const { data } = await api.post(`/quality-inspections/${id}/start`);
      return data;
    });
  },

  async markPassed(id) {
    return request(async () => {
      const { data } = await api.post(`/quality-inspections/${id}/pass`);
      return data;
    });
  },

  async markFailed(id) {
    return request(async () => {
      const { data } = await api.post(`/quality-inspections/${id}/fail`);
      return data;
    });
  },

  async putOnHold(id) {
    return request(async () => {
      const { data } = await api.post(`/quality-inspections/${id}/hold`);
      return data;
    });
  },

  async saveQcData(id, qcData) {
    return request(async () => {
      const { data } = await api.put(`/quality-inspections/${id}/qc-data`, qcData);
      return data;
    });
  },

  async updateChecklistItem(id, index, result, remarks) {
    return request(async () => {
      const { data } = await api.patch(`/quality-inspections/${id}/checklist`, { index, result, remarks });
      return data;
    });
  },
};

export default qualityInspectionService;
