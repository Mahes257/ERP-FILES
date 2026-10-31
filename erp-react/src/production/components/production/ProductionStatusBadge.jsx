import React from 'react';
import './ProductionStatusBadge.css';

// Map a status label to a CSS class variant (lowercase, dashes).
const variant = (status) => status.toLowerCase().replace(/\s+/g, '-');

/**
 * Small colored status pill. Supported statuses:
 * Pending · In Progress · Completed · Pending QC · Packed ·
 * Ready for Dispatch (unknown statuses fall back to neutral).
 *
 * Cancelled status shows a red ✕ cross mark instead of the default dot.
 */
export default function ProductionStatusBadge({ status }) {
  const showCross = status === 'Cancelled' || status === 'Production Rejected' || status === 'Admin Rejected';
  const markClass = status === 'Cancelled' ? 'status-cancelled-mark'
    : status === 'Production Rejected' ? 'status-production-rejected-mark'
    : status === 'Admin Rejected' ? 'status-admin-rejected-mark'
    : '';
  return (
    <span className={`status-badge status-${variant(status)}${showCross ? ' ' + markClass : ''}`}>
      {showCross && (
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ marginRight: 2 }}>
          <path d="M9 3L3 9M3 3l6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )}
      {status}
    </span>
  );
}
