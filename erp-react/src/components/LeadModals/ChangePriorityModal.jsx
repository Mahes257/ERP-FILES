import { useState } from 'react';
import { Flag, Loader2 } from 'lucide-react';
import { Modal, FormField, ManagedSelect } from '../Common';
import { priorityMeta } from '../../utils/dropdownManager';

export default function ChangePriorityModal({ open, lead, onClose, onSubmit }) {
  const [priority, setPriority] = useState(lead?.priority || 'Medium');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!priority || submitting) return;
    setSubmitting(true);
    setError('');
    const ok = await onSubmit?.(priority);
    if (!ok) setSubmitting(false);
  };

  const selectedColor = priorityMeta(priority).color;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Change Priority"
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
            disabled={!priority || submitting}
            className="flex items-center gap-1.5 text-xs font-bold text-white bg-[#0B4A3D] hover:bg-[#083D34] disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 rounded-lg transition-colors cursor-pointer"
          >
            {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Flag className="w-3.5 h-3.5" />}
            Change Priority
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-violet-50 flex items-center justify-center text-violet-600 font-bold text-sm">
            {lead?.name?.slice(0, 1).toUpperCase() || '?'}
          </div>
          <div>
            <div className="text-sm font-bold text-slate-900">{lead?.name || 'Lead'}</div>
            <div className="text-[11px] text-slate-400 font-medium">{lead?.company || ''}</div>
          </div>
        </div>

        <FormField label="Priority" required error={error}>
          <ManagedSelect
            categoryKey="lead_priority"
            label="Lead Priority"
            value={priority}
            onChange={(v) => setPriority(v)}
            placeholder="Select a priority..."
          />
        </FormField>

        {priority && (
          <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Preview</span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider text-white" style={{ background: selectedColor }}>
              <Flag className="w-3 h-3" />
              {priority}
            </span>
          </div>
        )}
      </div>
    </Modal>
  );
}
