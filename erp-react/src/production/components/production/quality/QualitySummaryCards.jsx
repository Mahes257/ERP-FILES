import React from 'react';
import Icon from '../../icons/Icon';
import './QualitySummaryCards.css';

const CARDS = [
  { key: 'pending', label: 'QC Pending', icon: 'clock', tone: 'amber', hint: 'inspections awaiting start' },
  { key: 'today', label: 'Inspections Today', icon: 'calendar', tone: 'blue', hint: 'scheduled or worked today' },
  { key: 'accepted', label: 'Accepted', icon: 'check', tone: 'green', hint: 'units accepted' },
  { key: 'rejected', label: 'Rejected', icon: 'x', tone: 'red', hint: 'units rejected' },
  { key: 'onHold', label: 'On Hold', icon: 'pause', tone: 'gray', hint: 'inspections on hold' },
];

/** Every card renders zero until its counter arrives, so the grid never jumps. */
const EMPTY_VALUES = { pending: 0, today: 0, accepted: 0, rejected: 0, onHold: 0 };

/**
 * Quality KPI cards.
 *
 * The numbers come from the database (`ProductionKpiService.qualityCounts`,
 * served by `GET /production-kpi/quality/counts`): pending / today / onHold are
 * record counts and accepted / rejected are unit sums. They used to be derived
 * here from the inspections the page had loaded, which meant the cards were only
 * ever as complete as that one fetch — the same five numbers are now counted and
 * summed in SQL over the whole table.
 */
export default function QualitySummaryCards({ values, onCardClick }) {
  const shown = values || EMPTY_VALUES;

  return (
    <div className="q-summary-grid">
      {CARDS.map((card) => (
        <div
          key={card.key}
          className={`q-summary-card${onCardClick ? ' clickable' : ''}`}
          onClick={onCardClick ? () => onCardClick(card.key) : undefined}
          role={onCardClick ? 'button' : undefined}
          tabIndex={onCardClick ? 0 : undefined}
          title={onCardClick ? `View ${card.label} details (opens in new tab)` : undefined}
          onKeyDown={onCardClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onCardClick(card.key); } } : undefined}
        >
          <span className={`q-summary-icon tone-${card.tone}`}>
            <Icon name={card.icon} size={18} />
          </span>
          <div className="q-summary-body">
            <span className="q-summary-num">{Number(shown[card.key]) || 0}</span>
            <span className="q-summary-label">{card.label}</span>
            <span className="q-summary-hint">{card.hint}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
