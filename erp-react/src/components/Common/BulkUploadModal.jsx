import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle, Ban, Check, ChevronDown, FileSpreadsheet, FileText, Info,
  Loader2, Upload, X
} from 'lucide-react';
import Modal from './Modal';
import { useToast } from './ToastContext';
import { formatStorageBytes } from '../../utils/attachmentStorage';
import {
  BULK_LARGE_FILE_WARN_BYTES, buildRecords, checkExistingDuplicates,
  clearBulkQueue, dedupeWithin, detectDocumentModule, getBulkFileSizeError,
  getModule, MAX_BULK_FILE_SIZE_LABEL, saveBulkQueue
} from '../../utils/bulkUpload';

const ACCEPT = '.csv,.xlsx,.xls,.pdf,.doc,.docx,.jpg,.jpeg,.png';

const inputCls =
  'w-full bg-slate-50 border border-slate-200/80 rounded-lg px-3 py-2 text-xs text-slate-700 placeholder-slate-400 outline-none focus:border-emerald-600/50 focus:bg-surface transition-all shadow-inner';

/**
 * BulkUploadModal — the shared "Bulk Upload" flow behind every module's
 * New â–¼ menu.
 *
 * Upload → extract → detect module → map to the module's creation-form fields
 * → review/correct → "Apply to Create New & Review". The extracted records are
 * stored in a sessionStorage queue and the module's creation page pre-fills the
 * existing form from it. Saving happens ONLY through the existing Save button
 * on that form — this modal never saves anything itself.
 *
 * Files up to 2 GB each are supported. Large documents are read in bounded
 * streaming slices (never one giant in-memory read) with a live per-file
 * progress bar, percentage, status and a cancel button. Files larger than
 * 2 GB are rejected with the exact message "File size exceeds the maximum
 * allowed limit of 2 GB." — never silently.
 *
 * The inner BulkUploadFlow component is mounted only while the modal is open,
 * so every open starts from a clean state.
 */
export default function BulkUploadModal({ open, onClose, moduleKey, createRoute, dedupeService }) {
  if (!open) return null;
  return (
    <BulkUploadFlow
      onClose={onClose}
      moduleKey={moduleKey}
      createRoute={createRoute}
      dedupeService={dedupeService}
    />
  );
}

const FILE_TYPE_RE = /\.(csv|xlsx|xls|pdf|doc|docx|jpg|jpeg|png)$/i;

