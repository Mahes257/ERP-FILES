/**
 * purchase/components/ui/Accordion.jsx
 * ------------------------------------------------------------------
 * Collapsible enterprise section card (HTML template .purchase-form-card
 * with a toggleable header). Header carries an icon, title, subtitle
 * and a chevron; the body expands/collapses with a smooth grid-rows
 * animation. Children stay mounted while collapsed so form state and
 * focus are preserved.
 * ------------------------------------------------------------------
 */
import { useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';

export default function Accordion({ title, subtitle, icon: Icon, defaultOpen = false, children, action }) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();

  return (
    <div className="pr-accordion purchase-form-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="purchase-form-card-header pr-accordion-header w-full text-left cursor-pointer select-none"
        aria-expanded={open}
        aria-controls={bodyId}
      >
        <div className="flex items-center gap-3 min-w-0">
          {Icon && (
            <span className="flex items-center justify-center w-9 h-9 rounded-[10px] bg-[#E8F0EE] text-[#0A4F44] shrink-0">
              <Icon className="w-4 h-4" />
            </span>
          )}
          <div className="text-left min-w-0">
            <h3 className="truncate">{title}</h3>
            {subtitle && <p className="text-[11.5px] text-slate-400 font-medium mt-0.5 truncate">{subtitle}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {action}
          <ChevronDown
            className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        </div>
      </button>
      <div id={bodyId} className={`pr-accordion-body ${open ? 'is-open' : ''}`}>
        <div className="pr-accordion-inner">
          <div className="purchase-form-card-body">{children}</div>
        </div>
      </div>
    </div>
  );
}
