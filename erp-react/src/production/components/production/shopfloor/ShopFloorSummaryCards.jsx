import React from 'react';
import Icon from '../../icons/Icon';
import './ShopFloorSummaryCards.css';

const CARDS = [
  { key: 'total', label: 'Total Jobs', icon: 'clipboard', tone: 'neutral' },
  { key: 'pending', label: 'Pending', icon: 'clock', tone: 'amber' },
  { key: 'inProgress', label: 'In Progress', icon: 'play', tone: 'blue' },
  { key: 'completed', label: 'Completed', icon: 'check', tone: 'green' },
  { key: 'onHold', label: 'On Hold', icon: 'pause', tone: 'gray' },
];

/** Summary counts computed live from the current job data. */
export default function ShopFloorSummaryCards({ jobs, onCardClick }) {
  const counts = {
    total: jobs.length,
    pending: jobs.filter((job) => job.status === 'Pending').length,
    inProgress: jobs.filter((job) => job.status === 'In Progress').length,
    completed: jobs.filter((job) => job.status === 'Completed').length,
    onHold: jobs.filter((job) => job.status === 'Hold').length,
  };

  return (
    <div className="sf-summary-grid">
      {CARDS.map((card) => (
        <div
          key={card.key}
          className={`sf-summary-card${onCardClick ? ' clickable' : ''}`}
          onClick={onCardClick ? () => onCardClick(card.key) : undefined}
          role={onCardClick ? 'button' : undefined}
          tabIndex={onCardClick ? 0 : undefined}
          title={onCardClick ? `View ${card.label} details (opens in new tab)` : undefined}
          onKeyDown={onCardClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onCardClick(card.key); } } : undefined}
        >
          <div className="sf-summary-icon-num">
            <span className={`sf-summary-icon tone-${card.tone}`}>
              <Icon name={card.icon} size={19} />
            </span>
            <span className="sf-summary-num">{counts[card.key]}</span>
          </div>
          <span className="sf-summary-label">{card.label}</span>
        </div>
      ))}
    </div>
  );
}
