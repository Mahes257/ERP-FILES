import React from 'react';
import Icon from '../icons/Icon';
import ProductionStatusBadge from './ProductionStatusBadge';
import { useCurrentUser } from '../../../components/Common/CurrentUserContext';
import { cpoNo } from '../../../utils/salesHelpers';
import { formatDate } from '../../utils/format';
import './ApprovalProgressSection.css';

/**
 * Approval workflow stages in sequential order.
 */
const WORKFLOW_STAGES = [
  { key: 'Draft', statusValues: ['Draft'], label: 'Draft', icon: 'file-text' },
  { key: 'Production Approval', statusValues: ['Pending Production Approval', 'Production Approved'], label: 'Production Approval', icon: 'shield' },
  { key: 'Admin Approval', statusValues: ['Pending Admin Approval', 'Admin Approved'], label: 'Admin Approval', icon: 'shield-check' },
  { key: 'Approved', statusValues: ['Approved'], label: 'Approved', icon: 'check-circle' },
];

/**
 * Maps order status to the current workflow stage index.
 * Returns -1 if status doesn't map to any stage.
 */
function getStageIndex(orderStatus) {
  for (let i = 0; i < WORKFLOW_STAGES.length; i++) {
    if (WORKFLOW_STAGES[i].statusValues.includes(orderStatus)) return i;
  }
  return -1;
}

/**
 * Determine whether a stage is completed, current, or future
 * based on the order's current status and the stage index.
 */
function getStageState(orderStatus, stageIdx) {
  const currentIdx = getStageIndex(orderStatus);
  if (currentIdx === -1) return 'future';
  if (stageIdx < currentIdx) return 'completed';
  if (stageIdx === currentIdx) return 'current';
  return 'future';
}

/**
 * Maps workflow stage key to the approval action that should be taken.
 * Returns null if no action is needed (e.g., already Approved or Draft needs form submission).
 */
function getActionForStage(orderStatus) {
  switch (orderStatus) {
    case 'Draft':
      return { label: 'Submit for Production Approval', icon: 'send', nextStatus: 'Pending Production Approval' };
    case 'Pending Production Approval':
      return { label: 'Approve Production', icon: 'check', nextStatus: 'Production Approved' };
    case 'Production Approved':
      return { label: 'Submit to Admin', icon: 'send', nextStatus: 'Pending Admin Approval' };
    case 'Pending Admin Approval':
      return { label: 'Approve Admin', icon: 'check', nextStatus: 'Admin Approved' };
    case 'Admin Approved':
      return { label: 'Final Approve', icon: 'check-circle', nextStatus: 'Approved' };
    case 'Production Rejected':
      return { label: 'Return to Draft', icon: 'rotate-ccw', nextStatus: 'Draft' };
    case 'Admin Rejected':
      return { label: 'Resubmit to Production', icon: 'rotate-ccw', nextStatus: 'Production Approved' };
    default:
      return null;
  }
}

/**
 * Returns a reject/cancel action for statuses where rejection is allowed.
 * Only approval-pending stages can be rejected.
 * Stage-specific: Production Rejected or Admin Rejected (not full Cancelled).
 */
function getRejectActionForStage(orderStatus) {
  switch (orderStatus) {
    case 'Pending Production Approval':
      return { label: 'Reject Production', icon: 'x', rejectStatus: 'Production Rejected' };
    case 'Pending Admin Approval':
      return { label: 'Reject Admin', icon: 'x', rejectStatus: 'Admin Rejected' };
    default:
      return null;
  }
}

/**
 * ApprovalProgressSection
 *
 * Displays the approval workflow pipeline above the Production Orders table.
 * Shows Draft → Production Approval → Admin Approval → Approved
 * with current stage highlighted and an action button for the selected order.
 *
 * If no order is selected, shows a generic "Select a Work Order" message.
 */
