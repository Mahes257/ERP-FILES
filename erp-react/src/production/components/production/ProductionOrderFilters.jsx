import React from 'react';
import Icon from '../icons/Icon';
import { FILTER_DEPARTMENT_OPTIONS, STAGE_OPTIONS, STATUS_OPTIONS } from '../../data/orders';
import { PRODUCTION_TYPES } from '../../data/entries';
import { cpoNo } from '../../../utils/salesHelpers';
import './ProductionOrderFilters.css';

/**
 * Search box + filters (status / production type / department /
 * current stage / sales order) that combine with the list state in
 * the Orders page. The Sales Order filter is built dynamically from
 * the existing Sales Orders — never hard-coded.
 */
export default function ProductionOrderFilters({
  filters,
  onChange,
  onClear,
  clearVisible,
  searchQuery,
  onSearchChange,
  salesOrderOptions = [],
}) {
  const FILTER_FIELDS = [
    { key: 'status', label: 'Status', options: ['All', ...STATUS_OPTIONS] },
    { key: 'productionType', label: 'Production Type', options: ['All', ...PRODUCTION_TYPES] },
    { key: 'department', label: 'Department', options: ['All', ...FILTER_DEPARTMENT_OPTIONS] },
    { key: 'stage', label: 'Current Stage', options: ['All', ...STAGE_OPTIONS] },
    // Sales Orders ARE Customer Purchase Orders (CPOs) in this ERP — the filter
    // keeps matching on the raw SO number but displays the CPO number.
    { key: 'salesOrder', label: 'CPO', options: ['All', ...salesOrderOptions] },
    {
      key: 'dueDate',
      label: 'Due Date',
      options: ['All', 'Overdue', 'Due This Week', 'Due This Month'],
    },
  ];

  return (
    <div className="filters-bar">
      <div className="filters-selects">
        {FILTER_FIELDS.map((field) => (
          <label key={field.key} className="filter-field">
            <span className="filter-label">{field.label}</span>
            <select
              className="filter-select"
              value={filters[field.key]}
              onChange={(e) => onChange({ ...filters, [field.key]: e.target.value })}
            >
              {field.options.map((option) => (
                <option key={option} value={option}>
                  {field.key === 'salesOrder' && option !== 'All' ? cpoNo(option) : option}
                </option>
              ))}
            </select>
          </label>
        ))}

        {clearVisible && (
          <button type="button" className="btn btn-secondary filter-clear" onClick={onClear}>
            <Icon name="x" size={14} /> Clear Filters
          </button>
        )}
      </div>
    </div>
  );
}
