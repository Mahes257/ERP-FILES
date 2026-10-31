/**
 * purchase/components/RfqFollowUpDetail.jsx
 * ------------------------------------------------------------------
 * Follow-up detail modal — shows the full follow-up context (linked
 * RFQ + vendor + reason + due date + assignee + notes + activity
 * timeline) and offers the valid actions: Open RFQ (navigates to the
 * existing RFQ detail — never a duplicate page), Edit, Reschedule,
 * Mark Completed / Cancel (pending only) and Delete.
 * ------------------------------------------------------------------
 */
import {
  CalendarClock, CheckCircle2, ExternalLink, History, PencilLine, Plus,
  Trash2, XCircle
} from 'lucide-react';
import { formatDate, formatDateTime } from '../utils/helpers';
import { FOLLOWUP_STATUS } from '../services/rfqFollowUp';
import PurchaseStatusBadge from './PurchaseStatusBadge';
import Modal from './ui/Modal';

const STATUS_BADGE = {
  Overdue: 'fu-badge fu-badge-overdue',
  'Due Today': 'fu-badge fu-badge-due-today',
  Upcoming: 'fu-badge fu-badge-upcoming',
  Completed: 'fu-badge fu-badge-completed',
  Cancelled: 'fu-badge fu-badge-cancelled'
};

const PRIORITY_CLASS = {
  Critical: 'cpr-priority-critical',
  High: 'cpr-priority-high',
  Medium: 'cpr-priority-medium',
  Low: 'cpr-priority-low'
};

const ACTIVITY_ICON = {
  create: Plus,
  complete: CheckCircle2,
  reschedule: CalendarClock,
  update: PencilLine,
  cancel: XCircle
};

function DetailRow({ label, children }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wide shrink-0">{label}</span>
      <span className="text-xs font-semibold text-slate-700 text-right">{children}</span>
    </div>
  );
}

export default function RfqFollowUpDetail({
  open,
  onClose,
  record,
  onOpenRfq,
  onEdit,
  onReschedule,
  onComplete,
  onCancel,
  onDelete,
  loading = false
}) {
  if (!record) return null;

  const pending = record.workflowStatus === FOLLOWUP_STATUS.PENDING;
  const timeline = Array.isArray(record.activity)
    ? [...record.activity].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    : [];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Follow-up ${record.followUpNo}`}
      maxWidth="max-w-2xl"
      footer={
        <>
          <button
            type="button"
            onClick={onDelete}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs font-bold text-rose-600 bg-rose-50 border border-rose-200 px-3 py-2 rounded-lg hover:bg-rose-100 transition-colors cursor-pointer disabled:opacity-50"
          >
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </button>
          <div className="flex-1" />
          <button
            type="button"
            onClick={onEdit}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs font-bold text-slate-600 bg-surface border border-slate-200 px-3 py-2 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-50"
          >
            <PencilLine className="w-3.5 h-3.5" /> Edit
          </button>
          {pending && (
            <>
              <button
                type="button"
                onClick={onReschedule}
                disabled={loading}
                className="flex items-center gap-1.5 text-xs font-bold text-slate-600 bg-surface border border-slate-200 px-3 py-2 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-50"
              >
                <CalendarClock className="w-3.5 h-3.5" /> Reschedule
              </button>
              <button
                type="button"
                onClick={onCancel}
                disabled={loading}
                className="flex items-center gap-1.5 text-xs font-bold text-rose-600 bg-rose-50 border border-rose-200 px-3 py-2 rounded-lg hover:bg-rose-100 transition-colors cursor-pointer disabled:opacity-50"
              >
                <XCircle className="w-3.5 h-3.5" /> Cancel
              </button>
              <button
                type="button"
                onClick={onComplete}
                disabled={loading}
                className="flex items-center gap-1.5 text-xs font-bold text-white px-3 py-2 rounded-lg transition-all cursor-pointer disabled:opacity-50 bg-gradient-to-r from-[#0F5C4C] to-[#0B4A3D] hover:from-[#136754] hover:to-[#0F5C4C] shadow-sm"
              >
                <CheckCircle2 className="w-3.5 h-3.5" /> Mark Completed
              </button>
            </>
          )}
        </>
      }
    >
      <div className="space-y-5">
        {/* Header — linked RFQ + live status */}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={onOpenRfq}
                className="text-sm font-bold text-[#0B4A3D] hover:underline cursor-pointer inline-flex items-center gap-1"
              >
                {record.rfqNo} <ExternalLink className="w-3.5 h-3.5" />
              </button>
              <PurchaseStatusBadge status={record.rfqStatus || record.status} />
            </div>
            <p className="text-xs text-slate-500 mt-1 truncate" title={record.rfqTitle}>
              {record.rfqTitle || '—'}
            </p>
          </div>
          <span className={STATUS_BADGE[record.status] || 'fu-badge fu-badge-upcoming'}>{record.status}</span>
        </div>

        {/* Details */}
        <div className="rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-2 divide-y divide-slate-100">
          <DetailRow label="Follow-up Type">
            <span className="fu-type-chip">{record.type || '—'}</span>
          </DetailRow>
          <DetailRow label="Vendor">{record.vendor || '—'}</DetailRow>
          <DetailRow label="Requester">{record.requester || '—'}</DetailRow>
          <DetailRow label="Due">
            {formatDate(record.followUpDate)}
            {record.followUpTime ? ` · ${record.followUpTime}` : ''}
          </DetailRow>
          <DetailRow label="Priority">
            <span className={`cpr-priority ${PRIORITY_CLASS[record.priority] || PRIORITY_CLASS.Medium}`}>
              {record.priority || 'Medium'}
            </span>
          </DetailRow>
          <DetailRow label="Assigned To">{record.assignedTo || '—'}</DetailRow>
          <DetailRow label="Reminder">{record.reminder ? 'On' : 'Off'}</DetailRow>
          {record.lastContact && <DetailRow label="Last Contact">{formatDate(record.lastContact)}</DetailRow>}
          {record.completedAt && <DetailRow label="Completed">{formatDateTime(record.completedAt)}</DetailRow>}
          {record.cancelledAt && <DetailRow label="Cancelled">{formatDateTime(record.cancelledAt)}</DetailRow>}
        </div>

        {/* Notes */}
        {record.notes && (
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-1">Notes</p>
            <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-line rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2">
              {record.notes}
            </p>
          </div>
        )}

        {/* Timeline */}
        <div>
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-2">Timeline</p>
          <ol className="space-y-0">
            {timeline.map((entry) => {
              const Icon = ACTIVITY_ICON[entry.type] || History;
              return (
                <li key={entry.id} className="flex items-start gap-3 py-1.5">
                  <span className="mt-0.5 p-1 rounded-md bg-slate-100 text-slate-500 shrink-0">
                    <Icon className="w-3 h-3" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-700">{entry.label}</p>
                    <p className="text-[10px] text-slate-400 font-medium">
                      {entry.actor} · {formatDateTime(entry.timestamp)}
                    </p>
                  </div>
                </li>
              );
            })}
            {timeline.length === 0 && (
              <li className="text-xs text-slate-400 py-1">No activity recorded.</li>
            )}
          </ol>
        </div>
      </div>
    </Modal>
  );
}
