import React, { useEffect, useMemo, useState } from 'react';
import Modal from '../Modal';
import FormPageShell from '../FormPageShell';
import Icon from '../../icons/Icon';
import { DEPARTMENT_OPTIONS } from '../../../data/orders';
import { INSPECTION_TYPES, QUALITY_STATUSES } from '../../../data/quality';
import { settingsService } from '../../../services/production';

const todayISO = () => new Date().toISOString().slice(0, 10);

// ============================================================
// Default empty dimensional inspection row
// ============================================================
const newDimRow = () => ({
  drawingDimension: '',
  measured1: '',
  measured2: '',
  measured3: '',
  measured4: '',
  measured5: '',
  remarks: '',
});

// ============================================================
// Build initial QC data from existing inspection or Work Order
// ============================================================
const buildQcData = (inspection, order, item) => ({
  inspectionReport: {
    customer: inspection?.inspectionReport?.customer ?? order?.customer ?? '',
    componentDescription: inspection?.inspectionReport?.componentDescription ?? item?.productName ?? inspection?.product ?? '',
    drawingNumber: inspection?.inspectionReport?.drawingNumber ?? item?.drawingNumber ?? '',
    quantity: inspection?.inspectionReport?.quantity ?? item?.quantity ?? inspection?.quantityInspected ?? '',
    reportNumber: inspection?.inspectionReport?.reportNumber ?? inspection?.id ?? '',
    date: inspection?.inspectionReport?.date ?? inspection?.inspectionDate ?? todayISO(),
  },
  dimensionalInspection: inspection?.dimensionalInspection?.length
    ? inspection.dimensionalInspection
    : [newDimRow(), newDimRow(), newDimRow(), newDimRow(), newDimRow()],
  materialTestCertificate: {
    chemicalAnalysis: {
      c: inspection?.materialTestCertificate?.chemicalAnalysis?.c ?? '',
      si: inspection?.materialTestCertificate?.chemicalAnalysis?.si ?? '',
      mn: inspection?.materialTestCertificate?.chemicalAnalysis?.mn ?? '',
      s: inspection?.materialTestCertificate?.chemicalAnalysis?.s ?? '',
      p: inspection?.materialTestCertificate?.chemicalAnalysis?.p ?? '',
      cr: inspection?.materialTestCertificate?.chemicalAnalysis?.cr ?? '',
      ni: inspection?.materialTestCertificate?.chemicalAnalysis?.ni ?? '',
      mo: inspection?.materialTestCertificate?.chemicalAnalysis?.mo ?? '',
    },
    mechanicalProperties: {
      ys: inspection?.materialTestCertificate?.mechanicalProperties?.ys ?? '',
      ts: inspection?.materialTestCertificate?.mechanicalProperties?.ts ?? '',
      hardness: inspection?.materialTestCertificate?.mechanicalProperties?.hardness ?? '',
      impact: inspection?.materialTestCertificate?.mechanicalProperties?.impact ?? '',
      elongation: inspection?.materialTestCertificate?.mechanicalProperties?.elongation ?? '',
    },
  },
  finalQcInfo: {
    heatNo: inspection?.finalQcInfo?.heatNo ?? '',
    partNo: inspection?.finalQcInfo?.partNo ?? '',
    itemDescription: inspection?.finalQcInfo?.itemDescription ?? item?.productName ?? inspection?.product ?? '',
    drawingNo: inspection?.finalQcInfo?.drawingNo ?? item?.drawingNumber ?? '',
    dispatchQty: inspection?.finalQcInfo?.dispatchQty ?? item?.quantity ?? '',
  },
});

