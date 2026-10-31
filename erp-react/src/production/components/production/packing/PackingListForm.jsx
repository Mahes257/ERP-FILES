import React, { useMemo, useState } from 'react';
import Modal from '../Modal';
import FormPageShell from '../FormPageShell';
import Icon from '../../icons/Icon';
import {
  PACKAGE_KINDS,
  DEFAULT_DECLARATION,
  packedQtyOf,
  createEmptyBox,
  createEmptyItem,
  boxTotals,
  overallTotals,
  ensureBoxes,
  qcAcceptedQty,
  alreadyPackedQty,
  qcStageName,
} from '../../../data/packing';
import { productionTypeOf, ENTRY_WORKFLOWS } from '../../../data/entries';
import { formatDate } from '../../../utils/format';
import './PackingList.css';

const todayISO = () => new Date().toISOString().slice(0, 10);

/**
 * Merge a source document's prefill over the form's own create defaults.
 * Only keys this form actually renders are taken, and only non-empty source
 * values — an absent CPO value never erases a form default.
 */
function withPrefill(base, prefill) {
  if (!prefill || typeof prefill !== 'object') return base;
  const next = { ...base };
  Object.entries(prefill).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    if (!Object.prototype.hasOwnProperty.call(next, key)) return;
    next[key] = value;
  });
  return next;
}

const HEADER_FIELDS = [
  { key: 'invoiceNo', label: 'Invoice Number' },
  { key: 'invoiceDate', label: 'Invoice Date', type: 'date' },
  { key: 'invoiceAmount', label: 'Invoice Amount', type: 'number' },
  { key: 'invoiceCurrency', label: 'Invoice Currency' },
  { key: 'buyerName', label: 'Buyer / Consignee', wide: true },
  { key: 'buyerAddress', label: 'Buyer Address', wide: true },
  { key: 'buyerOtherName', label: 'Other Buyer Name', wide: true },
  { key: 'buyerOtherAddress', label: 'Other Buyer Address', wide: true },
  { key: 'buyerOrderNumber', label: "Buyer's Order Number", wide: true },
  { key: 'buyerOrderDate', label: "Buyer's Order Date", type: 'date' },
  { key: 'contractNumber', label: 'Contract Number' },
  { key: 'contractDate', label: 'Contract Date', type: 'date' },
  { key: 'exporterRef', label: "Exporter's Ref" },
  { key: 'gstin', label: 'GSTIN' },
  { key: 'pan', label: 'PAN' },
  { key: 'countryOfOrigin', label: 'Country of Origin' },
  { key: 'countryOfFinalDestination', label: 'Country of Final Destination' },
  { key: 'commodity', label: 'Commodity', wide: true },
  { key: 'hsCode', label: 'HS Code' },
  { key: 'preCarriageBy', label: 'Pre-Carriage By' },
  { key: 'placeOfReceipt', label: 'Place of Receipt' },
  { key: 'portOfDischarge', label: 'Port of Discharge' },
  { key: 'placeOfDelivery', label: 'Place of Delivery' },
  { key: 'vesselFlight', label: 'Vessel / Flight Number', wide: true },
  { key: 'placeOfAcceptance', label: 'Place of Acceptance' },
  { key: 'portOfLoading', label: 'Port of Loading' },
  { key: 'termsOfDelivery', label: 'Terms of Delivery', wide: true },
  { key: 'paymentTerms', label: 'Payment Terms', wide: true },
];

/**
 * Packing List form — creates/edits a Packing List with a hierarchical
 * Packing Box → Items structure. The Packing List Number is auto-generated
 * (PL-0001…). Each box can contain unlimited items, and a list can
 * contain unlimited boxes.
 *
 * `layout`: 'modal' (default) keeps the classic overlay behaviour; 'page'
 * renders the very same form as an in-flow full page (used by the dedicated
 * `packing/new` route so the Packing list is not rendered behind it).
 */
