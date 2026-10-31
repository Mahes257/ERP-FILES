import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Archive,
  ArrowLeft,
  Calculator,
  ChevronDown,
  Copy,
  Edit3,
  FileDown,
  History,
  Loader2,
  Mail,
  MessageCircle,
  MoreHorizontal,
  Plus,
  Printer,
  RotateCcw,
  Save,
  Send,
  Trash2,
  X
} from 'lucide-react';
import { ConfirmDialog, EditableMasterDropdown, useToast } from '../../components/Common';
import SalesBreadcrumb from '../../components/SalesTable/SalesBreadcrumb';
import useClickOutside from '../../hooks/useClickOutside';
import costWorkoutService from '../../services/costWorkoutService';
import leadService from '../../services/leadService';
import StatusBadge from '../../components/Common/StatusBadge';
import {
  buildCwLink,
  calcCwTotals,
  customerPatchFromSource,
  cwStatusMeta,
  cwToForm,
  emailCw,
  isLeadTimeCategory,
  normalizeCw,
  serializeCw
} from '../../utils/costWorkoutHelpers';
import { CPR_HUB_TABS } from '../../utils/navigationHelpers';
import '../crm/crm-erp.css';
import { formatDate, formatINR } from '../../utils/leadHelpers';
import { PENDING_APPROVAL_REFRESH_EVENT } from '../../utils/pendingApproval';
import { captureSheetToPdf } from '../../utils/quotationPrintUtils';
import Letterhead from '../../components/SalesDesign/Letterhead';
import './cost-workout-design-print.css';

function parsePageList(response) {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.data)) return response.data;
  if (Array.isArray(response?.data?.content)) return response.data.content;
  if (Array.isArray(response?.content)) return response.content;
  return [];
}

let itemIdCounter = 100;
let catIdCounter = 1000;

function newItem(description = '', categories = null) {
  itemIdCounter += 1;
  return {
    key: itemIdCounter,
    description,
    qty: 1,
    unit: 'Nos',
    categories: categories || [{ key: (catIdCounter += 1), category: 'Material Cost', qty: 1, unit: 'Nos', rate: 0, notes: '' }]
  };
}

function newCategoryRow(category = 'Material Cost') {
  catIdCounter += 1;
  return { key: catIdCounter, category, qty: 1, unit: 'Nos', rate: 0, notes: '' };
}

// Item-table headers, in render order. Declared once so the header row, the
// column group and the empty-state colSpan can never drift apart.
const CW_ITEM_HEADERS = [
  { label: '#', align: 'center' },
  { label: 'Item Description', align: 'left' },
  { label: 'CPR Description', align: 'left' },
  { label: 'Qty', align: 'left' },
  { label: 'Unit', align: 'left' },
  { label: 'Category', align: 'left' },
  { label: 'Rate', align: 'right' },
  { label: 'Amount', align: 'right' },
  { label: 'Remarks', align: 'left' }
];

const INPUT_CLS =
  'w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-[#0B4A3D] placeholder:text-slate-400';

// Strip w-full so the fixed numeric widths (w-16/w-20) actually apply — Tailwind
// emits .w-full AFTER the numeric width utilities, so it would otherwise win.
const INPUT_NUM = INPUT_CLS.replace(/\bw-full\s*/, '');

function CwStatusBadge({ status }) {
  return <StatusBadge status={status} />;
}

