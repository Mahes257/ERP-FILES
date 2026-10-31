import React, { useState } from 'react';
import Icon from '../icons/Icon';
import { useTechnicalVerification } from '../../context/TechnicalVerificationContext';
import { formatDateTime } from '../../utils/format';
import { cpoNo } from '../../../utils/salesHelpers';
import ItemDrawingsModels from './ItemDrawingsModels';
import './AcknowledgementSection.css';

/**
 * Production-type-specific field configs for the Work Order Detail page.
 * `auto` fields: read-only, auto-filled from Work Order item.
 * `editable` fields: pre-filled, editable until verified/rejected.
 */
const TV_FIELD_CONFIG = {
  Casting: {
    title: 'Casting Technical Details',
    auto: [
      { key: 'drawingNumber', label: 'Drawing Number', itemKey: 'drawingNumber' },
      { key: 'drawingRevision', label: 'Drawing Revision', itemKey: 'drawingRevision' },
      { key: 'patternNumber', label: 'Pattern Number', itemKey: 'patternNumber' },
    ],
    editable: [
      { key: 'patternRevision', label: 'Pattern Revision', placeholder: 'e.g. Rev B' },
      { key: 'materialGrade', label: 'Material / Grade', placeholder: 'e.g. ASTM A216 WCB' },
      { key: 'specification', label: 'Specification', placeholder: 'e.g. ASTM A216 WCB' },
      { key: 'castingWeight', label: 'Casting Weight (kg)', placeholder: 'e.g. 12.5' },
      { key: 'dimensions', label: 'Dimensions', placeholder: 'e.g. 300mm x 200mm x 150mm' },
      { key: 'machiningAllowance', label: 'Machining Allowance', placeholder: 'e.g. 3mm' },
    ],
    wideEditable: [
      { key: 'specialInstructions', label: 'Special Instructions', placeholder: 'Any special casting instructions...', rows: 2 },
    ],
    saveMap: (state) => ({
      drawingNumber: state.drawingNumber || '',
      drawingRevision: state.drawingRevision || '',
      patternNumber: state.patternNumber || '',
      patternRevision: state.patternRevision || '',
      materialGrade: state.materialGrade || '',
      specification: state.specification || '',
      castingWeight: state.castingWeight || '',
      dimensions: state.dimensions || '',
      machiningAllowance: state.machiningAllowance || '',
      specialInstructions: state.specialInstructions || '',
    }),
  },
  Fabrication: {
    title: 'Fabrication Technical Details',
    auto: [
      { key: 'drawingNumber', label: 'Drawing Number', itemKey: 'drawingNumber' },
      { key: 'drawingRevision', label: 'Drawing Revision', itemKey: 'drawingRevision' },
      { key: 'materialType', label: 'Material Type', itemKey: 'materialType' },
      { key: 'materialGrade', label: 'Material Grade', itemKey: 'materialGrade' },
    ],
    editable: [
      { key: 'thickness', label: 'Thickness', placeholder: 'e.g. 12mm' },
      { key: 'length', label: 'Length', placeholder: 'e.g. 500mm' },
      { key: 'width', label: 'Width', placeholder: 'e.g. 300mm' },
      { key: 'diameter', label: 'Diameter', placeholder: 'e.g. 150mm (if applicable)' },
      { key: 'requiredTolerance', label: 'Required Tolerance', placeholder: 'e.g. ±0.5mm' },
      { key: 'weldingSpecification', label: 'Welding Specification', placeholder: 'e.g. AWS D1.1' },
      { key: 'weldingProcess', label: 'Welding Process', placeholder: 'e.g. SMAW, MIG, TIG' },
      { key: 'weldType', label: 'Weld Type', placeholder: 'e.g. Fillet, Butt' },
      { key: 'jointType', label: 'Joint Type', placeholder: 'e.g. Lap, Corner' },
      { key: 'hardFacingRequirement', label: 'Hard Facing Requirement', placeholder: 'e.g. Yes / No / Details' },
      { key: 'surfaceTreatment', label: 'Surface Treatment', placeholder: 'e.g. Sandblasting, Painting' },
      { key: 'heatTreatmentRequirement', label: 'Heat Treatment Requirement', placeholder: 'e.g. Normalizing at 600°C' },
    ],
    wideEditable: [
      { key: 'specialInstructions', label: 'Special Fabrication Instructions', placeholder: 'Any special fabrication instructions...', rows: 2 },
    ],
    saveMap: (state) => ({
      drawingNumber: state.drawingNumber || '',
      drawingRevision: state.drawingRevision || '',
      materialType: state.materialType || '',
      materialGrade: state.materialGrade || '',
      thickness: state.thickness || '',
      length: state.length || '',
      width: state.width || '',
      diameter: state.diameter || '',
      requiredTolerance: state.requiredTolerance || '',
      weldingSpecification: state.weldingSpecification || '',
      weldingProcess: state.weldingProcess || '',
      weldType: state.weldType || '',
      jointType: state.jointType || '',
      hardFacingRequirement: state.hardFacingRequirement || '',
      surfaceTreatment: state.surfaceTreatment || '',
      heatTreatmentRequirement: state.heatTreatmentRequirement || '',
      specialInstructions: state.specialInstructions || '',
    }),
  },
};

