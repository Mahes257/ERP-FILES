/**
 * purchase/pages/logistics/GrnForm.jsx
 * ------------------------------------------------------------------
 * Create / edit form for Goods Receipt (GRN).
 * Standardized layout: accordion sections (closed by default),
 * right-side summary, sticky action bar, draft persistence.
 * ------------------------------------------------------------------
 */
import { useEffect, useRef, useState } from 'react';
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router-dom';
import { Package, PackageCheck, RotateCcw, StickyNote, X } from 'lucide-react';
import {
  Accordion, ConfirmDialog, FormField, NumberInput, SelectInput, TextArea, TextInput, useToast
} from '../../components/ui';
import FormActions from '../../components/FormActions';
import LogisticsFormSummary from '../../components/LogisticsFormSummary';
import PurchasePageLayout from '../../components/list/PurchasePageLayout';
import '../../styles/cpr-list.css';
import { logisticsService } from '../../services/logistics';
import { purchaseOrderService } from '../../services/purchaseOrder';
import { isPoReleased } from '../../constants';
import { nextSeqNo } from '../../utils/purchase';
import useFormDraft from '../../hooks/useFormDraft';
import { grnsStore } from '../../services/logistics';

const GRID = 'grid grid-cols-1 sm:grid-cols-2 gap-4';

function buildFormValues(record = {}) {
  return {
    poNo: record.poNo || '',
    shipmentNo: record.shipmentNo || '',
    warehouse: record.warehouse || '',
    notes: record.notes || '',
    items: (record.items || []).map((item) => ({
      product: item.product || '',
      qty: String(item.qty || ''),
      received: String(item.received || 0),
    })),
  };
}

