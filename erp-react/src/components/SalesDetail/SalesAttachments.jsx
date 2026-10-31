import { useEffect, useRef, useState } from 'react';
import { CloudUpload, Download, Eye, FileText, Loader2, Paperclip, RotateCcw, Trash2 } from 'lucide-react';
import { useToast } from '../Common';
import { formatDate, formatRelativeTime } from '../../utils/leadHelpers';
import {
  ATTACHMENT_ACCEPT,
  fetchAttachmentStorage,
  fileTypeLabel,
  formatFileSize,
  formatStorageBytes,
  getAttachmentSizeError,
  getAttachmentTypeError,
  MAX_ATTACHMENT_SIZE_LABEL
} from '../../utils/attachmentStorage';
import { downloadFile, openFileInNewTab } from '../../utils/fileAccess';
import AttachmentsTable from '../SalesForm/AttachmentsTable';

function progressPct(entry) {
  if (!entry.total) return entry.status === 'done' ? 100 : 0;
  return Math.min(100, Math.round((entry.loaded / entry.total) * 100));
}

/** In-flight / failed uploads, shared by the card and table layouts. */
function UploadQueue({ entries = [], onRetry }) {
  if (entries.length === 0) return null;
  return (
    <div className="space-y-2">
      {entries.map((entry) => (
        <div key={entry.file.name} className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5">
          <FileText className="w-4 h-4 text-slate-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-700 truncate">{entry.file.name}</span>
              {entry.status === 'error' ? (
                <span className="text-[10px] font-bold text-rose-600 shrink-0">Failed</span>
              ) : (
                <span className="text-[10px] font-bold text-slate-400 shrink-0">{progressPct(entry)}%</span>
              )}
            </div>
            <div className="h-1.5 bg-slate-200 rounded-full mt-1.5 overflow-hidden">
              <div
                className={`h-full transition-all ${entry.status === 'error' ? 'bg-rose-500' : 'bg-[#0B4A3D]'}`}
                style={{ width: `${progressPct(entry)}%` }}
              />
            </div>
            {entry.status === 'error' && entry.error && (
              <div className="text-[10px] text-rose-500 mt-1 truncate">{entry.error}</div>
            )}
          </div>
          {entry.status === 'error' && (
            <button
              type="button"
              onClick={() => onRetry(entry.file)}
              className="p-1.5 rounded-md text-slate-400 hover:text-[#0B4A3D] hover:bg-slate-100 cursor-pointer"
              title="Retry upload"
              aria-label={`Retry ${entry.file.name}`}
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * Attachments panel bound to a module service (the sales services expose
 * getAttachments/uploadMany/deleteAttachment on their own resource).
 *
 * Renders as cards (default) or as the compact green-header table used by the
 * CPO page (`variant="table"`).
 *
 * `categories` (optional) lists the document kinds this module files its
 * attachments under — the Sales Contract page passes ['E-Sign', 'Scanned Copy'].
 * A picker then labels the files added next, the category is sent with the
 * upload (and stored on the attachment row), and the list shows it in its own
 * column. Modules that pass no categories are completely unchanged.
 */
export default function SalesAttachments({ service, docId, attachments = [], onChanged, variant = 'cards', categories = null }) {
  const toast = useToast();
  const [category, setCategory] = useState('');
  const fileInputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const [queue, setQueue] = useState([]);
  const [deletingId, setDeletingId] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [storage, setStorage] = useState(null);

  useEffect(() => {
    fetchAttachmentStorage().then(setStorage);
  }, []);

  const items = Array.isArray(attachments) ? attachments : [];

  const updateEntry = (file, patch) => {
    setQueue((prev) => prev.map((entry) => (entry.file === file ? { ...entry, ...patch } : entry)));
  };

  const handleFiles = (fileList) => {
    const all = Array.from(fileList || []);
    const files = all.filter((file) => {
      // Type + size are checked before anything is sent: the server rejects both
      // too, but a clear, early message is what the user can act on. Rejected
      // files are skipped individually, so one bad pick never loses the good ones.
      const typeError = getAttachmentTypeError(file);
      if (typeError) {
        toast.warning(typeError.message);
        return false;
      }
      const err = getAttachmentSizeError(file);
      if (err) {
        toast.warning(err.message);
        return false;
      }
      return true;
    });
    if (files.length === 0) return;
    setUploading(true);
    setQueue((prev) => [
      ...prev,
      ...files.map((file) => ({ file, status: 'uploading', loaded: 0, total: 0, error: null }))
    ]);

    service
      .uploadMany(docId, files, {
        category,
        onFileStart: (file) => updateEntry(file, { status: 'uploading', error: null }),
        onProgress: (file, loaded, total) => updateEntry(file, { loaded, total })
      })
      .then((results) => {
        results.forEach((res) => {
          if (res.ok) {
            updateEntry(res.file, { status: 'done' });
          } else {
            updateEntry(res.file, { status: 'error', error: res.error?.message || 'Upload failed' });
          }
        });
        const failed = results.filter((r) => !r.ok).length;
        const ok = results.length - failed;
        if (ok > 0) toast.success(`${ok} file(s) uploaded`);
        if (failed > 0) toast.error(`${failed} file(s) failed to upload`);
        if (ok > 0) onChanged?.();
      })
      .finally(() => {
        setUploading(false);
        setTimeout(() => setQueue((prev) => prev.filter((entry) => entry.status === 'uploading' || entry.status === 'error')), 1200);
      });
  };

  const retryFile = async (file) => {
    updateEntry(file, { status: 'uploading', error: null, loaded: 0, total: 0 });
    const [res] = await service.uploadMany(docId, [file], {
      category,
      onProgress: (f, loaded, total) => updateEntry(f, { loaded, total })
    });
    if (res.ok) {
      updateEntry(file, { status: 'done' });
      toast.success(`${file.name} uploaded`);
      onChanged?.();
      setTimeout(() => setQueue((prev) => prev.filter((entry) => entry.file !== file)), 1200);
    } else {
      updateEntry(file, { status: 'error', error: res.error?.message || 'Upload failed' });
      toast.error(`Failed to upload ${file.name}`);
    }
  };

  const handleDelete = async (attachment) => {
    setDeletingId(attachment.id);
    try {
      await service.deleteAttachment(docId, attachment.id);
      toast.success('Attachment deleted');
      onChanged?.();
    } catch (err) {
      toast.error(err?.message || 'Failed to delete attachment');
    } finally {
      setDeletingId(null);
    }
  };

  const pendingQueue = queue.filter((entry) => entry.status === 'uploading' || entry.status === 'error');

  /*
   * The document kind the files added next are filed under. It sits OUTSIDE the
   * drop zones: each drop zone is a click target that opens the file picker, so a
   * control inside it would open the picker instead of the dropdown.
   */
  const categoryPicker = categories ? (
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor={`attachment-category-${docId}`} className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
        Document Type
      </label>
      <select
        id={`attachment-category-${docId}`}
        value={category}
        onChange={(event) => setCategory(event.target.value)}
        className="h-8 rounded-lg border border-slate-200 bg-slate-50 px-2 text-xs font-semibold text-slate-700 outline-none focus:border-emerald-600/50 focus:bg-surface"
      >
        <option value="">— Not specified —</option>
        {categories.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <span className="text-[10px] text-slate-400">Applied to the files you add next</span>
    </div>
  ) : null;

  // One row per persisted attachment; every value comes from the stored record.
  const tableRows = items.map((doc) => ({
    key: doc.id,
    name: doc.name || doc.fileName || 'File',
    type: fileTypeLabel(doc.name || doc.fileName, doc.contentType),
    category: doc.attachmentCategory || '',
    size: doc.size ? formatFileSize(doc.size) : '',
    uploadedBy: doc.uploadedBy || '',
    date: doc.uploadedAt ? formatDate(doc.uploadedAt) : '',
    onView: doc.url
      ? () => {
          openFileInNewTab(doc.url).catch((err) => toast.error(err?.message || 'Failed to open file'));
        }
      : null,
    onDownload: doc.url
      ? () => {
          downloadFile(doc.url, doc.name || 'file').catch((err) =>
            toast.error(err?.message || 'Failed to download file')
          );
        }
      : null,
    onDelete: () => handleDelete(doc),
    deleting: deletingId === doc.id
  }));

  if (variant === 'table') {
    return (
      <div className="space-y-3">
        {categoryPicker}
        <div
          role="button"
          tabIndex={0}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click();
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            handleFiles(e.dataTransfer?.files);
          }}
          className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-dashed px-3 py-2.5 cursor-pointer transition-colors ${
            dragOver ? 'border-[#0B4A3D] bg-[#E8F0EE]/60' : 'border-slate-300 hover:border-[#0B4A3D] hover:bg-[#E8F0EE]/30'
          }`}
        >
          <span className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-bold text-white bg-[#0B4A3D]">
            <CloudUpload className="w-3.5 h-3.5" /> Add Attachment
          </span>
          <span className="text-[11px] text-slate-400">
            Drop files here or click to upload — PDF, DOC, DOCX, XLS, XLSX, JPG, PNG (Max {MAX_ATTACHMENT_SIZE_LABEL} each)
          </span>
          {storage ? (
            <span className="ml-auto flex items-center gap-2 text-[10px] text-slate-400">
              <span>
                Storage: <span className="font-semibold text-slate-500">{formatStorageBytes(storage.totalBytes)}</span> / 4 GB
              </span>
              <span className="inline-block w-16 h-1 bg-slate-200 rounded-full overflow-hidden align-middle">
                <span
                  className={`block h-full ${(storage.totalBytes / storage.limitBytes) * 100 >= 90 ? 'bg-rose-500' : 'bg-[#0B4A3D]'}`}
                  style={{ width: `${Math.min(100, (storage.totalBytes / storage.limitBytes) * 100)}%` }}
                />
              </span>
            </span>
          ) : null}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ATTACHMENT_ACCEPT}
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <UploadQueue entries={pendingQueue} onRetry={retryFile} />
        {uploading && pendingQueue.length === 0 && (
          <div className="flex items-center justify-center py-2 text-xs text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin mr-2" /> Uploading...
          </div>
        )}
        <AttachmentsTable
          rows={tableRows}
          emptyText="No attachments added yet."
          categoryLabel={categories ? 'Document Type' : null}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {categoryPicker}
      <div
        role="button"
        tabIndex={0}
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleFiles(e.dataTransfer?.files);
        }}
        className={`border-2 border-dashed rounded-xl py-8 px-4 text-center cursor-pointer transition-all ${
          dragOver ? 'border-[#0B4A3D] bg-[#E8F0EE]/60' : 'border-slate-300 hover:border-[#0B4A3D] hover:bg-[#E8F0EE]/40'
        }`}
      >
        <CloudUpload className="w-7 h-7 text-[#0B4A3D] mx-auto mb-2" />
        <p className="text-xs font-semibold text-slate-700">
          Drag &amp; drop files here or <span className="text-[#0B4A3D] font-bold">browse</span>
        </p>
        <p className="text-[11px] text-slate-400 mt-1">Multiple files · PDF, DOCX, XLSX, PNG, JPG up to {MAX_ATTACHMENT_SIZE_LABEL} per file</p>
        {storage && (
          <div className="flex items-center justify-center gap-2 mt-2 text-[10px] text-slate-400">
            <span>
              Storage: <span className="font-semibold text-slate-500">{formatStorageBytes(storage.totalBytes)}</span> / 4 GB
            </span>
            <span className="inline-block w-16 h-1 bg-slate-200 rounded-full overflow-hidden align-middle">
              <span
                className={`block h-full ${(storage.totalBytes / storage.limitBytes) * 100 >= 90 ? 'bg-rose-500' : 'bg-[#0B4A3D]'}`}
                style={{ width: `${Math.min(100, (storage.totalBytes / storage.limitBytes) * 100)}%` }}
              />
            </span>
          </div>
        )}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={ATTACHMENT_ACCEPT}
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = '';
        }}
      />

      <UploadQueue entries={pendingQueue} onRetry={retryFile} />

      {uploading && pendingQueue.length === 0 && (
        <div className="flex items-center justify-center py-4 text-xs text-slate-400">
          <Loader2 className="w-4 h-4 animate-spin mr-2" /> Uploading...
        </div>
      )}

      {items.length === 0 && pendingQueue.length === 0 ? (
        <div className="text-center py-8">
          <Paperclip className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-xs text-slate-400">No documents uploaded yet. Drop files above to attach them to this document.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {items.map((doc) => (
            <div key={doc.id} className="flex items-center gap-2.5 p-2.5 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
              <div className="p-2 rounded-lg bg-purple-50 text-purple-600 shrink-0">
                <Paperclip className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-slate-700 truncate">{doc.name || doc.fileName || 'File'}</p>
                <p className="text-[10px] text-slate-400">
                  {categories && doc.attachmentCategory ? `${doc.attachmentCategory} · ` : ''}
                  {doc.size ? formatFileSize(doc.size) : ''}
                  {doc.size && doc.uploadedAt ? ' · ' : ''}
                  {doc.uploadedAt ? formatRelativeTime(doc.uploadedAt) : ''}
                </p>
              </div>
              <div className="flex items-center gap-0.5 shrink-0">
                {doc.url && (
                  <button
                    type="button"
                    title="Preview"
                    onClick={() => {
                      openFileInNewTab(doc.url).catch((err) =>
                        toast.error(err?.message || 'Failed to open file')
                      );
                    }}
                    className="p-1.5 rounded-md text-slate-400 hover:text-[#0B4A3D] hover:bg-slate-100 cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </button>
                )}
                {doc.url && (
                  <button
                    type="button"
                    title="Download"
                    onClick={() => {
                      downloadFile(doc.url, doc.name || 'file').catch((err) =>
                        toast.error(err?.message || 'Failed to download file')
                      );
                    }}
                    className="p-1.5 rounded-md text-slate-400 hover:text-[#0B4A3D] hover:bg-slate-100 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  title="Delete"
                  disabled={deletingId === doc.id}
                  onClick={() => handleDelete(doc)}
                  className="p-1.5 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer disabled:opacity-50"
                >
                  {deletingId === doc.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
