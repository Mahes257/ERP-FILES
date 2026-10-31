/**
 * purchase/components/approval/ApprovalDecisionDialog.jsx
 * ------------------------------------------------------------------
 * Approve / Reject / Return decision dialog.
 *  - Approve: optional comment, attachment (filename placeholder) and
 *    digital-signature name placeholder.
 *  - Reject: reason is MANDATORY.
 *  - Return: reason is MANDATORY, plus a Return-To (Requester /
 *    Department / Buyer) selector.
 * Pure UI — the page routes the submission through the existing
 * requisitionService actions.
 * ------------------------------------------------------------------
 */
import { useState } from 'react';
import { CheckCircle2, FileUp, RotateCcw, XCircle } from 'lucide-react';
import Modal from '../ui/Modal';

const META = {
  approve: { title: 'Approve Requisition', Icon: CheckCircle2, tone: 'approve' },
  reject: { title: 'Reject Requisition', Icon: XCircle, tone: 'reject' },
  return: { title: 'Return Requisition', Icon: RotateCcw, tone: 'return' }
};

const RETURN_TARGETS = [
  { value: 'requester', label: 'Requester' },
  { value: 'department', label: 'Department' },
  { value: 'buyer', label: 'Buyer' }
];

export default function ApprovalDecisionDialog({
  open = false,
  mode = 'approve',
  record = null,
  onClose,
  onSubmit,
  busy = false,
  submitLabel = 'Confirm'
}) {
  const [comment, setComment] = useState('');
  const [attachmentName, setAttachmentName] = useState('');
  const [signatureName, setSignatureName] = useState('');
  const [returnTo, setReturnTo] = useState('requester');
  const [error, setError] = useState('');

  if (!open) return null;

  const { title, Icon, tone } = META[mode] || META.approve;
  const requiresReason = mode === 'reject' || mode === 'return';

  const submit = () => {
    if (requiresReason && !comment.trim()) {
      setError(`A reason is required to ${mode} this requisition.`);
      return;
    }
    setError('');
    onSubmit?.({
      action: mode,
      record,
      comment: comment.trim(),
      attachment: attachmentName.trim() || null,
      signature: mode === 'approve' ? signatureName.trim() || null : null,
      returnTo: mode === 'return' ? returnTo : null
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          <Icon className={`w-4 h-4 ac-dialog-icon-${tone}`} />
          {title}
        </span>
      }
      footer={
        <>
          <button type="button" className="ac-dialog-btn ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className={`ac-dialog-btn ${tone}`} onClick={submit} disabled={busy}>
            {busy ? 'Submitting…' : submitLabel}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        {record && (
          <div className="ac-dialog-context">
            <span className="ac-dialog-pr">{record.prNo}</span>
            <span className="text-xs text-slate-600 truncate">{record.title}</span>
          </div>
        )}

        <label className="ac-field-label" htmlFor="ac-decision-comment">
          {mode === 'approve' ? 'Comment (optional)' : 'Reason'}
          {requiresReason && <span className="ac-req"> *</span>}
        </label>
        <textarea
          id="ac-decision-comment"
          rows={4}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder={
            mode === 'approve' ? 'Add an approval note…'
              : mode === 'reject' ? 'Explain why this requisition is rejected…'
                : 'Explain what needs to change…'
          }
          className="ac-decision-input"
        />
        {error && <p className="text-[11px] font-semibold text-rose-500">{error}</p>}

        {mode === 'approve' && (
          <>
            <div>
              <label className="ac-field-label">Digital Signature</label>
              <input
                type="text"
                value={signatureName}
                onChange={(e) => setSignatureName(e.target.value)}
                placeholder="e.g. Sanjay Kumar — Procurement Manager"
                className="ac-decision-input"
              />
              <p className="ac-hint">Placeholder for a digital-signature capture widget.</p>
            </div>
            <div>
              <label className="ac-field-label">Attachment</label>
              <div className="ac-file-box">
                <FileUp className="w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={attachmentName}
                  onChange={(e) => setAttachmentName(e.target.value)}
                  placeholder="File name (placeholder)"
                  className="ac-decision-input file"
                />
              </div>
            </div>
          </>
        )}

        {mode === 'return' && (
          <div>
            <label className="ac-field-label">Return To</label>
            <select
              value={returnTo}
              onChange={(e) => setReturnTo(e.target.value)}
              className="ac-decision-select"
            >
              {RETURN_TARGETS.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
        )}
      </div>
    </Modal>
  );
}
