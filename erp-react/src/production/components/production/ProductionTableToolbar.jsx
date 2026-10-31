import React from 'react';
import Icon from '../icons/Icon';
import './ProductionTableToolbar.css';

/**
 * Standardized table toolbar — matches Purchase RFQ toolbar pattern.
 *
 * LEFT:  [Show Filters] [Refresh]
 * RIGHT: [Search...] [Export ▼] [Columns] [Showing X–Y of Z]
 *
 * All props are optional so each page can use only what it needs.
 */
export default function ProductionTableToolbar({
  // Show Filters
  showFilters = false,
  onToggleFilters,
  filtersActive = false,
  // Refresh
  onRefresh,
  // Search
  searchPlaceholder = 'Search...',
  searchQuery = '',
  onSearchChange,
  // Export
  onExport,
  // Columns
  onToggleColumns,
  // Record count
  totalRecords = 0,
  pageStart = 0,
  pageEnd = 0,
  // Extra right-side buttons (e.g., Create)
  rightExtra,
  // Extra left-side buttons
  leftExtra,
}) {
  return (
    <div className="pt-toolbar">
      {/* LEFT SIDE */}
      <div className="pt-toolbar-left">
        {onToggleFilters && (
          <button
            type="button"
            className={`pt-toolbar-btn ${filtersActive ? 'active' : ''}`}
            onClick={onToggleFilters}
            title="Show or hide filters"
          >
            <Icon name="filter" size={14} />
            <span>Show Filters</span>
          </button>
        )}

        {onRefresh && (
          <button
            type="button"
            className="pt-toolbar-btn"
            onClick={onRefresh}
            title="Refresh data"
          >
            <Icon name="refresh-cw" size={14} />
            <span>Refresh</span>
          </button>
        )}

        {leftExtra}
      </div>

      {/* RIGHT SIDE */}
      <div className="pt-toolbar-right">
        {onSearchChange && (
          <div className="pt-toolbar-search">
            <Icon name="search" size={14} />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder}
              aria-label="Search"
            />
          </div>
        )}

        {totalRecords > 0 && (
          <span className="pt-toolbar-count">
            Showing {pageStart}–{pageEnd} of {totalRecords}
          </span>
        )}

        {onExport && (
          <button
            type="button"
            className="pt-toolbar-btn"
            onClick={onExport}
            title="Export data"
          >
            <Icon name="download" size={14} />
            <span>Export</span>
            <Icon name="chevron-down" size={11} />
          </button>
        )}

        {onToggleColumns && (
          <button
            type="button"
            className="pt-toolbar-btn"
            onClick={onToggleColumns}
            title="Toggle columns"
          >
            <Icon name="columns" size={14} />
            <span>Columns</span>
          </button>
        )}

        {rightExtra}
      </div>
    </div>
  );
}
