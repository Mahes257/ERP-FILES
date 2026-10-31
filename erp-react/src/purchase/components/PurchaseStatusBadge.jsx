/**
 * purchase/components/PurchaseStatusBadge.jsx
 * ------------------------------------------------------------------
 * Enterprise status pill matching the HTML template's .po-badge /
 * .cpr-badge system. The tone for every status comes from the shared
 * semantic map in utils/statusTone (green / orange / red / blue /
 * gray) — the SAME map that drives the table status dots and the KPI
 * colors, so a status can never render two different colors.
 *
 *   green  = success / completed / approved
 *   orange = pending / needs action
 *   red    = rejected / cancelled / failed
 *   blue   = info / sent / in progress
 *   gray   = draft / neutral
 * ------------------------------------------------------------------
 */
import { getStatusTone } from '../utils/statusTone';

/* Semantic tone → po-badge pill class. */
const PO_TONE_CLASS = {
  gray: 'po-badge-gray',
  green: 'po-badge-green',
  orange: 'po-badge-orange',
  red: 'po-badge-red',
  blue: 'po-badge-blue'
};

/* Semantic tone → cpr-badge pill class (the shared Purchase list
   language used by the PR / RFQ / follow-up tables). */
const CPR_TONE_CLASS = {
  gray: 'cpr-badge-draft',
  green: 'cpr-badge-approved',
  orange: 'cpr-badge-pending-approval',
  red: 'cpr-badge-rejected',
  blue: 'cpr-badge-converted'
};

export default function PurchaseStatusBadge({ status, dot = true, className = '', variant = 'po', tone: toneProp }) {
  const tone = toneProp || getStatusTone(status);
  if (variant === 'cpr') {
    return <span className={`cpr-badge ${CPR_TONE_CLASS[tone] || 'cpr-badge-draft'} ${className}`}>{status}</span>;
  }
  return (
    <span className={`po-badge ${PO_TONE_CLASS[tone] || 'po-badge-gray'} ${className}`}>
      {dot && <span className="po-badge-dot" aria-hidden="true" />}
      {status}
    </span>
  );
}
