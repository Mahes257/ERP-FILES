import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  Calculator,
  ClipboardList,
  Edit3,
  FileDown,
  FileText,
  Loader2,
  Paperclip,
  Plus,
  Printer,
  Save,
  Send,
  ShieldCheck,
  StickyNote,
  Trash2,
  XCircle
} from 'lucide-react';
import { EditableMasterDropdown, useToast } from '../../components/Common';
import SalesBreadcrumb from '../../components/SalesTable/SalesBreadcrumb';
import useClickOutside from '../../hooks/useClickOutside';
import profitWorkoutService from '../../services/profitWorkoutService';
import leadService from '../../services/leadService';
import {
  calcPwTotals,
  customerPatchFromSource,
  pwStatusMeta,
  pwToForm,
  pwItemToForm,
  normalizePw,
  serializePw
} from '../../utils/profitWorkoutHelpers';
import { formatDate } from '../../utils/leadHelpers';
import { formatAmount, currencySymbol } from '../../utils/quotationPrintUtils';
import { PENDING_APPROVAL_REFRESH_EVENT } from '../../utils/pendingApproval';
import { printSheetWithLetterhead } from '../../utils/letterheadPrintUtils';
import { captureSheetToPdf } from '../../utils/quotationPrintUtils';
import { CPR_HUB_TABS } from '../../utils/navigationHelpers';
import '../crm/crm-erp.css';
import Letterhead from '../../components/SalesDesign/Letterhead';
import './profit-workout-design-print.css';

const CURRENCIES = [
  { code: 'INR', label: 'Indian Rupee' },
  { code: 'USD', label: 'US Dollar' },
  { code: 'EUR', label: 'Euro' },
  { code: 'GBP', label: 'British Pound' },
  { code: 'AED', label: 'UAE Dirham' },
  { code: 'SGD', label: 'Singapore Dollar' },
  { code: 'AUD', label: 'Australian Dollar' },
  { code: 'CAD', label: 'Canadian Dollar' },
  { code: 'JPY', label: 'Japanese Yen' }
];

function currencyLabel(code) {
  const found = CURRENCIES.find((c) => c.code === String(code || '').toUpperCase());
  return found ? `${found.code} - ${found.label}` : String(code || 'INR').toUpperCase();
}

function parsePageList(response) {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.data)) return response.data;
  if (Array.isArray(response?.data?.content)) return response.data.content;
  if (Array.isArray(response?.content)) return response.content;
  return [];
}

let itemIdCounter = 100;

function newItem(description = '', category = 'Material Cost') {
  itemIdCounter += 1;
  return {
    key: itemIdCounter,
    description,
    qty: 1,
    category,
    unit: 'Nos',
    costRate: 0,
    sellingRate: 0,
    categories: []
  };
}

const INPUT_CLS =
  'w-full bg-white border border-slate-300 rounded px-2 py-1 text-[11px] text-slate-700 outline-none focus:border-[#0B4A3D] placeholder:text-slate-300';

// Strip w-full so the fixed numeric widths (w-16/w-20) actually apply.
const INPUT_NUM = INPUT_CLS.replace(/\bw-full\s*/, '');

