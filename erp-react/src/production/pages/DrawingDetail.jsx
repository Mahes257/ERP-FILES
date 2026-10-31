import React, { useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Icon from '../components/icons/Icon';
import { drawingApi } from '../utils/api';
import { useDrawings } from '../context/DrawingsContext';
import { useProductionOrders } from '../context/ProductionOrdersContext';
import './KpiDetailsPage.css';

const formatDateTime = (iso) => {
  if (!iso) return '-';
  try { return new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch { return iso; }
};

/**
 * /production/drawings/:id — Full Drawing detail page
 */
export default function DrawingDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { records: allDrawings, refresh, refreshStats } = useDrawings();
  const { orders } = useProductionOrders();

  const order = useMemo(() => orders.find((o) => o.id === id || o.workOrder === id), [orders, id]);

  const drawings = useMemo(() => {
    if (!order) return [];
    return allDrawings.filter((d) => d.workOrderId === order.workOrder);
  }, [order, allDrawings]);

  /**
   * Verify / reject a drawing.
   *
   * This used to call `saveDrawing({ ...rec, verificationStatus })`, which
   * routes to PUT /drawings/{id}. That endpoint updates metadata only — it
   * ignores verificationStatus entirely — so the buttons did nothing at all
   * (the status stayed Pending). The workflow has its own endpoints, the same
   * ones the drawings list uses.
   */
  const handleVerify = async (rec, status) => {
    try {
      if (status === 'Verified') {
        await drawingApi.verify(rec.id, 'Current User', '');
      } else {
        await drawingApi.reject(rec.id, 'Current User', '');
      }
      await refresh();
      await refreshStats();
    } catch (err) {
      console.error('Failed to update drawing status:', err);
    }
  };

  if (!order) {
    return (
      <div className="kpi-details-page">
        <div className="kpi-details-header">
          <button className="kpi-details-back" onClick={() => navigate(-1)}>
            <Icon name="arrow-left" size={16} /> Back
          </button>
          <h1>Drawing Detail</h1>
        </div>
        <div className="kpi-details-empty">
          <Icon name="search" size={40} />
          <h3>Work Order Not Found</h3>
          <p>No work order found matching "{id}".</p>
        </div>
      </div>
    );
  }

  return (
    <div className="kpi-details-page">
      <div className="kpi-details-header">
        <button className="kpi-details-back" onClick={() => navigate(-1)}>
          <Icon name="arrow-left" size={16} /> Back
        </button>
        <div>
          <h1>Drawings — {order.workOrder}</h1>
          <p className="kpi-details-subtitle">
            Sales Order: {order.salesOrder || 'N/A'} · Type: {order.productionType || 'N/A'}
          </p>
        </div>
      </div>

      <div className="kpi-details-summary">
        <div className="kpi-details-stat">
          <span className="kpi-details-stat-num">{drawings.length}</span>
          <span className="kpi-details-stat-label">Total Drawings</span>
        </div>
        <div className="kpi-details-stat">
          <span className="kpi-details-stat-num">{drawings.filter((d) => d.verificationStatus === 'Verified').length}</span>
          <span className="kpi-details-stat-label">Verified</span>
        </div>
        <div className="kpi-details-stat">
          <span className="kpi-details-stat-num">{drawings.filter((d) => !d.verificationStatus || d.verificationStatus === 'Pending').length}</span>
          <span className="kpi-details-stat-label">Pending</span>
        </div>
        <div className="kpi-details-stat">
          <span className="kpi-details-stat-num">{drawings.filter((d) => d.verificationStatus === 'Rejected').length}</span>
          <span className="kpi-details-stat-label">Rejected</span>
        </div>
      </div>

      <div className="kpi-details-table-wrap">
        <table className="kpi-details-table sgrid sgrid-prod sgrid-actions">
          <thead>
            <tr>
              <th className="sgrid-pin sgrid-first">DRAWING NUMBER</th>
              <th>REVISION</th>
              <th>FILE</th>
              <th>STATUS</th>
              <th>VERIFIED BY</th>
              <th>DATE</th>
              <th className="sgrid-pin-actions">ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {drawings.map((rec) => (
              <tr key={rec.id}>
                <td className="kpi-details-link sgrid-pin sgrid-first">{rec.drawingNumber || '-'}</td>
                <td>{rec.drawingRevision || '-'}</td>
                <td>{rec.fileName || '-'}</td>
                <td>
                  <span className={`kpi-status-badge kpi-status-${(rec.verificationStatus || 'pending').toLowerCase()}`}>
                    {rec.verificationStatus || 'Pending'}
                  </span>
                </td>
                <td>{rec.verifiedBy || '-'}</td>
                <td>{rec.verificationDateTime ? formatDateTime(rec.verificationDateTime) : '-'}</td>
                <td className="sgrid-pin-actions">
                  {(!rec.verificationStatus || rec.verificationStatus === 'Pending') && (
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn btn-primary btn-sm" onClick={() => handleVerify(rec, 'Verified')} style={{ fontSize: 11, padding: '4px 8px' }}>
                        <Icon name="check" size={11} /> Verify
                      </button>
                      <button className="btn btn-danger btn-sm" onClick={() => handleVerify(rec, 'Rejected')} style={{ fontSize: 11, padding: '4px 8px' }}>
                        <Icon name="x" size={11} /> Reject
                      </button>
                    </div>
                  )}
                  {rec.verificationStatus && rec.verificationStatus !== 'Pending' && (
                    <span style={{ fontSize: 11, color: '#64748b' }}>{rec.verificationStatus}</span>
                  )}
                </td>
              </tr>
            ))}
            {drawings.length === 0 && (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: 32, color: '#94A3B8' }}>No drawings found for this work order</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
