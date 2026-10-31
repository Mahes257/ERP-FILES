/**
 * purchase/components/approval/ApprovalStageTimeline.jsx
 * ------------------------------------------------------------------
 * Enterprise approval lifecycle timeline (Draft → Submitted →
 * Technical Review → Department Approval → Finance Approval →
 * Management Approval → Approved → PO Created).
 *
 * Node states: ✓ completed · ● current (pulsing) · ○ upcoming.
 * Progress bar animates as the requisition advances. Returned /
 * Rejected variants render a status chip beside the current node.
 * ------------------------------------------------------------------
 */
import { Check, CircleDot } from 'lucide-react';
import { APPROVAL_STAGES } from './approvalDecorators';

export default function ApprovalStageTimeline({
  currentIndex = 0,
  status = '',
  compact = false
}) {
  const clamped = Math.max(0, Math.min(currentIndex, APPROVAL_STAGES.length - 1));
  const progress = (clamped / (APPROVAL_STAGES.length - 1)) * 100;
  const isReturned = status === 'Returned';
  const isRejected = status === 'Rejected';

  return (
    <div className={`ac-timeline ${compact ? 'ac-timeline-compact' : ''}`} aria-label="Requisition approval lifecycle">
      <div className="ac-timeline-track">
        <div className="ac-timeline-progress" style={{ width: `${progress}%` }} />
      </div>
      {APPROVAL_STAGES.map((stage, index) => {
        const completed = index < clamped;
        const current = index === clamped;
        return (
          <div key={stage.key} className="ac-tl-step">
            <div className={`ac-tl-node ${completed ? 'done' : ''} ${current ? 'current' : ''}`}>
              {completed ? (
                <Check className="ac-tl-node-icon" aria-hidden="true" />
              ) : current ? (
                <CircleDot className="ac-tl-node-dot" aria-hidden="true" />
              ) : (
                <span className="ac-tl-node-circle" aria-hidden="true" />
              )}
            </div>
            <div className={`ac-tl-label ${current ? 'current' : ''} ${completed ? 'done' : ''}`}>
              {stage.label}
              {current && isReturned && <span className="ac-tl-chip ac-tl-chip-return">Returned</span>}
              {current && isRejected && <span className="ac-tl-chip ac-tl-chip-reject">Rejected</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