export default function GrnForm() {
  const navigate = useNavigate();
  const { grnNo } = useParams();
  const toast = useToast();
  const isEdit = Boolean(grnNo);

  const { loadDraft, saveDraft: persistDraft, clearDraft } = useFormDraft({
    draftKey: 'purchase.grn',
    recordId: grnNo || null,
  });

  const form = useForm({ defaultValues: buildFormValues(), mode: 'onTouched' });
  const { register, handleSubmit, reset, control, watch, formState: { errors } } = form;
  const watchedValues = useWatch({ control });
  const { fields } = useFieldArray({ control, name: 'items' });

  const [submitting, setSubmitting] = useState(false);
  const [draftSaving, setDraftSaving] = useState(false);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const [releasedPOs, setReleasedPOs] = useState([]);
  const [initialData, setInitialData] = useState(null);
  const [loadingRecord, setLoadingRecord] = useState(isEdit);

  const [userGrnNo, setUserGrnNo] = useState(
    () => (isEdit ? grnNo : nextSeqNo(grnsStore.all, 'GRN', 'grnNo', 4200))
  );

  /* Load POs for the dropdown. Read through the service so API mode gets the
     backend's purchase orders — the local store is empty there, which left
     this dropdown permanently empty and made GRN creation impossible.
     Eligibility is the canonical released-PO set, which is exactly the set
     the goods-receipt endpoint accepts. */
  useEffect(() => {
    let cancelled = false;
    purchaseOrderService
      .getOrders({ page: 1, pageSize: 500 })
      .then((response) => {
        if (cancelled) return;
        const records = Array.isArray(response) ? response : (response?.data || []);
        setReleasedPOs(records.filter((order) => isPoReleased(order.status)));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  /* The GRN number must come from the database, never from the local store:
     in API mode the local store is empty, so the client-side guess repeats
     the same number and the backend rejects the next receipt as a duplicate. */
  useEffect(() => {
    if (isEdit) return undefined;
    let cancelled = false;
    logisticsService
      .getNextGrnNumber()
      .then((nextNumber) => { if (!cancelled && nextNumber) setUserGrnNo(nextNumber); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [isEdit]);

  /* Load record for edit mode */
  useEffect(() => {
    if (!grnNo) return;
    setLoadingRecord(true);
    logisticsService.getGrnById(grnNo).then((record) => {
      if (record) {
        setInitialData(record);
        reset(buildFormValues(record));
        setUserGrnNo(record.grnNo || grnNo);
      }
      setLoadingRecord(false);
    });
  }, [grnNo, reset]);

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

  /* Auto-fill items from PO */
  const watchedPoNo = watch('poNo');
  const selectedPO = releasedPOs.find((p) => p.poNo === watchedPoNo);
  useEffect(() => {
    if (!selectedPO || isEdit) return;
    const poItems = (selectedPO.items || []).map((item) => ({
      itemCode: item.itemCode || '',
      product: item.product || '',
      hsn: item.hsn || '',
      uom: item.uom || 'Nos',
      qty: String(item.qty || ''),
      received: '0',
    }));
    if (poItems.length > 0 && (!watchedValues?.items || watchedValues.items.length === 0)) {
      reset((prev) => ({ ...prev, items: poItems }));
    }
  }, [selectedPO, isEdit]); // eslint-disable-line react-hooks/exhaustive-deps

  const persist = async (values, { draft = false, stay = false } = {}) => {
    if (draft) setDraftSaving(true);
    else setSubmitting(true);
    try {
      if (isEdit) {
        const items = (values.items || []).map((item) => ({
          itemCode: item.itemCode || '',
          product: item.product,
          hsn: item.hsn || '',
          uom: item.uom || 'Nos',
          qty: Number(item.qty) || 0,
          received: Number(item.received) || 0,
        }));
        await logisticsService.updateGrn(grnNo, { items, shipmentNo: values.shipmentNo, warehouse: values.warehouse });
        toast.success(draft ? 'Draft saved' : 'GRN updated');
        if (!draft) clearDraft();
        if (!stay) navigate(`/purchase/logistics/grn/${grnNo}`);
      } else {
        if (!values.poNo) {
          toast.error('Select a released purchase order');
          setSubmitting(false);
          return;
        }
        const created = await logisticsService.createGrn(values.poNo, {
          grnNo: userGrnNo,
          shipmentNo: values.shipmentNo,
          warehouse: values.warehouse,
        });
        toast.success(draft ? 'Draft saved' : `GRN ${created.grnNo} created`);
        if (!draft) clearDraft();
        if (!stay) navigate(`/purchase/logistics/grn/${created.grnNo}`);
      }
      return true;
    } catch (err) {
      toast.error(err?.message || 'Failed to save GRN');
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
  const confirmCancel = () => { clearDraft(); navigate(isEdit ? `/purchase/logistics/grn/${grnNo}` : '/purchase/logistics/grn'); };
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
          {/* ============ GRN DETAILS ============ */}
          <Accordion
            title="Goods Receipt Details"
            subtitle="GRN number, purchase order and shipment reference"
            icon={PackageCheck}
          >
            <div className={GRID}>
              <FormField label="GRN Number">
                <TextInput
                  value={userGrnNo}
                  onChange={(e) => setUserGrnNo(e.target.value)}
                  className="font-semibold text-slate-700"
                  placeholder="Auto-generated"
                  ariaLabel="GRN Number"
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
              <FormField label="Shipment No (Optional)">
                <TextInput registration={register('shipmentNo')} placeholder="e.g. SHP-2026-021" ariaLabel="Shipment No" />
              </FormField>
              <FormField label="Warehouse">
                <TextInput registration={register('warehouse')} placeholder="e.g. Plant A Store, Pune" ariaLabel="Warehouse" />
              </FormField>
            </div>
          </Accordion>

          {/* ============ LINE ITEMS ============ */}
          {fields.length > 0 && (
            <Accordion
              title="Line Items"
              subtitle="Products and quantities received"
              icon={Package}
              action={<span className="pr-section-chip">{fields.length} item{fields.length === 1 ? '' : 's'}</span>}
            >
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-2 pr-4 font-semibold text-slate-600">Product</th>
                      <th className="text-right py-2 px-4 font-semibold text-slate-600">Ordered Qty</th>
                      <th className="text-right py-2 pl-4 font-semibold text-slate-600">Received Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fields.map((field, index) => (
                      <tr key={field.id} className="border-b border-slate-100">
                        <td className="py-2 pr-4">
                          <TextInput
                            registration={register(`items.${index}.product`)}
                            className="text-xs"
                            readOnly
                          />
                        </td>
                        <td className="py-2 px-4 text-right">
                          <TextInput
                            registration={register(`items.${index}.qty`)}
                            type="number"
                            className="text-xs text-right"
                            readOnly
                          />
                        </td>
                        <td className="py-2 pl-4">
                          <Controller control={control} name={`items.${index}.received`} render={({ field: f }) => (
                            <NumberInput
                              value={f.value || ''}
                              onChange={(e) => f.onChange(e.target.value)}
                              min={0}
                              className="text-xs text-right"
                            />
                          )} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Accordion>
          )}

          {/* ============ NOTES ============ */}
          <Accordion
            title="Notes"
            subtitle="Additional notes for this goods receipt"
            icon={StickyNote}
          >
            <div className="space-y-4">
              <FormField label="Notes" hint={`${(watchedValues?.notes || '').length} / 500`}>
                <TextArea
                  registration={register('notes')}
                  rows={4}
                  maxLength={500}
                  placeholder="Receiving notes, condition remarks..."
                />
              </FormField>
            </div>
          </Accordion>
        </div>

        <aside className="pr-form-side">
          <LogisticsFormSummary
            title="GRN Summary"
            icon={Package}
            docNo={userGrnNo}
            status={isEdit ? (initialData?.status || 'Expected') : 'Expected'}
            poNo={watchedValues?.poNo}
            sourceDoc={watchedValues?.shipmentNo}
            sourceLabel="Shipment No"
            vendor={selectedPO?.vendor || initialData?.vendor || ''}
            warehouse={watchedValues?.warehouse}
            items={watchedValues?.items || []}
            createdBy="Procurement Team"
            createdAt={initialData?.createdAt}
          />
        </aside>
      </div>

      <FormActions
        submitting={submitting}
        draftSaving={draftSaving}
        submitLabel={isEdit ? 'Update GRN' : 'Create GRN'}
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
