import { useEffect, useRef, useState } from 'react';
import { CloudUpload, Download, Eye, FileText, Loader2, Paperclip, RotateCcw, Trash2 } from 'lucide-react';
import { useToast } from '../Common';
import cprService from '../../services/cprService';
import { formatRelativeTime } from '../../utils/leadHelpers';
import { MAX_ATTACHMENT_SIZE_LABEL, getAttachmentSelectionError } from '../../utils/attachmentStorage';
import { downloadFile, openFileInNewTab } from '../../utils/fileAccess';

function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function progressPct(entry) {
  if (!entry.total) return entry.status === 'done' ? 100 : 0;
  return Math.min(100, Math.round((entry.loaded / entry.total) * 100));
}

export default function CprAttachments({ cprId, attachments = [], onChanged }) {
  const toast = useToast();
  const fileInputRef = useRef(null);
  const replaceInputRef = useRef(null);
  const replaceTargetRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const [queue, setQueue] = useState([]);
  const [deletingId, setDeletingId] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [fetched, setFetched] = useState([]);

  // Load the persisted attachment list from the backend endpoint (MySQL-backed)
  // so the list stays in sync after refresh / restart.
  const reload = async () => {
    try {
      const res = await cprService.getAttachments(cprId);
      if (Array.isArray(res)) setFetched(res);
    } catch {
      // keep current list
    }
    onChanged?.();
  };

  useEffect(() => {
    let cancelled = false;
    cprService
      .getAttachments(cprId)
      .then((res) => {
        if (!cancelled && Array.isArray(res)) setFetched(res);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [cprId]);

  // Prefer the endpoint list; fall back to the payload embedded in the CPR detail.
  const items = fetched.length > 0 ? fetched : Array.isArray(attachments) ? attachments : [];

  const updateEntry = (file, patch) => {
    setQueue((prev) => prev.map((entry) => (entry.file === file ? { ...entry, ...patch } : entry)));
  };

  const handleFiles = (fileList) => {
    const all = Array.from(fileList || []);
    const files = all.filter((file) => {
      const err = getAttachmentSelectionError(file);
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

    cprService
      .uploadMany(cprId, files, {
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
        if (ok > 0) reload();
      })
      .finally(() => {
        setUploading(false);
        setTimeout(() => setQueue((prev) => prev.filter((entry) => entry.status === 'uploading' || entry.status === 'error')), 1200);
      });
  };

  const retryFile = async (file) => {
    updateEntry(file, { status: 'uploading', error: null, loaded: 0, total: 0 });
    const [res] = await cprService.uploadMany(cprId, [file], {
      onProgress: (f, loaded, total) => updateEntry(f, { loaded, total })
    });
    if (res.ok) {
      updateEntry(file, { status: 'done' });
      toast.success(`${file.name} uploaded`);
      reload();
      setTimeout(() => setQueue((prev) => prev.filter((entry) => entry.file !== file)), 1200);
    } else {
      updateEntry(file, { status: 'error', error: res.error?.message || 'Upload failed' });
      toast.error(`Failed to upload ${file.name}`);
    }
  };

  const handleDelete = async (attachment) => {
    setDeletingId(attachment.id);
    try {
      await cprService.deleteAttachment(cprId, attachment.id);
      toast.success('Attachment deleted');
      reload();
    } catch (err) {
      toast.error(err?.message || 'Failed to delete attachment');
    } finally {
      setDeletingId(null);
    }
  };

  // Replace = upload the new file, then remove the old attachment (delete + add
  // via the backend attachment endpoints, so metadata stays in MySQL).
  const startReplace = (attachment) => {
    replaceTargetRef.current = attachment;
    replaceInputRef.current?.click();
  };

  const handleReplace = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    const target = replaceTargetRef.current;
    if (!file || !target) return;
    const err = getAttachmentSelectionError(file);
    if (err) {
      toast.error(err.message);
      replaceTargetRef.current = null;
      return;
    }
    setUploading(true);
    try {
      const [res] = await cprService.uploadMany(cprId, [file], {});
      if (!res?.ok) {
        toast.error(res?.error?.message || 'Upload failed');
        return;
      }
      await cprService.deleteAttachment(cprId, target.id);
      toast.success(`${target.name || 'File'} replaced with ${file.name}`);
      await reload();
    } catch (err) {
      toast.error(err?.message || 'Replace failed');
    } finally {
      setUploading(false);
      replaceTargetRef.current = null;
    }
  };

  const pendingQueue = queue.filter((entry) => entry.status === 'uploading' || entry.status === 'error');

  return (
    <div className="space-y-4">
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
      </div>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = '';
        }}
      />
      <input
        ref={replaceInputRef}
        type="file"
        accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
        className="hidden"
        onChange={handleReplace}
      />

      {pendingQueue.length > 0 && (
        <div className="space-y-2">
          {pendingQueue.map((entry) => (
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
                  onClick={() => retryFile(entry.file)}
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
      )}

      {uploading && pendingQueue.length === 0 && (
        <div className="flex items-center justify-center py-4 text-xs text-slate-400">
          <Loader2 className="w-4 h-4 animate-spin mr-2" /> Uploading...
        </div>
      )}

      {items.length === 0 && pendingQueue.length === 0 ? (
        <div className="text-center py-8">
          <Paperclip className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-xs text-slate-400">No documents uploaded yet. Drop files above to attach them to this CPR.</p>
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
                  {doc.size ? formatBytes(doc.size) : ''}
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
                  title="Replace"
                  aria-label={`Replace ${doc.name || 'file'}`}
                  disabled={uploading}
                  onClick={() => startReplace(doc)}
                  className="p-1.5 rounded-md text-slate-400 hover:text-[#0B4A3D] hover:bg-slate-100 cursor-pointer disabled:opacity-50"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
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
