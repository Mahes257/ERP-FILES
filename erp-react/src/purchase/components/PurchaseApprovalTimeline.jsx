/**
 * purchase/components/PurchaseApprovalTimeline.jsx
 * ------------------------------------------------------------------
 * Enterprise approval workflow timeline (HTML template .prm-timeline):
 * activity stream (created, submitted, approved, rejected, PO raised)
 * with status-coloured dots.
 * ------------------------------------------------------------------
 */
import { CheckCircle2, Circle, FilePlus2, FileText, Inbox, MessageSquare, Printer, RotateCcw, Send, Trophy, XCircle } from 'lucide-react';
import { formatDateTime } from '../utils/helpers';

const TYPE_STYLES = {
  create: { Icon: FilePlus2, dot: 'gray' },
  submit: { Icon: Send, dot: 'blue' },
  approve: { Icon: CheckCircle2, dot: 'green' },
  reject: { Icon: XCircle, dot: 'red' },
  return: { Icon: RotateCcw, dot: 'gray' },
  review: { Icon: CheckCircle2, dot: 'blue' },
  po: { Icon: FileText, dot: 'green' },
  /* RFQ-specific workflow events */
  award: { Icon: Trophy, dot: 'green' },
  mail: { Icon: Send, dot: 'blue' },
  quote: { Icon: Inbox, dot: 'blue' },
  print: { Icon: Printer, dot: 'gray' },
  order: { Icon: FileText, dot: 'green' },
  comment: { Icon: MessageSquare, dot: 'gray' }
};

const FALLBACK = { Icon: Circle, dot: 'gray' };

/** First letters of the actor's first two words → small avatar initials. */
function initialsOf(actor) {
  const words = String(actor || '').trim().split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '·';
}

export default function PurchaseApprovalTimeline({ activity = [], emptyLabel = 'No workflow activity recorded yet.' }) {
  return (
    <div className="prm-timeline">
      {activity.length === 0 && <p className="text-xs text-slate-400 py-4 text-center">{emptyLabel}</p>}
      {activity.map((entry, index) => {
        const { Icon, dot } = TYPE_STYLES[entry.type] || FALLBACK;
        return (
          <div key={entry.id || `${entry.type}-${index}`} className="prm-timeline-item">
            <span className="prm-timeline-node">
              <span className="prm-timeline-avatar" aria-hidden="true">{initialsOf(entry.actor)}</span>
              <span className={`prm-timeline-dot ${dot}`}>
                <Icon style={{ width: 8, height: 8 }} />
              </span>
            </span>
            <div className="prm-timeline-date">
              {entry.actor ? `${entry.actor} · ` : ''}{formatDateTime(entry.timestamp)}
            </div>
            <p className="prm-timeline-title">{entry.label}</p>
            {entry.note && <p className="prm-timeline-desc">{entry.note}</p>}
          </div>
        );
      })}
    </div>
  );
}
