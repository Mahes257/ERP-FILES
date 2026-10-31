import api from '../api/axiosInstance';
import { downloadFile as downloadViaAuth, fetchFileBlob, openFileInNewTab } from '../utils/fileAccess';
import { cpoDocumentText } from '../utils/salesHelpers';

/**
 * File extension for the MIME types the ERP actually stores, so a document
 * whose business name carries no extension (e.g. "INV-2026-000002") still
 * downloads as "INV-2026-000002.pdf" instead of an extension-less file the
 * operating system cannot open.
 */
const MIME_EXTENSIONS = {
  'application/pdf': 'pdf',
  'text/plain': 'txt',
  'text/csv': 'csv',
  'text/html': 'html',
  'application/json': 'json',
  'application/zip': 'zip',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg'
};

/** Last path/name segment of a stored file reference (UUID or legacy URL). */
function lastSegment(value) {
  return String(value || '').split(/[\\/]/).filter(Boolean).pop() || '';
}

/** The extension carried by a name, lowercased, or null. */
function extensionOf(name) {
  const match = /\.([A-Za-z0-9]{1,8})$/.exec(String(name || '').trim());
  return match ? match[1].toLowerCase() : null;
}

async function request(executor) {
  return executor();
}

/**
 * Every download surface for a repository document (the row Actions → Download
 * and the document preview toolbar) renders the failure itself with the shared
 * file-error wording. Opting out of the global error publication keeps that
 * message usable: without it the response interceptor ALSO swaps the current
 * route for the global error page, so a single missing file replaced the whole
 * Documents page — and its search, filters and category tab — with a 404 view.
 * The promise still rejects, so the caller keeps full control.
 */
const IN_PLACE_ERROR = { suppressGlobalError: true };

