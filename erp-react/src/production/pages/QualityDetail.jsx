import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Icon from '../components/icons/Icon';
import ProductionStatusBadge from '../components/production/ProductionStatusBadge';
import QualityResult from '../components/production/quality/QualityResult';
import QualityChecklist from '../components/production/quality/QualityChecklist';
import QualityHistory from '../components/production/quality/QualityHistory';
import { useQuality } from '../context/QualityContext';
import { useProductionOrders } from '../context/ProductionOrdersContext';
import { formatDate } from '../utils/format';
import './QualityDetail.css';

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

/**
 * /production/quality/:id — inspection detail with QC result,
 * checklist, QC inspection report, dimensional inspection, MTC,
 * final QC details, actions and audit history.
 *
 * QC data (Inspection Report, Dimensional Inspection, MTC, Final QC)
 * is saved via the QualityForm on create/edit. This page displays
 * the saved data and allows inline editing with a Save button.
 */
export default function QualityDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { getInspection, changeStatus, setChecklistItem, saveQcData } = useQuality();
  const { orders, transitionOrderStatus } = useProductionOrders();
  const inspection = getInspection(id);

  // Find the linked Work Order and its first item
  const order = useMemo(() => {
    if (!inspection?.productionOrder) return null;
    return orders.find((o) => o.workOrder === inspection.productionOrder) || null;
  }, [inspection, orders]);

  const workOrderItem = useMemo(() => {
    if (!order?.items?.length) return null;
    if (inspection.workOrderItemId) {
      return order.items.find((i) => i.id === inspection.workOrderItemId) || order.items[0];
    }
    return order.items[0];
  }, [order, inspection]);

  // Seed the editable QC sections from saved record, falling back to the linked
  // Work Order's own values for anything the record does not carry yet.
  const seedQcDataFromInspection = () => ({
    inspectionReport: inspection?.inspectionReport || {
      customer: order?.customer || '',
      componentDescription: workOrderItem?.productName || inspection?.product || '',
      drawingNumber: workOrderItem?.drawingNumber || '',
      quantity: workOrderItem?.quantity || inspection?.quantityInspected || '',
      reportNumber: inspection?.id || '',
      date: inspection?.inspectionDate || new Date().toISOString().slice(0, 10),
    },
    dimensionalInspection: inspection?.dimensionalInspection?.length
      ? inspection.dimensionalInspection
      : [newDimRow(), newDimRow(), newDimRow(), newDimRow(), newDimRow()],
    materialTestCertificate: inspection?.materialTestCertificate || {
      chemicalAnalysis: { c: '', si: '', mn: '', s: '', p: '', cr: '', ni: '', mo: '' },
      mechanicalProperties: { ys: '', ts: '', hardness: '', impact: '', elongation: '' },
    },
    finalQcInfo: inspection?.finalQcInfo || {
      heatNo: '',
      partNo: '',
      itemDescription: workOrderItem?.productName || inspection?.product || '',
      drawingNo: workOrderItem?.drawingNumber || '',
      dispatchQty: workOrderItem?.quantity || '',
    },
  });
  const [qcData, setQcData] = useState(seedQcDataFromInspection);

  /* The editable sections above are seeded by a useState initializer, which runs
     once — before the provider has fetched the inspections. Opening this page
     directly (deep link / reload) therefore rendered every section blank even
     though the database held the data, while reaching it from the list appeared
     to work because the records were already loaded.

     Re-seed whenever the RECORD's stored QC data changes. The key is the stored
     CONTENT, not the object identity: polling rebuilds these objects every 30 s
     with identical content, so in-progress edits are never wiped, but a save (or
     a different inspection) does refresh them to what is actually persisted. */
  const storedQcKey = [
    inspection?.inspectionReport,
    inspection?.dimensionalInspection,
    inspection?.materialTestCertificate,
    inspection?.finalQcInfo,
  ]
    .map((value) => (value === undefined || value === null ? '' : JSON.stringify(value)))
    .join('|');
  const seededQcKey = useRef(null);

  useEffect(() => {
    if (!inspection) return;
    if (seededQcKey.current === storedQcKey) return;
    seededQcKey.current = storedQcKey;
    setQcData(seedQcDataFromInspection());
    // `seedQcDataFromInspection` is derived from the same state it re-seeds;
    // the stored signature above is the real trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storedQcKey, inspection]);

  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');

  /* The save is awaited and reported: it used to fire-and-forget and then
     announce success unconditionally, so a rejected save (the endpoint answered
     500) still told the user the QC data had been saved.
     Also: the sections are re-seeded from the record only on mount, so a saved
     response has to refresh them for the page to show what was actually stored. */
  const handleSaveQcData = useCallback(async () => {
    if (!inspection) return;
    setSaving(true);
    try {
      await saveQcData(inspection.id, qcData);
      setSavedMsg('QC data saved successfully.');
    } catch (err) {
      setSavedMsg(err?.message ? `Could not save QC data: ${err.message}` : 'Could not save QC data.');
    } finally {
      setSaving(false);
      setTimeout(() => setSavedMsg(''), 4000);
    }
  }, [inspection, qcData, saveQcData]);

  // ---- Update helpers ----
  const updateReport = (field, value) => {
    setQcData((prev) => ({ ...prev, inspectionReport: { ...(prev.inspectionReport || {}), [field]: value } }));
  };

  const updateDimRow = (index, field, value) => {
    setQcData((prev) => {
      const rows = [...(prev.dimensionalInspection || [])];
      rows[index] = { ...rows[index], [field]: value };
      return { ...prev, dimensionalInspection: rows };
    });
  };

  const addDimRow = () => {
    setQcData((prev) => ({ ...prev, dimensionalInspection: [...(prev.dimensionalInspection || []), newDimRow()] }));
  };

  const removeDimRow = (index) => {
    setQcData((prev) => ({ ...prev, dimensionalInspection: (prev.dimensionalInspection || []).filter((_, i) => i !== index) }));
  };

  const updateChemical = (field, value) => {
    setQcData((prev) => ({
      ...prev,
      materialTestCertificate: {
        ...prev.materialTestCertificate,
        chemicalAnalysis: { ...(prev.materialTestCertificate?.chemicalAnalysis || {}), [field]: value },
      },
    }));
  };

  const updateMechanical = (field, value) => {
    setQcData((prev) => ({
      ...prev,
      materialTestCertificate: {
        ...prev.materialTestCertificate,
        mechanicalProperties: { ...(prev.materialTestCertificate?.mechanicalProperties || {}), [field]: value },
      },
    }));
  };

  const updateFinalQc = (field, value) => {
    setQcData((prev) => ({ ...prev, finalQcInfo: { ...(prev.finalQcInfo || {}), [field]: value } }));
  };

  const sendToPacking = () => {
    transitionOrderStatus(inspection.productionOrder, 'Completed');
    navigate('/production/packing');
  };

  if (!inspection) {
    return (
      <div className="page">
        <button type="button" className="back-btn" onClick={() => navigate('/production/quality')}>
          <Icon name="chevron-left" size={16} /> Back to Quality
        </button>
        <section className="quality-page-card">
          <div className="sf-empty">
            <span className="sf-empty-icon"><Icon name="info" size={22} /></span>
            <h4>Inspection not found</h4>
            <p>The inspection "{id}" could not be found. It may have been deleted.</p>
            <button type="button" className="btn btn-primary" onClick={() => navigate('/production/quality')}>Back to Quality</button>
          </div>
        </section>
      </div>
    );
  }

  const metaFields = [
    { label: 'Work Order', value: inspection.productionOrder },
    { label: 'Item Name', value: inspection.product },
    { label: 'Department', value: inspection.department },
    { label: 'Inspection Type', value: inspection.inspectionType },
    { label: 'Inspection Date', value: formatDate(inspection.inspectionDate) },
    { label: 'Inspector', value: inspection.inspector },
  ];

  const ir = qcData.inspectionReport || {};
  const di = qcData.dimensionalInspection || [];
  const chem = qcData.materialTestCertificate?.chemicalAnalysis || {};
  const mech = qcData.materialTestCertificate?.mechanicalProperties || {};
  const fq = qcData.finalQcInfo || {};

  return (
    <div className="page">
      <button type="button" className="back-btn" onClick={() => navigate('/production/quality')}>
        <Icon name="chevron-left" size={16} /> Back to Quality
      </button>

      {/* Hero / Status */}
      <section className="qd-hero">
        <div className="qd-hero-top">
          <div className="qd-title-row">
            <h2 className="qd-id">{inspection.id}</h2>
            <ProductionStatusBadge status={inspection.status} />
            <span className="qd-type">{inspection.inspectionType} Inspection</span>
          </div>
          <p className="qd-product">{inspection.product} · Work Order {inspection.workOrder}</p>
        </div>
        <div className="qd-actions">
          {inspection.status === 'Pending' && (
            <>
              <button type="button" className="sf-action sf-action-start" onClick={() => changeStatus(inspection.id, 'In Progress', { action: 'Inspection Started', remarks: 'Inspection started by QC.' })}>
                <Icon name="play" size={13} /> Start Inspection
              </button>
              <button type="button" className="sf-action sf-action-hold" onClick={() => changeStatus(inspection.id, 'Hold', { action: 'Inspection On Hold', remarks: 'Inspection placed on hold.' })}>
                <Icon name="pause" size={13} /> Put On Hold
              </button>
            </>
          )}
          {inspection.status === 'In Progress' && (
            <>
              <button type="button" className="sf-action sf-action-complete" onClick={() => changeStatus(inspection.id, 'Passed', { action: 'Inspection Passed', remarks: 'All checks passed.' })}>
                <Icon name="check" size={13} /> Mark Passed
              </button>
              <button type="button" className="sf-action sf-action-reject" onClick={() => changeStatus(inspection.id, 'Failed', { action: 'Inspection Failed', remarks: 'Checks failed — rework requested.' })}>
                <Icon name="x" size={13} /> Mark Failed
              </button>
              <button type="button" className="sf-action sf-action-hold" onClick={() => changeStatus(inspection.id, 'Hold', { action: 'Inspection On Hold', remarks: 'Inspection placed on hold.' })}>
                <Icon name="pause" size={13} /> Put On Hold
              </button>
              <button type="button" className="sf-action sf-action-view" onClick={() => changeStatus(inspection.id, 'Passed', { action: 'Inspection Completed', remarks: 'Inspection completed and signed off.' })}>
                <Icon name="check" size={13} /> Complete Inspection
              </button>
            </>
          )}
          {inspection.status === 'Hold' && (
            <>
              <button type="button" className="sf-action sf-action-complete" onClick={() => changeStatus(inspection.id, 'Passed', { action: 'Inspection Passed', remarks: 'Hold cleared — checks passed.' })}>
                <Icon name="check" size={13} /> Mark Passed
              </button>
              <button type="button" className="sf-action sf-action-reject" onClick={() => changeStatus(inspection.id, 'Failed', { action: 'Inspection Failed', remarks: 'Hold cleared — checks failed.' })}>
                <Icon name="x" size={13} /> Mark Failed
              </button>
            </>
          )}
          {inspection.status === 'Passed' && (
            <button type="button" className="sf-action sf-action-quality" onClick={sendToPacking} title="QC passed — hand the order over to packing">
              <Icon name="package" size={13} /> Send to Packing
            </button>
          )}
          {inspection.status === 'Failed' && (
            <span className="qd-blocked-note"><Icon name="x" size={13} /> Not cleared for packing — resolve the failed inspection first.</span>
          )}
          <button type="button" className="btn btn-secondary" onClick={() => navigate(`/production/orders/${inspection.productionOrder}`)}>
            <Icon name="eye" size={14} /> View Work Order
          </button>
        </div>
      </section>

      {/* Inspection Details */}
      <section className="qd-meta">
        <h3 className="qd-section-title">Inspection Details</h3>
        <dl className="qd-meta-grid">
          {metaFields.map((field) => (
            <div key={field.label} className="qd-meta-item">
              <dt>{field.label}</dt>
              <dd>{field.value}</dd>
            </div>
          ))}
          <div className="qd-meta-item"><dt>Remarks</dt><dd className="qd-remarks">{inspection.remarks || '—'}</dd></div>
        </dl>
      </section>

      {/* SECTION 1 — QUALITY INSPECTION REPORT */}
      <section className="qd-section">
        <div className="qd-section-head">
          <h3 className="qd-section-title"><span className="qd-section-number">1</span> Quality Inspection Report</h3>
        </div>
        <div className="qd-report-grid">
          <div className="qd-report-field">
            <label className="qd-report-label">Customer</label>
            <input className="form-input" value={ir.customer || ''} onChange={(e) => updateReport('customer', e.target.value)} />
          </div>
          <div className="qd-report-field">
            <label className="qd-report-label">Component / Order Description</label>
            <input className="form-input" value={ir.componentDescription || ''} onChange={(e) => updateReport('componentDescription', e.target.value)} />
          </div>
          <div className="qd-report-field">
            <label className="qd-report-label">Drawing Number</label>
            <input className="form-input" value={ir.drawingNumber || ''} onChange={(e) => updateReport('drawingNumber', e.target.value)} />
          </div>
          <div className="qd-report-field">
            <label className="qd-report-label">Quantity</label>
            <input type="number" min="0" className="form-input" value={ir.quantity || ''} onChange={(e) => updateReport('quantity', e.target.value)} />
          </div>
          <div className="qd-report-field">
            <label className="qd-report-label">Report Number</label>
            <input className="form-input" value={ir.reportNumber || ''} onChange={(e) => updateReport('reportNumber', e.target.value)} />
          </div>
          <div className="qd-report-field">
            <label className="qd-report-label">Date</label>
            <input type="date" className="form-input" value={ir.date || ''} onChange={(e) => updateReport('date', e.target.value)} />
          </div>
        </div>

        {/* Dimensional Inspection */}
        <h4 className="qd-subsection-title">Dimensional Inspection</h4>
        <div className="table-scroll">
          <table className="data-table qd-dim-table sgrid sgrid-prod sgrid-actions">
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
                <th className="sgrid-pin-actions" />
              </tr>
            </thead>
            <tbody>
              {di.map((row, idx) => (
                <tr key={idx}>
                  <td className="cell-strong sgrid-pin sgrid-first">{idx + 1}</td>
                  <td><input className="qd-dim-input" value={row.drawingDimension || ''} onChange={(e) => updateDimRow(idx, 'drawingDimension', e.target.value)} placeholder="e.g. 100 ± 0.5" /></td>
                  <td><input className="qd-dim-input" type="number" step="any" value={row.measured1 || ''} onChange={(e) => updateDimRow(idx, 'measured1', e.target.value)} /></td>
                  <td><input className="qd-dim-input" type="number" step="any" value={row.measured2 || ''} onChange={(e) => updateDimRow(idx, 'measured2', e.target.value)} /></td>
                  <td><input className="qd-dim-input" type="number" step="any" value={row.measured3 || ''} onChange={(e) => updateDimRow(idx, 'measured3', e.target.value)} /></td>
                  <td><input className="qd-dim-input" type="number" step="any" value={row.measured4 || ''} onChange={(e) => updateDimRow(idx, 'measured4', e.target.value)} /></td>
                  <td><input className="qd-dim-input" type="number" step="any" value={row.measured5 || ''} onChange={(e) => updateDimRow(idx, 'measured5', e.target.value)} /></td>
                  <td><input className="qd-dim-input" value={row.remarks || ''} onChange={(e) => updateDimRow(idx, 'remarks', e.target.value)} placeholder="Remarks" /></td>
                  <td className="sgrid-pin-actions">{di.length > 1 && <button type="button" className="btn-icon btn-icon-danger" onClick={() => removeDimRow(idx)}><Icon name="trash" size={13} /></button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button type="button" className="btn btn-secondary qd-add-row-btn" onClick={addDimRow}><Icon name="plus" size={13} /> Add Row</button>
      </section>

      {/* SECTION 2 — MATERIAL TEST CERTIFICATE */}
      <section className="qd-section">
        <div className="qd-section-head">
          <h3 className="qd-section-title"><span className="qd-section-number">2</span> Material Test Certificate</h3>
        </div>
        <h4 className="qd-subsection-title">Chemical Analysis</h4>
        <div className="qd-mtc-grid">
          {[{ key: 'c', label: 'C %' }, { key: 'si', label: 'Si %' }, { key: 'mn', label: 'Mn %' }, { key: 's', label: 'S %' }, { key: 'p', label: 'P %' }, { key: 'cr', label: 'Cr %' }, { key: 'ni', label: 'Ni %' }, { key: 'mo', label: 'Mo %' }].map((f) => (
            <div key={f.key} className="qd-mtc-field">
              <label className="qd-mtc-label">{f.label}</label>
              <input type="number" step="any" min="0" max="100" className="form-input" value={chem[f.key] || ''} onChange={(e) => updateChemical(f.key, e.target.value)} placeholder="0.00" />
            </div>
          ))}
        </div>
        <h4 className="qd-subsection-title">Mechanical Properties</h4>
        <div className="qd-mtc-grid">
          {[{ key: 'ys', label: 'YS (MPa)' }, { key: 'ts', label: 'TS (MPa)' }, { key: 'hardness', label: 'Hardness (HB)' }, { key: 'impact', label: 'Impact (J)' }, { key: 'elongation', label: '% Elongation' }].map((f) => (
            <div key={f.key} className="qd-mtc-field">
              <label className="qd-mtc-label">{f.label}</label>
              <input type="number" step="any" min="0" className="form-input" value={mech[f.key] || ''} onChange={(e) => updateMechanical(f.key, e.target.value)} placeholder="0.00" />
            </div>
          ))}
        </div>
      </section>

      {/* SECTION 3 — FINAL / DISPATCH QC */}
      <section className="qd-section">
        <div className="qd-section-head">
          <h3 className="qd-section-title"><span className="qd-section-number">3</span> Final / Dispatch Quality Information</h3>
        </div>
        <div className="qd-report-grid">
          <div className="qd-report-field">
            <label className="qd-report-label">Heat No</label>
            <input className="form-input" value={fq.heatNo || ''} onChange={(e) => updateFinalQc('heatNo', e.target.value)} />
          </div>
          <div className="qd-report-field">
            <label className="qd-report-label">Part No</label>
            <input className="form-input" value={fq.partNo || ''} onChange={(e) => updateFinalQc('partNo', e.target.value)} />
          </div>
          <div className="qd-report-field">
            <label className="qd-report-label">Item Description</label>
            <input className="form-input" value={fq.itemDescription || ''} onChange={(e) => updateFinalQc('itemDescription', e.target.value)} />
          </div>
          <div className="qd-report-field">
            <label className="qd-report-label">Drawing No</label>
            <input className="form-input" value={fq.drawingNo || ''} onChange={(e) => updateFinalQc('drawingNo', e.target.value)} />
          </div>
          <div className="qd-report-field">
            <label className="qd-report-label">Dispatch Qty</label>
            <input type="number" min="0" className="form-input" value={fq.dispatchQty || ''} onChange={(e) => updateFinalQc('dispatchQty', e.target.value)} />
          </div>
        </div>
      </section>

      {/* SAVE */}
      <div className="qd-save-bar">
        <button type="button" className="btn btn-primary" onClick={handleSaveQcData} disabled={saving}>
          <Icon name="check" size={15} /> {saving ? 'Saving...' : 'Save QC Data'}
        </button>
        {savedMsg && <span className="qd-saved-msg">{savedMsg}</span>}
      </div>

      {/* QC Result + Checklist */}
      <div className="qd-columns">
        <QualityResult inspection={inspection} />
        <QualityChecklist inspection={inspection} onUpdate={setChecklistItem} />
      </div>

      <section className="qd-history">
        <h3 className="qd-section-title">Quality History</h3>
        <QualityHistory rows={inspection.history} />
      </section>
    </div>
  );
}
