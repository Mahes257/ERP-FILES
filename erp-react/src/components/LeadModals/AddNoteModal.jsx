import { useState } from 'react';
import { StickyNote, Loader2 } from 'lucide-react';
import { Modal, FormField, TextArea } from '../Common';

export default function AddNoteModal({ open, lead, onClose, onSubmit }) {
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!note.trim() || submitting) return;
    setSubmitting(true);
    setError('');
    const ok = await onSubmit?.(note.trim());
    if (!ok) setSubmitting(false);
    else setNote('');
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add Note"
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
            disabled={!note.trim() || submitting}
            className="flex items-center gap-1.5 text-xs font-bold text-white bg-[#0B4A3D] hover:bg-[#083D34] disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 rounded-lg transition-colors cursor-pointer"
          >
            {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <StickyNote className="w-3.5 h-3.5" />}
            Add Note
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

        <FormField label="Note" required error={error}>
          <TextArea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={4}
            error={!!error}
            placeholder="Type a note for this lead..."
          />
        </FormField>
      </div>
    </Modal>
  );
}
