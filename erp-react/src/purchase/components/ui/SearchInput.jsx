/**
 * purchase/components/ui/SearchInput.jsx
 * ------------------------------------------------------------------
 * Debounced-free search input matching the HTML template's
 * .po-search-box. Callers own debouncing via the useDebounce hook.
 * ------------------------------------------------------------------
 */
import { Search, X } from 'lucide-react';

export default function SearchInput({ value, onChange, placeholder = 'Search...', className = '', clearable = true }) {
  return (
    <div className={`po-search-box ${className}`}>
      <Search aria-hidden="true" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
      {clearable && value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
          aria-label="Clear search"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
