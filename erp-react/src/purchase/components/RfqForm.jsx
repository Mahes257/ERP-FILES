/**
 * purchase/components/RfqForm.jsx
 * ------------------------------------------------------------------
 * Shared create / edit form for the RFQ module.
 *
 * Mirrors the master Purchase Requisition / Vendor form architecture
 * exactly:
 *   Desktop → left: collapsible section cards (RFQ Details ·
 *             Commercial Information · Line Items · Invite Vendors,
 *             then Attachments | Notes side-by-side at 60/40) ·
 *             right: sticky summary
 *   Tablet  → Attachments | Notes become equal halves, summary stacks
 *             below the form
 *   Mobile  → single column
 *
 * Sections use the shared Accordion + FormField + EditableMasterSelect
 * components; line items use the shared PurchaseItemTable in its
 * Excel-style grid mode (fixed header · sticky # and actions columns ·
 * equal-height cells · keyboard navigation · live Subtotal), the same
 * component as the PR form; invited vendors are limited to the
 * Approved vendor master with search, category filter and select-all.
 *
 * Uses react-hook-form + Zod, searchable master dropdowns,
 * attachments, and the full shared action bar (Reset / Cancel /
 * Save Draft / Save & New / Submit for Approval / Update-Create) in
 * the sticky footer. Print and Export PDF appear only in edit mode,
 * because an RFQ needs a valid number before it can be printed.
 *
 * Line-item field adapter: the shared grid binds `items.*.rate`; the
 * RFQ module stores `expectedRate`. buildRfqFormValues maps
 * expectedRate → rate and cleanRfqItems maps rate → expectedRate, so
 * stored records keep the module's canonical shape while the form
 * reuses the shared grid unchanged.
 * ------------------------------------------------------------------
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from 'react-router-dom';
import useFormDraft from '../hooks/useFormDraft';
import {
  BadgeCheck, Banknote, Building2, CalendarDays, Link2, ListChecks, MailPlus,
  Paperclip, RotateCcw, Search, Star, StickyNote, Users, X
} from 'lucide-react';
import {
  Accordion, ConfirmDialog, CurrencySelect, DateInput, EditableMasterSelect, FormField,
  NumberInput, SelectInput, TextArea, TextInput, useToast
} from './ui';
import AttachmentManager from './AttachmentManager';
import FormActions from './FormActions';
import PurchaseItemTable from './PurchaseItemTable';
import PurchaseStatusBadge from './PurchaseStatusBadge';
import {
  DELIVERY_TERMS, FREIGHT_OPTIONS, INSURANCE_OPTIONS, PR_APPROVED_GROUP, RFQ_STATUS, WARRANTY_TERMS
} from '../constants';
import { rfqSchema, uniqueItemDescriptions } from '../validation/requisition';
import { rfqService, rfqsStore } from '../services/rfq';
import { requisitionService } from '../services/requisition';
import { vendorService } from '../services/vendor';
import { getDefaultCurrency, getDefaultTaxRate } from '../services/settings';
import { itemToLine } from '../services/itemCatalog';
import { formatAmount, nextSeqNo } from '../utils/purchase';
import { exportPdf, printTable } from '../utils/export';

/* A requisition is RFQ-eligible once it is approved — this covers both
   the legacy Approved status and the current Technical Review →
   Ready for RFQ flow, so nothing already in flight regresses. */
const isRfqEligible = (status) => PR_APPROVED_GROUP.includes(status);

const GRID = 'grid grid-cols-1 sm:grid-cols-2 gap-4';
const SPAN2 = 'sm:col-span-2';

const DEFAULT_COMMERCIAL_TERMS = {
  paymentTerms: '',
  deliveryTerms: DELIVERY_TERMS[3],
  warranty: WARRANTY_TERMS[3],
  taxRate: getDefaultTaxRate(),
  freight: FREIGHT_OPTIONS[2],
  insurance: INSURANCE_OPTIONS[3]
};

/* New line items default to the configured tax rate (Settings → Tax). */
const emptyItem = () => ({ itemCode: '', product: '', category: '', hsn: '', uom: 'Nos', qty: '', rate: '', discount: '', gstRate: getDefaultTaxRate(), remarks: '' });

const printColumns = [
  { key: 'product', label: 'Item Description' },
  { key: 'hsn', label: 'HSN' },
  { key: 'uom', label: 'UOM' },
  { key: 'qty', label: 'Qty' },
  { key: 'rate', label: 'Est. Rate' }
];

/** Drops RHF's useFieldArray `id` and the shared-grid form-only keys,
    mapping the grid's `rate` back to the RFQ's stored `expectedRate`.
    `itemCode` / `category` (the PR-origin link fields) are preserved so
    every RFQ line keeps referencing its source PR item. */
function cleanRfqItems(items = []) {
  return items.map((item) => {
    if (!item || typeof item !== 'object') return {};
    const copy = { ...item };
    delete copy.id;
    delete copy.discount;
    delete copy.gstRate;
    /* Preserve the RFQ's canonical `specification` (carried over from PR
       remarks / the grid's Remarks column) so it survives re-saves. */
    if (copy.specification || copy.remarks) {
      copy.specification = copy.specification || copy.remarks;
    }
    delete copy.remarks;
    if (copy.rate !== undefined) {
      /* The RFQ module's canonical item field is `expectedRate`, but the
         REST contract persists and returns that estimate as `rate` —
         drop neither, or the entered estimate is silently discarded on
         save and reloads as 0. */
      copy.expectedRate = copy.rate;
    }
    return copy;
  });
}

