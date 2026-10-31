import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  ChevronRight,
  Download,
  ExternalLink,
  Eye,
  FileText,
  Folder,
  FolderOpen,
  Loader2,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Trash2,
  Upload,
  X
} from 'lucide-react';
// The shared row-actions dropdown (portal-based, closes on outside click / Escape)
// and the shared confirmation dialog — both used read-only, so no other module's
// behaviour or styling changes.
import { ActionMenu, ConfirmDialog, useToast } from '../components/Common';
import documentService from '../services/documentService';
// The shared attachment rules every other upload surface in the ERP enforces:
// the accepted extensions (also the file input's `accept`), the rejection reason
// (extension + size) and the file-kind tiles the repository tables use.
import {
  ACCEPT_STRING,
  ALLOWED_EXT_KEYS,
  TYPE_TONES,
  detectType,
  fileRejectionReason
} from '../purchase/utils/attachmentFile';
import { formatFileSize } from '../utils/attachmentStorage';
import { formatDate } from '../utils/leadHelpers';
import { cpoDocumentText as cpoDocText } from '../utils/salesHelpers';
// The module's shared document helpers: the repository scope, the API envelope
// unwrapper, the existing record routes and the existing preview route — the
// explorer reuses them instead of inventing its own destinations.
import {
  DOCUMENT_SCOPE,
  canOpenRelatedRecord,
  getModuleRoute,
  getStatusBadge,
  isActiveDocument,
  payloadOf,
  previewRouteFor
} from '../utils/documentView';
// The Documents folder hierarchy + the module-spelling grouping (pure, unit
// tested), and the module marker that tells a local upload from an ERP one.
import {
  LOCAL_DOC_FOLDER_ID,
  LOCAL_UPLOAD_MODULE,
  documentsInFolder,
  folderById,
  folderChildren,
  folderDocuments,
  folderTrail,
  groupByFolder,
  isFolderId
} from '../utils/documentFolders';
// Search + filter over ONE folder's own documents (pure, unit tested): the
// haystack, the filter panel's AND, the options it offers and the counters.
import {
  EMPTY_FILTERS,
  applyDocumentFilters,
  countActiveFilters,
  filterOptions,
  hasActiveConditions
} from '../utils/documentFilters';
// The document repository design system (page header, explorer, table, badges,
// dialogs) is the Purchase Document Repository's stylesheet — this page reuses
// the same class names so it renders identically. The badges stylesheet carries
// the `.doc-badge` chips the table's status cells render.
import '../purchase/styles/document-repository.css';
import '../styles/document-badges.css';

/* ------------------------------------------------------------------
 * Page constants
 * ------------------------------------------------------------------ */

/**
 * Local-device upload ceiling — the shared attachment rule (`fileRejectionReason`)
 * the rest of the ERP applies, so the picker refuses exactly what the server
 * would refuse.
 */
const UPLOAD_MAX_SIZE_MB = 5;

/** Repository page size used while reading the repository, and the page cap. */
const FETCH_PAGE_SIZE = 200;
const FETCH_MAX_PAGES = 25;

/** Documents shown per folder page (the folder's own files). */
const FOLDER_PAGE_SIZE = 10;

/**
 * The name a document is shown and spoken about under — the row's own business
 * name (with the legacy "Sales Order" wording normalized to its canonical CPO
 * name), falling back to its id when the row carries no name at all. One helper
 * so the table cell, the delete confirmation and the messages always agree.
 */
function documentDisplayName(doc) {
  return cpoDocText(doc?.documentName) || `Document #${doc?.id}`;
}

/**
 * Read one listing to exhaustion, page by page.
 *
 * The folder a document belongs to is decided by its own `module` spelling, and
 * one module can be written under several spellings, so each set is read whole
 * and grouped client-side — the exact, complete set instead of one request per
 * folder. `listForSelection` is the same GET /documents call, filters and
 * permissions as `list()`, but a failure stays on the page (the explorer renders
 * it with a Retry) instead of replacing the whole app with the global error view.
 */
async function fetchAll(params) {
  const documents = [];
  for (let page = 0; page < FETCH_MAX_PAGES; page += 1) {
    const result = await documentService.listForSelection({
      ...params,
      page,
      size: FETCH_PAGE_SIZE,
      sort: 'createdAt:desc'
    });
    const rows = Array.isArray(result) ? result : (result?.content || []);
    documents.push(...rows);
    const noMore = result?.last === true
      || rows.length < FETCH_PAGE_SIZE
      || (Number.isFinite(result?.totalPages) && page + 1 >= result.totalPages);
    if (noMore) return { documents, truncated: false };
  }
  return { documents, truncated: true };
}

