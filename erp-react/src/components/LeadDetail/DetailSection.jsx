import { AlertTriangle, RefreshCw, Inbox } from 'lucide-react';

export default function DetailSection({
  loading = false,
  error = null,
  isFallback = false,
  onRetry,
  count = 0,
  emptyMessage = 'No records found.',
  children
}) {
  if (loading) {
    return (
      <div className="space-y-3 py-1">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="flex items-start gap-3 animate-pulse">
            <div className="w-8 h-8 rounded-lg bg-slate-200 shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-3 bg-slate-200 rounded w-1/3" />
              <div className="h-2.5 bg-slate-100 rounded w-2/3" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error && count === 0) {
    return (
      <div className="py-10 text-center flex flex-col items-center gap-3">
        <AlertTriangle className="w-8 h-8 text-rose-300" />
        <p className="text-xs font-semibold text-slate-500">{error?.message || 'Failed to load data.'}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="flex items-center gap-1.5 text-xs font-bold text-white bg-[#0B4A3D] hover:bg-[#083D34] px-3 py-2 rounded-lg transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Retry
          </button>
        )}
      </div>
    );
  }

  if (count === 0) {
    return (
      <div className="py-10 text-center flex flex-col items-center gap-2">
        <Inbox className="w-7 h-7 text-slate-300" />
        <p className="text-xs font-medium text-slate-400">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <>
      {isFallback && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3 flex items-center justify-between gap-2">
          <span className="text-[11px] font-semibold text-amber-700">
            Server unreachable — showing cached data.
          </span>
          {onRetry && (
            <button
              onClick={onRetry}
              className="flex items-center gap-1 text-[11px] font-bold text-amber-800 bg-amber-100 hover:bg-amber-200 px-2 py-1 rounded-md transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" /> Retry
            </button>
          )}
        </div>
      )}
      {children}
    </>
  );
}
