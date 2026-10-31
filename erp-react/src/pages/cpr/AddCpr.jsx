import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Calculator,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  ClipboardSignature,
  FileText,
  Info,
  UserPlus,
  Users,
} from 'lucide-react';
import CprForm, { CprSidebar } from '../../components/CprForm';
import { CreationActionBar, useToast } from '../../components/Common';
import useBulkPrefill from '../../hooks/useBulkPrefill';
import { useFormDraft } from '../../hooks/useFormDraft';
import { loadDraft } from '../../utils/formPersistence';
import cprService from '../../services/cprService';
import { loadGridConfig } from '../../services/gridConfigService';
import { nextCprNumber, notifyCprListRefresh, serializeCpr } from '../../utils/cprHelpers';

// Create-CPR item table labels that differ from the stored column definition.
//
// The reference Item Details table names its first business column "PR" while
// the underlying column is the existing `drawingNo` field (there is no separate
// PR item field — the CPR's own PR number lives on the document, not on a row).
// This map is display-only and is passed to the grid only from this Create page,
// so the column keeps its real name everywhere else: the saved record snapshot,
// the shared module config (`sales.items.cpr`) and the Edit / View pages.
const CREATE_ITEM_LABEL_OVERRIDES = { drawingNo: 'PR' };

// ERP _updateAutosaveIndicator: 'just now' | 'N min ago' | 'Nh ago'.
function relativeTimeLabel(iso) {
  const minAgo = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (minAgo < 1) return 'just now';
  if (minAgo < 60) return `${minAgo} min ago`;
  return `${Math.floor(minAgo / 60)}h ago`;
}

const WORKFLOW = [
  { label: 'Lead', icon: UserPlus, state: 'done' },
  { label: 'Client', icon: Users, state: 'done' },
  { label: 'CPR', icon: ClipboardList, state: 'active' },
  { label: 'Cost Workout', icon: Calculator, state: 'pending' },
  { label: 'Quotation', icon: FileText, state: 'pending' },
  { label: 'Customer Purchase Order', icon: ClipboardSignature, state: 'pending' }
];

const INITIAL_FORM = {
  prNo: '',
  referencePrNo: '',
  prDate: new Date().toISOString().split('T')[0],
  department: '',
  requestedBy: '',
  requiredDate: '',
  quotationDeadline: '',
  extendedDeadline: '',
  priority: '',
  status: 'Draft',
  sourceLead: '',
  sourceType: '',
  sourceId: '',
  clientName: '',
  contactPerson: '',
  phone: '',
  email: '',
  company: '',
  gst: '',
  project: '',
  leadNo: '',
  pan: '',
  vendor: '',
  billingAddress: '',
  shippingAddress: '',
  remarks: '',
  description: '',
  costWorkout: '',
  profitPercent: ''
};

/**
 * A brand-new CPR always starts from this factory, never from a shared object
 * and never from stored state. Every visit to /cprs/new calls it again, so the
 * header fields, the (empty) item list and the nested values are all fresh
 * instances — nothing from a previously entered CPR can be reused.
 */
const buildInitialForm = () => ({ ...INITIAL_FORM, prDate: new Date().toISOString().split('T')[0] });

// Next-number resolution with ERP parity: the sequence must continue from the
// highest EXISTING CPR number of the year (active + archived + deleted — a
// deleted/archived number is never reused). The backend suggestion can jump
// ahead (it uses the total row count as a floor), so the real records win and
// the backend value is only a fallback when the list cannot be fetched.
async function resolveNextCprNumber() {
  const year = new Date().getFullYear();
  const fallback = await cprService.getNextNumber().then(
    (res) => res?.data?.prNo || '',
    () => ''
  );
  try {
    const existingNumbers = await cprService.listAllCprNumbers();
    return nextCprNumber(existingNumbers, year);
  } catch {
    return fallback || nextCprNumber([], year);
  }
}

