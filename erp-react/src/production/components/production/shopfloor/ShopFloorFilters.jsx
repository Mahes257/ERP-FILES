import React from 'react';
import Icon from '../../icons/Icon';
import './ShopFloorFilters.css';

/**
 * Search + filter toolbar for shop floor pages.
 * `fields`: [{ key, label, options }] — filters are exact matches.
 */
export default function ShopFloorFilters({
  searchPlaceholder = 'Search...',
  searchQuery,
  onSearchChange,
  fields,
  filters,
  onChange,
  onClear,
  clearVisible,
  ariaLabel = 'Search shop floor jobs',
  dateField,
}) {
  return (
    <div className="sf-filters-bar">
      <div className="sf-filters-selects">
        {dateField && (
          <label className="sf-filter-field">
            <span className="sf-filter-label">{dateField.label}</span>
            <input
              type="date"
              className="sf-filter-select"
              value={filters[dateField.key] || ''}
              onChange={(e) => onChange({ ...filters, [dateField.key]: e.target.value })}
            />
          </label>
        )}

        {fields.map((field) => (
          <label key={field.key} className="sf-filter-field">
            <span className="sf-filter-label">{field.label}</span>
            <select
              className="sf-filter-select"
              value={filters[field.key]}
              onChange={(e) => onChange({ ...filters, [field.key]: e.target.value })}
            >
              {field.options.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        ))}

        {clearVisible && (
          <button type="button" className="btn btn-secondary sf-filter-clear" onClick={onClear}>
            <Icon name="x" size={14} /> Clear Filters
          </button>
        )}
      </div>
    </div>
  );
}
