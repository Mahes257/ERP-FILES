import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ChevronLeft,
  FileText,
  FolderOpen,
  History,
  Loader2,
  Search,
  X
} from 'lucide-react';
import { Modal } from '../Common';
import documentService from '../../services/documentService';
import { cpoDocumentText } from '../../utils/salesHelpers';
import { formatDate } from '../../utils/leadHelpers';
import { formatFileSize } from '../../utils/attachmentStorage';
import { getVisibilityBadge } from '../../utils/documentView';
import {
  SELECTION_CONTEXT_PAGE_SIZE,
  SELECTION_PAGE_SIZE,
  SELECTION_SCOPE,
  SELECTION_SORT,
  buildSelectionParams,
  filedFileKeys,
  isArchived,
  isFiledInContext,
  isSelectableDocument,
  selectionPage,
  selectionRange,
  sourceKind
} from '../../utils/documentSelection';
import { TYPE_TONES, detectType } from '../../purchase/utils/attachmentFile';
import './insideErpDocumentPicker.css';

/* ------------------------------------------------------------------
 * Document Selection ("Upload Document → Inside ERP")
 *
 * A full-size selection dialog over the files the ERP's Sales modules already
 * store. It lists the documents the backend reports as reusable
 * (`reusable=true`, the Sales scope) through the repository's OWN listing
 * endpoint — the same one the page behind it uses — and it never contacts
 * storage: confirming a row asks the page to file that existing document into
 * the active Sales context, which the backend does by REFERENCING the stored
 * file. No file is uploaded, copied or modified.
 *
 * Two states the operator must be able to see before committing:
 *
 *   ALREADY FILED   a candidate whose stored file the target context already
 *                   holds as an active document. Filing it again could only
 *                   produce a duplicate entry, so the row is shown but cannot
 *                   be selected (the backend refuses it too). The comparison is
 *                   the STORAGE IDENTIFIER, never the document name.
 *   ARCHIVED        a stored document that is currently hidden from the active
 *                   lists. It stays selectable: filing it into a context brings
 *                   its file back into the working list without restoring (or
 *                   changing) the archived document itself.
 *
 * The component owns only presentation state (search, category, page,
 * selection, busy/error) and hands the confirmed document to `onSubmit`, so the
 * page stays the single owner of the toast, the listing refresh and the API call.
 * ------------------------------------------------------------------ */

