import { X } from 'lucide-react';
import { EditableMasterDropdown } from '../Common';

/**
 * Select options may be plain strings ('Pending') or value/label pairs
 * ({ value: 'extension', label: 'Visit Extension' }) — normalised here so a
 * filter can show friendly labels without changing the underlying value.
 */
const normalizeOptions = (options = []) =>
  options.map((option) =>
    option && typeof option === 'object'
      ? { value: option.value, label: option.label ?? String(option.value) }
      : { value: option, label: String(option) }
  );

export default function SalesFilterPanel({ open, filters, onChange, onReset, fields = [] }) {
  if (!open) return null;

  return (
    <div className="pr-filter-panel show">
      <div className="pr-filter-grid">
      {fields.map((field) => (
        <div key={field.key} className="filter-group">
          <span className="filter-label">{field.label}</span>
          {field.type === 'select' && field.masterKey ? (
            <EditableMasterDropdown
              masterKey={field.masterKey}
              value={filters[field.key] || ''}
              placeholder={field.placeholder || 'All'}
              onChange={(v) => onChange(field.key, v)}
              inputClassName="prm-filter-input"
            />
          ) : field.type === 'select' ? (
            <select
              value={filters[field.key] || ''}
              onChange={(e) => onChange(field.key, e.target.value)}
              className="prm-filter-select"
            >
              <option value="">{field.placeholder || 'All'}</option>
              {normalizeOptions(field.options).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              type={field.type}
              value={filters[field.key] || ''}
              onChange={(e) => onChange(field.key, e.target.value)}
              placeholder={field.placeholder}
              className="prm-filter-input"
            />
          )}
        </div>
      ))}

      <div className="filter-actions">
        <button
          type="button"
          onClick={onReset}
          className="btn btn-ghost btn-sm"
        >
          <X size={14} /> Reset
        </button>
      </div>
      </div>
    </div>
  );
}
