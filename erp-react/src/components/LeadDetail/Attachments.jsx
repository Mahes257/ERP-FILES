import { useState, useMemo, useRef } from 'react';
import { Paperclip, Download, Upload, Loader2 } from 'lucide-react';
import leadService from '../../services/leadService';
import useAsyncData from '../../hooks/useAsyncData';
import DetailSection from './DetailSection';
import { useToast } from '../Common';
import { formatRelativeTime, formatDateTime } from '../../utils/leadHelpers';
import { getAttachmentSelectionError } from '../../utils/attachmentStorage';
import { downloadFile } from '../../utils/fileAccess';

function toList(response) {
  const list = Array.isArray(response) ? response : response?.data ?? response?.attachments ?? response?.content ?? [];
  return list.map((file) => ({
    id: file.id,
    name: file.name || file.fileName || file.originalName || 'Unnamed file',
    size: file.size || file.fileSize || 0,
    type: file.type || file.mimeType || 'application/octet-stream',
    url: file.url || file.downloadUrl || file.path || '',
    date: file.at || file.date || file.createdAt || file.uploadedAt
  }));
}

function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export default function Attachments({ leadId, fallbackData = [] }) {
  const toast = useToast();
  const fileInputRef = useRef(null);
  const { data, loading, error, isFallback, refresh } = useAsyncData(
    () => leadService.getAttachments(leadId),
    { fallbackData, deps: [leadId] }
  );
  const [uploading, setUploading] = useState(false);

  const items = useMemo(
    () => toList(data).sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()),
    [data]
  );

  const handleUpload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || uploading) return;
    const err = getAttachmentSelectionError(file);
    if (err) {
      toast.error(err.message);
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      await leadService.addAttachment(leadId, formData);
      toast.success('Attachment uploaded');
      refresh();
    } catch (err) {
      toast.error(err?.message || 'Failed to upload attachment');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1.5 text-xs font-bold text-white bg-[#0B4A3D] hover:bg-[#083D34] disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 rounded-lg transition-colors cursor-pointer"
        >
          {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
          Upload File
        </button>
        <input ref={fileInputRef} type="file" className="hidden" onChange={handleUpload} />
      </div>

      <DetailSection
        loading={loading}
        error={error}
        isFallback={isFallback}
        onRetry={refresh}
        count={items.length}
        emptyMessage="No attachments for this lead."
      >
        <ul className="space-y-2">
          {items.map((file) => (
            <li
              key={file.id}
              className="flex items-center gap-3 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2.5"
            >
              <div className="p-2 rounded-lg bg-purple-50 text-purple-600 shrink-0">
                <Paperclip className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-slate-800 truncate">{file.name}</p>
                <p className="text-[10px] text-slate-400 font-medium">
                  {file.size ? formatBytes(file.size) : ''}
                  {file.size && file.date ? ' · ' : ''}
                  {file.date ? formatRelativeTime(file.date) : ''}
                </p>
              </div>
              {file.url && (
                <button
                  type="button"
                  onClick={() => {
                    downloadFile(file.url, file.name).catch((err) =>
                      toast.error(err?.message || 'Failed to download file')
                    );
                  }}
                  className="p-2 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
                  title={formatDateTime(file.date)}
                >
                  <Download className="w-4 h-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      </DetailSection>
    </div>
  );
}