/**
 * TvRecordCard — renders the TV form for a single Work Order item.
 */
function TvRecordCard({ order, item, tv, saveTechnicalVerification }) {
  const [initialized, setInitialized] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fieldState, setFieldState] = useState({});

  const isVerified = tv?.verificationStatus === 'Verified';
  const isRejected = tv?.verificationStatus === 'Rejected';
  const isPending = !tv || tv.verificationStatus === 'Pending';
  const pt = item?.productionType || tv?.productionType || '';
  const config = TV_FIELD_CONFIG[pt];
  const disabled = isVerified || isRejected;

  // Initialize fields from saved TV or item defaults (once)
  if (!initialized && (tv || item)) {
    const src = tv || {};
    const initData = {};
    if (config) {
      config.auto.forEach((f) => {
        initData[f.key] = src[f.key] ?? item[f.itemKey] ?? '';
      });
      [...config.editable, ...(config.wideEditable || [])].forEach((f) => {
        initData[f.key] = src[f.key] ?? '';
      });
    }
    initData.verificationRemarks = src.verificationRemarks ?? '';
    setFieldState(initData);
    setInitialized(true);
  }

  const setField = (key) => (e) => setFieldState((prev) => ({ ...prev, [key]: e.target.value }));

  const handleVerify = (status) => {
    setSaving(true);
    const now = new Date().toISOString();
    const record = {
      workOrderId: order.workOrder,
      // string id: the API returns itemId as a string and lookups compare strings
      itemId: String(item?.id || item?.productName || ''),
      workOrderNumber: order.workOrder,
      productionOrderNumber: order.salesOrderNumber || order.workOrder,
      itemProduct: item?.productName || item?.product || order.product || '',
      itemCode: item?.productCode || item?.itemCode || '',
      productionType: pt,
      requiredQuantity: item?.quantity || 0,
      ...(config ? config.saveMap(fieldState) : {}),
      verifiedBy: 'Current User',
      verificationDateTime: now,
      verificationStatus: status,
      verificationRemarks: fieldState.verificationRemarks || tv?.verificationRemarks || '',
    };
    saveTechnicalVerification(record);
    setSaving(false);
  };

  const statusLabel = isVerified ? 'Verified' : isRejected ? 'Rejected' : 'Pending';
  const statusClass = isVerified
    ? 'tv-status-verified'
    : isRejected
      ? 'tv-status-rejected'
      : 'tv-status-pending';

  return (
    <section className="tv-section">
      <div className="tv-section-head">
        <div>
          <h3 className="tv-section-title">
            {item?.productName || item?.product || 'Technical Verification'}
            {item?.productCode && <span style={{ fontWeight: 400, fontSize: '13px', marginLeft: 8, color: 'var(--color-text-muted)' }}>({item.productCode})</span>}
          </h3>
          <p className="tv-section-subtitle">
            {config
              ? `Verify ${pt.toLowerCase()} technical details for this item before production begins.`
              : 'Verify technical details before production begins.'}
          </p>
        </div>
        <span className={`tv-status-badge ${statusClass}`}>
          <Icon name={isVerified ? 'check' : isRejected ? 'x' : 'clock'} size={12} />
          {statusLabel}
        </span>
      </div>

      <div className="tv-fields">
        {/* Auto-populated read-only fields */}
        <div className="tv-field">
          <span className="tv-field-label">Work Order Number</span>
          <span className="tv-field-value">{order.workOrder}</span>
        </div>
        <div className="tv-field">
          <span className="tv-field-label">CPO Reference</span>
          <span className="tv-field-value">{cpoNo(order.salesOrderNumber) || '—'}</span>
        </div>
        <div className="tv-field">
          <span className="tv-field-label">Item / Product</span>
          <span className="tv-field-value">{item?.productName || item?.product || '—'}</span>
        </div>
        <div className="tv-field">
          <span className="tv-field-label">Required Quantity</span>
          <span className="tv-field-value">{item?.quantity || '—'}</span>
        </div>
        <div className="tv-field">
          <span className="tv-field-label">Production Type</span>
          <span className="tv-field-value" style={{ color: '#3730a3', fontWeight: 700 }}>
            {pt || '—'}
          </span>
        </div>

        {/* No config for this production type */}
        {!config && (
          <div className="tv-field tv-field-wide">
            <span className="tv-field-value" style={{ fontStyle: 'italic', color: 'var(--color-text-muted)' }}>
              No technical verification fields configured for this production type.
            </span>
          </div>
        )}

        {/* Production-type-specific fields */}
        {config && (
          <>
            {/* Auto-filled read-only fields */}
            {config.auto.map((f) => {
              const value = fieldState[f.key] || '';
              return (
                <div className="tv-field" key={f.key}>
                  <span className="tv-field-label">{f.label}</span>
                  {value ? (
                    <span className="tv-field-value" style={{ color: '#166534' }}>{value}</span>
                  ) : (
                    <span className="tv-field-value empty">Not Provided</span>
                  )}
                </div>
              );
            })}

            {/* Editable fields */}
            {config.editable.map((f) => (
              <div className="tv-field" key={f.key}>
                <span className="tv-field-label">{f.label}</span>
                <input
                  className="tv-input"
                  value={fieldState[f.key] || ''}
                  onChange={setField(f.key)}
                  placeholder={f.placeholder}
                  disabled={disabled}
                />
              </div>
            ))}

            {/* Wide editable fields */}
            {(config.wideEditable || []).map((f) => (
              <div className="tv-field tv-field-wide" key={f.key}>
                <span className="tv-field-label">{f.label}</span>
                <textarea
                  className="tv-textarea"
                  rows={f.rows || 3}
                  value={fieldState[f.key] || ''}
                  onChange={setField(f.key)}
                  placeholder={f.placeholder}
                  disabled={disabled}
                />
              </div>
            ))}
          </>
        )}

        {/* Verification result fields */}
        <div className="tv-field">
          <span className="tv-field-label">Verified By</span>
          <span className={`tv-field-value ${!tv?.verifiedBy ? 'empty' : ''}`}>
            {tv?.verifiedBy || (isVerified || isRejected ? '—' : 'Not yet verified')}
          </span>
        </div>
        <div className="tv-field">
          <span className="tv-field-label">Verification Date &amp; Time</span>
          <span className={`tv-field-value ${!tv?.verificationDateTime ? 'empty' : ''}`}>
            {tv?.verificationDateTime
              ? formatDateTime(tv.verificationDateTime)
              : isVerified || isRejected
                ? '—'
                : 'Not yet verified'}
          </span>
        </div>
        <div className="tv-field">
          <span className="tv-field-label">Verification Status</span>
          <span className="tv-field-value">{statusLabel}</span>
        </div>
        <div className="tv-field tv-field-wide">
          <span className="tv-field-label">Verification Remarks</span>
          <textarea
            className="tv-textarea"
            rows={2}
            value={fieldState.verificationRemarks || ''}
            onChange={setField('verificationRemarks')}
            placeholder="Add verification remarks…"
            disabled={disabled}
          />
        </div>
      </div>

      {isPending && (
        <div className="tv-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => handleVerify('Verified')}
            disabled={saving}
          >
            <Icon name="check" size={14} /> Verify
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => handleVerify('Rejected')}
            disabled={saving}
          >
            <Icon name="x" size={14} /> Reject
          </button>
        </div>
      )}

      {/* Drawings & Models for this item */}
      {item && <ItemDrawingsModels order={order} item={item} />}
    </section>
  );
}

/**
 * Technical Verification section for the Work Order Detail page.
 * Shows one TV card per item in the Work Order.
 *
 * Props:
 *  - order: the Work Order object
 */
export default function TechnicalVerificationSection({ order }) {
  const { getTechnicalVerification, getTechnicalVerificationsForOrder, saveTechnicalVerification } = useTechnicalVerification();

  if (!order) return null;

  // Get all TV records for this Work Order (one per item)
  const allTvRecords = getTechnicalVerificationsForOrder(order.workOrder);
  const items = order.items || [];

  // If no items and no TV records, show nothing
  if (items.length === 0 && allTvRecords.length === 0) {
    const tv = getTechnicalVerification(order.workOrder);
    if (!tv) return null;
    // Legacy single-record mode
    return <TvRecordCard order={order} item={null} tv={tv} saveTechnicalVerification={saveTechnicalVerification} />;
  }

  return (
    <div className="tv-items-container">
      {items.map((item) => {
        const tv = allTvRecords.find((r) => r.itemId === (item.id || item.productName)) || null;
        return (
          <TvRecordCard
            key={item.id || item.productName}
            order={order}
            item={item}
            tv={tv}
            saveTechnicalVerification={saveTechnicalVerification}
          />
        );
      })}
    </div>
  );
}
