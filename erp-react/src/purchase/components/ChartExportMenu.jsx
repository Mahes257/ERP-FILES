/**
 * purchase/components/ChartExportMenu.jsx
 * ------------------------------------------------------------------
 * Small dropdown attached to a chart card's action slot: downloads
 * the referenced chart node as a PNG image or a single-page PDF.
 * Closes on outside click and shows a busy state while the chart is
 * being rasterised.
 * ------------------------------------------------------------------
 */
import { useEffect, useRef, useState } from 'react';
import { Download, FileDown, Image } from 'lucide-react';
import { useToast } from './ui';
import { exportNodeAsPdf, exportNodeAsPng } from '../utils/export';

export default function ChartExportMenu({ targetRef, filename = 'chart' }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  const resolveNode = () =>
    typeof targetRef === 'function' ? targetRef() : targetRef?.current || null;

  const toast = useToast();

  const run = async (kind) => {
    const node = resolveNode();
    if (!node) return;
    setBusy(true);
    try {
      if (kind === 'png') await exportNodeAsPng(node, { filename });
      else await exportNodeAsPdf(node, { filename });
    } catch {
      toast?.error?.('Could not export the chart. Please try again.');
    } finally {
      setBusy(false);
      setOpen(false);
    }
  };

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Export ${filename} chart`}
        disabled={busy}
      >
        <Download size={12} />
        {busy ? 'Exporting…' : 'Export Chart'}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-1 min-w-[190px] rounded-lg border border-slate-200 bg-white p-1 shadow-lg dark:border-white/10 dark:bg-[#1f2937]"
        >
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:text-slate-800 dark:hover:bg-white/10"
            onClick={() => run('png')}
          >
            <Image size={13} className="text-slate-400" aria-hidden="true" />
            Download PNG
          </button>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:text-slate-800 dark:hover:bg-white/10"
            onClick={() => run('pdf')}
          >
            <FileDown size={13} className="text-slate-400" aria-hidden="true" />
            Download PDF
          </button>
        </div>
      )}
    </div>
  );
}
