import api from '../api/axiosInstance';
import { normalizeApiError } from './cprService';

async function request(executor) {
  try {
    return await executor();
  } catch (error) {
    throw normalizeApiError(error);
  }
}

const costWorkoutService = {
  async listCws(params = {}, options = {}) {
    return request(async () => {
      const { data } = await api.get('/cost-workouts', { params, signal: options.signal });
      return data;
    });
  },

  // `config` is forwarded to the request as-is, so an auxiliary lookup whose
  // failure the caller renders itself (e.g. the Profit Workout prefill) can opt
  // out of the global error page with `{ suppressGlobalError: true }`.
  async getCw(id, config = {}) {
    return request(async () => {
      const { data } = await api.get(`/cost-workouts/${id}`, config);
      return data;
    });
  },

  // `options.suppressGlobalError`: the create form's "Save and Continue" reports
  // a rejected save with its own toast so the user stays on the form with every
  // entered value (the same convention cprService.createCpr already uses).
  // Omitted for every other caller, whose error presentation is unchanged.
  async createCw(payload, draft = false, options = {}) {
    return request(async () => {
      const { data } = await api.post('/cost-workouts', payload, {
        params: draft ? { draft: true } : {},
        suppressGlobalError: Boolean(options.suppressGlobalError)
      });
      return data;
    });
  },

  /**
   * Update a Cost Workout.
   *
   * `draft` is forwarded as the backend's `draft` request parameter, exactly
   * like {@link #createCw}: draft=true is an in-place, revision-free save (Save
   * Draft and the 30 s autosave). Dropping the flag turned those in-place saves
   * into an explicit save, which raises a new revision for an already-committed
   * record — including a record converted from a CPR item, whose edit page was
   * then left pointing at a superseded, read-only revision.
   */
  async updateCw(id, payload, draft = false, options = {}) {
    return request(async () => {
      const { data } = await api.put(`/cost-workouts/${id}`, payload, {
        params: draft ? { draft: true } : {},
        suppressGlobalError: Boolean(options.suppressGlobalError)
      });
      return data;
    });
  },

  async deleteCw(id) {
    return request(async () => {
      const { data } = await api.delete(`/cost-workouts/${id}`);
      return data;
    });
  },

  async permanentDeleteCw(id) {
    return request(async () => {
      const { data } = await api.delete(`/cost-workouts/${id}/permanent`);
      return data;
    });
  },

  async restoreCw(id) {
    return request(async () => {
      const { data } = await api.post(`/cost-workouts/${id}/restore`);
      return data;
    });
  },

  async archiveCw(id) {
    return request(async () => {
      const { data } = await api.post(`/cost-workouts/${id}/archive`);
      return data;
    });
  },

  async submitCw(id) {
    return request(async () => {
      const { data } = await api.post(`/cost-workouts/${id}/submit`);
      return data;
    });
  },

  async approveCw(id, remarks) {
    return request(async () => {
      const { data } = await api.post(`/cost-workouts/${id}/approve`, { remarks });
      return data;
    });
  },

  async rejectCw(id, remarks) {
    return request(async () => {
      const { data } = await api.post(`/cost-workouts/${id}/reject`, { remarks });
      return data;
    });
  },

  async duplicateCw(id) {
    return request(async () => {
      const { data } = await api.post(`/cost-workouts/${id}/duplicate`);
      return data;
    });
  },

  // Cost Workout → Quotation conversion. Returns the created quotation
  // (ConversionResult: module + id + number) so the UI can navigate to it.
  //
  // The callers render any backend validation message inline as a toast (only
  // approved Cost Workouts can be converted; an already-converted Cost Workout
  // reports the existing quotation), so the request opts out of the global
  // error screen — otherwise a validation reply would replace the working list
  // with the error page.
  async convertToQuotation(id) {
    return request(async () => {
      const { data } = await api.post(
        `/cost-workouts/${id}/convert-to-quotation`,
        undefined,
        { suppressGlobalError: true }
      );
      return data;
    });
  },

  // Cost Workout → Profit Workout conversion. This is the ONLY way a Profit
  // Workout is created from a Cost Workout (approving a CW never generates one).
  // The conversion is status-independent — a CW is convertible whatever its
  // current status.
  // Idempotent — returns the existing Profit Workout if this Cost Workout is
  // already converted.
  //
  // Both callers render any backend validation message inline as a toast, so
  // the request opts out of the global error screen — otherwise a validation
  // reply would replace the working list with the error page.
  async convertToProfitWorkout(id) {
    return request(async () => {
      const { data } = await api.post(
        `/cost-workouts/${id}/convert-to-profit-workout`,
        undefined,
        { suppressGlobalError: true }
      );
      return data;
    });
  },

  async getNextNumber() {
    return request(async () => {
      const { data } = await api.get('/cost-workouts/next-number');
      return data;
    });
  },

  async getStats(options = {}) {
    return request(async () => {
      const { data } = await api.get('/cost-workouts/stats', { signal: options.signal });
      return data;
    });
  },

  async getTimeline(id) {
    return request(async () => {
      const { data } = await api.get(`/cost-workouts/${id}/timeline`);
      return data;
    });
  },

  async getItems(id) {
    return request(async () => {
      const { data } = await api.get(`/cost-workouts/${id}/items`);
      return data;
    });
  },

  async getAttachments(id, config = {}) {
    return request(async () => {
      const { data } = await api.get(`/cost-workouts/${id}/attachments`, config);
      return data;
    });
  },

  async getCustomCategories() {
    return request(async () => {
      const { data } = await api.get('/cost-workouts/custom-categories');
      return data;
    });
  },

  async saveCustomCategories(categories) {
    return request(async () => {
      const { data } = await api.post('/cost-workouts/custom-categories', { categories });
      return data;
    });
  },

  async getCustomUnits() {
    return request(async () => {
      const { data } = await api.get('/cost-workouts/custom-units');
      return data;
    });
  },

  async saveCustomUnits(units) {
    return request(async () => {
      const { data } = await api.post('/cost-workouts/custom-units', { units });
      return data;
    });
  }
};

export default costWorkoutService;
