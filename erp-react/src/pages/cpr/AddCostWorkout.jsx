import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  Calculator,
  ChevronLeft,
  ClipboardList,
  CloudUpload,
  Download,
  FileImage,
  FileSignature,
  FileSpreadsheet,
  FileText,
  Layers,
  Loader2,
  Paperclip,
  Plus,
  Trash2,
  User,
  UserPlus,
  X,
} from 'lucide-react';
import { ConfirmDialog, CreationActionBar, EditableMasterDropdown, Modal, useToast } from '../../components/Common';
import useBulkPrefill from '../../hooks/useBulkPrefill';
import CwSidebar from '../../components/CostWorkout/CwSidebar';
import useClickOutside from '../../hooks/useClickOutside';
import costWorkoutService from '../../services/costWorkoutService';
import { getAttachmentSelectionError, MAX_ATTACHMENT_SIZE_LABEL } from '../../utils/attachmentStorage';
import leadService from '../../services/leadService';
import cprService from '../../services/cprService';
import { normalizeCpr } from '../../utils/cprHelpers';
import { normalizeCw, serializeCw, cwToForm, calcCwTotals, isLeadTimeCategory, customerPatchFromSource, defaultCwItemColumns, normalizeCwItemColumns } from '../../utils/costWorkoutHelpers';
// CPR → Cost Workout header mapping (used by the `?cpr=<id>` conversion prefill
// below). The CPR's own material rows are deliberately NOT imported: they stay
// in the CPR, and this form opens on its own blank item row.
import { cprConversionRemarks } from '../../utils/cprToCostWorkout';
import { getStoredUser } from '../../services/tokenStorage';
import useManagedGrid from '../../hooks/useManagedGrid';
import { ManageColumnsButton } from '../../components/GridColumns/useColumnManager';
import { CW_FORM_STATUSES, CW_SYSTEM_CATEGORIES } from '../../utils/costWorkoutConstants';
import { formatINR, formatLeadNo, todayISO } from '../../utils/leadHelpers';
import { CPR_HUB_TABS } from '../../utils/navigationHelpers';

const WORKFLOW_STEPS = [
  { label: 'Lead', icon: UserPlus },
  { label: 'Client', icon: User },
  { label: 'CPR', icon: ClipboardList },
  { label: 'Cost Workout', icon: Calculator, active: true },
  { label: 'Quotation', icon: FileText },
  { label: 'Customer Purchase Order', icon: FileSignature }
];

let itemIdCounter = 100;
let catIdCounter = 1000;

// Same helpers the Cost Workout sidebar used for the attachment file list.
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

function fileIcon(name) {
  const n = (name || '').toLowerCase();
  if (n.endsWith('.pdf')) return FileText;
  if (n.endsWith('.doc') || n.endsWith('.docx')) return FileText;
  if (n.endsWith('.xls') || n.endsWith('.xlsx')) return FileSpreadsheet;
  if (n.endsWith('.png') || n.endsWith('.jpg') || n.endsWith('.jpeg')) return FileImage;
  return Paperclip;
}

function newItem(description = '', categories = null) {
  itemIdCounter += 1;
  return {
    key: itemIdCounter,
    description,
    // Brief CPR description — kept independent of the full description above.
    cprDescription: '',
    qty: 1,
    unit: 'Nos',
    // Documents that belong to THIS item only (persisted on the item row).
    attachments: [],
    categories: categories || [{ key: (catIdCounter += 1), category: 'Material Cost', qty: 1, unit: 'Nos', rate: 0, notes: '' }]
  };
}

function newCategoryRow(category = 'Material Cost') {
  catIdCounter += 1;
  return { key: catIdCounter, category, qty: 1, unit: 'Nos', rate: 0, notes: '' };
}

function parsePageList(response) {
  if (Array.isArray(response)) return response;
  if (response?.content) return response.content;
  if (Array.isArray(response?.data)) return response.data;
  return [];
}

