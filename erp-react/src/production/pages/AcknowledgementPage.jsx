import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import Icon from '../components/icons/Icon';
import { useProductionOrders } from '../context/ProductionOrdersContext';
import { useAcknowledgement } from '../context/AcknowledgementContext';
import { formatDate, formatDateTime } from '../utils/format';
import './AcknowledgementPage.css';

const PAGE_SIZE = 10;

export default function AcknowledgementPage() {
  const navigate = useNavigate();
  const { orders } = useProductionOrders();
  const { acknowledgements, saveAcknowledgement, getAcknowledgement } = useAcknowledgement();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [page, setPage] = useState(1);
  const [expandedWo, setExpandedWo] = useState(null);
  const [remarks, setRemarks] = useState({});

  // Merge Work Orders with their Acknowledgement records
  const rows = useMemo(() => {
    return orders.map((order) => {
      const ack = getAcknowledgement(order.workOrder);
      return {
        order,
        ack,
        status: ack?.status || 'Pending',
        acknowledgedBy: ack?.acknowledgedBy || '',
        acknowledgementDateTime: ack?.acknowledgementDateTime || '',
        remarks: ack?.remarks || '',
      };
    });
  }, [orders, acknowledgements]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return rows.filter((row) => {
      if (q) {
        const searchable = [
          row.order.workOrder,
          row.order.product,
          row.order.salesOrderNumber,
        ].filter(Boolean).join(' ').toLowerCase();
        if (!searchable.includes(q)) return false;
      }
      if (statusFilter !== 'All' && row.status !== statusFilter) return false;
      return true;
    });
  }, [rows, searchQuery, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  if (page > totalPages && totalPages > 0) setPage(totalPages);
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const pendingCount = rows.filter((r) => r.status === 'Pending').length;
  const acknowledgedCount = rows.filter((r) => r.status === 'Acknowledged').length;

  const handleAcknowledge = (workOrderNumber) => {
    const now = new Date().toISOString();
    const row = rows.find((r) => r.order.workOrder === workOrderNumber);
    if (!row) return;
    saveAcknowledgement({
      workOrderId: workOrderNumber,
      workOrderNumber,
      productionOrderNumber: row.order.salesOrderNumber || workOrderNumber,
      createdDate: row.ack?.createdDate || now,
      acknowledgedBy: 'Current User',
      acknowledgementDateTime: now,
      status: 'Acknowledged',
      remarks: remarks[workOrderNumber] || row.ack?.remarks || '',
    });
    setRemarks((prev) => ({ ...prev, [workOrderNumber]: '' }));
  };

  return (
    <div className="page">
      <PageHeader
        title="Acknowledgement"
        subtitle="Review and acknowledge Work Orders before production begins."
      />

      {/* Summary cards */}
      <div className="ack-page-summary">
        <div className={`ack-page-summary-card${statusFilter === 'All' ? ' card-active' : ''}`} onClick={() => { setStatusFilter('All'); setPage(1); }} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setStatusFilter('All'); setPage(1); } }}>
          <span className="ack-page-summary-label">Total</span>
          <span className="ack-page-summary-value">{rows.length}</span>
        </div>
        <div className={`ack-page-summary-card pending-card${statusFilter === 'Pending' ? ' card-active' : ''}`} onClick={() => { setStatusFilter('Pending'); setPage(1); }} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setStatusFilter('Pending'); setPage(1); } }}>
          <span className="ack-page-summary-label">Pending</span>
          <span className="ack-page-summary-value">{pendingCount}</span>
        </div>
        <div className={`ack-page-summary-card completed-card${statusFilter === 'Acknowledged' ? ' card-active' : ''}`} onClick={() => { setStatusFilter('Acknowledged'); setPage(1); }} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setStatusFilter('Acknowledged'); setPage(1); } }}>
          <span className="ack-page-summary-label">Acknowledged</span>
          <span className="ack-page-summary-value">{acknowledgedCount}</span>
        </div>
      </div>

      {/* Search + Filter toolbar */}
      <section className="orders-card">
        <div className="ack-page-toolbar">
          <div className="ack-page-search">
            <Icon name="search" size={14} />
            <input
              type="text"
              placeholder="Search Work Order or Item..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
            />
          </div>
          <select
            className="journey-status-select"
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          >
            {['All', 'Pending', 'Acknowledged'].map((s) => (
              <option key={s} value={s}>{s === 'All' ? 'All statuses' : s}</option>
            ))}
          </select>
        </div>

        {/* Table */}
        <div className="table-scroll">
          {/* Sticky grid (shared Production scope): the Work Order column is
              frozen at left: 0 and Actions at right: 0 while the middle columns
              scroll. */}
          <table className="data-table sgrid sgrid-prod sgrid-actions">
            <thead>
              <tr>
                <th className="sgrid-pin sgrid-first">Work Order</th>
                <th>Sales Order</th>
                <th>Item / Product</th>
                <th>Quantity</th>
                <th>Status</th>
                <th>Acknowledged By</th>
                <th>Date &amp; Time</th>
                <th className="sgrid-pin-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: 24, color: 'var(--color-text-muted)' }}>
                    No Work Orders found.
                  </td>
                </tr>
              )}
              {pageRows.map((row) => {
                const isPending = row.status === 'Pending';
                const isExpanded = expandedWo === row.order.workOrder;
                return (
                  <React.Fragment key={row.order.workOrder}>
                    <tr>
                      <td className="cell-strong sgrid-pin sgrid-first">{row.order.workOrder}</td>
                      <td>{row.order.salesOrderNumber || '—'}</td>
                      <td>{row.order.product || '—'}</td>
                      <td>{row.order.quantity || '—'}</td>
                      <td>
                        <span className={`ack-status-badge ${isPending ? 'ack-status-pending' : 'ack-status-acknowledged'}`}>
                          <Icon name={isPending ? 'clock' : 'check'} size={12} />
                          {row.status}
                        </span>
                      </td>
                      <td>{row.acknowledgedBy || '—'}</td>
                      <td>{row.acknowledgementDateTime ? formatDateTime(row.acknowledgementDateTime) : '—'}</td>
                      <td className="sgrid-pin-actions">
                        {isPending && (
                          <button
                            type="button"
                            className="btn btn-sm btn-primary"
                            onClick={() => setExpandedWo(isExpanded ? null : row.order.workOrder)}
                          >
                            <Icon name="check" size={12} /> Acknowledge
                          </button>
                        )}
                        {!isPending && (
                          <button
                            type="button"
                            className="btn btn-sm btn-secondary"
                            onClick={() => navigate(`/production/orders/${row.order.workOrder}`)}
                          >
                            <Icon name="eye" size={12} /> View
                          </button>
                        )}
                      </td>
                    </tr>
                    {isExpanded && isPending && (
                      <tr className="ack-expand-row">
                        <td colSpan={8}>
                          <div className="ack-expand-panel">
                            <div className="ack-expand-fields">
                              <div className="ack-expand-field">
                                <span className="ack-expand-label">Work Order Number</span>
                                <span className="ack-expand-value">{row.order.workOrder}</span>
                              </div>
                              <div className="ack-expand-field">
                                <span className="ack-expand-label">Sales Order</span>
                                <span className="ack-expand-value">{row.order.salesOrderNumber || '—'}</span>
                              </div>
                              <div className="ack-expand-field">
                                <span className="ack-expand-label">Product</span>
                                <span className="ack-expand-value">{row.order.product || '—'}</span>
                              </div>
                              <div className="ack-expand-field">
                                <span className="ack-expand-label">Quantity</span>
                                <span className="ack-expand-value">{row.order.quantity || '—'}</span>
                              </div>
                              <div className="ack-expand-field">
                                <span className="ack-expand-label">Start Date</span>
                                <span className="ack-expand-value">{formatDate(row.order.startDate) || '—'}</span>
                              </div>
                              <div className="ack-expand-field">
                                <span className="ack-expand-label">Due Date</span>
                                <span className="ack-expand-value">{formatDate(row.order.dueDate) || '—'}</span>
                              </div>
                            </div>
                            <div className="ack-expand-remarks">
                              <label className="ack-expand-remarks-label">
                                <span>Remarks (optional)</span>
                                <textarea
                                  rows={2}
                                  placeholder="Optional remarks before acknowledging..."
                                  value={remarks[row.order.workOrder] || ''}
                                  onChange={(e) => setRemarks((prev) => ({ ...prev, [row.order.workOrder]: e.target.value }))}
                                />
                              </label>
                            </div>
                            <div className="ack-expand-actions">
                              <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={() => setExpandedWo(null)}
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                className="btn btn-primary"
                                onClick={() => {
                                  handleAcknowledge(row.order.workOrder);
                                  navigate('/production/technical-verification');
                                }}
                              >
                                <Icon name="check" size={14} /> Acknowledge
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {filtered.length > PAGE_SIZE && (
          <div className="sf-pagination">
            <span className="sf-pagination-info">
              Showing {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
            </span>
            <div className="sf-pagination-controls">
              <button
                type="button"
                className="btn btn-secondary sf-pagination-btn"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <Icon name="chevron-left" size={13} /> Prev
              </button>
              <span className="sf-pagination-page">Page {page} of {totalPages}</span>
              <button
                type="button"
                className="btn btn-secondary sf-pagination-btn"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next <Icon name="chevron-right" size={13} />
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
