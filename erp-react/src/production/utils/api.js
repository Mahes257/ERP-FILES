// ============================================================
// API utility — frontend HTTP client for the Spring Boot backend.
//
// All backend calls go through this module so the rest of the
// frontend never deals with fetch/axios URLs directly.
//
// Uses the shared ERP Axios instance (api/axiosInstance.js) which
// automatically attaches the JWT Authorization header via interceptor.
// ============================================================

import api from '../../api/axiosInstance';
import { buildKpiParams } from './kpiQuery';

/**
 * Generic API wrapper using the shared authenticated Axios instance.
 * Automatically includes JWT Authorization header.
 * Returns the parsed JSON body on success.
 * Throws an error with the backend message on failure.
 */
async function request(endpoint, options = {}) {
  try {
    const config = {
      ...options,
    };

    // Convert fetch-style body to axios data
    if (options.body && typeof options.body === 'string') {
      config.data = JSON.parse(options.body);
      delete config.body;
    }

    const response = await api(endpoint, config);
    const data = response.data;

    if (data && data.success === false) {
      throw new Error(data.message || 'Request failed');
    }

    return data;
  } catch (error) {
    if (error.code === 'ERR_NETWORK' || error.message?.includes('Network Error')) {
      throw new Error('Cannot connect to backend server. Make sure the ERP backend is running on port 8080.');
    }
    throw error;
  }
}

// ============================================================
// Production Order API
// ============================================================

