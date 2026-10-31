/**
 * Shared StatusBadge component – single source of truth for status pill rendering.
 *
 * Uses the existing `po-badge` design-system classes from purchase-design-system.css.
 * Covers every status across Marketing, Sales, CPR, Cost/Profit Workouts, Documents, etc.
 */

const STATUS_TONE = {
  /* ---- Pending / Approval ---- */
  'pending approval': 'orange',
  'pending_approval': 'orange',
  'pendingapproval': 'orange',
  pending: 'orange',
  'under review': 'orange',
  'pending review': 'orange',
  'pendingreview': 'orange',
  'revision required': 'orange',

  /* ---- Draft / Neutral ---- */
  draft: 'gray',
  submitted: 'gray',
  'not prepared': 'gray',
  archived: 'gray',
  inactive: 'gray',

  /* ---- Active / In-Progress ---- */
  active: 'blue',
  'in progress': 'blue',
  'planned': 'blue',
  'scheduled': 'blue',

  /* ---- Success ---- */
  approved: 'green',
  confirmed: 'green',
  completed: 'green',
  sent: 'green',
  accepted: 'green',
  issued: 'green',
  settled: 'green',
  received: 'green',
  paid: 'green',
  converted: 'green',
  packed: 'green',
  dispatched: 'green',
  'in transit': 'green',
  delivered: 'green',
  'filled & submitted': 'green',
  'lead generated': 'green',
  'existing customer opportunity': 'green',
  'existing order': 'green',
  'existing opportunity': 'green',
  'handed over': 'green',
  'ready for sales': 'green',
  'cost workout': 'green',
  refunded: 'green',
  'won': 'green',
  'accepted': 'green',

  /* ---- Partial / Warning ---- */
  'partial paid': 'yellow',
  partial: 'yellow',
  adjusted: 'yellow',
  'follow-up required': 'yellow',
  'need further discussion': 'yellow',
  overdue: 'yellow',
  rescheduled: 'yellow',
  'pending confirmation': 'yellow',
  'not ready': 'yellow',
  'correction requested': 'yellow',

  /* ---- Danger ---- */
  rejected: 'red',
  cancelled: 'red',
  deleted: 'red',
  'not interested': 'red',
  'lost opportunity': 'red',
  lost: 'red',
  'no lead': 'red',

  /* ---- Purple ---- */
  expired: 'purple',

  /* ---- Cyan ---- */
  'upcoming': 'cyan',
  'no response': 'gray',
  'no visit': 'gray',
  'other': 'gray',
  'not required': 'gray',
};

const TONE_CLASSES = {
  orange: 'po-badge po-badge-orange',
  gray: 'po-badge po-badge-gray',
  blue: 'po-badge po-badge-blue',
  green: 'po-badge po-badge-green',
  yellow: 'po-badge po-badge-yellow',
  red: 'po-badge po-badge-red',
  purple: 'po-badge po-badge-purple',
  cyan: 'po-badge po-badge-cyan',
  indigo: 'po-badge po-badge-indigo',
};

const STATUS_LABELS = {
  draft: 'Draft',
  submitted: 'Submitted',
  'pending approval': 'Pending Approval',
  'pending review': 'Pending Review',
  'under review': 'Under Review',
  'in progress': 'In Progress',
  'partial paid': 'Partial Paid',
  'in transit': 'In Transit',
  'filled & submitted': 'Filled & Submitted',
  'lead generated': 'Lead Generated',
  'existing customer opportunity': 'Existing Customer Opportunity',
  'existing order': 'Existing Order',
  'existing opportunity': 'Existing Opportunity',
  'not prepared': 'Not Prepared',
  'handed over': 'Handed Over',
  'ready for sales': 'Ready for Sales',
  'cost workout': 'Cost Workout',
  'follow-up required': 'Follow-up Required',
  'need further discussion': 'Need Further Discussion',
  'not interested': 'Not Interested',
  'lost opportunity': 'Lost Opportunity',
  'no lead': 'No Lead',
  'no response': 'No Response',
  'no visit': 'No Visit',
  'not required': 'Not Required',
  'not ready': 'Not Ready',
  'pending confirmation': 'Pending Confirmation',
  'correction requested': 'Correction Requested',
  'revision required': 'Revision Required',
};

export default function StatusBadge({ status, className: extraClass }) {
  const raw = String(status || '').trim();
  const key = raw.toLowerCase();
  const tone = STATUS_TONE[key] || 'gray';
  const cls = TONE_CLASSES[tone] || 'po-badge po-badge-gray';
  const label = STATUS_LABELS[key] || raw || '—';

  if (!raw) return <span className="text-slate-300">—</span>;

  return (
    <span className={`${cls}${extraClass ? ` ${extraClass}` : ''}`}>
      {label}
    </span>
  );
}
