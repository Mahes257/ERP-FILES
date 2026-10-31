import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  Calculator,
  CloudUpload,
  Eye,
  FileDown,
  FileText,
  Layers,
  Loader2,
  Paperclip,
  Plus,
  Printer,
  Save,
  StickyNote,
  Trash2,
  X,
} from 'lucide-react';
import { ConfirmDialog, CreationActionBar, EditableMasterDropdown, useToast } from '../../components/Common';
import useBulkPrefill from '../../hooks/useBulkPrefill';
import PwSidebar from '../../components/ProfitWorkout/PwSidebar';
import useClickOutside from '../../hooks/useClickOutside';
import profitWorkoutService from '../../services/profitWorkoutService';
import costWorkoutService from '../../services/costWorkoutService';
import customerService from '../../services/customerService';
import { getAttachmentSelectionError } from '../../utils/attachmentStorage';
import leadService from '../../services/leadService';
import cprService from '../../services/cprService';
import { normalizeCpr } from '../../utils/cprHelpers';
import {
  normalizePw,
  serializePw,
  pwToForm,
  pwItemToForm,
  calcPwTotals,
  customerPatchFromSource,
  cwToPwFormPatch,
  cwItemToPwFormItem
} from '../../utils/profitWorkoutHelpers';
import { PW_FORM_STATUSES, PW_SYSTEM_CATEGORIES } from '../../utils/profitWorkoutConstants';
import { formatINR, todayISO } from '../../utils/leadHelpers';
import { CPR_HUB_TABS } from '../../utils/navigationHelpers';

const CURRENCIES = [
  { code: 'INR', label: 'INR - Indian Rupee' },
  { code: 'USD', label: 'USD - US Dollar' },
  { code: 'EUR', label: 'EUR - Euro' },
  { code: 'GBP', label: 'GBP - British Pound' },
  { code: 'AED', label: 'AED - UAE Dirham' },
  { code: 'SGD', label: 'SGD - Singapore Dollar' },
  { code: 'AUD', label: 'AUD - Australian Dollar' },
  { code: 'CAD', label: 'CAD - Canadian Dollar' },
  { code: 'JPY', label: 'JPY - Japanese Yen' }
];

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
    // Legacy category rows are carried through untouched for records that were
    // created before the flat item model (round-trip preservation).
    categories: []
  };
}

function parsePageList(response) {
  if (Array.isArray(response)) return response;
  if (response?.content) return response.content;
  if (Array.isArray(response?.data)) return response.data;
  if (Array.isArray(response?.data?.content)) return response.data.content;
  return [];
}

