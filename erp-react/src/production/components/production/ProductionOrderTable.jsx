import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import ProductionStatusBadge from './ProductionStatusBadge';
import ProductionProgress from './ProductionProgress';
import RowActionsDropdown from './RowActionsDropdown';
import { formatDate } from '../../utils/format';
import { cpoDisplay, unlinkedCpoNumber } from '../../utils/cpoRef';
import './ProductionOrderTable.css';

const DEFAULT_COLUMNS = [
  'Work Order',
  'CPO Reference',
  'Items',
  'Order Description',
  'Production Type',
  'Quantity',
  'Current Stage',
  'Status',
  'Progress',
  'Action',
];

/**
 * Shared ERP table for production orders. Fully column-driven:
 * pass the column list and a per-row action renderer; the default
 * "Action" column renders a three-dot dropdown menu.
 */
export default function ProductionOrderTable({
  orders,
  columns = DEFAULT_COLUMNS,
  title = 'Active Work Orders',
  subtitle = 'Jobs currently in production across departments.',
  headerAction,
  renderActions,
  onRowClick,
  selectedRowId,
  onSelectionChange,
}) {
  const navigate = useNavigate();
  const [selected, setSelected] = useState(() => new Set());

  // Clear selection when orders change
  useEffect(() => {
    setSelected(new Set());
  }, [orders.length]);

  const toggleSelect = useCallback((id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const orderIds = useMemo(() => orders.map((o) => o.id), [orders]);
  const allSelected = orderIds.length > 0 && orderIds.every((id) => selected.has(id));

  // Sticky-grid wiring (shared Production scope, styles/sticky-data-grid.css):
  // the selection column is frozen at left: 0, the FIRST data column is frozen
  // right beside it and the trailing Actions column is frozen at right: 0.
  // The offsets come from the shared `.sgrid-prod` scope, which mirrors the
  // fixed `.pt-checkbox-col` width — nothing is measured or hardcoded here.
  const firstColumn = columns[0];
  const actionsColumn = columns.find((c) => c === 'Action' || c === 'Actions') || null;
  const stickyHeaderClass = (column) => {
    if (column === firstColumn) return ' sgrid-pin';
    if (actionsColumn && column === actionsColumn) return ' sgrid-pin-actions';
    return '';
  };

  const toggleSelectAll = useCallback(() => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        orderIds.forEach((id) => next.delete(id));
      } else {
        orderIds.forEach((id) => next.add(id));
      }
      return next;
    });
  }, [allSelected, orderIds]);

  useEffect(() => {
    if (onSelectionChange) onSelectionChange([...selected]);
  }, [selected, onSelectionChange]);

  /** Get aggregated or first-item data for backward compatibility */
  const getOrderItems = (order) => order.items || [];
  const getItemCount = (order) => getOrderItems(order).length;
  const getTotalQuantity = (order) =>
    getOrderItems(order).reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
  const getFirstItem = (order) => getOrderItems(order)[0] || {};
  const getProductionTypes = (order) => {
    const types = [...new Set(getOrderItems(order).map((i) => i.productionType).filter(Boolean))];
    return types.join(', ') || '—';
  };
  const getItemNames = (order) => {
    const names = getOrderItems(order).map((i) => i.productName).filter(Boolean);
    if (names.length <= 2) return names.join(', ') || '—';
    return `${names[0]}, ${names[1]} +${names.length - 2} more`;
  };

  const renderCell = (column, order) => {
    switch (column) {
      case 'Work Order':
        return (
          <td className="cell-strong">
            {/* Existing detail route (productionRoutes: "orders/:id" →
                ProductionOrderDetail). stopPropagation so opening the Work Order
                does not also trigger the row click that selects the order for
                the Approval/Status panel below the header. */}
            <Link
              className="wo-detail-link"
              to={`/production/orders/${order.workOrder}`}
              onClick={(event) => event.stopPropagation()}
            >
              {order.workOrder}
            </Link>
            {order.status === 'Approved' && (
              <span className="wo-approved-tick" title="Approved">
                ✓
              </span>
            )}
          </td>
        );
      case 'Order Description':
        return <td title={getOrderItems(order).map((i) => i.productName).join(', ')}>{getItemNames(order)}</td>;
      case 'Production Type':
        return <td>{getProductionTypes(order)}</td>;
      case 'Pattern / Drawing':
        return <td>{getFirstItem(order).patternNumber || getFirstItem(order).drawingNumber || '—'}</td>;
      case 'CPO Reference':
        return (
          <td>
            {cpoDisplay(order) ? (
              <span className="cpo-linked" title="Linked to a real Customer Purchase Order in the Sales module">
                {cpoDisplay(order)}
              </span>
            ) : unlinkedCpoNumber(order) ? (
              <span
                className="cell-muted"
                title="The referenced Sales Order does not exist — this Work Order is not linked to a valid CPO"
              >
                {unlinkedCpoNumber(order)} <em>(not linked)</em>
              </span>
            ) : (
              '—'
            )}
          </td>
        );
      case 'Items':
        return (
          <td>
            <span className="wo-item-count-badge">{getItemCount(order)}</span>
          </td>
        );
      case 'Quantity':
        return <td>{getTotalQuantity(order)}</td>;
      case 'Completed Qty':
        return (
          <td>
            {getOrderItems(order).reduce(
              (sum, item) => sum + Math.round((Number(item.quantity) || 0) * ((order.progress || 0) / 100)),
              0
            )}
          </td>
        );
      case 'Pending Qty': {
        const total = getTotalQuantity(order);
        const completed = getOrderItems(order).reduce(
          (sum, item) => sum + Math.round((Number(item.quantity) || 0) * ((order.progress || 0) / 100)),
          0
        );
        const pending = total - completed;
        return <td className={pending > 0 ? 'cell-muted' : ''}>{pending}</td>;
      }
      case 'Start Date':
        return <td>{formatDate(order.startDate)}</td>;
      case 'Due Date':
        return <td>{formatDate(order.dueDate)}</td>;
      case 'Current Stage':
        return <td>{order.currentStage}</td>;
      case 'Status':
        return (
          <td>
            <ProductionStatusBadge status={order.status} />
          </td>
        );
      case 'Progress':
        return (
          <td>
            <ProductionProgress value={order.progress} />
          </td>
        );
      case 'Action':
      case 'Actions':
        return <td>{renderActions ? renderActions(order) : null}</td>;
      default:
        return null;
    }
  };

  return (
    <section className="orders-card">
      {title && (
        <div className="orders-head">
          <div>
            <h3 className="orders-title">{title}</h3>
            {subtitle && <p className="orders-subtitle">{subtitle}</p>}
          </div>
          {headerAction}
        </div>
      )}

      <div className={`table-scroll${selected.size > 0 ? ' has-bulk-bar' : ''}`}>
        <table className="data-table sgrid sgrid-prod sgrid-cb sgrid-actions">
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
                <th key={column} className={stickyHeaderClass(column).trim() || undefined}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr
                key={order.id}
                className={`${onRowClick ? `clickable-row${selectedRowId === order.id ? ' selected-row' : ''}` : ''}${selected.has(order.id) ? ' is-selected' : ''} kpi-row-${(order.status || 'all').toLowerCase().replace(/\s+/g, '-')}`}
                onClick={onRowClick ? () => onRowClick(order) : undefined}
                style={onRowClick ? { cursor: 'pointer' } : undefined}
              >
                <td className="pt-checkbox-col sgrid-pin sgrid-first" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    className="pt-checkbox"
                    checked={selected.has(order.id)}
                    onChange={() => toggleSelect(order.id)}
                    aria-label={`Select ${order.workOrder}`}
                  />
                </td>
                {columns.map((column) => {
                  const cell = renderCell(column, order);
                  // Freeze the FIRST data column and the trailing Actions cell
                  // by carrying the shared sticky classes onto the rendered <td>.
                  const sticky =
                    column === firstColumn ? 'sgrid-pin'
                      : actionsColumn && column === actionsColumn ? 'sgrid-pin-actions'
                        : '';
                  if (!sticky || !React.isValidElement(cell)) return <React.Fragment key={column}>{cell}</React.Fragment>;
                  const merged = [cell.props.className, sticky].filter(Boolean).join(' ');
                  return <React.Fragment key={column}>{React.cloneElement(cell, { className: merged })}</React.Fragment>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
