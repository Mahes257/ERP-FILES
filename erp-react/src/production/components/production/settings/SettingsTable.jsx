import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Icon from '../../icons/Icon';
import ProductionStatusBadge from '../ProductionStatusBadge';
import RowActionsDropdown from '../RowActionsDropdown';
import './SettingsTable.css';

/**
 * Generic column-driven ERP table for settings masters + Packing/Dispatch.
 * `columns`: [{ key, label, render(row) }] — render returns <td>.
 * `renderActions` renders the trailing action cell when provided.
 * `statusKey` renders a ProductionStatusBadge for that field when set.
 * `onSelectionChange` — called with array of selected row IDs when selection changes.
 */
export default function SettingsTable({ columns, rows, renderActions, statusKey, rowKey = 'id', extra, onSelectionChange }) {
  const [selected, setSelected] = useState(() => new Set());

  // Clear selection when rows change
  useEffect(() => {
    setSelected(new Set());
  }, [rows.length]);

  const rowIds = useMemo(() => rows.map((r) => r[rowKey] ?? r.key), [rows, rowKey]);
  const allSelected = rowIds.length > 0 && rowIds.every((id) => selected.has(id));

  const toggleSelect = useCallback((id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        rowIds.forEach((id) => next.delete(id));
      } else {
        rowIds.forEach((id) => next.add(id));
      }
      return next;
    });
  }, [allSelected, rowIds]);

  useEffect(() => {
    if (onSelectionChange) onSelectionChange([...selected]);
  }, [selected, onSelectionChange]);

  // Sticky-grid wiring (shared Production scope, styles/sticky-data-grid.css):
  // selection column frozen at left: 0, the FIRST data column frozen beside it,
  // and the trailing Actions column frozen at right: 0 when this table has one.
  // Offsets come from the shared `.sgrid-prod` scope (it mirrors the fixed
  // `.pt-checkbox-col` width), so nothing is measured or hardcoded here.
  const firstColumnKey = columns[0]?.key;

  return (
    <div className={`table-scroll${selected.size > 0 ? ' has-bulk-bar' : ''}`}>
      <table
        className={`data-table settings-table sgrid sgrid-prod sgrid-cb${renderActions ? ' sgrid-actions' : ''}`}
      >
        <thead>
          <tr>
            <th className="pt-checkbox-col sgrid-pin sgrid-first">
              <input
                type="checkbox"
                className="pt-checkbox"
                checked={allSelected}
                onChange={toggleSelectAll}
                aria-label="Select all"
              />
            </th>
            {columns.map((column) => (
              <th
                key={column.key}
                className={column.key === firstColumnKey ? 'sgrid-pin' : undefined}
              >
                {column.label}
              </th>
            ))}
            {renderActions && <th className="sgrid-pin-actions">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const id = row[rowKey] ?? row.key;
            return (
              <tr key={id} className={`${selected.has(id) ? 'is-selected' : ''} kpi-row-${(row.status || 'all').toLowerCase().replace(/\s+/g, '-')}`}>
                <td className="pt-checkbox-col sgrid-pin sgrid-first">
                  <input
                    type="checkbox"
                    className="pt-checkbox"
                    checked={selected.has(id)}
                    onChange={() => toggleSelect(id)}
                    aria-label={`Select ${id}`}
                  />
                </td>
                {columns.map((column) => {
                  const cell = column.render
                    ? column.render(row, extra)
                    : column.statusKey
                      ? (
                        <td>
                          <ProductionStatusBadge status={row[column.statusKey]} />
                        </td>
                      )
                      : <td>{row[column.key]}</td>;
                  // Freeze the FIRST data column by carrying the shared sticky
                  // class onto whichever <td> the column renderer produced.
                  if (column.key !== firstColumnKey || !React.isValidElement(cell)) {
                    return <React.Fragment key={column.key}>{cell}</React.Fragment>;
                  }
                  const merged = [cell.props.className, 'sgrid-pin'].filter(Boolean).join(' ');
                  return <React.Fragment key={column.key}>{React.cloneElement(cell, { className: merged })}</React.Fragment>;
                })}
                {renderActions && <td className="sgrid-pin-actions">{renderActions(row)}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Three-dot dropdown menu wrapper for settings row actions.
 * Wraps the existing View/Edit/Delete actions into a RowActionsDropdown.
 */
export function SettingsRowActions({
  item,
  labels,
  onView,
  onPreview,
  onEdit,
  onDelete,
  canEdit = true,
  canDelete = true
}) {
  const label = labels?.singular || 'record';
  const name = labels?.name ? item[labels.name] : item.id;

  const actions = [
    // Read-only preview (provided by record-level Production lists such as
    // Packing). Settings pages do not pass it, so their menus are unchanged.
    ...(onPreview
      ? [
          {
            label: 'Preview',
            icon: <Icon name="eye" size={13} />,
            onClick: () => onPreview(item),
          },
        ]
      : []),
    {
      label: `View`,
      icon: <Icon name="eye" size={13} />,
      onClick: () => onView(item),
    },
    // Access Management: settings.edit / settings.delete. A denied action is
    // left out of the menu entirely — the backend rejects the write anyway.
    ...(onEdit && canEdit
      ? [
          {
            label: `Edit`,
            icon: <Icon name="edit" size={13} />,
            onClick: () => onEdit(item),
          },
        ]
      : []),
    ...(onDelete && canDelete
      ? [
          {
            label: `Delete`,
            icon: <Icon name="trash" size={13} />,
            danger: true,
            onClick: () => onDelete(item),
          },
        ]
      : []),
  ];

  return <RowActionsDropdown actions={actions} />;
}
