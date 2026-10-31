/**
 * purchase/components/AttachmentList.jsx
 * ------------------------------------------------------------------
 * Read-only attachment list — the quick-access surface used on the
 * requisition Overview and vendor detail. Renders the existing
 * attachment records ({ id, name, size, type, dataUrl }) with
 * type-aware file icons, size / upload date / uploader meta, and
 * per-row Preview + Download.
 *
 * Previewing delegates to the shared AttachmentPreview enterprise
 * viewer (PDF / image / text / video / audio + professional
 * unsupported-file panel) — single source of truth across the module.
 *
 * Pure frontend — reads the existing attachment data, no APIs.
 * ------------------------------------------------------------------
 */
import { useState } from 'react';
import { Download, Eye, Paperclip } from 'lucide-react';
import AttachmentPreview from './AttachmentPreview';
import {
  TYPE_TONES,
  detectType,
  downloadAttachment,
  fileTypeLabel,
  formatSize,
  hasContent,
  normalizeAttachment
} from '../utils/attachmentFile';
import { formatDate } from '../utils/helpers';

export default function AttachmentList({
  attachments = [],
  limit,
  onViewAll,
  fallbackDate,
  emptyText = 'No attachments available.'
}) {
  const [preview, setPreview] = useState(null);
  const [downloadNotice, setDownloadNotice] = useState('');

  const list = attachments.map(normalizeAttachment).filter(Boolean);
  const overflow = limit != null && list.length > limit;
  const shown = overflow ? list.slice(0, limit) : list;

  const clearNotice = () => setDownloadNotice('');

  /* Row download — async so a missing file surfaces a visible message. */
  const handleDownload = async (att, event) => {
    event?.stopPropagation();
    const ok = await downloadAttachment(att);
    setDownloadNotice(
      ok
        ? ''
        : `${att.name || 'This file'} could not be downloaded — the file content may be missing.`
    );
    if (!ok) setTimeout(clearNotice, 5000);
  };

  const rowMeta = (att, kind) => {
    const parts = [];
    parts.push(fileTypeLabel(att.name, kind));
    if (att.size != null) parts.push(formatSize(att.size));
    const uploadedAt = att.uploadedAt || att.createdAt || fallbackDate;
    if (uploadedAt) parts.push(formatDate(uploadedAt));
    if (att.uploadedBy) parts.push(`by ${att.uploadedBy}`);
    return parts.join(' · ');
  };

  return (
    <div>
      {downloadNotice && (
        <p className="mb-2 text-[11px] font-semibold text-rose-500 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2" role="alert">
          {downloadNotice}
        </p>
      )}

      {list.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-400">
          <span aria-hidden="true">📎</span>
          {emptyText}
        </div>
      ) : (
        <>
          <ul className="divide-y divide-slate-100">
            {shown.map((att, index) => {
              const kind = detectType(att.name, att.type);
              const meta = TYPE_TONES[kind] || TYPE_TONES.other;
              const Icon = meta.Icon;
              const hasData = hasContent(att);
              return (
                <li key={att.id || `${att.name}-${index}`} className="flex items-center gap-3 py-2.5">
                  <span
                    className="p-2 rounded-lg shrink-0"
                    style={{ background: meta.bg, color: meta.color }}
                    aria-hidden="true"
                  >
                    <Icon className="w-4 h-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-slate-800" title={att.name}>
                      {att.name}
                    </p>
                    <p className="truncate text-[11px] text-slate-400">{rowMeta(att, kind)}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        clearNotice();
                        setPreview(att);
                      }}
                      disabled={!hasData}
                      className="p-1.5 rounded-md text-slate-400 hover:text-[#0B4A3D] hover:bg-[#EDF7F4] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                      aria-label={`Preview ${att.name}`}
                      title={hasData ? 'Preview' : 'No file content available'}
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={(event) => handleDownload(att, event)}
                      disabled={!hasData}
                      className="p-1.5 rounded-md text-slate-400 hover:text-[#0B4A3D] hover:bg-[#EDF7F4] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                      aria-label={`Download ${att.name}`}
                      title={hasData ? 'Download' : 'No file content available'}
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>

          {overflow && (
            <button
              type="button"
              onClick={onViewAll}
              className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-[#0B4A3D] hover:text-[#083D34] hover:underline underline-offset-2 transition-colors cursor-pointer"
            >
              <Paperclip className="w-3.5 h-3.5" />
              View all attachments ({list.length})
            </button>
          )}
        </>
      )}

      <AttachmentPreview
        key={preview?.id || preview?.name || 'preview'}
        open={!!preview}
        attachment={preview}
        onClose={() => setPreview(null)}
      />
    </div>
  );
}