export default function PackingListForm({
  orders,
  salesOrders,
  entries = [],
  initialValues,
  /* Values for a NEW Packing List that come from a source document (CPO →
     Generate Packing List passes `packingPrefillFromCpo(cpo)`). Applied after
     the form's own defaults, only for keys the form owns, and never for an
     empty source value — so it can neither wipe a default nor set a field this
     form does not render. Edit mode keeps using `initialValues`. */
  prefill = null,
  nextListNumber,
  packableByWO = {},
  completedByWO = {},
  records = [],
  title,
  onSubmit,
  onCancel,
  // Re-reads the Work Orders / production entries / packing lists the item
  // modal's Work Order eligibility is computed from (see addItemToBox).
  onRefreshSources,
  fullPage = false,
  layout = 'modal',
}) {
  /* No business information is restored from a previous Packing List. The
     form used to re-seed the exporter/buyer block from a `packingCompanyProfile`
     entry it wrote on every save, so a fresh `/production/packing/new` showed
     whoever was typed into the LAST list (one user's test data appeared in
     every new form). Every optional business field now starts empty and is
     only ever filled by the user or by an explicitly selected source document
     (`prefill`, e.g. CPO → Generate Packing List). */
  const isEdit = Boolean(initialValues);
  const editingId = initialValues?.id;

  const [values, setValues] = useState(() => {
    if (initialValues) {
      const migrated = ensureBoxes(initialValues);
      return {
        productionOrder: migrated.productionOrder || '',
        salesOrderId: migrated.salesOrderId || '',
        salesOrderNumber: migrated.salesOrderNumber || '',
        product: migrated.product || '',
        productionType: migrated.productionType || '',
        patternNumber: migrated.patternNumber || '',
        drawingNumber: migrated.drawingNumber || '',
        unit: migrated.unit || 'Pcs',
        completedQty:
          migrated.completedQty ?? completedByWO[migrated.productionOrder] ?? '',
        availableQty: migrated.availableQty ?? '',
        quantity: migrated.quantity ?? '',
        packingDate: migrated.packingDate || todayISO(),
        operator: migrated.operator || '',
        remarks: migrated.remarks || '',
        buyerName: migrated.buyerName || '',
        buyerAddress: migrated.buyerAddress || '',
        buyerOtherName: migrated.buyerOtherName || '',
        buyerOtherAddress: migrated.buyerOtherAddress || '',
        buyerOrderNumber: migrated.buyerOrderNumber || '',
        buyerOrderDate: migrated.buyerOrderDate || '',
        invoiceNo: migrated.invoiceNo || '',
        invoiceDate: migrated.invoiceDate || '',
        invoiceAmount: migrated.invoiceAmount ?? '',
        invoiceCurrency: migrated.invoiceCurrency || '',
        contractNumber: migrated.contractNumber || '',
        contractDate: migrated.contractDate || '',
        exporterRef: migrated.exporterRef || '',
        gstin: migrated.gstin || '',
        pan: migrated.pan || '',
        countryOfOrigin: migrated.countryOfOrigin || 'INDIA',
        countryOfFinalDestination: migrated.countryOfFinalDestination || '',
        commodity: migrated.commodity || '',
        hsCode: migrated.hsCode || '',
        preCarriageBy: migrated.preCarriageBy || '',
        placeOfReceipt: migrated.placeOfReceipt || '',
        portOfDischarge: migrated.portOfDischarge || '',
        placeOfDelivery: migrated.placeOfDelivery || '',
        vesselFlight: migrated.vesselFlight || '',
        placeOfAcceptance: migrated.placeOfAcceptance || '',
        portOfLoading: migrated.portOfLoading || '',
        termsOfDelivery: migrated.termsOfDelivery || '',
        paymentTerms: migrated.paymentTerms || '',
        exporterName: migrated.exporterName || '',
        exporterAddress: migrated.exporterAddress || '',
        exporterEmail: migrated.exporterEmail || '',
        exporterPhone: migrated.exporterPhone || '',
        signatureImage: migrated.signatureImage || '',
        declaration: migrated.declaration || DEFAULT_DECLARATION,
        packingBoxes:
          Array.isArray(migrated.packingBoxes) && migrated.packingBoxes.length > 0
            ? migrated.packingBoxes.map((b) => ({ ...b, items: (b.items || []).map((i) => ({ ...i })) }))
            : [createEmptyBox(1)],
      };
    }
    const blank = {
      productionOrder: '',
      salesOrderId: '',
      salesOrderNumber: '',
      product: '',
      /* The list's Customer column and the document header read `customer`,
         but the create defaults had no such key, so a source document's
         customer could not be carried in and every save relied on the Work
         Order to supply it. */
      customer: '',
      productionType: '',
      patternNumber: '',
      drawingNumber: '',
      unit: 'Pcs',
      completedQty: '',
      availableQty: '',
      quantity: '',
      packingDate: todayISO(),
      operator: '',
      remarks: '',
      buyerName: '',
      buyerAddress: '',
      buyerOtherName: '',
      buyerOtherAddress: '',
      buyerOrderNumber: '',
      buyerOrderDate: '',
      invoiceNo: '',
      invoiceDate: '',
      invoiceAmount: '',
      invoiceCurrency: '',
      contractNumber: '',
      contractDate: '',
      exporterRef: '',
      gstin: '',
      pan: '',
      countryOfOrigin: 'INDIA',
      countryOfFinalDestination: '',
      commodity: '',
      hsCode: '',
      preCarriageBy: '',
      placeOfReceipt: '',
      portOfDischarge: '',
      placeOfDelivery: '',
      vesselFlight: '',
      placeOfAcceptance: '',
      portOfLoading: '',
      termsOfDelivery: '',
      paymentTerms: '',
      exporterName: '',
      exporterAddress: '',
      exporterEmail: '',
      exporterPhone: '',
      signatureImage: '',
      declaration: DEFAULT_DECLARATION,
      packingBoxes: [createEmptyBox(1)],
    };
    return withPrefill(blank, prefill);
  });

  const [error, setError] = useState('');
  // True while the page is persisting this form, so a second click on either
  // footer action cannot create/update the same Packing List twice.
  const [saving, setSaving] = useState(false);
  const [expandedBoxes, setExpandedBoxes] = useState(() => {
    // Expand all boxes by default in edit mode
    if (initialValues) {
      const migrated = ensureBoxes(initialValues);
      const boxes = migrated.packingBoxes || [];
      return boxes.map((b) => b.id);
    }
    return ['box-new-1'];
  });
  const [itemModal, setItemModal] = useState(null); // { boxId, itemIndex|null, itemData }

  const set = (key) => (e) => setValues((prev) => ({ ...prev, [key]: e.target.value }));

  const handleSignatureUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!/^image\/(png|jpe?g)$/i.test(file.type)) {
      setError('Signature must be a PNG or JPEG image.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      if (dataUrl.length > 2_000_000) {
        setError('Signature image is too large. Use an image under 2 MB.');
        return;
      }
      setValues((prev) => ({ ...prev, signatureImage: dataUrl }));
      setError('');
    };
    reader.readAsDataURL(file);
  };

  // ---- Box operations ----
  const addBox = () =>
    setValues((prev) => ({
      ...prev,
      packingBoxes: [
        ...prev.packingBoxes,
        createEmptyBox(prev.packingBoxes.length + 1),
      ],
    }));

  const removeBox = (boxId) =>
    setValues((prev) => ({
      ...prev,
      packingBoxes: prev.packingBoxes
        .filter((b) => b.id !== boxId)
        .map((b, i) => ({ ...b, boxNumber: i + 1 })),
    }));

  const updateBox = (boxId, key, value) =>
    setValues((prev) => ({
      ...prev,
      packingBoxes: prev.packingBoxes.map((b) =>
        b.id === boxId ? { ...b, [key]: value } : b
      ),
    }));

  const toggleBox = (boxId) =>
    setExpandedBoxes((prev) =>
      prev.includes(boxId) ? prev.filter((id) => id !== boxId) : [...prev, boxId]
    );

  // ---- Item operations (inside a box) ----
  const addItemToBox = (boxId) => {
    // Pick the Work Order against the CURRENT server state: QC sign-offs and
    // packing lists written in another session/tab are not in this page's
    // mounted snapshot, and a stale snapshot is what makes a genuinely
    // packable Work Order look like it has "no completed QC".
    onRefreshSources?.();
    const box = values.packingBoxes.find((b) => b.id === boxId);
    const itemNo = (box?.items?.length || 0) + 1;
    setItemModal({ boxId, itemIndex: null, itemData: createEmptyItem(itemNo) });
  };

  const editItemInBox = (boxId, itemIndex) => {
    const box = values.packingBoxes.find((b) => b.id === boxId);
    if (box && box.items[itemIndex]) {
      setItemModal({ boxId, itemIndex, itemData: { ...box.items[itemIndex] } });
    }
  };

  const removeItemFromBox = (boxId, itemIndex) =>
    setValues((prev) => ({
      ...prev,
      packingBoxes: prev.packingBoxes.map((b) => {
        if (b.id !== boxId) return b;
        return {
          ...b,
          items: b.items
            .filter((_, i) => i !== itemIndex)
            .map((item, i) => ({ ...item, itemNo: i + 1 })),
        };
      }),
    }));

  const saveItem = (itemData) => {
    const { boxId, itemIndex } = itemModal;
    setValues((prev) => ({
      ...prev,
      packingBoxes: prev.packingBoxes.map((b) => {
        if (b.id !== boxId) return b;
        const items = [...b.items];
        const cleanItem = {
          ...itemData,
          quantity: Number(itemData.quantity) || 0,
        };
        if (itemIndex !== null && itemIndex !== undefined) {
          items[itemIndex] = cleanItem;
        } else {
          items.push({ ...cleanItem, itemNo: items.length + 1 });
        }
        return { ...b, items: items.map((item, i) => ({ ...item, itemNo: i + 1 })) };
      }),
    }));
    setItemModal(null);
  };

  // ---- Auto-calculated totals ----
  const totals = useMemo(() => overallTotals(values.packingBoxes), [values.packingBoxes]);

  // ---- Submit ----
  /* ONE validation + payload path for both footer actions. "Save Packing
     List" and "Save and Continue" differ only in where the page navigates
     afterwards, so the two buttons can never validate or persist
     differently. Returns undefined when validation fails: the error is shown
     and every entered box/item value stays on the form. */
  const buildPayload = () => {
    if (!values.packingDate) {
      setError('Packing date is required.');
      return;
    }
    if (!values.operator.trim()) {
      setError('Operator is required.');
      return;
    }
    if (!values.packingBoxes || values.packingBoxes.length === 0) {
      setError('Add at least one Packing Box.');
      return;
    }
    // Validate each box has items
    for (const box of values.packingBoxes) {
      if (!box.items || box.items.length === 0) {
        setError(`Packing Box #${box.boxNumber} must contain at least one item.`);
        return;
      }
    }
    // Validate box-level weights and item quantities
    for (const box of values.packingBoxes) {
      const packingWeight = Number(box.packingWeight) || 0;
      if (packingWeight < 0) {
        setError(`Packing Box #${box.boxNumber}: Packing Weight cannot be negative.`);
        return;
      }
      for (const item of box.items) {
        if (!item.workOrder) {
          setError(`Item in Box #${box.boxNumber}: Please select a Work Order for each item.`);
          return;
        }
        if (Number(item.quantity) <= 0) {
          setError(`Item in Box #${box.boxNumber}: Packing quantity must be greater than zero.`);
          return;
        }
        if (Number(item.netWeight) < 0) {
          setError('Net Weight cannot be negative.');
          return;
        }
      }
    }
    // Validate per-Work-Order quantities don't exceed available
    const woQtyMap = {};
    for (const box of values.packingBoxes) {
      for (const item of box.items) {
        const wo = item.workOrder;
        if (!wo) continue;
        woQtyMap[wo] = (woQtyMap[wo] || 0) + (Number(item.quantity) || 0);
      }
    }
    for (const [wo, packedQty] of Object.entries(woQtyMap)) {
      const order = orders.find((o) => o.workOrder === wo);
      if (!order) continue;
      const accepted = qcAcceptedQty(order, entries);
      const alreadyPacked = alreadyPackedQty(records, wo, editingId);
      const available = Math.max(0, accepted - alreadyPacked);
      if (packedQty > available) {
        setError(`Work Order ${wo}: Packing quantity (${packedQty}) exceeds available (${available}).`);
        return;
      }
    }

    setError('');
    // Determine the primary Work Order (first item's WO)
    const firstItem = values.packingBoxes[0]?.items[0];
    const primaryWO = firstItem?.workOrder || '';
    const primaryOrder = orders.find((o) => o.workOrder === primaryWO);
    return {
      ...values,
      id: isEdit ? editingId : nextListNumber,
      productionOrder: primaryWO,
      salesOrderId: primaryOrder?.salesOrderId || '',
      salesOrderNumber: primaryOrder?.salesOrderNumber || '',
      product: primaryOrder?.product || '',
      productionType: primaryOrder ? productionTypeOf(primaryOrder) : '',
      packingBoxes: values.packingBoxes.map((box, bi) => ({
        ...box,
        boxNumber: bi + 1,
        packingWeight: Number(box.packingWeight) || 0,
        items: box.items.map((item, ii) => ({
          ...item,
          itemNo: ii + 1,
          quantity: Number(item.quantity) || 0,
          netWeight: Number(item.netWeight) || 0,
        })),
      })),
      quantity: totals.qty,
    };
  };

  /* Both footer actions await the page's save, so the buttons stay disabled
     while the request is in flight and only one Packing List is ever created.
     A failed save leaves this component mounted with every entered value. */
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

  const handleSubmit = () => submit('save');

  const field = (key) => values[key] ?? '';

  const formFooter = (
    <>
      <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>
        Cancel
      </button>
      <button type="button" className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
        <Icon name="check" size={15} /> Save Packing List
      </button>
      {/* Same save, then the saved Packing List's preview — the page decides
          the destination once the request has succeeded. */}
      <button type="button" className="btn btn-secondary" onClick={() => submit('continue')} disabled={saving}>
        <Icon name="play" size={15} /> Save and Continue
      </button>
    </>
  );

  /* The same form body backs both the overlay (edit from the list) and the
     dedicated create page — no second copy of the fields. */
  const formBody = (
    <>
      <div className="pl-form">
        {/* 1 · Packing Details */}
        <div className="pl-form-section">
          <h4 className="pl-form-section-title">1 · Packing Details</h4>
          <div className="form-grid">
            <label className="form-field">
              <span className="form-label">Packing List Number</span>
              <input className="form-input" value={isEdit ? editingId : nextListNumber} disabled />
              <span className="form-hint">Auto-generated</span>
            </label>
            <label className="form-field">
              <span className="form-label">Packing Date *</span>
              <input type="date" className="form-input" value={values.packingDate} onChange={set('packingDate')} />
            </label>
            <label className="form-field">
              <span className="form-label">Operator *</span>
              <input className="form-input" value={values.operator} onChange={set('operator')} placeholder="Packed by" />
            </label>
            <label className="form-field form-field-wide">
              <span className="form-label">Remarks</span>
              <textarea className="form-textarea" rows={2} value={values.remarks} onChange={set('remarks')} placeholder="Optional notes…" />
            </label>
          </div>
        </div>

        {/* 2 · Exporter / Buyer / Shipping Details */}
        <div className="pl-form-section">
          <h4 className="pl-form-section-title">2 · Exporter / Buyer / Shipping Details</h4>
          <div className="form-grid">
            <label className="form-field form-field-wide">
              <span className="form-label">Exporter / Manufacturer</span>
              <input className="form-input" value={values.exporterName} onChange={set('exporterName')} placeholder="Company name" />
            </label>
            <label className="form-field form-field-wide">
              <span className="form-label">Company Address</span>
              <input className="form-input" value={values.exporterAddress} onChange={set('exporterAddress')} placeholder="Address, city, country, PIN" />
            </label>
            <label className="form-field">
              <span className="form-label">Email</span>
              <input className="form-input" value={values.exporterEmail} onChange={set('exporterEmail')} placeholder="sales@company.com" />
            </label>
            <label className="form-field">
              <span className="form-label">Phone</span>
              <input className="form-input" value={values.exporterPhone} onChange={set('exporterPhone')} placeholder="+91 …" />
            </label>
            <div className="form-field form-field-wide">
              <span className="form-label">Signature Image (Authorization)</span>
              <div className="pl-signature-upload">
                <input
                  id="pl-signature-input"
                  type="file"
                  accept="image/png,image/jpeg"
                  className="pl-signature-file"
                  onChange={handleSignatureUpload}
                />
                <label htmlFor="pl-signature-input" className="btn btn-secondary">
                  <Icon name="upload" size={13} /> {values.signatureImage ? 'Replace Signature' : 'Upload Signature'}
                </label>
                {values.signatureImage && (
                  <>
                    <img src={values.signatureImage} alt="Signature preview" className="pl-signature-preview" />
                    <button
                      type="button"
                      className="btn-icon btn-icon-danger pl-signature-clear"
                      title="Remove signature"
                      onClick={() => setValues((prev) => ({ ...prev, signatureImage: '' }))}
                    >
                      <Icon name="trash" size={13} />
                    </button>
                  </>
                )}
                <span className="form-hint">PNG or JPEG, shown above "For … / Authorized Signatory" on the PDF.</span>
              </div>
            </div>
            {HEADER_FIELDS.map((h) => (
              <label key={h.key} className={`form-field${h.wide ? ' form-field-wide' : ''}`}>
                <span className="form-label">{h.label}</span>
                <input
                  type={h.type || 'text'}
                  className="form-input"
                  value={field(h.key)}
                  onChange={set(h.key)}
                />
              </label>
            ))}
            <label className="form-field form-field-wide">
              <span className="form-label">Declaration</span>
              <textarea className="form-textarea" rows={2} value={values.declaration} onChange={set('declaration')} />
            </label>
          </div>
        </div>

        {/* 3 · Packing Boxes & Items */}
        <div className="pl-form-section">
          <div className="pl-form-section-head">
            <h4 className="pl-form-section-title">
              3 · Packing Boxes &amp; Items
              {totals.boxes > 0 && (
                <span className="pl-box-summary">
                  {' '}( {totals.boxes} {totals.boxes === 1 ? 'Box' : 'Boxes'} · {totals.totalItems} Items · {totals.qty} Qty · {totals.net} KG Net · {totals.gross} KG Gross )
                </span>
              )}
            </h4>
          </div>

          {values.packingBoxes.map((box, boxIdx) => {
            const bt = boxTotals(box);
            const isExpanded = expandedBoxes.includes(box.id);
            return (
              <div key={box.id} className="pl-box-card">
                <div className="pl-box-header" onClick={() => toggleBox(box.id)}>
                  <div className="pl-box-header-left">
                    <Icon name={isExpanded ? 'chevron-down' : 'chevron-right'} size={14} />
                    <span className="pl-box-number">
                      Wooden Box #{box.boxNumber}
                    </span>
                    <span className="pl-box-dims">
                      {box.length && box.width && box.height
                        ? `${box.length} × ${box.width} × ${box.height}`
                        : 'No dimensions'}
                    </span>
                    <span className="pl-box-meta">
                      {box.items.length} {box.items.length === 1 ? 'item' : 'items'}
                    </span>
                    {bt.qty > 0 && (
                      <span className="pl-box-qty">
                        {bt.qty} {box.items[0]?.unit || 'Pcs'} · {bt.net} KG · {bt.gross} KG
                      </span>
                    )}
                  </div>
                  <div className="pl-box-header-right" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      className="btn-icon btn-icon-danger"
                      title="Remove this box"
                      onClick={() => removeBox(box.id)}
                    >
                      <Icon name="trash" size={13} />
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="pl-box-body">
                    {/* Box details */}
                    <div className="pl-box-fields">
                      <label className="form-field">
                        <span className="form-label">Package Type</span>
                        <input
                          className="form-input"
                          list={`pl-pkg-${box.id}`}
                          value={box.packageType}
                          onChange={(e) => updateBox(box.id, 'packageType', e.target.value)}
                          placeholder="WOODEN BOX"
                        />
                        <datalist id={`pl-pkg-${box.id}`}>
                          {PACKAGE_KINDS.map((k) => (
                            <option key={k} value={k} />
                          ))}
                        </datalist>
                      </label>
                      <label className="form-field">
                        <span className="form-label">Marks &amp; Nos / Container No</span>
                        <input
                          className="form-input"
                          value={box.marksNos || box.marks || ''}
                          onChange={(e) => updateBox(box.id, 'marksNos', e.target.value)}
                          placeholder="e.g. SLK/C/1-5"
                        />
                      </label>
                      <label className="form-field">
                        <span className="form-label">Length (mm)</span>
                        <input
                          className="form-input"
                          value={box.length}
                          onChange={(e) => updateBox(box.id, 'length', e.target.value)}
                          placeholder="0"
                        />
                      </label>
                      <label className="form-field">
                        <span className="form-label">Width (mm)</span>
                        <input
                          className="form-input"
                          value={box.width}
                          onChange={(e) => updateBox(box.id, 'width', e.target.value)}
                          placeholder="0"
                        />
                      </label>
                      <label className="form-field">
                        <span className="form-label">Height (mm)</span>
                        <input
                          className="form-input"
                          value={box.height}
                          onChange={(e) => updateBox(box.id, 'height', e.target.value)}
                          placeholder="0"
                        />
                      </label>
                      <label className="form-field">
                        <span className="form-label">Packing Weight (KGS)</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className="form-input"
                          value={box.packingWeight || ''}
                          onChange={(e) => updateBox(box.id, 'packingWeight', e.target.value)}
                          placeholder="Weight of box/packing material"
                        />
                        <span className="form-hint">Wooden box + packing material weight</span>
                      </label>
                    </div>

                    {/* Box calculated weight summary */}
                    <div className="pl-box-weight-summary">
                      <span className="pl-weight-item">
                        Net Weight: <strong>{bt.net.toFixed(2)} KGS</strong>
                      </span>
                      <span className="pl-weight-item">
                        Packing Weight: <strong>{bt.packingWeight.toFixed(2)} KGS</strong>
                      </span>
                      <span className="pl-weight-item pl-weight-gross">
                        Gross Weight: <strong>{bt.gross.toFixed(2)} KGS</strong>
                        <span className="form-hint">(Net + Packing)</span>
                      </span>
                    </div>

                    {/* Items table for this box */}
                    {box.items.length > 0 && (
                      <div className="table-scroll">
                        <table className="data-table pl-items-table sgrid sgrid-prod sgrid-actions">
                          <thead>
                            <tr>
                              <th className="sgrid-pin sgrid-first">S.No</th>
                              <th>Description</th>
                              <th>Part Number</th>
                              <th>Manufacturer</th>
                              <th>Qty</th>
                              <th>Unit</th>
                              <th>Net Weight (KGS)</th>
                              <th className="sgrid-pin-actions" aria-label="Actions" />
                            </tr>
                          </thead>
                          <tbody>
                            {box.items.map((item, itemIdx) => {
                              return (
                                <tr key={item.id}>
                                  <td className="cell-muted sgrid-pin sgrid-first">{item.itemNo}</td>
                                  <td className="pl-item-desc">{item.description || '—'}</td>
                                  <td className="cell-muted">{item.partNumber || '—'}</td>
                                  <td>{item.manufacturer || '—'}</td>
                                  <td className="cell-strong">{item.quantity}</td>
                                  <td>{item.unit || 'Pcs'}</td>
                                  <td className="cell-strong">{Number(item.netWeight) || 0} KGS</td>
                                  <td className="sgrid-pin-actions">
                                    <div className="row-actions">
                                      <button
                                        type="button"
                                        className="btn-icon"
                                        title="Edit item"
                                        onClick={() => editItemInBox(box.id, itemIdx)}
                                      >
                                        <Icon name="edit" size={13} />
                                      </button>
                                      <button
                                        type="button"
                                        className="btn-icon btn-icon-danger"
                                        title="Remove item"
                                        onClick={() => removeItemFromBox(box.id, itemIdx)}
                                      >
                                        <Icon name="trash" size={13} />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}

                    <button
                      type="button"
                      className="btn btn-secondary pl-add-item-btn"
                      onClick={() => addItemToBox(box.id)}
                    >
                      <Icon name="plus" size={13} /> Add Item to Box #{box.boxNumber}
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          <button type="button" className="btn btn-secondary pl-add-box-btn" onClick={addBox}>
            <Icon name="plus" size={14} /> Add Packing Box
          </button>
        </div>

        {error && (
          <p className="form-error">
            <Icon name="info" size={14} /> {error}
          </p>
        )}

        <p className="pl-form-note">
          Packing List Number: <strong>{isEdit ? editingId : nextListNumber}</strong> (auto-generated)
          · Packing Date: {formatDate(values.packingDate)}
          · Total: {totals.boxes} {totals.boxes === 1 ? 'box' : 'boxes'}, {totals.totalItems} items, {totals.qty} qty
        </p>
      </div>

      {/* Item edit/add modal */}
      {itemModal && (
        <ItemEditModal
          itemData={itemModal.itemData}
          isNew={itemModal.itemIndex === null || itemModal.itemIndex === undefined}
          onSave={saveItem}
          onCancel={() => setItemModal(null)}
          orders={orders}
          entries={entries}
          records={records}
          editingId={editingId}
        />
      )}
    </>
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

// ============================================================
// ItemEditModal — form for adding/editing an item inside a box
// Each item is linked to a Production Work Order. Selecting a WO
// auto-fills Item Name, QC Accepted Qty, Already Packed Qty, etc.
// ============================================================
function ItemEditModal({ itemData, isNew, onSave, onCancel, orders = [], entries = [], records = [], editingId }) {
  const [data, setData] = useState({ ...itemData });
  const [err, setErr] = useState('');

  const set = (key) => (e) => setData((prev) => ({ ...prev, [key]: e.target.value }));

  // Work Orders with QC completed (eligible for packing)
  const eligibleOrders = useMemo(() => {
    return (orders || []).filter((order) => {
      const accepted = qcAcceptedQty(order, entries);
      if (accepted <= 0) return false;
      // If editing an existing item, allow the same WO
      if (!isNew && data.workOrder === order.workOrder) return true;
      // Check if there's remaining available quantity
      const packed = alreadyPackedQty(records, order.workOrder, editingId);
      return packed < accepted;
    });
  }, [orders, entries, records, isNew, data.workOrder, editingId]);

  // Get QC accepted and already packed for the selected Work Order
  const selectedOrder = useMemo(() => {
    if (!data.workOrder) return null;
    return orders.find((o) => o.workOrder === data.workOrder) || null;
  }, [orders, data.workOrder]);

  const qcAccepted = useMemo(() => {
    if (!selectedOrder) return 0;
    return qcAcceptedQty(selectedOrder, entries);
  }, [selectedOrder, entries]);

  const alreadyPacked = useMemo(() => {
    if (!data.workOrder) return 0;
    return alreadyPackedQty(records, data.workOrder, editingId);
  }, [records, data.workOrder, editingId]);

  const availableQty = Math.max(0, qcAccepted - alreadyPacked);

  // When Work Order changes, auto-populate item details
  const handleWorkOrderChange = (e) => {
    const wo = e.target.value;
    const order = orders.find((o) => o.workOrder === wo);
    if (!order) {
      setData((prev) => ({
        ...prev,
        workOrder: '',
        description: '',
        partNumber: '',
        manufacturer: '',
        countryOfOrigin: '',
        hsCode: '',
        unit: 'Pcs',
        qcAcceptedQty: 0,
        alreadyPackedQty: 0,
        availableQty: 0,
      }));
      return;
    }
    const accepted = qcAcceptedQty(order, entries);
    const packed = alreadyPackedQty(records, wo, editingId);
    setData((prev) => ({
      ...prev,
      workOrder: wo,
      description: order.product || '',
      partNumber: order.patternNumber || order.drawingNumber || '',
      manufacturer: '',
      countryOfOrigin: 'Republic of India',
      hsCode: '',
      unit: order.unit || 'Pcs',
      qcAcceptedQty: accepted,
      alreadyPackedQty: packed,
      availableQty: Math.max(0, accepted - packed),
      quantity: Math.max(0, accepted - packed),
    }));
  };

  const handleSubmit = () => {
    if (!data.workOrder) {
      setErr('Please select a Work Order.');
      return;
    }
    if (!data.description.trim()) {
      setErr('Item description is required.');
      return;
    }
    if (Number(data.quantity) <= 0) {
      setErr('Packing quantity must be greater than zero.');
      return;
    }
    if (Number(data.quantity) > data.availableQty) {
      setErr(`Packing quantity (${data.quantity}) cannot exceed available quantity (${data.availableQty}).`);
      return;
    }
    if (Number(data.netWeight) < 0) {
      setErr('Net Weight cannot be negative.');
      return;
    }
    onSave(data);
  };

  return (
    <Modal
      title={isNew ? 'Add Packing Item' : `Edit Item — ${data.description || '#' + data.itemNo}`}
      size="md"
      onClose={onCancel}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={handleSubmit}>
            <Icon name="check" size={14} /> {isNew ? 'Add Item' : 'Save Changes'}
          </button>
        </>
      }
    >
      <div className="pl-form">
        <div className="form-grid">
          {/* Work Order Selection */}
          <label className="form-field form-field-wide">
            <span className="form-label">Work Order *</span>
            <select
              className="form-select"
              value={data.workOrder || ''}
              onChange={handleWorkOrderChange}
              disabled={!isNew}
            >
              <option value="">
                {eligibleOrders.length ? 'Select a Work Order with QC completed…' : 'No eligible Work Orders'}
              </option>
              {eligibleOrders.map((o) => {
                const accepted = qcAcceptedQty(o, entries);
                const packed = alreadyPackedQty(records, o.workOrder, editingId);
                const avail = Math.max(0, accepted - packed);
                return (
                  <option key={o.workOrder} value={o.workOrder}>
                    {o.workOrder} — {o.product} · QC Accepted: {accepted} · Available: {avail}
                  </option>
                );
              })}
            </select>
            {eligibleOrders.length === 0 && (
              <span className="form-hint">No Work Orders with completed QC available for packing.</span>
            )}
          </label>

          {/* Auto-populated Work Order Info */}
          {selectedOrder && (
            <div className="pl-wo-info">
              <div className="pl-wo-info-item">
                <span className="pl-wo-info-label">Item Name</span>
                <span className="pl-wo-info-value">{selectedOrder.product || '—'}</span>
              </div>
              <div className="pl-wo-info-item">
                <span className="pl-wo-info-label">Production Type</span>
                <span className="pl-wo-info-value">{productionTypeOf(selectedOrder)}</span>
              </div>
              <div className="pl-wo-info-item">
                <span className="pl-wo-info-label">QC Accepted Qty</span>
                <span className="pl-wo-info-value pl-wo-accepted">{qcAccepted}</span>
              </div>
              <div className="pl-wo-info-item">
                <span className="pl-wo-info-label">Already Packed Qty</span>
                <span className="pl-wo-info-value">{alreadyPacked}</span>
              </div>
              <div className="pl-wo-info-item">
                <span className="pl-wo-info-label">Available Qty</span>
                <span className="pl-wo-info-value pl-wo-available">{availableQty}</span>
              </div>
            </div>
          )}

          <label className="form-field form-field-wide">
            <span className="form-label">Item Description *</span>
            <input
              className="form-input"
              value={data.description}
              onChange={set('description')}
              placeholder="e.g. First blade, Hydraulic cylinder"
            />
          </label>
          <label className="form-field">
            <span className="form-label">Part Number</span>
            <input
              className="form-input"
              value={data.partNumber}
              onChange={set('partNumber')}
              placeholder="e.g. S001.04.9209-OZ"
            />
          </label>
          <label className="form-field">
            <span className="form-label">Manufacturer</span>
            <input
              className="form-input"
              value={data.manufacturer}
              onChange={set('manufacturer')}
              placeholder="e.g. IKN"
            />
          </label>
          <label className="form-field">
            <span className="form-label">Country of Origin</span>
            <input
              className="form-input"
              value={data.countryOfOrigin}
              onChange={set('countryOfOrigin')}
              placeholder="e.g. Republic of India"
            />
          </label>
          <label className="form-field">
            <span className="form-label">HS Code</span>
            <input
              className="form-input"
              value={data.hsCode}
              onChange={set('hsCode')}
              placeholder="e.g. 8412218008"
            />
          </label>
          <label className="form-field">
            <span className="form-label">Packing Quantity *</span>
            <input
              type="number"
              min="0"
              className="form-input"
              value={data.quantity}
              onChange={set('quantity')}
            />
            {data.workOrder && (
              <span className="form-hint">Max available: {availableQty}</span>
            )}
          </label>
          <label className="form-field">
            <span className="form-label">Unit</span>
            <input
              className="form-input"
              value={data.unit}
              onChange={set('unit')}
              placeholder="Pcs / NOS / SET"
            />
          </label>
          <label className="form-field">
            <span className="form-label">Net Weight (KGS) *</span>
            <input
              type="number"
              min="0"
              step="0.01"
              className="form-input"
              value={data.netWeight || ''}
              onChange={set('netWeight')}
              placeholder="Total net weight in KGS"
            />
            <span className="form-hint">Enter the total net weight for this item</span>
          </label>
        </div>
        {err && (
          <p className="form-error">
            <Icon name="info" size={14} /> {err}
          </p>
        )}
      </div>
    </Modal>
  );
}
