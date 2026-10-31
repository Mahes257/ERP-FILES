/**
 * purchase/components/ui/Tabs.jsx
 * ------------------------------------------------------------------
 * Vendored from src/components/Common/Tabs.jsx and extended to match
 * the legacy ERP tab systems:
 *
 *   Default (no variant)     – the original underline tabs (blue
 *                              active border) used across the module.
 *   variant="purchase"       – legacy purchase-tab look: 13px green
 *                              underline tab bar with a count pill
 *                              (bg #f1f5f9; active #E8F0EE/#0B4A3D).
 *   variant="segmented"      – legacy segmented-control pill group:
 *                              grey track, white options, active
 *                              option filled #0F5B4C.
 *
 * Each tab object may carry an optional `count` rendered as a pill
 * (purchase variant only), plus an optional `icon` (lucide).
 * ------------------------------------------------------------------
 */
export default function Tabs({ tabs, activeKey, onChange, variant = 'default' }) {
  if (variant === 'segmented') {
    return (
      <div role="tablist" className="inline-flex items-center gap-0.5 p-1 bg-[#f8fafc] border border-slate-200 rounded-[10px] w-fit mb-4 flex-wrap">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = tab.key === activeKey;
          return (
            <button
              key={tab.key}
              role="tab"
              aria-selected={active}
              onClick={() => onChange?.(tab.key)}
              className={`flex items-center gap-1.5 h-9 px-5 rounded-lg text-[13px] transition-all cursor-pointer whitespace-nowrap select-none ${
                active
                  ? 'bg-[#0F5B4C] text-white font-semibold border-2 border-[#0F5B4C] shadow-[0_1px_3px_rgba(0,0,0,0.1)]'
                  : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-100 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              {Icon && <Icon className="w-3.5 h-3.5" />}
              {tab.label}
              {tab.count != null && (
                <span
                  className={`inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full text-[11px] font-semibold ${
                    active ? 'bg-white text-[#0F5B4C]' : 'bg-[#e5e7eb] text-slate-600'
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  // Legacy purchase-tab look (green underline + count pill) — opt in.
  if (variant === 'purchase') {
    return (
      <div role="tablist" className="flex items-center gap-0.5 border-b-2 border-slate-200 overflow-x-auto no-scrollbar mb-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = tab.key === activeKey;
          return (
            <button
              key={tab.key}
              role="tab"
              aria-selected={active}
              onClick={() => onChange?.(tab.key)}
              className={`flex items-center gap-2 px-5 py-2.5 text-[13px] border-b-2 -mb-0.5 transition-colors whitespace-nowrap cursor-pointer select-none ${
                active
                  ? 'border-[#0B4A3D] text-[#0B4A3D] font-semibold'
                  : 'border-transparent text-slate-500 hover:text-[#0A4F44]'
              }`}
            >
              {Icon && <Icon className="w-3.5 h-3.5" />}
              {tab.label}
              {tab.count != null && (
                <span
                  className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                    active ? 'bg-[#E8F0EE] text-[#0B4A3D]' : 'bg-[#f1f5f9] text-slate-500'
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  // Default — HTML template .po-tabs look (green underline + count pill).
  return (
    <div role="tablist" className="po-tabs">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const active = tab.key === activeKey;
        return (
          <button
            key={tab.key}
            role="tab"
            aria-selected={active}
            onClick={() => onChange?.(tab.key)}
            className={`po-tab ${active ? 'active' : ''}`}
          >
            {Icon && <Icon className="w-3.5 h-3.5" />}
            {tab.label}
            {tab.count != null && (
              <span className={`po-tab-count ${active ? '' : ''}`}>{tab.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
