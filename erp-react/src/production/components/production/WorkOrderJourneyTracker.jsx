import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../icons/Icon';
import ProductionStatusBadge from './ProductionStatusBadge';
import ProductionProgress from './ProductionProgress';
import { useProductionOrders } from '../../context/ProductionOrdersContext';
import { useProductionEntry } from '../../context/ProductionEntryContext';
import { useAcknowledgement } from '../../context/AcknowledgementContext';
import { useTechnicalVerification } from '../../context/TechnicalVerificationContext';
import { PackingContext } from '../../context/PackingContext';
import { DispatchContext } from '../../context/DispatchContext';
import {
  workflowForType,
  productionTypeOf,
  pendingQuantity,
  overallStatusFor,
  currentStageFor,
  progressFor,
} from '../../data/entries';
import { packedQtyOf, ensureBoxes, overallTotals } from '../../data/packing';
import PackingListDocument from './packing/PackingListDocument';
import '../../pages/Packing.css';
import { formatDate } from '../../utils/format';
import { cpoNo } from '../../../utils/salesHelpers';
import { prefetchIntentProps } from '../../../utils/routePrefetch';
import './WorkOrderJourneyTracker.css';
import '../../pages/ProductionOrderDetail.css';

const STATUS_OPTIONS = ['All', 'Pending', 'In Progress', 'Hold', 'Completed'];

/** Map production type → module URL slug. */
const TYPE_URL = {
  Casting: '/production/casting',
  Fabrication: '/production/fabrication',
  Assembly: '/production/assembly',
  'Machine Shop': '/production/machine-shop',
};

/** Map downstream stage names → their module URL. */
const STAGE_URL = {
  Assembly: '/production/assembly',
  QC: '/production/quality',
  'QC Inspection': '/production/quality',
  Packing: '/production/packing',
  Dispatch: '/production/dispatch',
};

/**
 * Work Order Journey Tracker — a visual pipeline view of every
 * Work Order's stage progress.
 *
 * Props:
 *  - productionType (optional): pre-filters to that type.
 *  - title (optional): override the section title.
 */
