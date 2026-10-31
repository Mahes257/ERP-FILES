import { useMemo, useState } from 'react';
import { AlertCircle, Trash2 } from 'lucide-react';
import { FormField, Modal, useToast } from '../../components/Common';
import { ERP_CATEGORIES } from './calendarEvents';
import { DESCRIPTION_MAX_LENGTH, TITLE_MAX_LENGTH, validateEvent } from './calendarUtils';

/**
 * Add / Edit Event form.
 *
 * Validation is the shared `validateEvent` rule set (the same one the helper
 * tests cover), so the form cannot drift from the rules the data is stored
 * under. Errors are shown per field AND summarised at the top, because a
 * four-field dialog can otherwise hide the offending input behind a scroll.
 *
 * The dialog is presentation + validation only: the page owns the event list and
 * reports back through `onSave` / `onDelete`. The page also mounts it per event
 * (React `key`), so the form always starts from the event it was opened for
 * without an effect syncing props into state.
 */
export default function EventModal({ open, draft, mode = 'create', onClose, onSave, onDelete }) {
  const toast = useToast();
  const [form, setForm] = useState(draft);
  const [submitted, setSubmitted] = useState(false);

  const { valid, errors } = useMemo(() => validateEvent(form), [form]);
  const showErrors = submitted && !valid;

  const update = (key) => (event) => {
    const value = event?.target ? event.target.value : event;
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const submit = () => {
    setSubmitted(true);
    // Re-validate the CURRENT values rather than the memo, so a click that lands
    // in the same tick as the last keystroke is judged on what is on screen.
    if (!validateEvent(form).valid) {
      toast.error('Please correct the highlighted fields before saving.');
      return;
    }
    onSave(form);
  };

  const isEdit = mode === 'edit';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit Event' : 'Add Event'}
      maxWidth="max-w-lg"
      footer={
        <div className="cal-modal-footer">
          <div>
            {isEdit && (
              <button type="button" className="cal-btn cal-danger-btn" onClick={() => onDelete(form.id)}>
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </button>
            )}
          </div>
          <div className="cal-modal-footer-right">
            <button type="button" className="cal-btn" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="cal-btn cal-btn-primary" onClick={submit}>
              {isEdit ? 'Save changes' : 'Add event'}
            </button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-3.5">
        {showErrors && (
          <div className="cal-form-error">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {Object.keys(errors).length === 1
              ? 'One field still needs attention.'
              : `${Object.keys(errors).length} fields still need attention.`}
          </div>
        )}

        <FormField label="Event title" required error={showErrors ? errors.title : ''}>
          <input
            type="text"
            className={`cal-input${showErrors && errors.title ? ' has-error' : ''}`}
            value={form.title}
            maxLength={TITLE_MAX_LENGTH + 20}
            placeholder="e.g. Dispatch review with vendor"
            onChange={update('title')}
            autoFocus
          />
        </FormField>

        <FormField label="Date" required error={showErrors ? errors.date : ''}>
          <input
            type="date"
            className={`cal-input${showErrors && errors.date ? ' has-error' : ''}`}
            value={form.date}
            onChange={update('date')}
          />
        </FormField>

        <div className="cal-grid-2">
          <FormField label="Start time" required error={showErrors ? errors.start : ''}>
            <input
              type="time"
              className={`cal-input${showErrors && errors.start ? ' has-error' : ''}`}
              value={form.start}
              onChange={update('start')}
            />
          </FormField>
          <FormField label="End time" required error={showErrors ? errors.end : ''}>
            <input
              type="time"
              className={`cal-input${showErrors && errors.end ? ' has-error' : ''}`}
              value={form.end}
              onChange={update('end')}
            />
          </FormField>
        </div>

        <FormField
          label="Category"
          required
          hint="Which ERP area the event belongs to — drives the colour on the calendar."
        >
          <select className="cal-select" value={form.category} onChange={update('category')}>
            {ERP_CATEGORIES.map((category) => (
              <option key={category.key} value={category.key}>
                {category.label}
              </option>
            ))}
          </select>
        </FormField>

        <FormField
          label="Description"
          error={showErrors ? errors.description : ''}
          hint={`Optional · ${DESCRIPTION_MAX_LENGTH} characters max`}
        >
          <textarea
            className={`cal-textarea${showErrors && errors.description ? ' has-error' : ''}`}
            rows={3}
            value={form.description}
            placeholder="Agenda, attendees or notes…"
            onChange={update('description')}
          />
        </FormField>

        <p className="text-[11px] text-ink-3 leading-relaxed">
          Events you add here are held in this browser only. Entries loaded from ERP modules appear
          read-only on the calendar and are never changed from this page.
        </p>
      </div>
    </Modal>
  );
}
