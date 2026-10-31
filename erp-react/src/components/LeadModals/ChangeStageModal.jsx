import { useState } from 'react';
import { TrendingUp, Loader2 } from 'lucide-react';
import { Modal, FormField, ManagedSelect } from '../Common';
import { stageChip } from '../../utils/dropdownManager';

export default function ChangeStageModal({ open, lead, onClose, onSubmit }) {
  const [stage, setStage] = useState(lead?.stage || 'New');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!stage || submitting) return;
    setSubmitting(true);
    setError('');
    const ok = await onSubmit?.(stage);
    if (!ok) setSubmitting(false);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Move Stage"
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
            disabled={!stage || submitting}
            className="flex items-center gap-1.5 text-xs font-bold text-white bg-[#0B4A3D] hover:bg-[#083D34] disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 rounded-lg transition-colors cursor-pointer"
          >
            {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <TrendingUp className="w-3.5 h-3.5" />}
            Move Stage
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-amber-50 flex items-center justify-center text-amber-600 font-bold text-sm">
            {lead?.name?.slice(0, 1).toUpperCase() || '?'}
          </div>
          <div>
            <div className="text-sm font-bold text-slate-900">{lead?.name || 'Lead'}</div>
            <div className="text-[11px] text-slate-400 font-medium">{lead?.company || ''}</div>
          </div>
        </div>

        <FormField label="Pipeline Stage" required error={error}>
          <ManagedSelect
            categoryKey="lead_stage"
            label="Lead Stage"
            value={stage}
            onChange={(v) => setStage(v)}
            placeholder="Select a stage..."
          />
        </FormField>

        {stage && (
          <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Preview</span>
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${stageChip(stage)}`}>
              {stage}
            </span>
          </div>
        )}
      </div>
    </Modal>
  );
}
