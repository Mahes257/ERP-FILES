import React from 'react';
import { Link } from 'react-router-dom';
import ProductionStatusBadge from './ProductionStatusBadge';
import { useQuality } from '../../context/QualityContext';
import { formatDate } from '../../utils/format';
import './QualityTab.css';

/**
 * Production Order → Quality tab. Shows the order's quality summary
 * plus the QC inspections recorded against it in the shared Quality
 * module store. Keeps the existing 8-tab structure intact.
 */
export default function QualityTab({ order, quality }) {
  const { inspections } = useQuality();
  const related = (inspections || []).filter(
    (inspection) => inspection.productionOrder === order?.workOrder
  );

  return (
    <div>
      <div className="quality-grid">
        <div className="quality-field">
          <span className="quality-label">Inspection Status</span>
          <ProductionStatusBadge status={quality.inspectionStatus} />
        </div>
        <div className="quality-field">
          <span className="quality-label">Inspector</span>
          <span className="quality-value">{quality.inspector}</span>
        </div>
        <div className="quality-field">
          <span className="quality-label">Inspection Date</span>
          <span className="quality-value">{formatDate(quality.inspectionDate)}</span>
        </div>
        <div className="quality-field">
          <span className="quality-label">Accepted Quantity</span>
          <span className="quality-value">{quality.acceptedQuantity}</span>
        </div>
        <div className="quality-field">
          <span className="quality-label">Rejected Quantity</span>
          <span className="quality-value">{quality.rejectedQuantity}</span>
        </div>
      </div>

      <div className="quality-remarks">
        <span className="quality-label">Remarks</span>
        <p className="quality-remarks-text">{quality.remarks}</p>
      </div>

      <div className="quality-related">
        <h4 className="quality-related-title">Related QC Inspections</h4>
        {related.length > 0 ? (
          <div className="table-scroll">
            {/* Sticky grid (shared Production scope): the leading Inspection ID
                column stays frozen (left: 0) while the columns scroll. */}
            <table className="data-table sgrid sgrid-prod">
              <thead>
                <tr>
                  <th className="sgrid-pin sgrid-first">Inspection ID</th>
                  <th>Type</th>
                  <th>Date</th>
                  <th>Inspector</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {related.map((inspection) => (
                  <tr key={inspection.id}>
                    <td className="cell-strong sgrid-pin sgrid-first">
                      <Link className="po-link" to={`/production/quality/${inspection.id}`}>
                        {inspection.id}
                      </Link>
                    </td>
                    <td>{inspection.inspectionType}</td>
                    <td>{formatDate(inspection.inspectionDate)}</td>
                    <td>{inspection.inspector}</td>
                    <td>
                      <ProductionStatusBadge status={inspection.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="quality-related-empty">
            No QC inspections recorded for this Work Order yet. Inspections created in the
            Quality module will appear here.
          </p>
        )}
      </div>
    </div>
  );
}
