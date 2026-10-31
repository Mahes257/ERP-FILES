/**
 * purchase/components/PurchaseOrderForm.jsx
 * ------------------------------------------------------------------
 * Shared create / edit form for the Purchase Order module. Line items
 * use the shared PurchaseItemTable in its Excel-style grid mode
 * (fixed header · sticky # and actions columns · equal-height cells ·
 * keyboard navigation · live Subtotal · GST · Grand Total summary),
 * the same grid as the PR / RFQ forms; Attachments | Notes sit
 * side-by-side (60/40 desktop, stacked mobile) with an auto-growing
 * Notes textarea. Reuses the cost summary with round-off, searchable
 * vendor, ERP logistics and tax fields, attachments, and a full action
 * bar (Save Draft / Submit / Print / Export PDF / Cancel / Reset).
 * Business logic, validation, services and routes are untouched.
 * ------------------------------------------------------------------
 */
import { useEffect, useRef, useState } from 'react';
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from 'react-router-dom';
import { BadgeCheck, Building2, FileText, MapPin, Paperclip, StickyNote } from 'lucide-react';
import {
  Accordion, ConfirmDialog, CurrencySelect, DateInput, FormField, NumberInput, SearchableSelect,
  TextArea, TextInput, useToast
} from './ui';
import EditableMasterSelect from './ui/EditableMasterSelect';
import AttachmentManager from './AttachmentManager';
import FormActions from './FormActions';
import PurchaseItemTable from './PurchaseItemTable';
import PurchaseStatusBadge from './PurchaseStatusBadge';
import PurchaseSummary from './PurchaseSummary';
import { PO_STATUS, RFQ_STATUS } from '../constants';
import { purchaseOrderSchema, uniqueItemDescriptions } from '../validation/requisition';
import { purchaseOrderService, ordersStore } from '../services/purchaseOrder';
import { nfaService } from '../services/nfa';
import { vendorService } from '../services/vendor';
import { requisitionService } from '../services/requisition';
import { rfqService } from '../services/rfq';
import { getDefaultCurrency, getActiveTaxRates, getDefaultTaxRate } from '../services/settings';
import { itemToLine } from '../services/itemCatalog';
import { calcDocumentTotals, nextSeqNo } from '../utils/purchase';
import { buildPoFormItems } from '../utils/poItems';
import { exportPdf, printTable } from '../utils/export';
import useFormDraft from '../hooks/useFormDraft';

const printColumns = [
  { key: 'itemCode', label: 'Item Code' },
  { key: 'product', label: 'Description' },
  { key: 'category', label: 'Category' },
  { key: 'hsn', label: 'HSN' },
  { key: 'uom', label: 'UOM' },
  { key: 'qty', label: 'Qty' },
  { key: 'rate', label: 'Rate' },
  { key: 'discount', label: 'Disc %' },
  { key: 'gstRate', label: 'GST %' },
  { key: 'remarks', label: 'Remarks' }
];

function buildOrderFormValues(record = {}) {
  const today = new Date().toISOString().slice(0, 10);
  const items = buildPoFormItems(record.items);
  return {
    title: record.title || '',
    vendor: record.vendor || '',
    reference: record.reference || '',
    rfqNo: record.rfqNo || '',
    quotationNo: record.quotationNo || '',
    orderDate: record.orderDate || today,
    expectedDate: record.expectedDate || '',
    deliveryDate: record.deliveryDate || '',
    currency: record.currency || getDefaultCurrency(),
    terms: record.terms || '30 Days',
    gstType: record.gstType || '',
    incoterm: record.incoterm || '',
    transportMode: record.transportMode || '',
    warehouse: record.warehouse || '',
    /* Budget-control dimensions — carried on the PO so the approval
       rules and budget master can condition on them. */
    department: record.department || '',
    project: record.project || '',
    costCenter: record.costCenter || '',
    location: record.location || '',
    deliveryAddress: record.deliveryAddress || '',
    deliveryInstructions: record.deliveryInstructions || '',
    /* Commercial values carried forward by the NFA → PO conversion —
       kept in the form values so they persist with the submitted PO
       (declared on purchaseOrderSchema so the zod resolver never
       strips them). */
    deliveryTerms: record.deliveryTerms || '',
    warranty: record.warranty || '',
    freight: Number(record.freight) || 0,
    insurance: Number(record.insurance) || 0,
    paymentTerms: record.paymentTerms || null,
    paymentTermsRequired: Boolean(record.paymentTermsRequired),
    discount: String(record.discount ?? 0),
    charges: String(record.charges ?? 0),
    notes: record.notes || '',
    internalNotes: record.internalNotes || '',
    vendorNotes: record.vendorNotes || '',
    termsAndConditions: record.termsAndConditions || '',
    attachments: Array.isArray(record.attachments) ? record.attachments : [],
    items,
    /* Carried so the form reflects the real document stage (e.g. the
       audit "Current Stage" badge in edit mode). The service keeps
       status workflow-driven — the submit path always overrides it. */
    status: record.status || ''
  };
}

