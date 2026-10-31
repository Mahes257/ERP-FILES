import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Icon from '../components/icons/Icon';
import ProductionStatusBadge from '../components/production/ProductionStatusBadge';
import ProductionProgress from '../components/production/ProductionProgress';
import ProductionOrderTabs from '../components/production/ProductionOrderTabs';
import ActionFeedback from '../components/production/ActionFeedback';
import { useProductionOrders } from '../context/ProductionOrdersContext';
import { useSalesOrders } from '../context/SalesOrdersContext';
import { useDispatch } from '../context/DispatchContext';
import { useProductionEntry } from '../context/ProductionEntryContext';
import { useAcknowledgement } from '../context/AcknowledgementContext';
import { useTechnicalVerification } from '../context/TechnicalVerificationContext';
import { salesOrderItem, salesOrderItemStatus, ordersForItem } from '../data/salesOrders';
import {
  workflowForType,
  productionTypeOf,
  pendingQuantity,
  overallStatusFor,
  currentStageFor,
  progressFor,
} from '../data/entries';
import { formatDate } from '../utils/format';
import { cpoDisplay, isLinkedCpo, unlinkedCpoNumber } from '../utils/cpoRef';
import './ProductionOrderDetail.css';

/**
 * /production/orders/:id — full production order detail screen
 * with the 8 roadmap tabs.
 */