/**
 * The two sets the explorer shows, each read with the EXISTING listing and its
 * own filter — never with a rule the frontend invents about the rows:
 *
 *   Inside ERP  `scope=sales` — everything an ERP module owns. The backend's
 *               module-scoped listing already drops the terminal rows
 *               (archived / in the trash) in SQL.
 *   Local Doc   `module=Local Doc` — only files uploaded from this page, which
 *               the backend's Sales scope does not cover, so a row can never
 *               belong to both roots. That listing is unscoped and therefore
 *               returns the whole repository including trashed rows, so the
 *               SAME active-row rule is applied here (`isActiveDocument`) — a
 *               document deleted from this page leaves the list by its own
 *               status, exactly as it does inside Inside ERP.
 */
async function fetchAllDocuments() {
  const [erp, local] = await Promise.all([
    fetchAll({ scope: DOCUMENT_SCOPE }),
    fetchAll({ module: LOCAL_UPLOAD_MODULE })
  ]);
  return {
    documents: [...erp.documents, ...local.documents.filter(isActiveDocument)],
    truncated: erp.truncated || local.truncated
  };
}

/**
 * The explorer profile the page renders with by default: the Sales Documents
 * hierarchy over the Sales-scoped repository read.
 *
 * A profile is the whole of what changes between the ERP areas that open this
 * explorer — which folders exist, where their documents come from, which folder
 * keeps an unmapped row and what the empty state names. Everything else (the
 * page actions, the breadcrumb, the folder cards, the search + filter toolbar,
 * the table, pagination, the loading / empty / error states and the responsive
 * rules) is this one component, so a second area looks and behaves exactly like
 * this one instead of being a second design of it.
 */
const SALES_EXPLORER = {
  load: fetchAllDocuments,
  fallbackFolderLabel: 'Sales',
  documentsInFolder,
  folderById,
  folderChildren,
  folderDocuments,
  folderTrail,
  groupByFolder,
  isFolderId
};

/**
 * Documents.
 *
 * The page is the document repository's folder explorer. It shows two roots —
 *
 *   Documents
 *   ├── Inside ERP → Sales → CRM (Leads · Clients · Contacts · Follow-ups)
 *   │                       → CPR
 *   │                       → Sales Execution
 *   └── Local Doc  (files uploaded from this computer)
 *
 * — over the documents that already exist in the repository: two scoped reads of
 * the same `GET /documents` listing, grouped by each document's own `module`
 * metadata. Nothing is uploaded, copied or invented here, and a document is
 * listed by its own metadata alone, so a stored file stays visible in its folder
 * even when the record it came from no longer exists.
 *
 * The page's own actions are unchanged: Refresh re-reads the repository, and
 * Upload Document opens the local-device picker directly and stores the file
 * through the existing upload endpoint.
 *
 * The hierarchy, the repository read and the wording above come from the
 * `explorer` profile; the default is the Sales profile described here, so
 * /documents renders exactly as it always has. Another ERP area mounts this
 * same page with its own profile (Production → Documents) and gets the same
 * explorer over its own folders rather than a second copy of this code.
 */