export default function PurchaseOrderForm({ initialData, orderId }) {
  const navigate = useNavigate();
  const toast = useToast();

  const { loadDraft, saveDraft: persistDraft, saveDraftNow, clearDraft } = useFormDraft({
    draftKey: 'purchase.po',
    recordId: orderId || null,
  });

  const [vendorNames, setVendorNames] = useState([]);
  const [prList, setPrList] = useState([]);
  const [rfqList, setRfqList] = useState([]);
  const [quotationList, setQuotationList] = useState([]);
  const [taxRates, setTaxRates] = useState([]);

  useEffect(() => {
    let cancelled = false;
    vendorService
      .getVendorNames()
      .then((names) => {
        if (!cancelled) setVendorNames(names);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  /* Load PR, RFQ, Quotation lists and tax rates for reference selectors */
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      requisitionService.getRequisitions({ page: 1, pageSize: 200 }).catch(() => ({ data: [] })),
      rfqService.getRfqs({ page: 1, pageSize: 200 }).catch(() => ({ data: [] })),
      rfqService.getQuotations({ page: 1, pageSize: 200 }).catch(() => ({ data: [] }))
    ]).then(([prResult, rfqResult, quoteResult]) => {
      if (cancelled) return;
      setPrList(prResult.data || []);
      setQuotationList(quoteResult.data || []);
      /* RULE: the backend rejects a PO whose linked RFQ is not yet
         Awarded ("RFQ must be awarded before creating a PO", HTTP 400).
         Only Awarded RFQs are therefore offered — an unawarded selection
         could never be saved, so offering it only produces a guaranteed
         400 on submit. Same contract as QuotationEntryModal, which only
         offers RFQs that are open for bids. */
      setRfqList((rfqResult.data || []).filter(
        (rfq) => String(rfq.status || '').toLowerCase() === RFQ_STATUS.AWARDED.toLowerCase()
      ));
    });
    setTaxRates(getActiveTaxRates().filter((t) => t.type === 'GST'));
    return () => { cancelled = true; };
  }, []);

  const form = useForm({
    resolver: zodResolver(purchaseOrderSchema),
    defaultValues: buildOrderFormValues(initialData),
    mode: 'onTouched'
  });

  const { register, handleSubmit, reset, control, setValue, setError, watch, formState } = form;
  const { errors } = formState;
  const { fields, append, remove, insert, move } = useFieldArray({ control, name: 'items' });
  const watched = useWatch({ control });
  const totals = calcDocumentTotals(watched?.items || [], watched?.discount, watched?.charges);

  /** Auto-generated PO number on create; loaded from saved record on edit. Editable by user. */
  const [userPoNo, setUserPoNo] = useState(
    () => (orderId ? initialData?.poNo || '' : nextSeqNo(ordersStore.all, 'PO', 'poNo', 4200))
  );

  const [submitting, setSubmitting] = useState(false);
  const [draftSaving, setDraftSaving] = useState(false);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);

  /* ---- Draft persistence: load on mount, debounced save on change ---- */
  const draftRestoredRef = useRef(false);
  useEffect(() => {
    if (draftRestoredRef.current) return;
    draftRestoredRef.current = true;
    /* A NEW order opened from an approved upstream document (NFA → PO
       conversion pre-fill) must show the converted items, vendor and
       references — a leftover draft from an earlier blank visit to the
       create page must never overwrite them (it would blank the grid
       and zero the totals). The pre-fill is authoritative on create;
       drafts still restore for manual blank creates and record edits. */
    const hasConversionPrefill = !orderId
      && Array.isArray(initialData?.items)
      && initialData.items.length > 0;
    if (!hasConversionPrefill) {
      const draft = loadDraft();
      if (draft && typeof draft === 'object') {
        reset({ ...buildOrderFormValues(initialData), ...draft }, { keepDefaultValues: false });
        if (draft.poNo) setUserPoNo(draft.poNo);
        toast.info('Draft restored');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount
  }, []);

  /* The next PO number must come from the DATABASE, never from the local
     store: in API mode the local store is empty, so the client-side guess
     could hand out a number another PO already holds and the save failed
     with 400 "PO number already exists". Runs after the draft restore so a
     stale number parked in a draft can never win either. */
  useEffect(() => {
    if (orderId || initialData?.poNo) return undefined;
    let cancelled = false;
    purchaseOrderService.getNextOrderNumber().then((nextNumber) => {
      if (!cancelled && nextNumber) setUserPoNo(nextNumber);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [initialData?.poNo, orderId]);

  useEffect(() => {
    if (watched) persistDraft({ ...watched, poNo: userPoNo });
  }, [watched, persistDraft, userPoNo]);

  /* ---- Reset ---- */
  const handleReset = () => setConfirmResetOpen(true);

  const confirmReset = () => {
    setConfirmResetOpen(false);
    reset(buildOrderFormValues(initialData));
    clearDraft();
  };

  const persist = async (values, targetStatus) => {
    setSubmitting(true);
    try {
      const payload = { ...values, poNo: userPoNo, status: targetStatus };
      const isDraft = targetStatus === PO_STATUS.DRAFT;
      /* NFA → PO handoff bookkeeping — a PO created from an approved
         note carries the source NFA on the record (survives a Draft
         save + later submit) and, once actually raised (not Draft),
         links back onto the note so the NFA shows the raised PO. */
      const sourceNfaId = initialData?.nfaId || null;
      if (!orderId && sourceNfaId) {
        payload.nfaId = sourceNfaId;
        payload.nfaNo = initialData?.nfaNo || sourceNfaId;
      }
      const linkNfa = (poNo) =>
        !isDraft && sourceNfaId
          ? nfaService.recordPoRaised({ nfaId: sourceNfaId, poNo }).catch(() => {})
          : Promise.resolve();
      if (orderId) {
        await purchaseOrderService.updateOrder(orderId, payload);
        if (!isDraft && initialData?.status === PO_STATUS.DRAFT) {
          /* A full-payload update never flips a Draft to Pending Approval on
             the backend (status is workflow-driven), so submit explicitly —
             otherwise "Update Purchase Order" silently leaves it a Draft. */
          await purchaseOrderService.submitOrder(orderId);
        }
        if (payload.nfaId || sourceNfaId) await linkNfa(orderId);
        toast.success(isDraft ? 'Draft saved' : 'Purchase order updated successfully');
        if (!isDraft) clearDraft();
        navigate(`/purchase/orders/${orderId}`);
      } else {
        const created = await purchaseOrderService.createOrder(payload);
        if (!isDraft) {
          /* The backend always persists a new PO as Draft — submitting for
             approval is a separate transition. Without this the order
             silently stayed a Draft while the UI toasted success. */
          await purchaseOrderService.submitOrder(created.id);
        }
        await linkNfa(created.poNo);
        toast.success(isDraft ? 'Draft saved' : 'Purchase order created successfully');
        if (!isDraft) clearDraft();
        navigate(`/purchase/orders/${created.id}`);
      }
    } catch (err) {
      /* The backend's ApiResponse carries the real reason (e.g. "RFQ must
         be awarded before creating a PO"); axios only exposes the generic
         "Request failed with status code 400", so prefer the body. */
      const backendMessage = err?.response?.data?.message;
      toast.error(backendMessage || err?.message || (orderId ? 'Failed to update purchase order' : 'Failed to create purchase order'));
    } finally {
      setSubmitting(false);
      setDraftSaving(false);
    }
  };

  const validateItems = (items = []) => {
    const duplicates = uniqueItemDescriptions(items);
    if (duplicates.length > 0) {
      setError('items', { type: 'manual', message: `Duplicate item description${duplicates.length > 1 ? 's' : ''} detected on row${duplicates.length > 1 ? 's' : ''} ${duplicates.map((i) => i + 1).join(', ')}.` });
      return false;
    }
    return true;
  };

  const onSubmit = (values) => {
    if (!validateItems(values.items)) return;
    persist(values, PO_STATUS.PENDING_APPROVAL);
  };

  const onSaveDraft = handleSubmit(async (values) => {
    if (!validateItems(values.items)) return;
    await persist(values, PO_STATUS.DRAFT);
  });

  const emptyItem = () => ({ itemCode: '', product: '', category: '', hsn: '', uom: 'Nos', qty: '', rate: '', discount: '', gstRate: getDefaultTaxRate(), remarks: '' });

  const appendItem = () => append(emptyItem());

  /* Item Master auto-fill: when the typed product matches a catalog SKU
     or name, copy the master's category / HSN / UOM / default rate /
     tax onto the row (keeps qty, discount and remarks the user entered). */
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
    printTable(`Purchase Order${values.title ? ` — ${values.title}` : ''}`, printColumns, values.items || []);
  };

  const handleExportPdf = () => {
    const values = watched || {};
    exportPdf({
      title: `Purchase Order${values.title ? ` — ${values.title}` : ''}`,
      filename: `purchase-order${orderId ? `-${orderId}` : ''}`,
      meta: [
        ['Vendor', values.vendor],
        ['Order Date', values.orderDate],
        ['Expected Delivery', values.expectedDate],
        ['Currency', values.currency],
        ['Payment Terms', values.terms],
        ['Incoterm', values.incoterm]
      ],
      columns: printColumns,
      records: values.items || []
    });
  };

  const itemCount = (watched?.items || []).filter((item) => item.product).length;
  const attachmentCount = (watch('attachments') || []).length;

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <div className="purchase-page-form-grid">
        <div className="purchase-main-form">
      <Accordion
        title="Order Details"
        subtitle="Vendor, reference requisition, logistics and commercial terms"
        icon={FileText}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="PO Number">
            <TextInput
              value={userPoNo}
              onChange={(e) => setUserPoNo(e.target.value)}
              className="font-semibold text-slate-700"
              placeholder="Auto-generated"
              ariaLabel="PO Number"
            />
          </FormField>
          <FormField label="PO Date" required>
            <DateInput registration={register('orderDate')} />
          </FormField>
          <FormField label="Order Title" required error={errors.title?.message} className="sm:col-span-2">
            <TextInput registration={register('title')} error={!!errors.title} placeholder="e.g. CRCA coils for stamping line" />
          </FormField>
          <FormField label="Vendor" required error={errors.vendor?.message}>
            <Controller control={control} name="vendor" render={({ field }) => (
              <SearchableSelect value={field.value || ''} onChange={field.onChange} options={vendorNames} placeholder="Search vendor..." error={!!errors.vendor} ariaLabel="Vendor" />
            )} />
          </FormField>
          <FormField label="PR Reference">
            <Controller control={control} name="reference" render={({ field }) => (
              <SearchableSelect
                value={field.value || ''}
                onChange={field.onChange}
                options={prList.map((pr) => ({ value: pr.prNo || pr.id, label: `${pr.prNo || pr.id} — ${pr.title || 'Untitled'}${pr.vendor ? ` (${pr.vendor})` : ''}` }))}
                placeholder="Select PR..."
                clearable
                ariaLabel="PR Reference"
              />
            )} />
          </FormField>
          <FormField label="RFQ Reference">
            <Controller control={control} name="rfqNo" render={({ field }) => (
              <SearchableSelect
                value={field.value || ''}
                onChange={field.onChange}
                options={rfqList.map((rfq) => ({ value: rfq.rfqNo || rfq.id, label: `${rfq.rfqNo || rfq.id} — ${rfq.title || 'Untitled'}` }))}
                placeholder="Select RFQ..."
                clearable
                ariaLabel="RFQ Reference"
              />
            )} />
          </FormField>
          <FormField label="Quotation Reference">
            <Controller control={control} name="quotationNo" render={({ field }) => (
              <SearchableSelect
                value={field.value || ''}
                onChange={field.onChange}
                options={quotationList.map((q) => ({ value: q.quotationNo || q.id, label: `${q.quotationNo || q.id} — ${q.vendor || 'Unknown'}${q.total ? ` · ${q.total}` : ''}` }))}
                placeholder="Select Quotation..."
                clearable
                ariaLabel="Quotation Reference"
              />
            )} />
          </FormField>
          <FormField label="Expected Delivery">
            <DateInput registration={register('expectedDate')} />
          </FormField>
          <FormField label="Currency">
            <Controller control={control} name="currency" render={({ field }) => (
              <CurrencySelect value={field.value || ''} onChange={field.onChange} placeholder="Select currency" ariaLabel="Currency" error={!!errors.currency} />
            )} />
          </FormField>
          <FormField label="Payment Terms">
            <Controller control={control} name="terms" render={({ field }) => (
              <EditableMasterSelect masterKey="paymentTerms" value={field.value || ''} onChange={field.onChange} placeholder="Select payment terms..." ariaLabel="Payment Terms" />
            )} />
          </FormField>
          <FormField label="GST Type">
            <Controller control={control} name="gstType" render={({ field }) => (
              <EditableMasterSelect masterKey="gstTypes" value={field.value || ''} onChange={field.onChange} placeholder="Select GST type..." ariaLabel="GST Type" />
            )} />
          </FormField>
          <FormField label="Incoterm">
            <Controller control={control} name="incoterm" render={({ field }) => (
              <EditableMasterSelect masterKey="incoterms" value={field.value || ''} onChange={field.onChange} placeholder="Select incoterm..." ariaLabel="Incoterm" />
            )} />
          </FormField>
          <FormField label="Transport Mode">
            <Controller control={control} name="transportMode" render={({ field }) => (
              <EditableMasterSelect masterKey="transportModes" value={field.value || ''} onChange={field.onChange} placeholder="Select transport mode..." ariaLabel="Transport Mode" />
            )} />
          </FormField>
          <FormField label="Department">
            <Controller control={control} name="department" render={({ field }) => (
              <EditableMasterSelect masterKey="departments" value={field.value || ''} onChange={field.onChange} placeholder="Search department..." ariaLabel="Department" />
            )} />
          </FormField>
          <FormField label="Project">
            <Controller control={control} name="project" render={({ field }) => (
              <EditableMasterSelect masterKey="projects" value={field.value || ''} onChange={field.onChange} placeholder="Search project..." ariaLabel="Project" />
            )} />
          </FormField>
          <FormField label="Cost Center">
            <Controller control={control} name="costCenter" render={({ field }) => (
              <EditableMasterSelect masterKey="costCenters" value={field.value || ''} onChange={field.onChange} placeholder="Search cost center..." ariaLabel="Cost Center" />
            )} />
          </FormField>
          <FormField label="Discount (%)">
            <NumberInput min="0" max="100" step="any" registration={register('discount')} error={!!errors.discount} placeholder="0" />
          </FormField>
          <FormField label="Charges (non-taxable)">
            <NumberInput min="0" step="any" registration={register('charges')} error={!!errors.charges} placeholder="0.00" />
          </FormField>
        </div>
      </Accordion>

      <Accordion
        title="Logistics"
        subtitle="Warehouse, delivery date and instructions"
        icon={MapPin}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="Warehouse">
            <Controller control={control} name="warehouse" render={({ field }) => (
              <EditableMasterSelect masterKey="warehouses" value={field.value || ''} onChange={field.onChange} placeholder="Select warehouse..." ariaLabel="Warehouse" />
            )} />
          </FormField>
          <FormField label="Location">
            <Controller control={control} name="location" render={({ field }) => (
              <EditableMasterSelect masterKey="locations" value={field.value || ''} onChange={field.onChange} placeholder="Select location..." ariaLabel="Location" />
            )} />
          </FormField>
          <FormField label="Delivery Address">
            <Controller control={control} name="deliveryAddress" render={({ field }) => (
              <EditableMasterSelect masterKey="deliveryAddresses" value={field.value || ''} onChange={field.onChange} placeholder="Select delivery address..." ariaLabel="Delivery Address" />
            )} />
          </FormField>
          <FormField label="Delivery Date">
            <DateInput registration={register('deliveryDate')} />
          </FormField>
          <FormField label="Delivery Instructions" className="sm:col-span-2">
            <TextArea
              registration={register('deliveryInstructions')}
              rows={3}
              autoGrow
              placeholder="Special handling, loading dock requirements, contact person..."
            />
          </FormField>
        </div>
      </Accordion>

      <Accordion
        title="Line Items"
        subtitle="Ordered products with GST calculation"
        icon={FileText}
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
          currency={watched.currency || 'INR'}
          totals={totals}
          gstRates={taxRates.length > 0 ? taxRates.map((t) => t.rate) : undefined}
          onItemSelect={handleItemSelect}
          excel
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

      {/* ============ ATTACHMENTS | NOTES — side-by-side ============
          Desktop → Attachments (60%) | Notes (40%); tablet → equal
          halves; mobile → stacked. Mirrors the RFQ / Vendor forms. */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-[3fr_2fr] gap-6 items-start">
        <Accordion
          title="Attachments"
          subtitle="PO terms, drawings, approvals"
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
          title="Notes & Terms"
          subtitle="Internal notes, vendor communication and terms"
          icon={StickyNote}
        >
          <div className="space-y-4">
            <FormField label="Internal Notes" hint="Private notes not visible to vendor">
              <TextArea
                registration={register('internalNotes')}
                rows={3}
                autoGrow
                placeholder="Internal comments, approval notes..."
              />
            </FormField>
            <FormField label="Vendor Notes" hint="Notes visible to the vendor">
              <TextArea
                registration={register('vendorNotes')}
                rows={3}
                autoGrow
                placeholder="Message to vendor, special requirements..."
              />
            </FormField>
            <FormField label="Terms & Conditions">
              <TextArea
                registration={register('termsAndConditions')}
                rows={4}
                autoGrow
                placeholder="Standard terms, warranty, penalty clauses..."
              />
            </FormField>
          </div>
        </Accordion>
      </div>
        </div>

        <aside className="purchase-sidebar-form">
          <div className="purchase-form-card">
            <div className="purchase-form-card-header">
              <h3><BadgeCheck aria-hidden="true" /> PO Summary</h3>
            </div>
            <div className="purchase-form-card-body">
              <div className="purchase-total-row">
                <span className="total-label">Stage</span>
                <span className="total-value"><PurchaseStatusBadge status={watched?.status || 'Draft'} /></span>
              </div>
              <div className="purchase-total-row">
                <span className="total-label">Vendor</span>
                <span className="total-value max-w-[180px] truncate">{watched?.vendor || '—'}</span>
              </div>
              <div className="purchase-total-row">
                <span className="total-label">Order Date</span>
                <span className="total-value">{watched?.orderDate || '—'}</span>
              </div>
              <div className="purchase-total-row">
                <span className="total-label">Expected Delivery</span>
                <span className="total-value">{watched?.expectedDate || '—'}</span>
              </div>
              <div className="purchase-total-row">
                <span className="total-label">Payment Terms</span>
                <span className="total-value">{watched?.terms || '—'}</span>
              </div>
              <div className="purchase-total-row">
                <span className="total-label">Line Items</span>
                <span className="total-value">{itemCount}</span>
              </div>
              {watched?.rfqNo && (
                <div className="purchase-total-row">
                  <span className="total-label">RFQ</span>
                  <span className="total-value text-violet-700 font-semibold">{watched.rfqNo}</span>
                </div>
              )}
              {watched?.quotationNo && (
                <div className="purchase-total-row">
                  <span className="total-label">Quotation</span>
                  <span className="total-value text-violet-700 font-semibold">{watched.quotationNo}</span>
                </div>
              )}
            </div>
          </div>

          <PurchaseSummary totals={totals} currency={watched.currency || 'INR'} />

          <div className="purchase-form-card">
            <div className="purchase-form-card-header">
              <h3><MapPin aria-hidden="true" /> Logistics</h3>
            </div>
            <div className="purchase-form-card-body">
              <p className="text-[13px] text-slate-600 leading-relaxed">
                Deliver to <strong>{watched?.warehouse || '—'}</strong>
                {watched?.deliveryAddress ? ` — ${watched.deliveryAddress}` : ''}.
              </p>
              <div className="mt-3 pt-3 border-t border-slate-100 flex flex-col gap-1.5 text-[12px] text-slate-500">
                <span className="inline-flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5 text-[#0A4F44]" /> {watched?.location || '—'}</span>
                <span className="inline-flex items-center gap-1.5"><FileText className="w-3.5 h-3.5 text-[#0A4F44]" /> {watched?.transportMode || '—'} · {watched?.incoterm || '—'}</span>
                {watched?.deliveryDate && (
                  <span className="inline-flex items-center gap-1.5"><FileText className="w-3.5 h-3.5 text-[#0A4F44]" /> Delivery: {watched.deliveryDate}</span>
                )}
              </div>
            </div>
          </div>

          <div className="purchase-form-card">
            <div className="purchase-form-card-header">
              <h3><BadgeCheck aria-hidden="true" /> Approval / Audit</h3>
            </div>
            <div className="purchase-form-card-body">
              <div className="purchase-total-row">
                <span className="total-label">Created By</span>
                <span className="total-value">{initialData?.activity?.[0]?.actor || 'System'}</span>
              </div>
              <div className="purchase-total-row">
                <span className="total-label">Created Date</span>
                <span className="total-value">{initialData?.createdAt ? new Date(initialData.createdAt).toLocaleDateString() : watched?.orderDate || '—'}</span>
              </div>
              <div className="purchase-total-row">
                <span className="total-label">Current Stage</span>
                <span className="total-value"><PurchaseStatusBadge status={watched?.status || 'Draft'} /></span>
              </div>
            </div>
          </div>
        </aside>
      </div>

      <FormActions
        submitting={submitting}
        draftSaving={draftSaving}
        submitLabel={orderId ? 'Update Purchase Order' : 'Create Purchase Order'}
        draftLabel="Save Draft"
        /* "Save Draft" is for documents that are not yet in the approval
           queue — the create form and edits of a Draft PO. A Pending
           Approval PO being edited stays pending (the update re-queues it
           after a rejection); it must not silently regress to Draft. */
        showDraft={!orderId || initialData?.status !== PO_STATUS.PENDING_APPROVAL}
        onDraft={() => {
          setDraftSaving(true);
          saveDraftNow({ ...form.getValues(), poNo: userPoNo });
          onSaveDraft().finally(() => setDraftSaving(false));
        }}
        onCancel={() => navigate('/purchase/orders')}
        onReset={handleReset}
        onPrint={handlePrint}
        onExportPdf={handleExportPdf}
      />
      <ConfirmDialog
        open={confirmResetOpen}
        title="Reset Form"
        message="Are you sure you want to reset the form? All unsaved changes will be lost."
        onConfirm={confirmReset}
        onCancel={() => setConfirmResetOpen(false)}
      />
    </form>
  );
}
