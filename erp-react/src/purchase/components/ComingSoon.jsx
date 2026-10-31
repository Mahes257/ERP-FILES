/**
 * purchase/components/ComingSoon.jsx
 * ------------------------------------------------------------------
 * Friendly placeholder for Purchase module routes that are part of
 * the legacy menu but not yet implemented in the self-contained
 * package. Keeps the module fully navigable while it is being built.
 * ------------------------------------------------------------------
 */
import { Construction, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import PurchaseHeader from './PurchaseHeader';

export default function ComingSoon({ crumb = 'Purchase', title = 'Coming Soon', subtitle, backTo = '/purchase/dashboard' }) {
  const navigate = useNavigate();
  return (
    <div className="flex-1 bg-app font-sans antialiased text-slate-800 p-4 sm:p-6 w-full max-w-full min-w-0">
      <PurchaseHeader
        crumb={crumb}
        title={title}
        subtitle={subtitle || 'This module is on the roadmap for the next delivery sprint.'}
        actions={
          <button
            type="button"
            onClick={() => navigate(backTo)}
            className="flex items-center gap-1.5 text-xs font-bold text-slate-600 bg-surface border border-slate-200 px-3 py-2.5 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer select-none"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-slate-400" /> Back
          </button>
        }
      />
      <div className="bg-surface border border-slate-200/80 rounded-xl shadow-sm p-12 text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[#E8F0EE] text-[#0B4A3D] mb-4">
          <Construction className="w-7 h-7" />
        </div>
        <h2 className="text-base font-bold text-slate-800">{title}</h2>
        <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
          {subtitle || 'This module is on the roadmap for the next delivery sprint.'}
        </p>
      </div>
    </div>
  );
}
