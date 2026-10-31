/**
 * purchase/components/AttachmentManager.jsx
 * ------------------------------------------------------------------
 * Reusable attachment uploader for Purchase forms. Supports:
 *
 *   • Drag & drop + browse (multiple files)
 *   • File validation: extension/MIME, size, empty-file checks
 *   • Duplicate filename warning (with rename option)
 *   • Per-file upload status: success / error / pending
 *   • Cancel individual uploads
 *   • Retry failed uploads
 *   • Upload progress indicator
 *   • Metadata: document name, type, category, description,
 *     source module, source reference, vendor, tags, confidential
 *   • Supported: PDF, PNG, JPG, JPEG, DOC, DOCX, XLS, XLSX, CSV, TXT
 *
 * Controlled: `attachments` array + `onChange` setter.
 * Previewing delegates to the shared AttachmentPreview enterprise
 * viewer — single source of truth across the module.
 * ------------------------------------------------------------------
 */
import { useCallback, useRef, useState } from 'react';
import {
  AlertTriangle, CheckCircle2, Download, Eye, FileText, Loader2, Paperclip,
  RefreshCw, Tag, Trash2, Upload, X, XCircle
} from 'lucide-react';
import AttachmentPreview from './AttachmentPreview';
import {
  ACCEPT_STRING,
  ALLOWED_EXT_KEYS,
  fileRejectionReason,
  findDuplicateName,
  formatSize,
  hasContent,
  downloadAttachment,
  detectType,
  TYPE_TONES
} from '../utils/attachmentFile';
import { getCurrentActor } from '../services/api-client';

let attachmentSeq = 1;

/* ─── Per-file upload states ─── */
const UPLOAD_STATUS = {
  PENDING: 'pending',
  UPLOADING: 'uploading',
  SUCCESS: 'success',
  ERROR: 'error',
  CANCELLED: 'cancelled'
};

function readFileAsDataUrl(file, signal) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    if (signal) {
      signal.addEventListener('abort', () => {
        reader.abort();
        reject(new DOMException('Aborted', 'AbortError'));
      });
    }
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

/* ─── Metadata form defaults ─── */
function defaultMeta() {
  return {
    name: '',
    type: '',
    category: '',
    description: '',
    sourceModule: '',
    sourceReference: '',
    vendor: '',
    tags: '',
    confidential: false
  };
}

/* ─── Upload queue item ─── */
function createQueueItem(file, existingAttachments) {
  const duplicate = findDuplicateName(file.name, existingAttachments);
  return {
    id: `upl-${attachmentSeq++}`,
    file,
    name: file.name,
    size: file.size,
    type: file.type,
    status: UPLOAD_STATUS.PENDING,
    dataUrl: null,
    error: null,
    duplicate,
    progress: 0
  };
}

