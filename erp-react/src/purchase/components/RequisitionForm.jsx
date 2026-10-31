/**
 * purchase/components/RequisitionForm.jsx
 * ------------------------------------------------------------------
 * Shared create / edit form for the Purchase Requisition module.
 *
 * Enterprise layout (create + edit share this screen):
 *   Desktop → left: accordion sections · right: sticky summary
 *   Tablet  → summary stacks below the form
 *   Mobile  → single column
 *
 * Sections: General Information · Item Details · Notes.
 *
 * The General Information section carries the additional header
 * details referenced from the CPR create screen (Status display,
 * Reference PR No, Quotation Deadline + Extended / Custom Extended
 * Deadline with a live Effective Quotation Deadline). They are
 * implemented purely with this module's own UI kit and flow through
 * the existing form state, schema and service call — no API, backend
 * or styling change.
 *
 * The former Lead / Client Information block was removed: the PR
 * record (PurchaseRequisitionRequestWrapper) has no client-identity
 * columns, so those inputs were never part of the saved payload.
 *
 * Uses react-hook-form with a Zod resolver, searchable dropdowns,
 * a dynamic line-item grid (PurchaseItemTable with add / duplicate /
 * delete + inline editing), live cost summary with round-off,
 * attachments, and a full action bar (Reset / Cancel / Save Draft /
 * Save & New / Submit for Approval / Create Requisition). Print and
 * Export PDF appear only once the requisition exists (edit mode),
 * because a document needs a valid PR number before it can be
 * printed / exported.
 *
 * Multi-currency display: INR is the base currency — line rates are
 * entered and stored in INR and every displayed amount is converted
 * to the selected currency via the exchange-rate master
 * (src/data/exchangeRates.js) without touching stored values.
 * Business logic, validation, services and routes are untouched.
 * ------------------------------------------------------------------
 */
import { useEffect, useId, useRef, useState } from 'react';
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircle2, ClipboardList, Clock, ListChecks, Paperclip, RotateCcw, StickyNote, X
} from 'lucide-react';
import {
  Accordion, ConfirmDialog, DateInput, EditableMasterSelect, FormField,
  SelectInput, TextArea, TextInput, useToast
} from './ui';
import AttachmentManager from './AttachmentManager';
import FormActions from './FormActions';
import PurchaseDocumentSummary from './PurchaseDocumentSummary';
import PurchaseItemTable from './PurchaseItemTable';
import PurchaseSummary from './PurchaseSummary';
import { isApiMode } from '../services/api-client';
import { requisitionsStore, requisitionService } from '../services/requisition';
import { getDefaultCurrency, getDefaultTaxRate } from '../services/settings';
import { itemToLine } from '../services/itemCatalog';

import { calcDocumentTotals, nextPRNo } from '../utils/purchase';
import { exportPdf, printTable } from '../utils/export';
import { formatDate } from '../utils/helpers';
import {
  addDaysToDate, deriveExtendedDeadlineOption, effectiveQuotationDeadline, EXTENDED_DEADLINE_OPTIONS
} from '../utils/quotationDeadline';
import { purchaseRequestSchema, uniqueItemDescriptions } from '../validation/requisition';
import { PR_STATUS, PR_STATUSES } from '../constants';
import useFormDraft from '../hooks/useFormDraft';
/* Page-scoped presentation fix: restores the box on the master-select
   trigger buttons of THIS form (see the file for the full root cause). */
import '../styles/requisition-form-fields.css';

const GRID = 'grid grid-cols-1 sm:grid-cols-2 gap-4';
const SPAN2 = 'sm:col-span-2';

/** PR number format: PR-YYYY-NNNN (e.g. PR-2026-0001). */
const PR_NO_REGEX = /^PR-\d{4}-\d{4,}$/;

/**
 * Save requests in flight, keyed by form instance (`useId`). A synchronous
 * guard is required because `submitting` / `draftSaving` only disable the
 * buttons AFTER the next render, so two clicks landing in the same frame would
 * otherwise start two create requests — and create two requisitions from one
 * form. It is not a ref: this component passes its submit handler to
 * react-hook-form, and reading a ref from that path is flagged as a
 * render-time ref access.
 */
const savesInFlight = new Set();

/** Validates a PR number format. Returns null if valid, error message otherwise. */
function validatePrNoFormat(value) {
  const v = String(value || '').trim();
  if (!v) return 'PR Number is required';
  if (!PR_NO_REGEX.test(v)) return 'PR Number must match format PR-YYYY-NNNN (e.g. PR-2026-0001)';
  return null;
}

/** Returns true if the PR number already exists in the store (excluding the current record). */
function isDuplicatePrNo(prNo, excludeId) {
  /* In API mode the backend enforces prNo uniqueness via existsByPrNo.
     The local mock store can contain stale data with mismatched ID types
     (string mock IDs vs numeric database IDs) so skip the client-side
     check entirely — let the server reject duplicates. */
  if (isApiMode()) return false;
  const trimmed = String(prNo || '').trim();
  return requisitionsStore.all.some(
    (entry) => entry.prNo === trimmed && entry.id !== excludeId
  );
}

/** Drops the RHF useFieldArray internal `id` so records stay clean. */
function cleanItems(items = []) {
  return items.map((item) => {
    if (!item || typeof item !== 'object') return {};
    const copy = { ...item };
    delete copy.id;
    return copy;
  });
}

