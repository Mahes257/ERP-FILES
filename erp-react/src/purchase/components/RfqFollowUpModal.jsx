/**
 * purchase/components/RfqFollowUpModal.jsx
 * ------------------------------------------------------------------
 * Create / edit modal for an RFQ follow-up. The follow-up ALWAYS
 * references an existing RFQ (selected from the live RFQ store via
 * rfqOptions) — it never creates or duplicates an RFQ. Selecting an
 * RFQ auto-fills vendor / priority / due date / assignee from that
 * RFQ so the reminder inherits the real sourcing context.
 * ------------------------------------------------------------------
 */
import { useEffect, useState } from 'react';
import { BellRing, CalendarClock, Loader2, Save } from 'lucide-react';
import { FOLLOWUP_TYPES } from '../services/rfqFollowUp';
import { PRIORITIES } from '../constants';
import Modal from './ui/Modal';

const FIELD_LABEL = 'block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1';
const FIELD_INPUT =
  'w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 outline-none focus:border-[#0B4A3D] focus:bg-white transition-colors';
const EMPTY_FORM = {
  rfqNo: '',
  vendor: '',
  type: FOLLOWUP_TYPES[0],
  followUpDate: '',
  followUpTime: '10:00',
  priority: 'Medium',
  assignedTo: '',
  notes: '',
  reminder: true
};

