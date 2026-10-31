import React from 'react';
import Icon from '../icons/Icon';
import './ModuleSummaryCards.css';

/**
 * Generic KPI card grid. `cards`: [{ key, label, icon, tone }],
 * `values`: { key: number }. Counts are computed by the caller from
 * live demo data so nothing is hard-coded.
 *
 * Card anatomy is the Assembly reference exactly — a 42px icon tile beside
 * the value, with the label on a second line — so this grid and the shop
 * floor grid (ShopFloorSummaryCards) render identical cards.
 */
export default function ModuleSummaryCards({ cards, values, onCardClick }) {
  return (
    <div className="msummary-grid">
      {cards.map((card) => (
        <div
          key={card.key}
          className={`msummary-card${onCardClick ? ' clickable' : ''}`}
          onClick={onCardClick ? () => onCardClick(card.key) : undefined}
          role={onCardClick ? 'button' : undefined}
          tabIndex={onCardClick ? 0 : undefined}
          title={onCardClick ? `View ${card.label} details (opens in new tab)` : undefined}
          onKeyDown={onCardClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onCardClick(card.key); } } : undefined}
        >
          <div className="msummary-icon-num">
            <span className={`msummary-icon tone-${card.tone}`}>
              <Icon name={card.icon} size={19} />
            </span>
            <span className="msummary-num">{values[card.key] ?? 0}</span>
          </div>
          <span className="msummary-label">{card.label}</span>
        </div>
      ))}
    </div>
  );
}
