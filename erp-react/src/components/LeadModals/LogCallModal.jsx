import { useState } from 'react';
import { Phone, Loader2 } from 'lucide-react';
import { Modal, FormField, TextInput, TextArea, ManagedSelect, useToast } from '../Common';
import {
  CALL_MODE,
  leadContactName,
  leadDisplayName,
  logLeadCommunication
} from '../../utils/leadCommunication';

const todayISO = () => new Date().toISOString().slice(0, 10);

// Read-only fields show the values coming from the selected Lead row itself.
const READONLY_CLS = 'bg-slate-100 text-slate-500 cursor-not-allowed';

const GRID = 'grid grid-cols-1 sm:grid-cols-2 gap-4';

/**
 * Log Call — inline dialog for Leads → Actions → Log Call.
 *
 * Opens over the Leads page (no navigation to /followups) and persists the call
 * through the existing follow-up API as a `mode: 'Call'` entry linked to the
 * selected Lead's real primary key.
 */
export default function LogCallModal({ open, lead, onClose, onSaved }) {
  const toast = useToast();
  // The page mounts this dialog with a fresh `key` on every open (the ERP
  // pattern used by the other lead dialogs), so a new call entry always starts
  // clean — nothing from an abandoned or previously logged call is carried over.
  const [callDate, setCallDate] = useState(todayISO());
  const [callTime, setCallTime] = useState('');
  const [callType, setCallType] = useState(CALL_MODE);
  const [outcome, setOutcome] = useState('');
  const [callStatus, setCallStatus] = useState('');
  const [duration, setDuration] = useState('');
  const [notes, setNotes] = useState('');
  const [nextDate, setNextDate] = useState('');
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const handleSave = async () => {
    if (submitting) return;

    const next = {};
    if (!callDate) next.callDate = 'Call date is required';
    if (!callType) next.callType = 'Call type is required';
    if (!notes.trim()) next.notes = 'Call notes are required';
    if (callTime && !/^\d{1,2}:\d{2}/.test(callTime)) next.callTime = 'Enter a valid call time';
    if (duration && Number(duration) <= 0) next.duration = 'Duration must be greater than 0';
    if (nextDate && callDate && nextDate < callDate) {
      next.nextDate = 'Next follow-up cannot be before the call date';
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSubmitting(true);
    try {
      // The `followups` table has no duration column, so the duration is stored
      // as a labelled line inside the call notes — all entered data stays visible
      // in the existing Follow-ups module without a schema change.
      const summary = [
        duration.trim() ? `Call duration: ${duration.trim()} min` : '',
        notes.trim()
      ]
        .filter(Boolean)
        .join('\n');

      await logLeadCommunication(lead, {
        mode: callType,
        followupDate: callDate,
        time: callTime,
        currentStatus: callStatus,
        outcome,
        discussionSummary: summary,
        nextFollowupDate: nextDate
      });

      toast.success(`Call logged for ${leadDisplayName(lead)}`);
      onSaved?.(lead);
      onClose?.();
    } catch (err) {
      toast.error(err?.message || 'Failed to log the call');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Log Call"
      maxWidth="max-w-2xl"
      footer={
        <>
          <button
            onClick={onClose}
            className="text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 px-4 py-2 rounded-lg transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={submitting}
            className="flex items-center gap-1.5 text-xs font-bold text-white bg-[#0B4A3D] hover:bg-[#083D34] disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 rounded-lg transition-colors cursor-pointer"
          >
            {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Phone className="w-3.5 h-3.5" />}
            {submitting ? 'Saving...' : 'Log Call'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-sky-50 flex items-center justify-center text-sky-600 font-bold text-sm">
            {(leadContactName(lead) || leadDisplayName(lead)).slice(0, 1).toUpperCase() || '?'}
          </div>
          <div>
            <div className="text-sm font-bold text-slate-900">{leadDisplayName(lead)}</div>
            <div className="text-[11px] text-slate-400 font-medium">{leadContactName(lead)}</div>
          </div>
        </div>

        <div className={GRID}>
          <FormField label="Lead">
            <TextInput value={leadDisplayName(lead)} readOnly className={READONLY_CLS} />
          </FormField>
          <FormField label="Contact Person">
            <TextInput value={leadContactName(lead)} readOnly className={READONLY_CLS} />
          </FormField>
          <FormField label="Phone Number">
            <TextInput value={lead?.phone || ''} readOnly className={READONLY_CLS} />
          </FormField>
          <FormField label="Call Type" required error={errors.callType}>
            <ManagedSelect
              categoryKey="fu_mode"
              label="Call Type"
              value={callType}
              onChange={setCallType}
              placeholder="Select Call Type"
              error={!!errors.callType}
            />
          </FormField>
          <FormField label="Call Date" required error={errors.callDate}>
            <TextInput
              type="date"
              value={callDate}
              onChange={(e) => setCallDate(e.target.value)}
              error={!!errors.callDate}
            />
          </FormField>
          <FormField label="Call Time" error={errors.callTime}>
            <TextInput
              type="time"
              value={callTime}
              onChange={(e) => setCallTime(e.target.value)}
              error={!!errors.callTime}
            />
          </FormField>
          <FormField label="Call Outcome" error={errors.outcome}>
            <ManagedSelect
              categoryKey="fu_outcome"
              label="Call Outcome"
              value={outcome}
              onChange={setOutcome}
              placeholder="-- Select Outcome --"
            />
          </FormField>
          <FormField label="Call Status">
            <ManagedSelect
              categoryKey="fu_status"
              label="Call Status"
              value={callStatus}
              onChange={setCallStatus}
              placeholder="Select Status"
            />
          </FormField>
          <FormField
            label="Call Duration (minutes)"
            error={errors.duration}
            hint="Stored in the call notes — the follow-up record has no duration column."
          >
            <TextInput
              type="number"
              min="1"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              placeholder="e.g. 15"
              error={!!errors.duration}
            />
          </FormField>
          <FormField label="Next Follow-up Date" error={errors.nextDate}>
            <TextInput
              type="date"
              value={nextDate}
              onChange={(e) => setNextDate(e.target.value)}
              error={!!errors.nextDate}
            />
          </FormField>
        </div>

        <FormField label="Notes / Remarks" required error={errors.notes}>
          <TextArea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            error={!!errors.notes}
            placeholder="What was discussed during the call?"
          />
        </FormField>

        <div className="text-[11px] text-slate-400 font-medium">
          Saved as a Call entry on this lead through the existing Follow-ups workflow.
        </div>
      </div>
    </Modal>
  );
}
