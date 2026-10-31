/**
 * purchase/components/PurchaseMiniBarChart.jsx
 * ------------------------------------------------------------------
 * Lightweight dependency-free bar chart matching the HTML template's
 * .po-chart-bar system (green gradient fills, 10px value/label).
 * Hover reveals the value via a small tooltip.
 * ------------------------------------------------------------------
 */
import { useMemo } from 'react';

export default function PurchaseMiniBarChart({
  labels = [],
  values = [],
  height = 150,
  valueFormat = (value) => value,
  tone = 'green'
}) {
  const max = useMemo(() => Math.max(...values, 1), [values]);

  return (
    <div className="po-chart-bar" style={{ height }}>
      {values.map((value, index) => {
        const pct = max > 0 ? Math.max(3, (value / max) * 100) : 3;
        return (
          <div key={labels[index] ?? index} className="po-chart-bar-col group relative">
            <span className="hidden group-hover:block absolute -top-1 left-1/2 -translate-x-1/2 -translate-y-full whitespace-nowrap bg-slate-800 text-white text-[10px] font-semibold px-1.5 py-1 rounded-md shadow-md z-10">
              {valueFormat(value)}
            </span>
            <div className={`po-chart-bar-fill ${tone}`} style={{ height: `${pct}%` }} />
            <div className="po-chart-bar-value">{valueFormat(value)}</div>
            <div className="po-chart-bar-label">{labels[index]}</div>
          </div>
        );
      })}
    </div>
  );
}