export default function Documents({ explorer = SALES_EXPLORER }) {
  const navigate = useNavigate();
  const toast = useToast();

  /* ─── The explorer profile ───
   * Read once per render from the profile the mount supplied: the hierarchy
   * helpers, the repository read and the wording this page renders with. */
  const {
    load: loadExplorer,
    fallbackFolderLabel,
    documentsInFolder,
    folderById,
    folderChildren,
    folderDocuments,
    folderTrail,
    groupByFolder,
    isFolderId
  } = explorer;

  /* ─── Repository data (read-only) ─── */
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [truncated, setTruncated] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [downloadingId, setDownloadingId] = useState(null);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const { documents: rows, truncated: cut } = await loadExplorer();
      setDocuments(rows);
      setTruncated(cut);
      setError(null);
    } catch (err) {
      console.error('Failed to load documents', err);
      setError(err?.response?.data?.message || err?.message || 'Failed to load documents');
      setDocuments([]);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [loadExplorer]);

  useEffect(() => {
    const timer = setTimeout(() => load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await load({ silent: true });
      toast.success('Documents reloaded from the repository.');
    } finally {
      setRefreshing(false);
    }
  };

  /* ─── Folder navigation (deep-linkable, so Back/Forward work) ───
   * The open folder lives in the URL (`/documents?folder=sales/crm/leads`), so a
   * folder can be linked, reloaded, and reached with the browser's back and
   * forward buttons. An unknown value simply shows the Documents root. */
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedFolder = searchParams.get('folder');
  const folderId = isFolderId(requestedFolder) && requestedFolder ? requestedFolder : null;
  // Page within the open folder (reset whenever the folder changes).
  const [page, setPage] = useState(0);

  /* ─── Search + filter state ───
   * Declared before the navigation helper because entering another folder
   * clears the conditions that described the folder the user just left (their
   * choices come from that folder's own metadata, so keeping them would leave
   * the panel showing a value the new folder does not offer). */
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const handleQueryChange = (value) => {
    setQuery(value);
    // A narrowed result set always starts on its first page.
    setPage(0);
  };

  const handleFilterField = (field, value) => {
    setFilters((current) => ({ ...current, [field]: value }));
    setPage(0);
  };

  const handleClearConditions = () => {
    setQuery('');
    setFilters(EMPTY_FILTERS);
    setPage(0);
  };

  const goToFolder = (id) => {
    const next = new URLSearchParams(searchParams);
    if (id) next.set('folder', id);
    else next.delete('folder');
    // A new folder starts clean and on its first page — reset here rather than
    // in an effect, so opening a folder never renders the previous folder's
    // rows (or its search conditions) first.
    handleClearConditions();
    setSearchParams(next);
  };

  const trail = useMemo(() => folderTrail(folderId), [folderId, folderTrail]);
  const parentFolder = folderId ? (folderById(folderId)?.parent || null) : null;
  const children = useMemo(() => folderChildren(folderId), [folderId, folderChildren]);
  const grouped = useMemo(() => groupByFolder(documents), [documents, groupByFolder]);

  /* ─── The open folder's own documents (paged) ─── */
  const folderDocs = useMemo(
    () => documentsInFolder(folderId, grouped),
    [folderId, grouped, documentsInFolder]
  );

  /* ─── Search + filter (applied to THIS folder's documents only) ───
   * `folderDocs` is the open folder's own files, so narrowing it can never
   * surface a document that belongs to another folder. The toolbar applies on
   * every keystroke and every select change — there is no Apply step, so the
   * visible rows always describe the conditions currently shown above them. */
  const filteredDocs = useMemo(
    () => applyDocumentFilters(folderDocs, { query, filters }),
    [folderDocs, query, filters]
  );
  const typeOptions = useMemo(() => filterOptions(folderDocs).documentTypes, [folderDocs]);
  const moduleOptions = useMemo(() => filterOptions(folderDocs).modules, [folderDocs]);
  const activeFilterCount = countActiveFilters(filters);
  const conditionsActive = hasActiveConditions(query, filters);

  const totalPages = Math.max(1, Math.ceil(filteredDocs.length / FOLDER_PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageRows = filteredDocs.slice(safePage * FOLDER_PAGE_SIZE, (safePage + 1) * FOLDER_PAGE_SIZE);
  const rangeStart = filteredDocs.length === 0 ? 0 : safePage * FOLDER_PAGE_SIZE + 1;
  const rangeEnd = Math.min((safePage + 1) * FOLDER_PAGE_SIZE, filteredDocs.length);

  /* ─── Existing document actions (unchanged destinations) ─── */
  const handlePreview = (doc) => {
    const route = previewRouteFor(doc);
    if (!route) {
      toast.error('This document cannot be previewed.');
      return;
    }
    navigate(route);
  };

  const handleOpenRecord = (doc) => {
    const route = getModuleRoute(doc?.module, doc?.relatedRecordId);
    if (!route) {
      toast.info('Related record is unavailable for this document.');
      return;
    }
    navigate(route);
  };

  const handleDownload = async (doc) => {
    if (downloadingId) return;
    if (doc?.canDownload === false) {
      toast.error('You do not have permission to download this document.');
      return;
    }
    if (!documentService.hasStoredFile(doc)) {
      toast.error('This document has no stored file yet — nothing to download.');
      return;
    }
    setDownloadingId(doc.id);
    try {
      await documentService.downloadFile(doc);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Download failed. Please try again.');
    }    finally {
      setDownloadingId(null);
    }
  };

  /* ─── Row ⋮ menu → Delete ───
   * The row menu offers the repository's established deletion, which is the
   * SOFT delete behind `DELETE /documents/{id}`: the row's status becomes
   * "deleted" (the trash) and its stored file is left on disk, so nothing is
   * destroyed and the document stays restorable. The repository's permanent
   * deletion is a different, deliberate action and is never called from here.
   *
   * The row is removed from the list by re-reading the repository after the
   * delete succeeds — never by editing local state or storage, so a failed
   * delete can never look like a successful one and the folder counts always
   * describe what the repository actually holds. */
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const handleAskDelete = (doc) => {
    if (deletingId) return;
    setPendingDelete(doc);
  };

  const handleCancelDelete = () => {
    if (deletingId) return;
    setPendingDelete(null);
  };

  const handleConfirmDelete = async () => {
    // One request at a time: a second confirm while the first is in flight is
    // ignored (the dialog's own buttons are disabled too).
    if (!pendingDelete || deletingId) return;
    const doc = pendingDelete;
    setDeletingId(doc.id);
    try {
      await documentService.delete(doc.id, { suppressGlobalError: true });
      toast.success(`"${documentDisplayName(doc)}" moved to the trash.`);
      setPendingDelete(null);
      // Counts and the open folder's rows come from the repository again.
      await load({ silent: true });
    } catch (err) {
      // The document is still listed (nothing was removed locally) and the
      // failure is stated instead of being reported as a deletion.
      toast.error(err?.response?.data?.message
        || 'Delete failed. The document was not deleted.');
    } finally {
      setDeletingId(null);
    }
  };

  /* ─── Upload workflow ───
   * Every upload from this page IS a local-device upload, so the header action
   * opens the operating system's file picker directly — there is no
   * "where does it come from?" step in front of it any more. The chosen file is
   * stored by the repository's existing upload endpoint and filed under
   * {@link LOCAL_UPLOAD_MODULE}, which is the row's own upload-source marker:
   * that is what makes it appear in Local Doc and keeps it out of the Inside ERP
   * tree. The explorer then re-reads the repository so the file shows up.) */
  const [uploading, setUploading] = useState(false);
  const uploadInputRef = useRef(null);

  const handleUploadDocument = () => {
    if (uploading) return;
    uploadInputRef.current?.click();
  };

  const handleUploadFile = async (event) => {
    const file = event.target.files?.[0];
    // Clear immediately so re-picking the same file fires change again.
    event.target.value = '';
    if (!file || uploading) return;

    const rejection = fileRejectionReason(file, UPLOAD_MAX_SIZE_MB);
    if (rejection) {
      toast.error(rejection);
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('module', LOCAL_UPLOAD_MODULE);
      const result = await documentService.upload(formData);
      const created = payloadOf(result);
      toast.success(`"${created?.documentName || file.name}" uploaded — it is now in Local Doc.`);
      await load({ silent: true });
    } catch (err) {
      toast.error(err?.response?.data?.message
        || 'Upload failed. The file was not added to the repository.');
    } finally {
      setUploading(false);
    }
  };

  /* ─── Cell renderers ─── */
  const renderName = (doc) => {
    const tone = TYPE_TONES[detectType(doc.documentName, doc.fileType)] || TYPE_TONES.other;
    const FileIcon = tone.Icon;
    const name = documentDisplayName(doc);
    const status = getStatusBadge(doc.status);
    return (
      <div className="doc-cell-name">
        <div className="doc-file-icon" style={{ backgroundColor: tone.bg }}>
          <FileIcon size={16} style={{ color: tone.color }} />
        </div>
        <div className="doc-name-body">
          <span className="doc-name-text" title={name}>{name}</span>
          <div className="doc-name-sub">
            <span className={status.className}>{status.label}</span>
            {doc.versionNumber > 1 && <span className="doc-name-sub-note">v{doc.versionNumber}</span>}
          </div>
        </div>
      </div>
    );
  };

  const renderSourceRecord = (doc) => {
    if (!doc.recordNumber) return <span className="doc-cell-muted">—</span>;
    if (!canOpenRelatedRecord(doc)) {
      return <span className="doc-cell-text">{cpoDocText(doc.recordNumber)}</span>;
    }
    return (
      <button
        type="button"
        className="doc-cell-link"
        onClick={() => handleOpenRecord(doc)}
        title={`Open ${cpoDocText(doc.recordNumber)}`}
      >
        {cpoDocText(doc.recordNumber)}
      </button>
    );
  };

  return (
    <div className="purchase-page cpr-page">
      <div className="doc-repo doc-sales-repo">
        {/* ===== Page action area =====
            The page's existing top-right action group — the same
            `po-page-header-actions pr-page-header-actions` markup the reference
            repository uses, so both buttons keep their geometry. */}
        <div className="po-page-header doc-action-row">
          <div className="po-page-header-actions pr-page-header-actions">
            <button
              type="button"
              className="doc-btn doc-btn-secondary"
              onClick={handleRefresh}
              disabled={refreshing || loading}
            >
              <RefreshCw size={13} className={refreshing ? 'spinner' : ''} /> Refresh
            </button>
            {/* The native picker the header action opens. handleUploadFile states
                the whole post-selection flow. */}
            <input
              ref={uploadInputRef}
              type="file"
              accept={ACCEPT_STRING}
              className="hidden"
              onChange={handleUploadFile}
              aria-label="Choose a file from this device"
            />
            <button
              type="button"
              className="doc-btn doc-btn-primary"
              onClick={handleUploadDocument}
              disabled={uploading}
              title={`Upload from this computer — ${ALLOWED_EXT_KEYS.map((e) => e.toUpperCase()).join(', ')} up to ${UPLOAD_MAX_SIZE_MB} MB`}
            >
              {uploading
                ? <Loader2 size={13} className="spinner" />
                : <Upload size={13} />}
              {uploading ? 'Uploading…' : 'Upload Document'}
            </button>
          </div>
        </div>

        {/* ===== Folder explorer ===== */}
        <section className="doc-explorer" aria-label="Document folders">
          <div className="doc-explorer-head">
            <div className="doc-explorer-title-wrap">
              <h2 className="doc-section-title">Documents</h2>
              <span className="doc-explorer-hint">
                Inside ERP documents and the files uploaded from this computer
              </span>
            </div>
          </div>

          {/* Breadcrumb + back navigation. Every ancestor is a button, so a
              folder can be left from anywhere on the path. */}
          <nav className="doc-explorer-crumbs" aria-label="Folder path">
            <button
              type="button"
              className="doc-crumb-back"
              onClick={() => goToFolder(parentFolder)}
              disabled={folderId === null}
              title={folderId === null ? 'Already at Documents' : 'Back to the parent folder'}
            >
              <ArrowLeft size={13} /> Back
            </button>
            <div className="doc-crumb-trail">
              {trail.map((node, index) => {
                const isLast = index === trail.length - 1;
                return (
                  <span key={node.id || 'root'} className="doc-crumb-item">
                    {index > 0 && <ChevronRight size={12} className="doc-crumb-sep" aria-hidden="true" />}
                    {isLast ? (
                      <span className="doc-crumb-current" aria-current="page">{node.label}</span>
                    ) : (
                      <button
                        type="button"
                        className="doc-crumb-link"
                        onClick={() => goToFolder(node.id)}
                      >
                        {node.label}
                      </button>
                    )}
                  </span>
                );
              })}
            </div>
          </nav>

          {error ? (
            <div className="doc-empty" role="alert">
              <AlertTriangle size={36} className="doc-empty-icon" />
              <div className="doc-empty-title">Could not load documents</div>
              <div className="doc-empty-sub">{error}</div>
              <button type="button" className="doc-empty-action" onClick={() => load()}>
                <RefreshCw size={12} /> Retry
              </button>
            </div>
          ) : loading ? (
            <div className="doc-table-loading">
              <Loader2 size={22} className="spinner" style={{ color: '#0B4A3D' }} />
              <p>Loading documents…</p>
            </div>
          ) : (
            <>
              {/* Subfolders of the open folder. */}
              {children.length > 0 && (
                <div className="doc-folder-grid">
                  {children.map((folder) => {
                    const count = folderDocuments(folder.id, grouped).length;
                    const Icon = folderId === null ? FolderOpen : Folder;
                    return (
                      <button
                        key={folder.id}
                        type="button"
                        className="doc-folder-card"
                        onClick={() => goToFolder(folder.id)}
                        aria-label={`Open ${folder.label} — ${count} document${count === 1 ? '' : 's'}`}
                      >
                        <span className="doc-folder-card-icon"><Icon size={34} /></span>
                        <span className="doc-folder-card-body">
                          <span className="doc-folder-card-name">{folder.label}</span>
                          <span className="doc-folder-card-meta">
                            {count} document{count === 1 ? '' : 's'}
                          </span>
                        </span>
                        <ChevronRight size={14} className="doc-folder-card-arrow" aria-hidden="true" />
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Search + filter, directly above the open folder's table. Shown
                  only for a folder that has documents to search, so it is
                  always a control over rows the user can actually see. */}
              {folderId !== null && folderDocs.length > 0 && (
                <div className="doc-query">
                  <div className="doc-query-row">
                    <div className="doc-search-field">
                      <Search size={14} className="doc-search-icon" aria-hidden="true" />
                      <input
                        type="search"
                        className="doc-search-input"
                        value={query}
                        onChange={(event) => handleQueryChange(event.target.value)}
                        placeholder="Search documents by name, type, source record..."
                        aria-label="Search documents in this folder"
                      />
                      {query !== '' && (
                        <button
                          type="button"
                          className="doc-search-clear"
                          onClick={() => handleQueryChange('')}
                          title="Clear search"
                          aria-label="Clear search"
                        >
                          <X size={13} />
                        </button>
                      )}
                    </div>

                    <button
                      type="button"
                      className="doc-btn doc-btn-secondary"
                      onClick={() => setFiltersOpen((open) => !open)}
                      aria-expanded={filtersOpen}
                    >
                      <SlidersHorizontal size={13} /> Filter
                      {activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
                    </button>

                    {conditionsActive && (
                      <button
                        type="button"
                        className="doc-btn doc-btn-ghost"
                        onClick={handleClearConditions}
                      >
                        <X size={13} /> Clear all
                      </button>
                    )}

                    {conditionsActive && (
                      <span className="doc-query-count">
                        {filteredDocs.length} of {folderDocs.length} in this folder
                      </span>
                    )}
                  </div>

                  {filtersOpen && (
                    <div className="doc-filter-panel">
                      <label className="doc-filter-field">
                        <span className="doc-filter-label">Document Type</span>
                        <select
                          className="doc-filter-control"
                          value={filters.type}
                          onChange={(event) => handleFilterField('type', event.target.value)}
                        >
                          <option value="">All types</option>
                          {/* the same wording the table's TYPE column shows */}
                          {typeOptions.map((type) => (
                            <option key={type} value={type}>{cpoDocText(type).toUpperCase()}</option>
                          ))}
                        </select>
                      </label>

                      <label className="doc-filter-field">
                        <span className="doc-filter-label">Source Module</span>
                        <select
                          className="doc-filter-control"
                          value={filters.module}
                          onChange={(event) => handleFilterField('module', event.target.value)}
                        >
                          <option value="">All modules</option>
                          {moduleOptions.map((module) => (
                            <option key={module} value={module}>{cpoDocText(module)}</option>
                          ))}
                        </select>
                      </label>

                      <label className="doc-filter-field">
                        <span className="doc-filter-label">Upload Date From</span>
                        <input
                          type="date"
                          className="doc-filter-control"
                          value={filters.from}
                          onChange={(event) => handleFilterField('from', event.target.value)}
                        />
                      </label>

                      <label className="doc-filter-field">
                        <span className="doc-filter-label">Upload Date To</span>
                        <input
                          type="date"
                          className="doc-filter-control"
                          value={filters.to}
                          onChange={(event) => handleFilterField('to', event.target.value)}
                        />
                      </label>
                    </div>
                  )}
                </div>
              )}

              {/* The open folder's own documents. The Documents root holds no
                  files of its own — only the Sales folder below it. */}
              {folderId !== null && (pageRows.length > 0 ? (
                <div className="doc-table-wrap">
                  <div className="doc-table-scroll">
                    <table className="doc-table">
                      <thead>
                        <tr>
                          <th>Document</th>
                          <th>Type</th>
                          <th>Uploaded</th>
                          <th>Source module</th>
                          <th>Source record</th>
                          <th className="doc-align-center">Size</th>
                          <th className="doc-align-center">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pageRows.map((doc) => (
                          <tr key={doc.id}>
                            <td>{renderName(doc)}</td>
                            <td>
                              <span className="doc-filetype">
                                {cpoDocText(doc.documentType || '').toUpperCase() || '—'}
                              </span>
                            </td>
                            <td>
                              <span className="doc-cell-text doc-cell-whitespace doc-cell-gray">
                                {doc.createdAt ? formatDate(doc.createdAt) : '—'}
                              </span>
                            </td>
                            <td>
                              <span className="doc-cell-text doc-cell-truncate" title={doc.module || ''}>
                                {cpoDocText(doc.module) || '—'}
                              </span>
                            </td>
                            <td>{renderSourceRecord(doc)}</td>
                            <td className="doc-align-center">
                              <span className="doc-cell-text doc-cell-tabular doc-cell-gray">
                                {documentService.hasStoredFile(doc) ? formatFileSize(doc.fileSize) : '—'}
                              </span>
                            </td>
                            <td className="doc-align-center">
                              <div className="doc-row-actions">
                                {doc.canView !== false && (
                                  <button
                                    type="button"
                                    className="doc-btn doc-btn-ghost doc-btn-sm"
                                    onClick={() => handlePreview(doc)}
                                    title="View / Preview"
                                  >
                                    <Eye size={13} /> Preview
                                  </button>
                                )}
                                {doc.canDownload !== false && (
                                  <button
                                    type="button"
                                    className="doc-btn doc-btn-ghost doc-btn-sm"
                                    onClick={() => handleDownload(doc)}
                                    disabled={downloadingId === doc.id}
                                    title="Download"
                                  >
                                    {downloadingId === doc.id
                                      ? <Loader2 size={13} className="spinner" />
                                      : <Download size={13} />}
                                    Download
                                  </button>
                                )}
                                {canOpenRelatedRecord(doc) && (
                                  <button
                                    type="button"
                                    className="doc-btn doc-btn-ghost doc-btn-sm"
                                    onClick={() => handleOpenRecord(doc)}
                                    title="Open the source record"
                                  >
                                    <ExternalLink size={13} /> Record
                                  </button>
                                )}
                                {/* The row's ⋮ menu. It carries the document's
                                    own Delete action; the DTO's `canDelete`
                                    decides whether it is offered or shown as
                                    unavailable with the reason. */}
                                <ActionMenu
                                  items={[{
                                    key: 'delete',
                                    label: 'Delete',
                                    icon: Trash2,
                                    danger: true,
                                    disabled: doc.canDelete === false,
                                    disabledReason: 'You do not have permission to delete this document'
                                  }]}
                                  onAction={(key) => { if (key === 'delete') handleAskDelete(doc); }}
                                  triggerClassName="doc-row-menu-btn"
                                  buttonLabel={`Actions for ${documentDisplayName(doc)}`}
                                />
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="doc-pagination">
                    <span className="doc-pagination-info">
                      Showing {rangeStart}–{rangeEnd} of {filteredDocs.length}
                    </span>
                    <div className="doc-pagination-btns">
                      <button
                        type="button"
                        className="doc-page-btn"
                        onClick={() => setPage(0)}
                        disabled={safePage === 0}
                      >
                        First
                      </button>
                      <button
                        type="button"
                        className="doc-page-btn"
                        onClick={() => setPage(Math.max(0, safePage - 1))}
                        disabled={safePage === 0}
                      >
                        Prev
                      </button>
                      <span className="doc-pagination-info">Page {safePage + 1} of {totalPages}</span>
                      <button
                        type="button"
                        className="doc-page-btn"
                        onClick={() => setPage(Math.min(totalPages - 1, safePage + 1))}
                        disabled={safePage >= totalPages - 1}
                      >
                        Next
                      </button>
                      <button
                        type="button"
                        className="doc-page-btn"
                        onClick={() => setPage(totalPages - 1)}
                        disabled={safePage >= totalPages - 1}
                      >
                        Last
                      </button>
                    </div>
                  </div>
                </div>
              ) : folderDocs.length > 0 ? (
                /* The folder has documents, but none of them match what the
                   toolbar above currently asks for — the conditions stay put so
                   they can be widened instead of silently reset. */
                <div className="doc-empty" role="status">
                  <Search size={36} className="doc-empty-icon" />
                  <div className="doc-empty-title">No documents match your search or filters.</div>
                  <div className="doc-empty-sub">
                    Clear the search box and the filter panel to see all {folderDocs.length}{' '}
                    document{folderDocs.length === 1 ? '' : 's'} in this folder.
                  </div>
                  <button
                    type="button"
                    className="doc-empty-action"
                    onClick={handleClearConditions}
                  >
                    <X size={12} /> Clear search and filters
                  </button>
                </div>
              ) : (
                <div className="doc-empty">
                  <FileText size={36} className="doc-empty-icon" />
                  <div className="doc-empty-title">No documents in this folder</div>
                  <div className="doc-empty-sub">
                    {folderId === LOCAL_DOC_FOLDER_ID
                      ? 'Files you upload from this computer appear here.'
                      : `Documents appear here once a ${folderById(folderId)?.label || fallbackFolderLabel} record stores or uploads a file.`}
                  </div>
                </div>
              ))}
            </>
          )}

          {truncated && !error && !loading && (
            <p className="doc-explorer-note">
              Showing the first {documents.length} documents — the repository holds more than this page reads at once.
            </p>
          )}
        </section>
      </div>

      {/* ===== Delete confirmation =====
          Names the exact document, keeps both actions explicit, and cannot be
          submitted twice: while the request is in flight the dialog is loading
          and both buttons are disabled. */}
      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Delete document"
        variant="danger"
        icon={Trash2}
        confirmLabel={deletingId ? 'Deleting…' : 'Delete'}
        loading={Boolean(deletingId)}
        message={pendingDelete
          ? `"${documentDisplayName(pendingDelete)}" will be moved to the trash.\n\n`
            + 'Its stored file is kept and the document can be restored. '
            + 'Nothing is deleted permanently.'
          : ''}
        onCancel={handleCancelDelete}
        onConfirm={handleConfirmDelete}
      />

      {/* Scoped styles for the action row, the folder cards and the breadcrumb.
          Everything here is scoped to this repository container (.doc-sales-repo),
          so no other page is restyled. */}
      <style>{`
        .doc-repo.doc-sales-repo .doc-action-row {
          justify-content: flex-end;
        }

        /* --- Folder navigation --- */
        .doc-explorer-crumbs {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
          padding-bottom: 10px;
          margin-bottom: 12px;
          border-bottom: 1px solid #F1F5F9;
        }
        .doc-crumb-back {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 5px 10px;
          font-size: 11px;
          font-weight: 700;
          color: #0B4A3D;
          background: #EDF7F4;
          border: 1px solid rgba(11, 74, 61, 0.2);
          border-radius: 8px;
          cursor: pointer;
        }
        .doc-crumb-back:disabled {
          color: #94A3B8;
          background: #F8FAFC;
          border-color: #E2E8F0;
          cursor: default;
        }
        .doc-crumb-trail {
          display: flex;
          align-items: center;
          gap: 4px;
          flex-wrap: wrap;
          font-size: 12px;
        }
        .doc-crumb-item { display: inline-flex; align-items: center; gap: 4px; }
        .doc-crumb-sep { color: #CBD5E1; }
        .doc-crumb-link {
          background: none;
          border: none;
          padding: 0;
          font: inherit;
          color: #0B7A68;
          font-weight: 600;
          cursor: pointer;
        }
        .doc-crumb-link:hover { text-decoration: underline; }
        .doc-crumb-current { color: #0F172A; font-weight: 700; }

        /* --- Folder cards --- */
        .doc-folder-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
          gap: 10px;
          margin-bottom: 14px;
        }
        .doc-folder-card {
          display: flex;
          align-items: center;
          gap: 10px;
          width: 100%;
          padding: 12px 14px;
          text-align: left;
          background: #FFFFFF;
          border: 1px solid #E2E8F0;
          border-radius: 10px;
          cursor: pointer;
          transition: border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
        }
        .doc-folder-card:hover {
          border-color: #0B4A3D;
          background: #F6FBF9;
          box-shadow: 0 2px 10px rgba(11, 74, 61, 0.08);
        }
        .doc-folder-card:focus-visible {
          outline: none;
          box-shadow: 0 0 0 3px rgba(11, 74, 61, 0.16);
        }
        /* --- Folder icon: prominent tile, icon centred in a fixed square --- */
        .doc-folder-card-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 54px;
          height: 54px;
          flex-shrink: 0;
          border-radius: 12px;
          background: #EAF7F3;
          color: #0B4A3D;
        }
        .doc-folder-card-icon svg { display: block; }
        .doc-folder-card-body { min-width: 0; flex: 1; }
        .doc-folder-card-name {
          display: block;
          font-size: 12.5px;
          font-weight: 700;
          color: #0F172A;
        }
        .doc-folder-card-meta {
          display: block;
          margin-top: 1px;
          font-size: 11px;
          color: #64748B;
        }
        .doc-folder-card-arrow { color: #CBD5E1; flex-shrink: 0; }

        /* --- Search + filter toolbar (above the open folder's table) --- */
        .doc-query { margin-bottom: 12px; }
        .doc-query-row {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        /* the toolbar buttons line up with the search field's height */
        .doc-repo.doc-sales-repo .doc-query-row .doc-btn { height: 38px; padding: 0 14px; }
        .doc-search-field {
          position: relative;
          display: flex;
          align-items: center;
          flex: 1 1 280px;
          min-width: 220px;
        }
        .doc-search-icon {
          position: absolute;
          left: 11px;
          color: #94A3B8;
          pointer-events: none;
        }
        .doc-search-input {
          width: 100%;
          height: 38px;
          padding: 0 34px 0 32px;
          font-size: 12px;
          color: #0F172A;
          background: #FFFFFF;
          border: 1px solid #E2E8F0;
          border-radius: 10px;
        }
        .doc-search-input::placeholder { color: #94A3B8; }
        .doc-search-input:focus {
          outline: none;
          border-color: #0B4A3D;
          box-shadow: 0 0 0 3px rgba(11, 74, 61, 0.12);
        }
        .doc-search-input::-webkit-search-cancel-button { display: none; }
        .doc-search-clear {
          position: absolute;
          right: 6px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 24px;
          height: 24px;
          padding: 0;
          border: none;
          border-radius: 7px;
          background: transparent;
          color: #64748B;
          cursor: pointer;
        }
        .doc-search-clear:hover { background: #F1F5F9; color: #0F172A; }
        .doc-query-count { font-size: 11px; color: #64748B; }
        .doc-filter-panel {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 10px;
          margin-top: 10px;
          padding: 12px;
          background: #F8FAFC;
          border: 1px solid #E2E8F0;
          border-radius: 10px;
        }
        .doc-filter-field {
          display: flex;
          flex-direction: column;
          gap: 4px;
          min-width: 0;
        }
        .doc-filter-label {
          font-size: 10.5px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.4px;
          color: #64748B;
        }
        .doc-filter-control {
          height: 34px;
          padding: 0 10px;
          font-size: 12px;
          color: #0F172A;
          background: #FFFFFF;
          border: 1px solid #E2E8F0;
          border-radius: 8px;
        }
        .doc-filter-control:focus {
          outline: none;
          border-color: #0B4A3D;
          box-shadow: 0 0 0 3px rgba(11, 74, 61, 0.12);
        }
        .dark .doc-repo.doc-sales-repo .doc-search-input,
        .dark .doc-repo.doc-sales-repo .doc-filter-control {
          background: #1E293B;
          border-color: rgba(255, 255, 255, 0.08);
          color: #E2E8F0;
        }
        .dark .doc-repo.doc-sales-repo .doc-filter-panel {
          background: rgba(255, 255, 255, 0.03);
          border-color: rgba(255, 255, 255, 0.08);
        }
        .dark .doc-repo.doc-sales-repo .doc-search-clear:hover { background: rgba(255, 255, 255, 0.08); color: #E2E8F0; }

        /* --- Rows --- */
        .doc-repo.doc-sales-repo .doc-row-actions {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          justify-content: center;
        }
        .doc-name-sub-note { margin-left: 6px; font-size: 10px; color: #94A3B8; }
        .doc-explorer-note {
          margin: 10px 0 0;
          font-size: 11px;
          color: #94A3B8;
        }

        .dark .doc-repo.doc-sales-repo .doc-folder-card { background: #1E293B; border-color: rgba(255,255,255,0.08); }
        .dark .doc-repo.doc-sales-repo .doc-folder-card:hover { background: rgba(11,74,61,0.25); }
        .dark .doc-repo.doc-sales-repo .doc-folder-card-name { color: #E2E8F0; }
        .dark .doc-repo.doc-sales-repo .doc-explorer-crumbs { border-bottom-color: rgba(255,255,255,0.06); }
        .dark .doc-repo.doc-sales-repo .doc-crumb-current { color: #E2E8F0; }
        .dark .doc-repo.doc-sales-repo .doc-crumb-back { background: rgba(7,94,84,0.25); border-color: rgba(79,209,176,0.2); color: #4FD1B0; }

        /* --- Responsive: one folder per row on small screens --- */
        @media (max-width: 720px) {
          .doc-folder-grid { grid-template-columns: 1fr; }
          .doc-explorer-crumbs { align-items: flex-start; }
        }
      `}</style>
    </div>
  );
}
