/**
 * purchase/components/ui/PageLoader.jsx
 * ------------------------------------------------------------------
 * Vendored from src/components/Common/PageLoader.jsx and restyled
 * with the enterprise green accent.
 * ------------------------------------------------------------------
 */
import { Loader2 } from 'lucide-react';

export default function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F7F9FA]" role="status" aria-label="Loading">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-6 h-6 animate-spin text-[#0B4A3D]" />
        <span className="text-xs font-semibold text-slate-400 tracking-wide">Loading...</span>
      </div>
    </div>
  );
}
