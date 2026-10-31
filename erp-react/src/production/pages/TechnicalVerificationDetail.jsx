import React, { useMemo, useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Icon from '../components/icons/Icon';
import { useTechnicalVerification } from '../context/TechnicalVerificationContext';
import { useProductionOrders } from '../context/ProductionOrdersContext';
import { useProductionEntry } from '../context/ProductionEntryContext';
import ActionFeedback from '../components/production/ActionFeedback';
import './TechnicalVerificationDetail.css';

/* ================================================================
   TV_FIELD_CONFIG — same as TechnicalVerificationPage
   ================================================================ */
const TV_FIELD_CONFIG = {
  Casting: {
    title: 'Casting Technical Details',
    auto: [
      { key: 'drawingNumber', label: 'Drawing Number' },
      { key: 'drawingRevision', label: 'Drawing Revision' },
      { key: 'patternNumber', label: 'Pattern Number' },
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
    checklist: [
      'Drawing Verified', 'Drawing Revision Verified', 'Pattern Number Verified',
      'Material / Grade Verified', 'Quantity Verified', 'Specification Verified',
      'Casting Weight Verified', 'Dimensions Verified', 'Machining Allowance Verified',
    ],
    saveMap: (fd) => ({
      drawingNumber: fd.drawingNumber || '', drawingRevision: fd.drawingRevision || '',
      patternNumber: fd.patternNumber || '', patternRevision: fd.patternRevision || '',
      materialGrade: fd.materialGrade || '', specification: fd.specification || '',
      castingWeight: fd.castingWeight || '', dimensions: fd.dimensions || '',
      machiningAllowance: fd.machiningAllowance || '', specialInstructions: fd.specialInstructions || '',
    }),
  },
  Fabrication: {
    title: 'Fabrication Technical Details',
    auto: [
      { key: 'drawingNumber', label: 'Drawing Number' },
      { key: 'drawingRevision', label: 'Drawing Revision' },
      { key: 'materialType', label: 'Material Type' },
      { key: 'materialGrade', label: 'Material Grade' },
    ],
    editable: [
      { key: 'thickness', label: 'Thickness', placeholder: 'e.g. 12mm' },
      { key: 'length', label: 'Length', placeholder: 'e.g. 500mm' },
      { key: 'width', label: 'Width', placeholder: 'e.g. 300mm' },
      { key: 'diameter', label: 'Diameter', placeholder: 'e.g. 150mm' },
      { key: 'requiredTolerance', label: 'Required Tolerance', placeholder: 'e.g. ±0.5mm' },
      { key: 'weldingSpecification', label: 'Welding Specification', placeholder: 'e.g. AWS D1.1' },
      { key: 'weldingProcess', label: 'Welding Process', placeholder: 'e.g. SMAW, MIG, TIG' },
      { key: 'surfaceTreatment', label: 'Surface Treatment', placeholder: 'e.g. Sandblasting' },
      { key: 'heatTreatmentRequirement', label: 'Heat Treatment', placeholder: 'e.g. Normalizing at 600°C' },
    ],
    wideEditable: [
      { key: 'specialInstructions', label: 'Special Instructions', placeholder: 'Any special instructions...', rows: 2 },
    ],
    checklist: [
      'Drawing Verified', 'Drawing Revision Verified', 'Material Type / Grade Verified',
      'Quantity Verified', 'Thickness / Dimensions Verified', 'Welding Specification Verified',
      'Tolerance Verified', 'Surface Treatment Verified',
    ],
    saveMap: (fd) => ({
      drawingNumber: fd.drawingNumber || '', drawingRevision: fd.drawingRevision || '',
      materialType: fd.materialType || '', materialGrade: fd.materialGrade || '',
      thickness: fd.thickness || '', length: fd.length || '', width: fd.width || '',
      diameter: fd.diameter || '', requiredTolerance: fd.requiredTolerance || '',
      weldingSpecification: fd.weldingSpecification || '', weldingProcess: fd.weldingProcess || '',
      surfaceTreatment: fd.surfaceTreatment || '', heatTreatmentRequirement: fd.heatTreatmentRequirement || '',
      specialInstructions: fd.specialInstructions || '',
    }),
  },
};

const formatDateTime = (iso) => {
  if (!iso) return '-';
  try { return new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch { return iso; }
};

export default function TechnicalVerificationDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { technicalVerifications = [], saveTechnicalVerification, getTechnicalVerification } = useTechnicalVerification();
  const { orders, loading: ordersLoading } = useProductionOrders();
  const { entries = [] } = useProductionEntry();
  const [expandedItem, setExpandedItem] = useState('__all__');
  const [formData, setFormData] = useState({});
  // Item currently being re-verified. A verified/rejected item is not
  // "Pending", so without this flag Re-verify re-rendered the read-only view
  // and no form ever appeared (the button appeared to do nothing).
  const [editingItem, setEditingItem] = useState(null);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState(null);

  useEffect(() => { setExpandedItem('__all__'); setEditingItem(null); setFormData({}); }, [id]);

  const order = useMemo(() => orders.find((o) => o.id === id || o.workOrder === id), [orders, id]);

  /**
   * The production type shown for the Work Order.
   *
   * Derived from the Work Order's items first, then the order's own type, and
   * only then from a production entry. The previous order was the reverse and
   * could never fall back: `productionTypeOf(undefined)` returns a hardcoded
   * truthy `'Casting'`, so `|| o.productionType` was dead and every Work Order
   * without a stage entry was labelled Casting — WO-0002 is Fabrication, which
   * is what its items and its row in the list both say.
   */
  const prodType = (o) => {
    if (!o) return '';
    const itemType = (o.items || []).map((it) => it.productionType).find(Boolean);
    if (itemType) return itemType;
    if (o.productionType) return o.productionType;
    const entry = entries.find((e) => e.workOrder === o.workOrder);
    return entry?.productionType || '';
  };

  const items = order?.items || [];

  const initForm = (itemKey) => {
    const tv = technicalVerifications.find((tv) => `${tv.workOrderNumber}-${tv.itemId}` === itemKey);
    setFormData(tv ? { ...tv, checklist: tv.checklist || {} } : { checklist: {} });
  };

  const updateField = (key, val) => setFormData((prev) => ({ ...prev, [key]: val }));
  const toggleChecklist = (ci) => setFormData((prev) => ({
    ...prev,
    checklist: { ...(prev.checklist || {}), [ci]: (prev.checklist || {})[ci] === 'Yes' ? '' : 'Yes' },
  }));

  /**
   * Save the verification record. The result is awaited and reported so a
   * rejected save is never presented as a successful verification.
   */
  const handleVerify = async (itemKey, status) => {
    if (!order) return;
    const item = items.find((it) => `${order.workOrder}-${it.id || it.productName}` === itemKey);
    if (!item) return;
    const pt = item.productionType || prodType(order);
    const config = TV_FIELD_CONFIG[pt];
    if (!config) return;
    setSaving(true);
    const result = await saveTechnicalVerification({
      workOrderId: order.workOrder,
      // string id: see TechnicalVerificationContext.getTechnicalVerification
      itemId: String(item?.id || item?.productName || ''),
      workOrderNumber: order.workOrder,
      productionOrderNumber: order.salesOrderNumber || order.workOrder,
      itemProduct: item?.productName || item?.product || '',
      productionType: pt,
      requiredQuantity: item?.quantity || order.quantity || 0,
      ...config.saveMap(formData),
      checklist: formData.checklist || {},
      verifiedBy: 'Current User',
      verificationDateTime: new Date().toISOString(),
      verificationStatus: status,
      verificationRemarks: formData.verificationRemarks || '',
    });
    setSaving(false);
    if (result?.ok) {
      setFeedback({
        message: `${item?.productName || item?.product || 'Item'} marked ${status}.`,
        tone: status === 'Rejected' ? 'info' : 'success',
      });
      setExpandedItem('__all__');
      setEditingItem(null);
      setFormData({});
    } else {
      setFeedback({ message: result?.error || 'Could not save the technical verification.', tone: 'error' });
    }
  };

  /* Back always returns to the Technical Verification list. This was
     `navigate(-1)`, which followed browser history: opening the detail URL
     directly (deep link, reload, new tab) left the app instead of showing the
     list. */
  const backToList = () => navigate('/production/technical-verification');

  if (!order) {
    return (
      <div className="page">
        <div className="tv-detail-page">
          <button className="tv-back-btn" onClick={backToList}>
            <Icon name="arrow-left" size={16} /> Back
          </button>
          {/* While the Work Orders are still loading this is a direct deep
              link / reload, not a missing record — rendering "Not Found"
              here flashed a false error before the list arrived. */}
          <h1 style={{ fontSize: 20, fontWeight: 700 }}>
            {ordersLoading ? 'Loading Work Order…' : 'Work Order Not Found'}
          </h1>
        </div>
      </div>
    );
  }

  const pt = prodType(order);
  const config = TV_FIELD_CONFIG[pt];

  // Look records up through the context helper, which compares the item id as a
  // STRING. These three counts (and the per-item lookup below) compared the
  // stored `itemId` — a string like "26" — strictly against the item's numeric
  // `id`, so they never matched: a Work Order that the list shows as Verified
  // opened with "0 Verified / 1 Pending", the item kept its Pending badge, and
  // with no saved record loaded the Re-verify action was unreachable.
  const tvFor = (item) => getTechnicalVerification(order.workOrder, item?.id || item?.productName);

  const verifiedCount = items.filter((it) => tvFor(it)?.verificationStatus === 'Verified').length;

  const pendingCount = items.filter((it) => {
    const tv = tvFor(it);
    return !tv || tv.verificationStatus === 'Pending';
  }).length;

  const rejectedCount = items.filter((it) => tvFor(it)?.verificationStatus === 'Rejected').length;

  return (
    <div className="page">
      <ActionFeedback
        message={feedback?.message}
        tone={feedback?.tone}
        onDismiss={() => setFeedback(null)}
      />

      <div className="tv-detail-page">

        {/* ===== Back Button ===== */}
        <button className="tv-back-btn" onClick={backToList}>
          <Icon name="arrow-left" size={16} /> Back
        </button>

        {/* ===== Title ===== */}
        <h1 className="tv-detail-title">Technical Verification — {order.workOrder}</h1>
        <p className="tv-detail-subtitle">
          Sales Order: {order.salesOrder || 'N/A'} · Type: {pt || 'N/A'} · Status: {order.status || 'N/A'}
        </p>

        {/* ===== Summary KPI Cards ===== */}
        <div className="tv-detail-kpi-row">
          <div className="tv-detail-kpi-card tv-kpi-total">
            <div className="tv-detail-kpi-icon"><Icon name="clipboard" size={18} /></div>
            <div className="tv-detail-kpi-body">
              <span className="tv-detail-kpi-num">{items.length}</span>
              <span className="tv-detail-kpi-label">Total Items</span>
            </div>
          </div>
          <div className="tv-detail-kpi-card tv-kpi-verified">
            <div className="tv-detail-kpi-icon"><Icon name="check-circle" size={18} /></div>
            <div className="tv-detail-kpi-body">
              <span className="tv-detail-kpi-num">{verifiedCount}</span>
              <span className="tv-detail-kpi-label">Verified</span>
            </div>
          </div>
          <div className="tv-detail-kpi-card tv-kpi-pending">
            <div className="tv-detail-kpi-icon"><Icon name="clock" size={18} /></div>
            <div className="tv-detail-kpi-body">
              <span className="tv-detail-kpi-num">{pendingCount}</span>
              <span className="tv-detail-kpi-label">Pending</span>
            </div>
          </div>
          <div className="tv-detail-kpi-card tv-kpi-rejected">
            <div className="tv-detail-kpi-icon"><Icon name="x-circle" size={18} /></div>
            <div className="tv-detail-kpi-body">
              <span className="tv-detail-kpi-num">{rejectedCount}</span>
              <span className="tv-detail-kpi-label">Rejected</span>
            </div>
          </div>
        </div>

        {/* ===== Items ===== */}
        <h3 className="tv-detail-section-title">{order.workOrder} — Items</h3>

        {items.length === 0 ? (
          <p style={{ color: '#94A3B8', fontSize: 13 }}>No items in this Work Order.</p>
        ) : (
          items.map((item) => {
            const itemKey = `${order.workOrder}-${item.id || item.productName}`;
            const itemTv = tvFor(item);
            const itemStatus = itemTv?.verificationStatus || 'Pending';
            const itemPt = item.productionType || pt;
            const itemConfig = TV_FIELD_CONFIG[itemPt];
            const isPending = itemStatus === 'Pending';
            const isVerified = itemStatus === 'Verified';
            const isRejected = itemStatus === 'Rejected';
            const isExpanded = expandedItem === '__all__' || expandedItem === itemKey;
            // Fields become editable for pending items and for a verified /
            // rejected item that was opened with Re-verify.
            const editable = isPending || editingItem === itemKey;

            return (
              <div key={item.id || item.productName} className="tv-detail-item-card">
                {/* Item Header */}
                <div
                  className="tv-detail-item-header"
                  onClick={() => {
                    if (isExpanded) { setExpandedItem(null); setEditingItem(null); }
                    else { initForm(itemKey); setEditingItem(null); setExpandedItem(itemKey); }
                  }}
                >
                  <span className="tv-detail-item-name">{item.productName || item.product || '—'}</span>
                  <span className="ack-status-badge" style={{ background: '#e0e7ff', color: '#3730a3', fontSize: 11 }}>{itemPt || '—'}</span>
                  <span className="tv-detail-item-qty">Qty: {item.quantity || '—'}</span>
                  <span className={`ack-status-badge ${isVerified ? 'ack-status-acknowledged' : isRejected ? 'tv-status-rejected' : 'ack-status-pending'}`} style={{ fontSize: 11 }}>
                    <Icon name={isVerified ? 'check' : isRejected ? 'x' : 'clock'} size={11} />
                    {itemStatus}
                  </span>
                </div>

                {/* Expanded Item Details */}
                {isExpanded && itemConfig && (
                  <div className="tv-detail-item-body">
                    {/* Auto-filled fields */}
                    <div className="tv-detail-fields-grid">
                      {itemConfig.auto.map((f) => (
                        <div key={f.key} className="tv-detail-field">
                          <span className="tv-detail-field-label">{f.label}</span>
                          <span className={`tv-detail-field-value ${(!editable && itemTv?.[f.key]) || formData[f.key] ? '' : 'tv-field-empty'}`}>
                            {editable ? (formData[f.key] || 'Not Provided') : (itemTv?.[f.key] || 'Not Provided')}
                          </span>
                        </div>
                      ))}
                      {/* Editable fields */}
                      {editable ? (
                        itemConfig.editable.map((f) => (
                          <div key={f.key} className="tv-detail-field">
                            <label className="tv-detail-field-label">{f.label}</label>
                            <input type="text" className="tv-detail-input" value={formData[f.key] || ''} onChange={(e) => updateField(f.key, e.target.value)} placeholder={f.placeholder} />
                          </div>
                        ))
                      ) : (
                        itemConfig.editable.map((f) => (
                          <div key={f.key} className="tv-detail-field">
                            <span className="tv-detail-field-label">{f.label}</span>
                            <span className={`tv-detail-field-value ${itemTv?.[f.key] ? '' : 'tv-field-empty'}`}>
                              {itemTv?.[f.key] || 'Not Provided'}
                            </span>
                          </div>
                        ))
                      )}
                    </div>

                    {/* Wide editable fields */}
                    {editable && (itemConfig.wideEditable || []).map((f) => (
                      <div key={f.key} className="tv-detail-field-full">
                        <label className="tv-detail-field-label">{f.label}</label>
                        <textarea className="tv-detail-textarea" rows={f.rows || 2} value={formData[f.key] || ''} onChange={(e) => updateField(f.key, e.target.value)} placeholder={f.placeholder} />
                      </div>
                    ))}

                    {/* ===== Verification Checklist ===== */}
                    <h4 className="tv-detail-subsection">Verification Checklist</h4>
                    <div className="tv-detail-checklist">
                      {itemConfig.checklist.map((ci) => {
                        const isChecked = editable
                          ? (formData.checklist || {})[ci] === 'Yes'
                          : itemTv?.checklist?.[ci] === 'Yes';
                        return (
                          <label key={ci} className={`tv-detail-check-item ${isChecked ? 'checked' : ''}`}>
                            <span className={`tv-detail-checkbox ${isChecked ? 'checked' : ''}`}>
                              {isChecked && <Icon name="check" size={10} />}
                            </span>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={editable ? () => toggleChecklist(ci) : undefined}
                              disabled={!editable}
                            />
                            {ci}
                          </label>
                        );
                      })}
                    </div>

                    {/* ===== Verification Remarks ===== */}
                    <h4 className="tv-detail-subsection">Verification Remarks</h4>
                    {editable ? (
                      <textarea className="tv-detail-textarea" rows={2} value={formData.verificationRemarks || ''} onChange={(e) => updateField('verificationRemarks', e.target.value)} placeholder="Add verification remarks..." />
                    ) : (
                      <p className="tv-detail-remarks">{itemTv?.verificationRemarks || 'No remarks provided.'}</p>
                    )}

                    {/* Verified by info */}
                    {!isPending && itemTv?.verifiedBy && (
                      <p className="tv-detail-verified-info">
                        Verified by <strong>{itemTv.verifiedBy}</strong> on {formatDateTime(itemTv.verificationDateTime)}
                      </p>
                    )}

                    {/* ===== Action Buttons ===== */}
                    <div className="tv-detail-actions">
                      <button
                        type="button"
                        className="tv-detail-btn tv-detail-btn-cancel"
                        onClick={() => { setExpandedItem('__all__'); setEditingItem(null); setFormData({}); }}
                      >
                        <Icon name="arrow-left" size={13} /> Close
                      </button>
                      {editable && (
                        <>
                          <button type="button" className="tv-detail-btn tv-detail-btn-reject" disabled={saving} onClick={() => handleVerify(itemKey, 'Rejected')}>
                            <Icon name="x" size={14} /> Reject
                          </button>
                          <button type="button" className="tv-detail-btn tv-detail-btn-verify" disabled={saving} onClick={() => handleVerify(itemKey, 'Verified')}>
                            <Icon name="check" size={14} /> Verify
                          </button>
                        </>
                      )}
                      {!editable && (
                        <button
                          type="button"
                          className="tv-detail-btn tv-detail-btn-reverify"
                          onClick={() => {
                            // Load the saved record into the form and switch this
                            // item into edit mode so it can be corrected and saved.
                            initForm(itemKey);
                            setEditingItem(itemKey);
                            setExpandedItem(itemKey);
                          }}
                        >
                          <Icon name="edit" size={13} /> Re-verify
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