function WorkflowStepper() {
  return (
    <div className="flex items-center justify-center flex-wrap gap-1 px-4 py-3 bg-surface border border-slate-200 rounded-xl shadow-sm mb-5">
      {WORKFLOW.map((step, index) => (
        <span key={step.label} className="flex items-center">
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap ${
              step.state === 'active'
                ? 'bg-[#0B4A3D] text-white'
                : step.state === 'done'
                  ? 'text-emerald-700'
                  : 'text-slate-400'
            }`}
          >
            <step.icon className="w-3 h-3" />
            {step.label}
          </span>
          {index < WORKFLOW.length - 1 && <ChevronRight className="w-3 h-3 text-slate-300 mx-0.5" />}
        </span>
      ))}
    </div>
  );
}

export default function AddCpr() {
  const navigate = useNavigate();
  const toast = useToast();
  // Lead actions menu deep-link: ?leadId=<id> pre-fills the Lead/Client source.
  const [searchParams] = useSearchParams();
  const prefillLeadId = searchParams.get('leadId');
  const prefillClientId = searchParams.get('clientId');
  // Lazy initializer → a NEW object per mount (create mode must never share
  // state with a previous visit or with the edit form).
  const [form, setForm] = useState(buildInitialForm);
  const [items, setItems] = useState([]);
  const [files, setFiles] = useState([]);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  // Bulk Upload: applies the extracted queue to this form for review — saving
  // still happens only through the existing Save buttons below.
  const bulkBanner = useBulkPrefill({ moduleKey: 'cpr', setForm });
  const gridRef = useRef(null);
  // Tracks the id of the record created by a previous Save Draft so subsequent
  // saves update the same CPR (mirrors the ERP's editingId after save('draft')).
  const savedIdRef = useRef(null);
  // ERP _dirty flag: set by user input, consumed by the 30s autosave timer.
  // ---- localStorage draft handling for new CPR records ----
  // The draft is only ever OFFERED here (see draftOffer below); it is applied
  // exclusively by the explicit "Resume draft" action.
  const draftCheckedRef = useRef(false);
  const { persistDraft, persistNow, clearDraft: clearFormDraft } = useFormDraft(
    'cprs', null,
    { isEdit: false, enabled: true, debounceMs: 500 }
  );
  const dirtyRef = useRef(false);
  const savingRef = useRef(false);
  const saveCprRef = useRef(null);
  const [autosavedAt, setAutosavedAt] = useState(null);
  // Unsaved draft found in localStorage — offered, never applied automatically.
  const [draftOffer, setDraftOffer] = useState(null);
  // Ticks every 15s so the autosave indicator shows an accurate relative time
  // (mirrors the ERP's _indicatorTimer).
  const [, setTick] = useState(0);

  const setField = (key, value) => {
    dirtyRef.current = true;
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  // Wraps setItems so grid edits mark the form dirty (ERP input listener).
  const handleSetItems = (updater) => {
    dirtyRef.current = true;
    setItems(updater);
  };

  // Force-save the CPR draft to localStorage before navigating to client creation,
  // so returning users don't lose already-entered data.
  const handleAddNewClient = () => {
    persistNow({ form, items });
    navigate('/clients/new?returnTo=/cprs/new');
  };

  const uploadQueued = async (cprId) => {
    if (files.length === 0) return 0;
    const results = await cprService.uploadMany(cprId, files, {});
    const ok = results.filter((r) => r.ok).length;
    const failed = results.length - ok;
    if (ok > 0) toast.success(`${ok} attachment(s) uploaded to ${cprId}`);
    if (failed > 0) toast.error(`${failed} attachment(s) failed to upload`);
    // Uploaded files are now persisted on the server; clear the queue so a
    // follow-up Save Draft / Submit does not re-upload duplicates.
    setFiles([]);
    return ok;
  };

  useEffect(() => {
    let cancelled = false;
    resolveNextCprNumber()
      .then((prNo) => {
        if (!cancelled && prNo) {
          setForm((prev) => ({ ...prev, prNo }));
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // ---- load the MODULE's Item Details column configuration ----
  // Manage Columns is a module setting stored in MySQL under the grid key
  // `sales.items.cpr` (the same /settings/grid-configs store every other grid
  // uses). A new CPR has no snapshot of its own, so seed one from the module
  // configuration: the CPR created here is then saved with the same columns the
  // grid shows, and its View / Preview / PDF render identically.
  //
  // Only COLUMN DEFINITIONS are adopted — never another record's item rows or
  // field values. `setForm` is used directly (not setField) so merely opening
  // /cprs/new does not mark the form dirty and cannot write a draft.
  useEffect(() => {
    let cancelled = false;
    loadGridConfig('sales.items.cpr').then((saved) => {
      if (cancelled || !Array.isArray(saved) || saved.length === 0) return;
      setForm((prev) => (
        Array.isArray(prev.itemColumns) && prev.itemColumns.length > 0
          ? prev
          : { ...prev, itemColumns: saved }
      ));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // ---- detect an unsaved draft WITHOUT applying it ----
  // Opening /cprs/new must produce a clean form. Previously this effect called
  // restoreDraft() on mount, so an unsaved draft from an earlier CPR silently
  // re-populated Lead/Client, Client Name, Contact Person, Company, GST,
  // Department, Requested By, dates, addresses, notes and item rows into what
  // the user believed was a new request. Now the draft is only offered, and the
  // user decides (Resume draft / Discard).
  useEffect(() => {
    if (draftCheckedRef.current) return;
    draftCheckedRef.current = true;
    const draft = loadDraft('cprs', null);
    if (draft && draft.form) setDraftOffer(draft);
  }, []);

  // ---- persist the draft (debounced) once the user actually types ----
  // Gated on real input so an untouched /cprs/new never even writes a draft.
  useEffect(() => {
    if (!dirtyRef.current) return;
    persistDraft({ form, items });
  }, [form, items, persistDraft]);

  // Deep-linked from the Lead actions menu (Create CPR): ?leadId=<id> is passed
  // into CprForm's source combobox, which pre-selects the lead through the real
  // selection path (same auto-fill as picking the lead manually in the UI).

  // ERP _startAutoSave: while the form is dirty and nothing is saving, persist a
  // draft every 30 seconds (visible via the footer autosave indicator).
  // Only fires after the CPR has been saved at least once (savedIdRef.current set)
  // so that opening /cprs/new never silently creates a backend record.
  useEffect(() => {
    const timer = setInterval(() => {
      if (dirtyRef.current && !savingRef.current && savedIdRef.current) {
        saveCprRef.current({ draft: true });
      }
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  // ERP _indicatorTimer: refresh the "Draft saved X min ago" label every 15s.
  useEffect(() => {
    const timer = setInterval(() => setTick((x) => x + 1), 15000);
    return () => clearInterval(timer);
  }, []);

  // Mirrors the ERP's validate(): prNo, department, requester, date, priority,
  // required date, a real source selection, date ordering, and per-item rules.
  const validate = async () => {
    const fieldErrors = {};
    const messages = [];

    if (!form.prNo) { fieldErrors.prNo = 'CPR Number is required'; messages.push('CPR Number is required'); }
    if (!form.department) { fieldErrors.department = 'Department is required'; messages.push('Department is required'); }
    if (!form.requestedBy) { fieldErrors.requestedBy = 'Requester is required'; messages.push('Requester is required'); }
    if (!form.prDate) { fieldErrors.prDate = 'Date is required'; messages.push('Date is required'); }
    if (!form.requiredDate) { fieldErrors.requiredDate = 'Required date is required'; messages.push('Required date is required'); }
    if (!form.priority) { fieldErrors.priority = 'Priority is required'; messages.push('Priority is required'); }

    // The ERP requires a real Lead/Client selection (stored id), not free text.
    const hasSource = Boolean(form.sourceType && form.sourceId);
    if (!hasSource) {
      fieldErrors.sourceLead = 'Please select a Lead or Client';
      messages.push('Please select a Lead or Client');
    }

    if (form.prDate && form.requiredDate && new Date(form.requiredDate) < new Date(form.prDate)) {
      fieldErrors.requiredDate = 'Required date cannot be before the PR date';
      messages.push('Required date cannot be before the PR date');
    }

    if (items.length === 0) {
      messages.push('Please add at least one item');
    }

    // Reference PR No uniqueness — same rule the backend enforces. Checked here
    // so the user gets an immediate, specific message instead of a rejected save.
    if (messages.length === 0 && (form.referencePrNo || '').trim()) {
      const conflict = await cprService.findReferencePrNoConflict(form.referencePrNo);
      if (conflict) {
        const msg = `Reference No "${form.referencePrNo.trim()}" is already used by CPR ${conflict.prNo || conflict.id}`;
        fieldErrors.referencePrNo = msg;
        messages.push(msg);
      }
    }

    setErrors(fieldErrors);
    if (messages.length > 0) {
      toast.warning(messages.join('; '));
      return false;
    }

    // Per-item validation handled by the grid (highlights + warning toast).
    // Only reached when there are no header/field errors, so no double toast.
    const gridRes = gridRef.current?.validate?.();
    if (gridRes && !gridRes.valid) return false;
    return true;
  };

  // ---- explicit draft actions (the only ways a draft is ever applied) ----
  const resumeDraft = () => {
    if (!draftOffer) return;
    if (draftOffer.form) setForm((prev) => ({ ...prev, ...draftOffer.form }));
    if (Array.isArray(draftOffer.items)) setItems(draftOffer.items);
    dirtyRef.current = true;
    setDraftOffer(null);
    toast.info('Unsaved draft restored');
  };

  const discardDraft = () => {
    clearFormDraft();
    setDraftOffer(null);
    toast.info('Draft discarded');
  };

  const resetForm = async () => {
    setForm(buildInitialForm());
    setItems([]);
    setFiles([]);
    setErrors({});
    savedIdRef.current = null;
    dirtyRef.current = false;
    setAutosavedAt(null);
    setDraftOffer(null);
    gridRef.current?.clearErrors?.();
    const prNo = await resolveNextCprNumber();
    if (prNo) setForm((prev) => ({ ...prev, prNo }));
  };

  // `openPreview` = the "Save and Continue" action: persist through the SAME
  // create/update API as Save, then open the saved CPR's document preview.
  const saveCpr = async ({ draft = false, submit = false, stay = false, openPreview = false } = {}) => {
    // Prevent concurrent saves (autosave timer + manual click overlap).
    if (savingRef.current) return;
    // Save Draft skips validation entirely (mirrors the ERP save('draft')).
    if (!draft && !(await validate())) return;
    savingRef.current = true;
    setSaving(true);
    try {
      // Always create/update with a Draft status; the submit transition is
      // applied via the submit endpoint (which records who/when).
      const payload = { ...serializeCpr(form, items), status: 'draft' };
      const existingId = savedIdRef.current;
      const res = existingId
        ? await cprService.updateCpr(existingId, payload, draft)
        : await cprService.createCpr(payload, draft);
      const created = res?.data ?? {};
      const id = created?.id || existingId;
      if (id) savedIdRef.current = id;
      // The backend has confirmed a NEW CPR: tell an open CPR list (this tab or
      // the list tab the "New CPR" button left open) to reload. Failed saves
      // throw above and never reach this point.
      if (!existingId) notifyCprListRefresh();
      if (submit && id) {
        await cprService.submitCpr(id);
      }
      await uploadQueued(id);

      if (draft) {
        // ERP save('draft'): 'Draft saved' (info) + footer autosave indicator.
        dirtyRef.current = false;
        setAutosavedAt(new Date());
        toast.info('Draft saved');
        return;
      }

      // Clear the localStorage draft after a successful save
      clearFormDraft();
      setDraftOffer(null);
      dirtyRef.current = false;
      setAutosavedAt(null);
      toast.success(
        submit
          ? `${created.prNo || form.prNo} submitted for approval`
          : `${created.prNo || form.prNo} saved successfully`
      );
      if (stay) {
        // Save & New: fresh form (ERP reloads the page).
        await resetForm();
      } else if (openPreview) {
        // Save and Continue: the backend has already confirmed the record (we
        // are past the await above), so open the SAME full-page CPR preview the
        // list's ⋮ → Preview opens. It loads the CPR by its persisted id from
        // the API, so the preview — and a refresh of it — shows the saved
        // values, never a blank or unrelated document.
        navigate(id ? `/cprs/design?id=${id}&from=cprs` : '/cprs');
      } else if (draft) {
        // Save Draft: return to the CPR list (existing behavior).
        navigate('/cprs');
      } else {
        // Save: open the saved CPR's view page (existing behavior, unchanged).
        navigate(id ? `/cprs/${id}` : '/cprs');
      }
    } catch (err) {
      toast.error(err?.message || 'Failed to save CPR');
    } finally {
      setSaving(false);
      savingRef.current = false;
    }
  };

  // ---- item-level CW/PR conversion: persist first, then convert ----
  // The grid's CW / PR actions run the backend's item-level conversion workflow
  // (POST /cpr-technical-verifications/{id}/convert-to-cost-workout |
  //  convert-to-purchase-requisition), which reads the CPR item server-side — so
  // the row must exist in the database first. This persists the CPR as a draft
  // through the same service calls as Save Draft, using the page's own validation
  // (header rules + the grid's per-item rules), and hands the grid the saved
  // record with its persisted items. It returns null when the CPR is not ready,
  // so a conversion is never started against an invalid or unsaved row.
  const ensureSavedForConversion = async () => {
    if (savingRef.current) {
      toast.warning('A save is already in progress — please try again in a moment');
      return null;
    }
    if (!(await validate())) return null;
    savingRef.current = true;
    setSaving(true);
    try {
      const payload = { ...serializeCpr(form, items), status: 'draft' };
      const existingId = savedIdRef.current;
      const res = existingId
        ? await cprService.updateCpr(existingId, payload, true)
        : await cprService.createCpr(payload, true);
      const saved = res?.data ?? {};
      const id = saved?.id || existingId;
      if (id) savedIdRef.current = id;
      dirtyRef.current = false;
      setAutosavedAt(new Date());
      return { id, items: Array.isArray(saved?.items) ? saved.items : [] };
    } catch (err) {
      toast.error(err?.message || 'Failed to save the CPR before conversion');
      return null;
    } finally {
      setSaving(false);
      savingRef.current = false;
    }
  };

  // Keep the autosave timer on the latest saveCpr closure (runs every render).
  useEffect(() => {
    saveCprRef.current = saveCpr;
  });

  return (
    <div className="erp-create-scope flex-1 bg-app font-sans antialiased text-slate-800 p-4 sm:p-6 w-full max-w-[100vw] overflow-x-hidden">

      {bulkBanner}

      {/* Unsaved draft — offered explicitly, never auto-applied to a new CPR. */}
      {draftOffer && (
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4 px-4 py-3 rounded-xl border border-amber-200 bg-amber-50">
          <div className="flex items-start gap-2 min-w-0">
            <Info className="w-4 h-4 mt-0.5 shrink-0 text-amber-600" />
            <div className="min-w-0">
              <p className="text-xs font-bold text-amber-800">Unsaved CPR draft found</p>
              <p className="text-[11px] text-amber-700 mt-0.5">
                This form is empty. Resume the draft only if you want to continue the CPR you
                started earlier — otherwise discard it.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={discardDraft}
              className="text-xs font-bold text-amber-800 bg-transparent border border-amber-300 px-3 py-2 rounded-lg hover:bg-amber-100 transition-colors cursor-pointer"
            >
              Discard
            </button>
            <button
              type="button"
              onClick={resumeDraft}
              className="text-xs font-bold text-white bg-[#0B4A3D] hover:bg-[#083D34] px-3.5 py-2 rounded-lg transition-colors cursor-pointer"
            >
              Resume draft
            </button>
          </div>
        </div>
      )}

      {/* ===== BREADCRUMB ===== */}
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 mb-3 select-none">
        <span>VISHAK TECH</span>
        <span>&gt;</span>
        <span>Sales</span>
        <span>&gt;</span>
        <span>Customer Purchase Request</span>
        <span>&gt;</span>
        <span className="text-slate-600">New CPR</span>
      </div>

      {/* ===== PAGE HEADER ===== */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <ClipboardList className="w-6 h-6 text-[#0B4A3D]" />
            Create Customer Purchase Request
          </h1>
          <p className="text-xs text-slate-400 font-medium mt-1.5 flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-slate-300" />
            Fields marked with <span className="text-rose-500">*</span> are required
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/cprs')}
          className="flex items-center gap-1.5 text-xs font-bold text-slate-600 bg-surface border border-slate-200 px-3 py-2.5 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer select-none w-fit"
        >
          <ChevronLeft className="w-3.5 h-3.5 text-slate-400" /> Back to List
        </button>
      </div>

      {/* ===== WORKFLOW ===== */}
      <WorkflowStepper />

      {/* ===== TWO-COLUMN FORM GRID ===== */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 items-start">
        <div className="xl:col-span-2 min-w-0">
          {/* Create CPR only, matching the reference Item Details table:
              · the Est. Cost and Total columns are hidden (item data and the
                save payload are untouched — Edit / View still show them);
              · the Drawing No. column is DISPLAYED as "PR". This is a label
                override only: the column keeps its real `drawingNo` definition,
                so the saved record snapshot, the shared module config and the
                Edit / View pages all keep "Drawing No.". */}
          <CprForm form={form} setField={setField} items={items} setItems={handleSetItems} gridRef={gridRef} errors={errors} prefillLeadId={prefillLeadId} prefillClientId={prefillClientId} onAddNewClient={handleAddNewClient} onEnsureSaved={ensureSavedForConversion} hideCostColumns itemLabelOverrides={CREATE_ITEM_LABEL_OVERRIDES} />
        </div>
        <div className="min-w-0">
          <CprSidebar form={form} items={items} files={files} onFilesChange={setFiles} />
        </div>
      </div>

      {/* ===== STICKY FOOTER (ERP standard creation action bar) =====
          The page header already carries the "Back to List" action, so the
          footer bar only adds Cancel / Save Draft on the left. */}
      <CreationActionBar
        showBackToList={false}
        onCancel={() => navigate('/cprs')}
        onSaveDraft={() => saveCpr({ draft: true })}
        note={
          autosavedAt ? (
            <span className="inline-flex items-center gap-1 text-[11px] text-[#6b7280] whitespace-nowrap">
              <CheckCircle2 className="w-3 h-3 text-[#059669]" />
              Draft saved {relativeTimeLabel(autosavedAt)}
            </span>
          ) : null
        }
        onSaveNew={() => saveCpr({ stay: true })}
        onSave={() => saveCpr({})}
        onSaveContinue={() => saveCpr({ openPreview: true })}
        onSubmit={() => saveCpr({ submit: true })}
        disabled={saving}
      />

    </div>
  );
}