export default function AttachmentManager({
  attachments = [],
  onChange,
  disabled = false,
  accept = ACCEPT_STRING,
  maxSizeMb = 5
}) {
  const inputRef = useRef(null);
  const [preview, setPreview] = useState(null);
  const [downloadNotice, setDownloadNotice] = useState('');
  const [dragging, setDragging] = useState(false);
  const [queue, setQueue] = useState([]);
  const [showMetaForm, setShowMetaForm] = useState(false);
  const [meta, setMeta] = useState(defaultMeta);
  const abortControllers = useRef({});

  const updateQueueItem = useCallback((id, patch) => {
    setQueue((prev) => prev.map((item) => item.id === id ? { ...item, ...patch } : item));
  }, []);

  /* ─── Process a single file through the queue ─── */
  const processFile = useCallback(async (item) => {
    updateQueueItem(item.id, { status: UPLOAD_STATUS.UPLOADING, progress: 10 });

    const controller = new AbortController();
    abortControllers.current[item.id] = controller;

    try {
      updateQueueItem(item.id, { progress: 30 });
      const dataUrl = await readFileAsDataUrl(item.file, controller.signal);
      updateQueueItem(item.id, { progress: 70 });

      if (controller.signal.aborted) return;

      const actor = getCurrentActor();
      const attachment = {
        id: item.id,
        name: item.name,
        size: item.size,
        type: item.type,
        dataUrl,
        uploadedAt: new Date().toISOString(),
        uploadedBy: actor.name || 'Current User',
        /* Metadata fields */
        docName: meta.name || item.name,
        docType: meta.type || '',
        category: meta.category || '',
        description: meta.description || '',
        sourceModule: meta.sourceModule || '',
        sourceReference: meta.sourceReference || '',
        vendor: meta.vendor || '',
        tags: meta.tags ? meta.tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
        confidential: meta.confidential || false,
        version: 1
      };

      updateQueueItem(item.id, { progress: 100, status: UPLOAD_STATUS.SUCCESS, dataUrl });

      /* Add to attachments immediately */
      onChange?.([...attachments, attachment]);

      /* Clear success after a short delay */
      setTimeout(() => {
        setQueue((prev) => prev.filter((q) => q.id !== item.id));
      }, 2000);
    } catch (err) {
      if (err.name === 'AbortError') {
        updateQueueItem(item.id, { status: UPLOAD_STATUS.CANCELLED, error: 'Cancelled' });
      } else {
        updateQueueItem(item.id, {
          status: UPLOAD_STATUS.ERROR,
          error: err.message || 'Upload failed'
        });
      }
    } finally {
      delete abortControllers.current[item.id];
    }
  }, [attachments, onChange, meta, updateQueueItem]);

  /* ─── Handle files from input / drag ─── */
  const handleFiles = useCallback((fileList) => {
    if (!fileList || disabled) return;
    const files = Array.from(fileList);
    if (files.length === 0) return;

    const newItems = [];
    const errors = [];

    for (const file of files) {
      const reason = fileRejectionReason(file, maxSizeMb);
      if (reason) {
        errors.push({ name: file.name, reason });
        continue;
      }
      newItems.push(createQueueItem(file, attachments));
    }

    if (errors.length > 0) {
      setDownloadNotice(
        errors.map((e) => `${e.name}: ${e.reason}`).join('; ')
      );
      setTimeout(() => setDownloadNotice(''), 8000);
    }

    if (newItems.length === 0) return;

    setQueue((prev) => [...prev, ...newItems]);

    /* Start processing each file */
    for (const item of newItems) {
      processFile(item);
    }
  }, [disabled, maxSizeMb, attachments, processFile]);

  /* ─── Cancel an upload ─── */
  const cancelUpload = useCallback((itemId) => {
    const controller = abortControllers.current[itemId];
    if (controller) controller.abort();
    updateQueueItem(itemId, { status: UPLOAD_STATUS.CANCELLED });
  }, [updateQueueItem]);

  /* ─── Retry a failed upload ─── */
  const retryUpload = useCallback((item) => {
    updateQueueItem(item.id, { status: UPLOAD_STATUS.PENDING, error: null, progress: 0 });
    processFile(item);
  }, [processFile, updateQueueItem]);

  /* ─── Remove an attachment ─── */
  const remove = useCallback((id) => {
    onChange?.(attachments.filter((att) => att.id !== id));
    if (preview?.id === id) setPreview(null);
  }, [attachments, onChange, preview]);



  const isMissing = (att) => !hasContent(att);

  /* Count active uploads */
  const activeUploads = queue.filter(
    (q) => q.status === UPLOAD_STATUS.UPLOADING || q.status === UPLOAD_STATUS.PENDING
  );
  const hasActiveUploads = activeUploads.length > 0;

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={accept}
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = '';
        }}
      />

      {/* ── Drag & drop dropzone ── */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload attachments — click or drag files here"
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !disabled) {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragEnter={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handleFiles(e.dataTransfer?.files);
        }}
        className={`pr-dropzone ${dragging ? 'is-dragging' : ''} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <span className="p-2.5 rounded-xl bg-[#E8F0EE] text-[#0A4F44]">
          <Paperclip className="w-4 h-4" />
        </span>
        <p className="text-xs font-bold text-slate-700">
          {dragging ? 'Drop files to attach' : 'Drag & drop files here'}
        </p>
        <p className="text-[10.5px] text-slate-400">
          or{' '}
          <span className="text-[#0B4A3D] font-semibold underline underline-offset-2">browse</span>
          {' '}· up to {maxSizeMb} MB each · {ALLOWED_EXT_KEYS.map((e) => e.toUpperCase()).join(', ')}
        </p>
      </div>

      {/* ── Metadata toggle ── */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setShowMetaForm((v) => !v)}
          className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 hover:text-[#0B4A3D] transition-colors cursor-pointer"
        >
          <Tag className="w-3 h-3" />
          {showMetaForm ? 'Hide metadata' : 'Add metadata'}
        </button>
        {hasActiveUploads && (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-400">
            <Loader2 className="w-3 h-3 animate-spin" />
            {activeUploads.length} file{activeUploads.length !== 1 ? 's' : ''} uploading…
          </span>
        )}
      </div>

      {/* ── Metadata form ── */}
      {showMetaForm && (
        <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 space-y-2.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <MetaField label="Document name" value={meta.name} onChange={(v) => setMeta((m) => ({ ...m, name: v }))} placeholder="Override file name" />
            <MetaField label="Document type" value={meta.type} onChange={(v) => setMeta((m) => ({ ...m, type: v }))} placeholder="e.g. Purchase Order" />
            <MetaField label="Category" value={meta.category} onChange={(v) => setMeta((m) => ({ ...m, category: v }))} placeholder="e.g. Technical" />
            <MetaField label="Source module" value={meta.sourceModule} onChange={(v) => setMeta((m) => ({ ...m, sourceModule: v }))} placeholder="e.g. RFQ" />
            <MetaField label="Source reference" value={meta.sourceReference} onChange={(v) => setMeta((m) => ({ ...m, sourceReference: v }))} placeholder="e.g. RFQ-001" />
            <MetaField label="Vendor" value={meta.vendor} onChange={(v) => setMeta((m) => ({ ...m, vendor: v }))} placeholder="e.g. Tata Steel" />
          </div>
          <MetaField label="Description" value={meta.description} onChange={(v) => setMeta((m) => ({ ...m, description: v }))} placeholder="Brief description…" multiline />
          <MetaField label="Tags" value={meta.tags} onChange={(v) => setMeta((m) => ({ ...m, tags: v }))} placeholder="Comma-separated: urgent, review, final" />
          <label className="flex items-center gap-2 text-[11px] font-semibold text-slate-600 cursor-pointer">
            <input
              type="checkbox"
              checked={meta.confidential}
              onChange={(e) => setMeta((m) => ({ ...m, confidential: e.target.checked }))}
              className="w-3.5 h-3.5 rounded border-slate-300 text-[#0B4A3D] focus:ring-[#0B4A3D]/30"
            />
            Confidential — restrict access
          </label>
        </div>
      )}

      {/* ── Upload queue (per-file status) ── */}
      {queue.length > 0 && (
        <ul className="space-y-1">
          {queue.map((item) => (
            <li
              key={item.id}
              className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2"
            >
              {/* Status icon */}
              <span className="shrink-0">
                {item.status === UPLOAD_STATUS.SUCCESS && (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                )}
                {item.status === UPLOAD_STATUS.ERROR && (
                  <XCircle className="w-4 h-4 text-rose-500" />
                )}
                {item.status === UPLOAD_STATUS.CANCELLED && (
                  <XCircle className="w-4 h-4 text-slate-400" />
                )}
                {item.status === UPLOAD_STATUS.UPLOADING && (
                  <Loader2 className="w-4 h-4 text-[#0B4A3D] animate-spin" />
                )}
                {item.status === UPLOAD_STATUS.PENDING && (
                  <FileText className="w-4 h-4 text-slate-400" />
                )}
              </span>

              {/* File info */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-slate-700 truncate">{item.name}</span>
                  {item.duplicate && (
                    <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-1.5 py-px shrink-0">
                      <AlertTriangle className="w-2.5 h-2.5" /> Duplicate
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-400">{formatSize(item.size)}</span>
                  {item.status === UPLOAD_STATUS.UPLOADING && (
                    <div className="flex-1 max-w-[120px] h-1 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[#0B4A3D] transition-all duration-300"
                        style={{ width: `${item.progress}%` }}
                      />
                    </div>
                  )}
                  {item.error && (
                    <span className="text-[10px] font-semibold text-rose-500 truncate">{item.error}</span>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 shrink-0">
                {item.status === UPLOAD_STATUS.UPLOADING && (
                  <button
                    type="button"
                    onClick={() => cancelUpload(item.id)}
                    className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                    title="Cancel upload"
                    aria-label={`Cancel upload of ${item.name}`}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
                {item.status === UPLOAD_STATUS.ERROR && (
                  <button
                    type="button"
                    onClick={() => retryUpload(item)}
                    className="p-1 rounded text-slate-400 hover:text-[#0B4A3D] hover:bg-[#EDF7F4] transition-colors cursor-pointer"
                    title="Retry upload"
                    aria-label={`Retry upload of ${item.name}`}
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* ── Error notice ── */}
      {downloadNotice && (
        <p className="text-[11px] font-semibold text-rose-500 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2" role="alert">
          {downloadNotice}
        </p>
      )}

      {/* ── Attached files list ── */}
      {attachments.length > 0 && (
        <ul className="divide-y divide-slate-100 border border-slate-200 rounded-lg bg-slate-50/50">
          {attachments.map((att) => {
            const kind = detectType(att.name, att.type);
            const tone = TYPE_TONES[kind] || TYPE_TONES.other;
            const Icon = tone.Icon;
            return (
              <li key={att.id} className="flex items-center gap-3 px-3 py-2">
                <span
                  className="p-1.5 rounded-lg shrink-0"
                  style={{ background: tone.bg, color: tone.color }}
                >
                  <Icon className="w-3.5 h-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs font-semibold text-slate-700 truncate">{att.name}</p>
                    {att.confidential && (
                      <span className="text-[9px] font-bold text-rose-600 bg-rose-50 border border-rose-200 rounded px-1 py-px shrink-0">
                        Confidential
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="text-[10px] text-slate-400">{formatSize(att.size)}</p>
                    {att.category && (
                      <span className="text-[9px] font-semibold text-slate-500 bg-slate-100 rounded px-1 py-px">
                        {att.category}
                      </span>
                    )}
                    {att.tags?.length > 0 && (
                      <span className="text-[9px] text-slate-400">
                        {att.tags.slice(0, 2).join(', ')}{att.tags.length > 2 ? '…' : ''}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => setPreview(att)}
                    disabled={isMissing(att)}
                    className="p-1.5 rounded-md text-slate-400 hover:text-[#0B4A3D] hover:bg-[#EDF7F4] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    aria-label={`Preview ${att.name}`}
                    title={isMissing(att) ? 'No file content available' : 'Preview'}
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const ok = await downloadAttachment(att);
                      setDownloadNotice(
                        ok ? '' : `${att.name} could not be downloaded — the file content may be missing.`
                      );
                      if (!ok) setTimeout(() => setDownloadNotice(''), 5000);
                    }}
                    disabled={isMissing(att)}
                    className="p-1.5 rounded-md text-slate-400 hover:text-[#0B4A3D] hover:bg-[#EDF7F4] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    aria-label={`Download ${att.name}`}
                    title={isMissing(att) ? 'No file content available' : 'Download'}
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>
                  {!disabled && (
                    <button
                      type="button"
                      onClick={() => remove(att.id)}
                      className="p-1.5 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                      aria-label={`Delete ${att.name}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* ── Upload button ── */}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
        className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0B4A3D] border border-dashed border-[#0B4A3D]/40 hover:border-[#0B4A3D] bg-[#EDF7F4]/50 hover:bg-[#EDF7F4] px-3 py-2 rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Upload className="w-3.5 h-3.5" />
        Upload Attachment
        <span className="hidden sm:inline text-[10px] font-semibold text-slate-400">({ALLOWED_EXT_KEYS.map((e) => e.toUpperCase()).join(', ')})</span>
      </button>

      <AttachmentPreview
        key={preview?.id || preview?.name || 'preview'}
        open={!!preview}
        attachment={preview}
        onClose={() => setPreview(null)}
      />
    </div>
  );
}

/* ─── Inline metadata field ─── */
function MetaField({ label, value, onChange, placeholder, multiline }) {
  if (multiline) {
    return (
      <div>
        <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-0.5">{label}</label>
        <textarea
          rows={2}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full px-2.5 py-1.5 text-[11px] bg-white border border-slate-200 rounded-md outline-none focus:border-[#0B4A3D] focus:ring-1 focus:ring-[#0B4A3D]/10 transition-colors resize-none"
        />
      </div>
    );
  }
  return (
    <div>
      <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-0.5">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-2.5 py-1.5 text-[11px] bg-white border border-slate-200 rounded-md outline-none focus:border-[#0B4A3D] focus:ring-1 focus:ring-[#0B4A3D]/10 transition-colors"
      />
    </div>
  );
}