export default function RfqFollowUpModal({
  open,
  onClose,
  initial = null,
  rfqOptions = [],
  users = [],
  onCreate,
  onUpdate,
  loading = false
}) {
  const editing = Boolean(initial);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState(null);

  /* Reset the form every time the modal opens (create = blank,
     edit = prefilled with the record's own values). */
  useEffect(() => {
    if (!open) return undefined;
    if (initial) {
      queueMicrotask(() =>
        setForm({
          rfqNo: initial.rfqNo,
          vendor: initial.vendor || '',
          type: initial.type || FOLLOWUP_TYPES[0],
          followUpDate: initial.followUpDate || '',
          followUpTime: initial.followUpTime || '10:00',
          priority: initial.priority || 'Medium',
          assignedTo: initial.assignedTo || '',
          notes: initial.notes || '',
          reminder: initial.reminder ?? true
        })
      );
    } else {
      queueMicrotask(() => setForm(EMPTY_FORM));
    }
    queueMicrotask(() => setError(null));
    return undefined;
  }, [open, initial]);

  const selectedRfq = rfqOptions.find((option) => option.rfqNo === form.rfqNo);

  /* Picking an RFQ inherits its vendor list, priority, due date and
     buyer so the follow-up carries the real sourcing context. */
  const handleRfqChange = (rfqNo) => {
    const rfq = rfqOptions.find((option) => option.rfqNo === rfqNo);
    setForm((prev) => ({
      ...prev,
      rfqNo,
      vendor: rfq?.vendors?.[0] || prev.vendor,
      priority: rfq?.priority || prev.priority,
      followUpDate: rfq?.dueDate || prev.followUpDate,
      assignedTo: rfq?.buyer || prev.assignedTo
    }));
  };

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleSave = () => {
    if (!form.rfqNo) {
      setError('Select the RFQ this follow-up is for.');
      return;
    }
    if (!form.vendor) {
      setError('Vendor is required.');
      return;
    }
    if (!form.followUpDate) {
      setError('Follow-up date is required.');
      return;
    }
    if (!form.assignedTo) {
      setError('Assigned To is required.');
      return;
    }
    setError(null);
    if (editing) onUpdate({ ...form });
    else onCreate({ ...form });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? `Edit ${initial?.followUpNo || 'Follow-up'}` : 'New RFQ Follow-up'}
      maxWidth="max-w-2xl"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs font-bold text-slate-600 bg-surface border border-slate-200 px-4 py-2 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs font-bold text-white px-4 py-2 rounded-lg transition-all cursor-pointer disabled:opacity-50 bg-gradient-to-r from-[#0F5C4C] to-[#0B4A3D] hover:from-[#136754] hover:to-[#0F5C4C] shadow-sm"
          >
            {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {editing ? <Save className="w-3.5 h-3.5" /> : <BellRing className="w-3.5 h-3.5" />}
            {editing ? 'Save Changes' : 'Create Follow-up'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600" role="alert">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={FIELD_LABEL} htmlFor="fu-rfq">RFQ Number *</label>
            <select
              id="fu-rfq"
              className={FIELD_INPUT}
              value={form.rfqNo}
              disabled={editing}
              onChange={(e) => handleRfqChange(e.target.value)}
            >
              <option value="">Select RFQ…</option>
              {rfqOptions.map((option) => (
                <option key={option.rfqNo} value={option.rfqNo}>
                  {option.rfqNo} — {option.title}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={FIELD_LABEL} htmlFor="fu-vendor">Vendor *</label>
            <select
              id="fu-vendor"
              className={FIELD_INPUT}
              value={form.vendor}
              onChange={(e) => set('vendor', e.target.value)}
            >
              <option value="">Select Vendor…</option>
              {/* RFQ vendors + the record's current vendor (so an existing
                 follow-up never loses its selected value while editing). */}
              {Array.from(new Set([...(selectedRfq?.vendors || []), form.vendor].filter(Boolean))).map((vendor) => (
                <option key={vendor} value={vendor}>{vendor}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={FIELD_LABEL} htmlFor="fu-type">Follow-up Type *</label>
            <select
              id="fu-type"
              className={FIELD_INPUT}
              value={form.type}
              onChange={(e) => set('type', e.target.value)}
            >
              {FOLLOWUP_TYPES.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={FIELD_LABEL} htmlFor="fu-priority">Priority</label>
            <select
              id="fu-priority"
              className={FIELD_INPUT}
              value={form.priority}
              onChange={(e) => set('priority', e.target.value)}
            >
              {PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>{priority}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={FIELD_LABEL} htmlFor="fu-date">Follow-up Date *</label>
            <input
              id="fu-date"
              type="date"
              className={FIELD_INPUT}
              value={form.followUpDate}
              onChange={(e) => set('followUpDate', e.target.value)}
            />
          </div>

          <div>
            <label className={FIELD_LABEL} htmlFor="fu-time">Follow-up Time</label>
            <input
              id="fu-time"
              type="time"
              className={FIELD_INPUT}
              value={form.followUpTime}
              onChange={(e) => set('followUpTime', e.target.value)}
            />
          </div>

          <div>
            <label className={FIELD_LABEL} htmlFor="fu-assigned">Assigned To *</label>
            <select
              id="fu-assigned"
              className={FIELD_INPUT}
              value={form.assignedTo}
              onChange={(e) => set('assignedTo', e.target.value)}
            >
              <option value="">Select User…</option>
              {users.map((user) => (
                <option key={user} value={user}>{user}</option>
              ))}
            </select>
          </div>

          <div className="flex items-end">
            <label className="flex items-center gap-2 cursor-pointer select-none pb-2">
              <input
                type="checkbox"
                className="w-4 h-4 accent-[#0B4A3D]"
                checked={form.reminder}
                onChange={(e) => set('reminder', e.target.checked)}
              />
              <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                <CalendarClock className="w-3.5 h-3.5 text-slate-400" /> Send reminder
              </span>
            </label>
          </div>
        </div>

        <div>
          <label className={FIELD_LABEL} htmlFor="fu-notes">Notes</label>
          <textarea
            id="fu-notes"
            rows={3}
            className={`${FIELD_INPUT} resize-none`}
            placeholder="What needs to happen on this follow-up?"
            value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
          />
        </div>

        {selectedRfq && (
          <p className="text-[11px] text-slate-400 font-medium">
            Referencing {selectedRfq.rfqNo} — {selectedRfq.title} ({selectedRfq.requester || 'no requester'}). The RFQ itself is not modified.
          </p>
        )}
      </div>
    </Modal>
  );
}
