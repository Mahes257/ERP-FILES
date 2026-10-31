import { Ban, CheckCircle, ClipboardList, Clock, IndianRupee } from 'lucide-react';

const KPI_ICONS = {
  all: { icon: ClipboardList, color: '#0A4F44', bg: 'rgba(10,79,68,0.08)' },
  pendingapproval: { icon: Clock, color: '#d97706', bg: 'rgba(217,119,6,0.10)' },
  approved: { icon: CheckCircle, color: '#16a34a', bg: 'rgba(22,163,74,0.10)' },
  quotationDeadline: { icon: Clock, color: '#2563eb', bg: 'rgba(37,99,235,0.10)' },
  rejected: { icon: Ban, color: '#dc2626', bg: 'rgba(220,38,38,0.10)' },
  totalvalue: { icon: IndianRupee, color: '#ec4899', bg: 'rgba(236,72,153,0.10)' }
};

export default function CprKpiCards({ stats, activeKpi, onSelect }) {
  const cards = [
    { key: 'all', label: 'Total Requisitions', value: stats.total },
    { key: 'pendingapproval', label: 'Pending Approval', value: stats.pendingApproval },
    { key: 'approved', label: 'Approved', value: stats.approved },
    { key: 'quotationDeadline', label: 'Converted to RFQ', value: stats.quotationDeadline ?? stats.converted ?? 0, static: true },
    { key: 'rejected', label: 'Rejected', value: stats.rejected },
    { key: 'totalvalue', label: 'Total Value', value: `\u20B9${Number(stats.totalAmt || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}` }
  ];

  return (
    <div className="pr-kpi-grid">
      {cards.map((card) => {
        const Icon = KPI_ICONS[card.key].icon;
        const color = KPI_ICONS[card.key].color;
        const bg = KPI_ICONS[card.key].bg;
        const active = activeKpi === card.key;
        const inner = (
          <>
            <span className="qtn-kpi-icon" style={{ background: bg, color }} aria-hidden="true">
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
            <div
              key={card.key}
              className="pr-kpi-card qtn-kpi-card"
              data-filter={card.key}
            >
              {inner}
            </div>
          );
        }
        return (
          <button
            key={card.key}
            type="button"
            onClick={() => onSelect(card.key)}
            className={`pr-kpi-card qtn-kpi-card${active ? ' active' : ''}`}
            data-filter={card.key}
          >
            {inner}
          </button>
        );
      })}
    </div>
  );
}
