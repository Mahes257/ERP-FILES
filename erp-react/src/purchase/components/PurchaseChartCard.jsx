/**
 * purchase/components/PurchaseChartCard.jsx
 * ------------------------------------------------------------------
 * Shared chart container for the Purchase module. Wraps any chart
 * body in the standard section card and adds the enterprise chart
 * capabilities every report/dashboard page reuses:
 *
 *   - loading skeleton while data is being fetched
 *   - empty state (icon + title + message) when there is no data
 *   - optional legend row (swatch + label pairs)
 *   - tooltip slot (host renders its own hover tooltip)
 *   - export menu: PNG download, PDF download (one-page landscape)
 *   - responsive: the chart body fills the card width
 *
 * Uses the shared export pipeline in utils/export.js, so exports are
 * pixel-identical to what is on screen.
 * ------------------------------------------------------------------
 */
import { useRef, useState } from 'react';
import { ChartBarStacked, ImageDown, FileDown, Loader2 } from 'lucide-react';
import PurchaseSectionCard from './PurchaseSectionCard';
import useClickOutside from '../hooks/useClickOutside';
import { exportNodeAsPng, exportNodeAsPdf } from '../utils/export';

export default function PurchaseChartCard({
  title,
  subtitle,
  action,
  icon: HeaderIcon,
  loading = false,
  empty = false,
  emptyIcon: EmptyIcon,
  emptyTitle = 'No data available',
  emptyMessage = 'There is no data to display for the selected range yet.',
  height = 'auto',
  skeletonHeight = 'h-44',
  legend = [],
  exportFilename = 'chart',
  exportable = true,
  className = '',
  bodyClassName = '',
  children
}) {
  const bodyRef = useRef(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const exportRef = useRef(null);

  useClickOutside(exportRef, () => setExportOpen(false), exportOpen);

  const runExport = async (kind) => {
    setExportOpen(false);
    const node = bodyRef.current;
    if (!node) return;
    setBusy(true);
    try {
      if (kind === 'png') await exportNodeAsPng(node, { filename: exportFilename });
      else await exportNodeAsPdf(node, { filename: exportFilename });
    } catch (err) {
      /* silently ignore export failures (offline rasterisation) */
      console.error('Chart export failed:', err);
    } finally {
      setBusy(false);
    }
  };

  const exportMenu = exportable ? (
    <div className="relative" ref={exportRef}>
      <button
        type="button"
        onClick={() => setExportOpen((prev) => !prev)}
        disabled={busy || loading || empty}
        className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold text-[#0B4A3D] bg-transparent border-[1.5px] border-[#0B4A3D] hover:bg-[#0B4A3D] hover:text-white transition-colors cursor-pointer select-none disabled:opacity-40 disabled:cursor-not-allowed"
        aria-haspopup="menu"
        aria-expanded={exportOpen}
      >
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImageDown className="w-3.5 h-3.5" />} Export
      </button>
      {exportOpen && (
        <div className="absolute right-0 top-full mt-2 w-48 bg-surface border border-slate-200 rounded-xl shadow-lg py-1 z-50 animate-in fade-in zoom-in-95" role="menu">
          <button
            type="button"
            onClick={() => runExport('png')}
            className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center gap-2 text-xs font-semibold text-slate-700 transition-colors cursor-pointer"
          >
            <ImageDown className="w-3.5 h-3.5 text-slate-400" /> Download PNG
          </button>
          <button
            type="button"
            onClick={() => runExport('pdf')}
            className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center gap-2 text-xs font-semibold text-slate-700 transition-colors cursor-pointer"
          >
            <FileDown className="w-3.5 h-3.5 text-slate-400" /> Download PDF
          </button>
        </div>
      )}
    </div>
  ) : null;

  return (
    <PurchaseSectionCard
      title={title}
      subtitle={subtitle}
      icon={HeaderIcon}
      className={className}
      action={
        <>
          {action}
          {exportMenu}
        </>
      }
    >
      <div
        ref={bodyRef}
        className={`w-full ${bodyClassName}`}
        style={height && height !== 'auto' ? { height } : undefined}
      >
        {loading ? (
          <div className={`${skeletonHeight} w-full bg-slate-100 rounded-lg animate-pulse`} role="status" aria-label="Loading chart" />
        ) : empty ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <span className="p-3 rounded-xl bg-slate-100 text-slate-400">
              {EmptyIcon ? <EmptyIcon size={28} aria-hidden="true" /> : <ChartBarStacked size={28} aria-hidden="true" />}
            </span>
            <p className="mt-3 text-sm font-bold text-slate-700">{emptyTitle}</p>
            {emptyMessage && <p className="mt-1 text-xs text-slate-500 max-w-xs">{emptyMessage}</p>}
          </div>
        ) : (
          children
        )}
      </div>
      {legend.length > 0 && !loading && !empty && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-3 pt-3 border-t border-slate-100">
          {legend.map((item) => (
            <span key={item.label} className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-600">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: item.color }} aria-hidden="true" />
              {item.label}
            </span>
          ))}
        </div>
      )}
    </PurchaseSectionCard>
  );
}
