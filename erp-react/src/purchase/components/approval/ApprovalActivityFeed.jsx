/**
 * purchase/components/approval/ApprovalActivityFeed.jsx
 * ------------------------------------------------------------------
 * Recent-activity stream across all requisitions: submissions,
 * approvals, returns, rejections, PO creations and comments.
 * ------------------------------------------------------------------
 */
import {
  CheckCircle2, FileText, MessageSquare, RotateCcw, Send, XCircle
} from 'lucide-react';
import { getInitials } from '../../utils/helpers';

const TYPE_META = {
  submit: { Icon: Send, tone: 'blue' },
  review: { Icon: CheckCircle2, tone: 'indigo' },
  approve: { Icon: CheckCircle2, tone: 'green' },
  reject: { Icon: XCircle, tone: 'red' },
  return: { Icon: RotateCcw, tone: 'amber' },
  po: { Icon: FileText, tone: 'cyan' },
  comment: { Icon: MessageSquare, tone: 'slate' }
};

const FALLBACK = { Icon: MessageSquare, tone: 'slate' };

function relativeTime(value) {
  const ts = new Date(value).getTime();
  if (!Number.isFinite(ts)) return '';
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const LABEL = {
  submit: 'submitted', review: 'reviewed', approve: 'approved', reject: 'rejected',
  return: 'returned', po: 'raised PO for', comment: 'commented on'
};

export default function ApprovalActivityFeed({ items = [], onSelect, limit = 8 }) {
  const visible = limit > 0 ? items.slice(0, limit) : items;

  return (
    <div className="ac-feed">
      {visible.length === 0 && <p className="ac-muted py-8 text-center">No recent activity.</p>}
      {visible.map((item) => {
        const { Icon, tone } = TYPE_META[item.type] || FALLBACK;
        const actor = item.actor || 'System';
        return (
          <button
            key={item.id || `${item.prNo}-${item.type}-${item.timestamp}`}
            type="button"
            className="ac-feed-item"
            onClick={() => onSelect?.(item.prNo)}
          >
            <span className={`ac-feed-dot ${tone}`}><Icon className="w-3.5 h-3.5" /></span>
            <span className="ac-feed-avatar">{getInitials(actor)}</span>
            <span className="ac-feed-body">
              <span className="ac-feed-text">
                <b>{actor}</b> {LABEL[item.type] || item.type} <b className="ac-feed-pr">{item.prNo}</b>
                {item.note ? ` — ${item.note}` : ''}
              </span>
              <span className="ac-feed-time">{relativeTime(item.timestamp)}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