const buildInitialValues = (inspection) => ({
  id: inspection?.id ?? '',
  productionOrder: inspection?.productionOrder ?? '',
  // Round-trip the stored item link. Left `undefined` when the record has none
  // (an inspection created before the column was populated) so the field is
  // omitted rather than posted as an empty string.
  workOrderItemId: inspection?.workOrderItemId ?? undefined,
  workOrder: inspection?.workOrder ?? '',
  product: inspection?.product ?? '',
  department: inspection?.department ?? 'Casting',
  inspectionType: inspection?.inspectionType ?? 'Final',
  inspectionDate: inspection?.inspectionDate ?? todayISO(),
  inspector: inspection?.inspector ?? '',
  quantityInspected: inspection?.quantityInspected ?? '',
  acceptedQuantity: inspection?.acceptedQuantity ?? '',
  rejectedQuantity: inspection?.rejectedQuantity ?? '',
  status: inspection?.status ?? 'Pending',
  remarks: inspection?.remarks ?? '',
});

const REQUIRED = [
  'id',
  'productionOrder',
  'workOrder',
  'product',
  'department',
  'inspectionType',
  'inspectionDate',
  'inspector',
  'quantityInspected',
];

/**
 * Modal form for creating or editing a QC inspection.
 * Includes ALL Excel-based QC sections:
 *   1. Quality Inspection Report (auto-filled from Work Order)
 *   2. Dimensional Inspection table
 *   3. Material Test Certificate (Chemical + Mechanical)
 *   4. Final QC / Dispatch Details
 *
 * `initialValues` is an existing inspection (edit) or null (create).
 * `orders` are the user-created Work Orders (the master). Selecting a
 * Work Order auto-loads its Customer, Item Name, Drawing Number,
 * Quantity — the user enters only QC-specific fields.
 *
 * `layout`: 'modal' (default) keeps the classic overlay behaviour; 'page'
 * renders the very same form as an in-flow full page (used by the dedicated
 * `quality/new` route so the Quality list is not rendered behind it).
 */
