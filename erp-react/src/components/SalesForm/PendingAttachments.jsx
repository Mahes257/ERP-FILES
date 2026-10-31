import { useEffect, useRef, useState } from 'react';
import { CloudUpload, FileText, X } from 'lucide-react';
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
import { useCurrentUser, useToast } from '../Common';
import AttachmentsTable from './AttachmentsTable';

/**
 * Create-mode attachments: lets the user stage files before the document exists.
 * Files are uploaded automatically after the document is created (see the parent
 * save flow), so no file is ever stored without a parent document.
 *
 * The panel renders either as the large drop cards (default) or as the compact
 * green-header table used by the CPO create page (`variant="table"`).
 *
 * `categories` (optional) lists the kinds of document the module files its
 * attachments under — the Sales Contract page passes ['E-Sign', 'Scanned Copy'].
 * Each staged file then gets its own picker, and the choice rides on the File
 * object itself (`file.attachmentCategory`), which is what the parent's save
 * flow hands to the upload service after the document has been created. A
 * module that passes no categories keeps the plain, unlabelled behaviour.
 */
export default function PendingAttachments({ files = [], onChange, variant = 'cards', categories = null }) {
  const toast = useToast();
  const { currentUser } = useCurrentUser();
  const fileInputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const [storage, setStorage] = useState(null);

  useEffect(() => {
    fetchAttachmentStorage().then(setStorage);
  }, []);

  const handleFiles = (fileList) => {
    const next = Array.from(fileList || []).filter((file) => {
      // The same policy the server enforces (allowed extensions, empty files
      // and the per-file limit) is applied at selection time, so an
      // unsupported file is reported before it is staged. Files are skipped
      // individually: one bad pick never drops the good ones, and everything
      // already staged stays put.
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
      return !files.some((f) => f.name === file.name && f.size === file.size);
    });
    if (next.length === 0) return;
    onChange([...files, ...next]);
  };

  const removeFile = (index) => {
    onChange(files.filter((_, i) => i !== index));
  };

  // The chosen category belongs to the FILE, not to the panel: the same File
  // object is what the save flow uploads once the document exists, so carrying
  // it on the object keeps the upload path unchanged. A File that cannot take a
  // property simply uploads unlabelled rather than failing.
  const setFileCategory = (index, category) => {
    onChange(
      files.map((file, i) => {
        if (i !== index) return file;
        try {
          file.attachmentCategory = category || '';
        } catch {
          /* frozen File object — leave it unlabelled */
        }
        return file;
      })
    );
  };

  // Rows are built from the real staged File objects; nothing is persisted yet,
  // so the date column states that instead of showing an upload timestamp.
  const tableRows = files.map((file, index) => ({
    key: `${file.name}-${file.size}-${index}`,
    name: file.name,
    type: fileTypeLabel(file.name, file.type),
    category: file.attachmentCategory || '',
    fileIndex: index,
    size: formatFileSize(file.size),
    uploadedBy: currentUser?.fullName || '',
    date: 'Pending upload',
    onDelete: () => removeFile(index)
  }));

  if (variant === 'table') {
    return (
      <div className="space-y-3">
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
            Drop files here or click to upload — PDF, DOCX, XLSX, PNG, JPG up to {MAX_ATTACHMENT_SIZE_LABEL} each
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
        <AttachmentsTable
          rows={tableRows}
          emptyText="No attachments added yet."
          categoryLabel={categories ? 'Document Type' : null}
          categoryOptions={categories}
          onCategoryChange={(row, value) => setFileCategory(row.fileIndex, value)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
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
        className={`border-2 border-dashed rounded-xl py-6 px-4 text-center cursor-pointer transition-all ${
          dragOver ? 'border-[#0B4A3D] bg-[#E8F0EE]/60' : 'border-slate-300 hover:border-[#0B4A3D] hover:bg-[#E8F0EE]/40'
        }`}
      >
        <CloudUpload className="w-6 h-6 text-[#0B4A3D] mx-auto mb-2" />
        <p className="text-xs font-semibold text-slate-700">
          Drag &amp; drop files here or <span className="text-[#0B4A3D] font-bold">browse</span>
        </p>
        <p className="text-[11px] text-slate-400 mt-1">Uploaded after this document is saved. PDF, DOCX, XLSX, PNG, JPG up to {MAX_ATTACHMENT_SIZE_LABEL} per file</p>
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

      {files.length > 0 && (
        <div className="space-y-1.5">
          {files.map((file, index) => (
            <div key={`${file.name}-${file.size}`} className="flex items-center gap-2.5 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
              <FileText className="w-4 h-4 text-slate-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-slate-700 truncate">{file.name}</p>
                <p className="text-[10px] text-slate-400">{formatFileSize(file.size)}</p>
              </div>
              {categories && (
                <select
                  value={file.attachmentCategory || ''}
                  onChange={(event) => setFileCategory(index, event.target.value)}
                  aria-label={`Document type for ${file.name}`}
                  className="h-7 shrink-0 rounded-md border border-slate-200 bg-slate-50 px-1.5 text-[11px] font-semibold text-slate-700 outline-none focus:border-emerald-600/50 focus:bg-surface"
                >
                  <option value="">— Not specified —</option>
                  {categories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              )}
              <button
                type="button"
                title="Remove"
                onClick={() => removeFile(index)}
                className="p-1.5 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