function BulkUploadFlow({ onClose, moduleKey, createRoute, dedupeService }) {
  const navigate = useNavigate();
  const toast = useToast();
  const inputRef = useRef(null);
  const mod = getModule(moduleKey);

  const [files, setFiles] = useState([]);
  const [fileStatus, setFileStatus] = useState({});
  const abortRef = useRef({});
  const [records, setRecords] = useState([]);
  const [skipped, setSkipped] = useState([]);
  const [detectedModule, setDetectedModule] = useState(null);
  const [parsing, setParsing] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFiles = async (list) => {
    const accepted = [];
    const rejected = [];
    for (const f of Array.from(list || [])) {
      if (!FILE_TYPE_RE.test(f.name)) {
        rejected.push({ file: f.name, reason: `Unsupported file type — choose CSV, Excel, PDF, DOC, DOCX, JPG, JPEG or PNG` });
        continue;
      }
      const sizeErr = getBulkFileSizeError(f);
      if (sizeErr) {
        // Exact required message — explicit rejection, never silent.
        rejected.push({ file: f.name, reason: sizeErr.message });
        toast.error(sizeErr.message);
        continue;
      }
      accepted.push(f);
    }
    setSkipped((prev) => [...prev, ...rejected]);
    if (accepted.length === 0) {
      if (rejected.length === 0) toast.warning('Please choose supported document files');
      return;
    }

    setFiles((prev) => [...prev, ...accepted]);
    setParsing(true);
    accepted.forEach((f) => {
      abortRef.current[f.name] = false;
      setFileStatus((prev) => ({
        ...prev,
        [f.name]: { phase: 'reading', percent: 0, status: `Reading… 0%` }
      }));
    });

    try {
    const { records: built, skipped: skippedList } = await buildRecords(moduleKey, accepted, {
      onProgress: (fileName, info) => {
        setFileStatus((prev) => {
          const cur = prev[fileName];
          // Never overwrite a terminal/cancelled state with stale progress.
          if (!cur || cur.phase === 'cancelled' || cur.phase === 'cancelling' || cur.phase === 'done' || cur.phase === 'error') return prev;
          const status =
            info.phase === 'parsing'
              ? 'Extracting data…'
              : `Reading… ${info.percent}%`;
          return { ...prev, [fileName]: { phase: info.phase, percent: info.percent, status } };
        });
      },
      shouldAbort: (fileName) => Boolean(abortRef.current[fileName])
    });

    // Per-file outcome: done / cancelled / explicit reason (never silent).
    const cancelledNames = new Set();
    accepted.forEach((f) => {
      const name = f.name;
      if (abortRef.current[name]) {
        cancelledNames.add(name);
        setFileStatus((prev) => ({
          ...prev,
          [name]: { phase: 'cancelled', percent: prev[name]?.percent ?? 0, status: 'Cancelled' }
        }));
        return;
      }
      const fromThisFile = built.filter((r) => r.fileName === name).length;
      if (fromThisFile > 0) {
        setFileStatus((prev) => ({
          ...prev,
          [name]: { phase: 'done', percent: 100, status: `Done — ${fromThisFile} record(s) extracted` }
        }));
        return;
      }
      const reason = skippedList.find((s) => s.file === name)?.reason;
      setFileStatus((prev) => ({
        ...prev,
        [name]: {
          phase: 'error',
          percent: 100,
          status: reason || 'No extractable data found'
        }
      }));
    });

    // Cancelled files contribute neither records nor errors.
    const usable = built.filter((r) => !cancelledNames.has(r.fileName));
    let out = dedupeWithin(moduleKey, usable);
    out = await checkExistingDuplicates(moduleKey, out, dedupeService);
    setRecords((prev) => [...prev, ...out]);
    setSkipped((prev) => [...prev, ...skippedList.filter((s) => !cancelledNames.has(s.file))]);

    // Module detection: flag documents that clearly belong to another module.
    const textSample = built
      .map((r) => r.text || Object.values(r.values).join(' '))
      .join(' ')
      .slice(0, 3000);
    const detected = detectDocumentModule(textSample);
    if (detected && detected !== moduleKey) setDetectedModule(detected);

    setParsing(false);
    } catch {
      // Never leave the modal stuck in "Reading…" — surface the failure and mark
      // every in-flight file as failed so no status row freezes mid-progress.
      setParsing(false);
      setFileStatus((prev) => {
        const next = { ...prev };
        accepted.forEach((f) => {
          const cur = next[f.name];
          if (cur && (cur.phase === 'reading' || cur.phase === 'parsing' || cur.phase === 'cancelling')) {
            next[f.name] = { phase: 'error', percent: cur.percent ?? 0, status: 'Could not read the file' };
          }
        });
        return next;
      });
      toast.error('Could not read the selected files. Please try again.');
    }
  };

  const cancelFile = (name) => {
    abortRef.current[name] = true;
    setFileStatus((prev) => ({
      ...prev,
      [name]: { phase: 'cancelling', percent: prev[name]?.percent ?? 0, status: 'Cancelling…' }
    }));
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer?.files);
  };

  const updateValue = (id, key, value) => {
    setRecords((prev) =>
      prev.map((r) => (r.id === id ? { ...r, values: { ...r.values, [key]: value } } : r))
    );
  };

  const toggleInclude = (id) => {
    setRecords((prev) =>
      prev.map((r) => (r.id === id ? { ...r, _included: !(r._included ?? true) } : r))
    );
  };

  const toggleExpand = (id) => setExpanded((prev) => (prev === id ? null : id));

  // Records extracted by the backend (Sales Contracts) carry an explicit
  // review list — exactly the targeted fields — instead of the full form field
  // map. This becomes the editable sticky-note panel (no over-extraction).
  const recordFields = (rec) =>
    Array.isArray(rec?._reviewFields) && rec._reviewFields.length > 0
      ? rec._reviewFields
      : mod?.fields || [];

  const totalMapped = records.reduce((sum, r) => sum + Object.keys(r.values).length, 0);
  const dupCount = records.filter((r) => r._dup || r._existing).length;
  const readyCount = records.filter((r) => !(r._included === false) && !r._dup && !r._existing).length;
  const activeCount = Object.values(fileStatus).filter((s) => s.phase === 'reading' || s.phase === 'parsing' || s.phase === 'cancelling').length;

  const applyToForm = () => {
    const included = records.filter((r) => !(r._included === false) && !r._dup && !r._existing);
    if (included.length === 0) {
      toast.warning('No records to apply — flagged duplicates are excluded automatically');
      return;
    }
    const saved = saveBulkQueue(moduleKey, included);
    if (!saved) {
      toast.error('Could not store the extracted data. Please try again.');
      return;
    }
    toast.success(`${included.length} record(s) ready — review & click Save on the form`);
    onClose();
    navigate(createRoute);
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Bulk Upload — ${mod?.title || 'Create'}`}
      maxWidth="max-w-3xl"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1.5 text-xs font-bold text-slate-600 bg-surface border border-slate-200 px-4 py-2 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5 text-slate-400" /> Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              onClose();
              if (moduleKey) clearBulkQueue(moduleKey);
              navigate(createRoute);
            }}
            className="flex items-center gap-1.5 text-xs font-bold text-slate-600 bg-surface border border-slate-200 px-4 py-2 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <FileText className="w-3.5 h-3.5 text-slate-400" /> Create New instead
          </button>
          <button
            type="button"
            onClick={applyToForm}
            disabled={readyCount === 0 || parsing}
            className="flex items-center gap-1.5 text-xs font-bold text-white bg-[#0B4A3D] hover:bg-[#083D34] px-4 py-2 rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Check className="w-3.5 h-3.5" />
            Apply to Create New &amp; Review
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Info line */}
        <div className="flex items-start gap-2 text-[11px] text-slate-500 bg-emerald-50/70 border border-emerald-100 rounded-lg px-3 py-2">
          <Info className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
          <span>
            Upload existing business documents up to <strong>{MAX_BULK_FILE_SIZE_LABEL}</strong> per file
            (CSV, Excel, PDF, DOC, DOCX, JPG, JPEG, PNG). Data is extracted and
            applied to the <strong>{mod?.title || 'creation'}</strong> form for your review —
            nothing is saved until you click the existing <strong>Save</strong> button.
          </span>
        </div>

        {/* Dropzone */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl py-8 flex flex-col items-center gap-2 text-slate-400 transition-colors cursor-pointer ${
            dragOver ? 'border-emerald-500 bg-emerald-50/50 text-emerald-600' : 'border-slate-200 hover:border-emerald-500/50 hover:text-emerald-600'
          }`}
        >
          <Upload className="w-6 h-6" />
          <span className="text-xs font-semibold">
            Drag &amp; drop documents here or <span className="text-emerald-600 underline underline-offset-2">browse</span>
          </span>
          <span className="text-[10px] text-slate-400">
            CSV, XLSX, XLS, PDF, DOC, DOCX, JPG, JPEG, PNG — up to {MAX_BULK_FILE_SIZE_LABEL} per file, multiple files supported (no aggregate batch limit)
          </span>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => {
              handleFiles(e.target.files);
              e.target.value = '';
            }}
          />
        </div>

        {/* Per-file streaming progress / status (large-file support) */}
        {files.length > 0 && (
          <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden">
            {files.map((f) => {
              const st = fileStatus[f.name];
              if (!st) return null;
              const reading = st.phase === 'reading' || st.phase === 'parsing' || st.phase === 'cancelling';
              const failed = st.phase === 'error';
              const cancelled = st.phase === 'cancelled';
              const largeWarning =
                f.size > BULK_LARGE_FILE_WARN_BYTES && /\.(csv|xlsx|xls|pdf)$/i.test(f.name)
                  ? 'Large file — extraction may be slow; split into smaller files if possible'
                  : null;
              const icon =
                /\.(csv|xlsx|xls)$/i.test(f.name) ? (
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : /\.(pdf|doc|docx)$/i.test(f.name) ? (
                  <FileText className="w-4 h-4 text-rose-400 shrink-0" />
                ) : (
                  <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                );
              return (
                <div key={f.name} className="flex items-center gap-2.5 px-3.5 py-2.5 bg-surface">
                  {icon}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-700 truncate">
                      {f.name}
                      <span className="ml-1.5 text-[10px] font-medium text-slate-400">
                        {formatStorageBytes(f.size)}
                      </span>
                    </p>
                    <div className="mt-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-200 ${
                          failed ? 'bg-rose-400' : cancelled ? 'bg-slate-300' : 'bg-emerald-600'
                        }`}
                        style={{ width: `${Math.max(0, Math.min(100, st.percent))}%` }}
                      />
                    </div>
                    <p
                      className={`text-[10px] mt-1 truncate ${
                        failed ? 'text-rose-600 font-semibold' : cancelled ? 'text-slate-400' : 'text-slate-500'
                      }`}
                    >
                      {st.status}
                    </p>
                    {largeWarning && (
                      <p className="text-[9px] text-amber-600 mt-0.5">{largeWarning}</p>
                    )}
                  </div>
                  {reading && (
                    <button
                      type="button"
                      onClick={() => cancelFile(f.name)}
                      className="flex items-center gap-1 text-[10px] font-bold text-rose-600 border border-rose-200 bg-rose-50 px-2 py-1 rounded-md hover:bg-rose-100 transition-colors cursor-pointer"
                    >
                      <Ban className="w-3 h-3" /> Cancel
                    </button>
                  )}
                  {failed && (
                    <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" aria-hidden="true" />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Parsing */}
        {parsing && (
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 py-2">
            <Loader2 className="w-4 h-4 animate-spin text-[#0B4A3D]" /> Reading documents…
          </div>
        )}

        {/* Warnings */}
        {detectedModule && (
          <div className="flex items-start gap-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
            <span>
              This document looks like it belongs to another module
              ({getModule(detectedModule)?.title || detectedModule}). Review the mapped fields
              before applying — you are currently creating a <strong>{mod?.title}</strong>.
            </span>
          </div>
        )}
        {skipped.length > 0 && (
          <div className="text-[11px] text-rose-600 bg-rose-50/70 border border-rose-100 rounded-lg px-3 py-2 space-y-1">
            {skipped.map((s) => (
              <div key={`${s.file}-${s.reason}`} className="flex items-start gap-1.5">
                <X className="w-3 h-3 shrink-0 mt-0.5" />
                <span><strong>{s.file}</strong> — {s.reason}</span>
              </div>
            ))}
          </div>
        )}

        {/* Summary */}
        {records.length > 0 && !parsing && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-semibold text-slate-500 px-1">
            <span><strong className="text-slate-800">{records.length}</strong> record(s) extracted</span>
            <span><strong className="text-slate-800">{totalMapped}</strong> field(s) mapped</span>
            {dupCount > 0 && (
              <span className="text-amber-600">
                <strong>{dupCount}</strong> possible duplicate(s) flagged
              </span>
            )}
            {activeCount > 0 && (
              <span className="text-[#0B4A3D]">{activeCount} file(s) processing…</span>
            )}
          </div>
        )}

        {/* Records review */}
        {records.length > 0 && !parsing && (
          <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100 max-h-80 overflow-y-auto">
            {records.map((rec, idx) => {
              const included = !(rec._included === false);
              const flagged = rec._dup || rec._existing;
              const isOpen = expanded === rec.id;
              const fields = recordFields(rec);
              return (
                <div key={rec.id} className={`bg-surface ${flagged ? 'opacity-90' : ''}`}>
                  <div className="flex items-center gap-2.5 px-3.5 py-2.5">
                    <input
                      type="checkbox"
                      checked={included && !flagged}
                      onChange={() => toggleInclude(rec.id)}
                      disabled={flagged}
                      title={flagged ? 'Possible duplicate — excluded automatically' : 'Include this record'}
                      className="accent-emerald-700 cursor-pointer disabled:opacity-40"
                    />
                    {/\.(csv|xlsx|xls)$/i.test(rec.fileName || '') ? (
                      <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
                    ) : (
                      <FileText className="w-4 h-4 text-rose-400 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-slate-700 truncate">{rec.fileName}</p>
                      <p className="text-[10px] text-slate-400 truncate">
                        {recordFields(rec)
                          .filter((f) => rec.values[f.key])
                          .slice(0, 3)
                          .map((f) => `${f.label}: ${rec.values[f.key]}`)
                          .join(' · ') || 'No mapped fields'}
                      </p>
                    </div>
                    {flagged && (
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide ${
                          rec._existing
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-rose-100 text-rose-600'
                        }`}
                      >
                        <AlertTriangle className="w-2.5 h-2.5" />
                        {rec._existing ? 'Exists' : 'Duplicate in file'}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => toggleExpand(rec.id)}
                      className="p-1 text-slate-400 hover:text-[#0B4A3D] transition-colors cursor-pointer"
                      aria-label={isOpen ? 'Collapse record' : 'Expand record'}
                    >
                      <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                    </button>
                  </div>
                  {isOpen && (
                    <div
                      className={`px-3.5 pb-3.5 pl-11 grid grid-cols-1 sm:grid-cols-2 gap-2.5 ${
                        rec._reviewFields ? 'bg-amber-50/50 border-t border-amber-100' : ''
                      }`}
                    >
                      {rec._reviewFields && (
                        <div className="sm:col-span-2 flex items-center gap-1.5 text-[10px] font-bold text-amber-700 uppercase tracking-wide mb-0.5">
                          <span aria-hidden="true">ðŸ“Œ</span> Extracted Contract Info — review &amp; correct, then click Save on the form
                        </div>
                      )}
                      {fields.map((f) => (
                        <label key={f.key} className="block">
                          <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-0.5">
                            {f.label}
                            {f.status === 'needsReview' && (
                              <span className="ml-1.5 inline-flex items-center px-1.5 py-px rounded-full text-[8px] font-bold bg-amber-100 text-amber-700 normal-case tracking-wide align-middle">
                                Needs review
                              </span>
                            )}
                            {f.status === 'notDetected' && (
                              <span className="ml-1.5 inline-flex items-center px-1.5 py-px rounded-full text-[8px] font-bold bg-slate-100 text-slate-400 normal-case tracking-wide align-middle">
                                Not detected
                              </span>
                            )}
                          </span>
                          <input
                            value={rec.values[f.key] ?? ''}
                            onChange={(e) => updateValue(rec.id, f.key, e.target.value)}
                            placeholder={f.status === 'notDetected' ? 'Not detected — type the value' : '—'}
                            className={inputCls}
                          />
                        </label>
                      ))}
                      {rec.items?.length > 0 && (
                        <div className="sm:col-span-2 text-[11px] text-slate-500 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
                          <strong>{rec.items.length}</strong> line item(s) detected — will be added to the form's item grid.
                        </div>
                      )}
                      <div className="sm:col-span-2 text-right text-[10px] text-slate-300">
                        Record #{idx + 1}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {records.length === 0 && !parsing && files.length > 0 && (
          <div className="text-center text-xs text-slate-400 py-3">
            No records could be extracted from these files.
          </div>
        )}
      </div>
    </Modal>
  );
}