export default function WorkOrderJourneyTracker({ productionType, title, selectedWorkOrder, onClose }) {
  const navigate = useNavigate();
  const { orders } = useProductionOrders();
  const { entries } = useProductionEntry();
  const { getAcknowledgement } = useAcknowledgement();
  const { getTechnicalVerification } = useTechnicalVerification();
  const packingCtx = React.useContext(PackingContext);
  const dispatchCtx = React.useContext(DispatchContext);
  const packingRecords = packingCtx?.records || [];
  const dispatchRecords = dispatchCtx?.records || [];

  const [activeTab, setActiveTab] = useState(productionType || 'All');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');

  // When selectedWorkOrder is set, show only that specific Work Order
  const scopedOrders = useMemo(() => {
    if (selectedWorkOrder) {
      return orders.filter((o) => o.workOrder === selectedWorkOrder);
    }
    return productionType
      ? orders.filter((o) => productionTypeOf(o) === productionType)
      : orders;
  }, [orders, productionType, selectedWorkOrder]);

  const summary = useMemo(() => {
    const total = scopedOrders.length;
    let inProgress = 0;
    let completed = 0;
    let onHold = 0;
    let pending = 0;
    let totalProgress = 0;

    scopedOrders.forEach((order) => {
      const ackRecord = getAcknowledgement(order.workOrder);
      const tvRecord = getTechnicalVerification(order.workOrder);
      const status = overallStatusFor(order, entries, ackRecord, tvRecord);
      const progress = progressFor(order, entries, ackRecord, tvRecord);
      totalProgress += progress;
      if (status === 'In Progress') inProgress++;
      else if (status === 'Completed') completed++;
      else if (status === 'Hold') onHold++;
      else pending++;
    });

    return {
      total,
      inProgress,
      completed,
      onHold,
      pending,
      avgProgress: total > 0 ? Math.round(totalProgress / total) : 0,
    };
  }, [scopedOrders, entries, getAcknowledgement, getTechnicalVerification]);

  const tabCounts = useMemo(() => {
    if (productionType) return {};
    const counts = { All: orders.length };
    orders.forEach((order) => {
      const type = productionTypeOf(order);
      counts[type] = (counts[type] || 0) + 1;
    });
    return counts;
  }, [orders, productionType]);

  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    return scopedOrders
      .filter((order) => {
        if (!productionType && activeTab !== 'All' && productionTypeOf(order) !== activeTab) return false;
        if (statusFilter !== 'All') {
          const ackRec = getAcknowledgement(order.workOrder);
          const tvRec = getTechnicalVerification(order.workOrder);
          const status = overallStatusFor(order, entries, ackRec, tvRec);
          if (status !== statusFilter) return false;
        }
        if (q) {
          const searchable = [
            order.workOrder,
            order.product,
            order.salesOrderNumber,
            order.patternNumber,
            order.drawingNumber,
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
          if (!searchable.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => (a.workOrder || '').localeCompare(b.workOrder || ''));
  }, [scopedOrders, entries, activeTab, search, statusFilter, productionType, getAcknowledgement, getTechnicalVerification]);

  const sectionTitle = title || (selectedWorkOrder ? `Work Order — ${selectedWorkOrder}` : 'Work Order Journey Tracker');

  return (
    <section className="journey-tracker">
      {/* Section header */}
      <div className="journey-header">
        <div className="journey-header-left">
          {selectedWorkOrder && onClose && (
            <button type="button" className="btn btn-secondary" onClick={onClose} style={{ marginRight: 12 }}>
              <Icon name="chevron-left" size={14} /> Back
            </button>
          )}
          <Icon name="layers" size={18} />
          <h3 className="journey-title">{sectionTitle}</h3>
        </div>
      </div>

      {/* Tab filters — dashboard only, clickable → navigate to module. Hidden when viewing a single WO. */}
      {!selectedWorkOrder && !productionType && (
        <div className="journey-tabs">
          {['All', 'Casting', 'Fabrication', 'Assembly'].map((tab) => (
            <button
              key={tab}
              type="button"
              {...prefetchIntentProps(TYPE_URL[tab])}
              className={`journey-tab${activeTab === tab ? ' active' : ''}`}
              onClick={() => {
                setActiveTab(tab);
                // Also navigate to the module page when a specific type is clicked
                if (tab !== 'All' && TYPE_URL[tab]) {
                  navigate(TYPE_URL[tab]);
                }
              }}
            >
              {tab}
              {tabCounts[tab] > 0 && (
                <span className="journey-tab-count">{tabCounts[tab]}</span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Search + Status filter — hidden when viewing a single WO */}
      {!selectedWorkOrder && (
      <div className="journey-toolbar">
        <div className="journey-search">
          <Icon name="search" size={14} />
          <input
            type="text"
            placeholder="Search WO# or Item..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="journey-status-select"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s === 'All' ? 'All statuses' : s}
            </option>
          ))}
        </select>
      </div>
      )}

      {/* Summary cards — clickable → navigate to detail or module. Hidden when viewing a single WO. */}
      {!selectedWorkOrder && (
      <div className="journey-summary">
        <div
          className="journey-summary-card"
          role="button"
          tabIndex={0}
          onClick={() => navigate('/production/orders')}
        >
          <span className="journey-summary-label">Total WOs</span>
          <span className="journey-summary-value">{summary.total}</span>
          <span className="journey-summary-sub">Work orders tracked</span>
        </div>
        <div
          className="journey-summary-card in-progress"
          role="button"
          tabIndex={0}
          onClick={() => navigate('/production/orders')}
        >
          <span className="journey-summary-label">In Progress</span>
          <span className="journey-summary-value">{summary.inProgress}</span>
          <span className="journey-summary-sub">Active production</span>
        </div>
        <div
          className="journey-summary-card completed"
          role="button"
          tabIndex={0}
          onClick={() => navigate('/production/orders')}
        >
          <span className="journey-summary-label">Completed</span>
          <span className="journey-summary-value">{summary.completed}</span>
          <span className="journey-summary-sub">Fully done</span>
        </div>
        <div
          className="journey-summary-card on-hold"
          role="button"
          tabIndex={0}
          onClick={() => navigate('/production/orders')}
        >
          <span className="journey-summary-label">On Hold</span>
          <span className="journey-summary-value">{summary.onHold}</span>
          <span className="journey-summary-sub">Blocked orders</span>
        </div>
        <div
          className="journey-summary-card pending"
          role="button"
          tabIndex={0}
          onClick={() => navigate('/production/orders')}
        >
          <span className="journey-summary-label">Pending</span>
          <span className="journey-summary-value">{summary.pending}</span>
          <span className="journey-summary-sub">Not yet started</span>
        </div>
        <div
          className="journey-summary-card avg-progress"
          role="button"
          tabIndex={0}
          onClick={() => navigate('/production/orders')}
        >
          <span className="journey-summary-label">Avg Progress</span>
          <span className="journey-summary-value">{summary.avgProgress}%</span>
          <span className="journey-summary-sub">Overall completion %</span>
        </div>      </div>
      )}


      {/* Work Order rows */}
      <div className="journey-orders">
        {filteredOrders.length === 0 ? (
          <div className="journey-empty">
            <Icon name="search" size={20} />
            <p>No Work Orders found.</p>
          </div>
        ) : (
          filteredOrders.map((order) => (
            <WorkOrderRow
              key={order.workOrder}
              order={order}
              entries={entries}
              onNavigate={navigate}
              isSingleView={Boolean(selectedWorkOrder)}
              productionType={productionType}
            />
          ))
        )}
      </div>

      {/* Complete Work Order Details — shown below the flow when viewing a single WO */}
      {selectedWorkOrder && filteredOrders.length > 0 && (
        <WorkOrderDetails order={filteredOrders[0]} entries={entries} productionType={productionType} getAcknowledgement={getAcknowledgement} getTechnicalVerification={getTechnicalVerification} packingRecords={packingRecords} dispatchRecords={dispatchRecords} />
      )}
    </section>
  );
}

/**
 * Single Work Order row with the horizontal stage pipeline.
 * - Click row header (WO number) → detail page
 * - Click stage circle/label → module page (Casting / Fabrication / Assembly)
 */
function WorkOrderRow({ order, entries, onNavigate, isSingleView, productionType }) {
  const { getAcknowledgement } = useAcknowledgement();
  const { getTechnicalVerification } = useTechnicalVerification();
  // Use the module's productionType prop if set, otherwise fall back to order-level type
  const type = productionType || productionTypeOf(order);
  const workflow = workflowForType(type);
  const ackRecord = getAcknowledgement(order.workOrder);
  const tvRecord = getTechnicalVerification(order.workOrder);
  const status = overallStatusFor(order, entries, ackRecord, tvRecord);
  const currentStage = currentStageFor(order, entries, ackRecord, tvRecord);
  const progress = progressFor(order, entries, ackRecord, tvRecord);
  const orderEntries = entries.filter((e) => e.workOrderId === order.workOrder);

  const statusClass = status.toLowerCase().replace(/\s+/g, '-');
  const moduleUrl = TYPE_URL[type] || '/production';

  const goToDetail = (e) => {
    e.stopPropagation();
    // In single-WO view, the details are already shown below — do nothing.
    if (isSingleView) return;
    onNavigate(moduleUrl);
  };

  const goToStage = (e, stage) => {
    e.stopPropagation();
    // Navigate to the correct module page for the stage.
    // Downstream stages (QC, Packing, Dispatch) have their own module pages.
    const url = STAGE_URL[stage] || moduleUrl;
    onNavigate(url);
  };

  return (
    <div className="journey-row">
      {/* Row header — click WO number → detail page */}
      <div className="journey-row-header" onClick={goToDetail} role="link" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && goToDetail(e)}>
        <div className="journey-row-left">
          <span className="journey-row-wo">{order.workOrder}</span>
          <span className="journey-row-item">{order.product || '—'}</span>
          <span className={`journey-row-badge badge-${statusClass}`}>{status}</span>
          {order.startDate && (
            <span className="journey-row-date">
              <Icon name="calendar" size={11} /> {order.startDate}
            </span>
          )}
        </div>
        <div className="journey-row-right">
          <span className="journey-row-progress">
            PROGRESS <strong>{progress}%</strong>
          </span>
          <span className="journey-row-view-hint">
            <Icon name="eye" size={12} /> View Details
          </span>
        </div>
      </div>

      {/* Stage pipeline — click any stage circle → module page */}
      <div className={`journey-pipeline${['Casting', 'Fabrication', 'Assembly'].includes(type) ? ' is-green-stages' : ''}`}>
        {/* Prepend Acknowledgement + Technical Verification steps */}              {(() => {
          const ackRecord = getAcknowledgement(order.workOrder);
          const tvRecord = getTechnicalVerification(order.workOrder);
          // Acknowledgement and Technical Verification are completed
          // ONLY when their actual saved status is 'Acknowledged' or
          // 'Verified' — never auto-completed based on other stages.
          // Approval is done when both Production and Admin approvals are completed
          const approvalDone = Boolean(order.productionApprovedBy && order.adminApprovedBy);
          const tvDone = tvRecord?.verificationStatus === 'Verified';
          const tvRejected = tvRecord?.verificationStatus === 'Rejected';

          const prefixSteps = [
            { label: 'Approval', done: approvalDone, rejected: false, statusLabel: approvalDone ? 'Approved' : order.productionApprovedBy ? 'Production Approved' : 'Pending' },
          ];
          // Casting's first stage IS the technical verification gate, so the
          // gate is shown once (as that stage) instead of twice under the same
          // name.
          if (!workflow.includes('Technical Verification')) {
            prefixSteps.push({ label: 'Technical Verification', done: tvDone, rejected: tvRejected, statusLabel: tvDone ? 'Verified' : tvRejected ? 'Rejected' : 'Pending' });
          }
          const totalSteps = prefixSteps.length + workflow.length;

          return (
            <>
              {prefixSteps.map((step, index) => (
                <React.Fragment key={step.label}>
                  <div
                    className={`journey-stage ${step.rejected ? 'rejected' : step.done ? 'completed' : 'pending'}`}
                    title={`${step.label}: ${step.statusLabel}`}
                  >
                    <span className="journey-stage-circle">
                      <Icon name={step.done ? 'check' : step.rejected ? 'x' : 'clock'} size={11} />
                    </span>
                    <span className="journey-stage-label">{step.label}</span>
                  </div>
                  {index < totalSteps - 1 && (
                    <span className={`journey-connector${step.done ? ' done' : ''}`} />
                  )}
                </React.Fragment>
              ))}
              {workflow.map((stage, index) => {
                const entry = orderEntries.find((e) => e.stage === stage);
                const isCompleted = entry?.status === 'Completed' || entry?.status === 'Skipped';
                // A production stage is 'current' only when currentStage
                // is actually a production stage (not 'Acknowledgement' or
                // 'Technical Verification').
                const isCurrentProductionStage = workflow.includes(currentStage);
                const isCurrent = isCurrentProductionStage && stage === currentStage && status !== 'Completed';
                const isHold = entry?.status === 'Hold';
                const isPending = !entry && !isCompleted;

                let stateClass = 'pending';
                if (status === 'Completed' && isCompleted) stateClass = 'completed';
                else if (isCompleted) stateClass = 'completed';
                else if (isHold) stateClass = 'hold';
                else if (isCurrent) stateClass = 'current';
                else if (isPending) stateClass = 'pending';

                let iconName = 'clock';
                if (isCompleted) iconName = 'check';
                else if (isHold) iconName = 'pause';
                else if (isCurrent) iconName = 'play';

                return (
                  <React.Fragment key={stage}>
                    <div
                      className={`journey-stage ${stateClass}`}
                      role="button"
                      tabIndex={0}
                      onClick={(e) => goToStage(e, stage)}
                      onKeyDown={(e) => e.key === 'Enter' && goToStage(e, stage)}
                      title={`Go to ${type} — ${stage}`}
                    >
                      <span className="journey-stage-circle">
                        <Icon name={iconName} size={11} />
                      </span>
                      <span className="journey-stage-label">{stage}</span>
                    </div>
                    {prefixSteps.length + index < totalSteps - 1 && (
                      <span
                        className={`journey-connector${isCompleted ? ' done' : ''}`}
                      />
                    )}
                  </React.Fragment>
                );
              })}
            </>
          );
        })()}
      </div>
    </div>
  );
}

/**
 * Complete Work Order Details — shown below the flow when viewing a single WO.
 * Reuses the same CSS classes from ProductionOrderDetail.css for visual consistency.
 */
function WorkOrderDetails({ order, entries, productionType, getAcknowledgement, getTechnicalVerification, packingRecords = [], dispatchRecords = [] }) {
  if (!order) return null;

  // Use the module's productionType prop if set, otherwise fall back to order-level type
  const type = productionType || productionTypeOf(order);
  const workflow = workflowForType(type);
  const ackRecord = getAcknowledgement(order.workOrder);
  const tvRecord = getTechnicalVerification(order.workOrder);
  const status = overallStatusFor(order, entries, ackRecord, tvRecord);
  const currentStage = currentStageFor(order, entries, ackRecord, tvRecord);
  const progress = progressFor(order, entries, ackRecord, tvRecord);
  const orderEntries = entries.filter((e) => e.workOrderId === order.workOrder);

  // Quantity totals
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

  const stageEntry = (stage) => orderEntries.find((entry) => entry.stage === stage);
  const orderDone = status === 'Completed' || currentStage === 'Completed';

  return (
    <div style={{ marginTop: 12 }}>
      {/* Hero card — Work Order identity + meta grid */}
      <section className="detail-hero">
        <div className="detail-hero-top">
          <div className="detail-title-row">
            <h2 className="detail-po">{order.workOrder}</h2>
            <ProductionStatusBadge status={status} />
            {order.priority && (
              <span className={`priority-chip priority-${(order.priority || '').toLowerCase()}`}>
                {order.priority} Priority
              </span>
            )}
          </div>
          <p className="detail-product">
            {(order.items && order.items.length > 1)
              ? `${order.items.length} items — ${order.items.map((i) => i.productName).filter(Boolean).join(', ')}`
              : (order.product || '—')}
            {order.salesOrderNumber ? ` · CPO ${cpoNo(order.salesOrderNumber)}` : ''}
          </p>
          <div className="detail-progress">
            <ProductionProgress value={progress} />
          </div>
        </div>

        <dl className="detail-meta">
          <div className="detail-meta-item">
            <dt>CPO Reference</dt>
            <dd>{cpoNo(order.salesOrderNumber) || '—'}</dd>
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
            <dd>{order.department || '—'}</dd>
          </div>
          <div className="detail-meta-item">
            <dt>Total Quantity</dt>
            <dd>{(order.items || []).reduce((s, i) => s + (Number(i.quantity) || 0), 0) || order.quantity || 0}</dd>
          </div>
          <div className="detail-meta-item">
            <dt>Current Stage</dt>
            <dd>{currentStage || '—'}</dd>
          </div>
          <div className="detail-meta-item">
            <dt>Priority</dt>
            <dd>{order.priority || '—'}</dd>
          </div>
          <div className="detail-meta-item">
            <dt>Start Date</dt>
            <dd>{formatDate(order.startDate) || '—'}</dd>
          </div>
          <div className="detail-meta-item">
            <dt>Due Date</dt>
            <dd>{formatDate(order.dueDate) || '—'}</dd>
          </div>
          <div className="detail-meta-item">
            <dt>Approval</dt>
            <dd>{(() => { return order.adminApprovedBy ? 'Approved' : order.productionApprovedBy ? 'Production Approved' : 'Pending'; })()}</dd>
          </div>
          <div className="detail-meta-item">
            <dt>Technical Verification</dt>
            <dd>{(() => { const tv = getTechnicalVerification(order.workOrder); return tv?.verificationStatus === 'Verified' ? 'Verified' : tv?.verificationStatus === 'Rejected' ? 'Rejected' : 'Pending'; })()}</dd>
          </div>
        </dl>
      </section>

      {/* Items Table — multi-item Work Orders */}
      {order.items && order.items.length > 0 && (
        <section className="wo-items-detail-section">
          <h4 className="wo-items-detail-title">
            <Icon name="layers" size={14} /> Production Items ({(order.items || []).filter((item) => !productionType || item.productionType === productionType).length})
          </h4>
          <div className="table-scroll">
            {/* Sticky grid (shared Production scope): the leading # column stays
                frozen (left: 0) while the item columns scroll. */}
            <table className="data-table sgrid sgrid-prod">
              <thead>
                <tr>
                  <th className="sgrid-pin sgrid-first">#</th>
                  <th>Item</th>
                  <th>Item Code</th>
                  <th>Production Type</th>
                  <th>Ordered Qty</th>
                  <th>Produced Qty</th>
                  <th>Rejected Qty</th>
                  <th>Balance Qty</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {(order.items || []).filter((item) => !productionType || item.productionType === productionType).map((item, idx) => {
                  const balance = (Number(item.quantity) || 0) - (Number(item.producedQty) || 0) - (Number(item.rejectedQty) || 0);
                  return (
                    <tr key={item.id}>
                      <td className="sgrid-pin sgrid-first">{idx + 1}</td>
                      <td className="cell-strong">{item.productName || '—'}</td>
                      <td>{item.productCode || '—'}</td>
                      <td><span className="wo-item-count-badge" style={{ fontSize: 11 }}>{item.productionType}</span></td>
                      <td>{item.quantity}</td>
                      <td>{item.producedQty || 0}</td>
                      <td>{item.rejectedQty || 0}</td>
                      <td className={balance > 0 ? 'cell-muted' : ''}>{Math.max(0, balance)}</td>
                      <td><ProductionStatusBadge status={item.status || 'Pending'} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Stage Progress Strip */}
      <section className="stage-progress-card">
        <div className="stage-progress-head">
          <h3 className="stage-progress-title">Stage Progress</h3>
          <p className="stage-progress-subtitle">
            Stage flow and quantity history for this Work Order
          </p>
        </div>

        {workflow.length > 0 ? (
          <ol className={`stage-strip${workflow.includes('Technical Verification') ? ' is-green-stages' : ''}`}>              {/* Approval step */}
            {(() => {
              const approvalDone = Boolean(order.productionApprovedBy && order.adminApprovedBy);
              const partialApproval = Boolean(order.productionApprovedBy);
              const tvRecord = getTechnicalVerification(order.workOrder);
              const tvDone = tvRecord?.verificationStatus === 'Verified';
              const tvRejected = tvRecord?.verificationStatus === 'Rejected';
              const approvalLabel = approvalDone ? 'Approved' : partialApproval ? 'Production Approved' : 'Pending';
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
                  {/* Casting: the first Casting stage already is Technical
                      Verification, so the gate is not repeated here. */}
                  {!workflow.includes('Technical Verification') && (
                    <li className={`stage-node${tvDone ? ' done' : ''}${tvRejected ? ' skipped' : ''}`}>
                      <span className="stage-marker" aria-hidden="true">
                        {tvDone ? <Icon name="check" size={11} /> : tvRejected ? <Icon name="x" size={11} /> : '○'}
                      </span>
                      <span className="stage-name">Technical Verification</span>
                      <span className="stage-qty">{tvLabel}</span>
                    </li>
                  )}
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

      {/* Packing Entry Details — shown when related Packing records exist */}
      {(() => {
        try {
        const woPacking = packingRecords.filter((r) => r.productionOrder === order.workOrder);
        if (woPacking.length === 0) return null;
        return (
          <section className="stage-progress-card" style={{ marginTop: 16 }}>
            <div className="stage-progress-head">
              <h3 className="stage-progress-title">Packing Entry Details</h3>
              <p className="stage-progress-subtitle">Complete Packing List for this Work Order</p>
            </div>
            {woPacking.map((pl) => {
              const migrated = ensureBoxes(pl);
              if (!migrated) return null;
              return (
                <div key={pl.id} style={{ marginTop: 8 }}>
                  <PackingListDocument record={migrated} />
                </div>
              );
            })}
          </section>
        );
        } catch (e) { console.error('Packing details error:', e); return null; }
      })()}

      {/* Dispatch Details — shown when related Dispatch records exist */}
      {(() => {
        try {
        const woDispatch = dispatchRecords.filter((r) => r.productionOrder === order.workOrder);
        if (woDispatch.length === 0) return null;
        const d = woDispatch[0];
        if (!d) return null;
        return (
          <section className="stage-progress-card" style={{ marginTop: 16 }}>
            <div className="stage-progress-head">
              <h3 className="stage-progress-title">Dispatch Details</h3>
              <p className="stage-progress-subtitle">Dispatch records for this Work Order</p>
            </div>
            <dl className="detail-meta">
              <div className="detail-meta-item">
                <dt>Dispatch Number</dt>
                <dd>{d.id}</dd>
              </div>
              <div className="detail-meta-item">
                <dt>Packing List</dt>
                <dd>{d.packingListId || '\u2014'}</dd>
              </div>
              <div className="detail-meta-item">
                <dt>Dispatch Quantity</dt>
                <dd>{d.quantity}</dd>
              </div>
              <div className="detail-meta-item">
                <dt>Packing Status</dt>
                <dd>{d.packingStatus || 'Not Packed'}</dd>
              </div>
              <div className="detail-meta-item">
                <dt>Dispatch Date</dt>
                <dd>{formatDate(d.dispatchDate)}</dd>
              </div>
              <div className="detail-meta-item">
                <dt>Transporter</dt>
                <dd>{d.transporter || '\u2014'}</dd>
              </div>
              <div className="detail-meta-item">
                <dt>Vehicle No.</dt>
                <dd>{d.vehicleNo || '\u2014'}</dd>
              </div>
              <div className="detail-meta-item">
                <dt>LR / Tracking</dt>
                <dd>{d.lrTrackingNo || '\u2014'}</dd>
              </div>
              <div className="detail-meta-item">
                <dt>Status</dt>
                <dd>{d.status || 'Draft'}</dd>
              </div>
              {d.remarks && (
                <div className="detail-meta-item" style={{ gridColumn: '1 / -1' }}>
                  <dt>Remarks</dt>
                  <dd>{d.remarks}</dd>
                </div>
              )}
            </dl>
          </section>
        );
        } catch (e) { console.error('Dispatch details error:', e); return null; }
      })()}
    </div>
  );
}
