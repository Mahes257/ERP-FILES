/**
 * Pure helpers for Sales → Documents → Upload Document → "Inside ERP".
 *
 * The selection flow files a document that ALREADY exists in the repository
 * into the Sales repository by REFERENCING its stored file (the physical file is
 * never uploaded or copied again). The query it lists with, the eligibility
 * rule behind the picker and the pager's wording live here — one place, unit
 * tested (tests/sales-documents-inside-erp.test.js) — instead of being spelled
 * inline in the dialog, so the listing can never drift from the server rule it
 * mirrors.
 *
 * Deliberately import-free: it is the module the picker's behaviour is unit
 * tested through (tests/sales-documents-inside-erp.test.js), so it must load in
 * plain Node. The two constants it shares with the running app — the repository
 * scope and the no-file sentinel — are asserted against their real declarations
 * by that same test.
 */

/**
 * Repository scope the dialog lists with: the Sales area
 * ({@code utils/documentView.DOCUMENT_SCOPE}, asserted by the test).
 */
export const SELECTION_SCOPE = 'sales';

/**
 * The value {@code document_repository.file_path} holds for a document that has
 * no file yet — a record document whose PDF was never generated. It is the same
 * sentinel {@code documentService.hasStoredFile} tests for (asserted by the test).
 */
const NO_FILE_SENTINEL = 'metadata-only';

/** Rows per page in the selection dialog (a compact, self-contained pager). */
export const SELECTION_PAGE_SIZE = 10;

/**
 * How many of the target context's documents the dialog reads for its
 * "already in Sales Documents" pre-check. The check only needs the context's
 * active rows, and a Sales context holds tens of documents, not thousands; a
 * context larger than this still cannot produce a duplicate — the backend's own
 * guard is the authority and answers with the same explanation.
 */
export const SELECTION_CONTEXT_PAGE_SIZE = 200;

/** Newest first, the same ordering the repository listing opens with. */
export const SELECTION_SORT = 'createdAt:desc';

/**
 * The listing query for the selection dialog.
 *
 * `scope: 'sales'` is the same ERP-area filter the Sales Documents page queries
 * with, so only documents the Sales side owns are ever offered. `reusable: true`
 * asks the backend for rows an operator may actually reuse — not soft-deleted
 * and carrying a real stored file — which keeps the pager's total (and therefore
 * the number of pages) honest instead of counting metadata-only record documents
 * that have nothing to reuse.
 */
export function buildSelectionParams({ page = 0, size = SELECTION_PAGE_SIZE, search = '', module = '' } = {}) {
  const params = {
    page: Number.isFinite(Number(page)) && Number(page) >= 0 ? Number(page) : 0,
    size: Number(size) > 0 ? Number(size) : SELECTION_PAGE_SIZE,
    sort: SELECTION_SORT,
    scope: SELECTION_SCOPE,
    reusable: true
  };
  const term = String(search || '').trim();
  if (term) params.search = term;
  if (module) params.module = module;
  return params;
}

/**
 * Unwrap a paged listing response into the three values the dialog renders.
 * The list endpoint returns a Spring `Page` directly, but the payload is read
 * defensively so an `ApiResponse` envelope or a missing body degrades to an
 * empty page instead of throwing inside render.
 */
export function selectionPage(result) {
  const payload = result && typeof result === 'object'
    ? (result.content ? result : (result.data && typeof result.data === 'object' ? result.data : result))
    : {};
  const content = Array.isArray(payload.content) ? payload.content : [];
  return {
    content,
    totalElements: Number(payload.totalElements) || 0,
    totalPages: Number(payload.totalPages) || 0
  };
}

/**
 * Client-side counterpart of the server's `reusable` filter: a document can be
 * selected only when it is not in the trash and its stored file reference
 * resolves to a real file. `metadata-only` (or an empty path) marks a record
 * document whose PDF has not been generated yet — there is nothing to reuse.
 */
export function isSelectableDocument(doc) {
  if (!doc) return false;
  if (String(doc.status || '').toLowerCase() === 'deleted') return false;
  const path = String(doc.filePath || doc.storedName || '').trim();
  return path !== '' && path.toLowerCase() !== NO_FILE_SENTINEL;
}

/**
 * Where an eligible document came from, in the same wording the repository
 * listing's Source column uses: an operator-uploaded file ('uploaded') or a
 * system-generated one ('system'). Derived from the row's real status — never
 * guessed from the file name.
 */
export function sourceKind(doc) {
  return String(doc?.status || '').toLowerCase() === 'uploaded' ? 'uploaded' : 'system';
}

/**
 * The storage identifier of a row — the piece that actually identifies the
 * FILE, in the same shape the backend reduces a path to.
 *
 * A row reaches `filePath` as a bare stored name, an API path
 * (`/files/name`, `/v1/files/name`) or an absolute URL depending on which flow
 * created it, and the CAD documents add a sub-directory
 * (`drawings/name`). All of those describe one stored file, so the key is the
 * last path segment, lower-cased. Two documents with the same NAME but
 * different files therefore never collide, which is exactly the rule the
 * duplicate check must follow.
 */
export function storedFileKey(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  let path = raw;
  if (raw.startsWith('http')) {
    const match = /^https?:\/\/[^/]+(\/[^?#]*)?/.exec(raw);
    path = match && match[1] ? match[1] : '';
  }
  const segment = path.split(/[\\/]/).filter(Boolean).pop() || '';
  return segment.toLowerCase();
}

/** True for a row that is archived — stored, but hidden from the active lists. */
export function isArchived(doc) {
  return String(doc?.status || '').toLowerCase() === 'archived';
}

/**
 * The stored files one repository context already holds as ACTIVE documents.
 *
 * The dialog lists the target context with the same listing endpoint the page
 * uses (scope + module, no status filter), so every row handed here is an
 * active document of the context the selection would be filed into. A row with
 * one of these keys is already there: selecting it could only produce a
 * duplicate entry, so the dialog explains it instead and the backend refuses it
 * as well.
 */
export function filedFileKeys(rows) {
  const keys = new Set();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!isSelectableDocument(row) || isArchived(row)) continue;
    const key = storedFileKey(row.filePath || row.storedName);
    if (key) keys.add(key);
  }
  return keys;
}

/** Whether a candidate is already filed in the context being filed into. */
export function isFiledInContext(doc, filedKeys) {
  if (!doc || !filedKeys) return false;
  const key = storedFileKey(doc.filePath || doc.storedName);
  return Boolean(key) && filedKeys.has(key);
}

/**
 * "Showing 1-10 of 42" for the dialog's pager, from the real page metadata.
 * Empty listings report `0-0 of 0` rather than an invented range.
 */
export function selectionRange({ page = 0, size = SELECTION_PAGE_SIZE, total = 0 } = {}) {
  const rows = Number(total) || 0;
  if (rows <= 0) return { start: 0, end: 0, label: 'Showing 0 of 0' };
  const perPage = Number(size) > 0 ? Number(size) : SELECTION_PAGE_SIZE;
  const current = Number(page) > 0 ? Number(page) : 0;
  const start = current * perPage + 1;
  const end = Math.min((current + 1) * perPage, rows);
  return { start, end, label: `Showing ${start}-${end} of ${rows}` };
}
