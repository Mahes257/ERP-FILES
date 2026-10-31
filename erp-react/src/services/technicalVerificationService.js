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

const technicalVerificationService = {
  async list(params = {}, options = {}) {
    return request(async () => {
      const { data } = await api.get('/cpr-technical-verifications', { params, signal: options.signal });
      return data;
    });
  },

  async getStats(division, options = {}) {
    return request(async () => {
      const params = {};
      if (division) params.division = division;
      const { data } = await api.get('/cpr-technical-verifications/stats', { params, signal: options.signal });
      return data;
    });
  },

  async get(id) {
    return request(async () => {
      const { data } = await api.get(`/cpr-technical-verifications/${id}`);
      return data;
    });
  },

  async getByCprId(cprId) {
    return request(async () => {
      const { data } = await api.get(`/cpr-technical-verifications/by-cpr/${cprId}`);
      return data;
    });
  },

  /**
   * Load the item-level Technical Verification records for a CPR.
   * The backend auto-carries forward every CPR item (one verification row per
   * item, referencing cprItemId) so all items render without manual selection.
   */
  async listByCpr(cprId, division) {
    return request(async () => {
      const params = division ? { division } : {};
      const { data } = await api.get(`/cpr-technical-verifications/by-cpr/${cprId}/items`, { params });
      return data;
    });
  },

  async create(payload) {
    return request(async () => {
      const { data } = await api.post('/cpr-technical-verifications', payload);
      return data;
    });
  },

  async update(id, payload) {
    return request(async () => {
      const { data } = await api.put(`/cpr-technical-verifications/${id}`, payload);
      return data;
    });
  },

  async updateStatus(id, status, remarks) {
    return request(async () => {
      const { data } = await api.patch(`/cpr-technical-verifications/${id}/status`, { status, remarks });
      return data;
    });
  },

  async updateDivision(id, division) {
    return request(async () => {
      const { data } = await api.patch(`/cpr-technical-verifications/${id}/division`, { division });
      return data;
    });
  },

  async forwardToCostWorkout(id, costWorkoutId) {
    return request(async () => {
      const { data } = await api.post(`/cpr-technical-verifications/${id}/forward-to-cost-workout`, { costWorkoutId });
      return data;
    });
  },

  /**
   * Convert the ONE CPR item behind this verification row into a new Cost Workout.
   *
   * No payload is sent: the backend reads the real CPR item and CPR header itself,
   * so the destination can never be assembled (or corrupted) by the browser. The
   * call is idempotent, so a second click returns the Cost Workout created first.
   */
  async convertToCostWorkout(id) {
    return request(async () => {
      const { data } = await api.post(`/cpr-technical-verifications/${id}/convert-to-cost-workout`, null, {
        // A conversion refusal (validation, permission, source record) is a
        // recoverable, row-level failure: the CPR page keeps the user's form and
        // shows the backend's own message, instead of being replaced by the
        // global 400 error page.
        suppressGlobalError: true
      });
      return data?.data ?? data;
    });
  },

  /** Convert the same single item into a new Purchase Requisition. */
  async convertToPurchaseRequisition(id) {
    return request(async () => {
      const { data } = await api.post(`/cpr-technical-verifications/${id}/convert-to-purchase-requisition`, null, {
        // Same contract as the CW conversion above: report it on the row.
        suppressGlobalError: true
      });
      return data?.data ?? data;
    });
  },

  async delete(id) {
    return request(async () => {
      const { data } = await api.delete(`/cpr-technical-verifications/${id}`);
      return data;
    });
  },

  async getDocuments(id, forRole) {
    return request(async () => {
      const params = forRole ? { forRole } : {};
      const { data } = await api.get(`/cpr-technical-verifications/${id}/documents`, { params });
      return data;
    });
  },

  async addDocument(id, file, visibility = 'TEAM_ONLY', onProgress) {
    return request(async () => {
      const formData = new FormData();
      formData.append('file', file);
      const { data } = await api.post(`/cpr-technical-verifications/${id}/documents`, formData, {
        params: { visibility },
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: onProgress
          ? (e) => onProgress(e.loaded || 0, e.total || 0)
          : undefined
      });
      return data;
    });
  },

  async updateDocumentVisibility(id, documentId, visibility) {
    return request(async () => {
      const { data } = await api.patch(`/cpr-technical-verifications/${id}/documents/${documentId}/visibility`, { visibility });
      return data;
    });
  },

  async deleteDocument(id, documentId) {
    return request(async () => {
      const { data } = await api.delete(`/cpr-technical-verifications/${id}/documents/${documentId}`);
      return data;
    });
  },

  async sendToCostWorkout(tvId, documentId, costWorkoutId) {
    return request(async () => {
      const { data } = await api.post(`/cpr-technical-verifications/${tvId}/documents/${documentId}/send-to-cost-workout`, { costWorkoutId });
      return data;
    });
  },

  async checkFileExists(cprId, drawingNumber) {
    return request(async () => {
      const { data } = await api.get('/cpr-technical-verifications/check-file', {
        params: { cprId, drawingNumber }
      });
      return data;
    });
  },

  async getCprItems(cprId) {
    return request(async () => {
      const { data } = await api.get(`/cpr-technical-verifications/cpr-items/${cprId}`);
      return data;
    });
  },

  /**
   * Full CPR detail for the Technical Verification create form.
   *
   * Reads the CPR module's own detail endpoint (GET /cprs/{id}), which already
   * carries the header fields, items and attachments the form pre-fills from.
   * The backend wraps it in ApiResponse<CprResponse>, so the envelope is
   * unwrapped here. The abort signal is honoured so switching CPRs quickly
   * cancels the in-flight request instead of racing the next one.
   */
  async getCprDetail(cprId, options = {}) {
    return request(async () => {
      const { data } = await api.get(`/cprs/${cprId}`, { signal: options.signal });
      return data?.data ?? data;
    });
  },

  async listAllCprs() {
    return request(async () => {
      const PAGE_SIZE = 100;
      let page = 0;
      const all = [];
      let done = false;
      while (!done) {
        const { data } = await api.get('/cprs', { params: { page, size: PAGE_SIZE } });
        const items = Array.isArray(data) ? data : (data?.content ?? data?.data ?? data?.rows ?? []);
        const total = data?.totalElements ?? data?.total ?? items.length;
        all.push(...(Array.isArray(items) ? items : []));
        done = all.length >= total || items.length < PAGE_SIZE;
        page += 1;
        if (page > 100) done = true;
      }
      return all;
    });
  },

  async listAllCostWorkouts() {
    return request(async () => {
      const { data } = await api.get('/cost-workouts', { params: { page: 0, size: 100 } });
      const items = Array.isArray(data) ? data : (data?.content ?? data?.data ?? data?.rows ?? []);
      return items;
    });
  }
};

export default technicalVerificationService;
