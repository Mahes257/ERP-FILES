/**
 * purchase/components/approval/ApprovalHistoryTimeline.jsx
 * ------------------------------------------------------------------
 * Approval history timeline for a single requisition. Each event
 * shows: user, role, date, time, comment — for Submitted, Reviewed,
 * Returned, Approved, Rejected and PO Created actions.
 * ------------------------------------------------------------------
 */
import { CheckCircle2, Circle, FileText, RotateCcw, Send, XCircle } from 'lucide-react';
import { formatDateTime, getInitials } from '../../utils/helpers';
import { roleFor } from './approvalDecorators';

const TYPE_META = {
  submit: { Icon: Send, tone: 'blue' },
  review: { Icon: CheckCircle2, tone: 'indigo' },
  approve: { Icon: CheckCircle2, tone: 'green' },
  reject: { Icon: XCircle, tone: 'red' },
  return: { Icon: RotateCcw, tone: 'gray' },
  po: { Icon: FileText, tone: 'cyan' }
};

const FALLBACK = { Icon: Circle, tone: 'slate' };

export default function ApprovalHistoryTimeline({ events = [], compact = false }) {
  return (
    <div className={`ac-history ${compact ? 'ac-history-compact' : ''}`}>
      {events.length === 0 && <p className="ac-muted">No approval activity yet.</p>}
      {events.map((entry, index) => {
        const { Icon, tone } = TYPE_META[entry.type] || FALLBACK;
        const actor = entry.actor || 'System';
        const when = entry.timestamp || entry.date || '';
        return (
          <div key={entry.id || `${entry.type}-${index}`} className="ac-history-item">
            <span className={`ac-history-dot ${tone}`}>
              <Icon className="w-3.5 h-3.5" />
            </span>
            <div className="ac-history-body">
              <div className="flex items-center justify-between gap-2">
                <span className="ac-history-label">{entry.label || entry.action || entry.type}</span>
                <span className="ac-history-time">{formatDateTime(when)}</span>
              </div>
              <div className="ac-history-meta">
                <span className="ac-history-avatar">{getInitials(actor)}</span>
                <span className="ac-history-actor">{actor}</span>
                <span className="ac-history-role">· {roleFor(actor)}</span>
              </div>
              {entry.note && <p className="ac-history-note">{entry.note}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
