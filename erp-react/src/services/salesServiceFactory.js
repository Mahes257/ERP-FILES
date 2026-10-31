import api from '../api/axiosInstance';
import { normalizeApiError } from './cprService';
import { getAttachmentLimitError } from '../utils/attachmentStorage';
import { emitSalesDataChanged } from '../sales/utils/salesDataEvents';

async function request(executor) {
  try {
    return await executor();
  } catch (error) {
    throw normalizeApiError(error);
  }
}

/**
 * A WRITE: same request handling, plus the Sales data-changed event once the
 * write has actually succeeded, so the sidebar's pending badges refresh in
 * place (see sales/hooks/useSalesSidebarCounts). Reads deliberately use plain
 * `request` — an event per read would make the badges re-fetch themselves.
 */
async function mutate(executor) {
  const result = await request(executor);
  emitSalesDataChanged();
  return result;
}

/**
 * Builds a CRUD + workflow REST service for a sales module backed by
 * /v1/{resource}. Mirrors cprService's call shapes (ApiResponse wrapping).
 */
export default function createSalesService(resource) {
  const base = `/${resource}`;
  return {
    async list(params = {}, options = {}) {
      return request(async () => {
        const { data } = await api.get(base, { params, signal: options.signal });
        return data;
      });
    },

    // `config` is forwarded as-is; `{ suppressGlobalError: true }` marks an
    // auxiliary lookup whose failure the caller renders in place instead of
    // letting it replace a valid, working route with the global error page.
    async get(id, config = {}) {
      return request(async () => {
        const { data } = await api.get(`${base}/${id}`, config);
        return data;
      });
    },

    // `config` is forwarded as-is (like `get`): a form action that reports its
    // own rejection — the CPO form's "Save & Continue", which keeps the user's
    // input and shows the reason in place — passes
    // `{ suppressGlobalError: true }`. The request still rejects; only the
    // global error page publication is skipped.
    async create(payload, draft = false, config = {}) {
      return mutate(async () => {
        const { data } = await api.post(base, payload, {
          ...config,
          params: draft ? { draft: true } : {}
        });
        return data;
      });
    },

    async update(id, payload, config = {}) {
      return mutate(async () => {
        const { data } = await api.put(`${base}/${id}`, payload, config);
        return data;
      });
    },

    async delete(id) {
      return mutate(async () => {
        const { data } = await api.delete(`${base}/${id}`);
        return data;
      });
    },

    async archive(id) {
      return mutate(async () => {
        const { data } = await api.patch(`${base}/archive/${id}`);
        return data;
      });
    },

    async restore(id) {
      return mutate(async () => {
        const { data } = await api.patch(`${base}/restore/${id}`);
        return data;
      });
    },

    async changeStatus(id, status, remarks) {
      return mutate(async () => {
        const { data } = await api.post(`${base}/${id}/status`, { status, remarks });
        return data;
      });
    },

    async duplicate(id) {
      return mutate(async () => {
        const { data } = await api.post(`${base}/${id}/duplicate`);
        return data;
      });
    },

    async approve(id) {
      return mutate(async () => {
        const { data } = await api.post(`${base}/${id}/approve`);
        return data;
      });
    },

    async getNextNumber() {
      return request(async () => {
        const { data } = await api.get(`${base}/next-number`);
        return data;
      });
    },

    async getStats(options = {}) {
      return request(async () => {
        const { data } = await api.get(`${base}/stats`, { signal: options.signal });
        return data;
      });
    },

    async bulkDelete(ids) {
      return mutate(async () => {
        const { data } = await api.post(`${base}/bulk-delete`, { ids });
        return data;
      });
    },

    async bulkPermanentDelete(ids) {
      return mutate(async () => {
        const { data } = await api.post(`${base}/bulk-permanent-delete`, { ids });
        return data;
      });
    },

    async permanentDelete(id) {
      return mutate(async () => {
        const { data } = await api.delete(`${base}/${id}/permanent`);
        return data;
      });
    },

    async bulkArchive(ids) {
      return mutate(async () => {
        const { data } = await api.post(`${base}/bulk-archive`, { ids });
        return data;
      });
    },

    async bulkRestore(ids) {
      return mutate(async () => {
        const { data } = await api.post(`${base}/bulk-restore`, { ids });
        return data;
      });
    },

    async exportCsv(params = {}) {
      return request(async () => {
        const { data } = await api.post(`${base}/export`, null, { params, responseType: 'blob' });
        return data;
      });
    },

    async getTimeline(id) {
      return request(async () => {
        const { data } = await api.get(`${base}/${id}/timeline`);
        return data;
      });
    },

    async getHistory(id) {
      return request(async () => {
        const { data } = await api.get(`${base}/${id}/history`);
        return data;
      });
    },

    async getAttachments(id) {
      return request(async () => {
        const { data } = await api.get(`${base}/${id}/attachments`);
        return data;
      });
    },

    // Attachment uploads/deletes always report their failure IN PLACE (the
    // attachments panel keeps the file queued with a retry and shows the
    // reason), so they opt out of the global error page: a single failed
    // upload must not replace the whole form — and the files the user staged
    // with it. `suppressGlobalError` only stops the global publication; the
    // request still rejects, so the caller keeps full control.
    async addAttachment(id, formData, onProgress) {
      return mutate(async () => {
        const { data } = await api.post(`${base}/${id}/attachments`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
          suppressGlobalError: true,
          onUploadProgress: onProgress
            ? (e) => onProgress(e.loaded || 0, e.total || 0)
            : undefined
        });
        return data;
      });
    },

    async deleteAttachment(id, attachmentId) {
      return mutate(async () => {
        const { data } = await api.delete(`${base}/${id}/attachments/${attachmentId}`, {
          suppressGlobalError: true
        });
        return data;
      });
    },

    // `category` (optional) names the kind of document the files are — the
    // Sales Contract page sends 'E-Sign' / 'Scanned Copy'. A file may also carry
    // its own `file.attachmentCategory` (a staged file the user labelled
    // individually), which wins over the batch default; a file with neither is
    // uploaded unlabelled, exactly as before.
    async uploadMany(id, files, { onFileStart, onProgress, category } = {}) {
      // Project-wide shared 4 GB attachment pool: reject the ENTIRE batch
      // before the first file is sent, so an over-limit selection is never
      // partially saved. (Backend also enforces per-file as a safety net.)
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
          const fileCategory = file.attachmentCategory || category;
          if (fileCategory) formData.append('category', fileCategory);
          const res = await this.addAttachment(id, formData, (loaded, total) => onProgress?.(file, loaded, total));
          results.push({ ok: true, file, data: res });
        } catch (err) {
          results.push({ ok: false, file, error: normalizeApiError(err) });
        }
      }
      return results;
    },

    // `config` is forwarded as-is (like `get`/`list`): `{ suppressGlobalError: true }`
    // keeps a rejection with the CALLER — the request still fails, but the
    // global error page does not replace a valid, working route, so a form can
    // report the failure in place while the user keeps their input.
    async postAction(id, action, payload, config = {}) {
      return mutate(async () => {
        const { data } = await api.post(`${base}/${id}/${action}`, payload ?? {}, config);
        return data;
      });
    }
  };
}
