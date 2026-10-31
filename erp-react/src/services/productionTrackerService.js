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

const productionTrackerService = {
  async list(params = {}, options = {}) {
    return request(async () => {
      const { data } = await api.get('/production-trackers', { params, signal: options.signal });
      return data;
    });
  },

  async getStats(options = {}) {
    return request(async () => {
      const { data } = await api.get('/production-trackers/stats', { signal: options.signal });
      return data;
    });
  },

  async get(id) {
    return request(async () => {
      const { data } = await api.get(`/production-trackers/${id}`);
      return data;
    });
  },

  async getByCpo(cpoNo) {
    return request(async () => {
      const { data } = await api.get(`/production-trackers/by-cpo/${cpoNo}`);
      return data;
    });
  },

  async create(payload) {
    return request(async () => {
      const { data } = await api.post('/production-trackers', payload);
      return data;
    });
  },

  async update(id, payload) {
    return request(async () => {
      const { data } = await api.put(`/production-trackers/${id}`, payload);
      return data;
    });
  },

  async delete(id) {
    return request(async () => {
      const { data } = await api.delete(`/production-trackers/${id}`);
      return data;
    });
  },
};

export default productionTrackerService;