export default function ProductionOrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { orders, getOrder, transitionOrderStatus, loading: ordersLoading } = useProductionOrders();
  const { salesOrders, getSalesOrderById } = useSalesOrders();
  const { records: dispatchRecords } = useDispatch();
  const { entriesForOrder } = useProductionEntry();
  const { getAcknowledgement } = useAcknowledgement();
  const { getTechnicalVerification } = useTechnicalVerification();
  const [feedback, setFeedback] = useState(null);
  const order = getOrder(id);

  // The linked CPO: a Work Order stores either the CPO number (legacy rows) or
  // the numeric Sales Order id. The slim option feed resolves that reference to
  // the real Sales Order id, and the FULL Sales Order — with its line items —
  // is then fetched for that ONE id. Sales Orders are never bulk-downloaded.
  const salesOrderRef = String(order?.salesOrderId || '').trim();
  const salesOrderNo = String(order?.salesOrderNumber || '').trim();
  const linkedOption = useMemo(() => {
    if (!salesOrderRef && !salesOrderNo) return null;
    return (
      salesOrders.find(
        (s) =>
          (salesOrderRef && String(s.id) === salesOrderRef) ||
          (salesOrderRef && s.salesOrderNumber === salesOrderRef) ||
          (salesOrderNo && s.salesOrderNumber === salesOrderNo)
      ) || null
    );
  }, [salesOrders, salesOrderRef, salesOrderNo]);

  // { ref, detail } — the ref is stored with the detail so a CPO change can
  // never render the previous CPO's line items.
  const [linkedSalesOrder, setLinkedSalesOrder] = useState(null);
  useEffect(() => {
    if (!linkedOption) return undefined;
    const ref = linkedOption.salesOrderId;
    let cancelled = false;
    getSalesOrderById(ref)
      .then((detail) => {
        if (!cancelled) setLinkedSalesOrder({ ref, detail });
      })
      .catch((err) => {
        console.error('Failed to load the linked CPO:', err?.message || err);
        if (!cancelled) setLinkedSalesOrder({ ref, detail: null });
      });
    return () => {
      cancelled = true;
    };
  }, [linkedOption, getSalesOrderById]);

  // Only use the loaded detail when it belongs to the currently linked CPO.
  const linkedSalesOrderDetail =
    linkedOption && linkedSalesOrder?.ref === linkedOption.salesOrderId
      ? linkedSalesOrder.detail
      : null;

  // Sales → Production link stats: the linked Sales Order item with
  // its produced / rejected / remaining / dispatched quantities and
  // fulfilment status, all derived from the actual user-created
  // production stage entries + dispatch records.
  const salesStats = useMemo(() => {
    if (!order || (!order.salesOrderId && !order.salesOrderNumber)) return null;
    // Match the linked CPO by its real Sales Order id, or by the SO/CPO number
    // for legacy Work Orders created before the id was stored.
    const so = linkedSalesOrderDetail;
    if (!so) return null;
    const itemId =
      order.salesOrderItemId ||
      so.items.find((i) => i.productName === order.product)?.id ||
      so.items[0]?.id;
    const item = itemId ? salesOrderItem(so, itemId) : null;
    if (!item) return null;
    const orderedQty = Number(item.quantity) || 0;
    const linkedOrders = ordersForItem(orders, so, item);
    const producedQty = linkedOrders.reduce(
      (total, o) => total + (Number(o.quantity) || 0),
      0
    );
    const rejectedQty = linkedOrders.reduce(
      (total, o) =>
        total +
        entriesForOrder(o.workOrder).reduce(
          (sum, entry) => sum + (Number(entry.rejectedQuantity) || 0),
          0
        ),
      0
    );
    const remainingQty = Math.max(0, orderedQty - producedQty);
    const linkedPONumbers = new Set(linkedOrders.map((o) => o.workOrder));
    const dispatchedQty = dispatchRecords
      .filter((record) => record.status === 'Dispatched' && linkedPONumbers.has(record.productionOrder))
      .reduce((total, record) => total + (Number(record.quantity) || 0), 0);
    const pendingDispatch = Math.max(0, producedQty - dispatchedQty);
    const fulfilmentStatus = salesOrderItemStatus({ orderedQty, producedQty, dispatchedQty });
    return {
      so,
      item,
      orderedQty,
      producedQty,
      rejectedQty,
      remainingQty,
      dispatchedQty,
      pendingDispatch,
      fulfilmentStatus,
    };
  }, [order, orders, linkedSalesOrderDetail, dispatchRecords, entriesForOrder]);

  if (!order) {
    // The order may simply not be in the cache yet (the list is still loading),
    // e.g. when this detail URL is opened directly — do not claim it is missing
    // before the fetch has finished.
    if (ordersLoading) {
      return <div className="page" aria-busy="true" />;
    }
    return (
      <div className="page">
        <button type="button" className="back-btn" onClick={() => navigate('/production/orders')}>
          <Icon name="chevron-left" size={16} /> Back to Production Work Orders
        </button>
        <section className="orders-page-card">
          <div className="empty-state">
            <span className="empty-icon">
              <Icon name="info" size={22} />
            </span>
            <h4>Work order not found</h4>
            <p>The Work Order "{id}" could not be found. It may have been deleted.</p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => navigate('/production/orders')}
            >
              Back to Production Work Orders
            </button>
          </div>
        </section>
      </div>
    );
  }

  // Stage progress: the order's workflow (from its Production Type)
  // plus the shared stage-entry history. Both automatic and manual
  // entries live in the same record store, so this timeline reflects
  // everything the user has recorded for the order.
  const workflow = workflowForType(productionTypeOf(order));
  const orderEntries = entriesForOrder(order.workOrder);
  const ackRecord = getAcknowledgement(order.workOrder);
  const tvRecord = getTechnicalVerification(order.workOrder);
  // Overall status / current stage / progress are AUTO-CALCULATED
  // from the stage entries (never typed) — see src/data/entries.js.
  const derivedStatus = overallStatusFor(order, orderEntries, ackRecord, tvRecord);
  const currentStage = currentStageFor(order, orderEntries, ackRecord, tvRecord);
  const derivedProgress = progressFor(order, orderEntries, ackRecord, tvRecord);
  const orderDone = derivedStatus === 'Completed' || currentStage === 'Completed';
  const stageEntry = (stage) => orderEntries.find((entry) => entry.stage === stage);

  // Quantity totals derived from the actual stage entries — the
  // planned quantity is the master input, the furthest recorded
  // output is the good output so far, rejected is summed separately,
  // balance/WIP are calculated (never hard-coded).
  const totalInput = Number(order.quantity) || 0;
  const furthestOutput = orderEntries.reduce(
    (max, entry) => {
      const idx = workflow.indexOf(entry.stage);
      const out = Number(entry.outputQuantity) || 0;
      return idx > max.idx ? { idx, out } : max;
    },
    { idx: -1, out: 0 }
  ).out;
  const totalOutput = furthestOutput;
  const totalRejected = orderEntries.reduce(
    (total, entry) => total + (Number(entry.rejectedQuantity) || 0),
    0
  );
  const balance = Math.max(0, totalInput - totalOutput - totalRejected);
  const wip = orderEntries.reduce(
    (total, entry) =>
      total + pendingQuantity(entry.inputQuantity, entry.outputQuantity, entry.rejectedQuantity),
    0
  );

  // transitionOrderStatus is async — it MUST be awaited, otherwise `result`
  // is a Promise (result.ok is always undefined) and every action reported
  // "Cannot move ..." even when the backend had already saved the change.
  const handleTransition = async (nextStatus) => {
    const result = await transitionOrderStatus(order.id, nextStatus);
    if (result.ok) {
      setFeedback({
        message: `${order.workOrder} moved to ${result.to}.`,
        tone: 'success',
      });
    } else {
      setFeedback({
        message: `Cannot move ${order.workOrder} from ${result.from} to ${result.to}.`,
        tone: 'error',
      });
    }
    return result;
  };

  return (
    <div className="page">
      <button type="button" className="back-btn" onClick={() => navigate('/production/orders')}>
        <Icon name="chevron-left" size={16} /> Back to Production Work Orders
      </button>


      <ActionFeedback
        message={feedback?.message}
        tone={feedback?.tone}
        onDismiss={() => setFeedback(null)}
      />

      <section className="detail-hero">
        <div className="detail-hero-top">
          <div className="detail-title-row">
            <h2 className="detail-po">{order.workOrder}</h2>
            <ProductionStatusBadge status={derivedStatus} />
            <span className={`priority-chip priority-${order.priority.toLowerCase()}`}>
              {order.priority} Priority
            </span>
          </div>
          <p className="detail-product">
            {order.product}
            {cpoDisplay(order) ? ` · CPO ${cpoDisplay(order)}` : ''}
          </p>
          <div className="detail-progress">
            <ProductionProgress value={derivedProgress} />
          </div>
        </div>

        <dl className="detail-meta">
          <div className="detail-meta-item">
            <dt>CPO Reference</dt>
            <dd>
              {cpoDisplay(order) ? cpoDisplay(order) : unlinkedCpoNumber(order) ? (
                <span
                  className="cpo-unlinked"
                  title="The referenced Sales Order does not exist — this Work Order is not linked to a valid CPO"
                >
                  {unlinkedCpoNumber(order)} (not linked)
                </span>
              ) : (
                '—'
              )}
              {isLinkedCpo(order) && (
                <button
                  type="button"
                  className="cpo-open-link"
                  title="Open the linked Customer Purchase Order in the Sales module"
                  onClick={() => navigate(`/sales-orders/${order.salesOrderId}`)}
                >
                  <Icon name="eye" size={11} /> View CPO
                </button>
              )}
            </dd>
          </div>
          <div className="detail-meta-item">
            <dt>Production Type</dt>
            <dd>{order.productionType || '—'}</dd>
          </div>
          <div className="detail-meta-item">
            <dt>Batch Number</dt>
            <dd>{order.batchNumber || '—'}</dd>
          </div>
          {order.productionType === 'Casting' && (
            <div className="detail-meta-item">
              <dt>Pattern Number</dt>
              <dd>{order.patternNumber || '—'}</dd>
            </div>
          )}
          {order.productionType === 'Fabrication' && (
            <div className="detail-meta-item">
              <dt>Drawing Number</dt>
              <dd>{order.drawingNumber || '—'}</dd>
            </div>
          )}
          <div className="detail-meta-item">
            <dt>Department</dt>
            <dd>{order.department}</dd>
          </div>
          <div className="detail-meta-item">
            <dt>Quantity</dt>
            <dd>{order.quantity}</dd>
          </div>
          <div className="detail-meta-item">
            <dt>Current Stage</dt>
            <dd>{currentStage}</dd>
          </div>
          <div className="detail-meta-item">
            <dt>Priority</dt>
            <dd>{order.priority}</dd>
          </div>
          <div className="detail-meta-item">
            <dt>Start Date</dt>
            <dd>{formatDate(order.startDate)}</dd>
          </div>
          <div className="detail-meta-item">
            <dt>Due Date</dt>
            <dd>{formatDate(order.dueDate)}</dd>
          </div>

          <div className="detail-meta-item">
            <dt>Technical Verification</dt>
            <dd>{(() => { const tv = getTechnicalVerification(order.workOrder); return tv?.verificationStatus === 'Verified' ? 'Verified' : tv?.verificationStatus === 'Rejected' ? 'Rejected' : 'Pending'; })()}</dd>
          </div>
          {/* Approval Information */}
          <div className="detail-meta-item">
            <dt>Production Approval</dt>
            <dd>
              {order.productionApprovedBy ? (
                <span>
                  <span style={{ color: '#178054', fontWeight: 600 }}>Approved</span>
                  <br />
                  <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                    By: {order.productionApprovedBy} · {formatDate(order.productionApprovedAt)}
                  </span>
                </span>
              ) : 'Pending'}
            </dd>
          </div>
          <div className="detail-meta-item">
            <dt>Admin Approval</dt>
            <dd>
              {order.adminApprovedBy ? (
                <span>
                  <span style={{ color: '#178054', fontWeight: 600 }}>Approved</span>
                  <br />
                  <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                    By: {order.adminApprovedBy} · {formatDate(order.adminApprovedAt)}
                  </span>
                </span>
              ) : 'Pending'}
            </dd>
          </div>
        </dl>
      </section>

      <section className="stage-progress-card">
        <div className="stage-progress-head">
          <h3 className="stage-progress-title">Stage Progress</h3>
          <p className="stage-progress-subtitle">
            Stage flow and quantity history for this Work Order (automatic + manual entries)
          </p>
        </div>

        {workflow.length > 0 ? (
          <ol className="stage-strip">
            {(() => {
              // Approval stage: done when both Production and Admin approvals are completed
              const approvalDone = Boolean(order.productionApprovedBy && order.adminApprovedBy);
              const approvalLabel = approvalDone ? 'Approved' : order.productionApprovedBy ? 'Production Approved' : 'Pending';
              const tvRecord = getTechnicalVerification(order.workOrder);
              const tvDone = tvRecord?.verificationStatus === 'Verified';
              const tvRejected = tvRecord?.verificationStatus === 'Rejected';
              const tvLabel = tvDone ? 'Verified' : tvRejected ? 'Rejected' : 'Pending';
              return (
                <>
                  <li className={`stage-node${approvalDone ? ' done' : ''}`}>
                    <span className="stage-marker" aria-hidden="true">
                      {approvalDone ? <Icon name="check" size={11} /> : '○'}
                    </span>
                    <span className="stage-name">Approval</span>
                    <span className="stage-qty">{approvalLabel}</span>
                  </li>
                  <li className={`stage-node${tvDone ? ' done' : ''}${tvRejected ? ' skipped' : ''}`}>
                    <span className="stage-marker" aria-hidden="true">
                      {tvDone ? <Icon name="check" size={11} /> : tvRejected ? <Icon name="x" size={11} /> : '○'}
                    </span>
                    <span className="stage-name">Technical Verification</span>
                    <span className="stage-qty">{tvLabel}</span>
                  </li>
                </>
              );
            })()}
            {workflow.map((stage) => {
              const entry = stageEntry(stage);
              const done = Boolean(entry && entry.status === 'Completed');
              const skipped = Boolean(entry && entry.status === 'Skipped');
              const isCurrent = workflow.includes(currentStage) && stage === currentStage && !orderDone;
              const hasQty =
                entry && (Number(entry.inputQuantity) > 0 || Number(entry.outputQuantity) > 0);
              return (
                <li
                  key={stage}
                  className={`stage-node${done ? ' done' : ''}${skipped ? ' skipped' : ''}${isCurrent ? ' current' : ''}`}
                >
                  <span className="stage-marker" aria-hidden="true">
                    {done ? <Icon name="check" size={11} /> : skipped ? <Icon name="skip-forward" size={11} /> : isCurrent ? '→' : '○'}
                  </span>
                  <span className="stage-name">{stage}</span>
                  {hasQty && (
                    <span className="stage-qty">
                      {entry.inputQuantity} → {entry.outputQuantity || 0}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="stage-progress-empty">No stage workflow defined for this Work Order.</p>
        )}

        <div className="stage-totals">
          <div className="stage-total-item">
            <span className="stage-total-label">Total Input</span>
            <span className="stage-total-value">{totalInput}</span>
          </div>
          <div className="stage-total-item">
            <span className="stage-total-label">Total Output</span>
            <span className="stage-total-value">{totalOutput}</span>
          </div>
          <div className="stage-total-item">
            <span className="stage-total-label">Total Rejected</span>
            <span className="stage-total-value">{totalRejected}</span>
          </div>
          <div className="stage-total-item">
            <span className="stage-total-label">Balance</span>
            <span className="stage-total-value">{balance}</span>
          </div>
          <div className="stage-total-item">
            <span className="stage-total-label">Current WIP</span>
            <span className="stage-total-value">{wip}</span>
          </div>
        </div>
      </section>

      <ProductionOrderTabs order={order} salesStats={salesStats} onTransition={handleTransition} />
    </div>
  );
}