export default function AddProfitWorkout() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const cprParam = searchParams.get('cpr');
  // Cost Workout → Profit Workout conversion deep-link (?sourceCw=<cw id>).
  const cwParam = searchParams.get('sourceCw');
  const editing = Boolean(id);
  const toast = useToast();

  const [form, setForm] = useState({
    pwNo: '',
    pwDate: todayISO(),
    status: 'draft',
    preparedBy: '',
    contactPerson: '',
    department: '',
    currency: 'INR',
    project: '',
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
    additionalCharges: '0',
    gstPct: '18',
    // Source Cost Workout of a conversion-prefilled form (payload provenance).
    sourceCwId: null,
    sourceCwNo: '',
    attachments: []
  });
  const [items, setItems] = useState(() => [newItem()]);
  // Bulk Upload: applies the extracted queue to this form for review — saving
  // still happens only through the existing Save buttons below. It is disabled
  // for a Cost Workout conversion so the extracted bulk record can never
  // overwrite the CW prefill.
  const bulkBanner = useBulkPrefill({ moduleKey: 'profitworkout', setForm, enabled: !editing && !cwParam });
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
  // A Cost Workout that could not be read during a conversion: the page shows
  // this error instead of an empty form that would look like a valid prefill.
  const [sourceCwError, setSourceCwError] = useState('');

  // ---- Lead/Client source combobox ----
  const [sourceOpen, setSourceOpen] = useState(false);
  const [sourceQuery, setSourceQuery] = useState('');
  const [sourceHighlight, setSourceHighlight] = useState(-1);
  const [sourceSelected, setSourceSelected] = useState(null);
  const sourceWrapRef = useRef(null);
  const sourceInputRef = useRef(null);
  const [sourcePos, setSourcePos] = useState(null);

  // ---- CPR search combobox ----
  const [cprOpen, setCprOpen] = useState(false);
  const [cprQuery, setCprQuery] = useState('');
  const [cprResults, setCprResults] = useState([]);
  const [cprHighlight, setCprHighlight] = useState(-1);
  const [cprSearching, setCprSearching] = useState(false);
  const cprWrapRef = useRef(null);
  const cprInputRef = useRef(null);
  const [cprPos, setCprPos] = useState(null);

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
  useClickOutside(cprWrapRef, () => setCprOpen(false), cprOpen);

  // Position a fixed-portal dropdown under its input (flips upward near the
  // bottom of the viewport, never clipped by overflow-hidden cards).
  const positionDd = (input, setPos) => {
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
    setPos({ left, width: rect.width, top, maxHeight });
  };

  useEffect(() => {
    if (!sourceOpen) return undefined;
    positionDd(sourceInputRef.current, setSourcePos);
    const onScroll = () => positionDd(sourceInputRef.current, setSourcePos);
    const onResize = () => positionDd(sourceInputRef.current, setSourcePos);
    document.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [sourceOpen]);

  useEffect(() => {
    if (!cprOpen) return undefined;
    positionDd(cprInputRef.current, setCprPos);
    const onScroll = () => positionDd(cprInputRef.current, setCprPos);
    const onResize = () => positionDd(cprInputRef.current, setCprPos);
    document.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [cprOpen]);

  // Debounced CPR search.
  useEffect(() => {
    if (!cprOpen) return undefined;
    let cancelled = false;
    const q = cprQuery.trim();
    setCprSearching(true);
    cprService
      .listCprs({ search: q || undefined, size: 20, page: 0 })
      .then((res) => {
        if (!cancelled) setCprResults(parsePageList(res));
      })
      .catch(() => {
        if (!cancelled) setCprResults([]);
      })
      .finally(() => {
        if (!cancelled) setCprSearching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [cprOpen, cprQuery]);

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

  // Hydrate customer fields from a selected/linked CPR (denormalized copies).
  const hydrateFromCpr = (cpr) => {
    const cprBase = {
      cprRef: cpr.prNo || '',
      linkedCpr: cpr.prNo || '',
      cprId: cpr.id != null ? String(cpr.id) : ''
    };
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
  };

  const applyCprSelection = (cpr, markDirtyFlag = true) => {
    hydrateFromCpr(cpr);
    const label = cpr.sourceLead || cpr.clientName || cpr.company || '';
    if (label) {
      setSourceSelected({ type: 'client', id: null, label });
      setForm((prev) => ({ ...prev, sourceLead: label }));
    }
    setCprQuery('');
    setCprOpen(false);
    setCprHighlight(-1);
    if (markDirtyFlag) markDirty();
  };

  // Resolve the lead behind a lead-sourced CPR (numeric leadNo) and autofill
  // every customer field from the live Lead record.
  const hydrateLeadForCpr = async (cpr) => {
    const leadNo = String(cpr.leadNo || '').trim();
    const isLeadSourced = /^\d+$/.test(leadNo);
    if (!isLeadSourced) {
      applyCprSelection(cpr, false);
      return;
    }
    try {
      const leadRes = await leadService.getLead(leadNo);
      const lead = leadRes?.data ?? leadRes;
      if (!lead || typeof lead !== 'object' || lead.id == null) throw new Error('lead not resolvable');
      const leadItem = {
        type: 'lead',
        id: lead.id != null ? lead.id : Number(leadNo),
        code: lead.leadNo || lead.id || leadNo,
        name: lead.company || lead.businessName || lead.name || lead.customerName || '',
        data: lead
      };
      const label = `${leadItem.name} (Lead No: ${leadItem.code})`;
      setSourceSelected({ type: 'lead', id: leadItem.id, label });
      setForm((prev) => ({
        ...prev,
        cprRef: cpr.prNo || '',
        linkedCpr: cpr.prNo || '',
        cprId: cpr.id != null ? String(cpr.id) : '',
        sourceLead: label,
        ...customerPatchFromSource({ ...leadItem, label })
      }));
      setCprQuery('');
      setCprOpen(false);
      setCprHighlight(-1);
    } catch {
      applyCprSelection(cpr, false);
    }
  };

  // ---- Cost Workout conversion deep-link (?sourceCw=<id>) ----
  // Reads the selected Cost Workout and prefills the creation form with it.
  // This performs reads only: no Profit Workout is created here (saving happens
  // solely through the existing Save buttons, which is also when the server
  // records the CW conversion back-link). Mirrors the server-side mapping in
  // ProfitWorkoutService#createFromCostWorkout so both paths agree.
  const hydrateFromCostWorkout = async (cwId, isCancelled) => {
    // Both reads are auxiliary: their failure is rendered on this page, so they
    // must never replace the route with the global error screen.
    const res = await costWorkoutService.getCw(cwId, { suppressGlobalError: true });
    const cw = res?.data?.data ?? res?.data ?? res;
    if (!cw || cw.id == null) throw new Error('Cost Workout not found');
    // One Cost Workout → one Profit Workout: an already-converted Cost Workout
    // opens the Profit Workout it produced instead of a second (unsavable) form.
    if (cw.convertedToPw) {
      // Named by its customer: the CW number is internal and never displayed.
      toast.warning(`Cost Workout ${cw.customerName || cw.company || ''} is already converted to ${cw.convertedToPw}`.replace(/\s+/g, ' ').trim());
      navigate(cw.convertedToPwId ? `/profit-workouts/${cw.convertedToPwId}` : CPR_HUB_TABS['profit-workout']);
      return false;
    }
    const patch = cwToPwFormPatch(cw);
    setForm((prev) => ({ ...prev, ...patch }));
    if (patch.sourceLead) {
      setSourceSelected({ type: 'client', id: null, label: patch.sourceLead });
    }
    const cwItems = Array.isArray(cw.items) ? cw.items : [];
    const mapped = cwItems.map((cwItem) => {
      itemIdCounter += 1;
      return { key: itemIdCounter, ...cwItemToPwFormItem(cwItem, patch.profitPct) };
    });
    setItems(mapped.length > 0 ? mapped : [newItem()]);
    // Project / currency: the Cost Workout stores neither. When it is linked to
    // a CPR, the CPR's project and its client's currency are the actual values
    // the conversion used, so they are reused (existing services only). Both
    // lookups are best-effort — a failure keeps the form's own defaults.
    if (cw.cprId) {
      try {
        const cprRes = await cprService.getCpr(cw.cprId, { suppressGlobalError: true });
        const cpr = normalizeCpr(cprRes?.data ?? cprRes ?? {});
        if (cpr.project && !isCancelled()) {
          setForm((prev) => ({ ...prev, project: prev.project || cpr.project }));
        }
        if (cpr.clientId != null) {
          const clientRes = await customerService.get(cpr.clientId, { suppressGlobalError: true });
          const client = clientRes?.data ?? clientRes ?? {};
          const currency = String(client.currency || '').trim().toUpperCase();
          if (currency && !isCancelled()) setForm((prev) => ({ ...prev, currency }));
        }
      } catch {
        // project / currency are optional enrichments
      }
    }
    // Attachments are self-contained base64 documents in both modules, so the
    // CW files can be carried over without any external reference to break.
    try {
      const attRes = await costWorkoutService.getAttachments(cw.id, { suppressGlobalError: true });
      const attachments = Array.isArray(attRes) ? attRes : attRes?.data ?? [];
      const valid = attachments
        .map((f) => ({ name: f.name || '', size: Number(f.size) || 0, type: f.type || '', data: f.data || '' }))
        .filter((f) => f.name && f.data);
      if (!isCancelled() && valid.length > 0) {
        setForm((prev) => ({ ...prev, attachments: valid }));
      }
    } catch {
      // attachments optional
    }
    return true;
  };

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      if (editing) {
        setLoading(true);
        try {
          const res = await profitWorkoutService.getPw(id);
          if (cancelled) return;
          const data = normalizePw(res?.data ?? res);
          setHistorical(data.latestRevision === false);
          setRecord(data);
          const f = pwToForm(data);
          setForm(f);
          // Show the persisted source in the Lead/Client selector on edit (the
          // record stores the display label; mirror the manual-flow input).
          if (f.sourceLead) {
            setSourceSelected({ type: 'client', id: null, label: f.sourceLead });
          }
          const itemsList = (Array.isArray(data.items) ? data.items : []).map((it) => {
            itemIdCounter += 1;
            return { key: itemIdCounter, ...pwItemToForm(it) };
          });
          setItems(itemsList.length > 0 ? itemsList : [newItem()]);
          try {
            const attRes = await profitWorkoutService.getAttachments(id);
            if (!cancelled && Array.isArray(attRes)) {
              setForm((prev) => ({ ...prev, attachments: attRes }));
            }
          } catch {
            // attachments optional
          }
        } catch (err) {
          toast.error(err?.message || 'Failed to load Profit Workout');
          navigate(CPR_HUB_TABS['profit-workout']);
        } finally {
          if (!cancelled) setLoading(false);
        }
      } else {
        try {
          const res = await profitWorkoutService.getNextNumber();
          if (cancelled) return;
          const data = res?.data ?? res ?? {};
          setForm((prev) => ({ ...prev, pwNo: data.pwNo || prev.pwNo }));
        } catch {
          // number can be entered manually
        }
        if (cwParam) {
          try {
            const applied = await hydrateFromCostWorkout(cwParam, () => cancelled);
            if (applied === false) return;
          } catch (err) {
            if (cancelled) return;
            // A Cost Workout that cannot be read must never leave a blank form
            // looking like a successful conversion: the page renders this error
            // in place of the form, so nothing can be saved from it.
            const message = err?.message || 'Failed to load the Cost Workout';
            setSourceCwError(message);
            toast.error(message);
          }
        }
        if (cprParam) {
          try {
            const cprRes = await cprService.getCpr(cprParam);
            if (cancelled) return;
            const cpr = normalizeCpr(cprRes?.data ?? cprRes ?? {});
            await hydrateLeadForCpr(cpr);
          } catch {
            // prefill is optional; the form still works with manual entry
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, id, navigate, toast, cprParam, cwParam]);

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
      const payload = serializePw({ ...formRef.current, status: 'draft' }, itemsRef.current);
      // draft=true: background persistence must never fabricate a revision —
      // the backend updates the row in place (CPR-parity autosave contract).
      profitWorkoutService
        .updatePw(existingId, payload, true)
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

  // Live frontend calculation — one shared utility, recomputed on every edit.
  const totals = useMemo(
    () => calcPwTotals(items, form.profitPct, form.discountPct, form.gstPct, form.additionalCharges),
    [items, form.profitPct, form.discountPct, form.gstPct, form.additionalCharges]
  );

  // ---- Lead/Client source combobox ----
  const autofillFromSource = (item) => {
    setForm((prev) => ({ ...prev, sourceLead: item.label, ...customerPatchFromSource(item) }));
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

  // ---- CPR combobox ----
  const handleCprInput = (v) => {
    setCprQuery(v);
    if (form.cprRef && !v) {
      // clearing the search clears the linked CPR reference
      setForm((prev) => ({ ...prev, cprRef: '', linkedCpr: '', cprId: '' }));
    }
  };

  const handleCprKeyDown = (e) => {
    if (!cprOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setCprOpen(true);
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCprHighlight((h) => (h < cprResults.length - 1 ? h + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCprHighlight((h) => (h > 0 ? h - 1 : cprResults.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (cprHighlight >= 0 && cprResults[cprHighlight]) applyCprSelection(cprResults[cprHighlight]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setCprOpen(false);
    }
  };

  const clearCprSelection = () => {
    setForm((prev) => ({ ...prev, cprRef: '', linkedCpr: '', cprId: '' }));
    setCprQuery('');
    markDirty();
  };

  // ---- Item grid (flat model) ----
  const updateItem = (itemKey, patch) => {
    setItems((prev) => prev.map((item) => (item.key === itemKey ? { ...item, ...patch } : item)));
    markDirty();
  };

  const addItem = () => {
    setItems((prev) => [...prev, newItem()]);
    markDirty();
  };

  // "+ Add Category" quickly adds a new item row pre-set to the next system
  // category not already used in the grid (kept from the legacy batch action).
  const addCategoryRow = () => {
    const used = new Set(items.map((i) => String(i.category || '').toLowerCase()));
    const next = PW_SYSTEM_CATEGORIES.find((c) => !used.has(c.toLowerCase())) || 'Material Cost';
    setItems((prev) => [...prev, newItem('', next)]);
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

  const clearAllItems = () => {
    setItems([newItem()]);
    markDirty();
  };

  // When a category is deleted from the master list, reset any rows that still
  // reference it back to 'Material Cost' (mirrors the ERP delete behavior).
  const handleCategoryDeleted = (name) => {
    if (!name) return;
    setItems((prev) =>
      prev.map((item) => (item.category === name ? { ...item, category: 'Material Cost', unit: 'Nos' } : item))
    );
    markDirty();
  };

  // ---- Attachments (ERP upload zone, shared per-file limit) ----
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

  // ---- Validation ----
  const validate = () => {
    const next = {};
    if (!form.pwDate) next.pwDate = 'Date is required';
    if (!form.preparedBy) next.preparedBy = 'Prepared By is required';
    if (!form.department) next.department = 'Department is required';
    if (!form.sourceLead) next.sourceLead = 'Please select a Lead or Client';
    if (form.remarks && form.remarks.length > 100000) next.remarks = 'Remarks exceed maximum length of 100000 characters';
    const hasContent = items.some((item) => {
      const hasLegacyCat = (Array.isArray(item.categories) ? item.categories : []).some(
        (cat) => Number(cat.qty) > 0 || Number(cat.rate) > 0 || String(cat.category || '').toLowerCase() === 'lead time'
      );
      return Boolean(item.description) || Number(item.costRate) > 0 || Number(item.sellingRate) > 0 || hasLegacyCat;
    });
    if (!hasContent) next.items = 'Add at least one item with a description, cost rate or selling rate';
    for (const item of items) {
      if (Number(item.qty) < 0) {
        next.items = 'Quantity cannot be negative';
        break;
      }
      if (Number(item.costRate) < 0) {
        next.items = 'Cost Rate cannot be negative';
        break;
      }
      if (Number(item.sellingRate) < 0) {
        next.items = 'Selling Rate cannot be negative';
        break;
      }
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const resetForm = async () => {
    setForm({
      pwNo: '',
      pwDate: todayISO(),
      status: 'draft',
      preparedBy: '',
      contactPerson: '',
      department: '',
      currency: 'INR',
      project: '',
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
      additionalCharges: '0',
      gstPct: '18',
      sourceCwId: null,
      sourceCwNo: '',
      attachments: []
    });
    setItems([newItem()]);
    setErrors({});
    setSourceSelected(null);
    clearDirty();
    try {
      const res = await profitWorkoutService.getNextNumber();
      const data = res?.data ?? res ?? {};
      setForm((prev) => ({ ...prev, pwNo: data.pwNo || prev.pwNo }));
    } catch {
      // number can be entered manually
    }
  };

  // ---- Save semantics (matches ERP CWCreate.save / submitForApproval) ----
  const saveAs = async (action) => {
    if (action !== 'draft' && action !== 'preview' && action !== 'print' && action !== 'pdf' && !validate()) {
      toast.error('Please fix the highlighted fields');
      return;
    }
    setSaving(true);
    savingRef.current = true;
    // Only "Save Draft" persists Draft; "Save & New", "Save" and
    // "Submit for Approval" persist Completed (Status dropdown overridden).
    // Preview / Print / PDF are document actions — they save as Draft so the
    // persisted workflow status is never changed by opening the document.
    const isDraftLike = action === 'draft' || action === 'preview' || action === 'print' || action === 'pdf';
    const status = isDraftLike ? 'draft' : 'completed';
    const payload = serializePw({ ...form, status }, items);
    try {
      const existingId = savedIdRef.current || (editing ? id : null);
      const res = existingId
        // Draft-like saves (Save Draft / preview / print / pdf) persist as
        // draft: in-place update, NO revision (first explicit save of a
        // draft-born record commits it in place server-side — no revision).
        ? await profitWorkoutService.updatePw(existingId, payload, isDraftLike)
        // A conversion-prefilled create reports its own rejection (e.g. the Cost
        // Workout already produced a Profit Workout) instead of replacing the
        // reviewed form with the global error screen.
        : await profitWorkoutService.createPw(payload, isDraftLike, {
            suppressGlobalError: Boolean(payload.sourceCwId)
          });
      const data = res?.data ?? res ?? {};
      const savedId = data.id || existingId;
      if (savedId) savedIdRef.current = savedId;
      if (data.pwNo) setForm((prev) => ({ ...prev, pwNo: data.pwNo }));
      clearDirty();
      if (action === 'draft') {
        addTimeline('saved', 'Profit Workout saved');
        toast.success('Draft saved');
      } else if (action === 'new') {
        addTimeline('saved', 'Profit Workout saved');
        toast.success('Profit Workout saved');
        savedIdRef.current = null;
        await resetForm();
      } else if (action === 'continue') {
        // Save and Continue: the backend has already confirmed the record (we
        // are past the await above), so open the saved Profit Workout's View
        // page — the same record page the list's View action opens. The Save
        // action keeps opening the document Preview (/design).
        addTimeline('saved', 'Profit Workout saved');
        toast.success(editing ? 'Profit Workout updated' : 'Profit Workout saved');
        savedIdRef.current = null;
        navigate(savedId ? `/profit-workouts/${savedId}` : CPR_HUB_TABS['profit-workout']);
      } else if (action === 'submit') {
        let submitId = savedId;
        if (data?.id) {
          const subRes = await profitWorkoutService.submitPw(data.id);
          submitId = subRes?.data?.id ?? data.id;
        }
        addTimeline('submitted', 'Submitted for approval');
        toast.success('Profit Workout submitted for approval');
        navigate(`/profit-workouts/${submitId}`);
      } else if (action === 'preview') {
        navigate(savedId ? `/profit-workouts/design?id=${savedId}` : CPR_HUB_TABS['profit-workout']);
      } else if (action === 'print') {
        navigate(savedId ? `/profit-workouts/design?id=${savedId}&print=1` : CPR_HUB_TABS['profit-workout']);
      } else if (action === 'pdf') {
        navigate(savedId ? `/profit-workouts/design?id=${savedId}&pdf=1` : CPR_HUB_TABS['profit-workout']);
      } else {
        addTimeline('saved', 'Profit Workout saved');
        toast.success(editing ? 'Profit Workout updated' : 'Profit Workout saved');
        savedIdRef.current = null;
        // Save & Continue: open the Profit Workout Preview (design page) directly
        // instead of navigating back to the list first.
        navigate(savedId ? `/profit-workouts/design?id=${savedId}` : CPR_HUB_TABS['profit-workout']);
      }
    } catch (err) {
      toast.error(err?.message || 'Failed to save Profit Workout');
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
    navigate(CPR_HUB_TABS['profit-workout']);
  };

  const fieldError = (key) =>
    errors[key] ? <div className="text-[10px] font-semibold text-rose-600 mt-1">{errors[key]}</div> : null;

  const inputCls = (hasError) =>
    `w-full bg-slate-50 border ${hasError ? 'border-rose-400' : 'border-slate-200'} rounded-lg px-2.5 py-2 text-xs text-slate-700 outline-none focus:border-emerald-600/50 transition-all`;

  const cellInputCls = 'w-full bg-transparent border border-transparent hover:border-slate-200 focus:border-emerald-600/50 rounded px-1.5 py-1.5 text-xs outline-none transition-colors';

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-10">
        <Loader2 className="w-6 h-6 text-[#0B4A3D] animate-spin" />
      </div>
    );
  }

  // Conversion source unreadable — no form, therefore no accidental save.
  if (sourceCwError) {
    return (
      <div className="erp-create-scope flex-1 bg-app font-sans antialiased text-slate-800 p-4 sm:p-6 w-full max-w-[100vw] overflow-x-hidden">
        <div className="max-w-xl mx-auto mt-12 bg-surface border border-rose-200 rounded-xl shadow-sm p-6 text-center">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-rose-50 text-rose-500 mb-3">
            <X className="w-5 h-5" />
          </div>
          <h1 className="text-base font-bold text-slate-800">Cost Workout could not be loaded</h1>
          <p className="text-xs text-slate-500 mt-1.5">{sourceCwError}</p>
          <p className="text-xs text-slate-500 mt-1">
            Nothing was created or changed. Open the Cost Workout again from the list and retry the conversion.
          </p>
          <button
            type="button"
            onClick={() => navigate(CPR_HUB_TABS['cost-workout'])}
            className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-white bg-[#0B4A3D] hover:bg-[#083D34] px-4 py-2.5 rounded-lg transition-colors cursor-pointer"
          >
            Back to Cost Workouts
          </button>
        </div>
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
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 mb-3 select-none flex-wrap">
        <span>VISHAK TECH</span>
        <span>&gt;</span>
        <span>Sales</span>
        <span>&gt;</span>
        <span>Customer Purchase Request</span>
        <span>&gt;</span>
        <button type="button" onClick={() => navigate(CPR_HUB_TABS['profit-workout'])} className="hover:text-slate-600 cursor-pointer">
          Profit Workouts
        </button>
        <span>&gt;</span>
        <span className="text-slate-600">{editing ? 'Edit Profit Workout' : 'New Profit Workout'}</span>
      </div>

      {/* ===== HEADER ===== */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-5">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleCancel}
            aria-label="Back to list"
            className="flex items-center justify-center w-9 h-9 rounded-lg bg-surface border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors cursor-pointer select-none shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="flex items-center gap-2.5 text-2xl font-bold text-slate-900 tracking-tight">
              {editing ? 'Edit Profit Workout' : 'New Profit Workout'}
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-[20px] text-[11px] font-semibold bg-emerald-50 text-emerald-700">
                {form.status === 'completed' ? 'Completed' : 'Draft'}
              </span>
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              {form.sourceCwNo
                ? `Prefilled from Cost Workout ${form.sourceCwNo} — review and edit before saving.`
                : 'Profit calculation for quotations.'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => saveAs('draft')}
            disabled={saving || historical}
            className="flex items-center gap-1.5 text-xs font-bold text-white bg-[#0B4A3D] hover:bg-[#083D34] px-4 py-2.5 rounded-lg transition-colors shadow-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed select-none"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save
          </button>
          <button
            type="button"
            onClick={() => saveAs('preview')}
            disabled={saving || historical}
            className="flex items-center gap-1.5 text-xs font-bold text-slate-600 bg-surface border border-slate-200 px-3.5 py-2.5 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed select-none"
          >
            <Eye className="w-3.5 h-3.5" /> Preview
          </button>
          <button
            type="button"
            onClick={() => saveAs('print')}
            disabled={saving || historical}
            className="flex items-center gap-1.5 text-xs font-bold text-slate-600 bg-surface border border-slate-200 px-3.5 py-2.5 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed select-none"
          >
            <Printer className="w-3.5 h-3.5" /> Print
          </button>
          <button
            type="button"
            onClick={() => saveAs('pdf')}
            disabled={saving || historical}
            className="flex items-center gap-1.5 text-xs font-bold text-slate-600 bg-surface border border-slate-200 px-3.5 py-2.5 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed select-none"
          >
            <FileDown className="w-3.5 h-3.5" /> Download PDF
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6 items-start">
        <div className="space-y-5 min-w-0">
          {/* ===== CARD 1: DOCUMENT INFORMATION ===== */}
          <div className="bg-surface border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2">
              <FileText className="w-4 h-4 text-[#0B4A3D]" />
              <h2 className="text-sm font-bold text-slate-800">Document Information</h2>
            </div>
            <div className="p-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Profit Workout No.</label>
                <input
                  type="text"
                  value={form.pwNo}
                  onChange={(e) => setField('pwNo', e.target.value)}
                  placeholder="Auto-generated"
                  className={`${inputCls(false)} text-slate-400`}
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">
                  Date <span className="text-rose-500">*</span>
                </label>
                <input type="date" value={form.pwDate} onChange={(e) => setField('pwDate', e.target.value)} className={inputCls(errors.pwDate)} />
                {fieldError('pwDate')}
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Status</label>
                <select
                  value={form.status}
                  onChange={(e) => setField('status', e.target.value)}
                  className={`${inputCls(false)} cursor-pointer`}
                >
                  {PW_FORM_STATUSES.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">CPR Reference</label>
                <div ref={cprWrapRef} className="relative">
                  <input
                    ref={cprInputRef}
                    type="text"
                    value={cprOpen ? cprQuery : form.cprRef || ''}
                    onChange={(e) => handleCprInput(e.target.value)}
                    onFocus={() => setCprOpen(true)}
                    onKeyDown={handleCprKeyDown}
                    placeholder="Search CPR..."
                    autoComplete="off"
                    className={`${inputCls(false)} pr-8 cursor-text`}
                  />
                  {cprOpen &&
                    createPortal(
                      <div
                        className="fixed z-[9999] bg-surface border border-slate-200 rounded-lg shadow-lg overflow-y-auto"
                        style={{
                          left: cprPos?.left,
                          width: cprPos?.width,
                          top: cprPos?.top,
                          maxHeight: cprPos?.maxHeight,
                          display: cprPos ? 'block' : 'none'
                        }}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                      >
                        {cprSearching && (
                          <div className="flex items-center gap-2 px-3 py-2.5 text-[11px] text-slate-400">
                            <Loader2 className="w-3 h-3 animate-spin" /> Searching CPRs...
                          </div>
                        )}
                        {!cprSearching && cprResults.length === 0 && (
                          <div className="px-3 py-2.5 text-[11px] text-slate-400">No CPRs found</div>
                        )}
                        {!cprSearching &&
                          cprResults.map((cpr, i) => (
                            <button
                              key={cpr.id ?? `${cpr.prNo}-${i}`}
                              type="button"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                hydrateLeadForCpr(cpr);
                              }}
                              onMouseEnter={() => setCprHighlight(i)}
                              className={`w-full text-left px-3 py-2 border-b border-slate-50 transition-colors cursor-pointer ${
                                i === cprHighlight ? 'bg-[#E8F0EE] text-[#0B4A3D]' : 'hover:bg-slate-50'
                              }`}
                            >
                              <div className="text-xs font-semibold text-slate-700">{cpr.prNo || `CPR-${cpr.id}`}</div>
                              <div className="text-[10px] text-slate-400">
                                {cpr.clientName || cpr.sourceLead || cpr.company || '—'}
                              </div>
                            </button>
                          ))}
                      </div>,
                      document.body
                    )}
                  {form.cprRef && !cprOpen && (
                    <button
                      type="button"
                      onClick={clearCprSelection}
                      aria-label="Clear CPR selection"
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-slate-300 hover:text-rose-500 transition-colors cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                {fieldError('cprRef')}
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
              <div className="xl:col-span-2">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">
                  Customer / Lead <span className="text-rose-500">*</span>
                </label>
                <div ref={sourceWrapRef} className="relative">
                  <input
                    ref={sourceInputRef}
                    type="text"
                    value={sourceOpen ? sourceQuery : sourceSelected ? sourceSelected.label : ''}
                    onChange={(e) => handleSourceInput(e.target.value)}
                    onFocus={() => setSourceOpen(true)}
                    onKeyDown={handleSourceKeyDown}
                    placeholder="Search Customer or Lead..."
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
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Project</label>
                <input
                  type="text"
                  value={form.project}
                  onChange={(e) => setField('project', e.target.value)}
                  placeholder="Search Project..."
                  className={inputCls(false)}
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">
                  Currency <span className="text-rose-500">*</span>
                </label>
                <select
                  value={form.currency}
                  onChange={(e) => setField('currency', e.target.value)}
                  className={`${inputCls(false)} cursor-pointer`}
                >
                  {CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2 xl:col-span-3">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Shipping Address</label>
                <textarea
                  rows={2}
                  value={form.shippingAddress}
                  onChange={(e) => setField('shippingAddress', e.target.value)}
                  placeholder="Enter shipping address..."
                  className={inputCls(false)}
                />
              </div>
            </div>
          </div>

          {/* ===== CARD 2: PROFIT ITEMS BREAKDOWN ===== */}
          <div className="bg-surface border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-[#0B4A3D]" />
                <h2 className="text-sm font-bold text-slate-800">Profit Items Breakdown</h2>
              </div>
              <div className="flex items-center gap-1.5">
                <button type="button" onClick={addItem} className="flex items-center gap-1 text-[11px] font-bold text-white bg-[#0B4A3D] hover:bg-[#083D34] px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer">
                  <Plus className="w-3.5 h-3.5" /> Add Item
                </button>
                <button type="button" onClick={addCategoryRow} className="flex items-center gap-1 text-[11px] font-bold text-slate-600 bg-surface border border-slate-200 px-2.5 py-1.5 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer">
                  <Layers className="w-3.5 h-3.5" /> Add Category
                </button>
                <button type="button" onClick={clearAllItems} className="flex items-center gap-1 text-[11px] font-bold text-slate-600 bg-surface border border-slate-200 px-2.5 py-1.5 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer">
                  <Trash2 className="w-3.5 h-3.5" /> Clear All
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
                <colgroup>
                  <col style={{ width: 36 }} />
                  <col style={{ width: 170 }} />
                  <col style={{ width: 62 }} />
                  <col style={{ width: 130 }} />
                  <col style={{ width: 90 }} />
                  <col style={{ width: 95 }} />
                  <col style={{ width: 95 }} />
                  <col style={{ width: 95 }} />
                  <col style={{ width: 95 }} />
                  <col style={{ width: 85 }} />
                  <col style={{ width: 95 }} />
                  <col style={{ width: 75 }} />
                  <col style={{ width: 40 }} />
                </colgroup>
                <thead>
                  <tr className="bg-slate-100/80 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                    <th className="py-2 px-2 text-center">#</th>
                    <th className="py-2 px-2 text-left">Description</th>
                    <th className="py-2 px-2 text-center">Qty</th>
                    <th className="py-2 px-2 text-left">Category</th>
                    <th className="py-2 px-2 text-center">Unit</th>
                    <th className="py-2 px-2 text-right">Cost Rate (₹)</th>
                    <th className="py-2 px-2 text-right">Selling Rate (₹)</th>
                    <th className="py-2 px-2 text-right">Cost Amount (₹)</th>
                    <th className="py-2 px-2 text-right">Selling Amount (₹)</th>
                    <th className="py-2 px-2 text-right">Profit / Unit (₹)</th>
                    <th className="py-2 px-2 text-right">Profit Amount (₹)</th>
                    <th className="py-2 px-2 text-right">Margin %</th>
                    <th className="py-2 px-2 text-center" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, index) => {
                    const row = totals.rows.find((r) => r.key === item.key);
                    const margin = row ? row.margin : 0;
                    return (
                      <tr key={item.key} className="border-b border-slate-100 align-top">
                        <td className="px-2 py-2 text-xs text-slate-400 text-center">{index + 1}</td>
                        <td className="px-2 py-2">
                          <input
                            type="text"
                            value={item.description}
                            onChange={(e) => updateItem(item.key, { description: e.target.value })}
                            placeholder="Enter description"
                            className={cellInputCls}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.qty}
                            onChange={(e) => updateItem(item.key, { qty: e.target.value })}
                            className={`${cellInputCls} text-center`}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <EditableMasterDropdown
                            masterKey="cw_categories"
                            value={item.category}
                            onChange={(v) => updateItem(item.key, { category: v })}
                            onDeleted={handleCategoryDeleted}
                            placeholder="Select Category"
                            portal
                            inputClassName="w-full bg-transparent border border-transparent hover:border-slate-200 focus:border-emerald-600/50 rounded px-1.5 py-1.5 text-xs outline-none cursor-text transition-colors"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <EditableMasterDropdown
                            masterKey="cw_units"
                            value={item.unit}
                            onChange={(u) => updateItem(item.key, { unit: u })}
                            placeholder="Unit"
                            portal
                            inputClassName="w-full bg-transparent border border-transparent hover:border-slate-200 focus:border-emerald-600/50 rounded px-1.5 py-1.5 pr-5 text-xs outline-none cursor-text transition-colors"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.costRate}
                            onChange={(e) => updateItem(item.key, { costRate: e.target.value })}
                            placeholder="0.00"
                            className={`${cellInputCls} text-right`}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.sellingRate}
                            onChange={(e) => updateItem(item.key, { sellingRate: e.target.value })}
                            placeholder="0.00"
                            className={`${cellInputCls} text-right`}
                          />
                        </td>
                        <td className="px-2 py-2 text-right text-xs font-semibold text-slate-700 whitespace-nowrap">
                          {row ? formatINR(row.costAmount) : formatINR(0)}
                        </td>
                        <td className="px-2 py-2 text-right text-xs font-semibold text-slate-700 whitespace-nowrap">
                          {row ? formatINR(row.sellingAmount) : formatINR(0)}
                        </td>
                        <td className={`px-2 py-2 text-right text-xs font-semibold whitespace-nowrap ${row && row.profitPerUnit < 0 ? 'text-rose-600' : 'text-slate-700'}`}>
                          {row ? formatINR(row.profitPerUnit) : formatINR(0)}
                        </td>
                        <td className={`px-2 py-2 text-right text-xs font-bold whitespace-nowrap ${row && row.profitAmount < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                          {row ? formatINR(row.profitAmount) : formatINR(0)}
                        </td>
                        <td className={`px-2 py-2 text-right text-xs font-semibold whitespace-nowrap ${row && row.margin < 0 ? 'text-rose-600' : 'text-slate-700'}`}>
                          {row ? `${row.margin.toFixed(2)}%` : '0.00%'}
                        </td>
                        <td className="px-2 py-2 text-center">
                          <button
                            type="button"
                            onClick={() => removeItem(item.key)}
                            aria-label="Delete item"
                            title="Delete item"
                            className="p-1 text-slate-300 hover:text-rose-500 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 text-xs font-bold text-slate-700">
                    <td className="px-2 py-2.5 text-center" colSpan={1}>TOTAL</td>
                    <td className="px-2 py-2.5" />
                    <td className="px-2 py-2.5 text-center">{totals.totalQty}</td>
                    <td className="px-2 py-2.5" colSpan={3} />
                    <td className="px-2 py-2.5 text-right whitespace-nowrap">{formatINR(totals.totalCost)}</td>
                    <td className="px-2 py-2.5 text-right whitespace-nowrap">{formatINR(totals.totalSelling)}</td>
                    <td className="px-2 py-2.5" />
                    <td className={`px-2 py-2.5 text-right whitespace-nowrap ${totals.totalProfit < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                      {formatINR(totals.totalProfit)}
                    </td>
                    <td className="px-2 py-2.5 text-right whitespace-nowrap">{totals.profitPct.toFixed(2)}%</td>
                    <td className="px-2 py-2.5" />
                  </tr>
                </tfoot>
              </table>
            </div>
            {errors.items && <div className="px-5 pb-3 text-[10px] font-semibold text-rose-600">{errors.items}</div>}
          </div>

          {/* ===== CARD 3: PROFIT BREAKDOWN & PRICING + REMARKS ===== */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
            <div className="bg-surface border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2">
                <Calculator className="w-4 h-4 text-[#0B4A3D]" />
                <h2 className="text-sm font-bold text-slate-800">Profit Breakdown &amp; Pricing</h2>
              </div>
              <div className="p-5">
                <div className="max-w-xl space-y-[3px]">
                  <div className="flex items-center justify-between py-[5px] text-xs">
                    <span className="text-slate-700">Total Cost (Subtotal)</span>
                    <span className="font-semibold text-slate-800">{formatINR(totals.totalCost)}</span>
                  </div>
                  <div className="flex items-center justify-between py-[5px] text-xs">
                    <span className="text-slate-700">Total Selling Value</span>
                    <span className="font-semibold text-slate-800">{formatINR(totals.totalSelling)}</span>
                  </div>
                  <div className="flex items-center justify-between py-[5px] text-xs">
                    <span className="text-slate-700">Total Profit</span>
                    <span className={`font-bold ${totals.totalProfit < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                      {formatINR(totals.totalProfit)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-[5px] text-xs">
                    <span className="text-slate-700">Profit %</span>
                    <span className={`font-bold ${totals.profitPct < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                      {totals.profitPct.toFixed(2)}%
                    </span>
                  </div>
                  <div className="border-t border-slate-100 mt-2 pt-2">
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
                      <span className="font-semibold text-slate-800">− {formatINR(totals.discountAmt)}</span>
                    </div>
                    <div className="flex items-center justify-between py-[5px] text-xs">
                      <span className="text-slate-700">Additional Charges</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={form.additionalCharges}
                        onChange={(e) => setField('additionalCharges', e.target.value)}
                        className="w-20 h-7 bg-slate-50 border border-slate-200 rounded-md px-2 text-xs text-right outline-none focus:border-emerald-600/50"
                      />
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
                  </div>
                  <div className="mt-2 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2.5 flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800">Grand Total (Including GST)</span>
                    <span className="text-sm font-extrabold text-[#0B4A3D]">{formatINR(totals.grandTotal)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* ===== REMARKS ===== */}
            <div className="bg-surface border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2">
                <StickyNote className="w-4 h-4 text-[#0B4A3D]" />
                <h2 className="text-sm font-bold text-slate-800">Remarks</h2>
              </div>
              <div className="p-5">
                <textarea
                  rows={9}
                  value={form.remarks}
                  onChange={(e) => setField('remarks', e.target.value)}
                  placeholder="Additional notes or remarks..."
                  className={`w-full bg-slate-50 border ${errors.remarks ? 'border-rose-400' : 'border-slate-200'} rounded-lg px-3 py-2.5 text-xs text-slate-700 outline-none focus:border-emerald-600/50 transition-all`}
                />
                <div className="flex items-center justify-between mt-1">
                  {fieldError('remarks')}
                  <span className="text-[10px] text-slate-400 ml-auto">{(form.remarks || '').length} chars</span>
                </div>
              </div>
            </div>
          </div>

          {/* ===== CARD 4: ATTACHMENTS ===== */}
          <div className="bg-surface border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2">
              <Paperclip className="w-4 h-4 text-[#0B4A3D]" />
              <h2 className="text-sm font-bold text-slate-800">Attachments</h2>
            </div>
            <div className="p-5">
              <div
                role="button"
                tabIndex={0}
                onClick={() => document.getElementById('pw-file-input')?.click()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') document.getElementById('pw-file-input')?.click();
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  handleFiles(e.dataTransfer?.files);
                }}
                className="border-2 border-dashed border-slate-300 rounded-xl py-8 px-4 text-center cursor-pointer transition-all hover:border-[#0B4A3D] hover:bg-[#E8F0EE]/50"
              >
                <CloudUpload className="w-7 h-7 text-[#0B4A3D] mx-auto mb-2" />
                <p className="text-xs font-semibold text-slate-700">
                  Drag &amp; drop files here or <span className="text-[#0B4A3D] font-bold">click to upload</span>
                </p>
                <p className="text-[11px] text-slate-400 mt-1">PDF, Excel, Images (Max 10 MB)</p>
              </div>
              <input
                id="pw-file-input"
                type="file"
                multiple
                accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
                className="hidden"
                onChange={(e) => {
                  handleFiles(e.target.files);
                  e.target.value = '';
                }}
              />
              {Array.isArray(form.attachments) && form.attachments.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
                  {form.attachments.map((file, index) => {
                    const isImg = file.type && file.type.indexOf('image') === 0;
                    return (
                      <div key={`${file.name}-${index}`} className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2">
                        {isImg && file.data ? (
                          <img src={file.data} alt={file.name} className="w-9 h-9 rounded object-cover shrink-0" />
                        ) : (
                          <FileText className="w-5 h-5 text-[#0B4A3D] shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="text-[11px] font-semibold text-slate-700 truncate">{file.name}</div>
                          <div className="text-[9px] text-slate-400">
                            {file.size ? `${(Number(file.size) / 1024).toFixed(1)} KB` : ''}
                          </div>
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

        {/* ===== RIGHT SIDEBAR ===== */}
        <PwSidebar
          form={form}
          items={items}
          totals={totals}
          timeline={timeline}
          files={form.attachments}
          record={record}
          onAddFiles={handleFiles}
          onRemoveFile={removeAttachment}
          onPreview={() => saveAs('preview')}
          onPrint={() => saveAs('print')}
          onPdf={() => saveAs('pdf')}
        />
      </div>

      {/* ===== STICKY FOOTER (ERP standard creation action bar) =====
          The page header already carries the "Back to list" action. */}
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
          navigate(CPR_HUB_TABS['profit-workout']);
        }}
        onCancel={() => setConfirmLeave(false)}
      />
    </div>
  );
}