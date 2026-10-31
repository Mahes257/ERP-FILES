/**
 * purchase/pages/logistics/ShipmentForm.jsx
 * ------------------------------------------------------------------
 * Create / edit form for Shipment Tracking.
 * Standardized layout: accordion sections (closed by default),
 * right-side summary, sticky action bar, draft persistence.
 * ------------------------------------------------------------------
 */
import { useEffect, useRef, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { RotateCcw, Ship, StickyNote, Truck, X } from 'lucide-react';
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
import { nextSeqNo } from '../../utils/purchase';
import useFormDraft from '../../hooks/useFormDraft';
import { shipmentsStore } from '../../services/logistics';

const GRID = 'grid grid-cols-1 sm:grid-cols-2 gap-4';
const SPAN2 = 'sm:col-span-2';

const TRANSPORT_MODES = ['Road', 'Rail', 'Air', 'Sea', 'Courier'];

function buildFormValues(record = {}) {
  return {
    poNo: record.poNo || '',
    packingNo: record.packingNo || '',
    carrier: record.carrier || '',
    mode: record.mode || 'Road',
    destination: record.destination || '',
    dispatchDate: record.dispatchDate || '',
    etd: record.etd || '',
    eta: record.eta || '',
    trackingNo: record.trackingNo || '',
    notes: record.notes || '',
  };
}

export default function ShipmentForm() {
  const navigate = useNavigate();
  const { shipmentNo } = useParams();
  const location = useLocation();
  const toast = useToast();
  const isEdit = Boolean(shipmentNo);

  const { loadDraft, saveDraft: persistDraft, clearDraft } = useFormDraft({
    draftKey: 'purchase.shipment',
    recordId: shipmentNo || null,
  });

  const form = useForm({ defaultValues: buildFormValues(), mode: 'onTouched' });
  const { register, handleSubmit, reset, control, watch, formState: { errors } } = form;
  const watchedValues = useWatch({ control });

  const [submitting, setSubmitting] = useState(false);
  const [draftSaving, setDraftSaving] = useState(false);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const [releasedPOs, setReleasedPOs] = useState([]);
  const [initialData, setInitialData] = useState(null);
  const [loadingRecord, setLoadingRecord] = useState(isEdit);

  const [userShipmentNo, setUserShipmentNo] = useState(
    () => (isEdit ? shipmentNo : nextSeqNo(shipmentsStore.all, 'SHP', 'shipmentNo', 4200))
  );

  /* Load POs for dropdown. Read through the service so API mode gets the
     backend's purchase orders — the local store is empty there, which left
     this dropdown permanently empty and made shipment creation impossible. */
  useEffect(() => {
    let cancelled = false;
    purchaseOrderService
      .getOrders({ page: 1, pageSize: 500 })
      .then((response) => {
        if (cancelled) return;
        const records = Array.isArray(response) ? response : (response?.data || []);
        setReleasedPOs(records.filter((o) => o.approvalStatus === APPROVAL_STATUS.APPROVED));
      })
      .catch(() => { if (!cancelled) setReleasedPOs([]); });
    return () => { cancelled = true; };
  }, []);

  /* Pre-fill from navigation state (e.g. from Manufacturing "Create Shipment") */
  useEffect(() => {
    if (isEdit) return;
    const navState = location.state;
    if (navState?.poNo) {
      reset((prev) => ({ ...prev, poNo: navState.poNo, packingNo: navState.packingNo || '' }));
      window.history.replaceState({}, document.title);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* Load record for edit mode */
  useEffect(() => {
    if (!shipmentNo) return;
    setLoadingRecord(true);
    logisticsService.getShipmentById(shipmentNo).then((record) => {
      if (record) {
        setInitialData(record);
        reset(buildFormValues(record));
        setUserShipmentNo(record.shipmentNo || shipmentNo);
      }
      setLoadingRecord(false);
    });
  }, [shipmentNo, reset]);

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

  /* Auto-fill vendor from PO */
  const watchedPoNo = watch('poNo');
  const selectedPO = releasedPOs.find((p) => p.poNo === watchedPoNo);

  /* Link the packing job that belongs to the selected PO. A shipment must
     reference the same Manufacturing/Packing document its PO was packed
     under, so the reference is resolved from the packing records instead of
     being retyped — and it is cleared when the PO changes to one with no
     packing job, so a stale reference can never be saved against another PO. */
  useEffect(() => {
    if (isEdit) return undefined;
    if (!watchedPoNo) return undefined;
    let cancelled = false;
    logisticsService
      .getManufacturing({ status: 'All', page: 1, pageSize: 500 })
      .then((response) => {
        if (cancelled) return;
        const records = Array.isArray(response) ? response : (response?.data || []);
        const job = records.find((entry) => entry.poNo === watchedPoNo);
        form.setValue('packingNo', job ? (job.packingNo || job.mfrNo || '') : '', { shouldDirty: true });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [watchedPoNo, isEdit]); // eslint-disable-line react-hooks/exhaustive-deps

  const persist = async (values, { draft = false, stay = false } = {}) => {
    if (draft) setDraftSaving(true);
    else setSubmitting(true);
    try {
      if (isEdit) {
        await logisticsService.updateShipment(shipmentNo, {
          carrier: values.carrier,
          mode: values.mode,
          destination: values.destination,
          notes: values.notes,
        });
        toast.success(draft ? 'Draft saved' : 'Shipment updated');
        if (!draft) clearDraft();
        if (!stay) navigate(`/purchase/logistics/shipment/${shipmentNo}`);
      } else {
        if (!values.poNo) {
          toast.error('Select a released purchase order');
          setSubmitting(false);
          return;
        }
        const created = await logisticsService.createShipment({
          poNo: values.poNo,
          packingNo: values.packingNo,
          carrier: values.carrier,
          mode: values.mode,
          etd: values.etd,
          eta: values.eta,
          destination: values.destination,
          dispatchDate: values.dispatchDate,
          trackingNo: values.trackingNo,
          notes: values.notes,
        });
        toast.success(draft ? 'Draft saved' : `Shipment ${created.shipmentNo} created`);
        if (!draft) clearDraft();
        if (!stay) navigate(`/purchase/logistics/shipment/${created.shipmentNo}`);
      }
      return true;
    } catch (err) {
      toast.error(err?.message || 'Failed to save shipment');
      return false;
    } finally {
      setSubmitting(false);
      setDraftSaving(false);
    }
  };

  const onSubmitSave = (values) => persist(values);
  const saveDraft = () => handleSubmit((values) => persist(values, { draft: true }))();
  const handleSaveAndNew = () => handleSubmit((values) => persist(values, { stay: true }))();
  const handleCancel = () => setConfirmCancelOpen(true);
  const confirmCancel = () => { clearDraft(); navigate(isEdit ? `/purchase/logistics/shipment/${shipmentNo}` : '/purchase/logistics/shipment'); };
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
          {/* ============ SHIPMENT DETAILS ============ */}
          <Accordion
            title="Shipment Details"
            subtitle="Purchase order, carrier and transport information"
            icon={Ship}
          >
            <div className={GRID}>
              <FormField label="Shipment No">
                <TextInput
                  value={userShipmentNo}
                  onChange={(e) => setUserShipmentNo(e.target.value)}
                  className="font-semibold text-slate-700"
                  placeholder="Auto-generated"
                  ariaLabel="Shipment No"
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
              {selectedPO?.vendor && (
                <FormField label="Vendor">
                  <TextInput value={selectedPO.vendor} readOnly className="bg-slate-50" />
                </FormField>
              )}
              <FormField label="Packing No (Optional)">
                <TextInput registration={register('packingNo')} placeholder="e.g. MFR-2026-014" ariaLabel="Packing No" />
              </FormField>
            </div>
          </Accordion>

          {/* ============ TRANSPORT ============ */}
          <Accordion
            title="Transport & Routing"
            subtitle="Carrier, mode, destination and dates"
            icon={Truck}
          >
            <div className={GRID}>
              <FormField label="Carrier">
                <TextInput registration={register('carrier')} placeholder="e.g. Blue Dart Freight" ariaLabel="Carrier" />
              </FormField>
              <FormField label="Transport Mode">
                <Controller control={control} name="mode" render={({ field }) => (
                  <SelectInput value={field.value || 'Road'} onChange={(e) => field.onChange(e.target.value)} ariaLabel="Transport Mode">
                    {TRANSPORT_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
                  </SelectInput>
                )} />
              </FormField>
              <FormField label="Destination" className={SPAN2}>
                <TextInput registration={register('destination')} placeholder="e.g. Plant A Store, Pune" ariaLabel="Destination" />
              </FormField>
              <FormField label="Dispatch Date">
                <Controller control={control} name="dispatchDate" render={({ field }) => (
                  <DateInput value={field.value || ''} onChange={(e) => field.onChange(e.target.value)} />
                )} />
              </FormField>
              <FormField label="ETD (Estimated Departure)">
                <Controller control={control} name="etd" render={({ field }) => (
                  <DateInput value={field.value || ''} onChange={(e) => field.onChange(e.target.value)} />
                )} />
              </FormField>
              <FormField label="ETA (Estimated Arrival)">
                <Controller control={control} name="eta" render={({ field }) => (
                  <DateInput value={field.value || ''} onChange={(e) => field.onChange(e.target.value)} />
                )} />
              </FormField>
              <FormField label="Tracking Number">
                <TextInput registration={register('trackingNo')} placeholder="Carrier tracking reference" ariaLabel="Tracking Number" />
              </FormField>
            </div>
          </Accordion>

          {/* ============ NOTES ============ */}
          <Accordion
            title="Notes"
            subtitle="Additional notes for this shipment"
            icon={StickyNote}
          >
            <div className="space-y-4">
              <FormField label="Notes" hint={`${(watchedValues?.notes || '').length} / 500`}>
                <TextArea
                  registration={register('notes')}
                  rows={4}
                  maxLength={500}
                  placeholder="Shipping instructions, special handling..."
                />
              </FormField>
            </div>
          </Accordion>
        </div>

        <aside className="pr-form-side">
          <LogisticsFormSummary
            title="Shipment Summary"
            icon={Ship}
            docNo={userShipmentNo}
            status={isEdit ? (initialData?.status || 'Pending Dispatch') : 'Pending Dispatch'}
            poNo={watchedValues?.poNo}
            sourceDoc={watchedValues?.packingNo}
            sourceLabel="Packing No"
            vendor={selectedPO?.vendor || initialData?.vendor || ''}
            warehouse={watchedValues?.destination}
            createdBy="Procurement Team"
            createdAt={initialData?.createdAt}
          />
        </aside>
      </div>

      <FormActions
        submitting={submitting}
        draftSaving={draftSaving}
        submitLabel={isEdit ? 'Update Shipment' : 'Create Shipment'}
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
