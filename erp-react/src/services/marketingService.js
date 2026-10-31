import api from '../api/axiosInstance';
import { normalizeApiError } from './cprService';
import { getAttachmentLimitError } from '../utils/attachmentStorage';

async function request(executor) {
  try {
    return await executor();
  } catch (error) {
    throw normalizeApiError(error);
  }
}

/**
 * Unwrap the ApiResponse envelope ({ success, message, data }) when a single-record
 * endpoint uses it. The marketing endpoints are inconsistent: GET
 * /marketing/follow-ups/{id} wraps its payload, while GET /marketing/activities/{id}
 * returns the record directly. Normalising here means callers always receive the
 * record itself instead of reading every field off the envelope as undefined
 * (which left the edit form blank and wiped fields on save).
 */
function unwrapApiPayload(payload) {
  if (
    payload &&
    typeof payload === 'object' &&
    !Array.isArray(payload) &&
    'success' in payload &&
    'data' in payload
  ) {
    return payload.data;
  }
  return payload;
}

// Offline Marketing module — mirrors the /marketing Spring Boot endpoints 1:1.
const marketingService = {
  async list(params = {}, options = {}) {
    return request(async () => {
      const { data } = await api.get('/marketing/visits', { params, signal: options.signal });
      return data;
    });
  },

  // Alias for the list page — returns real Visit records from GET /marketing/visits.
  async listVisits(params = {}) {
    return request(async () => {
      const { data } = await api.get('/marketing/visits', { params });
      return data;
    });
  },

  async get(id) {
    return request(async () => {
      const { data } = await api.get(`/marketing/visits/${id}`);
      return data;
    });
  },

  async create(payload) {
    return request(async () => {
      const { data } = await api.post('/marketing/visits', payload);
      return data;
    });
  },

  async update(id, payload) {
    return request(async () => {
      const { data } = await api.put(`/marketing/visits/${id}`, payload);
      return data;
    });
  },

  async deleteVisit(id) {
    return request(async () => {
      const { data } = await api.delete(`/marketing/visits/${id}`);
      return data;
    });
  },

  async recordEntry(id, payload = {}) {
    return request(async () => {
      const { data } = await api.patch(`/marketing/visits/${id}/entry`, payload);
      return data;
    });
  },

  async recordExit(id, payload = {}) {
    return request(async () => {
      const { data } = await api.patch(`/marketing/visits/${id}/exit`, payload);
      return data;
    });
  },

  async changeStatus(id, visitStatus) {
    return request(async () => {
      const { data } = await api.patch(`/marketing/visits/${id}/status`, { visitStatus });
      return data;
    });
  },

  async saveQForm(id, payload) {
    return request(async () => {
      const { data } = await api.put(`/marketing/visits/${id}/qform`, payload);
      return data;
    });
  },

  async saveRequirement(id, payload) {
    return request(async () => {
      const { data } = await api.put(`/marketing/visits/${id}/requirement`, payload);
      return data;
    });
  },

  async saveDiscussion(id, payload) {
    return request(async () => {
      const { data } = await api.put(`/marketing/visits/${id}/discussion`, payload);
      return data;
    });
  },

  async setOutcome(id, payload) {
    return request(async () => {
      const { data } = await api.patch(`/marketing/visits/${id}/outcome`, payload);
      return data;
    });
  },

  async createLead(id, payload = {}) {
    return request(async () => {
      const { data } = await api.post(`/marketing/visits/${id}/lead`, payload);
      return data;
    });
  },

  async linkLead(id, leadId) {
    return request(async () => {
      const { data } = await api.post(`/marketing/visits/${id}/link-lead`, { leadId });
      return data;
    });
  },

  async addFollowUp(id, payload) {
    return request(async () => {
      const { data } = await api.post(`/marketing/visits/${id}/followups`, payload);
      return data;
    });
  },

  async updateFollowUp(id, followUpId, payload) {
    return request(async () => {
      const { data } = await api.patch(`/marketing/visits/${id}/followups/${followUpId}`, payload);
      return data;
    });
  },

  async handover(id, payload) {
    return request(async () => {
      const { data } = await api.post(`/marketing/visits/${id}/handover`, payload);
      return data;
    });
  },

  async visitHistory(id) {
    return request(async () => {
      const { data } = await api.get(`/marketing/visits/${id}/history`);
      return data;
    });
  },

  async changeHistory(id) {
    return request(async () => {
      const { data } = await api.get(`/marketing/visits/${id}/change-history`);
      return data;
    });
  },

  async listLeads(params = {}) {
    return request(async () => {
      const { data } = await api.get('/marketing/leads', { params });
      return data;
    });
  },

  async getLead(id) {
    return request(async () => {
      const { data } = await api.get(`/marketing/leads/${id}`);
      return data;
    });
  },

  async leadVisits(id) {
    return request(async () => {
      const { data } = await api.get(`/marketing/leads/${id}/visits`);
      return data;
    });
  },

  async leadFollowUps(id) {
    return request(async () => {
      const { data } = await api.get(`/marketing/leads/${id}/follow-ups`);
      return data;
    });
  },

  async createLeadStandalone(payload) {
    return request(async () => {
      const { data } = await api.post('/marketing/leads', payload);
      return data;
    });
  },

  async updateLead(id, payload) {
    return request(async () => {
      const { data } = await api.put(`/marketing/leads/${id}`, payload);
      return data;
    });
  },

  async listFollowUps(params = {}) {
    return request(async () => {
      const { data } = await api.get('/marketing/follow-ups', { params });
      return data;
    });
  },

  async getFollowUp(id) {
    return request(async () => {
      const { data } = await api.get(`/marketing/follow-ups/${id}`);
      return unwrapApiPayload(data);
    });
  },

  async createFollowUp(payload) {
    return request(async () => {
      const { data } = await api.post('/marketing/follow-ups', payload);
      return data;
    });
  },

  // Standalone update of a marketing_followups record (distinct from the
  // visit-scoped updateFollowUp(visitId, followUpId, payload) helper).
  async updateFollowUpRecord(id, payload) {
    return request(async () => {
      const { data } = await api.put(`/marketing/follow-ups/${id}`, payload);
      return data;
    });
  },

  async completeFollowUp(id) {
    return request(async () => {
      const { data } = await api.post(`/marketing/follow-ups/${id}/complete`);
      return data;
    });
  },

  async rescheduleFollowUp(id, payload) {
    return request(async () => {
      const { data } = await api.post(`/marketing/follow-ups/${id}/reschedule`, payload);
      return data;
    });
  },

  async deleteFollowUp(id) {
    return request(async () => {
      const { data } = await api.delete(`/marketing/follow-ups/${id}`);
      return data;
    });
  },

  async getDashboard() {
    return request(async () => {
      const { data } = await api.get('/marketing/dashboard');
      return data;
    });
  },

  // ======================== Dashboard analytics =========================

  async getDashboardSummary(params = {}) {
    return request(async () => {
      const { data } = await api.get('/marketing/dashboard/summary', { params });
      return data;
    });
  },

  async getDashboardVisitsTrend(params = {}) {
    return request(async () => {
      const { data } = await api.get('/marketing/dashboard/visits-trend', { params });
      return data;
    });
  },

  async getDashboardVisitStatus(params = {}) {
    return request(async () => {
      const { data } = await api.get('/marketing/dashboard/visit-status', { params });
      return data;
    });
  },

  async getDashboardRecentActivities(params = {}) {
    return request(async () => {
      const { data } = await api.get('/marketing/dashboard/recent-activities', { params });
      return data;
    });
  },

  async getDashboardTopPlants(params = {}) {
    return request(async () => {
      const { data } = await api.get('/marketing/dashboard/top-plants', { params });
      return data;
    });
  },

  async getDashboardExpensesByCategory(params = {}) {
    return request(async () => {
      const { data } = await api.get('/marketing/dashboard/expenses-by-category', { params });
      return data;
    });
  },

  async getDashboardActiveTrips(params = {}) {
    return request(async () => {
      const { data } = await api.get('/marketing/dashboard/active-trips', { params });
      return data;
    });
  },

  async search(q, limit = 10) {
    return request(async () => {
      const { data } = await api.get('/marketing/search', { params: { q, limit } });
      return data;
    });
  },

  async summary() {
    return request(async () => {
      const { data } = await api.get('/marketing/summary');
      return data;
    });
  },

  async performance(params = {}) {
    return request(async () => {
      const { data } = await api.get('/marketing/performance', { params });
      return data;
    });
  },

  // ======================== Questionnaire Form ============================

  async listQForms(params = {}) {
    return request(async () => {
      const { data } = await api.get('/marketing/q-forms', { params });
      return data;
    });
  },

  async getQForm(id) {
    return request(async () => {
      const { data } = await api.get(`/marketing/q-forms/${id}`);
      return data;
    });
  },

  async getQFormByVisitId(visitId) {
    return request(async () => {
      const { data } = await api.get(`/marketing/q-forms/by-visit/${visitId}`);
      return data;
    });
  },

  async createQForm(payload) {
    return request(async () => {
      const { data } = await api.post('/marketing/q-forms', payload);
      return data;
    });
  },

  async updateQForm(id, payload) {
    return request(async () => {
      const { data } = await api.put(`/marketing/q-forms/${id}`, payload);
      return data;
    });
  },

  async saveQFormDraft(id, payload) {
    return request(async () => {
      const { data } = await api.put(`/marketing/q-forms/${id}/draft`, payload);
      return data;
    });
  },

  async submitQForm(id, payload) {
    return request(async () => {
      const { data } = await api.put(`/marketing/q-forms/${id}/submit`, payload);
      return data;
    });
  },

  async deleteQForm(id) {
    return request(async () => {
      const { data } = await api.delete(`/marketing/q-forms/${id}`);
      return data;
    });
  },

  async saveQFormSignature(id, type, base64Data) {
    return request(async () => {
      const { data } = await api.put(`/marketing/q-forms/${id}/signature/${type}`, {
        signature: base64Data
      });
      return data;
    });
  },

  async uploadQFormAttachment(id, file, label) {
    return request(async () => {
      const formData = new FormData();
      formData.append('file', file);
      if (label) formData.append('label', label);
      const { data } = await api.post(`/marketing/q-forms/${id}/attachments`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      return data;
    });
  },

  async deleteQFormAttachment(id, attachmentId) {
    return request(async () => {
      const { data } = await api.delete(`/marketing/q-forms/${id}/attachments/${attachmentId}`);
      return data;
    });
  },

  // ======================== Travel Planner ================================

  async listTravelPlans(params = {}) {
    return request(async () => {
      const { data } = await api.get('/marketing/travel-plans', { params });
      return data;
    });
  },

  async getMapJourneys(params = {}) {
    return request(async () => {
      const { data } = await api.get('/marketing/travel-plans/map/journeys', { params });
      return data;
    });
  },

  async getTravelPlan(id) {
    return request(async () => {
      const { data } = await api.get(`/marketing/travel-plans/${id}`);
      return data;
    });
  },

  async createTravelPlan(payload) {
    return request(async () => {
      const { data } = await api.post('/marketing/travel-plans', payload);
      return data;
    });
  },

  async updateTravelPlan(id, payload) {
    return request(async () => {
      const { data } = await api.put(`/marketing/travel-plans/${id}`, payload);
      return data;
    });
  },

  async deleteTravelPlan(id) {
    return request(async () => {
      const { data } = await api.delete(`/marketing/travel-plans/${id}`);
      return data;
    });
  },

  // ---- Travel Registry attachments (shared attachment store) ----

  async getTravelPlanAttachments(id) {
    return request(async () => {
      const { data } = await api.get(`/marketing/travel-plans/${id}/attachments`);
      return data?.data || data;
    });
  },

  async addTravelPlanAttachment(id, formData, onProgress) {
    return request(async () => {
      const { data } = await api.post(`/marketing/travel-plans/${id}/attachments`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        suppressGlobalError: true,
        onUploadProgress: onProgress ? (e) => onProgress(e.loaded || 0, e.total || 0) : undefined
      });
      return data?.data || data;
    });
  },

  async deleteTravelPlanAttachment(id, attachmentId) {
    return request(async () => {
      const { data } = await api.delete(`/marketing/travel-plans/${id}/attachments/${attachmentId}`, {
        suppressGlobalError: true
      });
      return data;
    });
  },

  async saveTravelPlanDraft(id, payload) {
    return request(async () => {
      const { data } = await api.put(`/marketing/travel-plans/${id}/draft`, payload);
      return data;
    });
  },

  async submitTravelPlan(id) {
    return request(async () => {
      const { data } = await api.post(`/marketing/travel-plans/${id}/submit`);
      return data;
    });
  },

  async approveTravelPlan(id) {
    return request(async () => {
      const { data } = await api.post(`/marketing/travel-plans/${id}/approve`);
      return data;
    });
  },

  async rejectTravelPlan(id, payload) {
    return request(async () => {
      const { data } = await api.post(`/marketing/travel-plans/${id}/reject`, payload);
      return data;
    });
  },

  async requestTravelPlanRevision(id, payload) {
    return request(async () => {
      const { data } = await api.post(`/marketing/travel-plans/${id}/revision`, payload);
      return data;
    });
  },

  async startTrip(id, payload = {}) {
    return request(async () => {
      const { data } = await api.post(`/marketing/travel-plans/${id}/start`, payload);
      return data;
    });
  },

  async endTrip(id, payload = {}) {
    return request(async () => {
      const { data } = await api.post(`/marketing/travel-plans/${id}/end`, payload);
      return data;
    });
  },

  async addTravelStop(planId, payload) {
    return request(async () => {
      const { data } = await api.post(`/marketing/travel-plans/${planId}/stops`, payload);
      return data;
    });
  },

  async updateTravelStop(planId, stopId, payload) {
    return request(async () => {
      const { data } = await api.put(`/marketing/travel-plans/${planId}/stops/${stopId}`, payload);
      return data;
    });
  },

  async cancelTravelStop(planId, stopId, reason) {
    return request(async () => {
      const { data } = await api.post(`/marketing/travel-plans/${planId}/stops/${stopId}/cancel`, { reason });
      return data;
    });
  },

  async rescheduleTravelStop(planId, stopId, payload) {
    return request(async () => {
      const { data } = await api.post(`/marketing/travel-plans/${planId}/stops/${stopId}/reschedule`, payload);
      return data;
    });
  },

  async checkInStop(planId, stopId, payload = {}) {
    return request(async () => {
      const { data } = await api.post(`/marketing/travel-plans/${planId}/stops/${stopId}/checkin`, payload);
      return data;
    });
  },

  async checkOutStop(planId, stopId, payload = {}) {
    return request(async () => {
      const { data } = await api.post(`/marketing/travel-plans/${planId}/stops/${stopId}/checkout`, payload);
      return data;
    });
  },

  async markStopReached(planId, stopId) {
    return request(async () => {
      const { data } = await api.post(`/marketing/travel-plans/${planId}/stops/${stopId}/reached`);
      return data;
    });
  },

  async markStopSkipped(planId, stopId) {
    return request(async () => {
      const { data } = await api.post(`/marketing/travel-plans/${planId}/stops/${stopId}/skipped`);
      return data;
    });
  },

  async reorderTravelStops(planId, orderedStopIds) {
    return request(async () => {
      const { data } = await api.put(`/marketing/travel-plans/${planId}/reorder`, orderedStopIds);
      return data;
    });
  },

  async recalculateRoute(planId) {
    return request(async () => {
      const { data } = await api.post(`/marketing/travel-plans/${planId}/recalculate`);
      return data;
    });
  },

  async getTravelPlanSummary() {
    return request(async () => {
      const { data } = await api.get('/marketing/travel-plans/summary');
      return data;
    });
  },

  // ======================== Travel Scheduler ==============================

  async listTravelSchedules(params = {}) {
    return request(async () => {
      const { data } = await api.get('/marketing/travel-schedules', { params });
      return data;
    });
  },

  async getTravelScheduleOptions() {
    return request(async () => {
      const { data } = await api.get('/marketing/travel-schedules/options');
      return data?.data || data;
    });
  },

  async getTravelSchedule(id) {
    return request(async () => {
      const { data } = await api.get(`/marketing/travel-schedules/${id}`);
      return unwrapApiPayload(data);
    });
  },

  async createTravelSchedule(payload) {
    return request(async () => {
      const { data } = await api.post('/marketing/travel-schedules', payload);
      return unwrapApiPayload(data);
    });
  },

  async updateTravelSchedule(id, payload) {
    return request(async () => {
      const { data } = await api.put(`/marketing/travel-schedules/${id}`, payload);
      return unwrapApiPayload(data);
    });
  },

  async deleteTravelSchedule(id) {
    return request(async () => {
      const { data } = await api.delete(`/marketing/travel-schedules/${id}`);
      return data;
    });
  },

  /** Workflow moves — the only path that changes a schedule's status. */
  async submitTravelSchedule(id) {
    return request(async () => {
      const { data } = await api.post(`/marketing/travel-schedules/${id}/submit`);
      return unwrapApiPayload(data);
    });
  },

  async approveTravelSchedule(id) {
    return request(async () => {
      const { data } = await api.post(`/marketing/travel-schedules/${id}/approve`);
      return unwrapApiPayload(data);
    });
  },

  async rejectTravelSchedule(id, payload) {
    return request(async () => {
      const { data } = await api.post(`/marketing/travel-schedules/${id}/reject`, payload);
      return unwrapApiPayload(data);
    });
  },

  async requestTravelScheduleRevision(id, payload) {
    return request(async () => {
      const { data } = await api.post(`/marketing/travel-schedules/${id}/revision`, payload);
      return unwrapApiPayload(data);
    });
  },

  async completeTravelSchedule(id) {
    return request(async () => {
      const { data } = await api.post(`/marketing/travel-schedules/${id}/complete`);
      return unwrapApiPayload(data);
    });
  },

  async cancelTravelSchedule(id, reason) {
    return request(async () => {
      const { data } = await api.post(`/marketing/travel-schedules/${id}/cancel`, { reason });
      return unwrapApiPayload(data);
    });
  },

  // ---- Travel Scheduler attachments (shared attachment store) ----

  async getTravelScheduleAttachments(id) {
    return request(async () => {
      const { data } = await api.get(`/marketing/travel-schedules/${id}/attachments`);
      return data?.data || data;
    });
  },

  async addTravelScheduleAttachment(id, formData, onProgress) {
    return request(async () => {
      const { data } = await api.post(`/marketing/travel-schedules/${id}/attachments`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        suppressGlobalError: true,
        onUploadProgress: onProgress ? (e) => onProgress(e.loaded || 0, e.total || 0) : undefined
      });
      return data?.data || data;
    });
  },

  async deleteTravelScheduleAttachment(id, attachmentId) {
    return request(async () => {
      const { data } = await api.delete(`/marketing/travel-schedules/${id}/attachments/${attachmentId}`, {
        suppressGlobalError: true
      });
      return data;
    });
  },

  // ======================== Marketing Expenses ============================

  async listExpenseTrips(params = {}) {
    return request(async () => {
      const { data } = await api.get('/marketing/expenses', { params });
      return data;
    });
  },

  async getExpenseTrip(id) {
    return request(async () => {
      const { data } = await api.get(`/marketing/expenses/${id}`);
      return data;
    });
  },

  async createExpenseTrip(payload) {
    return request(async () => {
      const { data } = await api.post('/marketing/expenses', payload);
      return data;
    });
  },

  async updateExpenseTrip(id, payload) {
    return request(async () => {
      const { data } = await api.put(`/marketing/expenses/${id}`, payload);
      return data;
    });
  },

  async deleteExpenseTrip(id) {
    return request(async () => {
      const { data } = await api.delete(`/marketing/expenses/${id}`);
      return data;
    });
  },

  async startExpenseTrip(id, payload = {}) {
    return request(async () => {
      const { data } = await api.post(`/marketing/expenses/${id}/start`, payload);
      return data;
    });
  },

  async endExpenseTrip(id, payload = {}) {
    return request(async () => {
      const { data } = await api.post(`/marketing/expenses/${id}/end`, payload);
      return data;
    });
  },

  async submitExpenseTrip(id) {
    return request(async () => {
      const { data } = await api.post(`/marketing/expenses/${id}/submit`);
      return data;
    });
  },

  async approveExpenseTrip(id) {
    return request(async () => {
      const { data } = await api.post(`/marketing/expenses/${id}/approve`);
      return data;
    });
  },

  async rejectExpenseTrip(id, payload) {
    return request(async () => {
      const { data } = await api.post(`/marketing/expenses/${id}/reject`, payload);
      return data;
    });
  },

  async requestExpenseCorrection(id, payload) {
    return request(async () => {
      const { data } = await api.post(`/marketing/expenses/${id}/correction`, payload);
      return data;
    });
  },

  async addExpense(tripId, payload) {
    return request(async () => {
      const { data } = await api.post(`/marketing/expenses/${tripId}/expenses`, payload);
      return data;
    });
  },

  async updateExpense(tripId, expenseId, payload) {
    return request(async () => {
      const { data } = await api.put(`/marketing/expenses/${tripId}/expenses/${expenseId}`, payload);
      return data;
    });
  },

  async deleteExpense(tripId, expenseId) {
    return request(async () => {
      const { data } = await api.delete(`/marketing/expenses/${tripId}/expenses/${expenseId}`);
      return data;
    });
  },

  async uploadExpenseBill(tripId, expenseId, file) {
    return request(async () => {
      const formData = new FormData();
      formData.append('file', file);
      const { data } = await api.post(`/marketing/expenses/${tripId}/expenses/${expenseId}/bill`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      return data;
    });
  },

  async deleteExpenseBill(tripId, attachmentId) {
    return request(async () => {
      const { data } = await api.delete(`/marketing/expenses/${tripId}/bills/${attachmentId}`);
      return data;
    });
  },

  async getExpenseSummary(params = {}) {
    return request(async () => {
      const { data } = await api.get('/marketing/expenses/summary', { params });
      return data;
    });
  },

  // ======================== Marketing Map =================================

  async getMapLocations(params = {}) {
    return request(async () => {
      const { data } = await api.get('/marketing/map/locations', { params });
      return data;
    });
  },

  async getMarketingLocation(id) {
    return request(async () => {
      const { data } = await api.get(`/marketing/map/locations/${id}`);
      return data;
    });
  },

  async createMarketingLocation(payload) {
    return request(async () => {
      const { data } = await api.post('/marketing/map/locations', payload);
      return data;
    });
  },

  async updateMarketingLocation(id, payload) {
    return request(async () => {
      const { data } = await api.put(`/marketing/map/locations/${id}`, payload);
      return data;
    });
  },

  async deleteMarketingLocation(id) {
    return request(async () => {
      const { data } = await api.delete(`/marketing/map/locations/${id}`);
      return data;
    });
  },

  // ======================== Location Tracking ============================

  async submitLocation(payload) {
    return request(async () => {
      const { data } = await api.post('/marketing/location-tracking', payload);
      return data;
    });
  },

  async getActiveLocations() {
    return request(async () => {
      const { data } = await api.get('/marketing/location-tracking/active');
      return data;
    });
  },

  async getLatestLocation(planId) {
    return request(async () => {
      const { data } = await api.get(`/marketing/location-tracking/plan/${planId}/latest`);
      return data;
    });
  },

  async getLocationHistory(planId) {
    return request(async () => {
      const { data } = await api.get(`/marketing/location-tracking/plan/${planId}/history`);
      return data;
    });
  },

  // ==================== Calendar ====================
  async getCalendarActivities(year, month) {
    return request(async () => {
      const { data } = await api.get('/marketing/calendar/activities', { params: { year, month } });
      return data;
    });
  },

  async getCalendarToday() {
    return request(async () => {
      const { data } = await api.get('/marketing/calendar/today');
      return data;
    });
  },

  async getCalendarSummary(year, month) {
    return request(async () => {
      const { data } = await api.get('/marketing/calendar/summary', { params: { year, month } });
      return data;
    });
  },

  // ==================== Visit Activities (Follow-ups & Extensions) ====================
  // Without visitId this returns ALL follow-up / extension records (newest first).
  async listActivities(visitId) {
    return request(async () => {
      const { data } = await api.get('/marketing/activities', { params: visitId ? { visitId } : {} });
      return data;
    });
  },

  async getActivity(id) {
    return request(async () => {
      const { data } = await api.get(`/marketing/activities/${id}`);
      return unwrapApiPayload(data);
    });
  },

  async createActivity(payload) {
    return request(async () => {
      const { data } = await api.post('/marketing/activities', payload);
      return data;
    });
  },

  async updateActivity(id, payload) {
    return request(async () => {
      const { data } = await api.put(`/marketing/activities/${id}`, payload);
      return data;
    });
  },

  async deleteActivity(id) {
    return request(async () => {
      const { data } = await api.delete(`/marketing/activities/${id}`);
      return data;
    });
  },

  async getOriginalVisit(visitId) {
    return request(async () => {
      const { data } = await api.get(`/marketing/activities/visit/${visitId}`);
      return data;
    });
  },

  // ==================== Master Data (Editable Dropdowns) ====================
  async getMasterValues(key) {
    return request(async () => {
      const { data } = await api.get(`/masters/${key}`);
      return data?.data || data || [];
    });
  },

  async createMasterValue(key, value) {
    return request(async () => {
      const { data } = await api.post(`/masters/${key}`, { value });
      return data?.data || data;
    });
  },

  // ==================== Location Linking & Summary ====================
  async linkCustomerToLocation(locationId, customerId, customerName) {
    return request(async () => {
      const { data } = await api.put(`/marketing/map/locations/${locationId}/link-customer`, {
        customerId, customerName
      });
      return data?.data || data;
    });
  },

  async getLocationSummary(locationId, type = 'marketing_location') {
    return request(async () => {
      const { data } = await api.get(`/marketing/map/locations/${locationId}/summary`, { params: { type } });
      return data?.data || data;
    });
  },

  async getEntityPhotos(locationId, type = 'marketing_location') {
    return request(async () => {
      const { data } = await api.get(`/marketing/map/locations/${locationId}/photos`, { params: { type } });
      return data?.data || data;
    });
  },

  async uploadLocationPhoto(locationId, file, type = 'marketing_location') {
    return request(async () => {
      const formData = new FormData();
      formData.append('file', file);
      const { data } = await api.post(`/marketing/map/locations/${locationId}/photos?type=${encodeURIComponent(type)}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      return data?.data || data;
    });
  },

  async deleteLocationPhoto(locationId, attachmentId, type = 'marketing_location') {
    return request(async () => {
      const { data } = await api.delete(`/marketing/map/locations/${locationId}/photos/${attachmentId}?type=${encodeURIComponent(type)}`);
      return data?.data || data;
    });
  },

  // ======================== Location Updates & About ========================

  async getEntityUpdates(locationId, type = 'marketing_location') {
    return request(async () => {
      const { data } = await api.get(`/marketing/map/locations/${locationId}/updates`, { params: { type } });
      return data?.data || data;
    });
  },

  async getEntityAbout(locationId, type = 'marketing_location') {
    return request(async () => {
      const { data } = await api.get(`/marketing/map/locations/${locationId}/about`, { params: { type } });
      return data?.data || data;
    });
  }
};

/**
 * Travel Registry attachments exposed in the shape the shared attachment panel
 * (`SalesDetail/SalesAttachments`) already consumes: `uploadMany` reports one
 * result per file (so a partial failure never loses the successes) and
 * `deleteAttachment` removes one stored row.
 *
 * Reusing that contract keeps ONE upload/progress/retry implementation for
 * every module instead of a Marketing-specific copy.
 */
export const travelPlanAttachments = {
  async addAttachment(id, formData, onProgress) {
    return marketingService.addTravelPlanAttachment(id, formData, onProgress);
  },

  async deleteAttachment(id, attachmentId) {
    return marketingService.deleteTravelPlanAttachment(id, attachmentId);
  },

  async uploadMany(id, files, { onFileStart, onProgress } = {}) {
    // The project-wide 4 GB pool is checked once for the whole batch, so an
    // over-limit selection is rejected before the first byte is sent.
    const limitError = await getAttachmentLimitError(files);
    if (limitError) {
      const list = Array.isArray(files) ? files : [];
      return list.map((file) => ({
        ok: false,
        file,
        error: { message: limitError.message, status: 400, data: null }
      }));
    }
    const results = [];
    for (const file of files) {
      onFileStart?.(file);
      try {
        const formData = new FormData();
        formData.append('file', file);
        const res = await marketingService.addTravelPlanAttachment(id, formData, (loaded, total) =>
          onProgress?.(file, loaded, total)
        );
        results.push({ ok: true, file, data: res });
      } catch (err) {
        results.push({ ok: false, file, error: normalizeApiError(err) });
      }
    }
    return results;
  }
};

/**
 * Travel Scheduler attachments, exposed in the same shape the shared attachment
 * panel (`SalesDetail/SalesAttachments`) consumes — one implementation of
 * upload/progress/retry for every module.
 */
export const travelScheduleAttachments = {
  async addAttachment(id, formData, onProgress) {
    return marketingService.addTravelScheduleAttachment(id, formData, onProgress);
  },

  async deleteAttachment(id, attachmentId) {
    return marketingService.deleteTravelScheduleAttachment(id, attachmentId);
  },

  async uploadMany(id, files, { onFileStart, onProgress } = {}) {
    const limitError = await getAttachmentLimitError(files);
    if (limitError) {
      const list = Array.isArray(files) ? files : [];
      return list.map((file) => ({
        ok: false,
        file,
        error: { message: limitError.message, status: 400, data: null }
      }));
    }
    const results = [];
    for (const file of files) {
      onFileStart?.(file);
      try {
        const formData = new FormData();
        formData.append('file', file);
        const res = await marketingService.addTravelScheduleAttachment(id, formData, (loaded, total) =>
          onProgress?.(file, loaded, total)
        );
        results.push({ ok: true, file, data: res });
      } catch (err) {
        results.push({ ok: false, file, error: normalizeApiError(err) });
      }
    }
    return results;
  }
};

export default marketingService;
