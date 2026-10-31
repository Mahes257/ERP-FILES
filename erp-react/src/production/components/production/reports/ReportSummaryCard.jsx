import React from 'react';
import Icon from '../../icons/Icon';
import './ReportSummaryCard.css';

/**
 * Compact stat card used by every report summary row.
 * `tone` maps to the same tint palette as the other modules.
 */
export default function ReportSummaryCard({ label, value, sub, icon, tone = 'neutral' }) {
  return (
    <div className="rsc-card">
      <span className={`rsc-icon tone-${tone}`}>
        <Icon name={icon} size={18} />
      </span>
      <div className="rsc-body">
        <span className="rsc-value">{value}</span>
        <span className="rsc-label">{label}</span>
        {sub && <span className="rsc-sub">{sub}</span>}
      </div>
    </div>
  );
}
