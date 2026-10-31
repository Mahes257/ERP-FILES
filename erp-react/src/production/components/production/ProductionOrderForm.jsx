import React, { useEffect, useMemo, useState } from 'react';
import Modal from './Modal';
import Icon from '../icons/Icon';
import {
  PRIORITY_OPTIONS,
  nextBatchNumber,
} from '../../data/orders';
import { PRODUCTION_TYPES } from '../../data/entries';
import { PRODUCTION_UNITS } from '../../data/settings';
import { settingsService } from '../../services/production';
import { useSalesOrders } from '../../context/SalesOrdersContext';
import { isCpoReferenceUnserved, withLinkedCpoOption } from '../../utils/salesOrderReadModel';
import { loadData, saveData } from '../../utils/storage';
import { formatDate } from '../../utils/format';
import { cpoNo } from '../../../utils/salesHelpers';
import ItemAttachmentsField from './ItemAttachmentsField';
import './ProductionOrderForm.css';

const typeForDepartment = (department) =>
  department === 'Fabrication' ? 'Fabrication' : department === 'Assembly' ? 'Assembly' : 'Casting';

const todayISO = () => new Date().toISOString().slice(0, 10);

// ============================================================
// Custom editable dropdown: user can type + save new values
// persisted to localStorage under `production.dropdownValues`.
// ============================================================
const DROPDOWN_STORAGE_KEY = 'production.dropdownValues';

const loadDropdownValues = (key, defaults) => {
  const saved = loadData(DROPDOWN_STORAGE_KEY, {});
  const existing = Array.isArray(saved[key]) ? saved[key] : [];
  const all = [...defaults, ...existing];
  const seen = new Set();
  return all.filter((v) => {
    const lower = v.toLowerCase();
    if (seen.has(lower)) return false;
    seen.add(lower);
    return true;
  });
};

const saveDropdownValue = (key, value) => {
  const trimmed = (value || '').trim();
  if (!trimmed) return;
  const saved = loadData(DROPDOWN_STORAGE_KEY, {});
  const existing = Array.isArray(saved[key]) ? saved[key] : [];
  if (existing.some((v) => v.toLowerCase() === trimmed.toLowerCase())) return;
  saved[key] = [...existing, trimmed];
  saveData(DROPDOWN_STORAGE_KEY, saved);
};

function EditableDropdown({ label, value, onChange, options, storageKey, placeholder, disabled }) {
  const [typing, setTyping] = useState(false);
  const [typedValue, setTypedValue] = useState('');

  const allOptions = useMemo(() => loadDropdownValues(storageKey, options), [storageKey, options, typing]);

  const handleSelect = (e) => {
    const val = e.target.value;
    if (val === '__custom__') {
      setTyping(true);
      setTypedValue('');
    } else {
      setTyping(false);
      onChange(val);
    }
  };

  const handleSaveNew = () => {
    const trimmed = typedValue.trim();
    if (!trimmed) return;
    saveDropdownValue(storageKey, trimmed);
    onChange(trimmed);
    setTyping(false);
    setTypedValue('');
  };

  if (typing) {
    return (
      <label className="form-field">
        <span className="form-label">{label}</span>
        <div className="custom-dropdown-typing">
          <input
            className="form-input"
            value={typedValue}
            onChange={(e) => setTypedValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); handleSaveNew(); }
              if (e.key === 'Escape') { setTyping(false); setTypedValue(''); }
            }}
            placeholder={placeholder || 'Type new value...'}
            autoFocus
          />
          <button type="button" className="btn btn-primary custom-dropdown-save-btn" onClick={handleSaveNew} disabled={!typedValue.trim()}>
            <Icon name="check" size={14} /> Save
          </button>
          <button type="button" className="btn btn-secondary custom-dropdown-cancel-btn" onClick={() => { setTyping(false); setTypedValue(''); }}>
            Cancel
          </button>
        </div>
      </label>
    );
  }

  return (
    <label className="form-field">
      <span className="form-label">{label}</span>
      <select className="form-select" value={value} onChange={handleSelect} disabled={disabled}>
        {allOptions.map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
        <option value="__custom__">+ Add new…</option>
      </select>
    </label>
  );
}

