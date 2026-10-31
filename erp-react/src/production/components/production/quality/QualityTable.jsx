import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Icon from '../../icons/Icon';
import ProductionStatusBadge from '../ProductionStatusBadge';
import RowActionsDropdown from '../RowActionsDropdown';
import { formatDate } from '../../../utils/format';
import './QualityTable.css';
// Shared table treatment (min-width + no-wrap cells + row-action buttons) so this
// table renders and overflows exactly like the Packing page's table.
import '../settings/SettingsTable.css';

const QUALITY_COLUMNS = [
  'Inspection ID',
  'Work Order',
  'Order Description',
  'Customer',
  'Department',
  'Inspection Type',
  'Inspection Date',
  'Inspector',
  'Quantity Inspected',
  'Accepted Qty',
  'Rejected Qty',
  'Status',
  'Action',
];

/** Column-driven QC inspection table. */
export default function QualityTable({ inspections, renderActions, onWorkOrderClick, onSelectionChange, knownWorkOrders }) {
  const [selected, setSelected] = useState(() => new Set());

  useEffect(() => {
    setSelected(new Set());
  }, [inspections.length]);

  const inspectionIds = useMemo(() => inspections.map((i) => i.id), [inspections]);
  const allSelected = inspectionIds.length > 0 && inspectionIds.every((id) => selected.has(id));

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
        inspectionIds.forEach((id) => next.delete(id));
      } else {
        inspectionIds.forEach((id) => next.add(id));
      }
      return next;
    });
  }, [allSelected, inspectionIds]);

  useEffect(() => {
    if (onSelectionChange) onSelectionChange([...selected]);
  }, [selected, onSelectionChange]);

  // Sticky-grid wiring (shared Production scope, styles/sticky-data-grid.css):
  // selection column frozen at left: 0, the Inspection ID column frozen beside
  // it and the trailing Action column frozen at right: 0. Offsets come from the
  // shared `.sgrid-prod` scope (mirrors the fixed `.pt-checkbox-col` width).
  const FIRST_KEY = QUALITY_COLUMNS[0];
  const ACTIONS_KEY = 'Action';
  const stickyCellClass = (column) =>
    column === FIRST_KEY ? 'sgrid-pin' : column === ACTIONS_KEY ? 'sgrid-pin-actions' : '';

  const renderCell = (column, inspection) => {
    switch (column) {
      case 'Inspection ID':
        return <td className="cell-strong">{inspection.id}</td>;
      case 'Work Order': {
        // The API exposes the reference as `workOrder`; the form uses
        // `productionOrder` for its own model — accept either.
        const woRef = inspection.productionOrder || inspection.workOrder;
        return (
          <td className="cell-strong">
            {woRef ? (
              (knownWorkOrders ? knownWorkOrders.has(woRef) : true) ? (
                <button
                  type="button"
                  className="po-link"
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#075E54', fontWeight: 600, fontSize: 'inherit' }}
                  onClick={() => onWorkOrderClick(woRef)}
                >
                  {woRef}
                </button>
              ) : (
                <span
                  style={{ color: '#94A3B8', fontSize: 12 }}
                  title="The referenced Work Order does not exist — this inspection is not linked to a valid Work Order"
                >
                  {woRef} <em>(unlinked)</em>
                </span>
              )
            ) : (
              <span style={{ color: '#94A3B8', fontSize: 12 }}>— (no Work Order)</span>
            )}
          </td>
        );
      }
      case 'Order Description':
        return <td>{inspection.product}</td>;
      case 'Customer':
        return <td>{inspection.customer || '—'}</td>;
      case 'Department':
        return <td>{inspection.department}</td>;
      case 'Inspection Type':
        return <td>{inspection.inspectionType}</td>;
      case 'Inspection Date':
        return <td>{formatDate(inspection.inspectionDate)}</td>;
      case 'Inspector':
        return <td>{inspection.inspector}</td>;
      case 'Quantity Inspected':
        return <td>{inspection.quantityInspected}</td>;
      case 'Accepted Qty':
        return <td>{inspection.acceptedQuantity}</td>;
      case 'Rejected Qty':
        return <td>{inspection.rejectedQuantity}</td>;
      case 'Status':
        return (
          <td>
            <ProductionStatusBadge status={inspection.status} />
          </td>
        );
      case 'Action':
        return <td>{renderActions ? renderActions(inspection) : null}</td>;
      default:
        return null;
    }
  };

  return (
    <div className={`table-scroll${selected.size > 0 ? ' has-bulk-bar' : ''}`}>
      <table className="data-table settings-table sgrid sgrid-prod sgrid-cb sgrid-actions">
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
            {QUALITY_COLUMNS.map((column) => (
              <th key={column} className={stickyCellClass(column) || undefined}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {inspections.map((inspection) => (
            <tr key={inspection.id} className={`${selected.has(inspection.id) ? 'is-selected' : ''} kpi-row-${(inspection.status || 'all').toLowerCase().replace(/\s+/g, '-')}`}>
              <td className="pt-checkbox-col sgrid-pin sgrid-first">
                <input
                  type="checkbox"
                  className="pt-checkbox"
                  checked={selected.has(inspection.id)}
                  onChange={() => toggleSelect(inspection.id)}
                  aria-label={`Select ${inspection.id}`}
                />
              </td>
              {QUALITY_COLUMNS.map((column) => {
                const cell = renderCell(column, inspection);
                // Carry the shared sticky classes onto the rendered <td>
                // (first data column frozen left, Action frozen right).
                const sticky = stickyCellClass(column);
                if (!sticky || !React.isValidElement(cell)) return <React.Fragment key={column}>{cell}</React.Fragment>;
                const merged = [cell.props.className, sticky].filter(Boolean).join(' ');
                return <React.Fragment key={column}>{React.cloneElement(cell, { className: merged })}</React.Fragment>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Standard three-dot dropdown actions for a quality row. */
export function QualityRowActions({
  inspection,
  onView,
  onEdit,
  onDelete,
  onPreview,
  canEdit = true,
  canDelete = true
}) {
  const actions = [
    ...(onPreview
      ? [
          {
            label: 'Preview',
            icon: <Icon name="eye" size={13} />,
            onClick: () => onPreview(inspection),
          },
        ]
      : []),
    {
      label: 'View',
      icon: <Icon name="external-link" size={13} />,
      onClick: () => onView(inspection),
    },
    // Access Management: a denied action is left out of the menu entirely.
    ...(onEdit && canEdit
      ? [
          {
            label: 'Edit',
            icon: <Icon name="edit" size={13} />,
            onClick: () => onEdit(inspection),
          },
        ]
      : []),
    ...(onDelete && canDelete
      ? [
          {
            label: 'Delete',
            icon: <Icon name="trash" size={13} />,
            danger: true,
            onClick: () => onDelete(inspection),
          },
        ]
      : []),
  ];

  return <RowActionsDropdown actions={actions} />;
}
