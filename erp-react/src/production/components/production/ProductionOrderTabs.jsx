import React, { useEffect, useState } from 'react';
import Icon from '../icons/Icon';
import ProductionStatusBadge from './ProductionStatusBadge';
import ProductionProgress from './ProductionProgress';
import ProductionOrderWorkflow from './ProductionOrderWorkflow';
import OperationsTab from './OperationsTab';
import MaterialsTab from './MaterialsTab';
import QualityTab from './QualityTab';
import ProductionAttachments from './ProductionAttachments';
import WorkOrderItemsPanel from './WorkOrderItemsPanel';
import TimelineTab from './TimelineTab';
import HistoryTab from './HistoryTab';
import { getOrderDetails } from '../../data/orderDetails';
import { formatDate } from '../../utils/format';
import { cpoNo } from '../../../utils/salesHelpers';
import { settingsService } from '../../services/production';
import './ProductionOrderTabs.css';

const TABS = [
  { key: 'overview', label: 'Overview', icon: 'dashboard' },
  { key: 'operations', label: 'Operations', icon: 'settings' },
  { key: 'materials', label: 'Materials', icon: 'package' },
  { key: 'quality', label: 'Quality', icon: 'shield-check' },
  { key: 'photos', label: 'Photos', icon: 'image' },
  { key: 'documents', label: 'Documents', icon: 'file-text' },
  { key: 'timeline', label: 'Timeline', icon: 'clock' },
  { key: 'history', label: 'History', icon: 'list' },
];

function OverviewPanel({ order, onTransition, salesStats }) {
  const fields = [
    { label: 'Work Order', value: order.workOrder },
    { label: 'CPO Reference', value: cpoNo(order.salesOrderNumber) || '—' },
    { label: 'Item Code', value: order.productCode || '—' },
    { label: 'Ordered Quantity', value: order.orderedQuantity ?? '—' },
    { label: 'Delivery Date', value: formatDate(order.deliveryDate) },
    { label: 'Item Name', value: order.product },
    { label: 'Production Type', value: order.productionType || '—' },
    { label: 'Batch Number', value: order.batchNumber || '—' },
    order.productionType === 'Casting'
      ? { label: 'Pattern Number', value: order.patternNumber || '—' }
      : null,
    order.productionType === 'Fabrication'
      ? { label: 'Drawing Number', value: order.drawingNumber || '—' }
      : null,
    { label: 'Quantity', value: order.quantity },
    { label: 'Department', value: order.department },
    { label: 'Priority', value: order.priority },
    { label: 'Start Date', value: formatDate(order.startDate) },
    { label: 'Due Date', value: formatDate(order.dueDate) },
    { label: 'Current Stage', value: order.currentStage },
  ];

  // Sales Order item tracking — derived from the actual production
  // stage entries and dispatch records linked to the item (never
  // hard-coded): Ordered / Produced / Rejected / Dispatched /
  // Remaining plus the fulfilment status.
  const statusTone = (status) => {
    if (status === 'FULFILLED') return 'success';
    if (status === 'PARTIALLY FULFILLED' || status === 'IN PROGRESS') return 'info';
    return null;
  };
  const salesFields = salesStats
    ? [
        { label: 'Sales Order Item', value: salesStats.item.productName },
        { label: 'Unit', value: salesStats.item.unit || '—' },
        { label: 'Item Ordered Qty', value: salesStats.orderedQty },
        { label: 'Item Produced Qty', value: salesStats.producedQty },
        { label: 'Item Rejected Qty', value: salesStats.rejectedQty },
        { label: 'Item Remaining Qty', value: salesStats.remainingQty },
        { label: 'Item Dispatched Qty', value: salesStats.dispatchedQty },
        { label: 'Pending Dispatch', value: salesStats.pendingDispatch },
        {
          label: 'Item Status',
          value: salesStats.fulfilmentStatus,
          tone: statusTone(salesStats.fulfilmentStatus),
        },
      ]
    : [];

  return (
    <div className="overview-tab">
      <div className="overview-grid">
        {fields.filter(Boolean).map((field) => (
          <div key={field.label} className="overview-field">
            <span className="overview-label">{field.label}</span>
            <span className="overview-value">{field.value}</span>
          </div>
        ))}
        {salesFields.map((field) => (
          <div
            key={field.label}
            className={`overview-field${field.tone ? ` overview-field-${field.tone}` : ''}`}
          >
            <span className="overview-label">{field.label}</span>
            <span className="overview-value">{field.value}</span>
          </div>
        ))}
        <div className="overview-field">
          <span className="overview-label">Status</span>
          <ProductionStatusBadge status={order.status} />
        </div>
        <div className="overview-field overview-progress">
          <span className="overview-label">Progress</span>
          <ProductionProgress value={order.progress} />
        </div>
      </div>
      <div className="overview-remarks">
        <span className="overview-label">Remarks</span>
        <p className="overview-remarks-text">{order.remarks || 'No remarks recorded.'}</p>
      </div>

      {/* Item-wise due dates and attachments — read-only. */}
      <WorkOrderItemsPanel order={order} />

      <ProductionOrderWorkflow order={order} onTransition={onTransition} />
    </div>
  );
}

