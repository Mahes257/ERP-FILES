/**
 * purchase/components/approval/ApprovalNotifications.jsx
 * ------------------------------------------------------------------
 * Smart alert centre: pending > 3 days, high-priority requests,
 * critical-value amounts, and urgent required dates. Each alert is
 * clickable and jumps to the requisition.
 * ------------------------------------------------------------------
 */
import { AlarmClock, AlertTriangle, Banknote, TrendingUp } from 'lucide-react';
import { formatDate } from '../../utils/helpers';
import { formatAmountConverted } from '../../utils/purchase';
import { pendingOverdue, urgentByDate } from './approvalDecorators';

const CRITICAL_AMOUNT = 500000;

function buildAlerts(records) {
  const alerts = [];
  const overdue = pendingOverdue(records, 3);
  const urgent = urgentByDate(records, 7);

  overdue.forEach((r) =>
    alerts.push({
      key: `overdue-${r.id}`,
      prNo: r.prNo,
      tone: 'red',
      Icon: AlarmClock,
      title: 'Approval overdue',
      body: `Pending for ${r._ageDays}d — awaiting ${r.assignedTo || 'approver'}.`
    })
  );

  urgent.forEach((r) =>
    alerts.push({
      key: `urgent-${r.id}`,
      prNo: r.prNo,
      tone: 'amber',
      Icon: AlertTriangle,
      title: 'Urgent required date',
      body: `Must be decided before ${formatDate(r.expectedDate)}.`
    })
  );

  records
    .filter((r) => r.status === 'Pending Approval' && (r.priority === 'High' || r.priority === 'Critical'))
    .forEach((r) =>
      alerts.push({
        key: `high-${r.id}`,
        prNo: r.prNo,
        tone: 'amber',
        Icon: TrendingUp,
        title: `${r.priority} priority request`,
        body: `${r.department} — ${r.requester}.`
      })
    );

  records
    .filter((r) => r.status === 'Pending Approval' && Number(r.amount) >= CRITICAL_AMOUNT)
    .forEach((r) =>
      alerts.push({
        key: `amount-${r.id}`,
        prNo: r.prNo,
        tone: 'indigo',
        Icon: Banknote,
        title: 'Critical value',
        body: `${formatAmountConverted(r.amount, r.currency)} pending approval.`
      })
    );

  return alerts.sort((a, b) => (a.tone === 'red' ? -1 : b.tone === 'red' ? 1 : 0));
}

export default function ApprovalNotifications({ records = [], onSelect, limit = 6 }) {
  const alerts = buildAlerts(records);
  const visible = limit > 0 ? alerts.slice(0, limit) : alerts;

  return (
    <div className="ac-notifications">
      {visible.length === 0 && <p className="ac-muted py-8 text-center">All caught up — no alerts.</p>}
      {visible.map((alert) => {
        const { Icon } = alert;
        return (
          <button
            key={alert.key}
            type="button"
            className="ac-notification"
            onClick={() => onSelect?.(alert.prNo)}
          >
            <span className={`ac-notification-icon ${alert.tone}`}><Icon className="w-4 h-4" /></span>
            <span className="ac-notification-body">
              <span className="ac-notification-title">{alert.title}</span>
              <span className="ac-notification-pr">{alert.prNo}</span>
              <span className="ac-notification-text">{alert.body}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