export default function ProfitWorkoutDesign() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const id = searchParams.get('id') || '';
  const printParam = searchParams.get('print') === '1';
  const pdfParam = searchParams.get('pdf') === '1';
  const toast = useToast();

  const [doc, setDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null);
  const [items, setItems] = useState([]);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [leadSources, setLeadSources] = useState([]);
  const [clientSources, setClientSources] = useState([]);

  // Preserve the persisted workflow status when saving from the preview —
  // editing must never silently rewrite draft/completed/approved/etc.
  const statusRef = useRef('draft');
  // Set while the load effect is redirecting a stale revision link; prevents the
  // finally() from clearing loading before the redirected fetch starts.
  const redirectingRef = useRef(false);

  // Auto-print (Actions -> Print lands here with ?print=1): fire window.print()
  // once the document has loaded, exactly once per page visit.
  const autoPrintedRef = useRef(false);
  useEffect(() => {
    if (!printParam || autoPrintedRef.current || loading || !doc?.id) return undefined;
    autoPrintedRef.current = true;
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, [printParam, loading, doc?.id]);

  // Auto-download PDF (?pdf=1 — triggered from the create/edit page's
  // "Download PDF" button): export the full A4 sheet once loaded, once per visit.
  const autoPdfRef = useRef(false);
  useEffect(() => {
    if (!pdfParam || autoPdfRef.current || loading || !doc?.id || !sheetRef.current) return undefined;
    autoPdfRef.current = true;
    const t = setTimeout(() => doDownloadPdf(), 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfParam, loading, doc?.id]);

  // Lead/Client source combobox state (same mechanism as the PW create/edit form).
  const [sourceOpen, setSourceOpen] = useState(false);
  const [sourceQuery, setSourceQuery] = useState('');
  const [sourceHighlight, setSourceHighlight] = useState(-1);
  const [sourceSelected, setSourceSelected] = useState(null);
  const [sourcePos, setSourcePos] = useState(null);
  const sourceWrapRef = useRef(null);
  const sourceInputRef = useRef(null);

  useClickOutside(sourceWrapRef, () => setSourceOpen(false), sourceOpen);

  const positionSourceDd = () => {
    const input = sourceInputRef.current;
    if (!input) return;
    const rect = input.getBoundingClientRect();
    let left = Math.max(8, rect.left);
    if (left + rect.width > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - rect.width - 8);
    }
    const spaceBelow = window.innerHeight - rect.bottom;
    const ddHeight = 256;
    const top = spaceBelow < ddHeight && rect.top > ddHeight ? rect.top - ddHeight - 4 : rect.bottom + 4;
    const maxHeight = spaceBelow < ddHeight && rect.top > ddHeight ? Math.min(ddHeight, rect.top - 16) : Math.min(ddHeight, spaceBelow - 16);
    setSourcePos({ left, width: rect.width, top, maxHeight });
  };

  useEffect(() => {
    if (!sourceOpen) return undefined;
    positionSourceDd();
    const onScroll = () => positionSourceDd();
    const onResize = () => positionSourceDd();
    document.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [sourceOpen]);

  const sourceItems = useMemo(() => {
    const leads = leadSources.map((l) => ({
      type: 'lead',
      id: l.id,
      code: l.leadNo || l.id,
      name: l.company || l.businessName || l.name || l.customerName || '',
      data: l,
      searchText: `${l.company || ''} ${l.businessName || ''} ${l.name || ''} ${l.leadNo || ''} ${l.id || ''}`.toLowerCase()
    }));
    const clients = clientSources.map((c) => ({
      type: 'client',
      id: c.id,
      code: c.clientCode || c.leadNo || c.id,
      name: c.businessName || c.companyName || c.clientName || c.name || '',
      data: c,
      searchText: `${c.businessName || ''} ${c.companyName || ''} ${c.clientName || ''} ${c.name || ''} ${c.clientCode || c.leadNo || ''} ${c.id || ''}`.toLowerCase()
    }));
    return [...leads, ...clients];
  }, [leadSources, clientSources]);

  const sourceFiltered = useMemo(() => {
    const q = sourceQuery.trim().toLowerCase();
    if (!q) return sourceItems;
    return sourceItems.filter((i) => i.searchText.includes(q));
  }, [sourceItems, sourceQuery]);

  const mapItems = (rawItems) =>
    (Array.isArray(rawItems) ? rawItems : []).map((it) => {
      itemIdCounter += 1;
      return { key: itemIdCounter, ...pwItemToForm(it) };
    });

  const applyDoc = (raw) => {
    statusRef.current = raw.status || 'draft';
    setDoc(raw);
    setForm(pwToForm(raw));
    setItems(mapItems(raw.items));
    if (raw.sourceLead) {
      setSourceSelected({ type: 'client', id: null, label: raw.sourceLead });
    } else {
      setSourceSelected(null);
    }
    setSourceQuery('');
    setSourceOpen(false);
  };

  // Full reload of the saved record (also used by Cancel to discard edits).
  const loadRecord = async (targetId, { silent = false } = {}) => {
    if (!targetId) {
      setLoading(false);
      return;
    }
    if (!silent) setLoading(true);
    redirectingRef.current = false;
    try {
      const res = await profitWorkoutService.getPw(targetId);
      const raw = normalizePw(res?.data ?? res);
      if (!raw?.id) return;
      if (raw.latestRevision === false && Array.isArray(raw.revisions)) {
        const latest = raw.revisions.find((rev) => rev.latestRevision === true);
        if (latest?.id && String(latest.id) !== String(raw.id)) {
          redirectingRef.current = true;
          navigate(`/profit-workouts/design?id=${latest.id}`, { replace: true });
          return;
        }
      }
      applyDoc(raw);
      try {
        const attRes = await profitWorkoutService.getAttachments(targetId);
        if (Array.isArray(attRes)) {
          setForm((prev) => (prev ? { ...prev, attachments: attRes } : prev));
        }
      } catch {
        // attachments optional
      }
    } catch {
      // handled below via the not-found state
    } finally {
      if (!redirectingRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return undefined;
    }
    let cancelled = false;
    redirectingRef.current = false;
    profitWorkoutService
      .getPw(id)
      .then(async (res) => {
        if (cancelled) return;
        const raw = normalizePw(res?.data ?? res);
        if (!raw?.id) return;
        // If the URL points at an older revision row (e.g. a stale link), follow
        // the chain to the latest editable revision instead of failing later.
        if (raw.latestRevision === false && Array.isArray(raw.revisions)) {
          const latest = raw.revisions.find((rev) => rev.latestRevision === true);
          if (latest?.id && String(latest.id) !== String(raw.id)) {
            redirectingRef.current = true;
            navigate(`/profit-workouts/design?id=${latest.id}`, { replace: true });
            return;
          }
        }
        applyDoc(raw);
        try {
          const attRes = await profitWorkoutService.getAttachments(id);
          if (!cancelled && Array.isArray(attRes)) {
            setForm((prev) => (prev ? { ...prev, attachments: attRes } : prev));
          }
        } catch {
          // attachments optional
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled && !redirectingRef.current) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const ensureSources = () => {
    if (leadSources.length || clientSources.length) return;
    Promise.all([
      leadService.listLeads({ page: 0, size: 200 }),
      leadService.listClients({ page: 0, size: 200 })
    ])
      .then(([leadsRes, clientsRes]) => {
        setLeadSources(parsePageList(leadsRes));
        setClientSources(parsePageList(clientsRes));
      })
      .catch(() => {
        // lookups are optional; the field still works with manual entry
      });
  };

  // Matches the existing ERP-React backend update() rule: only deleted records
  // cannot be edited (the standard edit page applies no status restriction, so
  // the preview mirrors that behaviour).
  const canEdit = String(doc?.status || '').toLowerCase() !== 'deleted';

  const toggleEdit = () => {
    if (!editMode) ensureSources();
    setEditMode((e) => !e);
  };

  // Cancel: discard unsaved preview edits and reload the saved record.
  const handleCancelEdit = () => {
    setEditMode(false);
    if (doc?.id) loadRecord(doc.id, { silent: true });
  };

  // ---- Lead/Client autofill (existing PW behaviour) ----
  const autofillFromSource = (item) => {
    setForm((prev) => ({ ...prev, sourceLead: item.label, ...customerPatchFromSource(item) }));
  };

  const selectSource = (item) => {
    const codeLabel = item.type === 'lead' ? `Lead No: ${item.code}` : `Client Code: ${item.code}`;
    const label = `${item.name} (${codeLabel})`;
    setSourceSelected({ type: item.type, id: item.id, label });
    setSourceQuery('');
    setSourceOpen(false);
    setSourceHighlight(-1);
    autofillFromSource({ ...item, label });
  };

  const clearSourceSelection = () => {
    setSourceSelected(null);
    setSourceQuery('');
    setForm((prev) => ({
      ...prev,
      sourceLead: '',
      customerName: '',
      contactPerson: '',
      phone: '',
      email: '',
      company: '',
      gst: '',
      pan: '',
      billingAddress: '',
      shippingAddress: ''
    }));
  };

  const handleSourceInput = (v) => {
    setSourceQuery(v);
    if (!v && sourceSelected) clearSourceSelection();
  };

  const handleSourceKeyDown = (e) => {
    if (!sourceOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setSourceOpen(true);
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSourceHighlight((h) => (h < sourceFiltered.length - 1 ? h + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSourceHighlight((h) => (h > 0 ? h - 1 : sourceFiltered.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (sourceHighlight >= 0 && sourceFiltered[sourceHighlight]) selectSource(sourceFiltered[sourceHighlight]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setSourceOpen(false);
    }
  };

  // ---- Item grid (flat model, same as the create/edit form) ----
  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const updateItem = (itemKey, patch) => {
    setItems((prev) => prev.map((item) => (item.key === itemKey ? { ...item, ...patch } : item)));
  };

  const addItem = () => setItems((prev) => [...prev, newItem()]);

  const removeItem = (itemKey) => {
    if (items.length <= 1) {
      toast.warning('At least one item is required');
      return;
    }
    setItems((prev) => prev.filter((item) => item.key !== itemKey));
  };

  const handleCategoryDeleted = (name) => {
    if (!name) return;
    setItems((prev) =>
      prev.map((item) => (item.category === name ? { ...item, category: 'Material Cost', unit: 'Nos' } : item))
    );
  };

  const totals = useMemo(
    () => calcPwTotals(items, form?.profitPct, form?.discountPct, form?.gstPct, form?.additionalCharges),
    [items, form?.profitPct, form?.discountPct, form?.gstPct, form?.additionalCharges]
  );

  const totalQty = items.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);

  // ---- Save through the EXISTING update API (never a parallel editor) ----
  const handleSave = async () => {
    if (!doc || saving) return;
    setSaving(true);
    try {
      const payload = serializePw({ ...form, status: statusRef.current || form.status }, items);
      const res = await profitWorkoutService.updatePw(doc.id, payload);
      const data = res?.data ?? res ?? {};
      applyDoc(normalizePw(data));
      // The ERP-React backend persists edits as a new revision row (BASE(N)) and
      // returns the NEW revision id. Keep the URL on that id so a browser
      // refresh / re-open always targets the latest editable revision.
      if (data.id && String(data.id) !== String(doc.id)) {
        navigate(`/profit-workouts/design?id=${data.id}`, { replace: true });
      }
      setEditMode(false);
      toast.success('Profit Workout saved');
    } catch (err) {
      toast.error(err?.message || 'Failed to save Profit Workout');
    } finally {
      setSaving(false);
    }
  };

  // Print/PDF use the clean (non-edit) document, exactly like the on-screen sheet.
  const withCleanSheet = async (fn) => {
    const wasEditing = editMode;
    if (wasEditing) setEditMode(false);
    if (wasEditing) await new Promise((r) => setTimeout(r, 100));
    try {
      await fn();
    } finally {
      if (wasEditing) setEditMode(true);
    }
  };

  const sheetRef = useRef(null);

  const doPrint = () => {
    withCleanSheet(() => {
      // Shared architecture hook — grafts print-only letterhead copies at page
      // starts (currently a no-op in the shared utils; kept for parity).
      printSheetWithLetterhead(sheetRef.current);
      window.print();
    });
  };

  const doDownloadPdf = async () => {
    if (!sheetRef.current) return;
    setSaving(true);
    try {
      await withCleanSheet(async () => {
        await captureSheetToPdf(sheetRef.current, {
          filename: `${doc?.pwNo || 'ProfitWorkout'}-${new Date().toISOString().slice(0, 10)}`
        });
      });
      toast.success('PDF downloaded');
    } catch {
      toast.error('PDF export failed');
    } finally {
      setSaving(false);
    }
  };

  const meta = pwStatusMeta(doc?.status);
  const cur = form?.currency || 'INR';
  const sym = currencySymbol(cur);
  const money = (v) => formatAmount(v, { currency: cur });
  const symLabel = sym.trim();
  // Plain (symbol-free) amount for the item table — the column headers already
  // carry the currency, so cells render clean numbers like the reference sheet.
  const plainMoney = (v) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return '0.00';
    return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // Submit for Approval: only while the current revision is eligible.
  // Mirrors ProfitWorkoutService.submit — not from submitted/approved/archived/deleted.
  const statusKey = String(doc?.status || '').toLowerCase();
  const canSubmit = !['submitted', 'approved', 'archived', 'deleted'].includes(statusKey);
  const handleSubmitForApproval = async () => {
    if (!doc || submitting || !canSubmit) return;
    setSubmitting(true);
    try {
      const res = await profitWorkoutService.submitPw(doc.id);
      const data = res?.data ?? res ?? {};
      applyDoc(normalizePw(data));
      window.dispatchEvent(new Event(PENDING_APPROVAL_REFRESH_EVENT));
      toast.success('Profit Workout submitted for approval');
    } catch (err) {
      toast.error(err?.message || 'Failed to submit for approval');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-10">
        <Loader2 className="w-6 h-6 text-[#0B4A3D] animate-spin" />
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-10 text-center">
        <Calculator className="w-12 h-12 text-slate-300 mb-4" />
        <h3 className="text-base font-bold text-slate-700 mb-1.5">Profit Workout not found</h3>
        <p className="text-xs text-slate-400 mb-5">Select a Profit Workout from the list and open Preview.</p>
        <button
          type="button"
          onClick={() => navigate(CPR_HUB_TABS['profit-workout'])}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-[#0B4A3D] hover:bg-[#083D34] px-4 py-2 rounded-lg transition-colors cursor-pointer"
        >
          Back to Profit Workouts
        </button>
      </div>
    );
  }

  const approvalKey = doc?.approvedBy ? 'approved' : doc?.rejectionReason ? 'rejected' : 'pending';
  const approvalLabel = approvalKey === 'approved' ? 'Approved' : approvalKey === 'rejected' ? 'Rejected' : 'Pending Approval';
  const approvalPillCls =
    approvalKey === 'approved'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : approvalKey === 'rejected'
        ? 'bg-rose-50 text-rose-700 border-rose-200'
        : 'bg-amber-50 text-amber-700 border-amber-200';

  const statusPillCls =
    statusKey === 'approved'
      ? 'text-emerald-700 border-emerald-300'
      : statusKey === 'rejected'
        ? 'text-rose-700 border-rose-300'
        : 'text-emerald-700 border-emerald-300';

  const attachments = Array.isArray(form?.attachments) ? form.attachments : [];
  const showAttachmentsPanel = attachments.length > 0 || editMode;

  // ===== Reusable panel header (dark green bar, matches approved design) =====
  const panelHeader = (icon, title) => (
    <div className="pw-panel-header flex items-center gap-2 px-3 py-2 bg-[#0B4A3D]">
      <span className="text-white">{icon}</span>
      <h3 className="text-[11px] font-bold text-white uppercase tracking-wider m-0">{title}</h3>
    </div>
  );

  // ===== Document Information value cell =====
  // Blank values render as a dash so the reference layout's empty cells stay
  // clean — real saved data always renders as-is (never sample content).
  const infoValue = (value) => {
    const v = value ?? '';
    return <div className="text-[11px] font-semibold text-slate-800">{String(v).trim() === '' ? '–' : v}</div>;
  };

  // Human-readable file size (e.g. 245 KB / 1.2 MB) — from the stored byte size.
  const formatFileSize = (bytes) => {
    const n = Number(bytes);
    if (!Number.isFinite(n) || n <= 0) return '';
    if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
    if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${n} B`;
  };

  const infoCell = (children, cls = '') => (
    <td className={`border border-slate-200 px-2.5 py-2 align-top ${cls}`}>{children}</td>
  );

  const infoLabelCell = (text) => (
    <td className="border border-slate-200 px-2.5 py-2 align-top bg-slate-50">
      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{text}</span>
    </td>
  );

  return (
    <div className="flex-1 bg-app font-sans antialiased text-slate-800 p-4 sm:p-6 w-full max-w-[100vw] overflow-x-hidden">
      {/* ===== BREADCRUMB ===== */}
      <SalesBreadcrumb
        items={[
          { label: 'CPR', to: '/cprs' },
          { label: 'Profit Workout', to: CPR_HUB_TABS['profit-workout'] },
          { label: 'Profit Workout Preview' }
        ]}
      />

      {/* ===== HEADER ===== */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
        <div>
          <h1 className="flex items-center gap-2.5 text-2xl font-bold text-slate-900 tracking-tight">
            <FileDown className="w-6 h-6 text-[#0B4A3D]" />
            Profit Workout Preview
          </h1>
          <p className="text-xs text-slate-400 mt-1">Preview, edit, print and share the Profit Workout document</p>
        </div>
        {doc && (
          <div className="flex items-center gap-2.5">
            <span className="text-sm font-bold text-slate-700">{doc.pwNo}</span>
            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-[11px] font-bold ${statusPillCls}`}>
              {meta.label}
            </span>
          </div>
        )}
      </div>

      {/* ===== TOOLBAR (outside the printable document) ===== */}
      <div className="flex items-center gap-2 flex-wrap mb-4 bg-surface border border-slate-200 rounded-xl shadow-sm px-3 py-2.5">
        <button
          type="button"
          onClick={toggleEdit}
          disabled={!canEdit}
          className={`inline-flex items-center gap-1.5 text-xs font-bold px-3.5 h-9 rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
            editMode
              ? 'bg-[#0B4A3D] text-white'
              : 'text-slate-600 bg-surface border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <Edit3 className="w-3.5 h-3.5" /> {editMode ? 'Editing On' : 'Edit'}
        </button>
        {editMode && (
          <>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-1.5 text-xs font-bold px-3.5 h-9 rounded-lg transition-colors cursor-pointer text-white bg-[#0B4A3D] hover:bg-[#083D34] disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button
              type="button"
              onClick={handleCancelEdit}
              disabled={saving}
              className="inline-flex items-center gap-1.5 text-xs font-bold px-3.5 h-9 rounded-lg transition-colors cursor-pointer text-slate-600 bg-surface border border-slate-200 hover:bg-slate-50 disabled:opacity-50"
            >
              <XCircle className="w-3.5 h-3.5" /> Cancel
            </button>
          </>
        )}
        <button
          type="button"
          onClick={doPrint}
          className="inline-flex items-center gap-1.5 text-xs font-bold px-3.5 h-9 rounded-lg transition-colors cursor-pointer text-white bg-[#0B4A3D] hover:bg-[#083D34]"
        >
          <Printer className="w-3.5 h-3.5" /> Print
        </button>
        <button
          type="button"
          onClick={doDownloadPdf}
          disabled={saving && !editMode}
          className="inline-flex items-center gap-1.5 text-xs font-bold px-3.5 h-9 rounded-lg transition-colors cursor-pointer text-slate-600 bg-surface border border-slate-200 hover:bg-slate-50 disabled:opacity-50"
        >
          {saving && !editMode ? (
            <span className="h-3.5 w-3.5 rounded-full border-2 border-slate-300 border-t-[#0B4A3D] animate-spin" />
          ) : (
            <FileDown className="w-3.5 h-3.5" />
          )}
          {saving && !editMode ? 'Exporting...' : 'Download PDF'}
        </button>
        {canSubmit && (
          <button
            type="button"
            onClick={handleSubmitForApproval}
            disabled={submitting}
            className="inline-flex items-center gap-1.5 text-xs font-bold px-3.5 h-9 rounded-lg transition-colors cursor-pointer text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            {submitting ? 'Submitting...' : 'Submit for Approval'}
          </button>
        )}
        <button
          type="button"
          onClick={() => navigate(CPR_HUB_TABS['profit-workout'])}
          className="inline-flex items-center gap-1.5 text-xs font-bold px-3.5 h-9 rounded-lg transition-colors cursor-pointer text-slate-600 bg-surface border border-slate-200 hover:bg-slate-50 ml-auto"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to List
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_280px] gap-5 items-start">
        {/* ===== A4 PROFIT WORKOUT DOCUMENT ===== */}
        <div className="order-1 bg-slate-100/80 border border-slate-200 rounded-xl shadow-sm px-4 sm:px-6 py-4">
          <div
            id="pw-sheet"
            ref={sheetRef}
            className="bg-white shadow-[0_8px_30px_rgba(15,23,42,0.14)] rounded-sm mx-auto p-5 sm:p-7"
            style={{ width: '210mm', minHeight: '297mm', maxWidth: '100%' }}
          >
            {/* ===== Adaptive Vishak Tech letterhead (master Proforma Invoice letterhead) ===== */}
            <Letterhead className="mb-4" />

            {/* ===== Document title + status ===== */}
            <div className="flex items-end justify-between gap-4 pb-3 mb-4 border-b-2 border-[#0B4A3D]">
              <div>
                <div className="text-xl font-extrabold text-[#0B4A3D] tracking-wide">PROFIT WORKOUT</div>
                <div className="text-[10px] text-slate-500 mt-0.5">Internal Costing &amp; Profitability Analysis</div>
                <div className="text-[9px] text-slate-400 mt-0.5">Engineering Solutions | Global Partnerships | Sustainable Value</div>
              </div>
              <div className="text-right shrink-0">
                <div className={`inline-flex items-center gap-1.5 border rounded-full pl-2 pr-3 py-0.5 bg-white ${statusPillCls}`}>
                  <span className="text-[9px] uppercase font-bold text-slate-400">Status</span>
                  <span className="text-[10px] font-bold">{meta.label}</span>
                </div>
                <div className="mt-1 text-[10px] text-slate-500">
                  <span className="font-bold text-slate-600">{doc.pwNo || ''}</span>
                  {doc.pwNo && form?.pwDate ? ' | ' : ''}
                  {form?.pwDate ? formatDate(form.pwDate) : ''}
                </div>
              </div>
            </div>

            {/* ===== Panel 1: Document Information ===== */}
            <div className="pw-panel pw-keep mb-4">
              {panelHeader(<FileText className="w-3.5 h-3.5" />, 'Document Information')}
              <table className="w-full border-collapse pw-info-table">
                <tbody>
                  <tr>
                    {infoLabelCell('Profit Workout No.')}
                    {infoCell(
                      editMode ? (
                        <input type="text" value={form?.pwNo || ''} onChange={(e) => setField('pwNo', e.target.value)} className={INPUT_CLS} />
                      ) : (
                        infoValue(form?.pwNo)
                      )
                    )}
                    {infoLabelCell('Date')}
                    {infoCell(
                      editMode ? (
                        <input type="date" value={form?.pwDate || ''} onChange={(e) => setField('pwDate', e.target.value)} className={INPUT_CLS} />
                      ) : (
                        infoValue(form?.pwDate ? formatDate(form.pwDate) : '')
                      )
                    )}
                    {infoLabelCell('Department')}
                    {infoCell(
                      editMode ? (
                        <EditableMasterDropdown
                          masterKey="cw_departments"
                          value={form?.department || ''}
                          onChange={(v) => setField('department', v)}
                          placeholder="Department"
                          inputClassName={`${INPUT_CLS} cursor-text`}
                        />
                      ) : (
                        infoValue(form?.department)
                      )
                    )}
                  </tr>
                  <tr>
                    {infoLabelCell('CPR Reference')}
                    {infoCell(
                      editMode ? (
                        <input type="text" value={form?.cprRef || ''} onChange={(e) => setField('cprRef', e.target.value)} placeholder="CPR reference" className={INPUT_CLS} />
                      ) : (
                        infoValue(form?.cprRef)
                      )
                    )}
                    {infoLabelCell('Prepared By')}
                    {infoCell(
                      editMode ? (
                        <EditableMasterDropdown
                          masterKey="pr_requested_by"
                          value={form?.preparedBy || ''}
                          onChange={(v) => setField('preparedBy', v)}
                          placeholder="Prepared By"
                          inputClassName={`${INPUT_CLS} cursor-text`}
                        />
                      ) : (
                        infoValue(form?.preparedBy)
                      )
                    )}
                    {infoLabelCell('Project')}
                    {infoCell(
                      editMode ? (
                        <input type="text" value={form?.project || ''} onChange={(e) => setField('project', e.target.value)} placeholder="Project" className={INPUT_CLS} />
                      ) : (
                        infoValue(form?.project)
                      )
                    )}
                  </tr>
                  <tr>
                    {infoLabelCell('Customer / Lead')}
                    {infoCell(
                      editMode ? (
                        <div ref={sourceWrapRef} className="relative">
                          <input
                            ref={sourceInputRef}
                            type="text"
                            value={sourceOpen ? sourceQuery : sourceSelected ? sourceSelected.label : ''}
                            onChange={(e) => handleSourceInput(e.target.value)}
                            onFocus={() => setSourceOpen(true)}
                            onKeyDown={handleSourceKeyDown}
                            placeholder="Search Lead or Client..."
                            autoComplete="off"
                            className={`${INPUT_CLS} cursor-text`}
                          />
                          {sourceOpen &&
                            createPortal(
                              <div
                                className="fixed z-[9999] bg-surface border border-slate-200 rounded-lg shadow-lg overflow-y-auto"
                                style={{
                                  left: sourcePos?.left,
                                  width: sourcePos?.width,
                                  top: sourcePos?.top,
                                  maxHeight: sourcePos?.maxHeight,
                                  display: sourcePos ? 'block' : 'none'
                                }}
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                }}
                              >
                                {sourceFiltered.length === 0 && (
                                  <div className="px-3 py-2.5 text-[11px] text-slate-400">No matches found</div>
                                )}
                                {sourceFiltered.map((item, i) => (
                                  <button
                                    key={`${item.type}-${item.id}`}
                                    type="button"
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      selectSource(item);
                                    }}
                                    onMouseEnter={() => setSourceHighlight(i)}
                                    className={`w-full text-left px-3 py-2 border-b border-slate-50 transition-colors cursor-pointer ${
                                      i === sourceHighlight ? 'bg-[#E8F0EE] text-[#0B4A3D]' : 'hover:bg-slate-50'
                                    }`}
                                  >
                                    <div className="text-xs font-semibold text-slate-700">{item.name || '(No Name)'}</div>
                                    <div className="text-[10px] text-slate-400">
                                      {item.type === 'lead' ? `Lead No: ${item.code}` : `Client Code: ${item.code}`}
                                    </div>
                                  </button>
                                ))}
                              </div>,
                              document.body
                            )}
                        </div>
                      ) : (
                        infoValue(form?.sourceLead || form?.customerName)
                      )
                    )}
                    {infoLabelCell('Contact Person')}
                    {infoCell(
                      editMode ? (
                        <input type="text" value={form?.contactPerson || ''} onChange={(e) => setField('contactPerson', e.target.value)} placeholder="Contact person" className={INPUT_CLS} />
                      ) : (
                        infoValue(form?.contactPerson)
                      )
                    )}
                    {infoLabelCell('Currency')}
                    {infoCell(
                      editMode ? (
                        <select value={form?.currency || 'INR'} onChange={(e) => setField('currency', e.target.value)} className={`${INPUT_CLS} cursor-pointer`}>
                          {CURRENCIES.map((c) => (
                            <option key={c.code} value={c.code}>
                              {c.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        infoValue(currencyLabel(form?.currency))
                      )
                    )}
                  </tr>
                  <tr>
                    {infoLabelCell('Shipping Address')}
                    <td colSpan={5} className="border border-slate-200 px-2.5 py-2 align-top">
                      {editMode ? (
                        <textarea rows={2} value={form?.shippingAddress || ''} onChange={(e) => setField('shippingAddress', e.target.value)} placeholder="Shipping address" className={INPUT_CLS} />
                      ) : (
                        <div className="text-[11px] text-slate-700 leading-relaxed whitespace-pre-wrap">{form?.shippingAddress || ''}</div>
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* ===== Panel 2: Profit Items Breakdown ===== */}
            <div className="pw-panel mb-4">
              {panelHeader(<ClipboardList className="w-3.5 h-3.5" />, 'Profit Items Breakdown')}
              {editMode && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 border-b border-slate-200">
                  <button
                    type="button"
                    onClick={addItem}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-white bg-[#0B4A3D] hover:bg-[#083D34] px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                  >
                    <Plus className="w-3 h-3" /> Add Item
                  </button>
                </div>
              )}
              <div
                className={editMode ? 'proforma-item-table overflow-x-auto' : 'proforma-item-table pw-items-view'}
              >
                <table className="w-full border-collapse pw-items-table" style={editMode ? { minWidth: 1040 } : undefined}>
                  <colgroup>
                    <col className="pw-col-no" />
                    <col className="pw-col-desc" />
                    <col className="pw-col-qty" />
                    <col className="pw-col-cat" />
                    <col className="pw-col-unit" />
                    <col className="pw-col-rate" />
                    <col className="pw-col-rate" />
                    <col className="pw-col-amount" />
                    <col className="pw-col-amount" />
                    <col className="pw-col-rate" />
                    <col className="pw-col-amount" />
                    <col className="pw-col-margin" />
                    {editMode && <col className="pw-col-action" />}
                  </colgroup>
                  <thead>
                    <tr className="bg-slate-100">
                      {['#', 'Description', 'Qty', 'Category', 'Unit', `Cost Rate (${symLabel})`, `Selling Rate (${symLabel})`, `Cost Amount (${symLabel})`, `Selling Amount (${symLabel})`, `Profit / Unit (${symLabel})`, `Profit Amount (${symLabel})`, 'Margin %', ...(editMode ? [''] : [])].map((h, i) => (
                        <th
                          key={i}
                          className={`py-2 px-1.5 text-[9px] font-bold text-slate-600 uppercase tracking-wide whitespace-nowrap border-b border-slate-200 ${
                            i >= 5 && i <= 11 ? 'text-right' : i === 0 ? 'text-center' : 'text-left'
                          }`}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {items.length === 0 && (
                      <tr>
                        <td colSpan={13} className="py-8 text-center text-xs text-slate-400">
                          No items
                        </td>
                      </tr>
                    )}
                    {items.map((item, index) => {
                      const row = totals.rows.find((r) => r.key === item.key);
                      return (
                        <tr key={item.key} className="border-b border-slate-100 align-top">
                          <td className="px-1.5 py-1.5 text-[10px] text-slate-500 text-center">{index + 1}</td>
                          <td className="px-1.5 py-1.5">
                            {editMode ? (
                              <div className="flex items-center gap-1">
                                <input
                                  type="text"
                                  value={item.description}
                                  onChange={(e) => updateItem(item.key, { description: e.target.value })}
                                  placeholder="Item description"
                                  className="flex-1 min-w-0 bg-white border border-slate-300 rounded px-1.5 py-1 text-[11px] outline-none focus:border-[#0B4A3D]"
                                />
                                <button
                                  type="button"
                                  onClick={() => removeItem(item.key)}
                                  aria-label="Delete item"
                                  title="Delete item"
                                  className="p-0.5 text-slate-300 hover:text-rose-500 transition-colors cursor-pointer shrink-0"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            ) : (
                              <span className="text-[10px] font-medium text-slate-700">{item.description || ''}</span>
                            )}
                          </td>
                          <td className="px-1.5 py-1.5">
                            {editMode ? (
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={item.qty}
                                onChange={(e) => updateItem(item.key, { qty: e.target.value })}
                                className={`${INPUT_NUM} text-center w-16`}
                              />
                            ) : (
                              <span className="text-[10px] text-slate-600 text-center block whitespace-nowrap">{item.qty ?? ''}</span>
                            )}
                          </td>
                          <td className="px-1.5 py-1.5">
                            {editMode ? (
                              <EditableMasterDropdown
                                masterKey="cw_categories"
                                value={item.category}
                                onChange={(v) => updateItem(item.key, { category: v })}
                                onDeleted={handleCategoryDeleted}
                                placeholder="Category"
                                portal
                                inputClassName="w-full bg-white border border-slate-300 rounded px-1.5 py-1 text-[11px] outline-none cursor-text focus:border-[#0B4A3D]"
                              />
                            ) : (
                              <span className="text-[10px] text-slate-600">{item.category || ''}</span>
                            )}
                          </td>
                          <td className="px-1.5 py-1.5">
                            {editMode ? (
                              <EditableMasterDropdown
                                masterKey="cw_units"
                                value={item.unit}
                                onChange={(u) => updateItem(item.key, { unit: u })}
                                placeholder="Unit"
                                portal
                                inputClassName="w-full bg-white border border-slate-300 rounded px-1.5 py-1 pr-5 text-[11px] outline-none cursor-text focus:border-[#0B4A3D]"
                              />
                            ) : (
                              <span className="text-[10px] text-slate-600">{item.unit || ''}</span>
                            )}
                          </td>
                          <td className="px-1.5 py-1.5">
                            {editMode ? (
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={item.costRate}
                                onChange={(e) => updateItem(item.key, { costRate: e.target.value })}
                                placeholder="0.00"
                                className={`${INPUT_NUM} text-right w-20`}
                              />
                            ) : (
                              <span className="text-[10px] text-slate-600 text-right block whitespace-nowrap">{plainMoney(item.costRate)}</span>
                            )}
                          </td>
                          <td className="px-1.5 py-1.5">
                            {editMode ? (
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={item.sellingRate}
                                onChange={(e) => updateItem(item.key, { sellingRate: e.target.value })}
                                placeholder="0.00"
                                className={`${INPUT_NUM} text-right w-20`}
                              />
                            ) : (
                              <span className="text-[10px] text-slate-600 text-right block whitespace-nowrap">{plainMoney(item.sellingRate)}</span>
                            )}
                          </td>
                          <td className="px-1.5 py-1.5 text-[10px] font-semibold text-slate-700 text-right whitespace-nowrap">
                            {plainMoney(row ? row.costAmount : 0)}
                          </td>
                          <td className="px-1.5 py-1.5 text-[10px] font-semibold text-slate-700 text-right whitespace-nowrap">
                            {plainMoney(row ? row.sellingAmount : 0)}
                          </td>
                          <td className={`px-1.5 py-1.5 text-[10px] font-semibold text-right whitespace-nowrap ${row && row.profitPerUnit < 0 ? 'text-rose-600' : 'text-slate-600'}`}>
                            {plainMoney(row ? row.profitPerUnit : 0)}
                          </td>
                          <td className={`px-1.5 py-1.5 text-[10px] font-bold text-right whitespace-nowrap ${row && row.profitAmount < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                            {plainMoney(row ? row.profitAmount : 0)}
                          </td>
                          <td className={`px-1.5 py-1.5 text-[10px] font-semibold text-right whitespace-nowrap ${row && row.margin < 0 ? 'text-rose-600' : 'text-slate-600'}`}>
                            {row ? `${row.margin.toFixed(2)}%` : ''}
                          </td>
                          {editMode && <td className="px-1 py-1.5" />}
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-emerald-50 font-bold text-slate-800">
                      <td className="px-1.5 py-2 text-[10px] text-center" colSpan={1}>TOTAL</td>
                      <td className="px-1.5 py-2" />
                      <td className="px-1.5 py-2 text-[10px] text-center">{totalQty || ''}</td>
                      <td className="px-1.5 py-2" colSpan={2} />
                      <td className="px-1.5 py-2 text-[10px] text-right whitespace-nowrap">{plainMoney(totals.totalCost)}</td>
                      <td className="px-1.5 py-2 text-[10px] text-right whitespace-nowrap">{plainMoney(totals.totalSelling)}</td>
                      <td className="px-1.5 py-2" />
                      <td className={`px-1.5 py-2 text-[10px] text-right whitespace-nowrap ${totals.totalProfit < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                        {plainMoney(totals.totalProfit)}
                      </td>
                      <td className="px-1.5 py-2" />
                      <td className="px-1.5 py-2 text-[10px] text-right whitespace-nowrap">{totals.profitPct.toFixed(2)}%</td>
                      {editMode && <td className="px-1 py-2" />}
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* ===== Profit Breakdown & Pricing + Remarks ===== */}
            <div className="pw-two-col grid grid-cols-1 lg:grid-cols-2 gap-3 mb-4">
              <div className="pw-panel">
                {panelHeader(<Calculator className="w-3.5 h-3.5" />, 'Profit Breakdown & Pricing')}
                <div className="p-3">
                  <div className="space-y-[3px]">
                    <div className="flex items-center justify-between py-[4px] text-[11px]">
                      <span className="text-slate-600">Total Cost (Subtotal)</span>
                      <span className="font-semibold text-slate-800">{money(totals.totalCost)}</span>
                    </div>
                    <div className="flex items-center justify-between py-[4px] text-[11px]">
                      <span className="text-slate-600">Total Selling Value</span>
                      <span className="font-semibold text-slate-800">{money(totals.totalSelling)}</span>
                    </div>
                    <div className="flex items-center justify-between py-[4px] text-[11px]">
                      <span className="text-slate-600">Total Profit</span>
                      <span className={`font-bold ${totals.totalProfit < 0 ? 'text-rose-600' : 'text-[#0B4A3D]'}`}>
                        {money(totals.totalProfit)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-[4px] text-[11px]">
                      <span className="text-slate-600">Profit %</span>
                      <span className={`font-bold ${totals.profitPct < 0 ? 'text-rose-600' : 'text-[#0B4A3D]'}`}>
                        {totals.profitPct.toFixed(2)}%
                      </span>
                    </div>
                    <div className="border-t border-slate-200 mt-1.5 pt-1.5">
                      <div className="flex items-center justify-between py-[4px] text-[11px]">
                        <span className="text-slate-600">Discount %</span>
                        <span className="flex items-center gap-2">
                          {editMode ? (
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="0.1"
                              value={form?.discountPct ?? 0}
                              onChange={(e) => setField('discountPct', e.target.value)}
                              className={`${INPUT_NUM} text-right w-16`}
                            />
                          ) : (
                            <span className="font-semibold text-slate-800">{totals.discountPct}%</span>
                          )}
                          <span className="font-semibold text-slate-800 w-20 text-right">{money(totals.discountAmt)}</span>
                        </span>
                      </div>
                      <div className="flex items-center justify-between py-[4px] text-[11px]">
                        <span className="text-slate-600">Additional Charges</span>
                        <span className="font-semibold text-slate-800 w-20 text-right">{money(totals.chargesAmt)}</span>
                      </div>
                      <div className="flex items-center justify-between py-[4px] text-[11px]">
                        <span className="text-slate-600">GST %</span>
                        <span className="flex items-center gap-2">
                          {editMode ? (
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="0.1"
                              value={form?.gstPct ?? 18}
                              onChange={(e) => setField('gstPct', e.target.value)}
                              className={`${INPUT_NUM} text-right w-16`}
                            />
                          ) : (
                            <span className="font-semibold text-slate-800">{totals.gstPct}%</span>
                          )}
                          <span className="font-semibold text-slate-800 w-20 text-right">{money(totals.gstAmt)}</span>
                        </span>
                      </div>
                    </div>
                    <div className="mt-2 rounded-md bg-emerald-50 border border-emerald-200 px-3 py-2 flex items-center justify-between">
                      <span className="text-[11px] font-bold text-slate-800">Grand Total (Including GST)</span>
                      <span className="text-[13px] font-extrabold text-[#0B4A3D]">{money(totals.grandTotal)}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pw-panel">
                {panelHeader(<StickyNote className="w-3.5 h-3.5" />, 'Remarks')}
                <div className="p-3">
                  {editMode ? (
                    <textarea
                      rows={6}
                      value={form?.remarks || ''}
                      onChange={(e) => setField('remarks', e.target.value)}
                      placeholder="Additional notes or remarks..."
                      className="w-full bg-white border border-slate-300 rounded px-2.5 py-2 text-[11px] text-slate-700 outline-none focus:border-[#0B4A3D]"
                    />
                  ) : (
                    <div className="text-[11px] text-slate-700 whitespace-pre-wrap leading-relaxed min-h-6">
                      {form?.remarks || ''}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ===== Approval Status + Attachments ===== */}
            <div className="pw-two-col grid grid-cols-1 lg:grid-cols-2 gap-3 mb-4">
              <div className="pw-panel">
                {panelHeader(<ShieldCheck className="w-3.5 h-3.5" />, 'Approval Status')}
                <table className="w-full border-collapse pw-info-table">
                  <tbody>
                    <tr>
                      {infoLabelCell('Status')}
                      {infoCell(
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-bold ${approvalPillCls}`}>
                          {approvalLabel}
                        </span>
                      )}
                      {infoLabelCell('Pending With')}
                      {infoCell(infoValue(''))}
                    </tr>
                    <tr>
                      {infoLabelCell('Submitted By')}
                      {infoCell(infoValue(''))}
                      {infoLabelCell('Submitted Date')}
                      {infoCell(infoValue(''))}
                    </tr>
                    <tr>
                      {infoLabelCell('Approved By')}
                      {infoCell(infoValue(doc?.approvedBy || ''))}
                      {infoLabelCell('Approved Date')}
                      {infoCell(infoValue(''))}
                    </tr>
                    <tr>
                      {infoLabelCell('Rejected By')}
                      {infoCell(infoValue(''))}
                      {infoLabelCell('Rejected Date')}
                      {infoCell(infoValue(''))}
                    </tr>
                    <tr>
                      {infoLabelCell('Rejection Reason')}
                      <td colSpan={3} className="border border-slate-200 px-2.5 py-2 align-top">
                        <div className="text-[11px] font-semibold text-slate-800 whitespace-pre-wrap">{doc?.rejectionReason || ''}</div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {showAttachmentsPanel && (
                <div className="pw-panel">
                  {panelHeader(<Paperclip className="w-3.5 h-3.5" />, 'Attachments')}
                  {attachments.length === 0 ? (
                    <div className="p-3 text-[11px] text-slate-400">No attachments</div>
                  ) : (
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="bg-slate-100">
                          <th className="py-1.5 px-2 text-[9px] font-bold text-slate-600 uppercase tracking-wide text-center border-b border-slate-200">#</th>
                          <th className="py-1.5 px-2 text-[9px] font-bold text-slate-600 uppercase tracking-wide text-left border-b border-slate-200">File Name</th>
                          <th className="py-1.5 px-2 text-[9px] font-bold text-slate-600 uppercase tracking-wide text-right border-b border-slate-200">File Size</th>
                        </tr>
                      </thead>
                      <tbody>
                        {attachments.map((f, i) => (
                          <tr key={`${f.name}-${i}`} className="border-b border-slate-100">
                            <td className="px-2 py-1.5 text-[10px] text-slate-500 text-center">{i + 1}</td>
                            <td className="px-2 py-1.5 text-[10px] text-slate-700 break-all">{f.name || '–'}</td>
                            <td className="px-2 py-1.5 text-[10px] text-slate-600 text-right whitespace-nowrap">
                              {formatFileSize(f.size) || '–'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>

            {/* ===== Note + Signature (document template elements, no sample data) ===== */}
            <div className="pw-two-col grid grid-cols-1 lg:grid-cols-2 gap-3 mt-6 mb-4 keep-together">
              <div className="pw-panel">
                {panelHeader(<StickyNote className="w-3.5 h-3.5" />, 'Note')}
                <div className="p-3 text-[10px] text-slate-600 leading-relaxed space-y-1">
                  <div>1. This Profit Workout is an internal document for cost estimation and profitability analysis.</div>
                  <div>2. Actual project execution values may vary based on final negotiated terms, market conditions and delivery schedule.</div>
                </div>
              </div>
              <div className="flex items-end justify-end">
                <div className="w-60 text-center">
                  <div className="h-10" />
                  <div className="border-t border-slate-400 pt-1.5">
                    <div className="text-[12px] font-bold text-slate-700">{form?.preparedBy || ''}</div>
                    <div className="text-[10px] font-semibold text-slate-500">Prepared By</div>
                  </div>
                </div>
              </div>
            </div>

            {/* ===== Footer ===== */}
            <div className="pw-footer">
              <div className="border-t border-amber-300 pt-2 flex items-center justify-between text-[9px] text-slate-400">
                <span>Engineering Excellence | Customer Focus | Sustainable Growth</span>
                <span>Your Partner in Engineering Excellence</span>
              </div>
            </div>
          </div>
        </div>

        {/* ===== SIDE PANEL (outside the printable document) ===== */}
        <div className="space-y-4 order-2">
          <div className="bg-surface border border-slate-200 rounded-xl shadow-sm p-5">
            <h3 className="text-[13px] font-bold text-[#0B4A3D] uppercase tracking-wider mb-4">Document</h3>
            <div className="space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-500">Status</span>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-bold ${statusPillCls}`}>
                  {meta.label}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-500">PW Number</span>
                <span className="font-bold text-slate-700">{doc.pwNo || '—'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-500">Date</span>
                <span className="text-slate-700">{formatDate(form?.pwDate || doc.pwDate)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-500">Total Profit</span>
                <span className={`text-sm font-bold ${totals.totalProfit < 0 ? 'text-rose-600' : 'text-[#0B4A3D]'}`}>
                  {money(totals.totalProfit)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-500">Grand Total</span>
                <span className="text-sm font-bold text-[#0B4A3D]">{money(totals.grandTotal)}</span>
              </div>
            </div>
          </div>
          <div className="bg-surface border border-slate-200 rounded-xl shadow-sm p-5 text-[11px] text-slate-500 leading-relaxed">
            <h3 className="text-[13px] font-bold text-[#0B4A3D] uppercase tracking-wider mb-2">Preview</h3>
            {canEdit ? (
              <p>
                Use <span className="font-bold text-slate-700">Edit</span> to modify the Profit Workout from the document.
                Changes are saved through the Profit Workout API and reflected here immediately.
              </p>
            ) : (
              <p>This Profit Workout cannot be edited from the preview ({meta.label} status).</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}