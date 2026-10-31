/**
 * DocumentPreview — the Documents module's standardized document preview.
 *
 * Route: /documents/:id/preview
 *
 * Same workspace language as the Invoice design page (the ERP's reference
 * document-preview experience):
 *
 *   TOP BAR ......... breadcrumb · Back to Documents · title · document number · status
 *   CENTER .......... paper-like canvas rendering the REAL stored document bytes
 *   RIGHT PANEL ..... the selected document (number, module, record, customer,
 *                     status, visibility, size) and its existing version history
 *
 * It exists so that EVERY document type reachable from Documents → ⋮ → View /
 * Preview lands on a document preview. Modules that own a design workspace
 * (Sales Execution, CPR, Cost/Profit Workout) keep opening that workspace;
 * modules without one (Lead / Client / Follow-up documents) would otherwise be
 * sent to their CRM record page, which is not a document preview at all.
 *
 * Nothing is invented here: the document is loaded through the existing
 * documents API, the bytes through the existing authenticated file endpoint,
 * the versions through the existing versions endpoint, and every action is one
 * the Documents list already offers (Download / Open Related Record / refresh).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  ExternalLink,
  File,
  FileText,
  IdCard,
  Loader2,
  Pencil,
  Printer,
  RefreshCw,
  User
} from 'lucide-react';
import { ActionMenu, useToast } from '../components/Common';
import DocumentSheet from '../components/DocumentSheet/DocumentSheet';
import { loadCrmSheetRecord } from '../components/DocumentSheet/crmDocumentSheets';
import documentService from '../services/documentService';
import {
  getModuleRoute,
  getStatusBadge,
  getVisibilityBadge,
  payloadOf,
  previewRouteFor,
  resolvePreviewKind,
  DOCUMENT_SCOPE
} from '../utils/documentView';
import { formatFileSize } from '../utils/attachmentStorage';
import { formatDate } from '../utils/leadHelpers';
import '../styles/document-badges.css';
import '../styles/document-preview.css';

const CARD = 'bg-surface border border-slate-200 rounded-xl shadow-sm';

export default function DocumentPreview() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [doc, setDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [fileError, setFileError] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewKind, setPreviewKind] = useState(null);
  const [previewText, setPreviewText] = useState('');
  const [versions, setVersions] = useState([]);
  const [busy, setBusy] = useState('');
  // Right-panel control tab. `null` means the user has not chosen one yet, so
  // the panel is free to open on the record once a document sheet resolves.
  const [tab, setTab] = useState(null);
  // The other documents of this same module, for the panel's document picker.
  const [moduleDocs, setModuleDocs] = useState([]);
  // The source record behind a CRM document (Lead / Client / Follow-up), read
  // through that module's own endpoint so the canvas can render the ERP's
  // native document sheet instead of only the stored file frame. Null means
  // "this document type has no native layout, or its record is unavailable" —
  // the file preview below is then used exactly as before.
  const [sheetState, setSheetState] = useState(null);
  // Derived from the document being shown, so switching documents can never
  // leave the previous document's sheet on screen while the next one loads.
  const sheet = sheetState && String(sheetState.docId) === String(doc?.id) ? sheetState : null;
  // PDF surface state: 'loading' while the frame navigates, 'ready' once the
  // browser has rendered it, 'blocked' when the browser cannot display the PDF
  // inline at all — in which case the user gets an explicit, actionable state
  // instead of an unexplained blank page.
  const [frameState, setFrameState] = useState('loading');

  // Object URLs are owned by this component and revoked exactly once.
  const urlRef = useRef(null);

  const revokeUrl = useCallback(() => {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
    setPreviewUrl(null);
  }, []);

  /* ─── 1. Load the selected document (existing GET /documents/{id}) ─── */
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    (async () => {
      try {
        const data = payloadOf(await documentService.get(id));
        if (!data || typeof data !== 'object' || data.id == null) {
          throw new Error('Document not found');
        }
        if (!cancelled) setDoc(data);
      } catch (err) {
        if (cancelled) return;
        const status = err?.response?.status;
        setDoc(null);
        setLoadError(
          status === 403
            ? 'You do not have permission to view this document.'
            : status === 404
              ? 'This document no longer exists.'
              : err?.response?.data?.message || err?.message || 'Failed to load this document.'
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  /* ─── 2. Render the stored bytes (existing authenticated inline endpoint) ─── */
  useEffect(() => {
    revokeUrl();
    setPreviewKind(null);
    setPreviewText('');
    setFileError(null);
    if (!doc || !documentService.hasStoredFile(doc)) return;

    let cancelled = false;
    (async () => {
      try {
        const { blob, contentType } = await documentService.getPreviewBlob(doc);
        const mime = String(contentType || doc.fileType || '').split(';')[0].trim();
        const kind = resolvePreviewKind(mime, doc.documentName || doc.filePath);
        const text = kind === 'text' ? await blob.text() : '';
        const url = URL.createObjectURL(blob);
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        urlRef.current = url;
        setPreviewUrl(url);
        setPreviewKind(kind);
        setPreviewText(text);
      } catch (err) {
        if (cancelled) return;
        const status = err?.response?.status;
        setFileError(
          status === 403
            ? 'You are not authorized to open this document.'
            : status === 404
              ? 'The stored file for this document could not be found on the server.'
              : err?.response?.data?.message || err?.message || 'The stored file could not be opened.'
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [doc, revokeUrl]);

  // Release the object URL when leaving the preview.
  useEffect(() => revokeUrl, [revokeUrl]);

  /* ─── 3. Existing version history (GET /documents/{id}/versions) ─── */
  useEffect(() => {
    if (!doc?.id) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const list = await documentService.getVersions(doc.id);
        if (!cancelled) setVersions(Array.isArray(list) ? list : []);
      } catch {
        // A document without version rows (or one that just disappeared) keeps
        // the panel's empty state instead of an error.
        if (!cancelled) setVersions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [doc?.id]);

  /* ─── 3a. Sibling documents of the same module (existing list endpoint) ───
   * Feeds the right panel's document picker, exactly like the design
   * workspaces let you switch between the documents of the module you are
   * working in. Module-scoped and Sales-scoped, so the picker describes the
   * same dataset the Documents list shows. */
  useEffect(() => {
    if (!doc?.module) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const page = await documentService.list({
          module: doc.module,
          scope: DOCUMENT_SCOPE,
          page: 0,
          size: 100,
          sort: 'createdAt:desc'
        });
        if (!cancelled) setModuleDocs(Array.isArray(page?.content) ? page.content : []);
      } catch {
        // A picker that cannot be populated must not break the document view.
        if (!cancelled) setModuleDocs([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [doc?.module]);

  /* ─── 3b. Confirm the PDF surface actually rendered ───
   * onLoad is the ERP's existing signal for a rendered PDF frame; if the
   * browser never loads it (inline PDF viewing disabled, blob frames blocked),
   * say so plainly rather than showing an empty page. */
  useEffect(() => {
    if (previewKind !== 'pdf' || !previewUrl) return undefined;
    setFrameState('loading');
    const timer = setTimeout(() => {
      setFrameState((current) => (current === 'loading' ? 'blocked' : current));
    }, 2500);
    return () => clearTimeout(timer);
  }, [previewKind, previewUrl]);

  /* ─── 3b. Native document sheet for the CRM-owned document types ───
   * Lead / Client / Follow-up documents have no design workspace of their own,
   * so this page is their preview surface. Load the record the document was
   * generated from (existing module endpoint) and let the canvas render the
   * real document; a failure or an unknown type leaves `sheet` null and the
   * stored-file canvas is used, so this can never block a preview. */
  useEffect(() => {
    let cancelled = false;
    const docId = doc?.id;
    if (docId == null || doc.relatedRecordId == null) return undefined;
    loadCrmSheetRecord(doc.module, doc.relatedRecordId, doc)
      .then((result) => {
        if (!cancelled && result) setSheetState({ ...result, docId });
      })
      // No sheet (unknown type, missing record, unreachable endpoint): the
      // stored-file canvas below is the preview, exactly as before.
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [doc]);

  /* ─── 4. Print styles are scoped to this page only ─── */
  useEffect(() => {
    document.body.classList.add('doc-preview-print-scope');
    return () => document.body.classList.remove('doc-preview-print-scope');
  }, []);

  const reload = () => {
    setDoc(null);
    setLoading(true);
    setLoadError(null);
    documentService
      .get(id)
      .then((result) => setDoc(payloadOf(result)))
      .catch((err) => setLoadError(err?.response?.data?.message || err?.message || 'Failed to load this document.'))
      .finally(() => setLoading(false));
  };

  const handleDownload = async () => {
    if (!doc || doc.canDownload === false) {
      toast.error('You do not have permission to download this document.');
      return;
    }
    setBusy('download');
    try {
      await documentService.downloadFile(doc);
    } catch (err) {
      const status = err?.response?.status;
      if (status === 403) toast.error('You are not authorized to download this document.');
      else if (status === 404) toast.error('The stored file for this document could not be found on the server.');
      else toast.error(err?.response?.data?.message || err?.message || 'Download failed. Please try again.');
    } finally {
      setBusy('');
    }
  };

  const handleOpenInNewTab = async () => {
    try {
      await documentService.openForPreview(doc);
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || 'Could not open the document in a new tab.');
    }
  };

  const recordRoute = doc ? getModuleRoute(doc.module, doc.relatedRecordId) : null;
  const hasStoredFile = Boolean(doc) && documentService.hasStoredFile(doc);
  const statusBadge = doc ? getStatusBadge(doc.status) : null;
  const visibilityBadge = doc ? getVisibilityBadge(doc.visibility) : null;
  const documentNumber = doc?.recordNumber || doc?.documentName || '';

  // Header identity — the design workspaces title themselves after the
  // document type (e.g. "Invoice Design") with the number and status on the
  // right, so this workspace names the document it is showing the same way
  // instead of a generic "Preview".
  const documentTitle = doc?.documentType ? `${doc.documentType} Document` : 'Document Preview';

  // ── The native document sheet (CRM-owned types) ──
  // Everything below is derived from the REAL record this document was
  // generated from; the sheet spec supplies the labels and order, exactly as
  // the backend's own document layout does. Nothing is hardcoded per document.
  const sheetSpec = sheet?.spec;
  const sheetRecord = sheet?.record;
  const sheetNumber = doc?.recordNumber
    || (sheetSpec && sheetRecord ? sheetSpec.number(sheetRecord) : '');
  const sheetRawDate = sheetSpec && sheetRecord ? sheetSpec.date(sheetRecord) : null;
  const sheetDate = sheetRawDate
    ? formatDate(sheetRawDate)
    : (doc?.createdAt ? formatDate(doc.createdAt) : '');
  const sheetRows = sheetSpec && sheetRecord ? sheetSpec.rows(sheetRecord) : [];
  const sheetDetails = sheetSpec && sheetRecord ? sheetSpec.details(sheetRecord) : [];
  const sheetPanelRows = sheetSpec && sheetRecord ? sheetSpec.panelRows(sheetRecord, doc) : [];
  // The record's own foreign keys, resolved through the shared module → route
  // resolver, so a Follow-up can reach its Lead / Client in one click.
  const sheetLinks = sheetRecord
    ? [
        ['leadId', 'lead', 'Open Lead'],
        ['clientId', 'client', 'Open Client']
      ]
        .map(([field, module, label]) => ({
          key: module,
          label,
          route: sheetRecord[field] != null ? getModuleRoute(module, sheetRecord[field]) : null
        }))
        .filter((link) => link.route)
    : [];

  // Right-panel control tabs. Every tab is backed by data this page ALREADY
  // loads (the document, its version history, its owning record) — no new
  // endpoint and no invented editing surface.
  const tabs = [
    ...(sheet ? [{ key: 'record', label: doc.module || 'Record', icon: IdCard }] : []),
    { key: 'details', label: 'Details', icon: FileText },
    { key: 'versions', label: versions.length ? `Versions (${versions.length})` : 'Versions', icon: Clock },
    ...(recordRoute ? [{ key: 'related', label: 'Related Record', icon: ExternalLink }] : [])
  ];
  // With no choice made yet, a document that has a record opens on it — that is
  // the information a reviewer comes to a document preview for.
  const activeTab = tabs.some((t) => t.key === tab) ? tab : (sheet ? 'record' : 'details');

  // Secondary actions sit behind ⋯ More, exactly as they do in the design
  // workspaces — Print and Download stay in the front row.
  const moreActions = [];
  if (recordRoute) {
    moreActions.push({
      key: 'record',
      label: 'Open Related Record',
      icon: ExternalLink,
      action: () => navigate(recordRoute)
    });
  }
  if (previewUrl && previewKind && previewKind !== 'unsupported') {
    moreActions.push({ key: 'newTab', label: 'Open in New Tab', icon: File, action: handleOpenInNewTab });
  }

  // Picker options always contain the document being viewed, so the control is
  // never blank while the sibling list is still loading (or is unavailable).
  const pickerOptions = (() => {
    if (!doc) return [];
    const list = Array.isArray(moduleDocs) ? moduleDocs : [];
    return list.some((d) => String(d.id) === String(doc.id)) ? list : [doc, ...list];
  })();

  const handlePickDocument = (event) => {
    const next = pickerOptions.find((d) => String(d.id) === event.target.value);
    if (!next || String(next.id) === String(doc.id)) return;
    // Same resolver the Documents list uses, so another module's document still
    // opens ITS design workspace rather than this preview page.
    const route = previewRouteFor(next);
    if (route) navigate(route);
  };

  const infoRows = doc
    ? [
        ['Document name', doc.documentName],
        ['Module', doc.module],
        ['Record number', doc.recordNumber || '—'],
        ['Customer', doc.customerName || '—'],
        ['Created / uploaded by', doc.uploadedBy || '—'],
        ['Date', doc.createdAt ? formatDate(doc.createdAt) : '—'],
        ['Version', `v${doc.versionNumber || 1}`],
        ['File size', doc.fileSize ? formatFileSize(doc.fileSize) : '—']
      ]
    : [];

  return (
    <div className="doc-preview-root text-slate-800">
      {/* Breadcrumb — same pattern as the invoice design page */}
      <nav className="pr-breadcrumb" aria-label="Breadcrumb">
        <button type="button" className="bc-link" onClick={() => navigate('/dashboard')}>Dashboard</button>
        <ChevronRight size={10} className="bc-sep" aria-hidden="true" />
        <button type="button" className="bc-link" onClick={() => navigate('/sales')}>Sales</button>
        <ChevronRight size={10} className="bc-sep" aria-hidden="true" />
        <button type="button" className="bc-link" onClick={() => navigate('/documents')}>Documents</button>
        <ChevronRight size={10} className="bc-sep" aria-hidden="true" />
        <span>{documentNumber || 'Preview'}</span>
      </nav>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div className="min-w-0">
          <button
            type="button"
            onClick={() => navigate('/documents')}
            className="flex items-center gap-1 text-xs font-bold text-[#0B4A3D] hover:underline cursor-pointer bg-transparent border-none p-0 mb-1"
          >
            <ChevronLeft className="w-3.5 h-3.5" /> Back to Documents
          </button>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <FileText className="w-5 h-5 text-[#0B4A3D]" />
            {documentTitle}
          </h1>
          <p className="text-xs text-slate-400 font-medium mt-1">
            {doc?.module ? `${doc.module} · stored document` : 'View, print and download the stored document'}
          </p>
        </div>
        {doc && (
          <div className="flex items-center gap-2.5 shrink-0">
            <span className="text-sm font-bold text-slate-700">{documentNumber || '—'}</span>
            {statusBadge && <span className={statusBadge.className}>{statusBadge.label}</span>}
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-5 h-5 animate-spin text-[#0B4A3D]" />
        </div>
      ) : loadError || !doc ? (
        <div className={`${CARD} p-12 text-center`}>
          <FileText className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <h2 className="text-base font-bold text-slate-700 mb-1">Document unavailable</h2>
          <p className="text-xs text-slate-400">{loadError || 'This document could not be loaded.'}</p>
          <button type="button" onClick={reload} className="po-btn po-btn-ghost po-btn-sm mt-4">
            <RefreshCw size={14} /> Try again
          </button>
        </div>
      ) : (
        <>
          {/* ===== Top action bar (existing actions only) ===== */}
          <div className="doc-preview-bar flex items-center gap-2 flex-wrap mb-4 bg-surface border border-slate-200 rounded-xl shadow-sm px-3 py-2.5">
            {/* Edit opens the Documents list's EXISTING metadata editor for this
                document (PUT /documents/{id}) — same modal the row action uses,
                so no second editing implementation exists. */}
            {doc.canEdit !== false && (
              <button
                type="button"
                onClick={() => navigate(`/documents?edit=${doc.id}`)}
                className="inline-flex items-center gap-1.5 text-xs font-bold px-3.5 h-9 rounded-lg transition-colors cursor-pointer text-slate-600 bg-surface border border-slate-200 hover:bg-slate-50"
              >
                <Pencil className="w-3.5 h-3.5" /> Edit
              </button>
            )}
            <button
              type="button"
              onClick={() => window.print()}
              disabled={!hasStoredFile}
              className="inline-flex items-center gap-1.5 text-xs font-bold px-3.5 h-9 rounded-lg transition-colors cursor-pointer text-white bg-[#0B4A3D] hover:bg-[#083D34] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Printer className="w-3.5 h-3.5" /> Print
            </button>
            <button
              type="button"
              onClick={handleDownload}
              disabled={busy === 'download' || !hasStoredFile}
              className="inline-flex items-center gap-1.5 text-xs font-bold px-3.5 h-9 rounded-lg transition-colors cursor-pointer text-slate-600 bg-surface border border-slate-200 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {busy === 'download' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              Download
            </button>
            {moreActions.length > 0 && (
              <ActionMenu
                items={moreActions}
                onAction={(key) => moreActions.find((a) => a.key === key)?.action()}
                triggerClassName="inline-flex items-center gap-1.5 text-xs font-bold px-3.5 h-9 rounded-lg transition-colors cursor-pointer text-slate-600 bg-surface border border-slate-200 hover:bg-slate-50"
                buttonLabel="More document actions"
                label="More"
              />
            )}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-5 items-start">
            {/* ===== The document itself (paper canvas) ===== */}
            <div className="doc-preview-canvas order-1 bg-slate-100/80 border border-slate-200 rounded-xl shadow-sm px-4 sm:px-6 py-4 overflow-x-auto">
              {sheet ? (
                /* The ERP's own document layout for a CRM-owned record. This is
                   the document — the stored file stays reachable through
                   Download / Open in New Tab. */
                <div className="doc-preview-sheet">
                  <DocumentSheet
                    title={sheetSpec.title}
                    number={sheetNumber}
                    date={sheetDate}
                    heading={sheetSpec.heading(sheetRecord)}
                    rows={sheetRows}
                    details={sheetDetails}
                  />
                </div>
              ) : !hasStoredFile ? (
                <div className="doc-preview-sheet doc-preview-empty">
                  <File className="w-9 h-9 text-slate-300 mb-2.5" />
                  <div className="text-[13px] font-bold text-slate-700 mb-1">No stored file yet</div>
                  <div className="text-xs text-slate-500 max-w-[380px]">
                    This document entry exists but has no file attached. Use
                    {' '}<span className="font-semibold">Regenerate Document</span>{' '}
                    on the Documents list to create it from the source record.
                  </div>
                </div>
              ) : fileError ? (
                <div className="doc-preview-sheet doc-preview-empty">
                  <FileText className="w-9 h-9 text-slate-300 mb-2.5" />
                  <div className="text-[13px] font-bold text-slate-700 mb-1">Preview unavailable</div>
                  <div className="text-xs text-slate-500 max-w-[380px]">{fileError}</div>
                </div>
              ) : previewKind === 'pdf' && previewUrl && frameState !== 'blocked' ? (
                <div className="doc-preview-sheet doc-preview-sheet--file">
                  <iframe
                    src={previewUrl}
                    title={doc.documentName}
                    className="doc-preview-frame"
                    onLoad={() => setFrameState('ready')}
                    onError={() => setFrameState('blocked')}
                  />
                  {frameState === 'loading' && (
                    <div className="doc-preview-overlay">
                      <Loader2 className="w-5 h-5 animate-spin text-slate-400 mb-2" />
                      <div className="text-xs text-slate-500">Rendering document…</div>
                    </div>
                  )}
                </div>
              ) : previewKind === 'pdf' && previewUrl ? (
                <div className="doc-preview-sheet doc-preview-empty">
                  <FileText className="w-9 h-9 text-slate-300 mb-2.5" />
                  <div className="text-[13px] font-bold text-slate-700 mb-1">
                    Inline preview is unavailable in this browser
                  </div>
                  <div className="text-xs text-slate-500 max-w-[380px] mb-4">
                    The document is stored and can still be opened — use
                    {' '}<span className="font-semibold">Download</span>{' '}or
                    {' '}<span className="font-semibold">Open in New Tab</span>{' '}
                    above to view {documentNumber || 'this document'}.
                  </div>
                  <div className="flex items-center gap-2 flex-wrap justify-center">
                    <button type="button" onClick={handleDownload} className="po-btn po-btn-primary po-btn-sm">
                      <Download size={14} /> Download
                    </button>
                    <button type="button" onClick={handleOpenInNewTab} className="po-btn po-btn-ghost po-btn-sm">
                      <ExternalLink size={14} /> Open in New Tab
                    </button>
                  </div>
                </div>
              ) : previewKind === 'image' && previewUrl ? (
                <div className="doc-preview-sheet doc-preview-sheet--image">
                  <img src={previewUrl} alt={doc.documentName} className="doc-preview-image" />
                </div>
              ) : previewKind === 'text' ? (
                <div className="doc-preview-sheet">
                  <pre className="doc-preview-text">{previewText}</pre>
                </div>
              ) : previewKind ? (
                <div className="doc-preview-sheet doc-preview-empty">
                  <File className="w-9 h-9 text-slate-300 mb-2.5" />
                  <div className="text-[13px] font-bold text-slate-700 mb-1">Preview unavailable</div>
                  <div className="text-xs text-slate-500 max-w-[380px]">
                    {`${String(doc.documentType || 'This file').toUpperCase()} files can't be rendered in the browser. Download the document to open it.`}
                  </div>
                </div>
              ) : (
                <div className="doc-preview-sheet doc-preview-empty">
                  <Loader2 className="w-5 h-5 animate-spin text-slate-400 mb-2" />
                  <div className="text-xs text-slate-500">Loading document…</div>
                </div>
              )}
            </div>

            {/* ===== Right document panel ===== */}
            <div className="doc-preview-aside space-y-4 order-2">
              {/* Control panel — the same two-card shape the design workspaces
                  use: the document's identity, its status and the vertical
                  control tabs on top, the active tab's panel below. */}
              <div className={`${CARD} p-5`}>
                <h3 className="text-[13px] font-bold text-[#0B4A3D] uppercase tracking-wider mb-4">
                  Document
                </h3>

                {/* Document picker — the control that defines the design
                    workspace's right panel. Lists the documents of THIS module
                    through the existing list endpoint and opens the chosen one
                    through the same resolver the Documents list uses. */}
                <label
                  className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5"
                  htmlFor="doc-preview-picker"
                >
                  {doc.module || doc.documentType || 'Document'}
                </label>
                <select
                  id="doc-preview-picker"
                  value={String(doc.id)}
                  onChange={handlePickDocument}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-[#0B4A3D] cursor-pointer"
                >
                  {pickerOptions.map((d) => (
                    <option key={d.id} value={String(d.id)}>
                      {d.recordNumber || d.documentName || `Document ${d.id}`} — {d.customerName || d.documentType || d.module || ''}
                    </option>
                  ))}
                </select>

                <div className="mt-4 border-t border-slate-100 pt-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-bold text-slate-500">Status</span>
                    {statusBadge && <span className={statusBadge.className}>{statusBadge.label}</span>}
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-bold text-slate-500">Visibility</span>
                    {visibilityBadge && (
                      <span className={visibilityBadge.className}>
                        <visibilityBadge.icon size={10} /> {visibilityBadge.label}
                      </span>
                    )}
                  </div>
                </div>

                {/* Vertical control tabs — the design workspace's panel pattern. */}
                <div className="flex flex-col gap-1 mt-5">
                  {tabs.map((t) => {
                    const Icon = t.icon;
                    const active = activeTab === t.key;
                    return (
                      <button
                        key={t.key}
                        type="button"
                        onClick={() => setTab(t.key)}
                        className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                          active ? 'bg-[#E8F0EE] text-[#0B4A3D]' : 'text-slate-500 hover:bg-slate-50'
                        }`}
                      >
                        <Icon className="w-4 h-4" /> {t.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Active tab panel. */}
              <div className={`${CARD} p-5`}>
                {/* The record the document was generated from — the CRM fields
                    a reviewer needs, read straight off that record. */}
                {activeTab === 'record' && (
                  <div className="space-y-2.5">
                    {sheetPanelRows.map(([label, value]) => (
                      <div key={label} className="flex items-start justify-between gap-3">
                        <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{label}</span>
                        <span className="text-xs font-semibold text-slate-600 text-right break-words">{value}</span>
                      </div>
                    ))}
                    {sheetLinks.length > 0 && (
                      <div className="flex flex-wrap gap-2 pt-3 border-t border-slate-100">
                        {sheetLinks.map((link) => (
                          <button
                            key={link.key}
                            type="button"
                            onClick={() => navigate(link.route)}
                            className="po-btn po-btn-ghost po-btn-sm"
                          >
                            <ExternalLink size={14} /> {link.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'details' && (
                  <div className="space-y-2.5">
                    {infoRows.map(([label, value]) => (
                      <div key={label} className="flex items-start justify-between gap-3">
                        <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{label}</span>
                        <span className="text-xs font-semibold text-slate-600 text-right break-words">{value || '—'}</span>
                      </div>
                    ))}
                    {doc.description && (
                      <div className="mt-1 border-t border-slate-100 pt-3">
                        <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-1">Description</div>
                        <p className="text-xs text-slate-600 leading-relaxed">{doc.description}</p>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'versions' &&
                  (versions.length === 0 ? (
                    <div className="text-xs text-slate-400 leading-relaxed">
                      No version history yet — this is the original version of the document.
                    </div>
                  ) : (
                    <div className="flex flex-col">
                      {versions.map((v, i) => (
                        <div key={`${v.id || v.storedName || i}-${i}`} className="py-2.5 border-b border-slate-100 last:border-b-0">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-xs font-bold text-slate-700">v{v.versionNumber || '-'}</span>
                            <span className="text-[11px] text-slate-400">
                              {v.uploadedAt || v.createdAt ? formatDate(v.uploadedAt || v.createdAt) : '—'}
                            </span>
                          </div>
                          <div className="mt-0.5 text-[11px] text-slate-500 break-words">
                            <User className="w-3 h-3 inline mr-1 -mt-0.5" />
                            {v.uploadedBy || 'System'}
                            {v.fileSize ? ` · ${formatFileSize(v.fileSize)}` : ''}
                          </div>
                          {v.changeNotes && (
                            <div className="mt-1 text-[11px] italic text-slate-500">{v.changeNotes}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  ))}

                {activeTab === 'related' && (
                  <div className="space-y-4">
                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-1">Source record</div>
                      <div className="text-sm font-bold text-slate-700 break-words">{doc.recordNumber || '—'}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">{doc.module || '—'}</div>
                    </div>
                    {recordRoute ? (
                      <button
                        type="button"
                        onClick={() => navigate(recordRoute)}
                        className="flex items-center justify-center gap-1.5 w-full text-xs font-bold text-white bg-[#0B4A3D] hover:bg-[#083D34] px-3 py-2.5 rounded-lg transition-colors cursor-pointer"
                      >
                        <ExternalLink className="w-3.5 h-3.5" /> Open {doc.module || 'record'}
                      </button>
                    ) : (
                      <div className="text-xs text-slate-400 leading-relaxed">
                        This document has no linked source record.
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