/** yyyy-MM-dd wire format the backend (PurchaseRequisitionService) parses. */
const API_DATE_FORMAT = /^\d{4}-\d{2}-\d{2}$/;

function toApiDateOrNull(value) {
  const v = String(value ?? '').trim();
  return API_DATE_FORMAT.test(v) ? v : null;
}

/**
 * Maps the form model onto the backend PurchaseRequisitionRequestWrapper
 * contract (PurchaseRequisitionController → service.create/update).
 *
 * zodResolver returns ONLY the fields declared in purchaseRequestSchema,
 * so this pass re-declares `date` (previously stripped → HTTP 400
 * "Request date is required"), coerces numeric fields to real numbers
 * (never formatted currency strings), and drops UI-only keys
 * (per-item attachment blobs, item row ids, remarks) the backend record
 * has no column for. Display values (department/requester/vendor names)
 * ARE the stored values on this backend — the Purchase tables keep them
 * as plain strings, so no label→id translation applies.
 */
function buildApiPayload(values, prNo) {
  const num = (v) => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(String(v).replace(/,/g, ''));
    return Number.isFinite(n) ? n : null;
  };
  return {
    prNo: String(prNo || '').trim(),
    title: String(values.title || '').trim(),
    prType: values.prType || null,
    department: values.department || null,
    project: values.project || null,
    requester: values.requester || null,
    buyer: values.buyer || null,
    vendor: values.vendor || null,
    currency: values.currency || 'INR',
    priority: values.priority || null,
    gstType: values.gstType || null,
    incoterm: values.incoterm || null,
    transportMode: values.transportMode || null,
    warehouse: values.warehouse || null,
    costCenter: values.costCenter || null,
    location: values.location || null,
    deliveryAddress: values.deliveryAddress || null,
    company: values.company || null,
    branch: values.branch || null,
    date: toApiDateOrNull(values.date),
    expectedDate: toApiDateOrNull(values.expectedDate),
    terms: values.terms || null,
    discount: num(values.discount) ?? 0,
    charges: num(values.charges) ?? 0,
    notes: values.notes || null,
    internalNotes: values.internalNotes || null,
    status: values.status || null,
    items: (values.items || []).map((item) => ({
      itemCode: item?.itemCode || null,
      product: String(item?.product || '').trim() || null,
      specification: item?.specification || null,
      category: item?.category || null,
      hsn: item?.hsn || null,
      uom: item?.uom || null,
      qty: num(item?.qty),
      rate: num(item?.rate),
      discount: num(item?.discount),
      gstRate: num(item?.gstRate) ?? 0,
      remarks: item?.remarks || null
    }))
  };
}

const printColumns = [
  { key: 'itemCode', label: 'Item Code' },
  { key: 'drawingNo', label: 'Drawing No.' },
  { key: 'product', label: 'Description' },
  { key: 'specification', label: 'Specification' },
  { key: 'category', label: 'Category' },
  { key: 'hsn', label: 'HSN' },
  { key: 'uom', label: 'UOM' },
  { key: 'qty', label: 'Qty' },
  { key: 'rate', label: 'Rate' },
  { key: 'discount', label: 'Disc %' },
  { key: 'gstRate', label: 'GST %' },
  { key: 'remarks', label: 'Remarks' }
];

function buildRequisitionFormValues(record = {}) {
  const today = new Date().toISOString().slice(0, 10);
  return {
    title: record.title || '',
    date: record.date || (record.createdAt ? new Date(record.createdAt).toISOString().slice(0, 10) : today),
    department: record.department || '',
    project: record.project || '',
    requester: record.requester || '',
    buyer: record.buyer || '',
    priority: record.priority || 'Medium',
    currency: record.currency || getDefaultCurrency(),
    vendor: record.vendor || '',
    company: record.company || '',
    branch: record.branch || '',
    prType: record.prType || '',
    gstType: record.gstType || '',
    incoterm: record.incoterm || '',
    transportMode: record.transportMode || '',
    warehouse: record.warehouse || '',
    costCenter: record.costCenter || '',
    location: record.location || '',
    deliveryAddress: record.deliveryAddress || '',
    /* CPR-derived header details (display defaults only — the saved
       status always remains workflow-driven via resolveTargetStatus). */
    status: record.status || PR_STATUS.DRAFT,
    referencePrNo: record.referencePrNo || '',
    quotationDeadline: record.quotationDeadline || '',
    extendedDeadline: record.extendedDeadline || '',
    /* The backend requires delivery on or after the PR date. New forms use
       today rather than an invalid blank/stale draft date; existing values
       remain visible so validation can explain what must be corrected. */
    expectedDate: record.expectedDate || today,
    discount: String(record.discount ?? 0),
    charges: String(record.charges ?? 0),
    terms: record.terms || '30 Days',
    notes: record.notes || '',
    internalNotes: record.internalNotes || '',
    remarks: record.remarks || '',
    attachments: Array.isArray(record.attachments) ? record.attachments : [],
    items: (record.items || []).length > 0
      ? cleanItems(record.items).map((item) => ({ itemCode: '', drawingNo: '', specification: '', discount: '', remarks: '', attachments: [], ...item }))
      : [{ itemCode: '', drawingNo: '', product: '', specification: '', category: '', hsn: '', uom: 'Nos', qty: '', rate: '', discount: '', gstRate: getDefaultTaxRate(), remarks: '', attachments: [] }]
  };
}

