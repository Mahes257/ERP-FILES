/**
 * Sales Documents explorer — search and filter model.
 *
 * The explorer already reads the whole Sales-scoped repository and groups it
 * into folders; everything here is applied to ONE folder's own documents, so a
 * search can never surface a document that belongs to another folder.
 *
 * The search box matches the DOCUMENT's own metadata — its name, type, module,
 * record number, status, visibility, customer, MIME type and stored file name.
 * The uploader account (`uploadedBy` — `admin@vishaktech.com`) is deliberately
 * excluded: it is the same on every row, so it would make a one-letter query
 * return the whole folder instead of narrowing it.
 *
 * Nothing is invented and no extra request is made.
 *
 * Deliberately import-free so it can be unit tested in plain Node.
 */

/** The stored file name from any `filePath` variant (`…/v1/files/abc.pdf?…`). */
export function storedFileName(doc) {
  const path = String(doc?.filePath || '').split('?')[0];
  const segment = path.split('/').filter(Boolean).pop() || '';
  // A legacy "metadata-only" sentinel is not a file name.
  return segment === 'metadata-only' ? '' : segment;
}

/**
 * The lower-cased haystack a search matches against: every searchable field of
 * the document joined once. Kept as one string so the match is a single,
 * predictable `includes` — no field can be forgotten per query.
 */
export function searchableText(doc) {
  if (!doc) return '';
  return [
    doc.documentName,
    doc.recordNumber,
    doc.module,
    doc.documentType,
    doc.status,
    doc.visibility,
    doc.customerName,
    doc.fileType,
    storedFileName(doc)
  ]
    .filter((value) => value !== null && value !== undefined && value !== '')
    .join(' ')
    .toLowerCase();
}

/** Case-insensitive, whitespace-trimmed match; an empty query matches everything. */
export function matchesSearch(doc, query) {
  const needle = String(query || '').trim().toLowerCase();
  if (!needle) return true;
  return searchableText(doc).includes(needle);
}

/** `YYYY-MM-DD` from the row's own `createdAt`, or '' when it carries none. */
export function documentDate(doc) {
  const match = String(doc?.createdAt || '').match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '';
}

/** No condition set — the state that restores the folder's whole listing. */
export const EMPTY_FILTERS = Object.freeze({ type: '', module: '', from: '', to: '' });

/** How many filter fields are set (drives the Filter button's badge). */
export function countActiveFilters(filters) {
  const source = filters || {};
  return ['type', 'module', 'from', 'to'].filter((key) => String(source[key] || '') !== '').length;
}

/** True when the query or any filter is set, so "Clear all" is worth offering. */
export function hasActiveConditions(query, filters) {
  return String(query || '').trim() !== '' || countActiveFilters(filters) > 0;
}

/**
 * A document passes the filter panel when it matches every SET field. An unset
 * field is not applied at all, so the panel is always an AND of what the user
 * actually chose.
 */
export function matchesFilters(doc, filters) {
  const active = filters || {};
  if (active.type && String(doc?.documentType || '') !== active.type) return false;
  if (active.module && String(doc?.module || '') !== active.module) return false;
  if (active.from || active.to) {
    const date = documentDate(doc);
    // A row with no date cannot be proven to fall inside the range.
    if (!date) return false;
    if (active.from && date < active.from) return false;
    if (active.to && date > active.to) return false;
  }
  return true;
}

/**
 * The folder's rows narrowed by the search box AND the filter panel. Order is
 * preserved (the listing's own `createdAt:desc`), so paging stays stable.
 */
export function applyDocumentFilters(documents = [], { query = '', filters } = {}) {
  return documents.filter(
    (doc) => matchesSearch(doc, query) && matchesFilters(doc, filters)
  );
}

/**
 * The choices the panel offers, read from the documents the folder actually
 * holds — so the dropdowns never list a value that would return nothing.
 */
export function filterOptions(documents = []) {
  const types = new Set();
  const modules = new Set();
  for (const doc of documents) {
    const type = String(doc?.documentType || '').trim();
    const module = String(doc?.module || '').trim();
    if (type) types.add(type);
    if (module) modules.add(module);
  }
  return {
    documentTypes: [...types].sort((a, b) => a.localeCompare(b)),
    modules: [...modules].sort((a, b) => a.localeCompare(b))
  };
}
