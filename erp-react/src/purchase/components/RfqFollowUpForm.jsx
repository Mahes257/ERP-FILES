/**
 * purchase/components/RfqFollowUpForm.jsx
 * ------------------------------------------------------------------
 * Shared Create / Edit form for the RFQ Follow-up module — the
 * full-page replacement for the old RfqFollowUpModal. It reuses the
 * Purchase Requisition Create/Edit design system (PurchasePageLayout,
 * purchase-form-card sections, FormField controls, FormActions
 * footer) with a single full-width column — no sidebar summary.
 *
 * The follow-up ALWAYS references an existing RFQ (selected from the
 * live RFQ store via rfqOptions) — it never creates or duplicates an
 * RFQ. Selecting an RFQ switches the vendor pool to that RFQ's vendors
 * (keeping the current vendor only when still valid, clearing it
 * otherwise) and inherits priority / due date / assignee as defaults
 * so the follow-up carries the real sourcing context. On edit the RFQ
 * reference is locked (the RFQ is never changed); only the follow-up's
 * own fields are editable.
 *
 * Business logic stays in rfqFollowUpService — this component only
 * collects the values and delegates create / update, and the RFQ
 * record itself is never modified.
 * ------------------------------------------------------------------
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { BellRing, CalendarClock, RotateCcw, StickyNote, X } from 'lucide-react';
import {
  Accordion, ConfirmDialog, DateInput, EditableMasterSelect, FormField, TextArea, TextInput, useToast
} from './ui';
import FormActions from './FormActions';
import { FOLLOWUP_TYPES, rfqFollowUpService } from '../services/rfqFollowUp';
import { rfqFollowUpSchema } from '../validation/requisition';
import { vendorService } from '../services/vendor';

const GRID = 'grid grid-cols-1 sm:grid-cols-2 gap-4';

/** Defaults shared by create and edit. */
function buildFormValues(record = {}) {
  return {
    rfqNo: record.rfqNo || '',
    vendor: record.vendor || '',
    type: record.type || FOLLOWUP_TYPES[0],
    priority: record.priority || 'Medium',
    followUpDate: record.followUpDate || '',
    followUpTime: record.followUpTime || '10:00',
    assignedTo: record.assignedTo || '',
    notes: record.notes || '',
    reminder: record.reminder ?? true
  };
}

