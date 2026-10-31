import React, { useState } from 'react';
import Icon from '../icons/Icon';
import { useAcknowledgement } from '../../context/AcknowledgementContext';
import { formatDate, formatDateTime } from '../../utils/format';
import { cpoNo } from '../../../utils/salesHelpers';
import './AcknowledgementSection.css';

/**
 * Acknowledgement section for the Work Order Detail page.
 * Shows the acknowledgement record for a specific Work Order and
 * provides an "Acknowledge" action when status is Pending.
 *
 * Props:
 *  - order: the Work Order object (provides workOrder, salesOrderNumber, etc.)
 */
export default function AcknowledgementSection({ order }) {
  const { getAcknowledgement, saveAcknowledgement } = useAcknowledgement();
  const [remarks, setRemarks] = useState('');
  const [saving, setSaving] = useState(false);

  if (!order) return null;

  const ack = getAcknowledgement(order.workOrder);
  const isAcknowledged = ack?.status === 'Acknowledged';
  const isPending = !ack || ack.status === 'Pending';

  const handleAcknowledge = () => {
    setSaving(true);
    const now = new Date().toISOString();
    const record = {
      workOrderId: order.workOrder,
      workOrderNumber: order.workOrder,
      productionOrderNumber: order.salesOrderNumber || order.workOrder,
      createdDate: ack?.createdDate || now,
      acknowledgedBy: 'Current User',
      acknowledgementDateTime: now,
      status: 'Acknowledged',
      remarks: remarks || ack?.remarks || '',
    };
    saveAcknowledgement(record);
    setRemarks('');
    setSaving(false);
  };

  return (
    <section className="ack-section">
      <div className="ack-section-head">
        <div>
          <h3 className="ack-section-title">Acknowledgement</h3>
          <p className="ack-section-subtitle">
            Work Order acknowledgement — confirms the order has been reviewed and accepted.
          </p>
        </div>
        <span className={`ack-status-badge ${isAcknowledged ? 'ack-status-acknowledged' : 'ack-status-pending'}`}>
          <Icon name={isAcknowledged ? 'check' : 'clock'} size={12} />
          {isAcknowledged ? 'Acknowledged' : 'Pending'}
        </span>
      </div>

      <div className="ack-fields">
        <div className="ack-field">
          <span className="ack-field-label">Work Order Number</span>
          <span className="ack-field-value">{order.workOrder}</span>
        </div>
        <div className="ack-field">
          <span className="ack-field-label">CPO Reference</span>
          <span className="ack-field-value">{cpoNo(order.salesOrderNumber) || '—'}</span>
        </div>
        <div className="ack-field">
          <span className="ack-field-label">Created Date</span>
          <span className="ack-field-value">
            {ack?.createdAt ? formatDateTime(ack.createdAt) : '—'}
          </span>
        </div>
        <div className="ack-field">
          <span className="ack-field-label">Acknowledged By</span>
          <span className={`ack-field-value ${!ack?.acknowlededBy ? 'empty' : ''}`}>
            {ack?.acknowlededBy || (isAcknowledged ? '—' : 'Not yet acknowledged')}
          </span>
        </div>
        <div className="ack-field">
          <span className="ack-field-label">Acknowledgement Date &amp; Time</span>
          <span className={`ack-field-value ${!ack?.acknowledgementDateTime ? 'empty' : ''}`}>
            {ack?.acknowledgementDateTime
              ? formatDateTime(ack.acknowledgementDateTime)
              : isAcknowledged
                ? '—'
                : 'Not yet acknowledged'}
          </span>
        </div>
        <div className="ack-field">
          <span className="ack-field-label">Status</span>
          <span className="ack-field-value">{isAcknowledged ? 'Acknowledged' : 'Pending'}</span>
        </div>
        <div className="ack-field ack-field-wide">
          <span className="ack-field-label">Remarks</span>
          <span className={`ack-field-value ${!ack?.remarks ? 'empty' : ''}`}>
            {ack?.remarks || 'No remarks'}
          </span>
        </div>
      </div>

      {isPending && (
        <div className="ack-actions">
          <label className="ack-field" style={{ flex: 1, marginBottom: 0 }}>
            <span className="ack-field-label">Remarks (optional)</span>
            <textarea
              className="tv-textarea"
              rows={2}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Optional remarks before acknowledging…"
            />
          </label>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleAcknowledge}
            disabled={saving}
          >
            <Icon name="check" size={14} /> Acknowledge
          </button>
        </div>
      )}
    </section>
  );
}
