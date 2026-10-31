/**
 * purchase/pages/logistics/ManufacturingForm.jsx
 * ------------------------------------------------------------------
 * Create / edit form for Manufacturing / Packing jobs.
 * Standardized layout: accordion sections (closed by default),
 * right-side summary, sticky action bar, draft persistence.
 * ------------------------------------------------------------------
 */
import { useEffect, useRef, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router-dom';
import { Factory, Package, RotateCcw, StickyNote, X } from 'lucide-react';
import {
  Accordion, ConfirmDialog, DateInput, FormField, SelectInput, TextArea, TextInput, useToast
} from '../../components/ui';
import FormActions from '../../components/FormActions';
import LogisticsFormSummary from '../../components/LogisticsFormSummary';
import PurchasePageLayout from '../../components/list/PurchasePageLayout';
import '../../styles/cpr-list.css';
import { logisticsService } from '../../services/logistics';
import { purchaseOrderService } from '../../services/purchaseOrder';
import { APPROVAL_STATUS } from '../../constants';
import useFormDraft from '../../hooks/useFormDraft';

const GRID = 'grid grid-cols-1 sm:grid-cols-2 gap-4';
const SPAN2 = 'sm:col-span-2';

function buildFormValues(record = {}) {
  const today = new Date().toISOString().slice(0, 10);
  return {
    poNo: record.poNo || '',
    product: record.product || '',
    qty: String(record.qty || ''),
    expectedDate: record.expectedDate || '',
    startDate: record.startDate || today,
    notes: record.notes || '',
  };
}

export default function ManufacturingForm() {
  const navigate = useNavigate();
  const { packingNo } = useParams();
  const toast = useToast();
  const isEdit = Boolean(packingNo);

  const { loadDraft, saveDraft: persistDraft, clearDraft } = useFormDraft({
    draftKey: 'purchase.mfr',
    recordId: packingNo || null,
  });

  const form = useForm({ defaultValues: buildFormValues(), mode: 'onTouched' });
  const { register, handleSubmit, reset, control, watch, setValue, formState: { errors } } = form;
  const watchedValues = useWatch({ control });

  const [submitting, setSubmitting] = useState(false);
  const [draftSaving, setDraftSaving] = useState(false);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const [releasedPOs, setReleasedPOs] = useState([]);
  const [initialData, setInitialData] = useState(null);
  const [loadingRecord, setLoadingRecord] = useState(isEdit);

  const [userPackingNo, setUserPackingNo] = useState(packingNo || '');

  /* Show the number the backend will actually assign — the mock store's
     sequence is not the live data and displayed a wrong MFR number. */
  useEffect(() => {
    if (isEdit) return;
    let cancelled = false;
    logisticsService
      .getNextMfrNumber()
      .then((no) => {
        if (!cancelled && no) setUserPackingNo(no);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isEdit]);

  /* Load POs for dropdown from backend API */
  useEffect(() => {
    let cancelled = false;
    purchaseOrderService.getOrders({ page: 1, pageSize: 500 }).then((response) => {
      if (!cancelled) {
        setReleasedPOs(response.data.filter((order) => order.approvalStatus === APPROVAL_STATUS.APPROVED));
      }
    }).catch(() => {
      if (!cancelled) setReleasedPOs([]);
    });
    return () => { cancelled = true; };
  }, []);

  /* Load record for edit mode */
  useEffect(() => {
    if (!packingNo) return;
    setLoadingRecord(true);
    logisticsService.getManufacturingById(packingNo).then((record) => {
      if (record) {
        setInitialData(record);
        reset(buildFormValues(record));
        setUserPackingNo(record.packingNo || packingNo);
      }
      setLoadingRecord(false);
    });
  }, [packingNo, reset]);

  /* Load draft on mount */
  const draftRestoredRef = useRef(false);
  useEffect(() => {
    if (draftRestoredRef.current) return;
    draftRestoredRef.current = true;
    const draft = loadDraft();
    if (draft && typeof draft === 'object') {
      reset({ ...buildFormValues(), ...draft }, { keepDefaultValues: false });
      toast.info('Draft restored');
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* Debounced draft save */
  useEffect(() => {
    if (watchedValues) persistDraft(watchedValues);
  }, [watchedValues, persistDraft]);

  /* Auto-fill vendor/qty from PO selection */
  const watchedPoNo = watch('poNo');
  useEffect(() => {
    if (!watchedPoNo || isEdit) return;
    const po = releasedPOs.find((p) => p.poNo === watchedPoNo);
    if (po) {
      if (!watch('product')) setValue('product', po.items?.[0]?.product || '');
      if (!watch('qty')) setValue('qty', String(po.items?.[0]?.qty || ''));
    }
  }, [watchedPoNo, isEdit, releasedPOs, watch, setValue]);

  /* Synchronous in-flight guard: the `submitting` state only disables the
     buttons after a re-render, so two clicks in the same tick could each
     start a create/update (reproduced: double POST on Create Packing Job —
     the backend 409 stopped the duplicate record, the UI did not). The ref
     flips immediately, before React re-renders. */
  const persistInFlight = useRef(false);

  const persist = async (values, { draft = false, stay = false } = {}) => {
    if (persistInFlight.current) return false;
    persistInFlight.current = true;
    if (draft) setDraftSaving(true);
    else setSubmitting(true);
    try {
      if (isEdit) {
        await logisticsService.updateManufacturing(packingNo, { ...values, qty: Number(values.qty) || 0 });
        toast.success(draft ? 'Draft saved' : 'Packing job updated');
        if (!draft) clearDraft();
        if (!stay) navigate(`/purchase/logistics/manufacturing/${packingNo}`);
      } else {
        const created = await logisticsService.createManufacturingJob({
          ...values,
          qty: Number(values.qty) || 0,
        });
        /* Keep the displayed number in step with the backend for the next
           create (Save & New leaves this form open). */
        logisticsService
          .getNextMfrNumber()
          .then((no) => {
            if (no) setUserPackingNo(no);
          })
          .catch(() => {});
        toast.success(draft ? 'Draft saved' : 'Packing job created');
        if (!draft) clearDraft();
        if (!stay) navigate(`/purchase/logistics/manufacturing/${created.packingNo}`);
      }
      return true;
    } catch (err) {
      /* Prefer the backend's own rejection text (duplicate job, validation)
         over axios's generic "Request failed with status code …". */
      toast.error(err?.response?.data?.message || err?.message || 'Failed to save packing job');
      return false;
    } finally {
      setSubmitting(false);
      setDraftSaving(false);
      persistInFlight.current = false;
    }
  };

  const onSubmitSave = (values) => persist(values);
  const saveDraft = () => handleSubmit((values) => persist(values, { draft: true }))();
  const handleSaveAndNew = () => handleSubmit((values) => persist(values, { stay: true }))();
  const handleCancel = () => setConfirmCancelOpen(true);
  const confirmCancel = () => { clearDraft(); navigate(isEdit ? `/purchase/logistics/manufacturing/${packingNo}` : '/purchase/logistics/manufacturing'); };
  const handleReset = () => setConfirmResetOpen(true);
  const confirmReset = () => { reset(buildFormValues()); clearDraft(); setConfirmResetOpen(false); toast.info('Form reset'); };

  if (loadingRecord) {
    return (
      <div className="purchase-page cpr-page">
        <div className="cpr-page-scroll-content flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#075E54]" />
        </div>
      </div>
    );
  }

  return (
    <PurchasePageLayout className="purchase-page--form">
    <form onSubmit={handleSubmit(onSubmitSave)}>
      <div className="pr-form-layout">
        <div className="pr-form-main">
          {/* ============ GENERAL INFORMATION ============ */}
          <Accordion
            title="General Information"
            subtitle="Packing job number, purchase order and product details"
            icon={Factory}
          >
            <div className={GRID}>
              <FormField label="Packing No">
                <TextInput
                  value={userPackingNo}
                  readOnly
                  className="font-semibold text-slate-700 bg-slate-50"
                  placeholder="Auto-generated"
                  ariaLabel="Packing No"
                />
              </FormField>
              <FormField label="Purchase Order" error={errors.poNo?.message}>
                <Controller control={control} name="poNo" render={({ field }) => (
                  <SelectInput value={field.value || ''} onChange={(e) => field.onChange(e.target.value)} ariaLabel="Purchase Order" disabled={isEdit}>
                    <option value="">Select PO...</option>
                    {releasedPOs.map((po) => (
                      <option key={po.poNo} value={po.poNo}>{po.poNo} — {po.vendor}</option>
                    ))}
                  </SelectInput>
                )} />
              </FormField>
              <FormField label="Product / Item" className={SPAN2} error={errors.product?.message}>
                <TextInput registration={register('product')} placeholder="Product name or description" ariaLabel="Product" />
              </FormField>
              <FormField label="Quantity" error={errors.qty?.message}>
                <TextInput type="number" registration={register('qty')} placeholder="0" min="0" ariaLabel="Quantity" />
              </FormField>
              <FormField label="Start Date">
                <Controller control={control} name="startDate" render={({ field }) => (
                  <DateInput value={field.value || ''} onChange={(e) => field.onChange(e.target.value)} />
                )} />
              </FormField>
              <FormField label="Expected Dispatch Date">
                <Controller control={control} name="expectedDate" render={({ field }) => (
                  <DateInput value={field.value || ''} onChange={(e) => field.onChange(e.target.value)} />
                )} />
              </FormField>
            </div>
          </Accordion>

          {/* ============ NOTES ============ */}
          <Accordion
            title="Notes"
            subtitle="Internal notes and remarks for this packing job"
            icon={StickyNote}
          >
            <div className="space-y-4">
              <FormField label="Notes" hint={`${(watchedValues?.notes || '').length} / 500`}>
                <TextArea
                  registration={register('notes')}
                  rows={4}
                  maxLength={500}
                  placeholder="Production notes, special instructions..."
                />
              </FormField>
            </div>
          </Accordion>
        </div>

        <aside className="pr-form-side">
          <LogisticsFormSummary
            title="Packing Summary"
            icon={Package}
            docNo={userPackingNo}
            status={isEdit ? (initialData?.status || 'In Production') : 'In Production'}
            poNo={watchedValues?.poNo}
            vendor={releasedPOs.find((p) => p.poNo === watchedValues?.poNo)?.vendor || initialData?.vendor || ''}
            quantity={Number(watchedValues?.qty) || 0}
            createdBy="Procurement Team"
            createdAt={initialData?.createdAt}
          />
        </aside>
      </div>

      <FormActions
        submitting={submitting}
        draftSaving={draftSaving}
        submitLabel={isEdit ? 'Update Packing Job' : 'Create Packing Job'}
        submitVariant="primary"
        showDraft
        onDraft={saveDraft}
        onCancel={handleCancel}
        onReset={handleReset}
        showSaveNew={!isEdit}
        onSaveNew={handleSaveAndNew}
      />
    </form>

    <ConfirmDialog
      open={confirmResetOpen}
      title="Reset form?"
      message="This will clear all fields. Data already saved is not affected."
      confirmLabel="Reset"
      variant="warning"
      icon={RotateCcw}
      onConfirm={confirmReset}
      onCancel={() => setConfirmResetOpen(false)}
    />
    <ConfirmDialog
      open={confirmCancelOpen}
      title="Discard unsaved changes?"
      message="Leaving now will discard unsaved changes."
      confirmLabel="Leave Page"
      variant="default"
      icon={X}
      onConfirm={confirmCancel}
      onCancel={() => setConfirmCancelOpen(false)}
    />
    </PurchasePageLayout>
  );
}
