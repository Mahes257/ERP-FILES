import api from '../api/axiosInstance';

/**
 * Project-wide shared attachment storage pool.
 *
 * ALL attachment-enabled modules draw from ONE shared 4 GB capacity. The
 * backend enforces this on every upload; these helpers let the UI surface the
 * remaining capacity and reject an over-limit multi-file batch BEFORE the
 * first byte is sent (so an oversized selection is never partially saved).
 */
export const ATTACHMENT_STORAGE_LIMIT_BYTES = 4 * 1024 * 1024 * 1024; // 4 GB

/**
 * Maximum size permitted for a SINGLE uploaded file (2 GB per file — kept in
 * sync with the backend spring.servlet.multipart.max-file-size default; the
 * backend enforces the real limit, this constant only mirrors it for early UI
 * feedback). The 4 GB ATTACHMENT_STORAGE_LIMIT above is a separate, aggregate
 * pool-wide limit — NOT a per-file limit.
 */
export const MAX_ATTACHMENT_SIZE = 2 * 1024 * 1024 * 1024; // 2 GB per file

/** Human-readable label for the per-file limit (kept in sync with MAX_ATTACHMENT_SIZE). */
export const MAX_ATTACHMENT_SIZE_LABEL = '2GB';

/** Returns an Error when a single file exceeds the per-file limit, otherwise null. */
export function getAttachmentSizeError(file) {
  if (file && Number(file?.size) > MAX_ATTACHMENT_SIZE) {
    const error = new Error('File size cannot exceed 2 GB.');
    error.name = 'AttachmentSizeLimitError';
    return error;
  }
  return null;
}

/**
 * The extensions the ERP accepts for an attachment — the frontend mirror of the
 * backend's `app.upload.allowed-extensions` (ERP_UPLOAD_ALLOWED_EXTENSIONS; see
 * application.properties).
 *
 * The SERVER stays authoritative: FileStorageService sanitizes the original
 * filename, stores a random name and rejects anything outside the configured
 * list. This mirror only lets a form refuse an unsupported file BEFORE the
 * upload starts, with the same wording the server uses.
 */
export const ALLOWED_ATTACHMENT_EXTENSIONS = [
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'txt',
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'zip',
  'step', 'stp', 'iges', 'igs', 'stl', 'obj', 'glb', 'gltf'
];

/** The `accept` attribute for a file input limited to the ERP upload policy. */
export const ATTACHMENT_ACCEPT = ALLOWED_ATTACHMENT_EXTENSIONS.map((ext) => `.${ext}`).join(',');

/**
 * Lowercase extension without the dot, or null when the name has none.
 * Extension-only (never the whole name), so a name like "report.final.pdf"
 * resolves to "pdf" exactly like the backend's own sanitizer does.
 */
export function attachmentExtensionOf(fileName) {
  const name = String(fileName || '').trim();
  const index = name.lastIndexOf('.');
  if (index <= 0 || index === name.length - 1) return null;
  const ext = name.slice(index + 1).toLowerCase();
  return /^[a-z0-9]{1,8}$/.test(ext) ? ext : null;
}

/**
 * Returns an Error when the file's extension is not allowed by the ERP upload
 * policy, otherwise null. Empty files are rejected too (the server refuses them
 * as well), so an empty selection never reaches the API.
 */
export function getAttachmentTypeError(file) {
  const name = file?.name || '';
  if (file && Number(file?.size) === 0) {
    const empty = new Error(`"${name}" is empty (0 bytes) and cannot be uploaded.`);
    empty.name = 'AttachmentEmptyFileError';
    return empty;
  }
  const ext = attachmentExtensionOf(name);
  if (!ext || !ALLOWED_ATTACHMENT_EXTENSIONS.includes(ext)) {
    const error = new Error(
      `File type "${ext ? `.${ext}` : ''}" is not allowed. Allowed types: `
      + ALLOWED_ATTACHMENT_EXTENSIONS.join(', ')
    );
    error.name = 'AttachmentTypeError';
    return error;
  }
  return null;
}

/**
 * The complete selection-time policy for ONE file, in the same order the
 * backend applies it: empty file, extension allowlist, then the per-file size
 * limit. Returns the first error as an Error, or null when the file may be
 * staged.
 *
 * Every file picker must use this instead of only the size check: an
 * unsupported type (.exe, .html, ...) is refused by FileStorageService anyway,
 * so without the allowlist check the UI stages a file that can never upload
 * and the rejection only surfaces after the parent document was created.
 */
export function getAttachmentSelectionError(file) {
  return getAttachmentTypeError(file) || getAttachmentSizeError(file);
}

/**
 * Human-readable size for a SINGLE file (B / KB / MB / GB).
 * Shared by every attachment table/card so a size never renders two ways.
 */
export function formatFileSize(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Uppercase file-type label for a table's "Type" column.
 * Prefers the stored MIME type and falls back to the file extension.
 */
export function fileTypeLabel(name, contentType) {
  const type = String(contentType || '').toLowerCase();
  if (type.includes('pdf')) return 'PDF';
  if (type.includes('excel') || type.includes('spreadsheet')) return 'XLSX';
  if (type.includes('word') || type.includes('document')) return 'DOCX';
  if (type.includes('image/')) return type.split('/')[1].split('+')[0].toUpperCase();
  if (type.includes('zip') || type.includes('compressed')) return 'ZIP';
  if (type.startsWith('text/')) return 'TXT';
  const ext = String(name || '').split('.').pop();
  if (!ext || ext === name || ext.length > 5) return '—';
  return ext.toUpperCase();
}

export function formatStorageBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value >= 1024 * 1024 * 1024) return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(0, value).toLocaleString()} B`;
}

/** Fetches the shared pool usage: { limitBytes, totalBytes, availableBytes }. Null when unavailable. */
export async function fetchAttachmentStorage() {
  try {
    const res = await api.get('/files/storage');
    const body = res?.data;
    const data = body?.data || body || {};
    return {
      limitBytes: Number(data.limitBytes) || ATTACHMENT_STORAGE_LIMIT_BYTES,
      totalBytes: Number(data.totalBytes) || 0,
      availableBytes: Number(data.availableBytes) || 0
    };
  } catch {
    return null; // endpoint unreachable → rely on backend enforcement
  }
}

/**
 * Returns an Error when the given files would exceed the shared 4 GB pool
 * (existing usage + total selected size > limit), otherwise null.
 * Used to reject an entire multi-file selection before any file is uploaded.
 */
export async function getAttachmentLimitError(files) {
  const list = Array.isArray(files) ? files : [];
  if (list.length === 0) return null;
  const incoming = list.reduce((sum, file) => sum + (Number(file?.size) || 0), 0);
  if (incoming <= 0) return null;
  const storage = await fetchAttachmentStorage();
  if (!storage) return null;
  if (storage.totalBytes + incoming > storage.limitBytes) {
    const error = new Error(
      'Project-wide attachment storage limit reached (4 GB). This upload would exceed the shared 4 GB attachment storage capacity.'
    );
    error.name = 'AttachmentStorageLimitError';
    return error;
  }
  return null;
}
