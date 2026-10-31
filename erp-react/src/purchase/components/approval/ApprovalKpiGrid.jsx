/**
 * purchase/components/approval/ApprovalKpiGrid.jsx
 * ------------------------------------------------------------------
 * Executive dashboard KPI grid — 8 glass cards, each clickable to
 * drive a table filter. Active card is highlighted.
 * ------------------------------------------------------------------
 */
export default function ApprovalKpiGrid({ cards = [], activeKey = null, onCardClick }) {
  return (
    <div className="ac-kpi-grid">
      {cards.map((card) => {
        const Icon = card.icon;
        const active = activeKey === card.key;
        return (
          <button
            key={card.key}
            type="button"
            className={`ac-kpi-card ${card.tone || 'indigo'} ${active ? 'active' : ''}`}
            onClick={() => onCardClick?.(card.key)}
            title={card.tip || card.label}
          >
            <div className="ac-kpi-top">
              <span className="ac-kpi-label">{card.label}</span>
              {Icon && <span className="ac-kpi-icon"><Icon className="w-4 h-4" /></span>}
            </div>
            <div className="ac-kpi-value">{card.value}</div>
            {card.sub != null && <div className="ac-kpi-sub">{card.sub}</div>}
          </button>
        );
      })}
    </div>
  );
}
