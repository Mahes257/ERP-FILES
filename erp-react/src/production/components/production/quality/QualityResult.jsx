import React from 'react';
import ProductionProgress from '../ProductionProgress';
import './QualityResult.css';

/**
 * QC result section. Acceptance and rejection rates are always
 * computed — never entered manually — and zero quantity is handled
 * safely (0%, never NaN/Infinity).
 */
export default function QualityResult({ inspection }) {
  const inspected = Number(inspection.quantityInspected) || 0;
  const accepted = Number(inspection.acceptedQuantity) || 0;
  const rejected = Number(inspection.rejectedQuantity) || 0;

  const acceptanceRate = inspected > 0 ? Math.round((accepted / inspected) * 100) : 0;
  const rejectionRate = inspected > 0 ? Math.round((rejected / inspected) * 100) : 0;

  return (
    <section className="qr-card">
      <div className="qr-head">
        <h3 className="qr-title">QC Result</h3>
        <span className="qr-badge">Calculated</span>
      </div>

      <div className="qr-quantities">
        <div className="qr-qty">
          <span className="qr-label">Quantity Inspected</span>
          <span className="qr-value">{inspected}</span>
        </div>
        <div className="qr-qty qr-qty-accepted">
          <span className="qr-label">Accepted Quantity</span>
          <span className="qr-value">{accepted}</span>
        </div>
        <div className="qr-qty qr-qty-rejected">
          <span className="qr-label">Rejected Quantity</span>
          <span className="qr-value">{rejected}</span>
        </div>
      </div>

      <div className="qr-rates">
        <div className="qr-rate">
          <div className="qr-rate-row">
            <span className="qr-label">Acceptance Rate</span>
            <span className="qr-rate-value qr-accept">{acceptanceRate}%</span>
          </div>
          <ProductionProgress value={acceptanceRate} />
        </div>
        <div className="qr-rate">
          <div className="qr-rate-row">
            <span className="qr-label">Rejection Rate</span>
            <span className="qr-rate-value qr-reject">{rejectionRate}%</span>
          </div>
          <ProductionProgress value={rejectionRate} />
        </div>
      </div>

      {inspected === 0 && (
        <p className="qr-note">No quantity inspected yet — rates will calculate once inspection data is entered.</p>
      )}
    </section>
  );
}
