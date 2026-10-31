/**
 * purchase/components/ui/SearchableSelect.jsx
 * ------------------------------------------------------------------
 * Searchable combobox for ERP forms. Accepts a flat list of strings or
 * { value, label } objects, filters as you type, supports keyboard
 * navigation (↑/↓/Enter/Escape) and clear. Designed to be driven by
 * react-hook-form's <Controller> (or plain controlled state).
 * ------------------------------------------------------------------
 */
import { useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import useClickOutside from '../../hooks/useClickOutside';

function toItems(options) {
  if (!Array.isArray(options)) return [];
  return options.map((option) => {
    if (option && typeof option === 'object' && 'value' in option) {
      return { value: String(option.value), label: String(option.label ?? option.value) };
    }
    return { value: String(option), label: String(option) };
  });
}

export default function SearchableSelect({
  value = '',
  onChange,
  options = [],
  placeholder = 'Select...',
  searchable = true,
  clearable = true,
  disabled = false,
  error = false,
  id,
  'aria-label': ariaLabelProp,
  ariaLabel = 'Select option',
  className = ''
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef(null);
  const inputRef = useRef(null);

  const items = useMemo(() => toItems(options), [options]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => item.label.toLowerCase().includes(q));
  }, [items, query]);

  const selected = items.find((item) => item.value === value)
    || (value ? { value, label: value } : null);

  useClickOutside(rootRef, () => setOpen(false), open);

  const openDropdown = () => {
    if (disabled) return;
    setOpen(true);
    setQuery('');
    setHighlight(0);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const select = (item) => {
    onChange?.(item.value);
    setOpen(false);
    setQuery('');
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (open && filtered[highlight]) select(filtered[highlight]);
      else openDropdown();
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const baseBtn =
    'w-full h-9 rounded-md border bg-white px-3 text-[13px] text-slate-700 outline-none transition-colors cursor-pointer ' +
    (error ? 'border-rose-400' : 'border-slate-200 hover:border-slate-300 focus:border-[#0B4A3D]');

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        id={id}
        disabled={disabled}
        onClick={openDropdown}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabelProp || ariaLabel}
        className={`${baseBtn} flex items-center justify-between gap-2 text-left disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        <span className={`truncate ${selected ? 'text-slate-700' : 'text-slate-400'}`}>
          {selected ? selected.label : placeholder}
        </span>
        <span className="flex items-center gap-1 shrink-0">
          {clearable && selected && !disabled && (
            <span
              role="button"
              tabIndex={-1}
              onClick={(e) => {
                e.stopPropagation();
                onChange?.('');
                setQuery('');
              }}
              className="p-0.5 rounded text-slate-400 hover:text-slate-600"
              aria-label="Clear selection"
            >
              <X className="w-3.5 h-3.5" />
            </span>
          )}
          <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden animate-in fade-in zoom-in-95">
          {searchable && (
            <div className="relative border-b border-slate-100">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setHighlight(0);
                }}
                onKeyDown={onKeyDown}
                placeholder="Type to search..."
                aria-label="Search options"
                className="w-full h-9 pl-8 pr-3 text-xs text-slate-700 outline-none placeholder:text-slate-400"
              />
            </div>
          )}
          <ul role="listbox" className="max-h-56 overflow-y-auto py-1">
            {filtered.length === 0 && (
              <li className="px-3 py-6 text-center text-xs text-slate-400">No matching options</li>
            )}
            {filtered.map((item, index) => {
              const isSelected = item.value === value;
              return (
                <li key={item.value} role="option" aria-selected={isSelected}>
                  <button
                    type="button"
                    onClick={() => select(item)}
                    onMouseEnter={() => setHighlight(index)}
                    className={`w-full text-left px-3 py-2 text-xs transition-colors cursor-pointer flex items-center justify-between gap-2 ${
                      highlight === index ? 'bg-[#EDF7F4]' : ''
                    } ${isSelected ? 'font-bold text-[#0B4A3D]' : 'font-medium text-slate-700'}`}
                  >
                    <span className="truncate">{item.label}</span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-[#0B4A3D] shrink-0" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
