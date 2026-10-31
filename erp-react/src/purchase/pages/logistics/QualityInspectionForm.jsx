/**
 * purchase/pages/logistics/QualityInspectionForm.jsx
 * ------------------------------------------------------------------
 * Create form for Quality Inspection records.
 * Standardized layout: accordion sections (closed by default),
 * right-side summary, sticky action bar, draft persistence.
 * ------------------------------------------------------------------
 */
import { useEffect, useRef, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ClipboardCheck, StickyNote } from 'lucide-react';
import {
  Accordion, ConfirmDialog, FormField, SelectInput, TextArea, TextInput, useToast
} from '../../components/ui';
import PurchaseHeader from '../../components/PurchaseHeader';
import PurchasePageLayout from '../../components/list/PurchasePageLayout';
import '../../styles/cpr-list.css';
import FormActions from '../../components/FormActions';
import { logisticsService } from '../../services/logistics';
import { nextSeqNo } from '../../utils/purchase';
import useFormDraft from '../../hooks/useFormDraft';

const GRID = 'grid grid-cols-1 sm:grid-cols-2 gap-4';

function buildFormValues(record = {}) {
  return {
    grnNo: record.grnNo || '',
    inspector: record.inspector || '',
    notes: record.notes || '',
  };
}

export default function QualityInspectionForm() {
  const navigate = useNavigate();
  const toast = useToast();

  const { loadDraft, saveDraft: persistDraft, saveDraftNow, clearDraft } = useFormDraft({
    draftKey: 'purchase.inspection',
    recordId: null,
  });

  const form = useForm({ defaultValues: buildFormValues(), mode: 'onTouched' });
  const { register, handleSubmit, reset, control, formState: { errors } } = form;
  const watchedValues = useWatch({ control });

  const [submitting, setSubmitting] = useState(false);
  const [draftSaving, setDraftSaving] = useState(false);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  /* Received GRNs for the dropdown. Loaded through the service so API mode
     gets the backend's GRNs — the local store is empty there, which left
     this dropdown permanently empty and made inspection creation impossible. */
  const [receivedGrns, setReceivedGrns] = useState([]);
  const [userInspectionNo] = useState(() =>
    nextSeqNo([], 'QC', 'inspectionNo', 4200)
  );
  useEffect(() => {
    let cancelled = false;
    logisticsService
      .getGrns({ page: 1, pageSize: 500 })
      .then((response) => {
        if (cancelled) return;
        const records = Array.isArray(response) ? response : (response?.data || []);
        setReceivedGrns(records.filter((g) => g.status === 'Received' || g.status === 'Pending Inspection'));
      })
      .catch(() => { if (!cancelled) setReceivedGrns([]); });
    return () => { cancelled = true; };
  }, []);

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

  /* Persist draft on explicit save */
  const handleSaveDraft = () => {
    setDraftSaving(true);
    saveDraftNow(form.getValues());
    setTimeout(() => setDraftSaving(false), 400);
    toast.success('Draft saved');
  };

  const onSubmit = async (values) => {
    setSubmitting(true);
    try {
      /* Seed the inspection lines from the selected GRN's received quantities —
         the same shape the automatic per-GRN inspection uses. Without them the
         inspection is created with no lines, so the detail screen can never
         record inspected/accepted/rejected quantities and nothing can be
         posted to inventory from the result. */
      const selectedGrn = receivedGrns.find((g) => g.grnNo === values.grnNo);
      const items = (selectedGrn?.items || []).map((item) => ({
        product: item.product || '',
        receivedQty: Number(item.received) || Number(item.qty) || 0,
        inspectedQty: 0,
        acceptedQty: 0,
        rejectedQty: 0,
      }));
      const inspection = await logisticsService.createInspection({
        grnNo: values.grnNo,
        inspector: values.inspector,
        notes: values.notes,
        ...(items.length > 0 ? { items } : {}),
      });
      clearDraft();
      toast.success(`Inspection ${inspection.inspectionNo} created`);
      navigate(`/purchase/logistics/quality/${inspection.inspectionNo}`);
    } catch (err) {
      toast.error(err?.message || 'Failed to create inspection');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    reset(buildFormValues());
    setConfirmResetOpen(false);
    toast.info('Form reset');
  };

  const handleCancel = () => {
    if (form.formState.isDirty) {
      setConfirmCancelOpen(true);
    } else {
      navigate('/purchase/logistics/quality');
    }
  };

  return (
    <PurchasePageLayout className="purchase-page--form">
      <PurchaseHeader
        variant="cpr"
        crumb={[
          { label: 'Logistics', to: '/purchase/logistics' },
          { label: 'Quality Inspection', to: '/purchase/logistics/quality' },
          { label: 'New Inspection' }
        ]}
        icon={ClipboardCheck}
        title="New Quality Inspection"
        subtitle="Create a new inspection record against a received GRN"
        actions={
          <button type="button" onClick={() => navigate('/purchase/logistics/quality')} className="po-btn po-btn-secondary">
            <ChevronLeft className="po-btn-icon-ic" /> Back
          </button>
        }
      />

      {/* Inspection number badge */}
      <div className="mb-4">
        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
          Inspection No
        </div>
        <div className="text-sm font-extrabold text-slate-800 mt-0.5">
          {userInspectionNo}
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        {/* GRN Reference */}
        <Accordion title="Inspection Details" icon={ClipboardCheck} defaultOpen>
          <div className={GRID}>
            <FormField label="GRN Reference" error={errors.grnNo?.message}>
              <Controller
                name="grnNo"
                control={control}
                rules={{ required: 'GRN reference is required' }}
                render={({ field }) => (
                  <SelectInput
                    value={field.value || ''}
                    onChange={(e) => field.onChange(e.target.value)}
                    ariaLabel="GRN Reference"
                  >
                    <option value="">Select GRN...</option>
                    {receivedGrns.map((g) => (
                      <option key={g.grnNo} value={g.grnNo}>
                        {g.grnNo} — {g.vendor || 'Unknown'} ({g.items?.length || 0} items)
                      </option>
                    ))}
                  </SelectInput>
                )}
              />
            </FormField>
            <FormField label="Inspector" error={errors.inspector?.message}>
              <TextInput
                {...register('inspector')}
                placeholder="e.g. Meera Joshi"
              />
            </FormField>
          </div>
        </Accordion>

        {/* Notes */}
        <Accordion title="Notes & Remarks" icon={StickyNote}>
          <FormField label="Inspection Notes">
            <TextArea
              {...register('notes')}
              rows={3}
              placeholder="Optional notes about this inspection..."
            />
          </FormField>
        </Accordion>

        {/* Actions */}
        <FormActions
          submitting={submitting}
          draftSaving={draftSaving}
          onSaveDraft={handleSaveDraft}
          onSubmit={form.handleSubmit(onSubmit)}
          onReset={() => setConfirmResetOpen(true)}
          onCancel={handleCancel}
          submitLabel="Create Inspection"
        />
      </form>

      {/* Confirm dialogs */}
      <ConfirmDialog
        open={confirmResetOpen}
        title="Reset form?"
        message="All entered data will be lost."
        confirmLabel="Reset"
        variant="danger"
        onConfirm={handleReset}
        onCancel={() => setConfirmResetOpen(false)}
      />
      <ConfirmDialog
        open={confirmCancelOpen}
        title="Discard changes?"
        message="You have unsaved changes. Are you sure you want to leave?"
        confirmLabel="Discard"
        variant="danger"
        onConfirm={() => {
          setConfirmCancelOpen(false);
          navigate('/purchase/logistics/quality');
        }}
        onCancel={() => setConfirmCancelOpen(false)}
      />
    </PurchasePageLayout>
  );
}
