import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

export default function Accordion({ title, subtitle, icon: Icon, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="bg-surface border border-slate-200 rounded-xl shadow-sm overflow-hidden h-full">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="w-full flex items-center justify-between px-4 py-3 cursor-pointer select-none"
      >
        <div className="flex items-center gap-2.5">
          {Icon && (
            <div className="p-1.5 rounded-lg bg-slate-100 text-slate-500 shrink-0">
              <Icon className="w-4 h-4" />
            </div>
          )}
          <div className="text-left">
            <span className="text-sm font-bold text-slate-900">{title}</span>
            {subtitle && <p className="text-[11px] text-slate-400 font-medium mt-0.5">{subtitle}</p>}
          </div>
        </div>
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}
