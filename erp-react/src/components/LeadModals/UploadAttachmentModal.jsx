import { useRef, useState } from 'react';
import { Upload, X, Loader2, FileText } from 'lucide-react';
import { Modal } from '../Common';
import { MAX_ATTACHMENT_SIZE_LABEL, getAttachmentSelectionError } from '../../utils/attachmentStorage';

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}

export default function UploadAttachmentModal({ open, lead, onClose, onSubmit }) {
  const fileInputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleFile = (e) => {
    const selected = e.target.files?.[0] || null;
    const err = selected ? getAttachmentSelectionError(selected) : null;
    if (err) {
      setError(err.message);
      setFile(null);
    } else {
      setError('');
      setFile(selected);
    }
    e.target.value = '';
  };

  const handleSave = async () => {
    if (!file || submitting) return;
    setSubmitting(true);
    setError('');
    const ok = await onSubmit?.(file);
    if (!ok) setSubmitting(false);
    else setFile(null);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Upload Attachment"
      footer={
        <>
          <button
            onClick={onClose}
            className="text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 px-4 py-2 rounded-lg transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!file || submitting}
            className="flex items-center gap-1.5 text-xs font-bold text-white bg-[#0B4A3D] hover:bg-[#083D34] disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 rounded-lg transition-colors cursor-pointer"
          >
            {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            Upload
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-sky-50 flex items-center justify-center text-sky-600 font-bold text-sm">
            {lead?.name?.slice(0, 1).toUpperCase() || '?'}
          </div>
          <div>
            <div className="text-sm font-bold text-slate-900">{lead?.name || 'Lead'}</div>
            <div className="text-[11px] text-slate-400 font-medium">{lead?.company || ''}</div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="w-full border-2 border-dashed border-slate-200 rounded-lg py-6 flex flex-col items-center gap-2 text-slate-400 hover:border-emerald-500/50 hover:text-emerald-600 transition-colors cursor-pointer"
        >
          <Upload className="w-5 h-5" />
          <span className="text-xs font-semibold">
            Click to browse or <span className="text-emerald-600 underline underline-offset-2">choose a file</span>
          </span>
          <span className="text-[10px] text-slate-400">PDF, DOCX, XLSX, PNG, JPG up to {MAX_ATTACHMENT_SIZE_LABEL} per file</span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
          onChange={handleFile}
        />

        {error && <p className="text-[11px] font-semibold text-rose-500">{error}</p>}

        {file && (
          <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
            <FileText className="w-4 h-4 text-slate-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-slate-700 truncate">{file.name}</p>
              <p className="text-[10px] text-slate-400">{formatBytes(file.size)}</p>
            </div>
            <button
              type="button"
              onClick={() => setFile(null)}
              className="p-1 text-slate-400 hover:text-rose-500 transition-colors cursor-pointer"
              aria-label="Remove file"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
