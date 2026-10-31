import { FileText } from 'lucide-react';

/**
 * Shared KPI summary card grid — matches the Purchase Requisition page
 * (requisition-list-polish.css) exactly:
 *
 *   [ ICON ]   12
 *              Total Leads
 *
 * Icon is LEFT, number+label are RIGHT of the icon.
 * All layout/typography is driven by CSS classes (pr-kpi-grid,
 * pr-kpi-card, qtn-kpi-icon, qtn-kpi-count, qtn-kpi-label)
 * so the cpr-list.css / requisition-list-polish.css rules apply
 * without inline-style conflicts.
 *
 * Props:
 *   cards          - array of { key, label, value, icon, color, bg, static?, newTabUrl? }
 *   activeKpi      - currently active KPI key (for filter highlighting)
 *   onSelect       - callback(cardKey) for in-page KPI filtering
 *   gridClassName  - override the grid CSS class
 */
export default function SalesKpiCards({ cards = [], activeKpi, onSelect, gridClassName }) {

  return (
    <div className={gridClassName || 'pr-kpi-grid'}>
      {cards.map((card) => {
        const Icon = card.icon || FileText;
        const color = card.color || '#0A4F44';
        const bg = card.bg || `${color}14`;
        const active = activeKpi === card.key;

        const inner = (
          <>
            <span className="qtn-kpi-icon" style={{ color, backgroundColor: bg }} aria-hidden="true">
              <Icon size={20} />
            </span>
            <div className="qtn-kpi-body">
              <div className="qtn-kpi-count" title={String(card.value)}>{card.value}</div>
              <div className="qtn-kpi-label" title={card.label}>{card.label}</div>
            </div>
          </>
        );

        if (card.static) {
          return (
            <div key={card.key} className="pr-kpi-card qtn-kpi-card" data-filter={card.key}>
              {inner}
            </div>
          );
        }

        return (
          <button
            key={card.key}
            type="button"
            onClick={() => onSelect(card.key)}
            className={`pr-kpi-card qtn-kpi-card cursor-pointer${active ? ' active' : ''}`}
            data-filter={card.key}
          >
            {inner}
          </button>
        );
      })}
    </div>
  );
}
