/**
 * purchase/components/ui/ErrorState.jsx
 * ------------------------------------------------------------------
 * Standardized error display for detail pages and full-page errors.
 * Replaces raw error text with a styled, actionable component.
 * ------------------------------------------------------------------
 */
import { AlertTriangle, RefreshCw, ArrowLeft } from 'lucide-react';

export default function ErrorState({
  icon: Icon = AlertTriangle,
  title = 'Something went wrong',
  message = 'An unexpected error occurred. Please try again.',
  onRetry,
  onBack,
  retryLabel = 'Try Again',
  className = '',
}) {
  return (
    <div className={`flex flex-col items-center justify-center py-16 px-6 text-center ${className}`}>
      <div className="w-12 h-12 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center mb-4">
        <Icon className="w-6 h-6 text-rose-500" aria-hidden="true" />
      </div>
      <h3 className="text-sm font-semibold text-slate-700 mb-1.5">{title}</h3>
      <p className="text-xs text-slate-500 max-w-xs mb-5 leading-relaxed m-0">{message}</p>
      <div className="flex items-center gap-2">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Go Back
          </button>
        )}
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-200 bg-rose-50 text-xs font-semibold text-rose-600 hover:bg-rose-100 transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            {retryLabel}
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * InlineError — compact inline error banner for list/detail pages.
 * Drop-in replacement for the existing cpr-error-banner pattern.
 */
export function InlineError({ message = 'Failed to load data.', onRetry, className = '' }) {
  return (
    <div className={`flex items-center justify-between gap-3 px-4 py-3 rounded-lg border border-rose-200 bg-rose-50 ${className}`} role="alert">
      <div className="flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-rose-500 flex-shrink-0" aria-hidden="true" />
        <p className="text-xs font-semibold text-rose-600 m-0">{message}</p>
      </div>
      {onRetry && (
        <button type="button" onClick={onRetry} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold text-rose-600 border border-rose-200 bg-white hover:bg-rose-50 transition-colors cursor-pointer">
          <RefreshCw className="w-3 h-3" />
          Retry
        </button>
      )}
    </div>
  );
}
