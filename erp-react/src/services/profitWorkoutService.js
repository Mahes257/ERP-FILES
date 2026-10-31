import api from '../api/axiosInstance';
import { normalizeApiError } from './cprService';

async function request(executor) {
  try {
    return await executor();
  } catch (error) {
    throw normalizeApiError(error);
  }
}

const profitWorkoutService = {
  async listPws(params = {}, options = {}) {
    return request(async () => {
      const { data } = await api.get('/profit-workouts', { params, signal: options.signal });
      return data;
    });
  },

  // `options.suppressGlobalError`: the Quotation form's conversion prefill
  // reports an unusable source in its own banner instead of replacing the route
  // with the global error page.
  async getPw(id, options = {}) {
    return request(async () => {
      const { data } = await api.get(`/profit-workouts/${id}`, {
        suppressGlobalError: Boolean(options.suppressGlobalError)
      });
      return data;
    });
  },

  // `options.suppressGlobalError`: a conversion-prefilled save reports a rejected
  // create (e.g. the Cost Workout already produced a Profit Workout) with its own
  // toast so the reviewed form and every entered value stay on screen.
  async createPw(payload, draft = false, options = {}) {
    return request(async () => {
      const { data } = await api.post('/profit-workouts', payload, {
        params: draft ? { draft: true } : {},
        suppressGlobalError: Boolean(options.suppressGlobalError)
      });
      return data;
    });
  },

  async updatePw(id, payload) {
    return request(async () => {
      const { data } = await api.put(`/profit-workouts/${id}`, payload);
      return data;
    });
  },

  async deletePw(id) {
    return request(async () => {
      const { data } = await api.delete(`/profit-workouts/${id}`);
      return data;
    });
  },

  async permanentDeletePw(id) {
    return request(async () => {
      const { data } = await api.delete(`/profit-workouts/${id}/permanent`);
      return data;
    });
  },

  async restorePw(id) {
    return request(async () => {
      const { data } = await api.post(`/profit-workouts/${id}/restore`);
      return data;
    });
  },

  async archivePw(id) {
    return request(async () => {
      const { data } = await api.post(`/profit-workouts/${id}/archive`);
      return data;
    });
  },

  async submitPw(id) {
    return request(async () => {
      const { data } = await api.post(`/profit-workouts/${id}/submit`);
      return data;
    });
  },

  async approvePw(id, remarks) {
    return request(async () => {
      const { data } = await api.post(`/profit-workouts/${id}/approve`, { remarks });
      return data;
    });
  },

  async rejectPw(id, remarks) {
    return request(async () => {
      const { data } = await api.post(`/profit-workouts/${id}/reject`, { remarks });
      return data;
    });
  },

  async duplicatePw(id) {
    return request(async () => {
      const { data } = await api.post(`/profit-workouts/${id}/duplicate`);
      return data;
    });
  },

  // Profit Workout → Quotation conversion. Returns the created quotation
  // (ConversionResult: module + id + number) so the UI can navigate to it.
  //
  // The caller renders any backend validation message inline as a toast (an
  // already-converted Profit Workout reports the existing quotation), so the
  // request opts out of the global error screen — otherwise a validation reply
  // would replace the working list with the 400 error page.
  async convertToQuotation(id) {
    return request(async () => {
      const { data } = await api.post(
        `/profit-workouts/${id}/convert-to-quotation`,
        undefined,
        { suppressGlobalError: true }
      );
      return data;
    });
  },

  async getNextNumber() {
    return request(async () => {
      const { data } = await api.get('/profit-workouts/next-number');
      return data;
    });
  },

  async getStats(options = {}) {
    return request(async () => {
      const { data } = await api.get('/profit-workouts/stats', { signal: options.signal });
      return data;
    });
  },

  async getTimeline(id) {
    return request(async () => {
      const { data } = await api.get(`/profit-workouts/${id}/timeline`);
      return data;
    });
  },

  async getItems(id) {
    return request(async () => {
      const { data } = await api.get(`/profit-workouts/${id}/items`);
      return data;
    });
  },

  async getAttachments(id) {
    return request(async () => {
      const { data } = await api.get(`/profit-workouts/${id}/attachments`);
      return data;
    });
  },

  async getCustomCategories() {
    return request(async () => {
      const { data } = await api.get('/profit-workouts/custom-categories');
      return data;
    });
  },

  async saveCustomCategories(categories) {
    return request(async () => {
      const { data } = await api.post('/profit-workouts/custom-categories', { categories });
      return data;
    });
  },

  async getCustomUnits() {
    return request(async () => {
      const { data } = await api.get('/profit-workouts/custom-units');
      return data;
    });
  },

  async saveCustomUnits(units) {
    return request(async () => {
      const { data } = await api.post('/profit-workouts/custom-units', { units });
      return data;
    });
  }
};

export default profitWorkoutService;