export default function QualityForm({
  initialValues,
  existingIds = [],
  orders = [],
  title = 'Inspection',
  onSubmit,
  onCancel,
  submitError = '',
  fullPage = false,
  layout = 'modal',
}) {
  const orderOptions = orders.map((order) => ({
    value: order.workOrder,
    label: order.workOrder,
  }));

  const findOrder = (wo) => orders.find((order) => order.workOrder === wo);

  const masterFromOrder = (order) => {
    if (!order) return null;
    const item = order.items?.[0];
    return {
      workOrder: order.workOrder ?? '',
      product: item?.productName || order.product || '',
      department: item?.productionType || order.department || '',
      customer: order.customer ?? '',
      drawingNumber: item?.drawingNumber || order.drawingNumber || '',
      quantity: item?.quantity || order.quantity || '',
      // The Work Order ITEM's numeric id (`production_order_items.id`) — the
      // column `quality_inspections.work_order_item_id`. It was never sent, so
      // every inspection stored NULL and the record could not be tied back to
      // the item it inspects. `undefined` (not '') so JSON.stringify omits it
      // rather than posting a value the Long binding would reject.
      workOrderItemId: item?.id ?? undefined,
    };
  };

  // Find Work Order item selection
  const [selectedWoItemIndex, setSelectedWoItemIndex] = useState(0);

  const selectedOrder = useMemo(
    () => findOrder(initialValues?.productionOrder || ''),
    [initialValues, orders]
  );

  const orderItems = useMemo(
    () => selectedOrder?.items || [],
    [selectedOrder]
  );

  const [values, setValues] = useState(() => {
    const base = buildInitialValues(initialValues);
    const extra = masterFromOrder(findOrder(base.productionOrder));
    return extra ? { ...base, ...extra } : base;
  });

  // ---- Production Parameters (Settings → Production Parameters) ----
  // 'Default Inspection Type' seeds a NEW inspection. Loaded values never
  // overwrite a saved inspection or a choice the inspector has already made,
  // and only a type the form actually offers is applied.
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

  useEffect(() => {
    if (!parameters || initialValues) return;
    const configured = parameters.defaultInspectionType;
    if (!INSPECTION_TYPES.includes(configured)) return;
    // Deferred one microtask, the idiom this codebase uses for a load-time
    // default, so the seed never triggers a cascading render inside the effect.
    queueMicrotask(() => setValues((prev) =>
      prev.inspectionType === 'Final' ? { ...prev, inspectionType: configured } : prev
    ));
  }, [parameters, initialValues]);

  // QC-specific data (all Excel-based sections)
  const [qcData, setQcData] = useState(() => {
    const order = findOrder(values.productionOrder);
    const item = order?.items?.[selectedWoItemIndex];
    return buildQcData(initialValues, order, item);
  });

  // Re-build QC data when Work Order selection changes
  useEffect(() => {
    if (!values.productionOrder) return;
    const order = findOrder(values.productionOrder);
    const item = order?.items?.[selectedWoItemIndex];
    setQcData(buildQcData(initialValues, order, item));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values.productionOrder, selectedWoItemIndex]);

  const [error, setError] = useState('');
  // True while the page is persisting this form, so a second click on either
  // footer action cannot issue a duplicate inspection create/update.
  const [saving, setSaving] = useState(false);

  const set = (key) => (e) => setValues((prev) => ({ ...prev, [key]: e.target.value }));

  // Selecting a Work Order loads its master information
  const handleWorkOrderChange = (e) => {
    const value = e.target.value;
    setSelectedWoItemIndex(0);
    setValues((prev) => {
      const extra = masterFromOrder(findOrder(value));
      return extra ? { ...prev, productionOrder: value, ...extra } : { ...prev, productionOrder: value };
    });
  };

  // Select a specific item within the Work Order
  const handleItemSelect = (index) => {
    setSelectedWoItemIndex(index);
    const order = findOrder(values.productionOrder);
    const item = order?.items?.[index];
    if (item) {
      setValues((prev) => ({
        ...prev,
        product: item.productName || prev.product,
        quantityInspected: item.quantity || prev.quantityInspected,
        workOrderItemId: item.id ?? prev.workOrderItemId,
      }));
    }
  };

  // ---- QC Data Update Helpers ----
  const updateReport = (field, value) => {
    setQcData((prev) => ({
      ...prev,
      inspectionReport: { ...(prev.inspectionReport || {}), [field]: value },
    }));
  };

  const updateDimRow = (index, field, value) => {
    setQcData((prev) => {
      const rows = [...(prev.dimensionalInspection || [])];
      rows[index] = { ...rows[index], [field]: value };
      return { ...prev, dimensionalInspection: rows };
    });
  };

  const addDimRow = () => {
    setQcData((prev) => ({
      ...prev,
      dimensionalInspection: [...(prev.dimensionalInspection || []), newDimRow()],
    }));
  };

  const removeDimRow = (index) => {
    setQcData((prev) => ({
      ...prev,
      dimensionalInspection: (prev.dimensionalInspection || []).filter((_, i) => i !== index),
    }));
  };

  const updateChemical = (field, value) => {
    setQcData((prev) => ({
      ...prev,
      materialTestCertificate: {
        ...prev.materialTestCertificate,
        chemicalAnalysis: {
          ...(prev.materialTestCertificate?.chemicalAnalysis || {}),
          [field]: value,
        },
      },
    }));
  };

  const updateMechanical = (field, value) => {
    setQcData((prev) => ({
      ...prev,
      materialTestCertificate: {
        ...prev.materialTestCertificate,
        mechanicalProperties: {
          ...(prev.materialTestCertificate?.mechanicalProperties || {}),
          [field]: value,
        },
      },
    }));
  };

  const updateFinalQc = (field, value) => {
    setQcData((prev) => ({
      ...prev,
      finalQcInfo: { ...(prev.finalQcInfo || {}), [field]: value },
    }));
  };

  // ---- Submit ----
  /* ONE validation + payload path for both footer actions. "Save" and
     "Save and Continue" differ only in where the page navigates afterwards,
     so the two buttons can never validate or persist differently. Returns
     null when validation fails: the error is shown and every entered value
     stays on the form. */
  const buildPayload = () => {
    const missing = REQUIRED.find((key) => !String(values[key] ?? '').trim());
    if (missing) {
      setError('Please complete all required fields.');
      return null;
    }

    const inspected = Number(values.quantityInspected) || 0;
    const accepted = Number(values.acceptedQuantity) || 0;
    const rejected = Number(values.rejectedQuantity) || 0;
    if (inspected < 0 || accepted < 0 || rejected < 0) {
      setError('Quantities cannot be negative.');
      return null;
    }
    if (accepted + rejected > inspected) {
      setError('Accepted + rejected quantity cannot exceed the quantity inspected.');
      return null;
    }
    if (!initialValues && existingIds.includes(values.id.trim())) {
      setError('An inspection with this ID already exists.');
      return null;
    }

    // The list row and the preview panel read the top-level `customer`, and this
    // payload is built field by field (it does not spread `values`), so the value
    // `buildInitialValues`/`masterFromOrder` had already auto-filled from the Work
    // Order was dropped here — every inspection therefore showed a blank CUSTOMER
    // column. Sent only when known, so a blank never overwrites a stored value.
    const customer = (qcData.inspectionReport?.customer || values.customer || '').trim();

    setError('');
    return {
      // Basic inspection fields
      id: values.id.trim(),
      ...(customer ? { customer } : {}),
      productionOrder: values.productionOrder.trim(),
      workOrder: values.workOrder.trim(),
      // The Work Order ITEM's numeric id. This payload is built field by field
      // (it does not spread `values`), so the value loaded by `masterFromOrder`
      // and `handleItemSelect` was dropped here — which is why every inspection
      // was stored with a NULL item link. Sent only when known: the backend
      // binds it to a Long, so an empty string would be rejected.
      ...(values.workOrderItemId ? { workOrderItemId: Number(values.workOrderItemId) } : {}),
      product: values.product.trim(),
      department: values.department,
      inspectionType: values.inspectionType,
      inspectionDate: values.inspectionDate,
      inspector: values.inspector.trim(),
      quantityInspected: inspected,
      acceptedQuantity: accepted,
      rejectedQuantity: rejected,
      status: values.status,
      remarks: values.remarks.trim(),
      // Excel-based QC sections. The report number field advertises itself as
      // "Auto-generated from Inspection ID", but on create the QC data is built
      // before the id is known, so it stayed blank — default it to the id here.
      inspectionReport: {
        ...(qcData.inspectionReport || {}),
        reportNumber: String(qcData.inspectionReport?.reportNumber || '').trim() || values.id.trim(),
      },
      dimensionalInspection: qcData.dimensionalInspection,
      materialTestCertificate: qcData.materialTestCertificate,
      finalQcInfo: qcData.finalQcInfo,
    };
  };

  /* Both footer actions await the page's save, so the buttons stay disabled
     while the request is in flight and only one record is ever created. A
     failed save leaves this component mounted with every entered value. */
  const submit = async (mode) => {
    if (saving) return;
    const payload = buildPayload();
    if (!payload) return;
    setSaving(true);
    try {
      await onSubmit(payload, { mode });
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    submit('save');
  };

  // Derived values
  const ir = qcData.inspectionReport || {};
  const di = qcData.dimensionalInspection || [];
  const chem = qcData.materialTestCertificate?.chemicalAnalysis || {};
  const mech = qcData.materialTestCertificate?.mechanicalProperties || {};
  const fq = qcData.finalQcInfo || {};

  const formFooter = (
    <>
      <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>
        Cancel
      </button>
      <button type="submit" form="quality-form" className="btn btn-primary" disabled={saving}>
        <Icon name="check" size={15} /> Save
      </button>
      {/* Same save, then the saved inspection's preview — the page decides the
          destination once the request has succeeded. */}
      <button type="button" className="btn btn-secondary" onClick={() => submit('continue')} disabled={saving}>
        <Icon name="play" size={15} /> Save and Continue
      </button>
    </>
  );

  /* The same form body backs both the overlay (edit from the list) and the
     dedicated create page — no second copy of the fields. */
  const formBody = (
      <form id="quality-form" className="po-form" onSubmit={handleSubmit}>

        {/* ===== BASIC INSPECTION FIELDS ===== */}
        <div className="form-grid">
          <label className="form-field">
            <span className="form-label">Inspection ID *</span>
            {/* Editing keeps the persisted identifier: it is the key the
                update targets, so changing it here could only aim the save at
                a record that does not exist. */}
            <input
              className="form-input"
              value={values.id}
              onChange={set('id')}
              placeholder="QI-001"
              readOnly={Boolean(initialValues)}
              aria-readonly={Boolean(initialValues)}
            />
          </label>

          <label className="form-field">
            <span className="form-label">Work Order *</span>
            {orderOptions.length > 0 ? (
              <select className="form-select" value={values.productionOrder} onChange={handleWorkOrderChange}>
                <option value="">Select a Work Order…</option>
                {orderOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            ) : (
              <input className="form-input" value={values.productionOrder} onChange={set('productionOrder')} placeholder="WO-0001" />
            )}
            {orderOptions.length === 0 && (
              <span className="form-hint">No Work Orders available. Create a Work Order first.</span>
            )}
          </label>

          {/* Work Order Item selection (multi-item support) */}
          {orderItems.length > 1 && (
            <label className="form-field form-field-wide">
              <span className="form-label">Select Work Order Item</span>
              <div className="qc-item-selector">
                {orderItems.map((item, idx) => (
                  <button
                    key={item.id || idx}
                    type="button"
                    className={`qc-item-chip ${idx === selectedWoItemIndex ? 'active' : ''}`}
                    onClick={() => handleItemSelect(idx)}
                  >
                    {item.productName || `Item ${idx + 1}`}
                    <span className="qc-item-chip-qty">Qty: {item.quantity}</span>
                  </button>
                ))}
              </div>
            </label>
          )}

          <label className="form-field form-field-wide">
            <span className="form-label">Item Name *</span>
            <input className="form-input" value={values.product} onChange={set('product')} placeholder="From Work Order" disabled />
          </label>

          <label className="form-field">
            <span className="form-label">Department *</span>
            <select className="form-select" value={values.department} onChange={set('department')} disabled>
              {DEPARTMENT_OPTIONS.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </label>

          <label className="form-field">
            <span className="form-label">Inspection Type *</span>
            <select className="form-select" value={values.inspectionType} onChange={set('inspectionType')}>
              {INSPECTION_TYPES.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </label>

          <label className="form-field">
            <span className="form-label">Inspection Date *</span>
            <input type="date" className="form-input" value={values.inspectionDate} onChange={set('inspectionDate')} />
          </label>

          <label className="form-field">
            <span className="form-label">Inspector *</span>
            <input className="form-input" value={values.inspector} onChange={set('inspector')} placeholder="QC Lead" />
          </label>

          <label className="form-field">
            <span className="form-label">Quantity to Inspect *</span>
            <input type="number" min="0" className="form-input" value={values.quantityInspected} onChange={set('quantityInspected')} placeholder="0" />
          </label>

          <label className="form-field">
            <span className="form-label">Accepted Quantity</span>
            <input type="number" min="0" className="form-input" value={values.acceptedQuantity} onChange={set('acceptedQuantity')} placeholder="0" />
          </label>

          <label className="form-field">
            <span className="form-label">Rejected Quantity</span>
            <input type="number" min="0" className="form-input" value={values.rejectedQuantity} onChange={set('rejectedQuantity')} placeholder="0" />
          </label>

          <label className="form-field">
            <span className="form-label">Status *</span>
            <select className="form-select" value={values.status} onChange={set('status')}>
              {QUALITY_STATUSES.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </label>

          <label className="form-field form-field-wide">
            <span className="form-label">Remarks</span>
            <textarea className="form-textarea" rows={3} value={values.remarks} onChange={set('remarks')} placeholder="Optional notes about this inspection..." />
          </label>
        </div>

        {/* ============================================================ */}
        {/* SECTION 1 — QUALITY INSPECTION REPORT                       */}
        {/* ============================================================ */}
        <div className="qc-form-section">
          <h3 className="qc-form-section-title">
            <span className="qd-section-number">1</span> Quality Inspection Report
          </h3>
          <div className="form-grid">
            <label className="form-field">
              <span className="form-label">Customer</span>
              <input className="form-input" value={ir.customer || ''} onChange={(e) => updateReport('customer', e.target.value)} placeholder="Auto-filled from Work Order" />
              {selectedOrder?.customer && <span className="form-hint" style={{ color: '#178054' }}>Auto-filled from Work Order</span>}
            </label>
            <label className="form-field">
              <span className="form-label">Component / Order Description</span>
              <input className="form-input" value={ir.componentDescription || ''} onChange={(e) => updateReport('componentDescription', e.target.value)} placeholder="Auto-filled from Work Order" />
            </label>
            <label className="form-field">
              <span className="form-label">Drawing Number</span>
              <input className="form-input" value={ir.drawingNumber || ''} onChange={(e) => updateReport('drawingNumber', e.target.value)} placeholder="Auto-filled from Work Order" />
            </label>
            <label className="form-field">
              <span className="form-label">Quantity</span>
              <input type="number" min="0" className="form-input" value={ir.quantity || ''} onChange={(e) => updateReport('quantity', e.target.value)} placeholder="Auto-filled from Work Order" />
            </label>
            <label className="form-field">
              <span className="form-label">Report Number</span>
              <input className="form-input" value={ir.reportNumber || ''} onChange={(e) => updateReport('reportNumber', e.target.value)} placeholder="Auto-generated from Inspection ID" />
            </label>
            <label className="form-field">
              <span className="form-label">Date</span>
              <input type="date" className="form-input" value={ir.date || ''} onChange={(e) => updateReport('date', e.target.value)} />
            </label>
          </div>

          {/* Dimensional Inspection Table */}
          <h4 className="qc-form-subsection">Dimensional Inspection</h4>
          <div className="table-scroll">
            {/* Sticky grid (shared Production scope): the leading S.No column stays
                frozen (left: 0) while the measurement columns scroll. */}
            <table className="data-table qc-form-dim-table sgrid sgrid-prod">
              <thead>
                <tr>
                  <th className="sgrid-pin sgrid-first">S.No</th>
                  <th>Drawing Dimension</th>
                  <th>Measured 1</th>
                  <th>Measured 2</th>
                  <th>Measured 3</th>
                  <th>Measured 4</th>
                  <th>Measured 5</th>
                  <th>Remarks</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {di.map((row, idx) => (
                  <tr key={idx}>
                    <td className="cell-strong sgrid-pin sgrid-first">{idx + 1}</td>
                    <td><input className="qc-dim-input" value={row.drawingDimension || ''} onChange={(e) => updateDimRow(idx, 'drawingDimension', e.target.value)} placeholder="e.g. 100 ± 0.5" /></td>
                    <td><input className="qc-dim-input" type="number" step="any" value={row.measured1 || ''} onChange={(e) => updateDimRow(idx, 'measured1', e.target.value)} placeholder="—" /></td>
                    <td><input className="qc-dim-input" type="number" step="any" value={row.measured2 || ''} onChange={(e) => updateDimRow(idx, 'measured2', e.target.value)} placeholder="—" /></td>
                    <td><input className="qc-dim-input" type="number" step="any" value={row.measured3 || ''} onChange={(e) => updateDimRow(idx, 'measured3', e.target.value)} placeholder="—" /></td>
                    <td><input className="qc-dim-input" type="number" step="any" value={row.measured4 || ''} onChange={(e) => updateDimRow(idx, 'measured4', e.target.value)} placeholder="—" /></td>
                    <td><input className="qc-dim-input" type="number" step="any" value={row.measured5 || ''} onChange={(e) => updateDimRow(idx, 'measured5', e.target.value)} placeholder="—" /></td>
                    <td><input className="qc-dim-input" value={row.remarks || ''} onChange={(e) => updateDimRow(idx, 'remarks', e.target.value)} placeholder="Remarks" /></td>
                    <td>
                      {di.length > 1 && (
                        <button type="button" className="btn-icon btn-icon-danger" title="Remove row" onClick={() => removeDimRow(idx)}>
                          <Icon name="trash" size={13} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" className="btn btn-secondary qc-form-add-row" onClick={addDimRow}>
            <Icon name="plus" size={13} /> Add Row
          </button>
        </div>

        {/* ============================================================ */}
        {/* SECTION 2 — MATERIAL TEST CERTIFICATE                       */}
        {/* ============================================================ */}
        <div className="qc-form-section">
          <h3 className="qc-form-section-title">
            <span className="qd-section-number">2</span> Material Test Certificate
          </h3>

          <h4 className="qc-form-subsection">Chemical Analysis</h4>
          <div className="form-grid">
            {[
              { key: 'c', label: 'C %' },
              { key: 'si', label: 'Si %' },
              { key: 'mn', label: 'Mn %' },
              { key: 's', label: 'S %' },
              { key: 'p', label: 'P %' },
              { key: 'cr', label: 'Cr %' },
              { key: 'ni', label: 'Ni %' },
              { key: 'mo', label: 'Mo %' },
            ].map((f) => (
              <label key={f.key} className="form-field">
                <span className="form-label">{f.label}</span>
                <input type="number" step="any" min="0" max="100" className="form-input" value={chem[f.key] || ''} onChange={(e) => updateChemical(f.key, e.target.value)} placeholder="0.00" />
              </label>
            ))}
          </div>

          <h4 className="qc-form-subsection">Mechanical Properties</h4>
          <div className="form-grid">
            {[
              { key: 'ys', label: 'YS (MPa)' },
              { key: 'ts', label: 'TS (MPa)' },
              { key: 'hardness', label: 'Hardness (HB)' },
              { key: 'impact', label: 'Impact (J)' },
              { key: 'elongation', label: '% Elongation' },
            ].map((f) => (
              <label key={f.key} className="form-field">
                <span className="form-label">{f.label}</span>
                <input type="number" step="any" min="0" className="form-input" value={mech[f.key] || ''} onChange={(e) => updateMechanical(f.key, e.target.value)} placeholder="0.00" />
              </label>
            ))}
          </div>
        </div>

        {/* ============================================================ */}
        {/* SECTION 3 — FINAL / DISPATCH QUALITY INFORMATION             */}
        {/* ============================================================ */}
        <div className="qc-form-section">
          <h3 className="qc-form-section-title">
            <span className="qd-section-number">3</span> Final QC / Dispatch Details
          </h3>
          <div className="form-grid">
            <label className="form-field">
              <span className="form-label">Heat No</span>
              <input className="form-input" value={fq.heatNo || ''} onChange={(e) => updateFinalQc('heatNo', e.target.value)} placeholder="Enter Heat No" />
            </label>
            <label className="form-field">
              <span className="form-label">Part No</span>
              <input className="form-input" value={fq.partNo || ''} onChange={(e) => updateFinalQc('partNo', e.target.value)} placeholder="Enter Part No" />
            </label>
            <label className="form-field">
              <span className="form-label">Item Description</span>
              <input className="form-input" value={fq.itemDescription || ''} onChange={(e) => updateFinalQc('itemDescription', e.target.value)} placeholder="Auto-filled from Work Order" />
            </label>
            <label className="form-field">
              <span className="form-label">Drawing No</span>
              <input className="form-input" value={fq.drawingNo || ''} onChange={(e) => updateFinalQc('drawingNo', e.target.value)} placeholder="Auto-filled from Work Order" />
            </label>
            <label className="form-field">
              <span className="form-label">Dispatch Qty</span>
              <input type="number" min="0" className="form-input" value={fq.dispatchQty || ''} onChange={(e) => updateFinalQc('dispatchQty', e.target.value)} placeholder="0" />
            </label>
          </div>
        </div>

        {(error || submitError) && (
          <p className="form-error" role="alert">
            <Icon name="info" size={14} /> {error || submitError}
          </p>
        )}
      </form>
  );

  if (layout === 'page') {
    return (
      <FormPageShell title={title} onClose={onCancel} footer={formFooter}>
        {formBody}
      </FormPageShell>
    );
  }

  return (
    <Modal title={title} size="lg" fullPage={fullPage} onClose={onCancel} footer={formFooter}>
      {formBody}
    </Modal>
  );
}