export default function CostWorkoutDesign() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const id = searchParams.get('id') || '';
  const printParam = searchParams.get('print') === '1';
  const pdfParam = searchParams.get('pdf') === '1';
  const toast = useToast();

  const [doc, setDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null);

  // The generated CW number is the record's internal identity only (routes,
  // update/archive/delete calls and the revision chain all keep using it); the
  // document itself shows no document number. Nothing else is substituted for
  // it — a Cost Workout is identified by its customer and date.
  const [items, setItems] = useState([]);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [leadSources, setLeadSources] = useState([]);
  const [clientSources, setClientSources] = useState([]);

  // Top-level dropdown state (Email/WhatsApp + More) for the toolbar.
  const [menu, setMenu] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  const barRef = useRef(null);
  useClickOutside(barRef, () => setMenu(null), menu !== null);

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

  // Auto-download PDF (?pdf=1 — triggered from Documents page download):
  // export the full A4 sheet once loaded, once per visit.
  const autoPdfRef = useRef(false);
  useEffect(() => {
    if (!pdfParam || autoPdfRef.current || loading || !doc?.id || !sheetRef.current) return undefined;
    autoPdfRef.current = true;
    const t = setTimeout(() => doDownloadPdf(), 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfParam, loading, doc?.id]);

  // Lead/Client source combobox state (same mechanism as the CW create/edit form).
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
      return {
        key: itemIdCounter,
        description: it.description || '',
        // Brief CPR description — displayed alongside (never instead of) the
        // full description.
        cprDescription: it.cprDescription || '',
        // Item-scoped documents, carried through this page's saves so opening the
        // preview and saving never drops an item's files.
        attachments: Array.isArray(it.attachments) ? it.attachments : [],
        qty: it.qty ?? 1,
        unit: it.unit || 'Nos',
        categories: (Array.isArray(it.categories) ? it.categories : []).map((c) => ({
          key: (catIdCounter += 1),
          category: c.category || 'Material Cost',
          qty: c.qty ?? 1,
          unit: c.unit || 'Nos',
          rate: c.rate ?? 0,
          notes: c.notes || ''
        }))
      };
    });

  const applyDoc = (raw) => {
    statusRef.current = raw.status || 'draft';
    setDoc(raw);
    setForm(cwToForm(raw));
    setItems(mapItems(raw.items));
    if (raw.sourceLead) {
      setSourceSelected({ type: 'client', id: null, label: raw.sourceLead });
    } else {
      setSourceSelected(null);
    }
    setSourceQuery('');
    setSourceOpen(false);
  };

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return undefined;
    }
    let cancelled = false;
    redirectingRef.current = false;
    costWorkoutService
      .getCw(id)
      .then(async (res) => {
        if (cancelled) return;
        const raw = normalizeCw(res?.data ?? res);
        if (!raw?.id) return;
        // If the URL points at an older revision row (e.g. a stale link), follow
        // the chain to the latest editable revision instead of failing later.
        if (raw.latestRevision === false && Array.isArray(raw.revisions)) {
          const latest = raw.revisions.find((rev) => rev.latestRevision === true);
          if (latest?.id && String(latest.id) !== String(raw.id)) {
            redirectingRef.current = true;
            navigate(`/cost-workouts/design?id=${latest.id}`, { replace: true });
            return;
          }
        }
        applyDoc(raw);
        try {
          const attRes = await costWorkoutService.getAttachments(id);
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

  // Matches the existing ERP-React backend update() rule: only deleted Cost
  // Workouts cannot be edited (the standard edit page applies no status
  // restriction, so the preview mirrors that behaviour).
  const canEdit = String(doc?.status || '').toLowerCase() !== 'deleted';

  const toggleEdit = () => {
    if (!editMode) ensureSources();
    setEditMode((e) => !e);
  };

  // ---- Lead/Client autofill (existing CW behaviour) ----
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

  // ---- Item grid (same handlers as the CW create/edit form) ----
  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const updateItem = (itemKey, patch) => {
    setItems((prev) => prev.map((item) => (item.key === itemKey ? { ...item, ...patch } : item)));
  };

  const updateCategory = (itemKey, catKey, patch) => {
    setItems((prev) =>
      prev.map((item) =>
        item.key === itemKey
          ? { ...item, categories: item.categories.map((cat) => (cat.key === catKey ? { ...cat, ...patch } : cat)) }
          : item
      )
    );
  };

  const addItem = () => setItems((prev) => [...prev, newItem()]);

  const removeItem = (itemKey) => {
    if (items.length <= 1) {
      toast.warning('At least one item is required');
      return;
    }
    setItems((prev) => prev.filter((item) => item.key !== itemKey));
  };

  const addCategory = (itemKey) => {
    setItems((prev) =>
      prev.map((item) => (item.key === itemKey ? { ...item, categories: [...item.categories, newCategoryRow()] } : item))
    );
  };

  const removeCategory = (itemKey, catKey) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.key !== itemKey) return item;
        const categories = item.categories.filter((cat) => cat.key !== catKey);
        return { ...item, categories: categories.length === 0 ? [newCategoryRow()] : categories };
      })
    );
  };

  const handleCategoryDeleted = (name) => {
    if (!name) return;
    setItems((prev) =>
      prev.map((item) => ({
        ...item,
        categories: item.categories.map((cat) =>
          cat.category === name ? { ...cat, category: 'Material Cost', unit: 'Nos' } : cat
        )
      }))
    );
  };

  const handleCategoryChange = (itemKey, catKey, value) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.key !== itemKey) return item;
        return {
          ...item,
          categories: item.categories.map((cat) => {
            if (cat.key !== catKey) return cat;
            const oldCat = cat.category;
            const patch = { category: value };
            if (isLeadTimeCategory(value) && !isLeadTimeCategory(oldCat)) {
              patch.unit = 'Days';
              patch.rate = 0;
            }
            if (!isLeadTimeCategory(value) && isLeadTimeCategory(oldCat)) {
              patch.unit = 'Nos';
            }
            return { ...cat, ...patch };
          })
        };
      })
    );
  };

  const totals = useMemo(
    () => calcCwTotals(items, form?.profitPct, form?.discountPct, form?.gstPct),
    [items, form?.profitPct, form?.discountPct, form?.gstPct]
  );

  const totalQty = items.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);

  // ---- Save through the EXISTING update API (never a parallel editor) ----
  const handleSave = async () => {
    if (!doc || saving) return;
    setSaving(true);
    try {
      const payload = serializeCw({ ...form, status: statusRef.current || form.status }, items);
      const res = await costWorkoutService.updateCw(doc.id, payload);
      const data = res?.data ?? res ?? {};
      applyDoc(normalizeCw(data));
      // The ERP-React backend persists edits as a new revision row (BASE(N)) and
      // returns the NEW revision id. Keep the URL on that id so a browser
      // refresh / re-open always targets the latest editable revision.
      if (data.id && String(data.id) !== String(doc.id)) {
        navigate(`/cost-workouts/design?id=${data.id}`, { replace: true });
      }
      toast.success('Cost Workout saved');
    } catch (err) {
      toast.error(err?.message || 'Failed to save Cost Workout');
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
      window.print();
    });
  };

  const doDownloadPdf = async () => {
    if (!sheetRef.current) return;
    setSaving(true);
    try {
      await withCleanSheet(async () => {
        await captureSheetToPdf(sheetRef.current, {
          filename: `CostWorkout-${new Date().toISOString().slice(0, 10)}`
        });
      });
      toast.success('PDF downloaded');
    } catch {
      toast.error('PDF export failed');
    } finally {
      setSaving(false);
    }
  };

  const reloadDoc = async () => {
    const res = await costWorkoutService.getCw(doc.id);
    applyDoc(normalizeCw(res?.data ?? res));
  };

  // Communication actions operate on the CURRENT Cost Workout document —
  // its real reference, customer, data and the current saved version.
  const handleEmail = () => {
    const res = emailCw(doc);
    if (!res.ok) toast.error(res.error || 'Failed to open email client');
  };

  const handleWhatsApp = () => {
    if (!doc) return;
    const text = `Cost Workout from VISHAK TECH\nCustomer: ${doc.customerName || '-'}\nView: ${buildCwLink(doc)}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  // More menu — only actions that already exist in the Cost Workout module.
  const moreMenu = (() => {
    const s = String(doc?.status || '').toLowerCase();
    const historical = doc?.latestRevision === false;
    const items = [
      {
        key: 'duplicate',
        label: 'Duplicate',
        icon: Copy,
        disabled: s === 'deleted' || historical,
        onClick: () => runMoreAction('duplicate')
      },
      {
        key: 'history',
        label: 'Activity / History',
        icon: History,
        disabled: false,
        onClick: () => navigate(`/cost-workouts/${doc.id}`)
      }
    ];
    if (!historical && s === 'archived') {
      items.push({ key: 'restore', label: 'Restore', icon: RotateCcw, disabled: false, onClick: () => setConfirm({ type: 'restore' }) });
    } else if (!historical && s !== 'deleted') {
      items.push({ key: 'archive', label: 'Archive', icon: Archive, disabled: false, onClick: () => setConfirm({ type: 'archive' }) });
      items.push({ key: 'delete', label: 'Delete', icon: Trash2, danger: true, disabled: false, onClick: () => setConfirm({ type: 'delete' }) });
    }
    return items;
  })();

  const runMoreAction = async (type) => {
    setBusy(true);
    try {
      if (type === 'duplicate') {
        await costWorkoutService.duplicateCw(doc.id);
        toast.success('Cost Workout duplicated');
        await reloadDoc();
      } else if (type === 'archive') {
        await costWorkoutService.archiveCw(doc.id);
        toast.success('Cost Workout archived');
        await reloadDoc();
      } else if (type === 'restore') {
        await costWorkoutService.restoreCw(doc.id);
        toast.success('Cost Workout restored');
        await reloadDoc();
      } else if (type === 'delete') {
        await costWorkoutService.deleteCw(doc.id);
        toast.success('Cost Workout moved to trash');
        await reloadDoc();
      }
    } catch (err) {
      toast.error(err?.message || 'Operation failed');
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  const confirmConfigs = {
    archive: { title: 'Archive Cost Workout', message: 'Archive this Cost Workout?', confirmLabel: 'Archive', variant: 'warning', icon: Archive },
    restore: { title: 'Restore Cost Workout', message: 'Restore this Cost Workout to active?', confirmLabel: 'Restore', variant: 'default', icon: RotateCcw },
    delete: { title: 'Delete Cost Workout', message: 'Move this Cost Workout to trash?', confirmLabel: 'Delete', variant: 'danger', icon: Trash2 }
  };

  const meta = cwStatusMeta(doc?.status);
  const money = (v) => formatINR(v);

  // Submit for Approval: only while the current revision is eligible.
  // Mirrors CostWorkoutService.submit — not from submitted/approved/archived/deleted.
  const statusKey = String(doc?.status || '').toLowerCase();
  const canSubmit = !['submitted', 'approved', 'archived', 'deleted'].includes(statusKey);
  const handleSubmitForApproval = async () => {
    if (!doc || submitting || !canSubmit) return;
    setSubmitting(true);
    try {
      const res = await costWorkoutService.submitCw(doc.id);
      const data = res?.data ?? res ?? {};
      applyDoc(normalizeCw(data));
      window.dispatchEvent(new Event(PENDING_APPROVAL_REFRESH_EVENT));
      toast.success('Cost Workout submitted for approval');
    } catch (err) {
      toast.error(err?.message || 'Failed to submit for approval');
    } finally {
      setSubmitting(false);
    }
  };

  const itemRows = [];
  (items || []).forEach((item) => {
    const cats = Array.isArray(item.categories) ? item.categories : [];
    cats.forEach((cat, index) => {
      const leadTime = isLeadTimeCategory(cat.category);
      const amount = leadTime ? 0 : (Number(cat.qty) || 0) * (Number(cat.rate) || 0);
      itemRows.push({ item, cat, leadTime, amount, first: index === 0, count: cats.length });
    });
  });

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
        <h3 className="text-base font-bold text-slate-700 mb-1.5">Cost Workout not found</h3>
        <p className="text-xs text-slate-400 mb-5">Select a Cost Workout from the list and open Preview.</p>
        <button
          type="button"
          onClick={() => navigate(CPR_HUB_TABS['cost-workout'])}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-[#0B4A3D] hover:bg-[#083D34] px-4 py-2 rounded-lg transition-colors cursor-pointer"
        >
          Back to Cost Workouts
        </button>
      </div>
    );
  }

  const label = (text) => (
    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">{text}</label>
  );

  const sectionTitle = (text) => (
    <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">{text}</div>
  );

  return (
    <div className="flex-1 bg-app font-sans antialiased text-slate-800 p-4 sm:p-6 w-full max-w-[100vw] overflow-x-hidden">
      {/* ===== BREADCRUMB ===== */}
      <SalesBreadcrumb
        items={[
          { label: 'CPR', to: '/cprs' },
          { label: 'Cost Workout', to: CPR_HUB_TABS['cost-workout'] },
          { label: 'Cost Workout Preview' }
        ]}
      />

      {/* ===== HEADER ===== */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
        <div>
          <h1 className="flex items-center gap-2.5 text-2xl font-bold text-slate-900 tracking-tight">
            <FileDown className="w-6 h-6 text-[#0B4A3D]" />
            Cost Workout Preview
          </h1>
          <p className="text-xs text-slate-400 mt-1">Preview, edit, print and share the Cost Workout document</p>
        </div>
        {doc && (
          <div className="flex items-center gap-2.5">
            <CwStatusBadge status={doc.status} />
          </div>
        )}
      </div>

      {/* ===== TOOLBAR ===== */}
      <div ref={barRef} className="flex items-center gap-2 flex-wrap mb-4 bg-surface border border-slate-200 rounded-xl shadow-sm px-3 py-2.5">
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
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-1.5 text-xs font-bold px-3.5 h-9 rounded-lg transition-colors cursor-pointer text-white bg-[#0B4A3D] hover:bg-[#083D34] disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {saving ? 'Saving...' : 'Save'}
          </button>
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

        {/* Email / WhatsApp */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenu(menu === 'email' ? null : 'email')}
            aria-haspopup="menu"
            aria-expanded={menu === 'email'}
            className="inline-flex items-center gap-1.5 text-xs font-bold px-3.5 h-9 rounded-lg transition-colors cursor-pointer text-slate-600 bg-surface border border-slate-200 hover:bg-slate-50"
          >
            <Mail className="w-3.5 h-3.5" /> Email / WhatsApp <ChevronDown className="w-3 h-3" />
          </button>
          {menu === 'email' && (
            <div
              role="menu"
              aria-label="Email or WhatsApp"
              className="absolute left-0 top-full mt-1 w-52 bg-white border border-slate-200 rounded-lg shadow-lg z-50 py-1"
            >
              <button
                type="button"
                onClick={() => {
                  handleEmail();
                  setMenu(null);
                }}
                className="w-full text-left px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer flex items-center gap-2"
              >
                <Mail className="w-3.5 h-3.5 text-[#0B4A3D]" /> Email
              </button>
              <button
                type="button"
                onClick={() => {
                  handleWhatsApp();
                  setMenu(null);
                }}
                className="w-full text-left px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer flex items-center gap-2"
              >
                <MessageCircle className="w-3.5 h-3.5 text-[#25D366]" /> WhatsApp
              </button>
            </div>
          )}
        </div>

        {/* More */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenu(menu === 'more' ? null : 'more')}
            aria-haspopup="menu"
            aria-expanded={menu === 'more'}
            className="inline-flex items-center gap-1.5 text-xs font-bold px-3.5 h-9 rounded-lg transition-colors cursor-pointer text-slate-600 bg-surface border border-slate-200 hover:bg-slate-50"
          >
            <MoreHorizontal className="w-3.5 h-3.5" /> More <ChevronDown className="w-3 h-3" />
          </button>
          {menu === 'more' && (
            <div
              role="menu"
              aria-label="More actions"
              className="absolute right-0 top-full mt-1 w-60 bg-white border border-slate-200 rounded-lg shadow-lg z-50 py-1 max-h-96 overflow-y-auto"
            >
              {moreMenu.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  disabled={item.disabled}
                  onClick={() => {
                    setMenu(null);
                    item.onClick();
                  }}
                  className={`w-full text-left px-3 py-2 text-xs font-semibold flex items-center gap-2 transition-colors ${
                    item.danger ? 'text-rose-600 hover:bg-rose-50' : 'text-slate-600 hover:bg-slate-50'
                  } disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent cursor-pointer`}
                >
                  <item.icon className="w-3.5 h-3.5 shrink-0" /> {item.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => navigate(CPR_HUB_TABS['cost-workout'])}
          className="inline-flex items-center gap-1.5 text-xs font-bold px-3.5 h-9 rounded-lg transition-colors cursor-pointer text-slate-600 bg-surface border border-slate-200 hover:bg-slate-50 ml-auto"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to List
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-5 items-start">
        {/* ===== A4 COST WORKOUT DOCUMENT ===== */}
        <div className="order-1 bg-slate-100/80 border border-slate-200 rounded-xl shadow-sm px-4 sm:px-6 py-4">
          <div
            id="cw-sheet"
            ref={sheetRef}
            className="bg-white shadow-[0_8px_30px_rgba(15,23,42,0.14)] rounded-sm mx-auto p-5 sm:p-7"
            style={{ width: '210mm', minHeight: '297mm', maxWidth: '100%' }}
          >
            {/* ===== Document header ===== */}
           <Letterhead className="mb-3" />
           <div className="flex items-start justify-between gap-4 pb-4 mb-4 border-b-2 border-[#0B4A3D]">
             <div />
              <div className="text-right shrink-0">
                <div className="flex items-center justify-end gap-2">
                  <span className="text-base font-extrabold text-slate-800 tracking-wide">COST WORKOUT</span>
                  <CwStatusBadge status={doc.status} />
                </div>
                <div className="mt-1.5 space-y-0.5 text-[11px] text-slate-500">
                  <div>
                    <span className="font-bold text-slate-600">Date:</span> {formatDate(form?.cwDate || doc.cwDate)}
                  </div>
                </div>
              </div>
            </div>

            {/* ===== Customer + General information ===== */}
            <div className="grid grid-cols-2 gap-4 mb-3">
              <div className="rounded-md border border-slate-200 p-3">
                {sectionTitle('Customer Information')}
                <div className="mb-2">
                  {label('Lead / Client')}
                  {editMode ? (
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
                    <div className="text-xs text-slate-700 leading-relaxed">{form?.sourceLead || '—'}</div>
                  )}
                </div>
                <div>
                  {label('Shipping Address')}
                  {editMode ? (
                    <textarea
                      rows={2}
                      value={form?.shippingAddress || ''}
                      onChange={(e) => setField('shippingAddress', e.target.value)}
                      placeholder="Shipping address"
                      className={INPUT_CLS}
                    />
                  ) : (
                    <div className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap">
                      {form?.shippingAddress || '—'}
                    </div>
                  )}
                </div>
              </div>
              <div className="rounded-md border border-slate-200 p-3">
                {sectionTitle('General Information')}
                <div className="mb-2">
                  {label('Prepared By')}
                  {editMode ? (
                    <EditableMasterDropdown
                      masterKey="pr_requested_by"
                      value={form?.preparedBy || ''}
                      onChange={(v) => setField('preparedBy', v)}
                      placeholder="Select Preparer"
                      inputClassName={`${INPUT_CLS} cursor-text`}
                    />
                  ) : (
                    <div className="text-xs text-slate-700">{form?.preparedBy || '—'}</div>
                  )}
                </div>
                <div className="mb-2">
                  {label('Contact Person')}
                  {editMode ? (
                    <input
                      type="text"
                      value={form?.contactPerson || ''}
                      onChange={(e) => setField('contactPerson', e.target.value)}
                      placeholder="Contact person name"
                      className={INPUT_CLS}
                    />
                  ) : (
                    <div className="text-xs text-slate-700">{form?.contactPerson || '—'}</div>
                  )}
                </div>
                <div className="mb-2">
                  {label('Department')}
                  {editMode ? (
                    <EditableMasterDropdown
                      masterKey="cw_departments"
                      value={form?.department || ''}
                      onChange={(v) => setField('department', v)}
                      placeholder="Select Department"
                      inputClassName={`${INPUT_CLS} cursor-text`}
                    />
                  ) : (
                    <div className="text-xs text-slate-700">{form?.department || '—'}</div>
                  )}
                </div>
              </div>
            </div>

            {/* ===== Cost items table ===== */}
            <div className="mb-4">
              {editMode && (
                <div className="flex items-center gap-2 mb-1.5">
                  <button
                    type="button"
                    onClick={addItem}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-white bg-[#0B4A3D] hover:bg-[#083D34] px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Item
                  </button>
                </div>
              )}
              <div className={editMode ? 'overflow-x-auto' : undefined}>
                <table
                  className="w-full border-collapse cw-items-table"
                  style={editMode ? { minWidth: 1000 } : undefined}
                >
                  <colgroup>
                    <col className="cw-col-no" />
                    <col className="cw-col-desc" />
                    <col className="cw-col-cpr-desc" />
                    <col className="cw-col-qty" />
                    <col className="cw-col-unit" />
                    <col className="cw-col-cat" />
                    <col className="cw-col-rate" />
                    <col className="cw-col-amount" />
                    <col className="cw-col-remarks" />
                  </colgroup>
                  <thead>
                    <tr className="bg-[#0B4A3D]">
                      {CW_ITEM_HEADERS.map(({ label, align }) => (
                        <th
                          key={label}
                          className={`py-2 px-1.5 text-[9px] font-bold text-white uppercase tracking-wide whitespace-nowrap ${
                            align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
                          }`}
                        >
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {itemRows.length === 0 && (
                      <tr>
                        <td colSpan={CW_ITEM_HEADERS.length} className="py-8 text-center text-xs text-slate-400">
                          No items
                        </td>
                      </tr>
                    )}
                    {items.map((item) => {
                      const cats = item.categories || [];
                      const itemTotal = cats.reduce(
                        (sum, c) => sum + (isLeadTimeCategory(c.category) ? 0 : (Number(c.qty) || 0) * (Number(c.rate) || 0)),
                        0
                      );
                      return (
                        <FragmentRow
                          key={item.key}
                          item={item}
                          cats={cats}
                          editMode={editMode}
                          money={money}
                          updateItem={updateItem}
                          updateCategory={updateCategory}
                          handleCategoryChange={handleCategoryChange}
                          handleCategoryDeleted={handleCategoryDeleted}
                          removeItem={removeItem}
                          addCategory={addCategory}
                          removeCategory={removeCategory}
                          itemTotal={itemTotal}
                        />
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ===== Cost breakdown & pricing ===== */}
            <div className="flex justify-end mb-4 keep-together">
              <table className="w-72">
                <tbody>
                  <tr className="border-b border-slate-100">
                    <td className="py-1.5 px-2 text-[10px] text-slate-500">Sub Total</td>
                    <td className="py-1.5 px-2 text-[10px] font-semibold text-slate-700 text-right">{money(totals.subtotal)}</td>
                  </tr>
                  <tr className="border-b border-slate-100">
                    <td className="py-1.5 px-2 text-[10px] text-slate-500">Profit %</td>
                    <td className="py-1.5 px-2 text-right">
                      {editMode ? (
                        <input
                          type="number"
                          min="0"
                          step="0.1"
                          value={form?.profitPct ?? 0}
                          onChange={(e) => setField('profitPct', e.target.value)}
                          className={`${INPUT_NUM} text-right w-16 inline-block`}
                        />
                      ) : (
                        <span className="text-[10px] font-semibold text-slate-700">{totals.profitPct}%</span>
                      )}
                    </td>
                  </tr>
                  <tr className="border-b border-slate-100">
                    <td className="py-1.5 px-2 text-[10px] text-slate-500">Profit Amount</td>
                    <td className="py-1.5 px-2 text-[10px] font-semibold text-slate-700 text-right">{money(totals.profitAmt)}</td>
                  </tr>
                  <tr className="border-b border-slate-100">
                    <td className="py-1.5 px-2 text-[10px] text-slate-500">Selling Price</td>
                    <td className="py-1.5 px-2 text-[10px] font-semibold text-slate-700 text-right">{money(totals.sellingPrice)}</td>
                  </tr>
                  <tr className="border-b border-slate-100">
                    <td className="py-1.5 px-2 text-[10px] text-slate-500">Discount %</td>
                    <td className="py-1.5 px-2 text-right">
                      {editMode ? (
                        <input
                          type="number"
                          min="0"
                          step="0.1"
                          value={form?.discountPct ?? 0}
                          onChange={(e) => setField('discountPct', e.target.value)}
                          className={`${INPUT_NUM} text-right w-16 inline-block`}
                        />
                      ) : (
                        <span className="text-[10px] font-semibold text-slate-700">{totals.discountPct}%</span>
                      )}
                    </td>
                  </tr>
                  <tr className="border-b border-slate-100">
                    <td className="py-1.5 px-2 text-[10px] text-slate-500">Discount Amount</td>
                    <td className="py-1.5 px-2 text-[10px] font-semibold text-slate-700 text-right">− {money(totals.discountAmt)}</td>
                  </tr>
                  <tr className="border-b border-slate-100">
                    <td className="py-1.5 px-2 text-[10px] text-slate-500">GST %</td>
                    <td className="py-1.5 px-2 text-right">
                      {editMode ? (
                        <input
                          type="number"
                          min="0"
                          step="0.1"
                          value={form?.gstPct ?? 18}
                          onChange={(e) => setField('gstPct', e.target.value)}
                          className={`${INPUT_NUM} text-right w-16 inline-block`}
                        />
                      ) : (
                        <span className="text-[10px] font-semibold text-slate-700">{totals.gstPct}%</span>
                      )}
                    </td>
                  </tr>
                  <tr className="border-b border-slate-100">
                    <td className="py-1.5 px-2 text-[10px] text-slate-500">GST Amount</td>
                    <td className="py-1.5 px-2 text-[10px] font-semibold text-slate-700 text-right">{money(totals.gstAmt)}</td>
                  </tr>
                  <tr className="border-b border-slate-100">
                    <td className="py-1.5 px-2 text-[10px] text-slate-500">Total Quantity</td>
                    <td className="py-1.5 px-2 text-[10px] font-semibold text-slate-700 text-right">{totalQty}</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-2 text-[11px] font-bold text-slate-800">Grand Total</td>
                    <td className="py-2 px-2 text-[12px] font-extrabold text-[#0B4A3D] text-right">{money(totals.grandTotal)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* ===== Remarks ===== */}
            {(form?.remarks || editMode) && (
              <div className="mb-4">
                {sectionTitle('Remarks')}
                {editMode ? (
                  <textarea
                    rows={3}
                    value={form?.remarks || ''}
                    onChange={(e) => setField('remarks', e.target.value)}
                    placeholder="Additional notes or remarks..."
                    className={INPUT_CLS}
                  />
                ) : (
                  <div className="text-[11px] text-slate-600 whitespace-pre-wrap leading-relaxed">{form?.remarks}</div>
                )}
              </div>
            )}

            {/* ===== Signature ===== */}
            <div className="flex justify-end mt-6 mb-4 keep-together">
              <div className="w-56 text-center">
                <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Company Seal</div>
                <div className="h-10" />
                <div className="border-t border-slate-300 pt-1.5">
                  <div className="text-[10px] font-bold text-slate-500">Authorized Signatory</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ===== SIDE PANEL ===== */}
        <div className="space-y-4 order-2">
          <div className="bg-surface border border-slate-200 rounded-xl shadow-sm p-5">
            <h3 className="text-[13px] font-bold text-[#0B4A3D] uppercase tracking-wider mb-4">Document</h3>
            <div className="space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-500">Status</span>
                <CwStatusBadge status={doc.status} />
              </div>
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-500">Date</span>
                <span className="text-slate-700">{formatDate(form?.cwDate || doc.cwDate)}</span>
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
                Use <span className="font-bold text-slate-700">Edit</span> to modify the Cost Workout from the document.
                Changes are saved through the Cost Workout API and reflected here immediately.
              </p>
            ) : (
              <p>This Cost Workout cannot be edited from the preview ({meta.label} status).</p>
            )}
          </div>
        </div>
      </div>

      {/* ===== CONFIRM ===== */}
      {confirm && (
        <ConfirmDialog
          open
          title={confirmConfigs[confirm.type].title}
          message={confirmConfigs[confirm.type].message}
          confirmLabel={confirmConfigs[confirm.type].confirmLabel}
          variant={confirmConfigs[confirm.type].variant}
          icon={confirmConfigs[confirm.type].icon}
          loading={busy}
          onConfirm={() => runMoreAction(confirm.type)}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}

// ===== Item group row renderer (item-level cells rowSpan + category rows) =====
function FragmentRow({
  item,
  cats,
  editMode,
  money,
  updateItem,
  updateCategory,
  handleCategoryChange,
  handleCategoryDeleted,
  removeItem,
  addCategory,
  removeCategory,
  itemTotal
}) {
  return (
    <>
      {cats.map((cat, catIndex) => {
        const isLeadTime = isLeadTimeCategory(cat.category);
        return (
          <tr key={cat.key} className="border-b border-slate-100 align-top">
            {catIndex === 0 && (
              <>
                <td className="px-1.5 py-2 text-[10px] text-slate-500 text-center align-middle" rowSpan={cats.length}>
                  {item.key - 100}
                </td>
                <td className="px-1.5 py-2 align-middle" rowSpan={cats.length}>
                  {editMode ? (
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        value={item.description}
                        onChange={(e) => updateItem(item.key, { description: e.target.value })}
                        placeholder="Enter description"
                        className="flex-1 min-w-0 bg-slate-50 border border-slate-200 rounded px-2 py-1.5 text-xs outline-none focus:border-[#0B4A3D]"
                      />
                      <button
                        type="button"
                        onClick={() => removeItem(item.key)}
                        aria-label="Delete item"
                        title="Delete item"
                        className="p-1 text-slate-300 hover:text-rose-500 transition-colors cursor-pointer shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <span className="text-[10px] font-semibold text-slate-700">{item.description || '—'}</span>
                  )}
                </td>
                <td className="px-1.5 py-2 align-middle" rowSpan={cats.length}>
                  {editMode ? (
                    <input
                      type="text"
                      value={item.cprDescription || ''}
                      onChange={(e) => updateItem(item.key, { cprDescription: e.target.value })}
                      placeholder="Short CPR description"
                      className="w-full min-w-0 bg-slate-50 border border-slate-200 rounded px-2 py-1.5 text-xs outline-none focus:border-[#0B4A3D]"
                    />
                  ) : (
                    <span className="text-[10px] text-slate-600">{item.cprDescription || '—'}</span>
                  )}
                </td>
                <td className="px-1.5 py-2 align-middle" rowSpan={cats.length}>
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
                    <span className="text-[10px] text-slate-600 whitespace-nowrap">
                      {item.qty ?? 1} {item.unit ? ` ${item.unit}` : ''}
                    </span>
                  )}
                </td>
              </>
            )}
            <td className="px-1.5 py-2">
              {editMode ? (
                <div className="flex items-center gap-1">
                  <EditableMasterDropdown
                    masterKey="cw_categories"
                    value={cat.category}
                    onChange={(v) => handleCategoryChange(item.key, cat.key, v)}
                    onDeleted={handleCategoryDeleted}
                    placeholder="Select category"
                    portal
                    inputClassName="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1.5 text-xs outline-none cursor-text focus:border-[#0B4A3D]"
                  />
                  {cats.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeCategory(item.key, cat.key)}
                      aria-label="Remove category row"
                      title="Remove category"
                      className="p-1 text-slate-300 hover:text-rose-500 transition-colors cursor-pointer shrink-0"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ) : (
                <span className="text-[10px] text-slate-600">{cat.category || '—'}</span>
              )}
            </td>
            <td className="px-1.5 py-2">
              {editMode ? (
                <EditableMasterDropdown
                  masterKey="cw_units"
                  value={cat.unit}
                  onChange={(u) => updateCategory(item.key, cat.key, { unit: u })}
                  placeholder="Select unit..."
                  portal
                  inputClassName="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1.5 pr-6 text-xs outline-none cursor-text focus:border-[#0B4A3D]"
                />
              ) : (
                <span className="text-[10px] text-slate-600">{cat.unit || '—'}</span>
              )}
            </td>
            <td className="px-1.5 py-2">
              {editMode ? (
                isLeadTime ? (
                  <span className="text-[10px] text-slate-300 text-center block">—</span>
                ) : (
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={cat.rate}
                    onChange={(e) => updateCategory(item.key, cat.key, { rate: e.target.value })}
                    placeholder="0.00"
                    className={`${INPUT_NUM} text-right w-20`}
                  />
                )
              ) : (
                <span className="text-[10px] text-slate-600 text-right block whitespace-nowrap">{money(cat.rate)}</span>
              )}
            </td>
            <td className="px-1.5 py-2 text-[10px] font-semibold text-slate-700 text-right whitespace-nowrap">
              {money(isLeadTime ? 0 : (Number(cat.qty) || 0) * (Number(cat.rate) || 0))}
            </td>
            <td className="px-1.5 py-2">
              {editMode ? (
                <input
                  type="text"
                  value={cat.notes}
                  onChange={(e) => updateCategory(item.key, cat.key, { notes: e.target.value })}
                  placeholder="Notes"
                  className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1.5 text-xs outline-none focus:border-[#0B4A3D]"
                />
              ) : (
                <span className="text-[10px] text-slate-500">{cat.notes || '—'}</span>
              )}
            </td>
          </tr>
        );
      })}
      <tr className="border-b border-slate-200">
        <td colSpan={8} className="px-1.5 py-1.5 text-right">
          {editMode && (
            <button
              type="button"
              onClick={() => addCategory(item.key)}
              className="inline-flex items-center gap-1 text-[11px] font-bold text-[#0B4A3D] hover:underline cursor-pointer ml-3"
            >
              <Plus className="w-3 h-3" /> Add Category
            </button>
          )}
          <span className="ml-4 text-xs font-semibold text-slate-700">
            Item Total: <span className="font-bold text-slate-900">₹{itemTotal.toFixed(2)}</span>
          </span>
        </td>
      </tr>
    </>
  );
}