export default function RfqFollowUpForm({ initialData, requestId, returnPath }) {
  const navigate = useNavigate();
  const toast = useToast();

  const [rfqOptions, setRfqOptions] = useState([]);
  const [users, setUsers] = useState([]);
  const [masterVendors, setMasterVendors] = useState([]);
  const [vendorsLoading, setVendorsLoading] = useState(true);
  const [vendorsError, setVendorsError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);

  const form = useForm({
    resolver: zodResolver(rfqFollowUpSchema),
    defaultValues: buildFormValues(initialData),
    mode: 'onTouched'
  });

  const { register, handleSubmit, reset, control, setValue, clearErrors, formState } = form;
  const { errors, isDirty } = formState;
  const values = useWatch({ control });

  /* Options for the RFQ / vendor / assignee selectors (live RFQ store
     + project user master + vendor master). */
  useEffect(() => {
    let cancelled = false;
    Promise.all([rfqFollowUpService.getRfqOptions(), rfqFollowUpService.getUsers()])
      .then(([rfqs, usersList]) => {
        if (cancelled) return;
        setRfqOptions(rfqs || []);
        setUsers(usersList || []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  /* Load RFQ-eligible vendors from the vendor master so the dropdown
     always has the approved vendor pool, even before an RFQ is picked. */
  useEffect(() => {
    let cancelled = false;
    setVendorsLoading(true);
    setVendorsError(false);
    vendorService
      .getRfqEligibleVendors()
      .then((vendors) => {
        if (cancelled) return;
        /* Store as name strings — consistent with the RFQ vendors array. */
        setMasterVendors((vendors || []).map((v) => v.name).filter(Boolean));
      })
      .catch(() => {
        if (!cancelled) setVendorsError(true);
      })
      .finally(() => {
        if (!cancelled) setVendorsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedRfq = rfqOptions.find((option) => option.rfqNo === values.rfqNo);

  /* Vendor → RFQ lookup: RFQs link vendors by name (backend
     purchase_rfqs.vendor_names_json → API `vendors`), so once a vendor
     is selected the RFQ Number dropdown narrows to that vendor's RFQs.
     With no vendor chosen every existing RFQ is offered; a selected
     vendor with no RFQs shows the dropdown's built-in empty state
     instead of silently hiding the mismatch. On edit the RFQ is locked
     and its option must stay visible even if it does not match. */
  const vendorFilteredRfqs = useMemo(() => {
    const vendor = String(values.vendor || '').trim().toLowerCase();
    if (!vendor) return rfqOptions;
    const matches = rfqOptions.filter((option) =>
      (option.vendors || []).some((name) => String(name || '').trim().toLowerCase() === vendor)
    );
    return matches.length > 0 ? matches : [];
  }, [rfqOptions, values.vendor]);

  /* RFQ options → { value, label } for the searchable select. */
  const rfqSelectOptions = useMemo(
    () => vendorFilteredRfqs.map((option) => ({ value: option.rfqNo, label: `${option.rfqNo} — ${option.title}` })),
    [vendorFilteredRfqs]
  );

  /* Vendor options = vendor master (approved/active) + selected RFQ's
     invited vendors + the record's current vendor (so an existing
     follow-up never loses its value on edit). The vendor master is
     the primary source; RFQ-linked vendors are merged in so they
     always appear even if the master mapping is incomplete. */
  const vendorOptions = useMemo(() => {
    const pool = [
      ...masterVendors,
      ...(selectedRfq?.vendors || []),
      values.vendor
    ].filter(Boolean);
    return Array.from(new Set(pool)).map((vendor) => ({ value: vendor, label: vendor }));
  }, [masterVendors, selectedRfq, values.vendor]);

  const userOptions = useMemo(() => users.map((user) => ({ value: user, label: user })), [users]);

  /* Picking an RFQ switches the vendor pool to that RFQ's vendors. The
     currently selected vendor is KEPT only when it is still valid for
     the new RFQ — otherwise it is CLEARED (never auto-picked), leaving
     the user to choose from the updated list. Priority, due date and
     buyer are inherited as defaults so the follow-up carries the real
     sourcing context; every field stays editable afterwards and the
     RFQ record itself is never modified. */
  const handleRfqChange = (rfqNo, onChange) => {
    const rfq = rfqOptions.find((option) => option.rfqNo === rfqNo);
    const current = form.getValues();
    onChange(rfqNo);
    clearErrors(['rfqNo', 'vendor']);
    /* Keep the current vendor when it is valid for the new RFQ (either
       as an RFQ-invited vendor or present in the vendor master) —
       otherwise clear it so the user picks from the updated pool. */
    const rfqVendors = rfq?.vendors || [];
    const vendorPool = new Set([...rfqVendors, ...masterVendors]);
    const nextVendor = vendorPool.has(current.vendor) ? current.vendor : '';
    setValue('vendor', nextVendor, { shouldValidate: true });
    setValue('priority', rfq?.priority || current.priority || 'Medium');
    setValue('followUpDate', rfq?.dueDate || current.followUpDate || '', { shouldValidate: true });
    setValue('assignedTo', rfq?.buyer || current.assignedTo || '', { shouldValidate: true });
  };

  /** Persists via the service — the RFQ record is never touched. */
  const persist = async (payload) => {
    setSubmitting(true);
    try {
      if (requestId) {
        await rfqFollowUpService.updateFollowUp(requestId, payload);
        toast.success(`${initialData?.followUpNo || 'Follow-up'} updated`);
        navigate(returnPath || '/purchase/rfq/follow-ups');
      } else {
        await rfqFollowUpService.createFollowUp(payload);
        toast.success(`Follow-up created for ${payload.rfqNo}`);
        navigate('/purchase/rfq/follow-ups');
      }
    } catch (err) {
      toast.error(err?.message || (requestId ? 'Failed to update follow-up' : 'Failed to create follow-up'));
    } finally {
      setSubmitting(false);
    }
  };

  /* The follow-up number is assigned by the server when left blank
     (POST /rfq-follow-ups → FU-YYYY-NNNN). It used to be generated here from
     the LOCAL follow-up store, which is empty in API mode, so every create
     asked for "FU-<year>-0001" and the backend rejected it with 400
     "Follow-up number already exists". An explicitly typed number is still
     sent as-is and duplicates are reported by the server. */
  const onSubmitSave = (data) => {
    const followUpNo = userFollowUpNo.trim();
    persist(followUpNo ? { ...data, followUpNo } : { ...data });
  };

  const handleReset = () => setConfirmResetOpen(true);

  const confirmReset = () => {
    setConfirmResetOpen(false);
    reset(buildFormValues(initialData));
    clearErrors();
  };

  /** Cancel — leaves immediately unless there are unsaved changes. */
  const handleCancel = () => {
    if (isDirty) setConfirmCancelOpen(true);
    else navigate('/purchase/rfq/follow-ups');
  };

  const confirmCancel = () => navigate('/purchase/rfq/follow-ups');

  /** Auto-generated by the server on create (blank field); loaded from the saved
   *  record on edit. Editable by the user. */
  const [userFollowUpNo, setUserFollowUpNo] = useState(() =>
    requestId ? initialData?.followUpNo || '' : ''
  );

  const editing = Boolean(requestId);

  return (
    <>
      <form onSubmit={handleSubmit(onSubmitSave)}>
        <div className="pr-form-main">
          {/* ============ 1 · FOLLOW-UP DETAILS ============ */}
          <Accordion
            title="Follow-up Details"
            subtitle="RFQ reference, vendor, schedule and ownership"
            icon={BellRing}
          >
            <div className={GRID}>
              <FormField label="Follow-up Number">
                <TextInput
                  value={userFollowUpNo}
                  onChange={(e) => setUserFollowUpNo(e.target.value)}
                  className="font-semibold text-slate-700"
                  placeholder="Auto-generated"
                  aria-label="Follow-up Number"
                />
              </FormField>

              <FormField label="RFQ Number" required error={errors.rfqNo?.message}>
                <Controller
                  control={control}
                  name="rfqNo"
                  render={({ field }) => (
                    <EditableMasterSelect
                      id="fu-rfq"
                      value={field.value || ''}
                      onChange={(value) => handleRfqChange(value, field.onChange)}
                      options={rfqSelectOptions}
                      placeholder={rfqSelectOptions.length === 0 && values.vendor ? 'No RFQs for this vendor' : 'Select RFQ...'}
                      disabled={editing}
                      error={!!errors.rfqNo}
                      editable={false}
                      ariaLabel="RFQ Number"
                    />
                  )}
                />
              </FormField>

              <FormField label="Vendor" required error={errors.vendor?.message}>
                <Controller
                  control={control}
                  name="vendor"
                  render={({ field }) => {
                    if (vendorsLoading) {
                      return (
                        <input
                          type="text"
                          value="Loading vendors..."
                          disabled
                          className="purchase-form-input opacity-60 cursor-wait"
                          aria-label="Vendor — loading"
                        />
                      );
                    }
                    if (vendorsError) {
                      return (
                        <input
                          type="text"
                          value="Failed to load vendors"
                          disabled
                          className="purchase-form-input border-rose-300 text-rose-500"
                          aria-label="Vendor — error"
                        />
                      );
                    }
                    return (
                      <EditableMasterSelect
                        id="fu-vendor"
                        value={field.value || ''}
                        onChange={field.onChange}
                        options={vendorOptions}
                        placeholder={vendorOptions.length === 0 ? 'No eligible vendors found' : 'Select Vendor...'}
                        disabled={vendorOptions.length === 0}
                        error={!!errors.vendor}
                        editable={false}
                        ariaLabel="Vendor"
                      />
                    );
                  }}
                />
              </FormField>

              <FormField label="Follow-up Type" required error={errors.type?.message}>
                <Controller
                  control={control}
                  name="type"
                  render={({ field }) => (
                    <EditableMasterSelect
                      id="fu-type"
                      value={field.value || ''}
                      onChange={field.onChange}
                      options={FOLLOWUP_TYPES.map((type) => ({ value: type, label: type }))}
                      placeholder="Select Follow-up Type..."
                      error={!!errors.type}
                      editable={false}
                      ariaLabel="Follow-up Type"
                    />
                  )}
                />
              </FormField>

              <FormField label="Priority">
                <Controller
                  control={control}
                  name="priority"
                  render={({ field }) => (
                    <EditableMasterSelect
                      id="fu-priority"
                      masterKey="priorities"
                      value={field.value || ''}
                      onChange={field.onChange}
                      placeholder="Select priority"
                      ariaLabel="Priority"
                    />
                  )}
                />
              </FormField>

              <FormField label="Follow-up Date" required error={errors.followUpDate?.message}>
                <DateInput registration={register('followUpDate')} id="fu-date" error={!!errors.followUpDate} />
              </FormField>

              <FormField label="Follow-up Time">
                <input
                  id="fu-time"
                  type="time"
                  className={`purchase-form-input ${errors.followUpTime ? 'input-error' : ''}`}
                  {...register('followUpTime')}
                />
              </FormField>

              <FormField label="Assigned To" required error={errors.assignedTo?.message}>
                <Controller
                  control={control}
                  name="assignedTo"
                  render={({ field }) => (
                    <EditableMasterSelect
                      id="fu-assigned"
                      value={field.value || ''}
                      onChange={field.onChange}
                      options={userOptions}
                      placeholder="Select User..."
                      error={!!errors.assignedTo}
                      editable={false}
                      ariaLabel="Assigned To"
                    />
                  )}
                />
              </FormField>

              <div className="flex items-end">
                <label className="flex items-center gap-2 cursor-pointer select-none pt-1" htmlFor="fu-reminder">
                  <input
                    id="fu-reminder"
                    type="checkbox"
                    className="w-4 h-4 accent-[#0B4A3D]"
                    checked={Boolean(values.reminder)}
                    onChange={(e) => setValue('reminder', e.target.checked, { shouldDirty: true })}
                  />
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                    <CalendarClock className="w-3.5 h-3.5 text-slate-400" /> Send reminder
                  </span>
                </label>
              </div>
            </div>

            {selectedRfq && (
              <p className="text-[11px] text-slate-400 font-medium mt-3">
                Referencing {selectedRfq.rfqNo} — {selectedRfq.title} ({selectedRfq.requester || 'no requester'}). The RFQ itself is not modified.
              </p>
            )}
          </Accordion>

          {/* ============ 2 · NOTES ============ */}
          <Accordion
            title="Notes"
            subtitle="What needs to happen on this follow-up"
            icon={StickyNote}
          >
            <TextArea
              registration={register('notes')}
              rows={4}
              placeholder="What needs to happen on this follow-up?"
            />
            <p className="purchase-form-hint mt-2">
              Context for the assigned user — what to chase, ask or confirm.
            </p>
          </Accordion>
        </div>

        <FormActions
          submitting={submitting}
          submitLabel={editing ? 'Update Follow-up' : 'Create Follow-up'}
          onCancel={handleCancel}
          onReset={handleReset}
        />
      </form>

      {/* Reset / Cancel confirmation dialogs */}
      <ConfirmDialog
        open={confirmResetOpen}
        title="Reset follow-up form?"
        message="This will clear every field you have entered on this form. Data already saved on the server is not affected."
        confirmLabel="Reset Form"
        variant="warning"
        icon={RotateCcw}
        onConfirm={confirmReset}
        onCancel={() => setConfirmResetOpen(false)}
      />
      <ConfirmDialog
        open={confirmCancelOpen}
        title="Discard unsaved changes?"
        message="You have unsaved changes in this follow-up. Leaving now will discard them."
        confirmLabel="Leave Page"
        variant="default"
        icon={X}
        onConfirm={confirmCancel}
        onCancel={() => setConfirmCancelOpen(false)}
      />
    </>
  );
}
