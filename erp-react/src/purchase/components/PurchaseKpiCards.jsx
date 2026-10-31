/**
 * purchase/components/PurchaseKpiCards.jsx
 * ------------------------------------------------------------------
 * Reusable KPI summary grid matching the HTML template's
 * .po-kpi-card system (40px icon tile, 21px value, 11px label,
 * hover lift + green active ring).
 *
 * Card definitions carry Tailwind `bg` classes (e.g. bg-indigo-50);
 * these are mapped onto the template's .po-kpi-icon tone variants.
 *
 * Currency values are never clipped — the value text uses
 * word-break and the card allows content to overflow visually.
 * ------------------------------------------------------------------ */
const BG_TO_TONE = {
  'bg-indigo-50': 'indigo',
  'bg-slate-100': 'gray',
  'bg-amber-50': 'amber',
  'bg-emerald-50': 'emerald',
  'bg-rose-50': 'red',
  'bg-sky-50': 'sky',
  'bg-purple-50': 'purple',
  'bg-orange-50': 'orange',
  'bg-pink-50': 'pink',
  'bg-cyan-50': 'cyan',
  'bg-blue-50': 'blue',
  'bg-teal-50': 'green',
  'bg-green-50': 'green',
  'bg-gray-100': 'gray'
};

export default function PurchaseKpiCards({
  cards = [],
  loading = false,
  gridClass = '',
  activeKey = null,
  onSelect,
  variant = 'po'
}) {
  /* CPR variant: the requisition-list KPI design (pr-kpi-card / qtn-*),
     driven by card.color / card.bg inline tones. Centralized so the CPR
     KPI design becomes the single shared standard. */
  if (variant === 'cpr') {
    return (
      <div className={`pr-kpi-grid ${gridClass}`}>
        {cards.map((card) => {
          const Icon = card.icon;
          const active = card.key === activeKey;
          return (
            <div
              key={card.key || card.label}
              className={`pr-kpi-card qtn-kpi-card ${active ? 'active' : ''}`}
              data-filter={card.key}
              role={onSelect ? 'button' : undefined}
              tabIndex={onSelect ? 0 : undefined}
              aria-pressed={onSelect ? active : undefined}
              onClick={() => onSelect?.(card.key)}
              onKeyDown={
                onSelect
                  ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelect(card.key);
                      }
                    }
                  : undefined
              }
            >
              <span
                className="qtn-kpi-icon"
                style={{ color: card.color, backgroundColor: card.bg }}
                aria-hidden="true"
              >
                <Icon size={19} />
              </span>
              <div className="qtn-kpi-body">
                <div className="qtn-kpi-count" title={String(card.value)}>{loading ? '—' : card.value}</div>
                <div className="qtn-kpi-label" title={card.label}>{card.label}</div>
                {card.sub && <div className="qtn-kpi-sub" title={card.sub}>{card.sub}</div>}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className={`po-kpi-grid ${gridClass}`}>
      {cards.map((card) => {
        const Icon = card.icon;
        const active = card.key === activeKey;
        const tone = BG_TO_TONE[card.bg] || 'blue';
        return (
          <div
            key={card.key || card.label}
            role={onSelect ? 'button' : undefined}
            tabIndex={onSelect ? 0 : undefined}
            onClick={() => onSelect?.(card.key)}
            onKeyDown={
              onSelect
                ? (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelect(card.key);
                    }
                  }
                : undefined
            }
            className={`po-kpi-card ${active ? 'active' : ''}`}
          >
            <div className={`po-kpi-icon ${tone}`}>
              <Icon aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="po-kpi-count" title={String(card.value ?? '')} style={{ overflowWrap: 'anywhere' }}>{loading ? '—' : card.value}</div>
              <div className="po-kpi-label" title={card.label}>{card.label}</div>
              {card.sub && <div className="po-kpi-sub" title={card.sub}>{card.sub}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