export default function AddCostWorkout() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const cprParam = searchParams.get('cpr');
  const editing = Boolean(id);
  const toast = useToast();

  const [form, setForm] = useState({
    cwNo: '',
    cwDate: todayISO(),
    status: 'draft',
    preparedBy: '',
    contactPerson: '',
    department: '',
    sourceLead: '',
    customerName: '',
    cprRef: '',
    cprId: '',
    phone: '',
    email: '',
    company: '',
    gst: '',
    pan: '',
    linkedCpr: '',
    billingAddress: '',
    shippingAddress: '',
    remarks: '',
    profitPct: '0',
    discountPct: '0',
    gstPct: '18',
    attachments: []
  });
  const [items, setItems] = useState(() => [newItem()]);
  // Bulk Upload: applies the extracted queue to this form for review — saving
  // still happens only through the existing Save buttons below.
  const bulkBanner = useBulkPrefill({ moduleKey: 'costworkout', setForm, enabled: !editing });
  const [leadSources, setLeadSources] = useState([]);
  const [clientSources, setClientSources] = useState([]);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(editing);
  const [timeline, setTimeline] = useState([]);
  const [autosaveText, setAutosaveText] = useState('');
  // Historical revisions (older versions of an edited workout) are read-only.
  const [historical, setHistorical] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [record, setRecord] = useState(null);

  // Manage Columns: shared column configuration for Cost Workout item grid.
  // MODULE mode — persists to MySQL grid_configs table (grid key: sales.items.costworkout).
  const itemColumnsState = useManagedGrid({
    gridKey: 'sales.items.costworkout',
    defaults: defaultCwItemColumns,
    allowCustom: true,
    itemNoun: 'item',
    rowCount: items.length,
    protectedKeys: ['sno', 'actions']
  });

  // Source combobox state
  const [sourceOpen, setSourceOpen] = useState(false);
  const [sourceQuery, setSourceQuery] = useState('');
  const [sourceHighlight, setSourceHighlight] = useState(-1);
  const [sourceSelected, setSourceSelected] = useState(null);
  const sourceWrapRef = useRef(null);
  const sourceInputRef = useRef(null);
  // Attachments upload zone (moved from the sidebar into the main content area).
  const attachmentsInputRef = useRef(null);
  const [sourcePos, setSourcePos] = useState(null);

  const savedIdRef = useRef(null);
  const dirtyRef = useRef(false);
  const savingRef = useRef(false);
  const formRef = useRef(form);
  const itemsRef = useRef(items);
  const timelineInitRef = useRef(false);

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

  useClickOutside(sourceWrapRef, () => setSourceOpen(false), sourceOpen);

  // The Lead/Client source combobox lives inside an overflow-hidden card, so its
  // option list is rendered through a fixed-position portal (same mechanism as
  // EditableMasterDropdown) — it can never be clipped and flips upward when the
  // input is close to the bottom of the viewport.
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

  const markDirty = () => {
    dirtyRef.current = true;
    setAutosaveText('Unsaved changes');
  };

  const clearDirty = () => {
    dirtyRef.current = false;
    setAutosaveText('');
  };

  const addTimeline = (action, detail) => {
    const now = new Date().toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    setTimeline((prev) => [{ action, detail, time: now }, ...prev]);
  };

  const setField = (key, value, dirty = true) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    if (dirty) markDirty();
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [leadsRes, clientsRes] = await Promise.all([
          leadService.listLeads({ page: 0, size: 200 }),
          leadService.listClients({ page: 0, size: 200 })
        ]);
        if (cancelled) return;
        setLeadSources(parsePageList(leadsRes));
        setClientSources(parsePageList(clientsRes));
      } catch {
        // lookups are optional; the form still works with manual entry
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      if (editing) {
        setLoading(true);
        try {
          const res = await costWorkoutService.getCw(id);
          if (cancelled) return;
          const data = normalizeCw(res?.data ?? res);
          setHistorical(data.latestRevision === false);
          setRecord(data);
          const f = cwToForm(data);
          setForm(f);
          // Show the persisted source in the Lead/Client selector on edit (the
          // record stores the display label; mirror the manual-flow input).
          if (f.sourceLead) {
            setSourceSelected({ type: 'client', id: null, label: f.sourceLead });
          }
          const itemsList = (Array.isArray(data.items) ? data.items : []).map((it) => {
            itemIdCounter += 1;
            return {
              key: itemIdCounter,
              description: it.description || '',
              cprDescription: it.cprDescription || '',
              // Files already stored on this item row (edit / revision view).
              attachments: Array.isArray(it.attachments) ? it.attachments : [],
              qty: it.qty ?? 1,
              unit: it.unit || 'Nos',
              customFields: it.customFields || {},
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
          setItems(itemsList.length > 0 ? itemsList : [newItem()]);
          // Restore per-document column snapshot (historical records keep their own config).
          if (data.itemColumnsJson) {
            try {
              const parsed = JSON.parse(data.itemColumnsJson);
              if (Array.isArray(parsed) && parsed.length > 0) {
                itemColumnsState.setColumns(parsed);
              }
            } catch { /* fall back to module defaults */ }
          }
          try {
            const attRes = await costWorkoutService.getAttachments(id);
            if (!cancelled && Array.isArray(attRes)) {
              setForm((prev) => ({ ...prev, attachments: attRes }));
            }
          } catch {
            // attachments optional
          }
        } catch (err) {
          toast.error(err?.message || 'Failed to load Cost Workout');
          navigate(CPR_HUB_TABS['cost-workout']);
        } finally {
          if (!cancelled) setLoading(false);
        }
      } else {
        try {
          const res = await costWorkoutService.getNextNumber();
          if (cancelled) return;
          const data = res?.data ?? res ?? {};
          setForm((prev) => ({ ...prev, cwNo: data.cwNo || prev.cwNo }));
        } catch {
          // The backend allocates the number when the record is first saved.
        }
        if (cprParam) {
          // The loaded CPR is kept in the outer scope so the item mapping below
          // still runs when the optional Lead/customer resolution fails.
          let cprRecord = null;
          try {
            const cprRes = await cprService.getCpr(cprParam);
            if (cancelled) return;
            const cpr = normalizeCpr(cprRes?.data ?? cprRes ?? {});
            cprRecord = cpr;
            // Always link the CPR reference, regardless of source resolution.
            const cprBase = {
              cprRef: cpr.prNo || '',
              linkedCpr: cpr.prNo || '',
              cprId: cpr.id != null ? String(cpr.id) : ''
            };
            // Fallback: hydrate from the CPR's own denormalized copies (the CPR
            // stores the source label + numeric lead id, not the full customer
            // record). Preserves the pre-existing behaviour.
            const hydrateFromCpr = () =>
              setForm((prev) => ({
                ...prev,
                ...cprBase,
                customerName: cpr.clientName || cpr.client || prev.customerName,
                contactPerson: cpr.contactPerson || prev.contactPerson,
                phone: cpr.phone || prev.phone,
                email: cpr.email || prev.email,
                company: cpr.company || prev.company,
                gst: cpr.gst || prev.gst,
                pan: cpr.pan || prev.pan,
                billingAddress: cpr.billingAddress || prev.billingAddress,
                shippingAddress: cpr.shippingAddress || prev.shippingAddress
              }));
            // Resolve the real source record: a lead-sourced CPR stores the
            // numeric lead id in leadNo, so fetch the actual Lead and run the
            // same autofill used for manual selection — this populates the
            // Lead/Client selector AND every customer field from live data.
            const leadNo = String(cpr.leadNo || '').trim();
            // leadNo is the full formatted Lead number (LEAD-000077) — or a raw
            // numeric id for records created before that convention — resolve
            // the underlying Lead either way.
            const isLeadSourced = /^\d+$/.test(leadNo) || /^LEAD-\d+$/i.test(leadNo);
            const leadId = /^LEAD-\d+$/i.test(leadNo) ? leadNo.replace(/^LEAD-/i, '') : leadNo;
            if (isLeadSourced) {
              try {
                const leadRes = await leadService.getLead(leadId);
                if (cancelled) return;
                const lead = leadRes?.data ?? leadRes;
                // Only hydrate from the Lead when a real record came back;
                // otherwise fall back to the CPR's denormalized copies.
                if (!lead || typeof lead !== 'object' || lead.id == null) {
                  throw new Error('lead record not resolvable');
                }
                const leadItem = {
                  type: 'lead',
                  id: lead.id != null ? lead.id : Number(leadId),
                  code: lead.leadNo || formatLeadNo(lead.id) || leadNo,
                  name: lead.company || lead.businessName || lead.name || lead.customerName || '',
                  data: lead
                };
                const label = `${leadItem.name} (Lead No: ${leadItem.code})`;
                // Mirror the manual selection flow (selectSource) without the
                // dirty flag, so a pure prefill never triggers the unsaved-
                // changes prompt.
                setSourceSelected({ type: 'lead', id: leadItem.id, label });
                setSourceQuery('');
                setSourceOpen(false);
                setSourceHighlight(-1);
                setForm((prev) => ({
                  ...prev,
                  ...cprBase,
                  sourceLead: label,
                  leadNo: formatLeadNo(lead.id),
                  ...customerPatchFromSource({ ...leadItem, label })
                }));
                setErrors((prev) => {
                  const next = { ...prev };
                  delete next.sourceLead;
                  return next;
                });
              } catch {
                // Lead no longer resolvable — fall back to the CPR copies.
                hydrateFromCpr();
                const label = cpr.sourceLead || cpr.clientName || cpr.company || '';
                if (label) {
                  setSourceSelected({ type: 'client', id: null, label });
                  setForm((prev) => ({ ...prev, sourceLead: label }));
                }
              }
            } else {
              // Client-sourced (or unlinked) CPR — use the denormalized fields
              // and mirror the lead path by recording the source label.
              hydrateFromCpr();
              const label = cpr.sourceLead || cpr.clientName || cpr.company || '';
              if (label) {
                setSourceSelected({ type: 'client', id: null, label });
                setForm((prev) => ({ ...prev, sourceLead: label }));
              }
            }
          } catch {
            // prefill is optional; the form still works with manual entry
          }

          // ---- CPR material rows are NOT carried into the Cost Workout ----
          //
          // The CPR holds what the CUSTOMER asked for; the Cost Workout is the
          // company's own costing of the job, so its item/material section must
          // not open pre-filled with the CPR's rows (Drawing No., Material,
          // Description, Remarks, Qty, UOM, Est. Cost and row Total all stay in
          // the CPR). Only the CPR HEADER is hydrated above — the CPR reference,
          // the client/company/contact details — and the form keeps its own
          // single blank item row for the user to cost on this screen.
          if (cprRecord?.id) {
            // Department, Prepared By and Remarks are the Cost Workout's own
            // header fields; the CPR's department (default 'Sales', the Cost
            // Workout default), the CPR's own requester and its header notes are
            // carried in, and the note records where the record came from. Text
            // the user already has in the form is never replaced.
            setForm((prev) => ({
              ...prev,
              department: prev.department || cprRecord.department || 'Sales',
              preparedBy: prev.preparedBy || cprRecord.requestedBy || '',
              remarks: prev.remarks || cprConversionRemarks(cprRecord, getStoredUser()?.fullName || '')
            }));
          }
        }
        // Item-level CW button: a new CW opened with one item prefilled.
        const prefill = location.state?.cwPrefill;
        if (prefill?.item) {
          const it = prefill.item;
          itemIdCounter += 1;
          const itemKey = itemIdCounter;
          const cats = (Array.isArray(it.categories) ? it.categories : []).map((c) => ({
            key: (catIdCounter += 1),
            category: c.category || 'Material Cost',
            qty: c.qty ?? 1,
            unit: c.unit || 'Nos',
            rate: c.rate ?? 0,
            notes: c.notes || ''
          }));
          setItems([{ key: itemKey, description: it.description || '', cprDescription: it.cprDescription || '', qty: it.qty ?? 1, unit: it.unit || 'Nos', categories: cats.length ? cats : [newCategoryRow()] }]);
          if (prefill.form && typeof prefill.form === 'object') {
            // Carry the converted CPR item's attachments into this CW so they
            // appear under the CW's Attachments section (same embedded shape
            // as the CW upload zone: {name, size, type, data}).
            const itemFiles = Array.isArray(prefill.item.attachments) ? prefill.item.attachments : [];
            setForm((prev) => ({
              ...prev,
              ...prefill.form,
              attachments: itemFiles.length ? [...(prev.attachments || []), ...itemFiles] : prev.attachments
            }));
            if (prefill.form.sourceLead) {
              setSourceSelected({ type: 'client', id: null, label: prefill.form.sourceLead });
            }
          }
        }
      }
      if (!timelineInitRef.current) {
        timelineInitRef.current = true;
        addTimeline('created', 'Form opened');
      }
    };
    init();
    return () => {
      cancelled = true;
    };
  }, [editing, id, navigate, toast, cprParam, location.state]);

  useEffect(() => {
    formRef.current = form;
  }, [form]);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // 30-second auto-save after the first manual save (matches ERP CWCreate._autoSave)
  useEffect(() => {
    const timer = setInterval(() => {
      if (savingRef.current) return;
      if (!dirtyRef.current) return;
      // A historical revision is read-only (Save is disabled and the page says
      // so). Writing to it in the background would be rejected by the server
      // with 400 — which the global API error handler turns into a full-page
      // error — so the autosave must never run for a superseded revision.
      if (historical) return;
      const existingId = savedIdRef.current || (editing ? id : null);
      if (!existingId) return;
      const payload = serializeCw({ ...formRef.current, status: 'draft', itemColumnsJson: JSON.stringify(itemColumnsState.columns) }, itemsRef.current);
      // draft=true: background persistence must never fabricate a revision —
      // the backend updates the row in place (CPR-parity autosave contract).
      costWorkoutService
        .updateCw(existingId, payload, true)
        .then((res) => {
          const savedId = res?.data?.id;
          if (savedId) savedIdRef.current = savedId;
        })
        .then(() => {
          dirtyRef.current = false;
          setAutosaveText('');
        })
        .catch(() => {
          // keep dirty; retry next cycle
        });
    }, 30000);
    return () => clearInterval(timer);
  }, [editing, id, historical]);

  const totals = useMemo(
    () => calcCwTotals(items, form.profitPct, form.discountPct, form.gstPct),
    [items, form.profitPct, form.discountPct, form.gstPct]
  );

  const catCount = useMemo(
    () => items.reduce((sum, item) => sum + (Array.isArray(item.categories) ? item.categories.length : 0), 0),
    [items]
  );

  // Individual category/unit cells use the backend-driven EditableMasterDropdown
  // (cw_categories / cw_units) for search, add, edit and delete. The system
  // category list still powers the "All Categories" batch action below.

  // ---- Lead / Client source combobox ----
  const autofillFromSource = (item) => {
    // Keep the full formatted Lead document number (LEAD-000077) on the form
    // so the CW's saved leadNo reference matches the Lead list exactly.
    const leadNo = item.type === 'lead' ? formatLeadNo(item.id) : '';
    setForm((prev) => ({ ...prev, sourceLead: item.label, leadNo, ...customerPatchFromSource(item) }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next.sourceLead;
      return next;
    });
    markDirty();
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
      leadNo: '',
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
    markDirty();
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

  // ---- Item grid ----
  const updateItem = (itemKey, patch) => {
    setItems((prev) => prev.map((item) => (item.key === itemKey ? { ...item, ...patch } : item)));
    markDirty();
  };

  const updateCategory = (itemKey, catKey, patch) => {
    setItems((prev) =>
      prev.map((item) =>
        item.key === itemKey
          ? { ...item, categories: item.categories.map((cat) => (cat.key === catKey ? { ...cat, ...patch } : cat)) }
          : item
      )
    );
    markDirty();
  };

  const addItem = () => {
    setItems((prev) => [...prev, newItem()]);
    markDirty();
  };

  const removeItem = (itemKey) => {
    if (items.length <= 1) {
      toast.warning('At least one item is required');
      return;
    }
    setItems((prev) => prev.filter((item) => item.key !== itemKey));
    markDirty();
  };

  const addCategory = (itemKey) => {
    setItems((prev) =>
      prev.map((item) => (item.key === itemKey ? { ...item, categories: [...item.categories, newCategoryRow()] } : item))
    );
    markDirty();
  };

  const removeCategory = (itemKey, catKey) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.key !== itemKey) return item;
        const categories = item.categories.filter((cat) => cat.key !== catKey);
        return { ...item, categories: categories.length === 0 ? [newCategoryRow()] : categories };
      })
    );
    markDirty();
  };

  // When a category is deleted from the master list, reset any rows that still
  // reference it back to 'Material Cost' (mirrors the ERP delete behavior).
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
    markDirty();
  };

  // ERP cwAddBatch: adds a NEW item populated with every system category
  const addBatchCategories = () => {
    const item = newItem('', CW_SYSTEM_CATEGORIES.map((name) => newCategoryRow(name)));
    setItems((prev) => [...prev, item]);
    markDirty();
  };

  const clearAllItems = () => {
    setItems([newItem()]);
    markDirty();
  };

  // ERP cwOnCategoryChange: switching to Lead Time sets unit Days & zeroes rate; away resets unit to Nos
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
    markDirty();
  };

  // ---- Attachments (ERP upload zone, shared 2 GB per-file limit) ----
  const handleFiles = (fileList) => {
    const files = Array.from(fileList || []);
    const accepted = [];
    for (const file of files) {
      const err = getAttachmentSelectionError(file);
      if (err) {
        toast.warning(err.message);
        continue;
      }
      accepted.push(file);
    }
    if (!accepted.length) return;
    accepted.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        setForm((prev) => ({
          ...prev,
          attachments: [...(prev.attachments || []), { name: file.name, size: file.size, type: file.type, data: e.target.result }]
        }));
        markDirty();
      };
      reader.readAsDataURL(file);
    });
  };

  const removeAttachment = (idx) => {
    setForm((prev) => ({ ...prev, attachments: (prev.attachments || []).filter((_, i) => i !== idx) }));
    markDirty();
  };

  // ---- Per-item documents ----
  // Every item row owns its files: they are read into the SAME embedded shape
  // the Cost Workout's own attachments use and are sent with THAT item, so
  // adding/removing/reordering items can never move a file to another item.
  const [docsItemKey, setDocsItemKey] = useState(null);
  const docsInputRef = useRef(null);
  const docsItem = items.find((it) => it.key === docsItemKey) || null;
  const docsItemIndex = docsItem ? items.findIndex((it) => it.key === docsItem.key) : -1;

  const readFileAsDataUrl = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve({ name: file.name, size: file.size, type: file.type, data: e.target.result });
      reader.onerror = () => reject(reader.error || new Error('Could not read the file'));
      reader.readAsDataURL(file);
    });

  const handleItemFiles = async (itemKey, fileList) => {
    const files = Array.from(fileList || []);
    const accepted = [];
    for (const file of files) {
      const err = getAttachmentSelectionError(file);
      if (err) {
        toast.warning(err.message);
        continue;
      }
      accepted.push(file);
    }
    if (!accepted.length) return;
    try {
      const staged = await Promise.all(accepted.map(readFileAsDataUrl));
      // One functional update for the whole batch: repeated picks append to the
      // item's current files instead of replacing them.
      setItems((prev) =>
        prev.map((item) =>
          item.key === itemKey ? { ...item, attachments: [...(item.attachments || []), ...staged] } : item
        )
      );
      markDirty();
    } catch (err) {
      toast.error(err?.message || 'Failed to attach the file');
    }
  };

  const removeItemAttachment = (itemKey, idx) => {
    setItems((prev) =>
      prev.map((item) =>
        item.key === itemKey
          ? { ...item, attachments: (item.attachments || []).filter((_, i) => i !== idx) }
          : item
      )
    );
    markDirty();
  };

  // Preview from the stored base64 via a short-lived Blob URL (browsers refuse
  // to navigate a tab to a data: URL directly).
  const openItemAttachment = (file) => {
    try {
      const [meta, payload] = String(file?.data || '').split(',');
      const mime = /data:([^;]+)/.exec(meta || '')?.[1] || file?.type || 'application/octet-stream';
      const binary = atob(payload || '');
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch {
      toast.error('This document could not be opened');
    }
  };

  // ---- Validation ----
  const validate = () => {
    const next = {};
    if (!form.cwDate) next.cwDate = 'Date is required';
    if (!form.preparedBy) next.preparedBy = 'Prepared By is required';
    if (!form.department) next.department = 'Department is required';
    if (!form.sourceLead) next.sourceLead = 'Please select a Lead or Client';
    if (form.remarks && form.remarks.length > 100000) next.remarks = 'Remarks exceed maximum length of 100000 characters';
    const hasContent = items.some((item) => {
      const hasCat = (Array.isArray(item.categories) ? item.categories : []).some(
        (cat) => Number(cat.qty) > 0 || Number(cat.rate) > 0 || isLeadTimeCategory(cat.category)
      );
      return Boolean(item.description) || hasCat;
    });
    if (!hasContent) next.items = 'Add at least one cost item with a description or quantity/rate';
    for (const item of items) {
      for (const cat of item.categories || []) {
        if (Number(cat.qty) < 0) {
          next.items = 'Quantity cannot be negative';
          break;
        }
        if (Number(cat.rate) < 0) {
          next.items = 'Rate cannot be negative';
          break;
        }
      }
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const resetForm = async () => {
    setForm({
      cwNo: '',
      cwDate: todayISO(),
      status: 'draft',
      preparedBy: '',
      contactPerson: '',
      department: '',
      sourceLead: '',
      customerName: '',
      cprRef: '',
      cprId: '',
      phone: '',
      email: '',
      company: '',
      gst: '',
      pan: '',
      linkedCpr: '',
      billingAddress: '',
      shippingAddress: '',
      remarks: '',
      profitPct: '0',
      discountPct: '0',
      gstPct: '18',
      attachments: []
    });
    setItems([newItem()]);
    setErrors({});
    setSourceSelected(null);
    clearDirty();
    try {
      const res = await costWorkoutService.getNextNumber();
      const data = res?.data ?? res ?? {};
      setForm((prev) => ({ ...prev, cwNo: data.cwNo || prev.cwNo }));
    } catch {
      // The backend allocates the number when the record is first saved.
    }
  };

  // ---- Save semantics (matches ERP CWCreate.save / submitForApproval) ----
  const saveAs = async (action) => {
    if (action !== 'draft' && !validate()) {
      toast.error('Please fix the highlighted fields');
      return;
    }
    setSaving(true);
    savingRef.current = true;
    // Only "Save Draft" persists Draft; "Save & New", "Save" and
    // "Submit for Approval" persist Completed (Status dropdown overridden).
    const status = action === 'draft' ? 'draft' : 'completed';
    const payload = serializeCw({ ...form, status, itemColumnsJson: JSON.stringify(itemColumnsState.columns) }, items);
    // Save and Continue must never lose the form: a rejected save is reported by
    // this page's own toast instead of the app-wide error page, so the entered
    // values stay on screen. The other actions keep their existing presentation.
    const saveOptions = { suppressGlobalError: action === 'continue' };
    try {
      const existingId = savedIdRef.current || (editing ? id : null);
      const res = existingId
        // Save Draft / preview-style saves persist as draft: in-place update,
        // NO revision (first explicit save of a draft-born record commits it
        // in place server-side — also with no revision).
        ? await costWorkoutService.updateCw(existingId, payload, action === 'draft', saveOptions)
        : await costWorkoutService.createCw(payload, action === 'draft', saveOptions);
      const data = res?.data ?? res ?? {};
      const savedId = data.id || existingId;
      if (savedId) savedIdRef.current = savedId;
      if (data.cwNo) setForm((prev) => ({ ...prev, cwNo: data.cwNo }));
      clearDirty();
      if (action === 'draft') {
        addTimeline('saved', 'Cost Workout saved');
        toast.success('Draft saved');
      } else if (action === 'new') {
        addTimeline('saved', 'Cost Workout saved');
        toast.success('Cost Workout saved');
        savedIdRef.current = null;
        await resetForm();
      } else if (action === 'continue') {
        // Save and Continue: the backend has already confirmed the record (we
        // are past the await above), so open the saved Cost Workout's View page
        // — the same record page the list's View action opens. The existing
        // Save action keeps opening the document Preview (/design), so the two
        // buttons lead to genuinely different destinations for the SAME saved
        // record; nothing is created twice.
        addTimeline('saved', 'Cost Workout saved');
        toast.success(editing ? 'Cost Workout updated' : 'Cost Workout saved');
        savedIdRef.current = null;
        navigate(savedId ? `/cost-workouts/${savedId}` : CPR_HUB_TABS['cost-workout']);
      } else if (action === 'submit') {
        let submitId = savedId;
        if (data?.id) {
          const subRes = await costWorkoutService.submitCw(data.id);
          submitId = subRes?.data?.id ?? data.id;
        }
        addTimeline('submitted', 'Submitted for approval');
        toast.success('Cost Workout submitted for approval');
        navigate(`/cost-workouts/${submitId}`);
      } else {
        addTimeline('saved', 'Cost Workout saved');
        toast.success(editing ? 'Cost Workout updated' : 'Cost Workout saved');
        savedIdRef.current = null;
        // Save & Continue: open the Cost Workout Preview (design page) directly
        // instead of navigating back to the list first.
        navigate(savedId ? `/cost-workouts/design?id=${savedId}` : CPR_HUB_TABS['cost-workout']);
      }
    } catch (err) {
      toast.error(err?.message || 'Failed to save Cost Workout');
    } finally {
      setSaving(false);
      savingRef.current = false;
    }
  };

  const handleCancel = () => {
    if (dirtyRef.current) {
      setConfirmLeave(true);
      return;
    }
    navigate(CPR_HUB_TABS['cost-workout']);
  };

  const fieldError = (key) =>
    errors[key] ? <div className="text-[10px] font-semibold text-rose-600 mt-1">{errors[key]}</div> : null;

  const inputCls = (hasError) =>
    `w-full bg-slate-50 border ${hasError ? 'border-rose-400' : 'border-slate-200'} rounded-lg px-2.5 py-2 text-xs text-slate-700 outline-none focus:border-emerald-600/50 transition-all`;

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-10">
        <Loader2 className="w-6 h-6 text-[#0B4A3D] animate-spin" />
      </div>
    );
  }

  return (
    <div className="erp-create-scope flex-1 bg-app font-sans antialiased text-slate-800 p-4 sm:p-6 w-full max-w-[100vw] overflow-x-hidden">
      {bulkBanner}
      {/* Historical revision notice: older versions of an edited document are
          immutable. The backend also rejects any mutation of a non-latest
          revision, so this banner is defence-in-depth for direct URL access. */}
      {historical && (
        <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
          <div className="text-xs">
            <p className="font-bold text-amber-800">Historical revision — read-only</p>
            <p className="text-amber-700 font-medium mt-0.5">
              This version is preserved in history and can no longer be edited. Use View / Preview / Print / PDF to review it.
            </p>
          </div>
        </div>
      )}
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 mb-3 select-none">
        <span>VISHAK TECH</span>
        <span>&gt;</span>
        <span>Sales</span>
        <span>&gt;</span>
        <span>Customer Purchase Request</span>
        <span>&gt;</span>
        <button type="button" onClick={() => navigate(CPR_HUB_TABS['cost-workout'])} className="hover:text-slate-600 cursor-pointer">
          Cost Workouts
        </button>
        <span>&gt;</span>
        <span className="text-slate-600">{editing ? 'Edit Cost Workout' : 'New Cost Workout'}</span>
      </div>

      {/* ===== HEADER ===== */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
        <div>
          <h1 className="flex items-center gap-2.5 text-2xl font-bold text-slate-900 tracking-tight">
            <Calculator className="w-6 h-6 text-[#0B4A3D]" />
            {editing ? 'Edit Cost Workout' : 'Create Cost Workout'}
          </h1>
          <p className="text-xs text-slate-400 mt-1">Cost calculation for quotations.</p>
        </div>
        <button
          type="button"
          onClick={handleCancel}
          className="flex items-center gap-1.5 text-xs font-bold text-slate-600 bg-surface border border-slate-200 px-3 py-2 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer w-fit select-none"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to List
        </button>
      </div>

      {/* ===== WORKFLOW STEPPER ===== */}
      <div className="flex items-center gap-1.5 flex-wrap mb-6 p-3 bg-surface border border-slate-200 rounded-xl select-none">
        {WORKFLOW_STEPS.map((step, index) => (
          <div key={step.label} className="flex items-center gap-1.5">
            <span
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold ${
                step.active ? 'bg-[#0B4A3D] text-white' : index < 3 ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-50 text-slate-400'
              }`}
            >
              <span aria-hidden="true"><step.icon className="w-3 h-3" /></span>
              {step.label}
            </span>
            {index < WORKFLOW_STEPS.length - 1 && <ChevronLeft className="w-3 h-3 text-slate-300 rotate-180" />}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-6 items-start">
        {/* `min-w-0` is required: a grid item defaults to `min-width: auto`, so
            without it the 1fr track grows to the Cost Items table's min-content
            width (~2100px) and the whole grid — not the table — overflows the
            page, where the root's overflow-x-hidden clips it. With min-w-0 the
            track shrinks to the available width and the table's own
            overflow-x-auto wrapper scrolls as designed. */}
        <div className="space-y-5 min-w-0">
          {/* ===== CARD 1: GENERAL INFORMATION ===== */}
          <div className="bg-surface border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#0B4A3D]" />
              <h2 className="text-sm font-bold text-slate-800">General Information</h2>
            </div>
            <div className="p-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {/* No document number is entered or shown: the CW number is
                  allocated by the backend as the record's internal identity
                  (routes, payloads, revisions) and the CPR this workout was
                  raised for is linked through ?cpr=<id>, not typed here. */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">
                  Date <span className="text-rose-500">*</span>
                </label>
                <input type="date" value={form.cwDate} onChange={(e) => setField('cwDate', e.target.value)} className={inputCls(errors.cwDate)} />
                {fieldError('cwDate')}
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Status</label>
                <select
                  value={form.status}
                  onChange={(e) => setField('status', e.target.value)}
                  className={`${inputCls(false)} cursor-pointer`}
                >
                  {CW_FORM_STATUSES.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">
                  Prepared By <span className="text-rose-500">*</span>
                </label>
                <EditableMasterDropdown
                  masterKey="pr_requested_by"
                  value={form.preparedBy}
                  onChange={(v) => setField('preparedBy', v)}
                  placeholder="Select Preparer"
                  invalid={Boolean(errors.preparedBy)}
                  inputClassName={`${inputCls(errors.preparedBy)} cursor-text`}
                />
                {fieldError('preparedBy')}
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Contact Person</label>
                <input
                  type="text"
                  value={form.contactPerson}
                  onChange={(e) => setField('contactPerson', e.target.value)}
                  placeholder="Contact person name"
                  className={inputCls(false)}
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">
                  Department <span className="text-rose-500">*</span>
                </label>
                <EditableMasterDropdown
                  masterKey="cw_departments"
                  value={form.department}
                  onChange={(v) => setField('department', v)}
                  placeholder="Select Department"
                  invalid={Boolean(errors.department)}
                  inputClassName={`${inputCls(errors.department)} cursor-text`}
                />
                {fieldError('department')}
              </div>
            </div>
          </div>

          {/* ===== CARD 2: CUSTOMER INFORMATION ===== */}
          <div className="bg-surface border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#0B4A3D]" />
              <h2 className="text-sm font-bold text-slate-800">Customer Information</h2>
            </div>
            <div className="p-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              <div className="xl:col-span-2">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">
                  Lead / Client <span className="text-rose-500">*</span>
                </label>
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
                    className={`${inputCls(errors.sourceLead)} cursor-text`}
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
                          // Keep list clicks from hitting the click-outside
                          // handler, matching the inline list behaviour.
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
                {fieldError('sourceLead')}
                <div className="flex items-center gap-1 mt-1.5 text-[10px] text-slate-400">
                  <span>Select an existing Lead or Client to auto-fill details below</span>
                  {sourceSelected && (
                    <button
                      type="button"
                      onClick={clearSourceSelection}
                      className="ml-auto text-rose-500 hover:underline font-semibold cursor-pointer"
                    >
                      Clear selection
                    </button>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Shipping Address</label>
                <textarea rows={2} value={form.shippingAddress} onChange={(e) => setField('shippingAddress', e.target.value)} placeholder="Shipping address" className={inputCls(false)} />
              </div>
            </div>
          </div>

          {/* ===== CARD 3: COST ITEMS ===== */}
          <div className="bg-surface border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-[#0B4A3D]" />
                <h2 className="text-sm font-bold text-slate-800">Cost Items Breakdown</h2>
                {itemColumnsState.saving && <Loader2 className="w-3 h-3 text-slate-400 animate-spin" />}
              </div>
              <div className="flex items-center gap-1.5">
                <ManageColumnsButton manager={itemColumnsState.manager} />
                <button type="button" onClick={addItem} className="flex items-center gap-1 text-[11px] font-bold text-white bg-[#0B4A3D] hover:bg-[#083D34] px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer">
                  <Plus className="w-3.5 h-3.5" /> Add Item
                </button>
                <button type="button" onClick={addBatchCategories} className="flex items-center gap-1 text-[11px] font-bold text-slate-600 bg-surface border border-slate-200 px-2.5 py-1.5 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer">
                  <Layers className="w-3.5 h-3.5" /> All Categories
                </button>
                <button type="button" onClick={clearAllItems} className="flex items-center gap-1 text-[11px] font-bold text-slate-600 bg-surface border border-slate-200 px-2.5 py-1.5 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer">
                  <Trash2 className="w-3.5 h-3.5" /> Clear All
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
                <colgroup>
                  {itemColumnsState.visibleColumns.map((col) => (
                    <col key={col.id} style={{ width: itemColumnsState.resize.widthOf(col) || col.width || 120 }} />
                  ))}
                  <col style={{ width: 50 }} />
                </colgroup>
                <thead>
                  <tr className="bg-slate-100/80 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                    {itemColumnsState.visibleColumns.map((col) => (
                      <th
                        key={col.id}
                        className={`py-2 px-3 ${col.align === 'center' ? 'text-center' : col.align === 'right' ? 'text-right' : 'text-left'}`}
                        style={{ position: 'relative' }}
                      >
                        {col.label}
                        <div
                          className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-[#0B4A3D]/20"
                          {...itemColumnsState.resize.resizerProps(col)}
                        />
                      </th>
                    ))}
                    <th className="py-2 px-3 text-center" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, itemIndex) => {
                    const cats = item.categories || [];
                    const itemTotal = cats.reduce(
                      (sum, c) => sum + (isLeadTimeCategory(c.category) ? 0 : (Number(c.qty) || 0) * (Number(c.rate) || 0)),
                      0
                    );
                    return (
                      <Fragment key={item.key}>
                        {cats.map((cat, catIndex) => {
                          const isLeadTime = isLeadTimeCategory(cat.category);
                          return (
                            <tr key={cat.key} className="border-b border-slate-100">
                              {catIndex === 0 && itemColumnsState.visibleColumns.map((col) => {
                                if (col.key === 'sno') {
                                  return (
                                    <td key={col.id} className="px-3 py-2 text-xs text-slate-400 text-center align-middle" rowSpan={cats.length}>
                                      {itemIndex + 1}
                                    </td>
                                  );
                                }
                                if (col.key === 'cwDescription') {
                                  return (
                                    <td key={col.id} className="px-3 py-2 align-middle" rowSpan={cats.length}>
                                      <div className="flex items-center gap-1">
                                        <input
                                          type="text"
                                          value={item.description}
                                          onChange={(e) => updateItem(item.key, { description: e.target.value })}
                                          placeholder="Enter description"
                                          className="flex-1 min-w-0 bg-transparent border border-transparent hover:border-slate-200 focus:border-emerald-600/50 rounded px-2 py-1.5 text-xs outline-none transition-colors"
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
                                    </td>
                                  );
                                }
                                if (col.key === 'cwCprDescription') {
                                  return (
                                    <td key={col.id} className="px-3 py-2 align-middle" rowSpan={cats.length}>
                                      <input
                                        type="text"
                                        value={item.cprDescription || ''}
                                        onChange={(e) => updateItem(item.key, { cprDescription: e.target.value })}
                                        placeholder="Short CPR description"
                                        title={item.cprDescription || ''}
                                        className="w-full min-w-0 bg-transparent border border-transparent hover:border-slate-200 focus:border-emerald-600/50 rounded px-2 py-1.5 text-xs outline-none transition-colors"
                                      />
                                    </td>
                                  );
                                }
                                if (col.key === 'cwQty') {
                                  return (
                                    <td key={col.id} className="px-3 py-2 align-middle" rowSpan={cats.length}>
                                      <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={item.qty}
                                        onChange={(e) => updateItem(item.key, { qty: e.target.value })}
                                        className="w-full bg-transparent border border-transparent hover:border-slate-200 focus:border-emerald-600/50 rounded px-2 py-1.5 text-xs text-center outline-none transition-colors"
                                      />
                                    </td>
                                  );
                                }
                                // Item-level custom columns render with rowSpan
                                if (!col.system && col.level === 'item') {
                                  return (
                                    <td key={col.id} className="px-3 py-2 align-middle" rowSpan={cats.length}>
                                      <input
                                        type={col.type === 'number' ? 'number' : col.type === 'date' ? 'date' : 'text'}
                                        value={item.customFields?.[col.id] || ''}
                                        onChange={(e) => {
                                          const newItems = items.map((it) =>
                                            it.key === item.key
                                              ? { ...it, customFields: { ...it.customFields, [col.id]: e.target.value } }
                                              : it
                                          );
                                          setItems(newItems);
                                        }}
                                        placeholder={col.label}
                                        className="w-full bg-transparent border border-transparent hover:border-slate-200 focus:border-emerald-600/50 rounded px-2 py-1.5 text-xs outline-none transition-colors"
                                      />
                                    </td>
                                  );
                                }
                                return null;
                              })}
                              {/* Category-level columns */}
                              {itemColumnsState.visibleColumns.map((col) => {
                                if (col.level !== 'category') return null;
                                if (col.key === 'cwCategory') {
                                  return (
                                    <td key={col.id} className="px-3 py-2">
                                      <EditableMasterDropdown
                                        masterKey="cw_categories"
                                        value={cat.category}
                                        onChange={(v) => handleCategoryChange(item.key, cat.key, v)}
                                        onDeleted={handleCategoryDeleted}
                                        placeholder="Select category"
                                        portal
                                        inputClassName="w-full bg-transparent border border-transparent hover:border-slate-200 focus:border-emerald-600/50 rounded px-2 py-1.5 text-xs outline-none cursor-text transition-colors"
                                      />
                                    </td>
                                  );
                                }
                                if (col.key === 'cwUnit') {
                                  return (
                                    <td key={col.id} className="px-3 py-2">
                                      <EditableMasterDropdown
                                        masterKey="cw_units"
                                        value={cat.unit}
                                        onChange={(u) => updateCategory(item.key, cat.key, { unit: u })}
                                        placeholder="Select unit..."
                                        portal
                                        inputClassName="w-full bg-transparent border border-transparent hover:border-slate-200 focus:border-emerald-600/50 rounded px-2 py-1.5 pr-6 text-xs outline-none cursor-text transition-colors"
                                      />
                                    </td>
                                  );
                                }
                                if (col.key === 'cwRate') {
                                  return isLeadTime ? (
                                    <td key={col.id} className="px-3 py-2 text-center text-slate-300 text-xs">—</td>
                                  ) : (
                                    <td key={col.id} className="px-3 py-2">
                                      <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={cat.rate}
                                        onChange={(e) => updateCategory(item.key, cat.key, { rate: e.target.value })}
                                        placeholder="0.00"
                                        className="w-full bg-transparent border border-transparent hover:border-slate-200 focus:border-emerald-600/50 rounded px-2 py-1.5 text-xs text-right outline-none transition-colors"
                                      />
                                    </td>
                                  );
                                }
                                if (col.key === 'cwAmount') {
                                  return isLeadTime ? (
                                    <td key={col.id} className="px-3 py-2 text-center text-slate-300 text-xs">—</td>
                                  ) : (
                                    <td key={col.id} className="px-3 py-2 text-right text-xs font-semibold text-slate-700">
                                      {formatINR((Number(cat.qty) || 0) * (Number(cat.rate) || 0))}
                                    </td>
                                  );
                                }
                                if (col.key === 'cwRemarks') {
                                  return (
                                    <td key={col.id} className="px-3 py-2">
                                      <input
                                        type="text"
                                        value={cat.notes}
                                        onChange={(e) => updateCategory(item.key, cat.key, { notes: e.target.value })}
                                        placeholder="Notes"
                                        className="w-full bg-transparent border border-transparent hover:border-slate-200 focus:border-emerald-600/50 rounded px-2 py-1.5 text-xs outline-none transition-colors"
                                      />
                                    </td>
                                  );
                                }
                                return null;
                              })}
                              <td className="px-2 py-2 text-center">
                                {cats.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => removeCategory(item.key, cat.key)}
                                    aria-label="Remove category row"
                                    title="Remove category"
                                    className="p-1 text-slate-300 hover:text-rose-500 transition-colors cursor-pointer"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                        {/* Per-item action row */}
                        <tr className="border-b border-slate-200">
                          <td colSpan={itemColumnsState.visibleColumns.length + 1} className="px-3 py-1.5">
                            <div className="flex items-center justify-between gap-3 flex-wrap">
                              {/* Item-scoped documents: the button opens this item's
                                  own attachment panel (files stay with the item). */}
                              <button
                                type="button"
                                onClick={() => setDocsItemKey(item.key)}
                                aria-label={`Documents for item ${itemIndex + 1}`}
                                title="Documents for this item"
                                className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-600 bg-surface border border-slate-200 px-2 py-1 rounded-lg hover:border-[#0B4A3D] hover:text-[#0B4A3D] transition-colors cursor-pointer"
                              >
                                <Paperclip className="w-3 h-3" /> Documents
                                {(item.attachments || []).length > 0 && (
                                  <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[9px] font-bold bg-[#E8F0EE] text-[#0B4A3D]">
                                    {item.attachments.length}
                                  </span>
                                )}
                              </button>
                              <div className="text-right">
                                <button
                                  type="button"
                                  onClick={() => addCategory(item.key)}
                                  className="inline-flex items-center gap-1 text-[11px] font-bold text-[#0B4A3D] hover:underline cursor-pointer ml-3"
                                >
                                  <Plus className="w-3 h-3" /> Add Category
                                </button>
                                <span className="ml-4 text-xs font-semibold text-slate-700">
                                  Item Total: <span className="font-bold text-slate-900">₹{itemTotal.toFixed(2)}</span>
                                </span>
                              </div>
                            </div>
                          </td>
                        </tr>
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-5 py-3 border-t border-slate-100 flex flex-wrap items-center gap-4 text-xs text-slate-500">
              <span>
                <span className="font-bold text-slate-700">{items.length}</span> Items
              </span>
              <span>
                <span className="font-bold text-slate-700">{catCount}</span> Categories
              </span>
              <span className="font-bold text-slate-700 ml-auto">
                Subtotal: <span className="text-[#0B4A3D]">{formatINR(totals.subtotal)}</span>
              </span>
            </div>
            {errors.items && <div className="px-5 pb-3 text-[10px] font-semibold text-rose-600">{errors.items}</div>}

          </div>

          {/* ===== COST BREAKDOWN & PRICING (ERP prg-cost-summary cw-breakdown)
              -> REMARKS -> ATTACHMENTS (stacked in the main content area) ===== */}
          <div className="grid grid-cols-1 gap-5 items-start">
            <div className="bg-surface border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2">
                <Calculator className="w-4 h-4 text-[#0B4A3D]" />
                <h2 className="text-sm font-bold text-slate-800">Cost Breakdown &amp; Pricing</h2>
              </div>
              <div className="p-5">
                <div className="max-w-xl">
                  <div className="flex items-center justify-between py-[5px] text-xs">
                    <span className="text-slate-700">Subtotal</span>
                    <span className="font-semibold text-slate-800">{formatINR(totals.subtotal)}</span>
                  </div>
                  <div className="flex items-center justify-between py-[5px] text-xs">
                    <span className="text-slate-700">Profit Amount</span>
                    <span className="font-semibold text-slate-800">{formatINR(totals.profitAmt)}</span>
                  </div>
                  <div className="flex items-center justify-between py-[5px] text-xs">
                    <span className="text-slate-700">Selling Price</span>
                    <span className="font-semibold text-slate-800">{formatINR(totals.sellingPrice)}</span>
                  </div>
                  <div className="flex items-center justify-between py-[5px] text-xs">
                    <span className="text-slate-700">Discount %</span>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      value={form.discountPct}
                      onChange={(e) => setField('discountPct', e.target.value)}
                      className="w-20 h-7 bg-slate-50 border border-slate-200 rounded-md px-2 text-xs text-right outline-none focus:border-emerald-600/50"
                    />
                  </div>
                  <div className="flex items-center justify-between py-[5px] text-xs">
                    <span className="text-slate-700">Discount Amount</span>
                    <span className="font-semibold text-slate-800">{formatINR(totals.discountAmt)}</span>
                  </div>
                  <div className="flex items-center justify-between py-[5px] text-xs">
                    <span className="text-slate-700">GST %</span>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      value={form.gstPct}
                      onChange={(e) => setField('gstPct', e.target.value)}
                      className="w-20 h-7 bg-slate-50 border border-slate-200 rounded-md px-2 text-xs text-right outline-none focus:border-emerald-600/50"
                    />
                  </div>
                  <div className="flex items-center justify-between py-[5px] text-xs">
                    <span className="text-slate-700">GST Amount</span>
                    <span className="font-semibold text-slate-800">{formatINR(totals.gstAmt)}</span>
                  </div>
                  <div className="flex items-center justify-between py-[5px] text-xs border-t border-slate-200 mt-1.5 pt-2 font-bold">
                    <span className="text-slate-800">Grand Total</span>
                    <span className="font-bold text-[#0B4A3D] text-[13px]">{formatINR(totals.grandTotal)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* ===== REMARKS ===== */}
            <div className="bg-surface border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2">
                <Layers className="w-4 h-4 text-[#0B4A3D]" />
                <h2 className="text-sm font-bold text-slate-800">Remarks</h2>
              </div>
              <div className="p-5">
                <textarea
                  rows={4}
                  value={form.remarks}
                  onChange={(e) => setField('remarks', e.target.value)}
                  placeholder="Additional notes or remarks..."
                  className={`w-full bg-slate-50 border ${errors.remarks ? 'border-rose-400' : 'border-slate-200'} rounded-lg px-3 py-2.5 text-xs text-slate-700 outline-none focus:border-emerald-600/50 transition-all`}
                />
                <div className="flex items-center justify-between mt-1">
                  {fieldError('remarks')}
                  <span className="text-[10px] text-slate-400 ml-auto">{form.remarks.length} chars</span>
                </div>
              </div>
            </div>

            {/* ===== ATTACHMENTS (moved from the right sidebar to sit directly
                below Remarks; same upload zone / file list UI) ===== */}
            <div className="bg-surface border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2">
                <Paperclip className="w-4 h-4 text-[#0B4A3D]" />
                <h2 className="text-sm font-bold text-slate-800">Attachments</h2>
              </div>
              <div className="p-5">
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => attachmentsInputRef.current?.click()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') attachmentsInputRef.current?.click();
                  }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (e.dataTransfer?.files?.length > 0) handleFiles(e.dataTransfer.files);
                  }}
                  className="border-2 border-dashed border-slate-300 rounded-lg py-6 px-4 text-center cursor-pointer transition-all hover:border-[#0B4A3D] hover:bg-[#E8F0EE]/50"
                >
                  <CloudUpload className="w-6 h-6 text-[#0B4A3D] mx-auto mb-2" />
                  <p className="text-xs font-semibold text-slate-700">
                    Drag &amp; drop files or <span className="text-[#0B4A3D] font-bold">browse</span>
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1">PDF, DOCX, XLSX, PNG, JPG up to {MAX_ATTACHMENT_SIZE_LABEL} per file</p>
                </div>
                <input
                  ref={attachmentsInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files?.length > 0) handleFiles(e.target.files);
                    e.target.value = '';
                  }}
                />

                {Array.isArray(form.attachments) && form.attachments.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
                    {form.attachments.map((file, index) => {
                      const Icon = fileIcon(file.name);
                      const isImg = file.type && file.type.indexOf('image') === 0;
                      return (
                        <div
                          key={`${file.name}-${index}`}
                          className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2"
                        >
                          {isImg && file.data ? (
                            <img src={file.data} alt={file.name} className="w-9 h-9 rounded object-cover shrink-0" />
                          ) : (
                            <Icon className="w-5 h-5 text-[#0B4A3D] shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="text-[11px] font-semibold text-slate-700 truncate">{file.name}</div>
                            <div className="text-[9px] text-slate-400">{formatBytes(file.size)}</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeAttachment(index)}
                            aria-label={`Remove ${file.name}`}
                            className="p-1 text-slate-300 hover:text-rose-500 transition-colors cursor-pointer shrink-0"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

        </div>

        {/* ===== SIDEBAR (ERP create-cost-workout.html cards: document summary,
            cost summary, approval status, activity timeline — attachments now
            live in the main content area below Remarks) ===== */}
        <CwSidebar
          form={form}
          items={items}
          catCount={catCount}
          totals={totals}
          timeline={timeline}
          record={record}
        />
      </div>

      {/* ===== STICKY FOOTER (ERP standard creation action bar) =====
          The page header already carries the "Back to List" action. */}
      <CreationActionBar
        showBackToList={false}
        onCancel={handleCancel}
        onSaveDraft={() => saveAs('draft')}
        note={
          <span id="autosaveIndicator" className="text-[10px] font-semibold text-amber-600">
            {autosaveText}
          </span>
        }
        onSaveNew={() => saveAs('new')}
        onSave={() => saveAs('exit')}
        onSaveContinue={() => saveAs('continue')}
        onSubmit={() => saveAs('submit')}
        disabled={saving}
        locked={historical}
      />

      {/* ===== DIRTY LEAVE CONFIRM (ERP goBack) ===== */}
      <ConfirmDialog
        open={confirmLeave}
        title="Unsaved Changes"
        message="You have unsaved changes. Are you sure you want to leave?"
        confirmLabel="Leave"
        variant="warning"
        icon={X}
        onConfirm={() => {
          setConfirmLeave(false);
          navigate(CPR_HUB_TABS['cost-workout']);
        }}
        onCancel={() => setConfirmLeave(false)}
      />

      {/* ===== PER-ITEM DOCUMENTS =====
          One panel per cost item, opened from that item's Documents button. Every
          file staged here belongs to THIS item and is saved with it (the item is
          the source of truth — never an array position). */}
      <Modal
        open={docsItem !== null}
        onClose={() => setDocsItemKey(null)}
        title={
          docsItem
            ? `Documents — Item ${docsItemIndex + 1}${docsItem.description ? `: ${docsItem.description}` : ''}`
            : 'Documents'
        }
        maxWidth="max-w-2xl"
        footer={
          <button
            type="button"
            onClick={() => setDocsItemKey(null)}
            className="text-xs font-bold text-slate-600 bg-surface border border-slate-200 px-4 py-2 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
          >
            Done
          </button>
        }
      >
        {docsItem && (
          <div className="space-y-3">
            <div
              role="button"
              tabIndex={0}
              onClick={() => docsInputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') docsInputRef.current?.click();
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (e.dataTransfer?.files?.length > 0) handleItemFiles(docsItem.key, e.dataTransfer.files);
              }}
              className="border-2 border-dashed border-slate-300 rounded-lg py-5 px-4 text-center cursor-pointer transition-all hover:border-[#0B4A3D] hover:bg-[#E8F0EE]/50"
            >
              <CloudUpload className="w-5 h-5 text-[#0B4A3D] mx-auto mb-1.5" />
              <p className="text-xs font-semibold text-slate-700">
                Drag &amp; drop files or <span className="text-[#0B4A3D] font-bold">browse</span>
              </p>
              <p className="text-[10px] text-slate-400 mt-1">
                Attached to this cost item · up to {MAX_ATTACHMENT_SIZE_LABEL} per file
              </p>
            </div>
            <input
              ref={docsInputRef}
              type="file"
              multiple
              accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length > 0) handleItemFiles(docsItem.key, e.target.files);
                e.target.value = '';
              }}
            />

            {(docsItem.attachments || []).length === 0 ? (
              <p className="text-[11px] text-slate-400 text-center py-2">No documents attached to this item yet.</p>
            ) : (
              <div className="space-y-2">
                {docsItem.attachments.map((file, index) => {
                  const Icon = fileIcon(file.name);
                  const isImg = file.type && file.type.indexOf('image') === 0;
                  return (
                    <div
                      key={`${file.name}-${index}`}
                      className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2"
                    >
                      {isImg && file.data ? (
                        <img src={file.data} alt={file.name} className="w-9 h-9 rounded object-cover shrink-0" />
                      ) : (
                        <Icon className="w-5 h-5 text-[#0B4A3D] shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] font-semibold text-slate-700 truncate" title={file.name}>
                          {file.name}
                        </div>
                        <div className="text-[9px] text-slate-400">{formatBytes(file.size)}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => openItemAttachment(file)}
                        aria-label={`Open ${file.name}`}
                        title="Open"
                        className="p-1.5 text-slate-400 hover:text-[#0B4A3D] hover:bg-slate-100 rounded-md transition-colors shrink-0 cursor-pointer"
                      >
                        <FileText className="w-3.5 h-3.5" />
                      </button>
                      <a
                        href={file.data}
                        download={file.name}
                        aria-label={`Download ${file.name}`}
                        title="Download"
                        className="p-1.5 text-slate-400 hover:text-[#0B4A3D] hover:bg-slate-100 rounded-md transition-colors shrink-0"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </a>
                      <button
                        type="button"
                        onClick={() => removeItemAttachment(docsItem.key, index)}
                        aria-label={`Remove ${file.name}`}
                        title="Remove from this item"
                        className="p-1.5 text-slate-300 hover:text-rose-500 transition-colors cursor-pointer shrink-0"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            <p className="text-[10px] text-slate-400">
              Changes are saved with the Cost Workout (Save / Save Draft / Save and Continue).
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}