export const productionOrderApi = {
  /**
   * List orders with pagination, search, and filters.
   */
  async list(params = {}) {
    const query = new URLSearchParams();
    if (params.search) query.set('search', params.search);
    if (params.status && params.status !== 'All') query.set('status', params.status);
    if (params.productionType && params.productionType !== 'All') query.set('productionType', params.productionType);
    if (params.priority && params.priority !== 'All') query.set('priority', params.priority);
    if (params.currentStage && params.currentStage !== 'All') query.set('currentStage', params.currentStage);
    if (params.salesOrder && params.salesOrder !== 'All') query.set('salesOrder', params.salesOrder);
    if (params.dueDate && params.dueDate !== 'All') query.set('dueDate', params.dueDate);
    if (params.page != null) query.set('page', String(params.page));
    if (params.size != null) query.set('size', String(params.size));
    if (params.sort) query.set('sort', params.sort);
    if (params.direction) query.set('direction', params.direction);

    const qs = query.toString();
    return request(`/production-orders${qs ? '?' + qs : ''}`);
  },

  /**
   * Get a single order by id (backend id).
   */
  async getById(id) {
    return request(`/production-orders/${id}`);
  },

  /**
   * Create a new production order.
   */
  async create(data) {
    return request('/production-orders', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * Update an existing production order.
   */
  async update(id, data) {
    return request(`/production-orders/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  /**
   * Delete a production order.
   */
  async delete(id) {
    return request(`/production-orders/${id}`, {
      method: 'DELETE',
    });
  },

  /**
   * Get statistics/KPI counts.
   */
  async getStats() {
    return request('/production-orders/stats');
  },

  /**
   * Get workflow status (derived stages, progress, quantities).
   */
  async getWorkflowStatus(id) {
    return request(`/production-orders/${id}/workflow-status`);
  },

  /**
   * Get timeline events.
   */
  async getTimeline(id) {
    return request(`/production-orders/${id}/timeline`);
  },

  /**
   * Get approval history.
   */
  async getApprovalHistory(id) {
    return request(`/production-orders/${id}/approval-history`);
  },

  // ========================
  // Status Transitions
  // ========================

  async submitProductionApproval(id, remarks) {
    return request(`/production-orders/${id}/submit-production-approval`, {
      method: 'POST',
      body: JSON.stringify({ remarks }),
    });
  },

  async approveProduction(id, remarks) {
    return request(`/production-orders/${id}/approve-production`, {
      method: 'POST',
      body: JSON.stringify({ remarks }),
    });
  },

  async submitAdminApproval(id, remarks) {
    return request(`/production-orders/${id}/submit-admin-approval`, {
      method: 'POST',
      body: JSON.stringify({ remarks }),
    });
  },

  async approveAdmin(id, remarks) {
    return request(`/production-orders/${id}/approve-admin`, {
      method: 'POST',
      body: JSON.stringify({ remarks }),
    });
  },

  async finalApprove(id, remarks) {
    return request(`/production-orders/${id}/final-approve`, {
      method: 'POST',
      body: JSON.stringify({ remarks }),
    });
  },

  async startProduction(id, remarks) {
    return request(`/production-orders/${id}/start-production`, {
      method: 'POST',
      body: JSON.stringify({ remarks }),
    });
  },

  /** In Progress → Pending QC (hand the order to the Quality module). */
  async sendToQuality(id, remarks) {
    return request(`/production-orders/${id}/pending-qc`, {
      method: 'POST',
      body: JSON.stringify({ remarks }),
    });
  },

  /** Completed → Packed. */
  async markPacked(id, remarks) {
    return request(`/production-orders/${id}/packed`, {
      method: 'POST',
      body: JSON.stringify({ remarks }),
    });
  },

  /** Packed → Ready for Dispatch. */
  async markReadyForDispatch(id, remarks) {
    return request(`/production-orders/${id}/ready-for-dispatch`, {
      method: 'POST',
      body: JSON.stringify({ remarks }),
    });
  },

  async hold(id, remarks) {
    return request(`/production-orders/${id}/hold`, {
      method: 'POST',
      body: JSON.stringify({ remarks }),
    });
  },

  async resume(id, remarks) {
    return request(`/production-orders/${id}/resume`, {
      method: 'POST',
      body: JSON.stringify({ remarks }),
    });
  },

  async complete(id, remarks) {
    return request(`/production-orders/${id}/complete`, {
      method: 'POST',
      body: JSON.stringify({ remarks }),
    });
  },

  async cancel(id, remarks) {
    return request(`/production-orders/${id}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ remarks }),
    });
  },

  async rejectProduction(id, remarks) {
    return request(`/production-orders/${id}/reject-production`, {
      method: 'POST',
      body: JSON.stringify({ remarks }),
    });
  },

  async rejectAdmin(id, remarks) {
    return request(`/production-orders/${id}/reject-admin`, {
      method: 'POST',
      body: JSON.stringify({ remarks }),
    });
  },

  async returnToDraft(id, remarks) {
    return request(`/production-orders/${id}/return-to-draft`, {
      method: 'POST',
      body: JSON.stringify({ remarks }),
    });
  },

  async resubmitToProduction(id, remarks) {
    return request(`/production-orders/${id}/resubmit-to-production`, {
      method: 'POST',
      body: JSON.stringify({ remarks }),
    });
  },
};

// ============================================================
// Production Entry API
// ============================================================

