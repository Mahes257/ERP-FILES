import { useEffect, useRef, useState } from 'react';
import '../crm/crm-erp.css';
import { useNavigate } from 'react-router-dom';
import { openInNewTab } from '../../utils/navigationHelpers';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  FileSearch,
  FileSpreadsheet,
  FileText,
  Info,
  Loader2,
  Save,
  StickyNote,
  Upload,
  X
} from 'lucide-react';
import { useToast } from '../../components/Common';
import { formatStorageBytes } from '../../utils/attachmentStorage';
import {
  buildRecords,
  checkExistingDuplicates,
  clearBulkQueue,
  dedupeWithin,
  getBulkFileSizeError,
  MAX_BULK_FILE_SIZE_LABEL
} from '../../utils/bulkUpload';
import salesContractService from '../../services/salesContractService';
import customerService from '../../services/customerService';
import './sales-contract-module.css';

const ACCEPT = '.csv,.xlsx,.xls,.pdf,.doc,.docx,.jpg,.jpeg,.png';
const FILE_TYPE_RE = /\.(csv|xlsx|xls|pdf|doc|docx|jpg|jpeg|png)$/i;

export default function SalesContractBulkUploadPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const inputRef = useRef(null);
  const abortRef = useRef({});

  const [files, setFiles] = useState([]);
  const [fileStatus, setFileStatus] = useState({});
  const [records, setRecords] = useState([]);
  const [skipped, setSkipped] = useState([]);
  const [parsing, setParsing] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [activeId, setActiveId] = useState(null);
  const [importing, setImporting] = useState(false);

  const existingScNosRef = useRef(new Set());
  const customersRef = useRef([]);

  useEffect(() => {
    clearBulkQueue('salesContract');
    let cancelled = false;
    customerService
      .list()
      .then((res) => {
        if (!cancelled) customersRef.current = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

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
        rejected.push({ file: f.name, reason: sizeErr.message });
        toast.error(sizeErr.message);
        continue;
      }
      accepted.push(f);
    }
    setSkipped((prev) => [...prev, ...rejected]);
    if (accepted.length === 0) {
      if (rejected.length === 0) toast.warning('Please choose supported contract documents');
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
      const { records: built, skipped: skippedList } = await buildRecords('salesContract', accepted, {
        onProgress: (fileName, info) => {
          setFileStatus((prev) => {
            const cur = prev[fileName];
            if (!cur || cur.phase === 'cancelled' || cur.phase === 'cancelling' || cur.phase === 'done' || cur.phase === 'error') return prev;
            const status = info.phase === 'parsing' ? 'Extracting data…' : `Reading… ${info.percent}%`;
            return { ...prev, [fileName]: { phase: info.phase, percent: info.percent, status } };
          });
        },
        shouldAbort: (fileName) => Boolean(abortRef.current[fileName])
      });

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
          [name]: { phase: 'error', percent: 100, status: reason || 'No extractable data found' }
        }));
      });

      const usable = built.filter((r) => !cancelledNames.has(r.fileName));
      let out = dedupeWithin('salesContract', usable);
      out = await checkExistingDuplicates('salesContract', out, salesContractService);
      out.forEach((r) => {
        const sig = norm(r.values?.scNo);
        if (sig) existingScNosRef.current.add(sig);
      });
      setRecords((prev) => [...prev, ...out]);
      setActiveId((cur) => cur || out[0]?.id || null);
      setSkipped((prev) => [...prev, ...skippedList.filter((s) => !cancelledNames.has(s.file))]);
      setParsing(false);
    } catch {
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
    setRecords((prev) => prev.map((r) => (r.id === id ? { ...r, values: { ...r.values, [key]: value } } : r)));
  };

  const activeRecord = records.find((r) => r.id === activeId) || records[0] || null;

  const statusOf = (rec, key) => rec?._reviewFields?.find((f) => f.key === key)?.status || 'extracted';

  const isFlagged = (rec) => Boolean(rec?._dup || rec?._existing);

  const missingOf = (rec) => EXTRACT_FIELDS.filter((f) => !String(rec?.values?.[f.key] || '').trim()).map((f) => f.label);

  const resolveCustomerId = (name) => {
    const target = norm(name);
    if (!target) return null;
    const hit = customersRef.current.find((c) => norm(c.businessName) === target);
    return hit?.id ?? null;
  };

  const save = async (record) => {
    if (!record || importing) return;
    if (record._dup) {
      toast.error(`"${record.fileName}" is a duplicate of another uploaded document — import the first occurrence only.`);
      return;
    }
    const values = record.values || {};
    const missing = missingOf(record);
    if (missing.length > 0) {
      toast.error(
        `Cannot import "${record.fileName}" — missing: ${missing.join(', ')}. Review the extracted values first.`
      );
      return;
    }
    const scNo = String(values.scNo).trim();
    const sig = norm(scNo);
    if (existingScNosRef.current.has(sig)) {
      toast.error(`Contract number "${scNo}" already exists — a duplicate Sales Contract cannot be created.`);
      return;
    }
    const contractDate = toIsoDate(values.contractDate);
    const validity = toIsoDate(values.validity);
    if (!contractDate) {
      toast.error('Contract Date is not a valid date — use YYYY-MM-DD (e.g. 2026-08-12).');
      return;
    }
    if (!validity) {
      toast.error('Validity is not a valid date — use YYYY-MM-DD (the validity end date, e.g. 2027-08-11).');
      return;
    }
    const clientId = resolveCustomerId(values.clientName);

    setImporting(true);
    try {
      const payload = {
        scNo,
        clientName: String(values.clientName).trim(),
        contractDate,
        validity,
        status: 'draft'
      };
      if (clientId) payload.clientId = clientId;
      const res = await salesContractService.create(payload);
      const created = res?.data ?? {};
      existingScNosRef.current.add(sig);
      toast.success(`${created.scNo || scNo} imported successfully`);
      navigate('/sales-contracts?view=kanban');
    } catch (err) {
      toast.error(err?.message || 'Failed to import the Sales Contract');
    } finally {
      setImporting(false);
    }
  };

  const readyToImport = activeRecord ? missingOf(activeRecord).length === 0 && !isFlagged(activeRecord) : false;

  return (
    <div className="scp-page">
      {/* ===== BREADCRUMB ===== */}
      <nav className="pr-breadcrumb" aria-label="Breadcrumb">
        <a onClick={() => navigate('/sales')}>Sales</a>
        <ChevronRight size={10} className="bc-sep" aria-hidden="true" />
        <a onClick={() => navigate('/sales')}>Sales Execution</a>
        <ChevronRight size={10} className="bc-sep" aria-hidden="true" />
        <span>Sales Contracts</span>
      </nav>

      {/* ===== PAGE HEADER ===== */}
      <div className="scp-page-header">
        <div>
          <h1>
            <Upload /> Bulk Upload Sales Contracts
          </h1>
          <p className="scp-page-header-subtitle">
            Extract a Sales Contract from an existing document — Customer Name, Contract Number, Contract Date and Validity only.
          </p>
        </div>
        <div className="scp-header-actions">
          <button type="button" onClick={() => navigate('/sales-contracts')} className="scp-btn scp-btn-ghost">
            <ChevronLeft /> Back to List
          </button>
          <button type="button" onClick={() => openInNewTab('/sales-contracts/new')} className="scp-btn scp-btn-primary-outline">
            <FileText /> Create New instead
          </button>
        </div>
      </div>

      {/* ===== FLOW STEPS ===== */}
      <div className="scp-bulk-steps">
        <span className={`step${records.length > 0 ? ' on' : ''}`}>
          <Upload /> 1 · Upload &amp; Extract
        </span>
        <span className={`step${activeRecord ? ' on' : ''}`}>
          <StickyNote /> 2 · Review
        </span>
        <span className={`step${readyToImport ? ' on' : ''}`}>
          <Save /> 3 · Save / Import
        </span>
      </div>

      {/* ===== FLOW INFO ===== */}
      <div className="scp-bulk-info">
        <Info className="scp-bulk-info-icon" />
        <span>
          Upload an existing Sales Contract document (PDF, Word, Excel, CSV, image — up to{' '}
          <strong>{MAX_BULK_FILE_SIZE_LABEL}</strong> per file). Only the four contract fields above are extracted and
          displayed in the sticky-note review panel. Nothing is saved until you click{' '}
          <strong>Save / Import</strong> for that contract — no items, products, rates, GST, addresses, terms or other
          document data is ever populated or saved.
        </span>
      </div>

      {/* ===== DROPZONE ===== */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`scp-bulk-dropzone${dragOver ? ' over' : ''}`}
      >
        <Upload />
        <span className="scp-bulk-dropzone-title">
          Drag &amp; drop contract documents here or <em>browse</em>
        </span>
        <span className="scp-bulk-dropzone-sub">
          CSV, XLSX, XLS, PDF, DOC, DOCX, JPG, JPEG, PNG — up to {MAX_BULK_FILE_SIZE_LABEL} per file, multiple files supported
        </span>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT}
          className="scp-hidden"
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      {/* ===== PER-FILE STATUS ===== */}
      {files.length > 0 && (
        <div className="scp-bulk-file-list">
          {files.map((f) => {
            const st = fileStatus[f.name];
            if (!st) return null;
            const reading = st.phase === 'reading' || st.phase === 'parsing' || st.phase === 'cancelling';
            const failed = st.phase === 'error';
            const cancelled = st.phase === 'cancelled';
            const icon = /\.(csv|xlsx|xls)$/i.test(f.name) ? <FileSpreadsheet /> : <FileText />;
            return (
              <div key={f.name} className="scp-bulk-file-row">
                <span className="scp-bulk-file-icon">{icon}</span>
                <div className="scp-bulk-file-body">
                  <p className="scp-bulk-file-name">
                    {f.name}
                    <span className="scp-bulk-file-size">{formatStorageBytes(f.size)}</span>
                  </p>
                  <div className="scp-bulk-file-progress">
                    <div
                      className={`scp-bulk-file-progress-fill${failed ? ' err' : cancelled ? ' dim' : ''}`}
                      style={{ width: `${Math.max(0, Math.min(100, st.percent))}%` }}
                    />
                  </div>
                  <p className={`scp-bulk-file-status${failed ? ' err' : cancelled ? ' dim' : ''}`}>{st.status}</p>
                </div>
                {reading && (
                  <button type="button" className="scp-bulk-cancel" onClick={() => cancelFile(f.name)}>
                    <BanIcon /> Cancel
                  </button>
                )}
                {failed && <AlertTriangle className="scp-bulk-file-err" aria-hidden="true" />}
              </div>
            );
          })}
        </div>
      )}

      {parsing && (
        <div className="scp-bulk-parsing">
          <Loader2 className="scp-spin" /> Reading documents…
        </div>
      )}

      {skipped.length > 0 && (
        <div className="scp-bulk-skipped">
          {skipped.map((s, i) => (
            <div key={`${s.file}-${i}`} className="scp-bulk-skipped-row">
              <X aria-hidden="true" />
              <span>
                <strong>{s.file}</strong> — {s.reason}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ===== EXTRACTED RECORDS + STICKY-NOTE PANEL ===== */}
      <div className="scp-bulk-grid">
        {/* ---- left: extracted documents ---- */}
        <div className="scp-bulk-docs">
          <h3>Extracted Documents</h3>
          {records.map((rec, idx) => {
            const flagged = isFlagged(rec);
            const active = rec.id === activeRecord?.id;
            const missing = missingOf(rec);
            return (
              <button
                key={rec.id}
                type="button"
                onClick={() => setActiveId(rec.id)}
                className={`scp-bulk-doc-card${active ? ' selected' : ''}`}
              >
                <span className="scp-bulk-doc-icon">
                  {/\.(csv|xlsx|xls)$/i.test(rec.fileName) ? <FileSpreadsheet /> : <FileText />}
                </span>
                <span className="scp-bulk-doc-body">
                  <span className="scp-bulk-doc-name">{rec.fileName}</span>
                  <span className="scp-bulk-doc-summary">
                    {rec.values.scNo ? `${rec.values.scNo} · ` : ''}
                    {rec.values.clientName || '—'}
                  </span>
                  <span className="scp-bulk-doc-tags">
                    {flagged && (
                      <em className="tag danger">
                        <AlertTriangle /> {rec._existing ? 'Already exists' : 'Duplicate'}
                      </em>
                    )}
                    {!flagged && missing.length > 0 && <em className="tag warn">{missing.length} field(s) missing</em>}
                    {!flagged && missing.length === 0 && <em className="tag ok">Ready</em>}
                  </span>
                </span>
                <span className="scp-bulk-doc-index">#{idx + 1}</span>
              </button>
            );
          })}

          {records.length === 0 && (
            <div className={`scp-bulk-empty${files.length === 0 ? ' scp-bulk-empty-first' : ''}`}>
              {files.length === 0 ? (
                <>
                  <FileSearch />
                  <p>No documents uploaded yet.</p>
                </>
              ) : (
                <p>No contract fields could be extracted from these files.</p>
              )}
            </div>
          )}
        </div>

        {/* ---- right: sticky-note review panel ---- */}
        <div className="scp-bulk-panel">
          {activeRecord ? (
            <StickyNotePanel
              record={activeRecord}
              statusOf={statusOf}
              updateValue={updateValue}
              onImport={save}
              importing={importing}
              flagged={isFlagged(activeRecord)}
            />
          ) : (
            <div className="scp-bulk-panel-empty">
              <StickyNote />
              <p>Upload a contract document to see the extracted details here.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const EXTRACT_FIELDS = [
  { key: 'clientName', label: 'Customer Name' },
  { key: 'scNo', label: 'Contract Number' },
  { key: 'contractDate', label: 'Contract Date' },
  { key: 'validity', label: 'Validity' }
];

const chipFor = (status, hasValue) => {
  if (hasValue) return status === 'extracted' ? 'ok' : 'warn';
  return 'miss';
};

const chipText = (status, hasValue) => {
  if (hasValue) return status === 'extracted' ? 'Extracted' : 'Needs review';
  return 'Not detected';
};

function BanIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="m4.9 4.9 14.2 14.2" />
    </svg>
  );
}

function StickyNotePanel({ record, statusOf, updateValue, onImport, importing, flagged }) {
  const values = record.values || {};
  return (
    <div className="scp-bulk-note">
      <span className="scp-bulk-note-pin" />
      <div className="scp-bulk-note-head">
        <StickyNote /> Extracted Contract Details
      </div>
      <p className="scp-bulk-note-file" title={record.fileName}>
        {record.fileName}
        <em>{record.values.scNo || 'Review'}</em>
      </p>

      <div className="scp-bulk-note-fields">
        {EXTRACT_FIELDS.map((field) => {
          const status = statusOf(record, field.key);
          const value = values[field.key] ?? '';
          const hasValue = Boolean(String(value).trim());
          return (
            <label key={field.key} className="scp-bulk-note-field">
              <span className="scp-bulk-note-label">
                {field.label}
                <em className={`scp-bulk-chip ${chipFor(status, hasValue)}`}>{chipText(status, hasValue)}</em>
              </span>
              <input
                value={value}
                onChange={(e) => updateValue(record.id, field.key, e.target.value)}
                onBlur={(e) => {
                  if (field.key === 'contractDate' || field.key === 'validity') {
                    const iso = toIsoDate(e.target.value);
                    if (iso && iso !== e.target.value) updateValue(record.id, field.key, iso);
                  }
                }}
                placeholder={status === 'notDetected' && !hasValue ? 'Not detected — type the value' : '—'}
              />
              {field.key === 'validity' && (
                <span className="scp-bulk-field-hint">Validity end date (valid until) — e.g. 2027-08-11</span>
              )}
            </label>
          );
        })}
      </div>

      {flagged && (
        <div className="scp-bulk-note-err">
          <AlertTriangle />
          <span>
            This Contract Number already exists ({record._existing ? 'in the ERP' : 'elsewhere in this batch'}). Correct the
            Contract Number before importing — duplicate contracts are not created.
          </span>
        </div>
      )}

      <button
        type="button"
        onClick={() => onImport(record)}
        disabled={importing}
        className="scp-btn scp-btn-primary scp-bulk-save"
      >
        {importing ? <Loader2 className="scp-spin" /> : <Save />}
        {importing ? 'Importing…' : 'Save / Import Contract'}
      </button>
      <p className="scp-bulk-note-hint">Only Customer Name, Contract Number, Contract Date &amp; Validity are saved.</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Date normalisation (YYYY-MM-DD) mirroring the backend DATE_FORMATTERS order —
// day-first for dd/MM/yyyy so an edited date is stored exactly like the ERP.
// ---------------------------------------------------------------------------

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function pad2(n) {
  return String(n).padStart(2, '0');
}

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

function toIsoDate(value) {
  if (!value) return '';
  const v = String(value).trim();
  if (!v) return '';
  let m = ISO_DATE.exec(v);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(v);
  if (m) {
    let y = m[3];
    if (y.length === 2) y = (Number(y) > 69 ? '19' : '20') + y;
    return `${y}-${pad2(m[2])}-${pad2(m[1])}`;
  }
  m = /^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})$/.exec(v);
  if (m) return `${m[1]}-${pad2(m[2])}-${pad2(m[3])}`;
  m = /^(\d{1,2})\s+([a-z]{3,9})\s+(\d{2,4})$/i.exec(v);
  if (m) {
    const mm = MONTHS[String(m[2]).toLowerCase().slice(0, 3)];
    if (mm) {
      let y = m[3];
      if (y.length === 2) y = (Number(y) > 69 ? '19' : '20') + y;
      return `${y}-${pad2(mm)}-${pad2(m[1])}`;
    }
  }
  m = /^([a-z]{3,9})\s+(\d{1,2}),?\s+(\d{2,4})$/i.exec(v);
  if (m) {
    const mm = MONTHS[String(m[1]).toLowerCase().slice(0, 3)];
    if (mm) {
      let y = m[3];
      if (y.length === 2) y = (Number(y) > 69 ? '19' : '20') + y;
      return `${y}-${pad2(mm)}-${pad2(m[2])}`;
    }
  }
  const d = new Date(v);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return '';
}
