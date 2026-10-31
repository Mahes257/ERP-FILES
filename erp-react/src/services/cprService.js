import api from '../api/axiosInstance';
import { getAttachmentLimitError } from '../utils/attachmentStorage';

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

const cprService = {
  async listCprs(params = {}, options = {}) {
    return request(async () => {
      const { data } = await api.get('/cprs', { params, signal: options.signal });
      return data;
    });
  },

  async listAllCprs() {
    return request(async () => {
      let page = 0;
      const all = [];
      let done = false;
      while (!done) {
        const { data } = await api.get('/cprs', { params: { page, size: 100 } });
        if (Array.isArray(data)) {
          all.push(...data);
          done = data.length < 100;
        } else {
          const content = data?.content ?? data?.data ?? data?.rows ?? [];
          const total = data?.totalElements ?? data?.total ?? data?.totalCount ?? content.length;
          all.push(...(Array.isArray(content) ? content : []));
          done = all.length >= total;
        }
        page += 1;
        if (page > 500) done = true;
      }
      return all;
    });
  },

  async listAllCprNumbers() {
    return request(async () => {
      const statuses = [null, 'archived', 'deleted'];
      const prNos = [];
      for (const status of statuses) {
        let page = 0;
        let done = false;
        while (!done) {
          const params = { page, size: 100 };
          if (status) params.status = status;
          const { data } = await api.get('/cprs', { params });
          const rows = Array.isArray(data) ? data : data?.content ?? data?.data ?? [];
          (Array.isArray(rows) ? rows : []).forEach((row) => {
            if (row?.prNo) prNos.push(String(row.prNo));
          });
          if (Array.isArray(data)) {
            done = rows.length < 100;
          } else {
            const total = data?.totalElements ?? data?.total ?? rows.length;
            done = rows.length < 100 || page * 100 + rows.length >= total;
          }
          page += 1;
          if (page > 500) done = true;
        }
      }
      return prNos;
    });
  },

  // ===== Reference PR No lookup (Quotation form auto-fill) =====
  // Exact-match lookup of the latest-revision CPR whose referencePrNo equals
  // the given value. Returns the full CprResponse (customer, addresses,
  // remarks, items) or throws "No CPR found with Reference PR No: X".
  async getByReferencePrNo(referencePrNo, options = {}) {
    return request(async () => {
      const config = options.suppressGlobalError ? { suppressGlobalError: true } : {};
      const { data } = await api.get(`/cprs/by-reference-pr/${encodeURIComponent(referencePrNo)}`, config);
      return data;
    });
  },

  /**
   * Returns the OTHER live CPR already carrying this Reference PR No, or null
   * when the number is free (404), blank, or belongs to the record being edited.
   * Mirrors the backend's uniqueness rule so the form can show a clear message
   * before saving. Lookup failures never block a save — the backend remains the
   * authority and reports the same conflict itself.
   */
  async findReferencePrNoConflict(referencePrNo, currentId = null) {
    const value = String(referencePrNo || '').trim();
    if (!value) return null;
    try {
      const res = await cprService.getByReferencePrNo(value, { suppressGlobalError: true });
      const hit = res?.data ?? res;
      if (hit?.id == null) return null;
      if (currentId != null && String(hit.id) === String(currentId)) return null;
      return hit;
    } catch {
      // 404 = the number is free; any other lookup failure must not block the
      // save — the backend checks the same rule and reports it authoritatively.
      return null;
    }
  },

  // Autocomplete backend search over CPR referencePrNo values (LIKE %q%),
  // capped at 20 rows by the backend — no full-table load in the browser.
  async searchByReferencePr(q) {
    return request(async () => {
      const { data } = await api.get('/cprs/search-by-reference-pr', { params: { q } });
      return data;
    });
  },

  // `config` is forwarded to the request as-is so an auxiliary lookup (one
  // whose failure the caller renders itself) can opt out of the global error
  // page with `{ suppressGlobalError: true }`.
  async getCpr(id, config = {}) {
    return request(async () => {
      const { data } = await api.get(`/cprs/${id}`, config);
      return data;
    });
  },

  // `suppressGlobalError`: a rejected save (e.g. a duplicate Reference PR No)
  // is reported in place by the form's own toast. Replacing the whole page
  // with the global error screen would throw away the user's unsaved CPR.
  async createCpr(payload, draft = false) {
    return request(async () => {
      const { data } = await api.post('/cprs', payload, {
        params: draft ? { draft: true } : {},
        suppressGlobalError: true
      });
      return data;
    });
  },

  async updateCpr(id, payload, draft = false) {
    return request(async () => {
      const { data } = await api.put(`/cprs/${id}`, payload, {
        params: draft ? { draft: true } : {},
        suppressGlobalError: true
      });
      return data;
    });
  },

  async deleteCpr(id) {
    return request(async () => {
      const { data } = await api.delete(`/cprs/${id}`);
      return data;
    });
  },

  async archiveCpr(id) {
    return request(async () => {
      const { data } = await api.patch(`/cprs/archive/${id}`);
      return data;
    });
  },

  async restoreCpr(id) {
    return request(async () => {
      const { data } = await api.patch(`/cprs/restore/${id}`);
      return data;
    });
  },

  async submitCpr(id) {
    return request(async () => {
      const { data } = await api.post(`/cprs/${id}/submit`);
      return data;
    });
  },

  async approveCpr(id, remarks) {
    return request(async () => {
      const { data } = await api.post(`/cprs/${id}/approve`, { remarks });
      return data;
    });
  },

  async rejectCpr(id, remarks) {
    return request(async () => {
      const { data } = await api.post(`/cprs/${id}/reject`, { remarks });
      return data;
    });
  },

  async sendBackCpr(id, remarks) {
    return request(async () => {
      const { data } = await api.post(`/cprs/${id}/send-back`, { remarks });
      return data;
    });
  },

  async convertToQuotation(id) {
    return request(async () => {
      const { data } = await api.post(`/cprs/${id}/convert-quotation`);
      return data;
    });
  },

  /**
   * Convert the CPR into a CRM Client ("Convert to Customer").
   *
   * The backend performs this transactionally and idempotently: it returns the
   * client the CPR is already linked to, reuses an existing client matched by
   * GSTIN / PAN / business name, or creates a real client through the Client
   * module — then persists the CPR ↔ client link on the CPR row.
   * Resolves with { cprId, prNo, customerId, clientCode, businessName, created,
   * alreadyLinked }.
   */
  async convertToCustomer(id) {
    return request(async () => {
      const { data } = await api.post(`/cprs/${id}/convert-customer`);
      return data;
    });
  },

  async duplicateCpr(id) {
    return request(async () => {
      const { data } = await api.post(`/cprs/${id}/duplicate`);
      return data;
    });
  },

  async getNextNumber() {
    return request(async () => {
      const { data } = await api.get('/cprs/next-number');
      return data;
    });
  },

  async getStats(options = {}) {
    return request(async () => {
      const { data } = await api.get('/cprs/stats', { signal: options.signal });
      return data;
    });
  },

  async bulkDelete(ids) {
    return request(async () => {
      const { data } = await api.post('/cprs/bulk-delete', { ids });
      return data;
    });
  },

  async bulkPermanentDelete(ids) {
    return request(async () => {
      const { data } = await api.post('/cprs/bulk-permanent-delete', { ids });
      return data;
    });
  },

  async bulkArchive(ids) {
    return request(async () => {
      const { data } = await api.post('/cprs/bulk-archive', { ids });
      return data;
    });
  },

  async bulkRestore(ids) {
    return request(async () => {
      const { data } = await api.post('/cprs/bulk-restore', { ids });
      return data;
    });
  },

  async exportCprs(params = {}) {
    return request(async () => {
      const { data } = await api.post('/cprs/export', null, { params, responseType: 'blob' });
      return data;
    });
  },

  async getTimeline(id) {
    return request(async () => {
      const { data } = await api.get(`/cprs/${id}/timeline`);
      return data;
    });
  },

  async getHistory(id) {
    return request(async () => {
      const { data } = await api.get(`/cprs/${id}/history`);
      return data;
    });
  },

  async getAttachments(id) {
    return request(async () => {
      const { data } = await api.get(`/cprs/${id}/attachments`);
      return data;
    });
  },

  async getComments(id) {
    return request(async () => {
      const { data } = await api.get(`/cprs/${id}/comments`);
      return data;
    });
  },

  async addComment(id, text) {
    return request(async () => {
      const { data } = await api.post(`/cprs/${id}/comments`, { text });
      return data;
    });
  },

  async updateComment(id, commentId, text) {
    return request(async () => {
      const { data } = await api.put(`/cprs/${id}/comments/${commentId}`, { text });
      return data;
    });
  },

  async deleteComment(id, commentId) {
    return request(async () => {
      const { data } = await api.delete(`/cprs/${id}/comments/${commentId}`);
      return data;
    });
  },

  async getReportsSummary() {
    return request(async () => {
      const { data } = await api.get('/cprs/reports/summary');
      return data;
    });
  },

  async addAttachment(id, formData, onUploadProgress) {
    return request(async () => {
      const { data } = await api.post(`/cprs/${id}/attachments`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: onUploadProgress
          ? (e) => onUploadProgress(e?.loaded || 0, e?.total || 0)
          : undefined
      });
      return data;
    });
  },

  async deleteAttachment(id, attachmentId) {
    return request(async () => {
      const { data } = await api.delete(`/cprs/${id}/attachments/${attachmentId}`);
      return data;
    });
  },

  async uploadMany(recordId, files, options = {}) {
    const { onFileStart, onProgress } = options;
    const limitError = await getAttachmentLimitError(files);
    if (limitError) {
      return (Array.isArray(files) ? files : []).map((file) => ({
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
        const data = await this.addAttachment(recordId, formData, (loaded, total) =>
          onProgress?.(file, loaded, total)
        );
        results.push({ ok: true, file, data });
      } catch (err) {
        results.push({ ok: false, file, error: err });
      }
    }
    return results;
  }
};

export default cprService;
