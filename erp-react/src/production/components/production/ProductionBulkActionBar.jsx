import React from 'react';
import Icon from '../icons/Icon';
import './ProductionBulkActionBar.css';

/**
 * Bulk action bar shown above the table when rows are selected.
 *
 * Props:
 *   count: number of selected rows
 *   onExport: optional callback
 *   onArchive: optional callback
 *   onDelete: optional callback
 *   customActions: Array<{ label, onClick, icon?, danger? }> — page-specific bulk actions
 */
export default function ProductionBulkActionBar({
  count = 0,
  onExport,
  onArchive,
  onDelete,
  customActions = [],
}) {
  if (count === 0) return null;

  return (
    <div className="pt-bulk-bar">
      <span className="pt-bulk-count">{count} selected</span>
      <div className="pt-bulk-actions">
        {customActions.map((action, i) => (
          <button
            key={i}
            type="button"
            className="pt-bulk-btn"
            onClick={action.onClick}
          >
            {action.icon && <Icon name={action.icon} size={13} />}
            {action.label}
          </button>
        ))}
        {onExport && (
          <button type="button" className="pt-bulk-btn" onClick={onExport}>
            <Icon name="download" size={13} /> Export
          </button>
        )}
        {onArchive && (
          <button type="button" className="pt-bulk-btn" onClick={onArchive}>
            <Icon name="archive" size={13} /> Archive
          </button>
        )}
        {onDelete && (
          <button type="button" className="pt-bulk-btn pt-bulk-btn-danger" onClick={onDelete}>
            <Icon name="trash" size={13} /> Delete
          </button>
        )}
      </div>
    </div>
  );
}
