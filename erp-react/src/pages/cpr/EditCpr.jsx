import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Calculator,
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
import cprService from '../../services/cprService';
import { cprToForm, serializeCpr } from '../../utils/cprHelpers';

const WORKFLOW = [
  { label: 'Lead', icon: UserPlus, state: 'done' },
  { label: 'Client', icon: Users, state: 'done' },
  { label: 'CPR', icon: ClipboardList, state: 'active' },
  { label: 'Cost Workout', icon: Calculator, state: 'pending' },
  { label: 'Quotation', icon: FileText, state: 'pending' },
  { label: 'Customer Purchase Order', icon: ClipboardSignature, state: 'pending' }
];

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

export default function EditCpr() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  // Latest persisted CPR id. An edit of an approved CPR creates a new revision
  // (a new id), so item-level conversions keep updating the revision they saved
  // into instead of raising another revision from the route's original id.
  const conversionIdRef = useRef(id);
  const [form, setForm] = useState(null);
  const [items, setItems] = useState([]);
  const [files, setFiles] = useState([]);
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // Historical revisions (older versions of an edited CPR) are read-only.
  const [historical, setHistorical] = useState(false);
  const [errors, setErrors] = useState({});
  const gridRef = useRef(null);
  // Preserve the stored backend status across edits (the ERP resets the status
  // combobox to Draft/Submitted on edit, which would demote approved/rejected
  // records — keep the original instead).
  const loadedStatusRef = useRef('draft');

  useEffect(() => {
    let cancelled = false;
    cprService
      .getCpr(id)
      .then((res) => {
        if (cancelled) return;
        const cpr = res?.data ?? res ?? {};
        setHistorical(cpr.latestRevision === false);
        loadedStatusRef.current = cpr.status || 'draft';
        setRecord(cpr);
        setForm(cprToForm(cpr));
        setItems((cpr.items || []).map((item) => ({ ...item })));
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        toast.error(err?.message || 'Failed to load CPR');
        navigate('/cprs');
      });
    return () => {
      cancelled = true;
    };
  }, [id, navigate, toast]);

  const uploadQueued = async (cprId) => {
    if (files.length === 0) return 0;
    const results = await cprService.uploadMany(cprId, files, {});
    const ok = results.filter((r) => r.ok).length;
    const failed = results.length - ok;
    if (ok > 0) toast.success(`${ok} attachment(s) uploaded`);
    if (failed > 0) toast.error(`${failed} attachment(s) failed to upload`);
    setFiles([]);
    return ok;
  };

  const setField = (key, value) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
    setErrors((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  // Mirrors the ERP's validate() with one adaptation: on edit the backend
  // returns the source name (sourceLead) but not the stored source id, so a
  // restored name (or the client name) satisfies the source requirement.
  const validate = async () => {
    const fieldErrors = {};
    const messages = [];
    if (!form.prNo) { fieldErrors.prNo = 'CPR Number is required'; messages.push('CPR Number is required'); }
    if (!form.department) { fieldErrors.department = 'Department is required'; messages.push('Department is required'); }
    if (!form.requestedBy) { fieldErrors.requestedBy = 'Requester is required'; messages.push('Requester is required'); }
    if (!form.prDate) { fieldErrors.prDate = 'Date is required'; messages.push('Date is required'); }
    if (!form.requiredDate) { fieldErrors.requiredDate = 'Required date is required'; messages.push('Required date is required'); }
    if (!form.priority) { fieldErrors.priority = 'Priority is required'; messages.push('Priority is required'); }
    if (!form.sourceLead && !form.clientName) {
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
    // Reference PR No uniqueness — the record's own chain keeps its value; any
    // other live CPR blocks it (the backend enforces the same rule). A legacy
    // record that already carried a duplicated number stays editable: only an
    // actual CHANGED value is checked.
    const referencePrNoChanged =
      String(form.referencePrNo || '').trim().toLowerCase() !==
      String(record?.referencePrNo || '').trim().toLowerCase();
    if (messages.length === 0 && (form.referencePrNo || '').trim() && referencePrNoChanged) {
      const conflict = await cprService.findReferencePrNoConflict(form.referencePrNo, record?.id || id);
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
    const gridRes = gridRef.current?.validate?.();
    if (gridRes && !gridRes.valid) return false;
    return true;
  };

  const saveCpr = async () => {
    if (!form) return;
    if (!(await validate())) return;
    setSaving(true);
    try {
      const payload = { ...serializeCpr(form, items), status: loadedStatusRef.current };
      const res = await cprService.updateCpr(id, payload);
      const updated = res?.data ?? {};
      const savedId = updated?.id || id;
      await uploadQueued(savedId);
      const isRevision = Boolean(updated?.id && Number(updated.id) !== Number(id));
      toast.success(isRevision ? `${updated.prNo || form.prNo} saved as new revision` : `${updated.prNo || form.prNo} updated successfully`);
      // An edit creates a new revision (BASE(N)) — open the saved revision.
      navigate(`/cprs/${savedId}`);
    } catch (err) {
      toast.error(err?.message || 'Failed to update CPR');
    } finally {
      setSaving(false);
    }
  };

  // ---- item-level CW/PR conversion: persist first, then convert ----
  // The grid's CW / PR actions run the backend's item-level conversion workflow
  // (POST /cpr-technical-verifications/{id}/convert-to-cost-workout |
  //  convert-to-purchase-requisition), which reads the CPR item server-side — so
  // unsaved item edits must be persisted first. Uses the page's own validation
  // and the same update call as Save Changes, and returns null when the CPR is
  // not ready so no conversion is started against an unsaved row.
  const ensureSavedForConversion = async () => {
    if (!form || !(await validate())) return null;
    try {
      const payload = { ...serializeCpr(form, items), status: loadedStatusRef.current };
      const res = await cprService.updateCpr(conversionIdRef.current || id, payload);
      const saved = res?.data ?? {};
      const savedId = saved?.id || conversionIdRef.current || id;
      conversionIdRef.current = savedId;
      return { id: savedId, items: Array.isArray(saved?.items) ? saved.items : [] };
    } catch (err) {
      toast.error(err?.message || 'Failed to save the CPR before conversion');
      return null;
    }
  };

  if (loading || !form) {
    return (
      <div className="flex-1 bg-app font-sans antialiased text-slate-800 p-4 sm:p-6 w-full max-w-[100vw] overflow-x-hidden">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 mb-3 select-none">
          <span>VISHAK TECH</span>
          <span>&gt;</span>
          <span>Sales</span>
          <span>&gt;</span>
          <span>Customer Purchase Request</span>
          <span>&gt;</span>
          <span className="text-slate-600">Edit CPR</span>
        </div>
        <div className="flex items-center justify-center py-24">
          <div className="h-4 w-4 rounded-full border-2 border-slate-200 border-t-[#0B4A3D] animate-spin" />
        </div>
      </div>
    );
  }

  return (
    /* `erp-create-scope` opts the edit form into the shared creation-action
       standard (styles/erp-create-scope.css): its CreationActionBar footer
       renders `.erp-create-btn`, so Save/Cancel/Submit match the reference's
       create-form footer like every other scoped create/edit page. */
    <div className="erp-create-scope flex-1 bg-app font-sans antialiased text-slate-800 p-4 sm:p-6 w-full max-w-[100vw] overflow-x-hidden">

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

      {/* ===== BREADCRUMB ===== */}
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 mb-3 select-none">
        <span>VISHAK TECH</span>
        <span>&gt;</span>
        <span>Sales</span>
        <span>&gt;</span>
        <span>Customer Purchase Request</span>
        <span>&gt;</span>
        <span className="text-slate-600">Edit CPR</span>
      </div>

      {/* ===== PAGE HEADER ===== */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <ClipboardList className="w-6 h-6 text-[#0B4A3D]" />
            Edit Purchase Request
          </h1>
          <p className="text-xs text-slate-400 font-medium mt-1.5 flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-slate-300" />
            Updating <span className="font-semibold text-slate-500">{form.prNo}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate(`/cprs/${id}`)}
          className="flex items-center gap-1.5 text-xs font-bold text-slate-600 bg-surface border border-slate-200 px-3 py-2.5 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer select-none w-fit"
        >
          <ChevronLeft className="w-3.5 h-3.5 text-slate-400" /> Back to CPR
        </button>
      </div>

      {/* ===== WORKFLOW ===== */}
      <WorkflowStepper />

      {/* ===== TWO-COLUMN FORM GRID ===== */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 items-start">
        <div className="xl:col-span-2 min-w-0">
          <CprForm form={form} setField={setField} items={items} setItems={setItems} gridRef={gridRef} errors={errors} onEnsureSaved={ensureSavedForConversion} />
        </div>
        <div className="min-w-0">
          <CprSidebar form={form} items={items} files={files} onFilesChange={setFiles} record={record} />
        </div>
      </div>

      {/* ===== STICKY FOOTER (ERP standard creation action bar) ===== */}
      <CreationActionBar
        onBackToList={() => navigate('/cprs')}
        onCancel={() => navigate(`/cprs/${id}`)}
        onSave={saveCpr}
        saveLabel="Save Changes"
        disabled={saving}
        locked={historical}
      />

    </div>
  );
}