// ============================================================
// Default empty item template
// ============================================================
const newItemTemplate = (dueDate = '') => ({
  id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  productName: '',
  productCode: '',
  quantity: '',
  productionType: 'Casting',
  patternNumber: '',
  drawingNumber: '',
  drawingRevision: '',
  batchNumber: '',
  // Item-wise scheduling + attachments. `pendingAttachments` holds the File
  // objects chosen in this form; they are uploaded against the item's saved id
  // once the Work Order exists (see WorkOrderFormPage).
  dueDate,
  pendingAttachments: [],
  removedAttachmentIds: [],
});

// ============================================================
// Build initial form values from an existing order or defaults
// ============================================================
const buildInitialValues = (order, nextWorkOrder, salesOrders = []) => {
  // If editing an existing order, map its items array
  const items = (order?.items && order.items.length > 0)
    ? order.items.map((item) => ({
        id: item.id || `item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        productName: item.productName || '',
        productCode: item.productCode || '',
        quantity: item.quantity || '',
        productionType: item.productionType || 'Casting',
        patternNumber: item.patternNumber || '',
        drawingNumber: item.drawingNumber || '',
        drawingRevision: item.drawingRevision || '',
        batchNumber: item.batchNumber || '',
        // A Work Order saved before item-wise dates existed has none; it opens
        // with the Work Order due date so the record stays editable instead of
        // being blocked by a required field it never had.
        dueDate: item.dueDate || order?.dueDate || '',
        pendingAttachments: [],
        removedAttachmentIds: [],
      }))
    : [newItemTemplate()];

  // Legacy Work Orders stored the SO/CPO number (or nothing) in salesOrderId
  // instead of the Sales Order's database id — resolve to the real id so the
  // CPO dropdown preselects the linked CPO when editing older records.
  let salesOrderId = order?.salesOrderId ?? '';
  if (salesOrderId && salesOrders.length > 0) {
    const matchesOption = salesOrders.some((so) => String(so.id) === String(salesOrderId));
    if (!matchesOption) {
      const byNumber = salesOrders.find(
        (so) => so.salesOrderNumber === salesOrderId
      );
      if (byNumber) salesOrderId = String(byNumber.id);
    }
  }

  return {
    workOrder: order?.workOrder ?? nextWorkOrder ?? '',
    salesOrderId,
    salesOrderNumber: order?.salesOrderNumber ?? '',
    customer: order?.customer ?? '',
    customerCode: order?.customerCode ?? '',
    startDate: order?.startDate ?? todayISO(),
    dueDate: order?.dueDate ?? '',
    priority: order?.priority ?? 'Medium',
    status: order?.status ?? 'Draft',
    remarks: order?.remarks ?? '',
    items,
  };
};

/**
 * Modal form for creating or editing a multi-item production order.
 * Each Work Order can contain multiple production items, each with
 * its own production type, quantity, and stage workflow.
 */
export default function ProductionOrderForm({
  initialValues,
  existingNumbers = [],
  nextWorkOrder,
  orders = [],
  title = 'Work Order',
  onSubmit,
  onCancel,
  fullPage = false,
  asPage = false,
  /** Database id of the Work Order being edited — required to read its items' saved attachments. */
  orderBackendId = null,
}) {
  const {
    salesOrders,
    loading: cposLoading,
    error: cposError,
    loadSalesOrders,
    fetchSalesOrderOption,
  } = useSalesOrders();
  const [values, setValues] = useState(() =>
    buildInitialValues(initialValues, nextWorkOrder, salesOrders)
  );
  const [error, setError] = useState('');
  // Per-item validation messages, keyed by the item's form id and rendered next
  // to the offending Due Date field.
  const [itemErrors, setItemErrors] = useState({});

  // ---- Production Parameters (Settings → Production Parameters) ----
  // The saved parameter set seeds a NEW work order — priority, department (which
  // is the item's production type), the due-date grace period and the unit.
  // The backend pins a created order to Draft, so `defaultProductionStatus`
  // does not apply here; it seeds new shop floor jobs instead.
  const [parameters, setParameters] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await settingsService.loadParameters();
        if (!cancelled) setParameters(response.data || {});
      } catch {
        // Without the saved parameters the form keeps its built-in defaults.
        if (!cancelled) setParameters(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Apply the parameters once they arrive — only to an untouched NEW order, and
  // only to fields still holding the form's own default, so nothing an operator
  // (or a saved order) already provided is overwritten.
  useEffect(() => {
    if (!parameters || initialValues) return;
    const priority = PRIORITY_OPTIONS.includes(parameters.defaultProductionPriority)
      ? parameters.defaultProductionPriority
      : null;
    const graceDays = Number(parameters.defaultDueDateGracePeriod);
    const itemType = parameters.defaultDepartment
      ? typeForDepartment(parameters.defaultDepartment)
      : null;

    // Deferred one microtask, the idiom this codebase uses for a load-time
    // default, so the seed never triggers a cascading render inside the effect.
    queueMicrotask(() => setValues((prev) => {
      const next = { ...prev };
      if (priority && prev.priority === 'Medium') {
        next.priority = priority;
      }
      if (!prev.dueDate && prev.startDate && Number.isFinite(graceDays) && graceDays > 0) {
        const due = new Date(`${prev.startDate}T00:00:00`);
        if (!Number.isNaN(due.getTime())) {
          due.setDate(due.getDate() + graceDays);
          // Formatted from LOCAL date parts, never toISOString(): the date is
          // built at local midnight, so converting it to UTC in any positive
          // offset (IST here) moved it back a day and a 5-day grace period
          // produced a due date only 4 days out.
          next.dueDate = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, '0')}-${String(due.getDate()).padStart(2, '0')}`;
        }
      }
      if (itemType) {
        next.items = prev.items.map((item) =>
          !item.productName && !item.patternNumber && item.productionType === 'Casting'
            ? { ...item, productionType: itemType }
            : item
        );
      }
      return next;
    }));
  }, [parameters, initialValues]);

  // ---- CPO Reference display for an ALREADY-SAVED link ----
  // The option feed serves only the current row of each CPO revision chain, so
  // a Work Order saved against a since-superseded revision had no matching
  // <option> and its CPO Reference rendered BLANK even though the link was
  // still stored. The one linked CPO is therefore read by id (existing
  // endpoint) and offered as an extra option — plus a fallback label carrying
  // the saved reference when even that read fails. The saved value itself is
  // never rewritten; only the display is completed.
  const [linkedCpoOption, setLinkedCpoOption] = useState(null);
  const savedCpoRef = values.salesOrderId;

  useEffect(() => {
    if (!savedCpoRef || cposLoading) return undefined;
    if (!isCpoReferenceUnserved(salesOrders, savedCpoRef)) return undefined;
    let cancelled = false;
    (async () => {
      const option = await fetchSalesOrderOption(savedCpoRef);
      // Written from the async path only — never synchronously in the effect.
      if (cancelled || !option) return;
      setLinkedCpoOption((prev) =>
        prev && String(prev.id) === String(option.id) && prev.salesOrderNumber === option.salesOrderNumber
          ? prev
          : option
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [savedCpoRef, cposLoading, salesOrders, fetchSalesOrderOption]);

  const cpoOptions = useMemo(
    () =>
      withLinkedCpoOption({
        options: salesOrders,
        value: savedCpoRef,
        option: linkedCpoOption,
        fallbackLabel: initialValues?.salesOrderNumber,
      }),
    [salesOrders, savedCpoRef, linkedCpoOption, initialValues]
  );

  // The CPO list loads asynchronously after mount. When editing a legacy Work
  // Order whose salesOrderId stored the SO/CPO number instead of the Sales
  // Order's database id, resolve it to the real id once the list is available
  // so the CPO dropdown preselects the linked CPO.
  useEffect(() => {
    if (!values.salesOrderId || cposLoading || salesOrders.length === 0) return;
    const matchesOption = salesOrders.some(
      (so) => String(so.id) === String(values.salesOrderId)
    );
    if (matchesOption) return;
    const byNumber = salesOrders.find(
      (so) => so.salesOrderNumber === values.salesOrderId
    );
    if (byNumber) {
      setValues((prev) => ({ ...prev, salesOrderId: String(byNumber.id) }));
    }
  }, [salesOrders, cposLoading, values.salesOrderId]);

  const set = (key) => (e) => setValues((prev) => ({ ...prev, [key]: e.target.value }));

  // ---- Items management ----
  const addItem = () => {
    setValues((prev) => ({
      ...prev,
      // A new item starts with the Work Order due date as a convenience — it is
      // an independent value from then on and is never re-synced when the Work
      // Order date changes.
      items: [...prev.items, newItemTemplate(prev.dueDate)],
    }));
  };

  const removeItem = (itemId) => {
    setValues((prev) => ({
      ...prev,
      items: prev.items.length <= 1 ? prev.items : prev.items.filter((i) => i.id !== itemId),
    }));
    clearItemError(itemId);
  };

  const clearItemError = (itemId) => {
    setItemErrors((prev) => {
      if (!prev[itemId]) return prev;
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
  };

  const updateItem = (itemId, key, val) => {
    setValues((prev) => ({
      ...prev,
      items: prev.items.map((item) => {
        if (item.id !== itemId) return item;
        const updated = { ...item, [key]: val };
        // Auto-generate batch number when production type changes
        if (key === 'productionType' && !initialValues) {
          updated.batchNumber = nextBatchNumber(orders, val);
        }
        return updated;
      }),
    }));
    // Editing the highlighted date clears that item's message; the whole form is
    // re-validated on save anyway.
    if (key === 'dueDate') clearItemError(itemId);
  };

  // ---- Item-wise attachments (staged locally until the Work Order is saved) ----
  const addItemFiles = (itemId, files) => {
    if (!files || files.length === 0) return;
    setValues((prev) => ({
      ...prev,
      items: prev.items.map((item) =>
        item.id === itemId
          ? { ...item, pendingAttachments: [...item.pendingAttachments, ...files] }
          : item
      ),
    }));
  };

  const removeItemFile = (itemId, index) => {
    setValues((prev) => ({
      ...prev,
      items: prev.items.map((item) =>
        item.id === itemId
          ? {
              ...item,
              pendingAttachments: item.pendingAttachments.filter((_, i) => i !== index),
            }
          : item
      ),
    }));
  };

  const markAttachmentRemoved = (itemId, attachmentId) => {
    setValues((prev) => ({
      ...prev,
      items: prev.items.map((item) =>
        item.id === itemId
          ? {
              ...item,
              removedAttachmentIds: Array.from(
                new Set([...item.removedAttachmentIds, attachmentId])
              ),
            }
          : item
      ),
    }));
  };

  // ---- CPO (Sales Order) handling ----
  // Reads the picked option from the RENDERED list, so re-picking the linked
  // historical CPO keeps its number/customer instead of clearing them.
  const linkedCpo = values.salesOrderId
    ? cpoOptions.find(
        (so) =>
          String(so.id) === String(values.salesOrderId) ||
          (so.salesOrderId != null && String(so.salesOrderId) === String(values.salesOrderId))
      )
    : null;
  // Only an option backed by real CPO data yields the confirmation line — the
  // saved-reference fallback carries no item count and must not claim "0 items".
  const linkedCpoDetail =
    linkedCpo && (linkedCpo.salesOrderId != null || linkedCpo.itemCount > 0) ? linkedCpo : null;

  const handleCpoChange = (e) => {
    const so = cpoOptions.find((s) => String(s.id) === String(e.target.value));
    if (!so) {
      setValues((prev) => ({
        ...prev,
        salesOrderId: '',
        salesOrderNumber: '',
        customer: '',
        customerCode: '',
      }));
      return;
    }
    setValues((prev) => ({
      ...prev,
      salesOrderId: String(so.id),
      salesOrderNumber: so.salesOrderNumber,
      customer: so.customerName || '',
      customerCode: so.customerCode || '',
    }));
  };

  // ---- Validation + Submit ----
  const handleSubmit = (e) => {
    e.preventDefault();
    if (!values.workOrder.trim()) {
      setError('Work Order number is required.');
      return;
    }
    if (!values.startDate || !values.dueDate) {
      setError('Start Date and Due Date are required.');
      return;
    }
    if (new Date(values.dueDate) < new Date(values.startDate)) {
      setError('Due date must be on or after the start date.');
      return;
    }
    if (!initialValues && existingNumbers.includes(values.workOrder.trim())) {
      setError('A work order with this number already exists.');
      return;
    }
    // Validate items
    if (!values.items || values.items.length === 0) {
      setError('At least one production item is required.');
      return;
    }
    const dueDateErrors = {};
    for (let i = 0; i < values.items.length; i++) {
      const item = values.items[i];
      if (!item.productName.trim()) {
        setError(`Item ${i + 1}: Order Description is required.`);
        return;
      }
      if (!item.quantity || Number(item.quantity) <= 0) {
        setError(`Item ${i + 1}: Quantity must be greater than zero.`);
        return;
      }
      // Dates are yyyy-mm-dd, so they compare correctly as strings (no timezone
      // shift from parsing them into Date objects).
      if (!item.dueDate) {
        dueDateErrors[item.id] = 'Due date is required.';
      } else if (values.startDate && item.dueDate < values.startDate) {
        dueDateErrors[item.id] =
          `Cannot be earlier than the Work Order start date (${formatDate(values.startDate)}).`;
      } else if (values.dueDate && item.dueDate > values.dueDate) {
        dueDateErrors[item.id] =
          `Cannot be later than the Work Order due date (${formatDate(values.dueDate)}).`;
      }
    }

    setItemErrors(dueDateErrors);
    if (Object.keys(dueDateErrors).length > 0) {
      setError('Fix the highlighted Production Item dates.');
      return;
    }

    setError('');
    // Build the order object with items
    const firstItem = values.items[0];
    onSubmit({
      workOrder: values.workOrder.trim(),
      salesOrderId: String(values.salesOrderId || ''),
      salesOrderNumber: values.salesOrderNumber,
      customer: values.customer.trim(),
      customerCode: values.customerCode,
      startDate: values.startDate,
      dueDate: values.dueDate,
      priority: values.priority,
      status: values.status || 'Draft',
      remarks: values.remarks,
      // Legacy fields from first item (kept for backward compat)
      product: firstItem.productName,
      productCode: firstItem.productCode,
      quantity: firstItem.quantity,
      productionType: firstItem.productionType,
      department: firstItem.productionType,
      patternNumber: firstItem.patternNumber,
      drawingNumber: firstItem.drawingNumber,
      drawingRevision: firstItem.drawingRevision,
      batchNumber: firstItem.batchNumber,
      currentStage: firstItem.productionType,
      items: values.items.map((item) => ({
        id: item.id,
        productName: item.productName.trim(),
        productCode: item.productCode.trim(),
        quantity: Number(item.quantity) || 0,
        // Item-wise schedule and attachment changes travel with the item they
        // belong to; the save flow applies them after the Work Order (and its
        // item ids) exists.
        dueDate: item.dueDate || '',
        pendingAttachments: item.pendingAttachments || [],
        removedAttachmentIds: item.removedAttachmentIds || [],
        producedQty: initialValues?.items?.find((oi) => oi.id === item.id)?.producedQty || 0,
        rejectedQty: initialValues?.items?.find((oi) => oi.id === item.id)?.rejectedQty || 0,
        productionType: item.productionType,
        department: item.productionType,
        currentStage: item.productionType,
        status: 'Pending',
        batchNumber: item.batchNumber || nextBatchNumber(orders, item.productionType),
        patternNumber: item.patternNumber,
        drawingNumber: item.drawingNumber,
        drawingRevision: item.drawingRevision || '',
        // Default unit from the saved parameters (Settings → Production
        // Parameters). It used to be hardcoded empty, so the column was never
        // populated by this form at all.
        unit: PRODUCTION_UNITS.includes(parameters?.defaultProductionUnit)
          ? parameters.defaultProductionUnit
          : '',
      })),
    });
  };

  const formActions = (
    <>
      <button type="button" className="btn btn-secondary" onClick={onCancel}>
        Cancel
      </button>
      <button type="submit" form="production-order-form" className="btn btn-primary">
        <Icon name="check" size={15} /> Save
      </button>
    </>
  );

  const formFields = (
    <form id="production-order-form" className="po-form" onSubmit={handleSubmit}>
        {/* ===== WORK ORDER HEADER ===== */}
        <div className="form-grid">
          <label className="form-field form-field-wide">
            <span className="form-label">Work Order Number *</span>
            <input
              className="form-input"
              value={values.workOrder}
              onChange={set('workOrder')}
              placeholder="WO-0001"
              disabled
            />
            <span className="form-hint">Auto-generated — the Work Order Number is the primary identifier</span>
          </label>

          <label className="form-field form-field-wide">
            <span className="form-label">CPO Reference *</span>
            <select
              className="form-select"
              value={values.salesOrderId}
              onChange={handleCpoChange}
              disabled={cposLoading}
              aria-label="CPO Reference"
            >
              <option value="">
                {cposLoading
                  ? 'Loading CPOs...'
                  : cpoOptions.length
                    ? 'Select a CPO (Customer Purchase Order)...'
                    : 'No CPOs available — create one in Sales first'}
              </option>
              {cpoOptions.map((so) => (
                <option key={so.id} value={so.id}>
                  {/* Item counts come from the slim option feed (itemCount) — the
                      full Sales Order line items are no longer bulk-loaded. A
                      linked historical CPO that could not be read carries no
                      count, so none is printed rather than a misleading "0". */}
                  {cpoNo(so.salesOrderNumber) || so.salesOrderNumber}
                  {so.itemCount != null ? ` · ${so.itemCount} item${so.itemCount === 1 ? '' : 's'}` : ''}
                  {so.customerName ? ` · ${so.customerName}` : ''}
                  {so.orderDate ? ` · PO: ${formatDate(so.orderDate)}` : ''}
                </option>
              ))}
            </select>
            {cposError && !cposLoading && (
              <span className="cpo-select-error">
                <Icon name="info" size={13} /> Couldn't load CPOs from Sales.
                <button
                  type="button"
                  className="cpo-retry-btn"
                  onClick={loadSalesOrders}
                >
                  Retry
                </button>
              </span>
            )}
            {linkedCpoDetail && (
              <span className="cpo-select-info">
                <Icon name="check-circle" size={12} />
                {cpoNo(linkedCpoDetail.salesOrderNumber) || linkedCpoDetail.salesOrderNumber}
                {' · '}{linkedCpoDetail.itemCount} item{linkedCpoDetail.itemCount === 1 ? '' : 's'}
                {linkedCpoDetail.customerName ? ` · ${linkedCpoDetail.customerName}` : ''}
                {linkedCpoDetail.orderDate ? ` · PO Date: ${formatDate(linkedCpoDetail.orderDate)}` : ''}
              </span>
            )}
          </label>

          <label className="form-field">
            <span className="form-label">Customer / Vendor</span>
            <input
              className="form-input"
              value={values.customer}
              onChange={set('customer')}
              placeholder="Customer name"
            />
          </label>

          <label className="form-field">
            <span className="form-label">Start Date *</span>
            <input type="date" className="form-input" value={values.startDate} onChange={set('startDate')} />
          </label>

          <label className="form-field">
            <span className="form-label">Due Date *</span>
            <input type="date" className="form-input" value={values.dueDate} onChange={set('dueDate')} />
          </label>

          <EditableDropdown
            label="Priority"
            value={values.priority}
            onChange={(val) => setValues((prev) => ({ ...prev, priority: val }))}
            options={PRIORITY_OPTIONS}
            storageKey="priority"
            placeholder="Type priority..."
          />

          <label className="form-field form-field-wide">
            <span className="form-label">Remarks</span>
            <textarea
              className="form-textarea"
              rows={2}
              value={values.remarks}
              onChange={set('remarks')}
              placeholder="Optional notes about this Work Order..."
            />
          </label>
        </div>

        {/* ===== PRODUCTION ITEMS ===== */}
        <div className="wo-items-section">
          <div className="wo-items-header">
            <h4 className="wo-items-title">
              <Icon name="layers" size={15} /> Production Items
            </h4>
            <span className="wo-items-count">{values.items.length} item{values.items.length !== 1 ? 's' : ''}</span>
          </div>
          <p className="wo-items-hint">
            Add one or more items to this Work Order. Each item follows its own Production Type workflow independently.
          </p>

          {values.items.map((item, idx) => (
            <div key={item.id} className="wo-item-card">
              <div className="wo-item-card-header">
                <span className="wo-item-number">Item {idx + 1}</span>
                {values.items.length > 1 && (
                  <button
                    type="button"
                    className="btn-icon btn-icon-danger"
                    title="Remove this item"
                    onClick={() => removeItem(item.id)}
                  >
                    <Icon name="trash" size={14} />
                  </button>
                )}
              </div>

              <div className="form-grid">
                <label className="form-field">
                  <span className="form-label">Order Description *</span>
                  <input
                    className="form-input"
                    value={item.productName}
                    onChange={(e) => updateItem(item.id, 'productName', e.target.value)}
                    placeholder="Item name / description"
                  />
                </label>

                <label className="form-field">
                  <span className="form-label">Item Code</span>
                  <input
                    className="form-input"
                    value={item.productCode}
                    onChange={(e) => updateItem(item.id, 'productCode', e.target.value)}
                    placeholder="Optional item code"
                  />
                </label>

                <label className="form-field">
                  <span className="form-label">Production Type *</span>
                  <select
                    className="form-select"
                    value={item.productionType}
                    onChange={(e) => updateItem(item.id, 'productionType', e.target.value)}
                  >
                    {PRODUCTION_TYPES.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </label>

                <label className="form-field">
                  <span className="form-label">Quantity *</span>
                  <input
                    type="number"
                    min="1"
                    className="form-input"
                    value={item.quantity}
                    onChange={(e) => updateItem(item.id, 'quantity', e.target.value)}
                    placeholder="0"
                  />
                </label>

                <label className="form-field">
                  <span className="form-label">Due Date *</span>
                  <input
                    type="date"
                    className={`form-input${itemErrors[item.id] ? ' wo-input-invalid' : ''}`}
                    value={item.dueDate || ''}
                    onChange={(e) => updateItem(item.id, 'dueDate', e.target.value)}
                    aria-invalid={Boolean(itemErrors[item.id])}
                    aria-describedby={itemErrors[item.id] ? `wo-item-due-${item.id}` : undefined}
                  />
                  {itemErrors[item.id] ? (
                    <span className="wo-item-field-error" id={`wo-item-due-${item.id}`} role="alert">
                      <Icon name="info" size={12} /> {itemErrors[item.id]}
                    </span>
                  ) : (
                    <span className="form-hint">Item due date — independent of the Work Order due date</span>
                  )}
                </label>

                <label className="form-field">
                  <span className="form-label">Drawing Number</span>
                  <input
                    className="form-input"
                    value={item.drawingNumber}
                    onChange={(e) => updateItem(item.id, 'drawingNumber', e.target.value)}
                    placeholder="DWG-1025"
                  />
                </label>

                <label className="form-field">
                  <span className="form-label">Drawing Revision</span>
                  <input
                    className="form-input"
                    value={item.drawingRevision}
                    onChange={(e) => updateItem(item.id, 'drawingRevision', e.target.value)}
                    placeholder="Rev A"
                  />
                </label>

                <label className="form-field">
                  <span className="form-label">Pattern Number</span>
                  <input
                    className="form-input"
                    value={item.patternNumber}
                    onChange={(e) => updateItem(item.id, 'patternNumber', e.target.value)}
                    placeholder="PAT-025"
                  />
                </label>
              </div>

              {/* ===== ITEM-WISE ATTACHMENTS ===== */}
              <ItemAttachmentsField
                orderId={orderBackendId}
                item={item}
                onAddFiles={addItemFiles}
                onRemoveFile={removeItemFile}
                onRemoveExisting={markAttachmentRemoved}
              />
            </div>
          ))}

          <button type="button" className="btn btn-secondary wo-add-item-btn" onClick={addItem}>
            <Icon name="plus" size={14} /> Add Item
          </button>
        </div>

        {error && (
          <p className="form-error">
            <Icon name="info" size={14} /> {error}
          </p>
        )}
      </form>
  );

  if (asPage) {
    // Standalone full-page mode (route /production/orders/new and
    // /production/orders/:id/edit): the form is rendered directly in the
    // application workspace — no modal, no portal, nothing rendered behind it.
    return (
      <div className="wo-form-page">
        {formFields}
        <div className="wo-form-page-actions">{formActions}</div>
      </div>
    );
  }

  return (
    <Modal
      title={title}
      size="lg"
      fullPage={fullPage}
      onClose={onCancel}
      footer={formActions}
    >
      {formFields}
    </Modal>
  );
}
