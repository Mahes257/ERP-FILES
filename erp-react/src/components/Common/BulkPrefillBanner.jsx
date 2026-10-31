import { createPortal } from 'react-dom';
import { CheckCircle2, RefreshCw, X } from 'lucide-react';

/**
 * BulkPrefillBanner — the pinned banner shown by useBulkPrefill while a Bulk
 * Upload queue is active on a creation form. It reminds the user to review the
 * pre-filled data and click the existing Save button, and offers "Load next
 * record" when more documents were uploaded.
 */
export default function BulkPrefillBanner({ title, fileName, index, total, onNext, onClear }) {
  return createPortal(
    <div
      role="status"
      className="fixed top-16 right-4 z-[2147482900] w-[min(92vw,380px)] bg-surface border border-emerald-200 rounded-xl shadow-xl p-3.5"
    >
      <div className="flex items-start gap-2.5">
        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-slate-800">
            Bulk upload applied — {title}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
            Data from <strong className="text-slate-700">{fileName}</strong> has been filled into
            the form below. Review and correct it, then click the existing{' '}
            <strong className="text-emerald-700">Save</strong> button.
          </p>
          <p className="text-[10px] font-semibold text-slate-400 mt-1">
            Record {index + 1} of {total}
          </p>
        </div>
        <button
          type="button"
          onClick={onClear}
          aria-label="Dismiss bulk upload banner"
          className="p-1 text-slate-400 hover:text-rose-500 transition-colors cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      {onNext && (
        <div className="mt-2.5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onNext}
            className="flex items-center gap-1.5 text-[11px] font-bold text-[#0B4A3D] bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg hover:bg-emerald-100 transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3 h-3" /> Load next record
          </button>
        </div>
      )}
    </div>,
    document.body
  );
}