export default function InsideErpDocumentPicker({
  onClose,
  onBack,
  categories = [],
  targetModule,
  targetLabel,
  onSubmit
}) {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [module, setModule] = useState('');
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState([]);
  const [totalElements, setTotalElements] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  // Stored files the target context already holds as active documents.
  const [filedKeys, setFiledKeys] = useState(() => new Set());
  // Guards against a slow earlier page overwriting a newer one.
  const requestRef = useRef(0);

  // The page mounts this dialog only while it is open, so every visit starts
  // from a clean slate (no search, no category, first page, nothing selected) —
  // a previous visit can never leak a selection into the next one.

  // Debounce the search box into the query, like the repository listing does.
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const load = useCallback(async () => {
    const token = requestRef.current + 1;
    requestRef.current = token;
    setLoading(true);
    setLoadError(null);
    try {
      const result = await documentService.listForSelection(
        buildSelectionParams({ page, size: SELECTION_PAGE_SIZE, search, module })
      );
      if (token !== requestRef.current) return;
      const payload = selectionPage(result);
      // Defense in depth: the server already restricts the listing to reusable
      // rows; a row that slipped through is not selectable in the UI either.
      setRows(payload.content.filter(isSelectableDocument));
      setTotalElements(payload.totalElements);
      setTotalPages(payload.totalPages);
    } catch (err) {
      if (token !== requestRef.current) return;
      setRows([]);
      setTotalElements(0);
      setTotalPages(0);
      setLoadError(err?.response?.data?.message || 'Could not load documents from the repository.');
    } finally {
      if (token === requestRef.current) setLoading(false);
    }
  }, [page, search, module]);

  // Deferred (macrotask) so a change of page/search/category starts a normal
  // update instead of a synchronous setState inside the effect — the same
  // pattern the repository listing uses for its own fetch.
  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load]);

  /**
   * Read the target context's own active documents, so a candidate that is
   * already filed there can be shown as such instead of only being rejected
   * after the operator commits. Same endpoint, same scope, no status filter —
   * i.e. exactly the rows the Sales Documents page lists for that context.
   *
   * A failed pre-check is deliberately not fatal: it only costs the badge, and
   * the backend still refuses a duplicate.
   */
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const result = await documentService.listForSelection({
          scope: SELECTION_SCOPE,
          module: targetModule,
          page: 0,
          size: SELECTION_CONTEXT_PAGE_SIZE,
          sort: SELECTION_SORT
        });
        if (!cancelled) setFiledKeys(filedFileKeys(selectionPage(result).content));
      } catch {
        if (!cancelled) setFiledKeys(new Set());
      }
    }, 0);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [targetModule]);

  // The selection the dialog actually acts on. A pick can stop being addable
  // while the dialog is open — the context is read again after the row was
  // picked, and the row may already be filed there. Instead of syncing that
  // back into state (a cascading render), it is DERIVED: the moment the context
  // pre-check reports the file as filed, the row disables itself and the footer
  // and confirm button fall back to "nothing selected" on their own.
  const selectedDoc = selected && !isFiledInContext(selected, filedKeys) ? selected : null;

  const range = selectionRange({ page, size: SELECTION_PAGE_SIZE, total: totalElements });
  const selectedName = selectedDoc ? cpoDocumentText(selectedDoc.documentName) : '';

  const handleConfirm = async () => {
    if (!selectedDoc || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await onSubmit(selectedDoc);
      onClose();
    } catch (err) {
      // The dialog stays open with the message in place, so the operator can
      // pick another document without losing their search or category.
      setSubmitError(err?.response?.data?.message
        || err?.message
        || 'Could not add the selected document. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const renderRow = (doc) => {
    const tone = TYPE_TONES[detectType(doc.documentName, doc.fileType)] || TYPE_TONES.other;
    const FileIcon = tone.Icon;
    const name = cpoDocumentText(doc.documentName);
    const badge = getVisibilityBadge(doc.visibility);
    const VisIcon = badge.icon;
    const kind = sourceKind(doc);
    const isSelected = selectedDoc?.id === doc.id;
    // Two independent, real states of the row (never guessed from its name).
    const filed = isFiledInContext(doc, filedKeys);
    const archived = isArchived(doc);
    const rowClass = [isSelected ? 'is-selected' : '', filed ? 'is-filed' : ''].filter(Boolean).join(' ');
    const pick = () => {
      if (filed) return;
      setSelected(doc);
      setSubmitError(null);
    };
    return (
      <tr
        key={doc.id}
        className={rowClass || undefined}
        onClick={pick}
      >
        <td className="doc-align-center doc-picker-radio">
          <input
            type="radio"
            className="doc-checkbox"
            name="inside-erp-document"
            checked={isSelected}
            disabled={filed}
            onChange={pick}
            title={filed ? `Already in ${targetLabel || 'this context'} — no new entry needed` : undefined}
            aria-label={filed
              ? `Select ${name} — already in ${targetLabel || 'this context'}`
              : `Select ${name}`}
          />
        </td>
        <td>
          <div className="doc-cell-name">
            <div className="doc-file-icon" style={{ backgroundColor: tone.bg }}>
              <FileIcon size={16} style={{ color: tone.color }} />
            </div>
            <div className="doc-name-body">
              <span className="doc-name-text" title={name}>{name}</span>
              <div className="doc-name-sub">
                {cpoDocumentText(doc.module)}
                {archived && <span className="doc-badge doc-badge-amber">Archived</span>}
                {filed && (
                  <span className="doc-badge doc-badge-blue" title={`Already filed in ${targetLabel || 'this context'}`}>
                    In {targetLabel || 'this list'}
                  </span>
                )}
              </div>
            </div>
          </div>
        </td>
        <td><span className="doc-filetype">{cpoDocumentText(doc.documentType || '').toUpperCase() || '—'}</span></td>
        <td>
          {doc.recordNumber
            ? <span className="doc-cell-text">{cpoDocumentText(doc.recordNumber)}</span>
            : <span className="doc-cell-muted">—</span>}
        </td>
        <td>
          <span className="doc-cell-text doc-cell-truncate" title={doc.customerName || ''}>
            {doc.customerName || '—'}
          </span>
        </td>
        <td>
          <span className={`doc-badge ${kind === 'uploaded' ? 'source-uploaded' : 'source-system'}`}>
            {kind === 'uploaded'
              ? <FileText className="doc-badge-icon" />
              : <History className="doc-badge-icon" />}
            {kind === 'uploaded' ? 'Uploaded' : 'System'}
          </span>
        </td>
        <td>
          <span className={badge.className}><VisIcon size={10} /> {badge.label}</span>
        </td>
        <td><span className="doc-cell-text doc-cell-whitespace doc-cell-gray">{formatDate(doc.createdAt)}</span></td>
        <td>
          <span className="doc-cell-text doc-cell-tabular doc-cell-gray">
            {documentService.hasStoredFile(doc) ? formatFileSize(doc.fileSize) : '—'}
          </span>
        </td>
      </tr>
    );
  };

  return (
    <Modal
      open
      onClose={() => { if (!submitting) onClose(); }}
      title="Select a document from the ERP"
      maxWidth="max-w-6xl"
      footer={(
        <div className="doc-picker-footer">
          <div className="doc-picker-footer-info">
            {selectedDoc ? (
              <>
                <span className="doc-picker-footer-label">Selected</span>
                <span className="doc-picker-footer-name" title={selectedName}>{selectedName}</span>
              </>
            ) : (
              <span className="doc-picker-footer-hint">Select a document to continue</span>
            )}
          </div>
          <div className="doc-picker-footer-actions">
            <button type="button" className="po-btn po-btn-ghost po-btn-sm" onClick={onBack} disabled={submitting}>
              <ChevronLeft size={13} /> Back
            </button>
            <button type="button" className="po-btn po-btn-ghost po-btn-sm" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button
              type="button"
              className="po-btn po-btn-primary po-btn-sm"
              onClick={handleConfirm}
              disabled={!selectedDoc || submitting}
            >
              {submitting ? <Loader2 size={13} className="spinner" /> : null}
              {submitting ? 'Adding…' : 'Use This Document'}
            </button>
          </div>
        </div>
      )}
    >
      <p className="doc-picker-intro">
        Files your sales modules already store. The file is <strong>referenced</strong> —
        it is not uploaded or copied again — and it is added to{' '}
        <strong>{targetLabel || targetModule || 'the Sales repository'}</strong>.
        Documents <strong>already in {targetLabel || 'this list'}</strong> are shown but cannot be
        selected again, so no duplicate entry is created.
      </p>

      <div className="doc-picker-toolbar">
        <div className="doc-picker-search">
          <div className="po-search-box">
            <Search />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by document name, number, client or type…"
              aria-label="Search documents in the ERP"
            />
            {searchInput && (
              <button
                type="button"
                className="doc-picker-clear"
                aria-label="Clear search"
                onClick={() => setSearchInput('')}
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>
        <div className="doc-field">
          <label className="doc-field-label" htmlFor="inside-erp-category">Category</label>
          <select
            id="inside-erp-category"
            className="doc-filter-select"
            value={module}
            onChange={(e) => { setModule(e.target.value); setPage(0); }}
          >
            <option value="">All Sales documents</option>
            {categories.map((category) => (
              <option key={category.key} value={category.module}>{category.label}</option>
            ))}
          </select>
        </div>
      </div>

      {submitError && (
        <div className="doc-picker-alert" role="alert">
          <AlertTriangle size={14} /> <span>{submitError}</span>
        </div>
      )}

      <div className="doc-picker-results">
        <div className="doc-table-scroll">
          <table className="doc-table">
            <thead>
              <tr>
                <th className="doc-align-center doc-picker-radio" aria-label="Select" />
                <th>Document</th>
                <th>Type</th>
                <th>Record No.</th>
                <th>Customer</th>
                <th>Source</th>
                <th>Visibility</th>
                <th>Created</th>
                <th>Size</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9}>
                    <div className="doc-table-loading">
                      <Loader2 size={16} className="spinner" />
                      <p>Loading documents from the repository…</p>
                    </div>
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={9}>
                    <div className="doc-empty">
                      <div className="doc-empty-icon"><FolderOpen size={26} /></div>
                      <div className="doc-empty-title">
                        {loadError ? 'The repository could not be read' : 'No selectable documents found'}
                      </div>
                      <div className="doc-empty-sub">
                        {loadError
                          ? loadError
                          : (search || module
                            ? 'No stored document matches the current search and category.'
                            : 'Only documents that already have a stored file can be selected — documents still awaiting generation have nothing to reuse.')}
                      </div>
                      {loadError && (
                        <button type="button" className="doc-btn doc-btn-secondary doc-empty-action" onClick={load}>
                          Retry
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                rows.map(renderRow)
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="doc-pagination">
            <span className="doc-pagination-info">{range.label}</span>
            <div className="doc-pagination-btns">
              <button
                type="button"
                className="doc-page-btn"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                Prev
              </button>
              <button
                type="button"
                className="doc-page-btn"
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
