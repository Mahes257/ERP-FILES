/**
 * purchase/components/ui/ColumnsDropdown.jsx
 * ------------------------------------------------------------------
 * Column visibility dropdown for Purchase list tables.
 * ------------------------------------------------------------------
 */
import { useState, useRef } from 'react';
import { Columns } from 'lucide-react';
import useClickOutside from '../../hooks/useClickOutside';

export default function ColumnsDropdown({
  columns = [],
  onToggle,
  disabledKeys = ['actions'],
  buttonLabel = 'Columns',
  className = ''
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useClickOutside(ref, () => setOpen(false), open);

  const selectable = columns.filter((col) => !disabledKeys.includes(col.key));
  const hiddenCount = selectable.filter((col) => col.visible === false).length;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((prev) => !prev)}
        className={`flex items-center justify-center gap-1.5 h-8 px-3.5 rounded-lg text-xs font-medium text-slate-600 bg-transparent border border-slate-200 hover:bg-slate-100 hover:border-[#0B4A3D] hover:text-[#0B4A3D] transition-colors cursor-pointer select-none ${className}`}
      >
        <Columns className="w-3.5 h-3.5 text-slate-400" />
        <span>{buttonLabel}</span>
        {hiddenCount > 0 && (
          <span className="bg-[#0B4A3D] text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">{hiddenCount}</span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-56 bg-surface border border-slate-200 rounded-xl shadow-lg py-1 z-50 animate-in fade-in zoom-in-95">
          <div className="px-3 py-2 border-b border-slate-100">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Show / Hide Columns</div>
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {selectable.map((col) => {
              const isVisible = col.visible !== false;
              return (
                <button
                  key={col.key}
                  onClick={() => onToggle?.(col.key)}
                  className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center gap-2.5 transition-colors cursor-pointer"
                >
                  <input
                    type="checkbox"
                    readOnly
                    checked={isVisible}
                    className="w-3.5 h-3.5 rounded border-slate-300 accent-[#0B4A3D] pointer-events-none"
                  />
                  <span className={`text-xs ${isVisible ? 'font-semibold text-slate-700' : 'font-medium text-slate-400'}`}>
                    {col.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