export default function RequisitionForm({
  initialData, requestId, returnPath, skipDraftRestore = false, onSavedAndNew
}) {
  const navigate = useNavigate();
  const toast = useToast();

  const { loadDraft, saveDraft: persistDraft, clearDraft } = useFormDraft({
    draftKey: 'purchase.pr',
    recordId: requestId || null,
  });

  const form = useForm({
    resolver: zodResolver(purchaseRequestSchema),
    defaultValues: buildRequisitionFormValues(initialData),
    mode: 'onTouched'
  });

  const { register, handleSubmit, reset, control, setValue, setError, clearErrors, formState } = form;
  const { errors } = formState;

  const { fields, append, remove, insert, move } = useFieldArray({ control, name: 'items' });

  const watchedValues = useWatch({ control });
  /* Totals are derived live from the current form state — including the
     GST type — so switching IGST ↔ CGST+SGST (or Nil / Exempt /
     Composite) recalculates the full tax breakdown immediately and can
     never leave stale CGST/SGST/IGST or round-off values behind. */
  const totals = calcDocumentTotals(
    watchedValues?.items || [],
    watchedValues?.discount,
    watchedValues?.charges,
    watchedValues?.gstType
  );

  /** Auto-generated PR number on create; loaded from saved record on edit. Editable by user. */
  const [userPrNo, setUserPrNo] = useState(
    () => (requestId ? initialData?.prNo || '' : nextPRNo(requisitionsStore.all))
  );

  useEffect(() => {
    if (requestId || initialData?.prNo) return undefined;
    let cancelled = false;
    requisitionService.getNextRequisitionNumber().then((nextNumber) => {
      if (!cancelled && nextNumber) setUserPrNo(nextNumber);
    });
    return () => {
      cancelled = true;
    };
  }, [initialData?.prNo, requestId]);

  /* ---- Draft persistence: load on mount, debounced save on change ----
     In EDIT mode (requestId is truthy) the database is the single source of
     truth — never restore a stale draft that may carry an outdated PR number
     or field values from a previous session.  Clear any leftover draft on
     mount so subsequent auto-saves start from the live database data. */
  const draftRestoredRef = useRef(false);
  useEffect(() => {
    if (draftRestoredRef.current) return;
    draftRestoredRef.current = true;
    if (requestId) {
      /* Edit mode — the loaded record is authoritative. Remove any
         stale draft so the debounced persistDraft effect starts clean. */
      clearDraft();
      return;
    }
    /* Pre-filled create (e.g. CPR → Purchase Requisition): the values passed
       as initialData are this form's baseline. Restoring an unrelated unsaved
       new-PR draft would silently overwrite them, so the draft is skipped. */
    if (skipDraftRestore) return;
    /* Create mode — restore a saved draft if one exists. */
    const draft = loadDraft();
    if (draft && typeof draft === 'object') {
      /* Restore only the unsaved form values. The PR number is deliberately
         NOT restored: the numbering service is authoritative, so the field
         always shows the freshly fetched number (a work draft's number may
         already belong to a saved requisition). Older drafts may still carry
         one, which must not leak into the form state. */
      const draftValues = { ...draft };
      delete draftValues.prNo;
      reset({ ...buildRequisitionFormValues(initialData), ...draftValues }, { keepDefaultValues: false });
      toast.info('Draft restored');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount
  }, []);

  useEffect(() => {
    /* Autosave the unsaved values only — never the PR number (see the
       restore effect above). */
    if (watchedValues) persistDraft(watchedValues);
  }, [watchedValues, persistDraft]);

  const [submitting, setSubmitting] = useState(false);
  const [draftSaving, setDraftSaving] = useState(false);
  const [nextPrNoLoading, setNextPrNoLoading] = useState(false);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const [prNoError, setPrNoError] = useState(null);

  /* Quotation Deadline / Extended Deadline: the original deadline stays in
     `quotationDeadline`, the effective (possibly extended) one in
     `extendedDeadline` ('' = no extension). The dropdown option is derived
     from the stored dates so editing never loses the saved value; the
     user's explicit choice is remembered locally so "Custom Date" remains
     selected instead of snapping back to a derived preset. */
  const [extOptionOverride, setExtOptionOverride] = useState(null);
  const extOption = extOptionOverride ?? deriveExtendedDeadlineOption(
    watchedValues?.quotationDeadline,
    watchedValues?.extendedDeadline
  );
  const effectiveDeadline = effectiveQuotationDeadline(
    watchedValues?.quotationDeadline,
    watchedValues?.extendedDeadline
  );
  const deadlineExtended =
    Boolean(watchedValues?.extendedDeadline) &&
    Boolean(watchedValues?.quotationDeadline) &&
    watchedValues.extendedDeadline !== watchedValues.quotationDeadline;

  /** Preset extensions follow the new base date when it is re-entered. */
  const handleQuotationDeadlineChange = (value) => {
    setExtOptionOverride(null);
    setValue('quotationDeadline', value, { shouldDirty: true });
  };

  const handleExtensionChange = (value) => {
    setExtOptionOverride(value);
    if (value === 'NONE') {
      setValue('extendedDeadline', '', { shouldDirty: true });
      return;
    }
    if (value === 'CUSTOM') {
      /* Keep the current value — the custom date picker appears below. */
      return;
    }
    const days = Number(String(value).replace('+', '')) || 0;
    setValue('extendedDeadline', addDaysToDate(watchedValues?.quotationDeadline, days), { shouldDirty: true });
  };

  const savingKey = useId();

  /** Returns true when the save succeeded (so callers can react). */
  const persist = async (values, targetStatus, { draft = false, stay = false } = {}) => {
    /* Validate PR number format before saving. */
    const fmtErr = validatePrNoFormat(userPrNo);
    if (fmtErr) {
      setPrNoError(fmtErr);
      toast.error(fmtErr);
      return false;
    }
    /* Check for duplicate PR numbers (excluding the current record in edit mode). */
    if (isDuplicatePrNo(userPrNo, requestId)) {
      setPrNoError('This PR Number already exists. Please use a unique number.');
      toast.error('PR Number already exists');
      return false;
    }
    setPrNoError(null);

    /* Synchronous re-entry guard: `submitting` / `draftSaving` only disable the
       buttons after the next render, so two clicks landing in the same frame
       could otherwise start two create requests — and therefore create two
       requisitions from one form. The guard blocks the second call immediately
       and is released in the same finally as the button state. */
    if (savesInFlight.has(savingKey)) return false;
    savesInFlight.add(savingKey);

    if (draft) setDraftSaving(true);
    else setSubmitting(true);
    try {
      const payload = buildApiPayload(values, userPrNo);
      /* Save Draft / Save & New persist a work-in-progress record. The
         backend's draft contract (draft: true) requires only a title, so the
         submission-only fields and blank item rows are simply left out — no
         placeholder dates or "empty draft" line items are invented. */
      if (draft) payload.draft = true;
      if (requestId) {
        await requisitionService.updateRequisition(requestId, payload);
        /* Updating a requisition deliberately does not mutate its workflow
           status on the backend.  Complete the transition through the
           workflow endpoint after persisting the edited values, otherwise
           "Submit for Approval" on an existing draft only appears to work
           while the database remains in Draft. */
        if (
          targetStatus === PR_STATUS.PENDING_APPROVAL &&
          (initialData?.status === PR_STATUS.DRAFT || initialData?.status === PR_STATUS.RETURNED)
        ) {
          await requisitionService.submitRequisition(requestId);
        }
        toast.success(draft ? 'Draft saved' : 'Requisition updated successfully');
        /* The record is on the server now — its local work draft must not
           survive and reappear on the next new-requisition form. */
        clearDraft();
        /* When opened from the print preview, return there so the
           preview reloads automatically with the fresh data. */
        if (!stay) navigate(returnPath || `/purchase/requisition/${requestId}`);
      } else {
        /* A new requisition is always created as a Draft and moved
           forward through the workflow endpoint — the same contract the
           update branch above uses. `targetStatus` is authoritative for
           the transition (see resolveTargetStatus); without this a
           "Submit for Approval" on the create form silently saved a
           draft and never started the approval flow. */
        const created = await requisitionService.createRequisition({
          ...payload,
          status: PR_STATUS.DRAFT
        });
        if (targetStatus === PR_STATUS.PENDING_APPROVAL) {
          await requisitionService.submitRequisition(created.id);
        }
        toast.success(
          draft
            ? 'Draft saved'
            : targetStatus === PR_STATUS.PENDING_APPROVAL
              ? 'Requisition created and submitted for approval'
              : 'Requisition created successfully'
        );
        clearDraft();
        if (!stay) navigate(`/purchase/requisition/${created.id}`);
      }
      return true;
    } catch (err) {
      toast.error(err?.message || (requestId ? 'Failed to update requisition' : 'Failed to create requisition'));
      return false;
    } finally {
      savesInFlight.delete(savingKey);
      setSubmitting(false);
      setDraftSaving(false);
    }
  };

  /** True when a line item row carries any real content (for draft save). */
  const isFilledItemRow = (item) =>
    String(item?.product || '').trim() !== '' ||
    Number(item?.qty) > 0 ||
    Number(item?.rate) > 0 ||
    String(item?.hsn || '').trim() !== '';

  /**
   * A draft only has to be identifiable: the title is NOT NULL on the record
   * (and is the row's identity in every list), while department, requester,
   * dates, tax fields and line items are submission requirements. The message
   * is shown on the title field itself so it is actionable, not a raw 400.
   */
  const requireDraftTitle = (title) => {
    if (String(title || '').trim()) return true;
    const message = 'Enter a requisition title to save this draft.';
    setError('title', { type: 'manual', message });
    toast.error(message);
    return false;
  };

  /**
   * Saves a draft leniently — strips blank rows and skips strict schema
   * validation so partially-filled requisitions can be persisted.
   */
  const saveDraft = () => {
    const values = form.getValues();
    if (!requireDraftTitle(values.title)) return;
    const items = (values.items || []).filter(isFilledItemRow);
    persist({ ...values, items }, PR_STATUS.DRAFT, { draft: true });
  };

  /**
   * Asks the backend numbering service for the number the next requisition
   * must use. The backend reads every stored PR number, so this is the
   * authoritative sequence — never a string increment of the previous form.
   */
  const loadNextPrNo = async () => {
    setNextPrNoLoading(true);
    try {
      const next = await requisitionService.getNextRequisitionNumber();
      if (!next) throw new Error('No PR number returned');
      setUserPrNo(String(next));
      setPrNoError(null);
      return true;
    } catch {
      /* Never fall back to the number that was just used — a second save
         would collide on the unique prNo. Clear it and say so. */
      setUserPrNo('');
      const message = 'Requisition saved, but the next PR number could not be loaded. Reload this page before creating another requisition.';
      setPrNoError(message);
      toast.error(message);
      return false;
    } finally {
      setNextPrNoLoading(false);
    }
  };

  /** Saves as a Draft, then prepares a clean form with a fresh PR number. */
  const handleSaveAndNew = async () => {
    const values = form.getValues();
    if (!requireDraftTitle(values.title)) return;
    const items = (values.items || []).filter(isFilledItemRow);
    const saved = await persist({ ...values, items }, PR_STATUS.DRAFT, { draft: true, stay: true });
    if (!saved) return;
    /* Next document, not the one just saved: drop every value, row, error and
       local draft the previous entry produced before loading a new number. */
    reset(buildRequisitionFormValues({}));
    clearErrors();
    setExtOptionOverride(null);
    setPrNoError(null);
    clearDraft();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    await loadNextPrNo();
    /* A pre-filled create screen (CPR → PR) is no longer that source document:
       let the caller drop its source banner / baseline. */
    onSavedAndNew?.();
  };

  /**
   * Locked documents (approved / pending / rejected / PO raised) keep
   * their current status on every save; drafts and returns may move
   * forward (to Draft when just saved, to Pending Approval when
   * submitted).
   */
  const resolveTargetStatus = (submitted) => {
    if (
      requestId &&
      initialData?.status !== PR_STATUS.DRAFT &&
      initialData?.status !== PR_STATUS.RETURNED
    ) {
      return initialData.status;
    }
    return submitted ? PR_STATUS.PENDING_APPROVAL : PR_STATUS.DRAFT;
  };

  const validateItems = (items = []) => {
    const duplicates = uniqueItemDescriptions(items);
    if (duplicates.length > 0) {
      setError('items', { type: 'manual', message: `Duplicate item description${duplicates.length > 1 ? 's' : ''} detected on row${duplicates.length > 1 ? 's' : ''} ${duplicates.map((i) => i + 1).join(', ')}. Merge or rename the duplicate(s).` });
      return false;
    }
    clearErrors('items');
    return true;
  };

  /** "Submit for Approval" — validates the form, then saves forward. */
  const onSubmitSubmit = () =>
    handleSubmit((values) => {
      if (!validateItems(values.items)) return;
      persist(values, resolveTargetStatus(true));
    })();

  /** "Create / Update Requisition" — form submit handler (Draft for new docs). */
  const onSubmitSave = (values) => {
    if (!validateItems(values.items)) return;
    persist(values, resolveTargetStatus(false));
  };

  /** Reset — asks for confirmation before clearing every field. */
  const handleReset = () => setConfirmResetOpen(true);

  const confirmReset = () => {
    setConfirmResetOpen(false);
    reset(buildRequisitionFormValues(initialData));
    clearErrors();
    clearDraft();
  };

  /** Cancel — leaves immediately unless there are unsaved changes. */
  const handleCancel = () => {
    if (formState.isDirty) {
      setConfirmCancelOpen(true);
    } else {
      navigate('/purchase/requisition');
    }
  };

  const confirmCancel = () => {
    setConfirmCancelOpen(false);
    navigate('/purchase/requisition');
  };

  const emptyItem = () => ({ itemCode: '', drawingNo: '', product: '', specification: '', category: '', hsn: '', uom: 'Nos', qty: '', rate: '', discount: '', gstRate: getDefaultTaxRate(), remarks: '', attachments: [] });

  const appendItem = () => append(emptyItem());

  /* Item Master auto-fill: a catalog SKU/name match copies category /
     HSN / UOM / default rate / tax from the master onto the row. */
  const handleItemSelect = (index, item) => {
    const line = itemToLine(item);
    setValue(`items.${index}.itemCode`, item.itemCode || '', { shouldDirty: true });
    setValue(`items.${index}.product`, line.product, { shouldDirty: true });
    setValue(`items.${index}.category`, line.category, { shouldDirty: true });
    setValue(`items.${index}.hsn`, line.hsn, { shouldDirty: true });
    setValue(`items.${index}.uom`, line.uom, { shouldDirty: true });
    setValue(`items.${index}.rate`, line.rate || '', { shouldDirty: true });
    setValue(`items.${index}.gstRate`, line.gstRate, { shouldDirty: true });
  };

  const duplicateItem = (index) => {
    const source = cleanItems([watchedValues?.items?.[index]])[0] || {};
    insert(index + 1, { ...emptyItem(), ...source });
  };

  /* ---------- Per-item attachments (CPR item-grid behaviour) ----------
     Files are read as base64 data URLs ({name, size, type, data}) and
     stored on the line item through the existing form state — the same
     payload shape the CPR grid uses. Frontend-only; no API change. */
  const ITEM_FILE_MAX_BYTES = 200 * 1024 * 1024; // 200 MB per file

  const readItemFileAsDataUrl = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

  const handleItemAttachFiles = async (index, fileList) => {
    const all = Array.from(fileList || []);
    if (all.length === 0) return;
    const accepted = [];
    for (const file of all) {
      if (Number(file?.size) > ITEM_FILE_MAX_BYTES) {
        toast.warning(`File size exceeds the maximum limit of 200MB per file.`);
        continue;
      }
      accepted.push(file);
    }
    if (accepted.length === 0) return;
    try {
      const read = await Promise.all(accepted.map(async (file) => ({
        name: file.name,
        size: file.size,
        type: file.type,
        data: await readItemFileAsDataUrl(file)
      })));
      const current = watchedValues?.items?.[index]?.attachments || [];
      setValue(`items.${index}.attachments`, [...current, ...read], { shouldDirty: true });
    } catch {
      toast.warning('Could not read the selected file(s).');
    }
  };

  const handleRemoveItemAttachment = (index, fileIdx) => {
    const current = watchedValues?.items?.[index]?.attachments || [];
    setValue(`items.${index}.attachments`, current.filter((_, i) => i !== fileIdx), { shouldDirty: true });
  };

  const handlePrint = () => {
    const values = watchedValues || {};
    printTable(`Purchase Requisition${values.title ? ` — ${values.title}` : ''}`, printColumns, values.items || []);
  };

  const handleExportPdf = () => {
    const values = watchedValues || {};
    exportPdf({
      title: `Purchase Requisition${values.title ? ` — ${values.title}` : ''}`,
      filename: `purchase-requisition${requestId ? `-${requestId}` : ''}`,
      meta: [
        ['Department', values.department],
        ['Requester', values.requester],
        ['Buyer', values.buyer],
        ['Vendor', values.vendor],
        ['Reference PR No', values.referencePrNo],
        ['Expected Date', values.expectedDate],
        ['Effective Quotation Deadline', effectiveDeadline],
        ['Currency', values.currency],
        ['Payment Terms', values.terms]
      ],
      columns: printColumns,
      records: values.items || []
    });
  };

  const currency = watchedValues?.currency || 'INR';
  const itemCount = (watchedValues?.items || []).length;
  const canSubmit =
    !requestId ||
    initialData?.status === PR_STATUS.DRAFT ||
    initialData?.status === PR_STATUS.RETURNED;

  return (
    <>
    <form onSubmit={handleSubmit(onSubmitSave)}>
      <div className="pr-form-layout requisition-form">
        <div className="pr-form-main">
          {/* ============ 1 · GENERAL INFORMATION ============ */}
          <Accordion
            title="General Information"
            subtitle="Requester, department, vendor and required date"
            icon={ClipboardList}
          >
            <div className={GRID}>
              <FormField label="PR Number" required error={prNoError}>
                <TextInput
                  value={userPrNo}
                  onChange={(e) => {
                    setUserPrNo(e.target.value);
                    if (prNoError) setPrNoError(null);
                  }}
                  className="font-semibold text-slate-700"
                  placeholder="PR-2026-0001"
                  ariaLabel="PR Number"
                />
              </FormField>
              <FormField label="PR Date" required>
                <DateInput registration={register('date')} />
              </FormField>

              <FormField label="Requisition Title" required error={errors.title?.message} className={SPAN2}>
                <TextInput
                  registration={register('title')}
                  error={!!errors.title}
                  placeholder="e.g. Hot rolled steel sheets for chassis"
                />
              </FormField>

              <FormField label="PR Type" required error={errors.prType?.message} hint="Classifies the nature of this procurement">
                <Controller control={control} name="prType" render={({ field }) => (
                  <EditableMasterSelect masterKey="prTypes" value={field.value || ''} onChange={field.onChange} placeholder="Search PR type..." error={!!errors.prType} ariaLabel="PR Type" />
                )} />
              </FormField>

              <FormField label="Department" required error={errors.department?.message}>
                <Controller control={control} name="department" render={({ field }) => (
                  <EditableMasterSelect masterKey="departments" value={field.value || ''} onChange={field.onChange} placeholder="Search department..." error={!!errors.department} ariaLabel="Department" />
                )} />
              </FormField>
              <FormField label="Requester" required error={errors.requester?.message}>
                <Controller control={control} name="requester" render={({ field }) => (
                  <EditableMasterSelect masterKey="requesters" value={field.value || ''} onChange={field.onChange} placeholder="Search requester..." error={!!errors.requester} ariaLabel="Requester" />
                )} />
              </FormField>
              <FormField label="Vendor" hint="Preferred or shortlisted vendor">
                <Controller control={control} name="vendor" render={({ field }) => (
                  <EditableMasterSelect masterKey="vendors" value={field.value || ''} onChange={field.onChange} placeholder="Search vendor..." ariaLabel="Vendor" />
                )} />
              </FormField>
              <FormField label="Buyer">
                <Controller control={control} name="buyer" render={({ field }) => (
                  <EditableMasterSelect masterKey="buyers" value={field.value || ''} onChange={field.onChange} placeholder="Search buyer..." ariaLabel="Buyer" />
                )} />
              </FormField>
              <FormField label="Project">
                <Controller control={control} name="project" render={({ field }) => (
                  <EditableMasterSelect masterKey="projects" value={field.value || ''} onChange={field.onChange} placeholder="Search project..." ariaLabel="Project" />
                )} />
              </FormField>
              <FormField label="Priority">
                <Controller control={control} name="priority" render={({ field }) => (
                  <EditableMasterSelect masterKey="priorities" value={field.value || ''} onChange={field.onChange} placeholder="Select priority" ariaLabel="Priority" />
                )} />
              </FormField>
              <FormField label="Required Date" required error={errors.expectedDate?.message}>
                <DateInput registration={register('expectedDate')} error={!!errors.expectedDate} />
              </FormField>
              <FormField label="Company">
                <Controller control={control} name="company" render={({ field }) => (
                  <EditableMasterSelect masterKey="companies" value={field.value || ''} onChange={field.onChange} placeholder="Select Company" ariaLabel="Company" />
                )} />
              </FormField>
              <FormField label="Branch">
                <Controller control={control} name="branch" render={({ field }) => (
                  <EditableMasterSelect masterKey="branches" value={field.value || ''} onChange={field.onChange} placeholder="Select Branch" ariaLabel="Branch" />
                )} />
              </FormField>

              {/* CPR-derived header details — same grid, existing controls. */}
              <FormField label="Status" hint="Workflow-driven — changes on submit / approval">
                <Controller control={control} name="status" render={({ field }) => (
                  <SelectInput value={field.value || ''} onChange={field.onChange} aria-label="Status">
                    {PR_STATUSES.map((status) => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </SelectInput>
                )} />
              </FormField>
              <FormField label="Reference PR No">
                <TextInput registration={register('referencePrNo')} placeholder="Reference PR number" aria-label="Reference PR No" />
              </FormField>
              <FormField label="Quotation Deadline">
                <Controller control={control} name="quotationDeadline" render={({ field }) => (
                  <DateInput
                    value={field.value || ''}
                    onChange={(e) => handleQuotationDeadlineChange(e.target.value)}
                  />
                )} />
              </FormField>
              <FormField label="Extended Deadline" hint="Extends the quotation deadline without changing the original">
                <SelectInput
                  value={extOption}
                  onChange={(e) => handleExtensionChange(e.target.value)}
                  aria-label="Extended Deadline"
                >
                  {EXTENDED_DEADLINE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </SelectInput>
              </FormField>
              {extOption === 'CUSTOM' && (
                <FormField label="Custom Extended Date">
                  <Controller control={control} name="extendedDeadline" render={({ field }) => (
                    <DateInput
                      value={field.value || ''}
                      onChange={(e) => field.onChange(e.target.value)}
                    />
                  )} />
                </FormField>
              )}
              <div className={SPAN2}>
                <div className="flex items-center justify-between gap-3 rounded-lg bg-[#EDF7F4] border border-[#0B4A3D]/20 px-3 py-2">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Effective Quotation Deadline</span>
                  <span className="text-xs font-bold text-[#0B4A3D]">
                    {effectiveDeadline ? formatDate(effectiveDeadline) : 'Not set'}
                    {deadlineExtended && (
                      <span className="text-[10px] font-semibold text-slate-400 ml-1.5">
                        (from {formatDate(watchedValues.quotationDeadline)})
                      </span>
                    )}
                  </span>
                </div>
              </div>
            </div>
          </Accordion>

          {/* ============ 2 · LINE ITEMS ============ */}
          <Accordion
            title="Item Details"
            subtitle="Products, materials or services required for this Purchase Requisition"
            icon={ListChecks}
            action={<span className="pr-section-chip">{itemCount} item{itemCount === 1 ? '' : 's'}</span>}
          >
            <PurchaseItemTable
              control={control}
              register={register}
              fields={fields}
              itemsErrors={errors.items}
              onAppend={appendItem}
              onRemove={remove}
              onDuplicate={duplicateItem}
              onMoveUp={(index) => move(index, index - 1)}
              onMoveDown={(index) => move(index, index + 1)}
              watchedItems={watchedValues.items || []}
              currency={currency}
              totals={totals}
              excel
              convert
              extendedItemFields
              onAttachFiles={handleItemAttachFiles}
              onRemoveItemAttachment={handleRemoveItemAttachment}
              onItemSelect={handleItemSelect}
            />
            {errors.items?.message && (
              <p className="mt-2 text-[11px] font-semibold text-rose-500">{errors.items.message}</p>
            )}
            <p className="mt-3 text-[11px] text-slate-400">
              Tip: press <kbd className="px-1 py-0.5 rounded border border-slate-200 bg-slate-50 text-[10px] font-bold">Tab</kbd> to move across
              columns · <kbd className="px-1 py-0.5 rounded border border-slate-200 bg-slate-50 text-[10px] font-bold">Enter</kbd> to jump to the
              next row · amounts recalculate automatically.
            </p>
          </Accordion>

          {/* ============ 3 · NOTES ============ */}
          <Accordion
            title="Notes"
            subtitle="Internal instructions and vendor-facing notes"
            icon={StickyNote}
          >
            <div className="space-y-4">
              <FormField label="Remarks" hint={`${(watchedValues?.remarks || '').length} / 500`}>
                <TextArea
                  registration={register('remarks')}
                  rows={4}
                  maxLength={500}
                  placeholder="Additional notes or remarks..."
                />
              </FormField>
              <FormField label="Internal Notes" hint="Visible to the procurement team only">
                <TextArea registration={register('internalNotes')} rows={3} placeholder="Supplier / commercial notes for internal use..." />
              </FormField>
              <FormField label="Vendor Notes" hint="Any additional instructions for the vendor">
                <TextArea registration={register('notes')} rows={3} placeholder="Any additional instructions..." />
              </FormField>
            </div>
          </Accordion>
        </div>

        <aside className="pr-form-side">
          <PurchaseDocumentSummary
            prNo={userPrNo}
            status={requestId ? initialData?.status || PR_STATUS.DRAFT : PR_STATUS.DRAFT}
            approvalStatus={
              requestId
                ? initialData?.approvalStatus || 'Not Submitted'
                : 'Not Submitted'
            }
            values={watchedValues || {}}
            totals={totals}
            currency={currency}
            isEdit={!!requestId}
            convert
            createdAt={requestId ? initialData?.createdAt : null}
            updatedAt={requestId ? initialData?.updatedAt : null}
          />
          <PurchaseSummary totals={totals} currency={currency} igst={totals.igst} convert />

          {/* Approval Status card — matches CPR sidebar */}
          <div className="purchase-form-card">
            <div className="purchase-form-card-header">
              <h3>
                <CheckCircle2 aria-hidden="true" />
                Approval Status
              </h3>
            </div>
            <div className="purchase-form-card-body" style={{ paddingTop: 10 }}>
              <div className="pr-doc-summary-row">
                <span className="pr-doc-label">Status</span>
                <span className="pr-doc-value">{requestId ? (initialData?.approvalStatus || 'Pending Approval') : 'Pending Approval'}</span>
              </div>
              <div className="pr-doc-summary-row">
                <span className="pr-doc-label">Pending With</span>
                <span className="pr-doc-value">—</span>
              </div>
              <div className="pr-doc-summary-row">
                <span className="pr-doc-label">Submitted By</span>
                <span className="pr-doc-value">—</span>
              </div>
              <div className="pr-doc-summary-row">
                <span className="pr-doc-label">Date</span>
                <span className="pr-doc-value">—</span>
              </div>
              <div className="pr-doc-summary-row">
                <span className="pr-doc-label">Approved By</span>
                <span className="pr-doc-value">—</span>
              </div>
              <div className="pr-doc-summary-row">
                <span className="pr-doc-label">Date</span>
                <span className="pr-doc-value">—</span>
              </div>
              <div className="pr-doc-summary-row">
                <span className="pr-doc-label">Rejected By</span>
                <span className="pr-doc-value">—</span>
              </div>
              <div className="pr-doc-summary-row">
                <span className="pr-doc-label">Date</span>
                <span className="pr-doc-value">—</span>
              </div>
            </div>
          </div>

          {/* Attachments card — matches CPR sidebar drag-drop zone */}
          <div className="purchase-form-card">
            <div className="purchase-form-card-header">
              <h3>
                <Paperclip aria-hidden="true" />
                Attachments
              </h3>
            </div>
            <div className="purchase-form-card-body" style={{ paddingTop: 10 }}>
              <AttachmentManager
                attachments={watchedValues?.attachments || []}
                onChange={(next) => setValue('attachments', next, { shouldDirty: true })}
              />
            </div>
          </div>

          {/* Activity Timeline card — matches CPR sidebar */}
          <div className="purchase-form-card">
            <div className="purchase-form-card-header">
              <h3>
                <Clock aria-hidden="true" />
                Activity Timeline
              </h3>
            </div>
            <div className="purchase-form-card-body" style={{ paddingTop: 10 }}>
              <div className="flex flex-col items-center justify-center py-6 text-slate-400">
                <ClipboardList className="w-8 h-8 mb-2 opacity-40" />
                <p className="text-xs font-medium">No activity yet</p>
              </div>
            </div>
          </div>
        </aside>
      </div>

      {/* Save buttons stay blocked while Save & New fetches the next PR
          number — the form is not ready for another submission yet. */}
      <FormActions
        submitting={submitting}
        draftSaving={draftSaving || nextPrNoLoading}
        submitLabel={requestId ? 'Update Requisition' : 'Create Requisition'}
        submitVariant="primary"
        draftLabel="Save Draft"
        showDraft
        onDraft={saveDraft}
        onCancel={handleCancel}
        onReset={handleReset}
        onPrint={requestId ? handlePrint : undefined}
        onExportPdf={requestId ? handleExportPdf : undefined}
        showSaveNew={!requestId}
        onSaveNew={handleSaveAndNew}
        showSubmitApproval={canSubmit}
        onSubmitApproval={onSubmitSubmit}
      />
    </form>

    {/* Reset / Cancel confirmation dialogs */}
    <ConfirmDialog
      open={confirmResetOpen}
      title="Reset requisition form?"
      message="This will clear every field you have entered on this form. Line items and attachments will be removed — data already saved on the server is not affected."
      confirmLabel="Reset Form"
      variant="warning"
      icon={RotateCcw}
      onConfirm={confirmReset}
      onCancel={() => setConfirmResetOpen(false)}
    />
    <ConfirmDialog
      open={confirmCancelOpen}
      title="Discard unsaved changes?"
      message="You have unsaved changes in this requisition. Leaving now will discard them."
      confirmLabel="Leave Page"
      variant="default"
      icon={X}
      onConfirm={confirmCancel}
      onCancel={() => setConfirmCancelOpen(false)}
    />
    </>
  );
}