const documentService = {
  async list(params = {}) {
    return request(async () => {
      const { data } = await api.get('/documents', { params });
      return data;
    });
  },

  /**
   * Listing for the "Inside ERP" selection dialog.
   *
   * Same repository endpoint (and therefore the same filters, search, paging
   * and permissions) as {@link list}; the difference is the failure path — the
   * dialog renders a failed lookup in place with a Retry, so the shared
   * interceptor must not ALSO publish it globally and replace the whole Sales
   * Documents page with the error page. The promise still rejects.
   */
  async listForSelection(params = {}) {
    return request(async () => {
      const { data } = await api.get('/documents', { params, suppressGlobalError: true });
      return data;
    });
  },

  /**
   * "Inside ERP" — file a document that ALREADY exists in the repository into
   * another repository context (POST /documents/{id}/reference).
   *
   * The backend REFERENCES the source row's stored file: the same bytes are
   * served for the new entry and no second copy is written, no upload happens
   * and the source document is untouched. `module` is the Sales context the
   * reference is filed under. Failures are rendered in place by the selection
   * dialog (same opt-out reasoning as {@link listForSelection}).
   */
  async referenceExisting(id, { module } = {}) {
    return request(async () => {
      const { data } = await api.post(
        `/documents/${id}/reference`,
        { module: module || null },
        { suppressGlobalError: true }
      );
      return data;
    });
  },

  /**
   * Every document belonging to ONE source record — used by record Overview
   * pages (Quotation Overview → Documents). Returns a real array from MySQL,
   * newest first; never a paged repository listing.
   */
  async listForRecord(module, relatedRecordId) {
    return request(async () => {
      const { data } = await api.get('/documents/by-record', {
        params: { module, relatedRecordId }
      });
      return data?.data ?? [];
    });
  },

  async get(id) {
    return request(async () => {
      const { data } = await api.get(`/documents/${id}`);
      return data;
    });
  },

  /**
   * Repository summary counters. Accepts the same QueryString params as
   * `list` (notably `scope`), so the KPI strip can be restricted to the same
   * dataset as the table it sits above.
   */
  async stats(params = {}) {
    return request(async () => {
      const { data } = await api.get('/documents/stats', { params });
      return data;
    });
  },

  async reconcile() {
    return request(async () => {
      const { data } = await api.post('/documents/reconcile');
      return data;
    });
  },

  async upload(formData) {
    return request(async () => {
      const { data } = await api.post('/documents/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 30 * 60 * 1000,
        // The upload surface renders its own failure in place (a toast naming
        // the server's message) and keeps the operator on the Documents page
        // with their search, filters and category tab intact. Without this the
        // shared response interceptor also publishes the failure globally and
        // replaces the whole route with the error page — one rejected file
        // would destroy the page. Same opt-out the interceptor documents for
        // "a request whose failure the caller renders in place"; the promise
        // still rejects, so the caller keeps full control.
        suppressGlobalError: true
      });
      return data;
    });
  },

  async create(payload) {
    return request(async () => {
      const { data } = await api.post('/documents', payload);
      return data;
    });
  },

  async update(id, payload) {
    return request(async () => {
      const { data } = await api.put(`/documents/${id}`, payload);
      return data;
    });
  },

  async changeVisibility(id, visibility) {
    return request(async () => {
      const { data } = await api.patch(`/documents/${id}/visibility`, { visibility });
      return data;
    });
  },

  async archive(id) {
    return request(async () => {
      const { data } = await api.patch(`/documents/archive/${id}`);
      return data;
    });
  },

  /**
   * Delete a repository document.
   *
   * This is the repository's established deletion: the backend SOFT-deletes the
   * row (status "deleted", the trash), never destroying the stored file, and the
   * document stays restorable through {@link restore}. `permanentDelete` is a
   * separate, deliberate action and must not be used as a normal Delete.
   *
   * @param id                  document id
   * @param suppressGlobalError true for a surface that renders the failure itself
   *                            (the Documents row menu shows an in-place error);
   *                            the promise still rejects, so the caller keeps
   *                            full control. Defaults to false, which is what
   *                            every existing caller already gets.
   */
  async delete(id, { suppressGlobalError = false } = {}) {
    return request(async () => {
      const { data } = await api.delete(`/documents/${id}`, { suppressGlobalError });
      return data;
    });
  },

  async restore(id) {
    return request(async () => {
      const { data } = await api.patch(`/documents/restore/${id}`);
      return data;
    });
  },

  async getAudit(id) {
    return request(async () => {
      const { data } = await api.get(`/documents/${id}/audit`);
      return data;
    });
  },

  async permanentDelete(id) {
    return request(async () => {
      const { data } = await api.delete(`/documents/${id}/permanent`);
      return data;
    });
  },

  async regenerate(id) {
    return request(async () => {
      const { data } = await api.post(`/documents/${id}/regenerate`);
      return data;
    });
  },

  async getVersions(id) {
    return request(async () => {
      const { data } = await api.get(`/documents/${id}/versions`);
      return data;
    });
  },

  async uploadNewVersion(id, file, changeNotes) {
    return request(async () => {
      const formData = new FormData();
      formData.append('file', file);
      if (changeNotes) formData.append('changeNotes', changeNotes);
      const { data } = await api.post(`/documents/${id}/versions`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 30 * 60 * 1000
      });
      return data;
    });
  },

  getDownloadUrl(storedName) {
    return `/files/${storedName}`;
  },

  /**
   * True when the row has a real stored file. Row-level documents are created
   * as soon as the business record is saved but only carry a file once the PDF
   * has been generated / a file uploaded; those rows store the sentinel
   * 'metadata-only' (or a null path) and must never be served.
   */
  hasStoredFile(doc) {
    const path = doc?.filePath;
    return Boolean(path) && path !== 'metadata-only';
  },

  /**
   * Download/preview file name for a document: keeps the stored name when it
   * already carries an extension, otherwise appends one derived from the MIME
   * type (then from the stored file), so the browser never saves a nameless
   * blob. Never returns a bare UUID to the user.
   */
  getDownloadFileName(doc) {
    // Legacy Customer Purchase Order documents were stored as
    // "Sales Order SO-…"; a download must carry the canonical CPO name
    // (CPO-2026-000001.pdf), never the superseded wording.
    const raw = String(doc?.documentName || '').trim();
    const name = raw ? cpoDocumentText(raw) : 'document';
    if (extensionOf(name)) return name;
    const mime = String(doc?.fileType || '').split(';')[0].trim().toLowerCase();
    const fromMime = MIME_EXTENSIONS[mime];
    if (fromMime) return `${name}.${fromMime}`;
    const fromStored = extensionOf(lastSegment(this.getStoredFilePath(doc)));
    return fromStored ? `${name}.${fromStored}` : name;
  },

  /**
   * Fetch a document's bytes through the authenticated document endpoint and
   * return an object URL for in-page rendering. The caller owns the URL and
   * must revoke it.
   */
  async getPreviewBlob(doc) {
    if (doc?.id && !doc?.versionRow) {
      return fetchFileBlob(`/documents/${doc.id}/file?mode=inline`);
    }
    const storedPath = this.getStoredFilePath(doc);
    if (!storedPath) {
      throw new Error('The file for this document is not available on the server.');
    }
    return fetchFileBlob(this.getDownloadUrl(storedPath));
  },

  /**
   * Extract the server-generated stored file name from any filePath variant.
   *
   * The backend stores one of:
   *   - a bare UUID name   "abc123.pdf"                (newer rows)
   *   - an API path        "/files/abc123.pdf"         (uploadNewVersion rows)
   *   - an absolute URL    "http://host/files/..."     (legacy/generated rows)
   *
   * FileController.serve only accepts safe UUID names, so anything that does
   * not resolve to a final path segment returns null and the caller must
   * surface a proper error instead of hitting a broken endpoint.
   */
  getStoredFilePath(doc) {
    const raw = doc?.filePath || doc?.storedName || '';
    if (!raw) return null;
    let path = raw;
    if (raw.startsWith('http')) {
      try {
        const parsed = new URL(raw);
        path = parsed.pathname;
      } catch {
        return null;
      }
    }
    const segment = path.split('/').filter(Boolean).pop() || '';
    return segment || null;
  },

  /**
   * Download through the document file endpoint when the caller hands over a
   * document (permission-checked + audited server-side). Version-history rows
   * have no such endpoint, so they fall back to the stored-file path via the
   * authenticated blob client.
   */
  async downloadFile(doc) {
    const fileName = this.getDownloadFileName(doc);
    if (doc?.id && !doc?.versionRow) {
      await downloadViaAuth(`/documents/${doc.id}/file?mode=attachment`, fileName, IN_PLACE_ERROR);
      return;
    }
    const storedPath = this.getStoredFilePath(doc);
    if (!storedPath) {
      throw new Error('The file for this document is not available on the server.');
    }
    await downloadViaAuth(this.getDownloadUrl(storedPath), fileName, IN_PLACE_ERROR);
  },

  /**
   * Open the stored document for preview through the document file endpoint
   * (inline mode). PDFs/images render in the browser; other types fall back to
   * a download. Authenticated blob fetch — no bare URLs.
   */
  async openForPreview(doc) {
    if (doc?.id && !doc?.versionRow) {
      await openFileInNewTab(`/documents/${doc.id}/file?mode=inline`);
      return;
    }
    const storedPath = this.getStoredFilePath(doc);
    if (!storedPath) {
      throw new Error('The file for this document is not available on the server.');
    }
    await openFileInNewTab(this.getDownloadUrl(storedPath));
  }
};

export default documentService;