/**
 * The 8 roadmap tabs for a production order detail screen.
 */
export default function ProductionOrderTabs({ order, salesStats, onTransition }) {
  const [active, setActive] = useState('overview');
  const [attachmentKey, setAttachmentKey] = useState(0);
  const details = getOrderDetails(order);

  // ---- Production Parameters (Settings → Production Parameters) ----
  // The three feature flags say what a production order is allowed to carry:
  // a timeline, photos and documents. A section that is switched off is not
  // shown at all, so the order screen reflects the configuration instead of
  // offering a tab the module is not supposed to use. Until the parameters
  // load (and if they cannot be read) every tab is shown — the built-in
  // default is 'enabled' for the timeline/documents and 'disabled' for photos,
  // which only applies once the saved set is known.
  const [parameters, setParameters] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await settingsService.loadParameters();
        if (!cancelled) setParameters(response.data || {});
      } catch {
        if (!cancelled) setParameters(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const enabledTabKeys = {
    timeline: parameters?.enableProductionTimeline,
    photos: parameters?.enableProductionPhotos,
    documents: parameters?.enableProductionDocuments,
  };
  const visibleTabs = parameters
    ? TABS.filter((tab) => enabledTabKeys[tab.key] !== false)
    : TABS;

  return (
    <div className="tabs-card">
      <div className="tabs-bar" role="tablist" aria-label="Production order details">
        {visibleTabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={active === tab.key}
            className={`tab-btn${active === tab.key ? ' active' : ''}`}
            onClick={() => setActive(tab.key)}
          >
            <Icon name={tab.icon} size={15} /> {tab.label}
          </button>
        ))}
      </div>

      <div className="tabs-content">
        {active === 'overview' && (
          <OverviewPanel order={order} salesStats={salesStats} onTransition={onTransition} />
        )}
        {active === 'operations' && <OperationsTab operations={details.operations} />}
        {active === 'materials' && <MaterialsTab materials={details.materials} />}
        {active === 'quality' && <QualityTab order={order} quality={details.quality} />}
        {active === 'photos' && (
          <ProductionAttachments
            apiBase="/v1/production-orders"
            recordId={order.id}
            key={`photos-${order.id}-${attachmentKey}`}
            onChanged={() => setAttachmentKey(k => k + 1)}
          />
        )}
        {active === 'documents' && (
          <ProductionAttachments
            apiBase="/v1/production-orders"
            recordId={order.id}
            key={`docs-${order.id}-${attachmentKey}`}
            onChanged={() => setAttachmentKey(k => k + 1)}
          />
        )}
        {active === 'timeline' && <TimelineTab events={details.timeline} />}
        {active === 'history' && <HistoryTab rows={details.history} />}
      </div>
    </div>
  );
}