export default function ApprovalProgressSection({ selectedOrder, onAdvance, onReject }) {
  const { currentUser, isAdmin } = useCurrentUser();
  const orderStatus = selectedOrder?.status;
  const action = orderStatus ? getActionForStage(orderStatus) : null;
  const rejectAction = orderStatus ? getRejectActionForStage(orderStatus) : null;

  // When fully approved — hide the entire STATUS section
  if (orderStatus === 'Approved') return null;

  // Only Admin users can see the approval action button
  const canApprove = isAdmin;

  return (
    <div className="approval-progress-section">
      <div className="approval-progress-header">
        <h3 className="approval-progress-title">STATUS</h3>
        {selectedOrder && (
          <span className="approval-progress-order-badge">
            {selectedOrder.workOrder}
          </span>
        )}
      </div>

      {!selectedOrder ? (
        <div className="approval-progress-empty">
          <Icon name="mouse-pointer" size={16} />
          <span>Select a Work Order from the table below to view its approval status</span>
        </div>
      ) : (
        <>
          <div className="approval-progress-pipeline">
            {WORKFLOW_STAGES.map((stage, idx) => {
              // Determine if this stage is rejected
              const isProductionRejected = orderStatus === 'Production Rejected' && stage.key === 'Production Approval';
              const isAdminRejected = orderStatus === 'Admin Rejected' && stage.key === 'Admin Approval';
              const isRejected = isProductionRejected || isAdminRejected;
              const isCancelled = orderStatus === 'Cancelled';
              const state = isCancelled ? 'rejected' : isRejected ? 'rejected' : getStageState(orderStatus, idx);
              const isLast = idx === WORKFLOW_STAGES.length - 1;
              return (
                <React.Fragment key={stage.key}>
                  <div className={`approval-stage approval-stage--${state}`}>
                    <div className="approval-stage-icon">
                      {state === 'rejected' ? (
                        <Icon name="x" size={14} />
                      ) : state === 'completed' ? (
                        <Icon name="check" size={14} />
                      ) : (
                        <Icon name={stage.icon} size={14} />
                      )}
                    </div>
                    <span className="approval-stage-label">{stage.label}</span>
                  </div>
                  {!isLast && (
                    <div className={`approval-connector approval-connector--${state === 'completed' ? 'completed' : 'inactive'}`}>
                      <Icon name="arrow-right" size={14} />
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>

          {action && (
            <div className="approval-progress-action">
              {canApprove ? (
                <>
                  <button
                    type="button"
                    className={`approval-action-btn approval-action-btn--${action.nextStatus === 'Approved' ? 'final' : 'primary'}`}
                    onClick={() => onAdvance(selectedOrder)}
                  >
                    <Icon name={action.icon} size={15} />
                    {action.label}
                  </button>
                  {rejectAction && onReject && (
                    <button
                      type="button"
                      className="approval-action-btn approval-action-btn--reject"
                      onClick={() => onReject(selectedOrder)}
                    >
                      <Icon name={rejectAction.icon} size={15} />
                      {rejectAction.label}
                    </button>
                  )}
                </>
              ) : (
                <div className="approval-progress-no-access">
                  <Icon name="lock" size={14} />
                  <span>Only Admin users can approve Work Orders</span>
                </div>
              )}
            </div>
          )}

          {/* ─── Full Work Order Details ─── */}
          <div className="approval-order-details">
            <div className="approval-details-grid">
              <div className="approval-detail-item">
                <span className="approval-detail-label">Work Order</span>
                <span className="approval-detail-value">{selectedOrder.workOrder}</span>
              </div>
              <div className="approval-detail-item">
                <span className="approval-detail-label">CPO Reference</span>
                <span className="approval-detail-value">{cpoNo(selectedOrder.salesOrderNumber) || '—'}</span>
              </div>
              <div className="approval-detail-item">
                <span className="approval-detail-label">Department</span>
                <span className="approval-detail-value">{selectedOrder.department || '—'}</span>
              </div>
              <div className="approval-detail-item">
                <span className="approval-detail-label">Current Stage</span>
                <span className="approval-detail-value">{selectedOrder.currentStage || '—'}</span>
              </div>
              <div className="approval-detail-item">
                <span className="approval-detail-label">Status</span>
                <span className="approval-detail-value">
                  <ProductionStatusBadge status={selectedOrder.status} />
                </span>
              </div>
              <div className="approval-detail-item">
                <span className="approval-detail-label">Progress</span>
                <span className="approval-detail-value">{selectedOrder.progress || 0}%</span>
              </div>
            </div>

            {/* Items List */}
            {selectedOrder.items && selectedOrder.items.length > 0 && (
              <div className="approval-items-section">
                <h4 className="approval-items-title">
                  <Icon name="list" size={14} /> Items ({selectedOrder.items.length})
                </h4>
                <div className="approval-items-table-wrap">
                  <table className="approval-items-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Item Name</th>
                        <th>Item Code</th>
                        <th>Production Type</th>
                        <th>Quantity</th>
                        <th>Item Due Date</th>
                        <th>Pattern / Drawing</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedOrder.items.map((item, idx) => (
                        <tr key={idx}>
                          <td>{idx + 1}</td>
                          <td className="cell-strong">{item.productName || '—'}</td>
                          <td>{item.productCode || '—'}</td>
                          <td>{item.productionType || '—'}</td>
                          <td>{item.quantity || '—'}</td>
                          <td>{item.dueDate ? formatDate(item.dueDate) : '—'}</td>
                          <td>{item.patternNumber || item.drawingNumber || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Approval Info */}
            {(selectedOrder.productionApprovedBy || selectedOrder.adminApprovedBy) && (
              <div className="approval-info-section">
                <h4 className="approval-info-title">
                  <Icon name="shield" size={14} /> Approval Information
                </h4>
                <div className="approval-details-grid">
                  {selectedOrder.productionApprovedBy && (
                    <div className="approval-detail-item">
                      <span className="approval-detail-label">Production Approved By</span>
                      <span className="approval-detail-value">{selectedOrder.productionApprovedBy}</span>
                    </div>
                  )}
                  {selectedOrder.productionApprovedAt && (
                    <div className="approval-detail-item">
                      <span className="approval-detail-label">Production Approved At</span>
                      <span className="approval-detail-value">{new Date(selectedOrder.productionApprovedAt).toLocaleString()}</span>
                    </div>
                  )}
                  {selectedOrder.adminApprovedBy && (
                    <div className="approval-detail-item">
                      <span className="approval-detail-label">Admin Approved By</span>
                      <span className="approval-detail-value">{selectedOrder.adminApprovedBy}</span>
                    </div>
                  )}
                  {selectedOrder.adminApprovedAt && (
                    <div className="approval-detail-item">
                      <span className="approval-detail-label">Admin Approved At</span>
                      <span className="approval-detail-value">{new Date(selectedOrder.adminApprovedAt).toLocaleString()}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
