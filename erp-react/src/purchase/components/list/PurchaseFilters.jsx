/**
 * purchase/components/list/PurchaseFilters.jsx
 * ------------------------------------------------------------------
 * Shared filter panel (pr-filter-panel / pr-filter-grid / filter-group /
 * filter-label, styled by cpr-list.css), extracted from the Purchase
 * Requisition list and made data-driven. `groups` drives the rendered
 * controls so any list page reuses the same filter UI for its own
 * filter keys.
 *
 * A group:
 *   { key, label, type: 'select' | 'date' | 'text' | 'range',
 *     value, options: [{ value, label }], onChange }
 *
 * type 'text' renders a text input (uses `value`, `placeholder`).
 * type 'range' renders two number inputs wired through
 *   onChange(from, to) using `minValue` / `maxValue`.
 * ------------------------------------------------------------------
 */
import { Search, X } from 'lucide-react';

export default function PurchaseFilters({
  open = false,
  groups = [],
  onApply,
  onReset,
  applyLabel = 'Apply',
  resetLabel = 'Reset',
  panelId
}) {
  return (
    <div className={`pr-filter-panel ${open ? 'show' : ''}`} id={panelId}>
      <div className="pr-filter-grid">
        {groups.map((group, groupIndex) => (
          <div className="filter-group" key={group.key || `group-${groupIndex}`}>
            <label className="filter-label" htmlFor={group.id || group.key}>
              {group.label}
            </label>
            {group.type === 'date' ? (
              <input
                id={group.id || group.key}
                type="date"
                value={group.value || ''}
                onChange={(e) => group.onChange && group.onChange(e.target.value)}
              />
            ) : group.type === 'text' ? (
              <input
                id={group.id || group.key}
                type="text"
                value={group.value || ''}
                placeholder={group.placeholder || ''}
                onChange={(e) => group.onChange && group.onChange(e.target.value)}
              />
            ) : group.type === 'range' ? (
              <div className="filter-range">
                <input
                  type="number"
                  min="0"
                  value={group.minValue || ''}
                  placeholder="Min"
                  onChange={(e) => group.onChange && group.onChange(e.target.value, group.maxValue || '')}
                />
                <span>—</span>
                <input
                  type="number"
                  min="0"
                  value={group.maxValue || ''}
                  placeholder="Max"
                  onChange={(e) => group.onChange && group.onChange(group.minValue || '', e.target.value)}
                />
              </div>
            ) : (
              <select
                id={group.id || group.key}
                value={group.value || 'All'}
                onChange={(e) => group.onChange && group.onChange(e.target.value)}
              >
                {(group.options || []).map((rawOpt, optIndex) => {
                  /* Callers may pass plain strings alongside { value, label }
                     objects (e.g. spread state constants). Normalize so every
                     <option> carries a stable, defined key — an undefined key
                     is exactly what triggers React's "unique 'key' prop"
                     console warning. */
                  const isObj = rawOpt && typeof rawOpt === 'object';
                  const value = String(isObj ? rawOpt.value ?? `opt-${optIndex}` : rawOpt ?? `opt-${optIndex}`);
                  const label = String(isObj && rawOpt.label != null ? rawOpt.label : value);
                  return (
                    <option key={value} value={value}>{label}</option>
                  );
                })}
              </select>
            )}
          </div>
        ))}
        <div className="filter-actions">
          <button type="button" className="btn btn-primary btn-sm" onClick={onApply}>
            <Search size={12} /> {applyLabel}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onReset}>
            <X size={12} /> {resetLabel}
          </button>
        </div>
      </div>
    </div>
  );
}