import { useState, useEffect } from 'react';
import { UserCheck, Loader2 } from 'lucide-react';
import { Modal, FormField, SelectInput } from '../Common';
import leadService from '../../services/leadService';

function normalizeUsers(data) {
  const list = Array.isArray(data) ? data : data?.data ?? data?.users ?? [];
  return list
    .map((user) => (typeof user === 'string' ? user : user?.name || user?.username || user?.email))
    .filter(Boolean);
}

export default function AssignOwnerModal({ open, lead, onClose, onSubmit }) {
  const [owner, setOwner] = useState(lead?.owner || '');
  const [users, setUsers] = useState(() => (lead?.owner ? [lead.owner] : []));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    leadService
      .getUsers()
      .then((data) => {
        if (!cancelled) {
          const normalized = normalizeUsers(data);
          if (normalized.length > 0) setUsers(normalized);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open]);

  const handleSave = async () => {
    if (!owner || submitting) return;
    setSubmitting(true);
    setError('');
    const ok = await onSubmit?.(owner);
    if (!ok) setSubmitting(false);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Assign Owner"
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
            disabled={!owner || submitting}
            className="flex items-center gap-1.5 text-xs font-bold text-white bg-[#0B4A3D] hover:bg-[#083D34] disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 rounded-lg transition-colors cursor-pointer"
          >
            {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserCheck className="w-3.5 h-3.5" />}
            Assign Owner
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600 font-bold text-sm">
            {lead?.name?.slice(0, 1).toUpperCase() || '?'}
          </div>
          <div>
            <div className="text-sm font-bold text-slate-900">{lead?.name || 'Lead'}</div>
            <div className="text-[11px] text-slate-400 font-medium">{lead?.company || ''}</div>
          </div>
        </div>

        <FormField label="Owner" required error={error}>
          <SelectInput value={owner} onChange={(e) => setOwner(e.target.value)}>
            <option value="">Select an owner...</option>
            {users.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </SelectInput>
        </FormField>
      </div>
    </Modal>
  );
}