function buildRfqFormValues(record = {}) {
  const today = new Date().toISOString().slice(0, 10);
  return {
    title: record.title || '',
    reference: record.reference || '',
    rfqDate: record.rfqDate || (record.createdAt ? new Date(record.createdAt).toISOString().slice(0, 10) : today),
    /* Hidden fields — carried from the linked PR so they survive every
       re-save (declared in rfqSchema so zod keeps them). */
    project: record.project || '',
    description: record.description || '',
    vendorNames: record.vendors || [],
    department: record.department || '',
    requester: record.requester || '',
    buyer: record.buyer || '',
    priority: record.priority || '',
    validity: record.validity ?? 30,
    dueDate: record.dueDate || '',
    currency: record.currency || getDefaultCurrency(),
    incoterm: record.incoterm || '',
    deliveryAddress: record.deliveryAddress || '',
    notes: record.notes || '',
    status: record.status || RFQ_STATUS.DRAFT,
    commercialTerms: { ...DEFAULT_COMMERCIAL_TERMS, ...(record.commercialTerms || {}) },
    attachments: Array.isArray(record.attachments) ? record.attachments : [],
    items: (record.items || []).length > 0
      ? record.items.map((item) => ({
          itemCode: item.itemCode || '',
          product: item.product || '',
          category: item.category || '',
          hsn: item.hsn || '',
          uom: item.uom || 'Nos',
          qty: item.qty ?? '',
          rate: item.rate ?? item.expectedRate ?? '',
          discount: item.discount ?? '',
          gstRate: item.gstRate ?? 18,
          remarks: item.remarks || item.specification || '',
          /* Hidden passthrough — keeps the PR-origin required date alive
             through every re-save (no grid column edits it). */
          requiredDate: item.requiredDate || ''
        }))
      : [emptyItem()]
  };
}

const AVATAR_COLORS = ['#0B4A3D', '#1D4ED8', '#7C3AED', '#B45309', '#BE185D', '#0F766E', '#4D7C0F'];
const avatarColorFor = (name = '') => {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
};
const initialsOf = (name = '') =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join('');