export const productionEntryApi = {
  async save(data) {
    return request('/production-entries', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async listForOrder(workOrderId) {
    return request(`/production-entries/order/${workOrderId}`);
  },

  async listForItem(workOrderId, itemId) {
    return request(`/production-entries/order/${workOrderId}/item/${itemId}`);
  },

  async getEntry(workOrderId, stage, itemId) {
    const query = itemId ? `?itemId=${encodeURIComponent(itemId)}` : '';
    return request(`/production-entries/order/${workOrderId}/stage/${encodeURIComponent(stage)}${query}`);
  },

  async delete(id) {
    return request(`/production-entries/${id}`, {
      method: 'DELETE',
    });
  },

  async deleteForOrder(workOrderId) {
    return request(`/production-entries/order/${workOrderId}`, {
      method: 'DELETE',
    });
  },
};

// ============================================================
// Acknowledgement API
// ============================================================

export const acknowledgementApi = {
  async save(data) {
    return request('/acknowledgements', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async getByWorkOrder(workOrderId) {
    return request(`/acknowledgements/work-order/${workOrderId}`);
  },

  async deleteForOrder(workOrderId) {
    return request(`/acknowledgements/work-order/${workOrderId}`, {
      method: 'DELETE',
    });
  },
};

// ============================================================
// Technical Verification API
// ============================================================

export const technicalVerificationApi = {
  /**
   * Save (create or update) a Technical Verification record.
   *
   * The pages build the payload with UI field names, so the wire format is
   * translated here (same approach as QualityContext):
   *   - `checklist` is built as an object but the entity column is TEXT holding
   *     JSON, so an object payload made Jackson fail to bind the DTO's String
   *     field and every Verify/Reject answered 500 without persisting anything.
   *   - the backend field is `lengthMm` (the column is length_mm); a payload
   *     with `length` was silently dropped, so Fabrication Length never saved.
   */
  async save(data) {
    const payload = { ...data };
    if (payload.checklist && typeof payload.checklist === 'object') {
      payload.checklist = JSON.stringify(payload.checklist);
    }
    if (payload.length !== undefined && payload.lengthMm === undefined) {
      payload.lengthMm = payload.length || '';
      delete payload.length;
    }
    return request('/technical-verifications', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async getByWorkOrder(workOrderId) {
    return request(`/technical-verifications/work-order/${encodeURIComponent(workOrderId)}`);
  },

  async getByItem(workOrderId, itemId) {
    return request(`/technical-verifications/work-order/${encodeURIComponent(workOrderId)}/item/${encodeURIComponent(itemId)}`);
  },

  async deleteForOrder(workOrderId) {
    return request(`/technical-verifications/work-order/${encodeURIComponent(workOrderId)}`, {
      method: 'DELETE',
    });
  },
};

// ============================================================
// Drawing API
// ============================================================

export const drawingApi = {
  async list(params = {}) {
    const query = new URLSearchParams();
    if (params.search) query.set('search', params.search);
    if (params.status && params.status !== 'All') query.set('status', params.status);
    if (params.workOrderId) query.set('workOrderId', params.workOrderId);
    if (params.page != null) query.set('page', String(params.page));
    if (params.size != null) query.set('size', String(params.size));
    if (params.sort) query.set('sort', params.sort);
    if (params.direction) query.set('direction', params.direction);
    const qs = query.toString();
    return request(`/drawings${qs ? '?' + qs : ''}`);
  },

  async getById(id) {
    return request(`/drawings/${id}`);
  },

  async create(data) {
    return request('/drawings', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async update(id, data) {
    return request(`/drawings/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async getStats() {
    return request('/drawings/stats');
  },

  async getDrawingsForOrder(workOrderId) {
    return request(`/drawings/work-order/${workOrderId}`);
  },

  async getDrawingsForItem(workOrderId, itemId) {
    return request(`/drawings/work-order/${workOrderId}/item/${itemId}`);
  },

  async verify(id, performedBy, remarks) {
    return request(`/drawings/${id}/verify`, {
      method: 'POST',
      body: JSON.stringify({ performedBy, remarks }),
    });
  },

  async reject(id, performedBy, remarks) {
    return request(`/drawings/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ performedBy, remarks }),
    });
  },

  async delete(id) {
    return request(`/drawings/${id}`, { method: 'DELETE' });
  },
};

// ============================================================
// Model API
// ============================================================

export const modelApi = {
  async list(params = {}) {
    const query = new URLSearchParams();
    if (params.search) query.set('search', params.search);
    if (params.status && params.status !== 'All') query.set('status', params.status);
    if (params.workOrderId) query.set('workOrderId', params.workOrderId);
    if (params.page != null) query.set('page', String(params.page));
    if (params.size != null) query.set('size', String(params.size));
    const qs = query.toString();
    return request(`/models${qs ? '?' + qs : ''}`);
  },

  async getById(id) {
    return request(`/models/${id}`);
  },

  async getByModelNumber(modelNumber) {
    return request(`/models/by-model-number/${encodeURIComponent(modelNumber)}`);
  },

  /** Full audit history for a model (GET /models/{id}/history). */
  async getHistory(id) {
    return request(`/models/${id}/history`);
  },

  /** Conversion status + resolved engine info (GET /models/{id}/conversion-status). */
  async getConversionStatus(id) {
    return request(`/models/${id}/conversion-status`);
  },

  async getStats() {
    return request('/models/stats');
  },

  async create(data) {
    return request('/models', {
      method: 'POST',
      body: JSON.stringify(data),
      // 409 (duplicate model number) is an expected business answer, not a
      // page-killing fault: resolve it so the caller can show the backend's
      // real message inline (same convention as ModelViewerPage's
      // TOLERATED_STATUS). request() still throws on success:false.
      validateStatus: (status) => (status >= 200 && status < 300) || status === 409,
    });
  },

  async update(id, data) {
    return request(`/models/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async getModelsForOrder(workOrderId) {
    return request(`/models/work-order/${workOrderId}`);
  },

  async verify(id, performedBy, remarks) {
    return request(`/models/${id}/verify`, {
      method: 'POST',
      body: JSON.stringify({ performedBy, remarks }),
    });
  },

  async reject(id, performedBy, remarks) {
    return request(`/models/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ performedBy, remarks }),
    });
  },

  async delete(id) {
    return request(`/models/${id}`, { method: 'DELETE' });
  },
};

// ============================================================
// Technical Verification API (extended)
// ============================================================

export const tvApi = {
  async getStats() {
    return request('/technical-verifications/stats');
  },

  async list(params = {}) {
    const query = new URLSearchParams();
    if (params.search) query.set('search', params.search);
    if (params.status && params.status !== 'All') query.set('status', params.status);
    if (params.workOrderId) query.set('workOrderId', params.workOrderId);
    if (params.page != null) query.set('page', String(params.page));
    if (params.size != null) query.set('size', String(params.size));
    const qs = query.toString();
    return request(`/technical-verifications${qs ? '?' + qs : ''}`);
  },

  async getById(id) {
    return request(`/technical-verifications/${id}`);
  },

  /**
   * Verify / reject a TV record.
   * The backend routes are scoped by Work Order + Item; the previous
   * `/{id}/verify` and `/{id}/reject` helpers targeted endpoints that do not
   * exist and always answered 404.
   */
  async verify(workOrderId, itemId, performedBy, remarks) {
    return request(`/technical-verifications/work-order/${encodeURIComponent(workOrderId)}/item/${encodeURIComponent(itemId)}/verify`, {
      method: 'POST',
      body: JSON.stringify({ performedBy, remarks }),
    });
  },

  async reject(workOrderId, itemId, performedBy, remarks) {
    return request(`/technical-verifications/work-order/${encodeURIComponent(workOrderId)}/item/${encodeURIComponent(itemId)}/reject`, {
      method: 'POST',
      body: JSON.stringify({ performedBy, remarks }),
    });
  },

  async resubmit(workOrderId, itemId, performedBy) {
    return request(`/technical-verifications/work-order/${encodeURIComponent(workOrderId)}/item/${encodeURIComponent(itemId)}/resubmit`, {
      method: 'POST',
      body: JSON.stringify({ performedBy }),
    });
  },
};

// ============================================================
// Machine Shop API
// ============================================================
// Note: Machine Shop data is primarily localStorage-based.
// These endpoints mirror the Casting/Fabrication/Assembly pattern.
// If the backend doesn't have these endpoints yet, the frontend
// falls back to localStorage.
export const machineShopApi = {
  async list(params = {}) {
    const query = new URLSearchParams();
    if (params.search) query.set('search', params.search);
    if (params.status && params.status !== 'All') query.set('status', params.status);
    if (params.page != null) query.set('page', String(params.page));
    if (params.size != null) query.set('size', String(params.size));
    const qs = query.toString();
    return request(`/machine-shop${qs ? '?' + qs : ''}`);
  },
  async getStats() {
    return request('/machine-shop/stats');
  },
};

// ============================================================
// Casting API
// ============================================================

export const castingApi = {
  async list(params = {}) {
    const query = new URLSearchParams();
    if (params.search) query.set('search', params.search);
    if (params.status && params.status !== 'All') query.set('status', params.status);
    if (params.page != null) query.set('page', String(params.page));
    if (params.size != null) query.set('size', String(params.size));
    const qs = query.toString();
    return request(`/castings${qs ? '?' + qs : ''}`);
  },
  async getStats() {
    return request('/castings/stats');
  },
};

// ============================================================
// Fabrication API
// ============================================================

export const fabricationApi = {
  async list(params = {}) {
    const query = new URLSearchParams();
    if (params.search) query.set('search', params.search);
    if (params.status && params.status !== 'All') query.set('status', params.status);
    if (params.page != null) query.set('page', String(params.page));
    if (params.size != null) query.set('size', String(params.size));
    const qs = query.toString();
    return request(`/fabrications${qs ? '?' + qs : ''}`);
  },
  async getStats() {
    return request('/fabrications/stats');
  },
};

// ============================================================
// Assembly API
// ============================================================

export const assemblyApi = {
  async list(params = {}) {
    const query = new URLSearchParams();
    if (params.search) query.set('search', params.search);
    if (params.status && params.status !== 'All') query.set('status', params.status);
    if (params.page != null) query.set('page', String(params.page));
    if (params.size != null) query.set('size', String(params.size));
    const qs = query.toString();
    return request(`/assemblies${qs ? '?' + qs : ''}`);
  },
  async getStats() {
    return request('/assemblies/stats');
  },
};

// ============================================================
// Packing List API
// ============================================================

export const packingApi = {
  async list(params = {}) {
    const query = new URLSearchParams();
    if (params.search) query.set('search', params.search);
    if (params.status && params.status !== 'All') query.set('status', params.status);
    if (params.page != null) query.set('page', String(params.page));
    if (params.size != null) query.set('size', String(params.size));
    const qs = query.toString();
    return request(`/packing${qs ? '?' + qs : ''}`);
  },

  async getById(id) {
    return request(`/packing/${id}`);
  },

  async getStats() {
    return request('/packing/stats');
  },

  async create(data) {
    return request('/packing', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async update(id, data) {
    return request(`/packing/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async delete(id) {
    return request(`/packing/${id}`, { method: 'DELETE' });
  },
};

// ============================================================
// Dispatch API
// ============================================================

export const dispatchApi = {
  async list(params = {}) {
    const query = new URLSearchParams();
    if (params.search) query.set('search', params.search);
    if (params.status && params.status !== 'All') query.set('status', params.status);
    if (params.page != null) query.set('page', String(params.page));
    if (params.size != null) query.set('size', String(params.size));
    const qs = query.toString();
    return request(`/dispatch${qs ? '?' + qs : ''}`);
  },

  async getById(id) {
    return request(`/dispatch/${id}`);
  },

  async getStats() {
    return request('/dispatch/stats');
  },

  async create(data) {
    return request('/dispatch', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async update(id, data) {
    return request(`/dispatch/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async delete(id) {
    return request(`/dispatch/${id}`, { method: 'DELETE' });
  },
};

// ============================================================
// Quality API — delegates to the unified ERP QualityInspection API
// ============================================================

/**
 * Build the path of ONE inspection.
 *
 * `quality_inspections.id` is the record's primary key and is typed by the
 * user, so it is NOT guaranteed to be URL-safe — the live data contains ids
 * such as "QI -002" (with a space). Interpolated raw, that identifier either
 * travels as an invalid request-target or gets normalised on the way to the
 * backend, and the lookup by id then misses the row and answers 404. The id is
 * therefore always encoded as a single path segment, so the exact persisted
 * identifier reaches `@PathVariable String id`.
 */
const qualityPath = (id, suffix = '') =>
  `/quality-inspections/${encodeURIComponent(String(id ?? ''))}${suffix}`;

export const qualityApi = {
  async list(params = {}) {
    const query = new URLSearchParams();
    if (params.search) query.set('search', params.search);
    if (params.status && params.status !== 'All') query.set('status', params.status);
    if (params.department && params.department !== 'All') query.set('department', params.department);
    if (params.inspectionType && params.inspectionType !== 'All') query.set('inspectionType', params.inspectionType);
    if (params.productionOrder) query.set('productionOrder', params.productionOrder);
    if (params.page != null) query.set('page', String(params.page));
    if (params.size != null) query.set('size', String(params.size));
    if (params.sort) query.set('sort', params.sort);
    const qs = query.toString();
    return request(`/quality-inspections${qs ? '?' + qs : ''}`);
  },

  /* Read ONE inspection. The Preview page resolves the record it was asked
     for through this call, so an unknown id must render the page's own
     "not found" state instead of replacing the route with the global error
     page (`suppressGlobalError`). */
  async getById(id, config = {}) {
    return request(qualityPath(id), { suppressGlobalError: true, ...config });
  },

  async getStats(productionOrder) {
    const qs = productionOrder ? `?productionOrder=${encodeURIComponent(productionOrder)}` : '';
    return request(`/quality-inspections/stats${qs}`);
  },

  async getByOrder(productionOrderId) {
    return request(`/quality-inspections/by-order/${encodeURIComponent(productionOrderId)}`);
  },

  /* The Quality form (create route and the create/continue actions) reports its
     own failures inline, so a rejected create must NOT be promoted to the
     global error page: without this the interceptor published `erp:api-error`,
     `ApiErrorProvider` replaced the whole route with "400 Bad Request" and the
     inspection form — with everything the user had typed — was unmounted before
     the caller's own catch could render the message. Every other write in this
     workflow (update, saveQcData) already opts out for the same reason. The
     rejection still reaches the caller. */
  async create(data) {
    return request('/quality-inspections', {
      method: 'POST',
      body: JSON.stringify(data),
      suppressGlobalError: true,
    });
  },

  /* The edit page reports its own failures inline, so these writes opt out of
     the global error page: a rejected save (404 for a record that was deleted
     in the meantime, 400 for invalid quantities, …) must leave the form — with
     the user's input — on screen instead of replacing the whole route with
     "Page Not Found". The rejection still reaches the caller. */
  async update(id, data) {
    return request(qualityPath(id), {
      method: 'PUT',
      body: JSON.stringify(data),
      suppressGlobalError: true,
    });
  },

  async delete(id) {
    return request(qualityPath(id), { method: 'DELETE' });
  },

  async updateStatus(id, status, action, remarks) {
    return request(qualityPath(id, '/status'), {
      method: 'PATCH',
      body: JSON.stringify({ status, action, remarks }),
    });
  },

  async saveQcData(id, qcData) {
    return request(qualityPath(id, '/qc-data'), {
      method: 'PUT',
      body: JSON.stringify(qcData),
      suppressGlobalError: true,
    });
  },

  async updateChecklist(id, index, result, remarks) {
    return request(qualityPath(id, '/checklist'), {
      method: 'PATCH',
      body: JSON.stringify({ index, result, remarks }),
    });
  },
};

// ============================================================
// Production KPI API
// ============================================================
// The KPI screens ask the database for exactly the rows and counters they
// render — one bounded page per request instead of whole tables that the
// browser then filters, tallies and pages.

export const productionKpiApi = {
  /**
   * One page of the records behind one KPI card.
   *
   * @param {{module:string, kpiKey:string, search?:string, status?:string,
   *          page?:number, pageSize?:number}} options
   */
  async kpiPage({ module, kpiKey, search, status, page, pageSize } = {}) {
    const query = new URLSearchParams(
      buildKpiParams({ page, pageSize, search, status })
    );
    const qs = query.toString();
    return request(`/production-kpi/${encodeURIComponent(module)}/kpi/${encodeURIComponent(kpiKey)}${qs ? '?' + qs : ''}`);
  },

  /** Database counters for a module's KPI cards / tabs. */
  async counts(module) {
    return request(`/production-kpi/${encodeURIComponent(module)}/counts`);
  },
};

// ============================================================
// Production Reports API
// ============================================================
// The five report screens used to assemble their own figures in the browser
// (whole-table downloads plus the orderDetails demo generator). Every report is
// now calculated in the backend from the persisted Production tables and each
// endpoint returns that report's rows and its summary in one response.

/** Build a query string from defined, non-empty filter values. */
function reportQuery(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '' || value === 'All') return;
    query.set(key, String(value));
  });
  const qs = query.toString();
  return qs ? `?${qs}` : '';
}

export const productionReportApi = {
  /** Production Summary — filtered orders, computed summary, department rows. */
  async productionSummary(filters = {}) {
    return request(`/production/reports/production-summary${reportQuery(filters)}`);
  },

  /** Department Efficiency — output vs planned quantity per department. */
  async departmentEfficiency(filters = {}) {
    return request(`/production/reports/department-efficiency${reportQuery(filters)}`);
  },

  /** Delay Analysis — orders past their due date with computed delay days. */
  async delayAnalysis(filters = {}) {
    return request(`/production/reports/delay-analysis${reportQuery(filters)}`);
  },

  /** Material Consumption — planned / issued / consumed quantity per item. */
  async materialConsumption(filters = {}) {
    return request(`/production/reports/material-consumption${reportQuery(filters)}`);
  },

  /** Machine Utilization — hours and utilization per machine (Settings → Machines). */
  async machineUtilization(filters = {}) {
    return request(`/production/reports/machine-utilization${reportQuery(filters)}`);
  },
};

// ============================================================
// Production Settings API
// ============================================================
// Machines, work centers, status masters and production parameters are
// persisted master data, not browser state: each list is a MySQL table behind
// /production/settings. Machines and work centers are addressed by their
// user-entered code (the value the screen treats as the record identity);
// statuses — whose name is editable — by their numeric id.

export const productionSettingsApi = {
  // ---------------- Machines ----------------

  async listMachines(params = {}) {
    return request(`/production/settings/machines${reportQuery(params)}`);
  },

  async createMachine(data) {
    return request('/production/settings/machines', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateMachine(code, data) {
    return request(`/production/settings/machines/${encodeURIComponent(code)}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async deleteMachine(code) {
    return request(`/production/settings/machines/${encodeURIComponent(code)}`, {
      method: 'DELETE',
    });
  },

  // ---------------- Work centers ----------------

  async listWorkCenters(params = {}) {
    return request(`/production/settings/work-centers${reportQuery(params)}`);
  },

  async createWorkCenter(data) {
    return request('/production/settings/work-centers', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateWorkCenter(code, data) {
    return request(`/production/settings/work-centers/${encodeURIComponent(code)}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async deleteWorkCenter(code) {
    return request(`/production/settings/work-centers/${encodeURIComponent(code)}`, {
      method: 'DELETE',
    });
  },

  // ---------------- Status masters ----------------

  async listStatusMasters(params = {}) {
    return request(`/production/settings/status-masters${reportQuery(params)}`);
  },

  async createStatusMaster(data) {
    return request('/production/settings/status-masters', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateStatusMaster(id, data) {
    return request(`/production/settings/status-masters/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async deleteStatusMaster(id) {
    return request(`/production/settings/status-masters/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  // ---------------- Parameters ----------------

  async getParameters() {
    return request('/production/settings/parameters');
  },

  async saveParameters(values) {
    return request('/production/settings/parameters', {
      method: 'PUT',
      body: JSON.stringify(values),
    });
  },

  // ---------------- Notifications ----------------

  async getNotifications() {
    return request('/production/settings/notifications');
  },

  async saveNotifications(values) {
    return request('/production/settings/notifications', {
      method: 'PUT',
      body: JSON.stringify(values),
    });
  },

  // ---------------- Users & Roles ----------------

  async listUsers() {
    return request('/production/settings/users');
  },

  async saveUsers(users) {
    return request('/production/settings/users', {
      method: 'PUT',
      body: JSON.stringify(users),
    });
  },
};

// ============================================================
// Health check
// ============================================================

export async function checkBackendHealth() {
  try {
    const response = await fetch('/v1/health', {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}
