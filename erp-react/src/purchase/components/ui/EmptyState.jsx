/**
 * purchase/components/ui/EmptyState.jsx
 * ------------------------------------------------------------------
 * Enterprise empty state (HTML template .po-empty): large muted
 * icon, bold title, hint text and an optional action button.
 * ------------------------------------------------------------------
 */
import { Inbox } from 'lucide-react';

/**
 * Enterprise empty state — centered layout with icon, title, message
 * and optional action. Uses po-empty class from design-system.css.
 */
export default function EmptyState({ icon: Icon = Inbox, title = 'Nothing here yet', message, action, className = '' }) {
  return (
    <div className={`flex flex-col items-center justify-center py-16 px-6 text-center ${className}`}>
      <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mb-4">
        <Icon className="w-6 h-6 text-slate-300" aria-hidden="true" />
      </div>
      <h3 className="text-sm font-semibold text-slate-600 mb-1.5">{title}</h3>
      {message && <p className="text-xs text-slate-400 max-w-xs leading-relaxed m-0">{message}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