export default function RfqForm({ initialData, rfqId }) {
  const navigate = useNavigate();
  const toast = useToast();

  const { loadDraft, saveDraft: persistDraft, saveDraftNow, clearDraft } = useFormDraft({
    draftKey: 'purchase.rfq',
    recordId: rfqId || null,
  });

  const [vendors, setVendors] = useState([]);
  const [vendorQuery, setVendorQuery] = useState('');
  const [vendorCategory, setVendorCategory] = useState('');
  const [requisitions, setRequisitions] = useState([]);
  const [requisitionsLoading, setRequisitionsLoading] = useState(true);
  const [requisitionsError, setRequisitionsError] = useState(false);
  const appliedInitialPr = useRef(false);
  /* The requisition the form is currently derived from, together with the
     exact values it copied. Kept so clearing the reference can remove what
     the PR supplied — and nothing more. */
  const appliedPr = useRef(null);

  /* Vendors eligible for an RFQ (Approved + active in the master — the
     exact rule sendRfq enforces) + approved purchase requisitions
     available as RFQ references. Both masters feed the create/edit form.
     Uses PR_APPROVED_GROUP (Approved / Technical Review / Ready for RFQ)
     so legacy Approved records predating the tech-review stage are still
     selectable — nothing already in flight regresses. */
  useEffect(() => {
    let cancelled = false;
    setRequisitionsLoading(true);
    setRequisitionsError(false);
    Promise.all([
      vendorService.getRfqEligibleVendors(),
      requisitionService.getRequisitions({ status: PR_APPROVED_GROUP, page: 1, pageSize: 500 })
    ])
      .then(([eligibleVendors, requisitionResponse]) => {
        if (cancelled) return;
        setVendors(eligibleVendors || []);
        setRequisitions(requisitionResponse.data || []);
      })
      .catch(() => {
        if (!cancelled) setRequisitionsError(true);
      })
      .finally(() => {
        if (!cancelled) setRequisitionsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const form = useForm({
    resolver: zodResolver(rfqSchema),
    defaultValues: buildRfqFormValues(initialData),
    mode: 'onTouched'
  });

  const { register, handleSubmit, reset, control, setValue, setError, clearErrors, watch, formState } = form;
  const { errors } = formState;
  const { fields, append, remove, insert, move } = useFieldArray({ control, name: 'items' });
  const watched = useWatch({ control });

  const [submitting, setSubmitting] = useState(false);
  const [draftSaving, setDraftSaving] = useState(false);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);

  /** Auto-generated RFQ number on create; loaded from saved record on edit. Editable by user. */
  const [userRfqNo, setUserRfqNo] = useState(
    () => (rfqId ? initialData?.rfqNo || '' : nextSeqNo(rfqsStore.all, 'RFQ', 'rfqNo', 0))
  );

  /* ---- Draft persistence: load on mount, debounced save on change ---- */
  const draftRestoredRef = useRef(false);
  useEffect(() => {
    if (draftRestoredRef.current) return;
    draftRestoredRef.current = true;
    const draft = loadDraft();
    if (draft && typeof draft === 'object') {
      reset({ ...buildRfqFormValues(initialData), ...draft }, { keepDefaultValues: false });
      if (draft.rfqNo) setUserRfqNo(draft.rfqNo);
      toast.info('Draft restored');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount
  }, []);

  useEffect(() => {
    if (watched) persistDraft({ ...watched, rfqNo: userRfqNo });
  }, [watched, persistDraft, userRfqNo]);

  /* When editing, the linked requisition may no longer be in the approved
     master — keep it visible as a fallback option so the field never
     renders blank. */
  const linkedPrFallback = useMemo(() => {
    if (!watched?.reference) return [];
    const known = requisitions.some((pr) => pr.prNo === watched.reference);
    return known ? [] : [{ prNo: watched.reference, title: 'Previously linked requisition' }];
  }, [watched?.reference, requisitions]);

  const vendorCategories = useMemo(
    () => [...new Set(vendors.map((vendor) => vendor.category).filter(Boolean))],
    [vendors]
  );

  const filteredVendors = useMemo(() => {
    const q = vendorQuery.trim().toLowerCase();
    return vendors.filter((vendor) => {
      if (vendorCategory && vendor.category !== vendorCategory) return false;
      if (!q) return true;
      const haystack = [vendor.name, vendor.category, vendor.city].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }, [vendors, vendorQuery, vendorCategory]);

  const selectedVendorNames = Array.isArray(watched?.vendorNames) ? watched.vendorNames : [];

  const toggleVendor = (name) => {
    const next = selectedVendorNames.includes(name)
      ? selectedVendorNames.filter((item) => item !== name)
      : [...selectedVendorNames, name];
    setValue('vendorNames', next, { shouldDirty: true, shouldValidate: true });
  };

  const allVisibleSelected =
    filteredVendors.length > 0 && filteredVendors.every((vendor) => selectedVendorNames.includes(vendor.name));

  const toggleAllVisible = () => {
    const visible = new Set(filteredVendors.map((vendor) => vendor.name));
    const next = allVisibleSelected
      ? selectedVendorNames.filter((name) => !visible.has(name))
      : [...new Set([...selectedVendorNames, ...filteredVendors.map((vendor) => vendor.name)])];
    setValue('vendorNames', next, { shouldDirty: true, shouldValidate: true });
  };

  /** Maps a PR line item into an RFQ line item (rate → grid rate). */
  const mapPrItem = (item) => ({
    itemCode: item.itemCode || '',
    product: item.product || '',
    category: item.category || '',
    hsn: item.hsn || '',
    uom: item.uom || 'Nos',
    qty: item.qty ?? '',
    rate: item.rate ?? item.expectedRate ?? '',
    discount: item.discount ?? '',
    gstRate: item.gstRate ?? 18,
    remarks: item.remarks || item.specification || ''
  });

  /** Fills the per-item required date from the PR's expected date. */
  const withPrItemRequiredDate = (items, pr) =>
    (items || []).map((item) => ({
      ...item,
      requiredDate: pr?.expectedDate || item.requiredDate || ''
    }));

  /** Fills the RFQ from an approved requisition (items, scope, ownership). */
  const applyRequisition = (pr) => {
    if (!pr) return;
    setValue('reference', pr.prNo || '', { shouldDirty: true });
    setValue('title', pr.title || watched?.title || '', { shouldDirty: true });
    setValue('department', pr.department || '', { shouldDirty: true });
    setValue('project', pr.project || '', { shouldDirty: true });
    setValue('requester', pr.requester || '', { shouldDirty: true });
    setValue('buyer', pr.buyer || '', { shouldDirty: true });
    setValue('priority', pr.priority || '', { shouldDirty: true });
    setValue('currency', pr.currency || '', { shouldDirty: true });
    setValue('dueDate', pr.expectedDate || '', { shouldDirty: true });
    /* Delivery location — the PR's delivery address, falling back to its
       branch, so the RFQ inherits where the goods must be delivered. */
    setValue('deliveryAddress', pr.deliveryAddress || pr.branch || '', { shouldDirty: true });
    /* Payment terms carry to the commercial terms section. */
    setValue('commercialTerms.paymentTerms', pr.terms || watched?.commercialTerms?.paymentTerms || '', { shouldDirty: true });
    setValue('notes', pr.notes || watched?.notes || '', { shouldDirty: true });
    setValue('attachments', Array.isArray(pr.attachments) ? pr.attachments : [], { shouldDirty: true });
    const mapped = withPrItemRequiredDate((pr.items || []).map(mapPrItem), pr);
    if (mapped.length > 0) {
      setValue('items', mapped, { shouldDirty: true, shouldValidate: true });
    }
    appliedPr.current = {
      fields: {
        title: pr.title || '',
        department: pr.department || '',
        project: pr.project || '',
        requester: pr.requester || '',
        buyer: pr.buyer || '',
        priority: pr.priority || '',
        currency: pr.currency || '',
        dueDate: pr.expectedDate || '',
        deliveryAddress: pr.deliveryAddress || pr.branch || ''
      },
      items: mapped
    };
    toast.success(`Referenced ${pr.prNo} — items and scope copied`);
  };

  /**
   * Detaches the referenced requisition. Clearing the reference must not
   * leave the previous PR's scope on the form, otherwise a saved RFQ would
   * claim a requisition it no longer references. Each copied field is reset
   * only while it still holds the copied value (a value the user has typed
   * since is preserved), and the lines are cleared only while they are still
   * exactly the copied set. Re-selecting the requisition restores all of it.
   */
  const detachRequisition = () => {
    const applied = appliedPr.current;
    if (!applied) return;
    Object.entries(applied.fields).forEach(([name, copied]) => {
      if (copied && String(form.getValues(name) || '') === copied) {
        setValue(name, '', { shouldDirty: true });
      }
    });
    const currentItems = form.getValues('items') || [];
    const stillTheCopiedSet = applied.items.length > 0
      && currentItems.length === applied.items.length
      && currentItems.every((item, index) => {
        const source = applied.items[index];
        return String(item.product || '') === String(source.product || '')
          && String(item.qty ?? '') === String(source.qty ?? '')
          && String(item.rate ?? '') === String(source.rate ?? '');
      });
    if (stillTheCopiedSet) {
      setValue('items', [emptyItem()], { shouldDirty: true, shouldValidate: true });
    }
    appliedPr.current = null;
  };

  /** Resolves a requisition by PR number across statuses (approved master first). */
  const findLinkedRequisition = async (prNo) => {
    const known = requisitions.find((pr) => pr.prNo === prNo);
    if (known) return known;
    try {
      const result = await requisitionService.getRequisitions({ search: prNo, page: 1, pageSize: 500 });
      return (result.data || []).find((pr) => pr.prNo === prNo) || null;
    } catch {
      return null;
    }
  };

  /* Handoff support: /purchase/rfq/new?pr=PR-2026-0039 auto-applies the
     approved requisition once the master has loaded (create flow only).
     When the referenced PR is no longer Approved it has already been
     converted — warn immediately so the user doesn't fill the whole form
     before the save-time duplicate guard blocks it. */
  useEffect(() => {
    if (rfqId || appliedInitialPr.current || !initialData?.reference) return;
    const match = requisitions.find((pr) => pr.prNo === initialData.reference);
    if (match) {
      appliedInitialPr.current = true;
      applyRequisition(match);
    } else {
      findLinkedRequisition(initialData.reference).then((pr) => {
        if (appliedInitialPr.current || !pr) return;
        if (!isRfqEligible(pr.status)) {
          appliedInitialPr.current = true;
          toast.error(
            `${pr.prNo} is already ${pr.status}${pr.rfqNo ? ` (RFQ ${pr.rfqNo})` : ''} — creating another RFQ from it is not allowed`
          );
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requisitions]);

  const estimatedSubtotal = (watched?.items || []).reduce(
    (sum, item) => sum + (Number(item.qty) || 0) * (Number(item.rate) || 0),
    0
  );

  /** Returns true when the save succeeded (so callers can react). */
  const persist = async (values, targetStatus, { draft = false, stay = false } = {}) => {
    if (draft) setDraftSaving(true);
    else setSubmitting(true);
    try {
      const payload = {
        ...values,
        rfqNo: userRfqNo,
        status: targetStatus,
        items: cleanRfqItems(values.items),
        /* Persist the estimate the form already shows — the API stores
           `estimatedValue` as given and never derives it from the lines,
           so omitting it made every RFQ report ₹0. */
        estimatedValue: estimatedSubtotal
      };
      if (rfqId) {
        await rfqService.updateRfq(rfqId, { ...payload, rfqNo: userRfqNo });
        toast.success(draft ? 'Draft saved' : 'RFQ updated successfully');
        if (!draft) clearDraft();
        if (!stay) navigate(`/purchase/rfq/${rfqId}`);
      } else {
        /* Duplicate-RFQ guard: a requisition can only ever produce one RFQ. */
        const linkedPr = payload.reference ? await findLinkedRequisition(payload.reference) : null;
        if (linkedPr && !isRfqEligible(linkedPr.status)) {
          toast.error(
            `${linkedPr.prNo} is already ${linkedPr.status}${linkedPr.rfqNo ? ` (RFQ ${linkedPr.rfqNo})` : ''} — a duplicate RFQ cannot be created from it`
          );
          return false;
        }
        const created = await rfqService.createRfq(payload);
        /* Scenario A: creating an RFQ from an approved PR converts the PR
           (Approved → Converted to RFQ) and links the new RFQ number. */
        if (linkedPr && isRfqEligible(linkedPr.status) && !linkedPr.rfqNo) {
          try {
            await requisitionService.markConvertedToRfq(linkedPr.id, created.rfqNo);
          } catch {
            toast.error(`RFQ ${created.rfqNo} created, but ${linkedPr.prNo} could not be marked as converted`);
          }
        }
        toast.success(draft ? 'Draft saved' : 'RFQ created successfully');
        if (!draft) clearDraft();
        if (!stay) navigate(`/purchase/rfq/${created.id}`);
      }
      return true;
    } catch (err) {
      toast.error(err?.message || (rfqId ? 'Failed to update RFQ' : 'Failed to create RFQ'));
      return false;
    } finally {
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
   * Saves a draft leniently — strips blank rows and skips strict schema
   * validation so partially-filled RFQs can be persisted.
   */
  const saveDraft = () => {
    const values = form.getValues();
    const items = (values.items || []).filter(isFilledItemRow);
    persist({ ...values, items }, RFQ_STATUS.DRAFT, { draft: true });
    saveDraftNow({ ...values, items, rfqNo: userRfqNo });
  };

  /** Saves as a Draft, then clears the form for the next entry. */
  const handleSaveAndNew = async () => {
    const values = form.getValues();
    const items = (values.items || []).filter(isFilledItemRow);
    const saved = await persist({ ...values, items }, RFQ_STATUS.DRAFT, { draft: true, stay: true });
    if (!saved) return;
    clearDraft();
    reset(buildRfqFormValues(initialData));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  /**
   * Locked documents (any status other than Draft) keep their current
   * status on every save; new RFQs and drafts move forward — to Draft
   * when just saved, to Pending Approval when submitted.
   */
  const resolveTargetStatus = (submitted) => {
    if (rfqId && initialData?.status !== RFQ_STATUS.DRAFT) {
      return initialData.status;
    }
    return submitted ? RFQ_STATUS.PENDING_APPROVAL : RFQ_STATUS.DRAFT;
  };

  const validateItems = (items = []) => {
    const duplicates = uniqueItemDescriptions(items);
    if (duplicates.length > 0) {
      setError('items', { type: 'manual', message: `Duplicate item description${duplicates.length > 1 ? 's' : ''} detected on row${duplicates.length > 1 ? 's' : ''} ${duplicates.map((i) => i + 1).join(', ')}.` });
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

  /** "Create / Update RFQ" — form submit handler. Creating a new RFQ
      submits it for approval (module behaviour); editing a Draft simply
      saves it forward as a Draft, matching the PR form. */
  const onSubmit = (values) => {
    if (!validateItems(values.items)) return;
    persist(values, resolveTargetStatus(!rfqId));
  };

  /** Reset — asks for confirmation before clearing every field. */
  const handleReset = () => setConfirmResetOpen(true);

  const confirmReset = () => {
    setConfirmResetOpen(false);
    reset(buildRfqFormValues(initialData));
    clearErrors();
    clearDraft();
  };

  /** Cancel — leaves immediately unless there are unsaved changes. */
  const handleCancel = () => {
    if (formState.isDirty) {
      setConfirmCancelOpen(true);
    } else {
      navigate('/purchase/rfq');
    }
  };

  const confirmCancel = () => {
    setConfirmCancelOpen(false);
    navigate('/purchase/rfq');
  };

  const appendItem = () => append(emptyItem());

  /* Item Master auto-fill: pick a catalog SKU/name → the row inherits
     category / HSN / UOM / default rate / tax from the master. */
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
    const source = { ...(watched?.items?.[index] || {}) };
    delete source.id;
    insert(index + 1, { ...emptyItem(), ...source });
  };

  const handlePrint = () => {
    const values = watched || {};
    printTable(
      `RFQ${values.rfqNo ? ` ${values.rfqNo}` : ''}${values.title ? ` — ${values.title}` : ''}`,
      printColumns,
      values.items || []
    );
  };

  const handleExportPdf = async () => {
    const values = watched || {};
    await exportPdf({
      title: `RFQ${values.rfqNo ? ` ${values.rfqNo}` : ''}${values.title ? ` — ${values.title}` : ''}`,
      filename: `rfq${rfqId ? `-${rfqId}` : ''}`,
      meta: [
        ['RFQ Number', values.rfqNo || 'Auto-generated'],
        ['Reference Requisition', values.reference || '—'],
        ['Department', values.department || '—'],
        ['Requester', values.requester || '—'],
        ['Buyer', values.buyer || '—'],
        ['Priority', values.priority || '—'],
        ['Currency', values.currency || 'INR'],
        ['Validity', values.validity ? `${values.validity} days` : '—'],
        ['Due Date', values.dueDate || '—'],
        ['Incoterm', values.incoterm || '—'],
        ['Delivery Address', values.deliveryAddress || '—'],
        ['Vendors', (values.vendorNames || []).join(', ') || '—']
      ],
      columns: printColumns,
      records: values.items || []
    });
  };

  const currency = watched?.currency || 'INR';
  const itemCount = (watched?.items || []).filter((item) => item.product).length;
  const attachmentCount = (watch('attachments') || []).length;
  const vendorCount = selectedVendorNames.length;
  const canSubmit = !rfqId || initialData?.status === RFQ_STATUS.DRAFT;

  return (
    <>
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="pr-form-layout">
          <div className="pr-form-main">
            {/* ============ 1 · RFQ DETAILS ============ */}
            <Accordion
              title="RFQ Details"
              subtitle="Scope, reference requisition and ownership"
              icon={MailPlus}
            >
              <div className={GRID}>
                <FormField label="RFQ Number">
                  <TextInput
                    value={userRfqNo}
                    onChange={(e) => setUserRfqNo(e.target.value)}
                    className="font-semibold text-slate-700"
                    placeholder="Auto-generated"
                    ariaLabel="RFQ Number"
                  />
                </FormField>
                <FormField label="RFQ Date" required>
                  <DateInput registration={register('rfqDate')} />
                </FormField>

                <FormField label="RFQ Title" required error={errors.title?.message} className={SPAN2}>
                  <TextInput
                    registration={register('title')}
                    error={!!errors.title}
                    placeholder="e.g. RFQ for hot rolled steel sheets"
                  />
                </FormField>

                <FormField
                  label="Reference Requisition"
                  hint={requisitionsLoading ? '' : `${requisitions.length} approved requisition(s) available`}
                  className={SPAN2}
                >
                  <Controller
                    control={control}
                    name="reference"
                    render={({ field }) => {
                      if (requisitionsLoading) {
                        return (
                          <input
                            type="text"
                            value="Loading approved requisitions..."
                            disabled
                            className="purchase-form-input opacity-60 cursor-wait"
                            aria-label="Reference Requisition — loading"
                          />
                        );
                      }
                      if (requisitionsError) {
                        return (
                          <input
                            type="text"
                            value="Failed to load requisitions"
                            disabled
                            className="purchase-form-input border-rose-300 text-rose-500"
                            aria-label="Reference Requisition — error"
                          />
                        );
                      }
                      return (
                        <SelectInput
                          registration={{
                            onChange: (e) => {
                              const nextPrNo = e.target.value || '';
                              field.onChange(nextPrNo);
                              const pr = [...requisitions, ...linkedPrFallback].find((item) => item.prNo === nextPrNo);
                              if (pr && requisitions.some((item) => item.prNo === pr.prNo)) applyRequisition(pr);
                              else if (!nextPrNo) detachRequisition();
                            },
                            value: field.value || ''
                          }}
                        >
                          <option value="">
                            {requisitions.length === 0 ? 'No approved requisitions found' : 'Select Approved Requisition'}
                          </option>
                          {linkedPrFallback.map((pr) => (
                            <option key={pr.prNo} value={pr.prNo}>
                              {pr.prNo} — {pr.title}
                            </option>
                          ))}
                          {requisitions.map((pr) => (
                            <option key={pr.prNo} value={pr.prNo}>
                              {pr.prNo} — {pr.title}
                            </option>
                          ))}
                        </SelectInput>
                      );
                    }}
                  />
                  {watched?.reference && (
                    <p className="mt-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-[#0B4A3D]">
                      <Link2 className="w-3 h-3" /> Linked to {watched.reference} · items &amp; scope copied from the approved requisition
                    </p>
                  )}
                </FormField>

                <FormField label="Department">
                  <Controller control={control} name="department" render={({ field }) => (
                    <EditableMasterSelect masterKey="departments" value={field.value || ''} onChange={field.onChange} placeholder="Search department..." ariaLabel="Department" />
                  )} />
                </FormField>
                <FormField label="Buyer">
                  <Controller control={control} name="buyer" render={({ field }) => (
                    <EditableMasterSelect masterKey="buyers" value={field.value || ''} onChange={field.onChange} placeholder="Search buyer..." ariaLabel="Buyer" />
                  )} />
                </FormField>
                <FormField label="Requester">
                  <Controller control={control} name="requester" render={({ field }) => (
                    <EditableMasterSelect masterKey="requesters" value={field.value || ''} onChange={field.onChange} placeholder="Search requester..." ariaLabel="Requester" />
                  )} />
                </FormField>
                <FormField label="Priority">
                  <Controller control={control} name="priority" render={({ field }) => (
                    <EditableMasterSelect masterKey="priorities" value={field.value || ''} onChange={field.onChange} placeholder="Select priority" ariaLabel="Priority" />
                  )} />
                </FormField>
                <FormField label="Validity (days)">
                  <NumberInput min="1" step="1" registration={register('validity')} error={!!errors.validity} placeholder="30" />
                </FormField>
                <FormField label="Due Date">
                  <DateInput registration={register('dueDate')} />
                </FormField>
                <FormField label="Currency">
                  <Controller control={control} name="currency" render={({ field }) => (
                    <CurrencySelect value={field.value || ''} onChange={field.onChange} placeholder="Select currency" ariaLabel="Currency" error={!!errors.currency} />
                  )} />
                </FormField>
                <FormField label="Incoterm">
                  <Controller control={control} name="incoterm" render={({ field }) => (
                    <EditableMasterSelect masterKey="incoterms" value={field.value || ''} onChange={field.onChange} placeholder="e.g. FOB" ariaLabel="Incoterm" />
                  )} />
                </FormField>
                <FormField label="Delivery Address" className={SPAN2}>
                  <Controller control={control} name="deliveryAddress" render={({ field }) => (
                    <EditableMasterSelect masterKey="deliveryAddresses" value={field.value || ''} onChange={field.onChange} placeholder="Select Delivery Address" ariaLabel="Delivery Address" />
                  )} />
                </FormField>
              </div>
            </Accordion>

            {/* ============ 2 · COMMERCIAL INFORMATION ============ */}
            <Accordion
              title="Commercial Information"
              subtitle="Payment, delivery, warranty, freight and insurance"
              icon={Banknote}
            >
              <div className={GRID}>
                <FormField label="Payment Terms">
                  <Controller control={control} name="commercialTerms.paymentTerms" render={({ field }) => (
                    <EditableMasterSelect masterKey="paymentTerms" value={field.value || ''} onChange={field.onChange} placeholder="Select payment terms" ariaLabel="Payment Terms" />
                  )} />
                </FormField>
                <FormField label="Delivery Terms">
                  <Controller control={control} name="commercialTerms.deliveryTerms" render={({ field }) => (
                    <EditableMasterSelect options={DELIVERY_TERMS} value={field.value || ''} onChange={field.onChange} placeholder="Select delivery terms" ariaLabel="Delivery Terms" />
                  )} />
                </FormField>
                <FormField label="Warranty">
                  <Controller control={control} name="commercialTerms.warranty" render={({ field }) => (
                    <EditableMasterSelect options={WARRANTY_TERMS} value={field.value || ''} onChange={field.onChange} placeholder="Select warranty" ariaLabel="Warranty" />
                  )} />
                </FormField>
                <FormField label="Tax Rate (%)">
                  <NumberInput min="0" step="0.5" registration={register('commercialTerms.taxRate')} error={!!errors.commercialTerms?.taxRate} placeholder="18" />
                </FormField>
                <FormField label="Freight">
                  <Controller control={control} name="commercialTerms.freight" render={({ field }) => (
                    <EditableMasterSelect options={FREIGHT_OPTIONS} value={field.value || ''} onChange={field.onChange} placeholder="Select freight" ariaLabel="Freight" />
                  )} />
                </FormField>
                <FormField label="Insurance">
                  <Controller control={control} name="commercialTerms.insurance" render={({ field }) => (
                    <EditableMasterSelect options={INSURANCE_OPTIONS} value={field.value || ''} onChange={field.onChange} placeholder="Select insurance" ariaLabel="Insurance" />
                  )} />
                </FormField>
              </div>
            </Accordion>

            {/* ============ 3 · LINE ITEMS ============ */}
            <Accordion
              title="Line Items"
              subtitle="Required items with estimated rates"
              icon={ListChecks}
              action={itemCount > 0 ? <span className="pr-section-chip">{itemCount} item{itemCount === 1 ? '' : 's'}</span> : null}
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
                watchedItems={watched.items || []}
                currency={currency}
                excel
                showTaxTotals={false}
                onItemSelect={handleItemSelect}
              />
              {errors.items?.message && (
                <p className="mt-2 text-[11px] font-semibold text-rose-500">{errors.items.message}</p>
              )}
              <p className="mt-3 text-[11px] text-slate-400">
                Rates are estimates for quotation — actual pricing arrives with vendor quotations.
              </p>
              <p className="mt-3 text-[11px] text-slate-400">
                Tip: press <kbd className="px-1 py-0.5 rounded border border-slate-200 bg-slate-50 text-[10px] font-bold">Tab</kbd> to move across
                columns · <kbd className="px-1 py-0.5 rounded border border-slate-200 bg-slate-50 text-[10px] font-bold">Enter</kbd> to jump to the
                next row · amounts recalculate automatically.
              </p>
            </Accordion>

            {/* ============ 4 · INVITE VENDORS ============ */}
            <Accordion
              title="Invite Vendors"
              subtitle="Approved vendors only — search, filter and select multiple"
              icon={Users}
              action={
                vendorCount > 0 ? (
                  <span className="pr-section-chip">{vendorCount} vendor{vendorCount === 1 ? '' : 's'}</span>
                ) : null
              }
            >
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 border-b border-slate-200 bg-slate-50/60 px-3 py-2">
                  <div className="relative flex-1 min-w-0">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                    <input
                      type="text"
                      value={vendorQuery}
                      onChange={(e) => setVendorQuery(e.target.value)}
                      placeholder="Search vendors by name, category or city..."
                      aria-label="Search approved vendors"
                      className="w-full h-9 pl-8 pr-3 text-xs text-slate-700 outline-none bg-transparent"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={vendorCategory}
                      onChange={(e) => setVendorCategory(e.target.value)}
                      aria-label="Filter vendors by category"
                      className="h-9 px-2.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-600 outline-none focus:border-[#0B4A3D] cursor-pointer"
                    >
                      <option value="">All Categories</option>
                      {vendorCategories.map((category) => (
                        <option key={category} value={category}>{category}</option>
                      ))}
                    </select>
                    <label className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-600 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={toggleAllVisible}
                        aria-label="Select all visible vendors"
                        className="accent-[#0B4A3D] w-3.5 h-3.5 cursor-pointer"
                      />
                      Select All
                    </label>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-80 overflow-y-auto p-3">
                  {filteredVendors.map((vendor) => {
                    const selected = selectedVendorNames.includes(vendor.name);
                    const preferred = Number(vendor.rating) >= 4.5;
                    return (
                      <label
                        key={vendor.name}
                        className={`flex items-start gap-2.5 px-3 py-2.5 rounded-lg border text-xs cursor-pointer transition-colors ${
                          selected ? 'border-[#0B4A3D] bg-[#EDF7F4]' : 'border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleVendor(vendor.name)}
                          className="accent-[#0B4A3D] w-3.5 h-3.5 mt-0.5 cursor-pointer"
                          aria-label={`Select ${vendor.name}`}
                        />
                        <span
                          aria-hidden="true"
                          className="flex items-center justify-center w-8 h-8 rounded-full text-[11px] font-bold text-white shrink-0"
                          style={{ backgroundColor: avatarColorFor(vendor.name) }}
                        >
                          {initialsOf(vendor.name)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-1.5">
                            <span className="truncate font-bold text-slate-800">{vendor.name}</span>
                            {preferred && (
                              <span className="shrink-0 inline-flex items-center rounded-full bg-[#0B4A3D]/10 text-[#0B4A3D] px-1.5 py-px text-[9px] font-bold uppercase tracking-wide">
                                Preferred
                              </span>
                            )}
                            {vendor.status && (
                              <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                                {vendor.status}
                              </span>
                            )}
                          </span>
                          {(vendor.category || vendor.city) && (
                            <span className="block text-[10px] font-semibold text-slate-400 truncate">
                              {[vendor.category, vendor.city].filter(Boolean).join(' · ')}
                            </span>
                          )}
                          {(vendor.rating || vendor.onTimeDelivery) && (
                            <span className="flex flex-wrap items-center gap-1.5 mt-0.5 text-[10px] font-semibold text-slate-400">
                              {vendor.rating ? (
                                <span className="inline-flex items-center gap-0.5 text-amber-600 font-bold">
                                  <Star className="w-2.5 h-2.5 fill-amber-500 text-amber-500" aria-hidden="true" />
                                  {vendor.rating}
                                </span>
                              ) : null}
                              {vendor.onTimeDelivery ? <span>{vendor.onTimeDelivery}% OTD</span> : null}
                              {vendor.leadTimeDays ? <span>· {vendor.leadTimeDays}d lead</span> : null}
                            </span>
                          )}
                        </span>
                      </label>
                    );
                  })}
                  {filteredVendors.length === 0 && (
                    <p className="text-xs text-slate-400 col-span-2 py-2">
                      {vendors.length === 0 ? 'No approved vendors in the master yet.' : `No vendors match "${vendorQuery}".`}
                    </p>
                  )}
                </div>
              </div>
              <p className="mt-1.5 text-[11px] font-semibold text-slate-400">
                {vendorCount} of {vendors.length} approved vendor(s) selected
              </p>
              {errors.vendorNames?.message && (
                <p className="mt-1 text-[11px] font-semibold text-rose-500">{errors.vendorNames.message}</p>
              )}
            </Accordion>

            {/* ============ 5+6 · ATTACHMENTS | NOTES — side-by-side ============
                Desktop → Attachments (60%) | Notes (40%); tablet → equal
                halves; mobile → stacked. Mirrors the Vendor form's paired
                card layout. */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-[3fr_2fr] gap-6 items-start">
              <Accordion
                title="Attachments"
                subtitle="Specifications, drawings, terms"
                icon={Paperclip}
                action={
                  attachmentCount > 0 ? (
                    <span className="pr-section-chip">{attachmentCount} file{attachmentCount === 1 ? '' : 's'}</span>
                  ) : null
                }
              >
                <AttachmentManager
                  attachments={watch('attachments') || []}
                  onChange={(next) => setValue('attachments', next, { shouldDirty: true })}
                />
              </Accordion>

              <Accordion
                title="Notes"
                subtitle="Commercial instructions for suppliers"
                icon={StickyNote}
              >
                <FormField label="Notes" hint="Terms, instructions and expectations for invited suppliers">
                  <TextArea
                    registration={register('notes')}
                    rows={6}
                    autoGrow
                    placeholder="Commercial instructions for suppliers..."
                  />
                </FormField>
                <p className="mt-1.5 text-right text-[10px] font-semibold text-slate-400 tabular-nums">
                  {String(watched?.notes || '').length} characters
                </p>
              </Accordion>
            </div>
          </div>

          <aside className="pr-form-side">
            {/* ---- RFQ Summary ---- */}
            <div className="purchase-form-card">
              <div className="purchase-form-card-header">
                <h3><BadgeCheck aria-hidden="true" /> RFQ Summary</h3>
              </div>
              <div className="purchase-form-card-body">
                <div className="purchase-total-row">
                  <span className="total-label">Status</span>
                  <span className="total-value"><PurchaseStatusBadge status={watched?.status || RFQ_STATUS.DRAFT} /></span>
                </div>
                <div className="purchase-total-row">
                  <span className="total-label">Department</span>
                  <span className="total-value">{watched?.department || '—'}</span>
                </div>
                <div className="purchase-total-row">
                  <span className="total-label">Buyer</span>
                  <span className="total-value">{watched?.buyer || '—'}</span>
                </div>
                <div className="purchase-total-row">
                  <span className="total-label">Priority</span>
                  <span className="total-value">{watched?.priority || '—'}</span>
                </div>
                <div className="purchase-total-row">
                  <span className="total-label">Currency</span>
                  <span className="total-value">{currency}</span>
                </div>
                <div className="purchase-total-row">
                  <span className="total-label">Due Date</span>
                  <span className="total-value">{watched?.dueDate || '—'}</span>
                </div>
                <div className="purchase-total-row">
                  <span className="total-label">Validity</span>
                  <span className="total-value">{watched?.validity ? `${watched.validity} days` : '—'}</span>
                </div>
                <div className="purchase-total-row">
                  <span className="total-label">Vendors Selected</span>
                  <span className="total-value">{vendorCount}</span>
                </div>
                <div className="purchase-total-row">
                  <span className="total-label">Items</span>
                  <span className="total-value">{itemCount}</span>
                </div>
                <div className="purchase-total-row purchase-total-grand">
                  <span className="total-label">Estimated Total</span>
                  <span className="total-value">{formatAmount(estimatedSubtotal, currency)}</span>
                </div>
              </div>
            </div>

            {/* ---- Invited Vendors ---- */}
            <div className="purchase-form-card">
              <div className="purchase-form-card-header">
                <h3><Users aria-hidden="true" /> Invited Vendors</h3>
              </div>
              <div className="purchase-form-card-body">
                {vendorCount === 0 ? (
                  <p className="text-[13px] text-slate-500">No vendors selected yet. Add vendors from the Invite Vendors section.</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {selectedVendorNames.map((name) => {
                      const v = vendors.find((entry) => entry.name === name);
                      return (
                        <li key={name} className="flex items-start gap-2 text-[12px] text-slate-700">
                          <Building2 className="w-3.5 h-3.5 text-[#0A4F44] shrink-0 mt-0.5" aria-hidden="true" />
                          <div className="min-w-0">
                            <span className="font-bold text-slate-800 truncate block">{name}</span>
                            {v && (
                              <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5 text-[10px] text-slate-500 font-semibold">
                                {v.email && <span title={v.email}>{v.email}</span>}
                                {v.phone && <span title={v.phone}>{v.phone}</span>}
                                {v.category && <span className="text-[#0A4F44]">{v.category}</span>}
                                {v.city && <span>{v.city}</span>}
                              </div>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>

            {/* ---- Timeline ---- */}
            <div className="purchase-form-card">
              <div className="purchase-form-card-header">
                <h3><CalendarDays aria-hidden="true" /> Timeline</h3>
              </div>
              <div className="purchase-form-card-body">
                <p className="text-[13px] text-slate-600 leading-relaxed">
                  Quotations are due by <strong>{watched?.dueDate || '—'}</strong>. Share the RFQ with invited vendors and follow up before the due date.
                </p>
              </div>
            </div>
          </aside>
        </div>

        <FormActions
          submitting={submitting}
          draftSaving={draftSaving}
          submitLabel={rfqId ? 'Update RFQ' : 'Create RFQ'}
          draftLabel="Save Draft"
          showDraft
          onDraft={saveDraft}
          onCancel={handleCancel}
          onReset={handleReset}
          onPrint={rfqId ? handlePrint : undefined}
          onExportPdf={rfqId ? handleExportPdf : undefined}
          showSaveNew={!rfqId}
          onSaveNew={handleSaveAndNew}
          showSubmitApproval={canSubmit && !!rfqId}
          onSubmitApproval={onSubmitSubmit}
        />
      </form>

      {/* Reset / Cancel confirmation dialogs */}
      <ConfirmDialog
        open={confirmResetOpen}
        title="Reset RFQ form?"
        message="This will clear every field you have entered on this form. Line items, invited vendors and attachments will be removed — data already saved on the server is not affected."
        confirmLabel="Reset Form"
        variant="warning"
        icon={RotateCcw}
        onConfirm={confirmReset}
        onCancel={() => setConfirmResetOpen(false)}
      />
      <ConfirmDialog
        open={confirmCancelOpen}
        title="Discard unsaved changes?"
        message="You have unsaved changes in this RFQ. Leaving now will discard them."
        confirmLabel="Leave Page"
        variant="default"
        icon={X}
        onConfirm={confirmCancel}
        onCancel={() => setConfirmCancelOpen(false)}
      />
    </>
  );
}
