// ============================================================================
// PackingListDocument — the single reusable Packing List A4 document.
//
// ONE component renders the packing list for Preview, Download PDF and Print
// (the SalesDocumentDesign workspace captures / prints the same #salesdoc-sheet
// DOM), so the three outputs are pixel-identical by construction.
//
// The document is composed of NAMED sections — masthead, meta (document
// references), exporter, buyer/consignee, logistics totals, status, commercial
// details, shipment, destination & terms, remarks, terms, package details,
// item details, declaration, signature, attachments, footer — rendered in a
// fixed, content-aware order. The 15 Packing List templates
// (packing-list-templates.css, keyed off the `data-pl-layout` attribute)
// rearrange and restyle these same sections into genuinely different A4
// compositions — Preview = Print = PDF everywhere.
//
// Content-aware: totals/status show only when real data exists, remarks/terms/
// attachments render only when populated, and the shipment timeline shows only
// the stages that actually exist in the record (origin → port → vessel →
// destination → delivery). Every value comes from the live record — never
// sample data. Edit mode swaps values for the module's own inputs, so the
// document stays visually identical to the final packing list while editing.
// ============================================================================
import {
  Box,
  Building2,
  ClipboardList,
  FileText,
  Flag,
  Globe,
  Landmark,
  List,
  MapPin,
  PenLine,
  Ship,
  Stamp,
  StickyNote,
  Truck,
  Users
} from 'lucide-react';
import Letterhead from './Letterhead';

const ACC = 'var(--acc)';

// ---- Label / value row; edit mode swaps in the module's own input. ---------
function PlRow({ fkey, label, type, extra = {}, fieldMap, editing, renderFieldInput, val, has }) {
  const src = fieldMap[fkey] || {};
  const f = {
    key: fkey,
    label,
    type: type || src.type || 'text',
    options: src.options,
    rows: src.rows || 2,
    placeholder: src.placeholder || '',
    ...extra
  };
  const readOnly = src.readOnly === true || f.readOnly === true;
  const edit = editing && !readOnly;
  if (!edit && !has(fkey)) return null;
  return (
    <div className="pl-row">
      <span className="pl-lbl">{f.label}</span>
      <div className="pl-val">
        {edit ? (
          renderFieldInput(f)
        ) : (
          <span className={f.type === 'textarea' ? 'pl-val--wrap' : ''}>{val(fkey) || '—'}</span>
        )}
      </div>
    </div>
  );
}

// ---- Combined "No & Date" reference row (Invoice / Contract / PO ...). -------
function PlComboRow({ label, noKey, dateKey, noFallback, dateFallback, editing, renderFieldInput, val, fmtDate, has }) {
  const noVal = val(noKey) || val(noFallback);
  const dtVal = fmtDate(dateKey) || fmtDate(dateFallback);
  return (
    <div className="pl-row">
      <span className="pl-lbl">{label}</span>
      <div className="pl-val">
        {editing ? (
          <div className="flex items-center gap-1.5 justify-end">
            {renderFieldInput({ key: noKey, label, type: 'text', placeholder: '' })}
            {renderFieldInput({ key: dateKey, label: '', type: 'date' })}
          </div>
        ) : (
          <span>{[noVal, dtVal].filter(Boolean).join('  ·  ') || '—'}</span>
        )}
      </div>
    </div>
  );
}

// ---- Section frame ----------------------------------------------------------
function PlSection({ title, icon: Icon, className = '', children, sub }) {
  return (
    <section className={`pl-sec ${className}`.trim()}>
      <div className="pl-sec-head">
        <span className="pl-sec-title">
          {Icon ? <Icon className="pl-sec-icon" /> : null}
          {title}
        </span>
        {sub ? <span className="pl-sec-sub">{sub}</span> : null}
      </div>
      <div className="pl-sec-body">{children}</div>
    </section>
  );
}

export default function PackingListDocument({
  merged = {},
  fieldMap = {},
  editMode = false,
  canEdit = false,
  renderFieldInput,
  brandName = 'VISHAK TECH',
  docTitle = 'PACKING LIST',
  items = [],
  attachments = [],
  sheetVal,
  hasSheetVal,
  fmtSheetDate,
  selectLabel,
  displayNo = '',
  dateKey = 'packingListDate',
  status = '',
  plTemplate = 'global-trade-classic',
  addRow,
  updateItem,
  removeItem,
  duplicateItem,
  setField
}) {
  const editing = editMode && canEdit;
  const val = (key) => {
    const v = sheetVal ? sheetVal(key) : merged[key];
    return v === undefined || v === null ? '' : String(v);
  };
  const has = (key) => {
    const v = sheetVal ? sheetVal(key) : merged[key];
    return v !== undefined && v !== null && String(v).trim() !== '';
  };
  const fmtDate = (key) => {
    const v = sheetVal ? sheetVal(key) : merged[key];
    if (!v) return '';
    return /^\d{4}-\d{2}-\d{2}/.test(String(v)) ? fmtSheetDate(key) : String(v);
  };

  const rowCtx = { fieldMap, editing, renderFieldInput, val, has };
  const comboCtx = { editing, renderFieldInput, val, fmtDate, has };

  const fmtNum = (v) => Number(v || 0).toLocaleString('en-US', { maximumFractionDigits: 3 });
  const fmtQty = (v) => Number(v || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });

  // ---- Logistics totals (computed exactly as before, from live data) --------
  const realItems = items.filter((it) => !it.rowType || it.rowType === 'item');
  const sumQty = realItems.reduce((s, it) => s + (Number(it.qty) || 0), 0);
  const sumNet = realItems.reduce((s, it) => s + (Number(it.netWeight) || 0), 0);
  const sumGross = realItems.reduce((s, it) => s + (Number(it.grossWeight) || 0), 0);
  const totalPkgs =
    Number(merged.totalPackages) > 0 ? Number(merged.totalPackages) : realItems.length > 0 ? 1 : 0;
  const totalQtyVal = sumQty || Number(merged.totalQty) || 0;
  const netVal = sumNet || Number(merged.netWeight) || 0;
  const grossVal = sumGross || Number(merged.grossWeight) || 0;
  const totalVolume = Number(merged.totalVolume) > 0 ? Number(merged.totalVolume) : 0;
  const totalCbm = Number(merged.totalCbm) > 0 ? Number(merged.totalCbm) : 0;

  const logistics = [
    { label: 'Total Packages', value: fmtNum(totalPkgs) },
    { label: 'Total Quantity', value: `${fmtNum(totalQtyVal)} NOS` },
    { label: 'Net Weight', value: `${fmtNum(netVal)} KGS` },
    { label: 'Gross Weight', value: `${fmtNum(grossVal)} KGS` },
    ...(totalVolume > 0 ? [{ label: 'Total Volume', value: `${fmtNum(totalVolume)} CBM` }] : []),
    ...(totalCbm > 0 ? [{ label: 'Total CBM', value: fmtNum(totalCbm) }] : [])
  ];

  // ---- Combined "No & Date" reference rows (the current banner) -------------
  const bannerRefs = [
    ['Packing List No. & Date', [displayNo || '', fmtSheetDate(dateKey)].filter(Boolean).join(' / ')],
    ['Contract No. & Date', [has('contractNo') ? val('contractNo') : '', fmtDate('contractDate')].filter(Boolean).join(' / ')],
    ['Appendix / PO No. & Date', [has('appendixPoNo') ? val('appendixPoNo') : '', fmtDate('appendixDate')].filter(Boolean).join(' / ')],
    ['Invoice No. & Date', [has('invoiceNo') ? val('invoiceNo') : '', fmtDate('invoiceDate')].filter(Boolean).join(' / ')],
    ["Buyer's Order No. & Date", [has('buyersOrderNo') ? val('buyersOrderNo') : '', fmtDate('buyersOrderDate')].filter(Boolean).join(' / ')]
  ].filter(([, v]) => v && String(v).trim() !== '');

  // ---- Shipment timeline (only populated stages render) ---------------------
  const shipmentStages = [
    ['Origin', [val('countryOfOrigin'), val('placeOfReceipt')].filter(Boolean).join(' · ')],
    ['Port of Loading', val('portOfLoading')],
    ['Vessel / Flight', val('vesselFlightNo')],
    ['Port of Discharge', val('portOfDischarge')],
    ['Destination', val('countryOfFinalDestination') || val('placeOfDelivery')]
  ].filter(([, v]) => v && String(v).trim() !== '');

  // ---- Field groups (same fields / mapping as the current renderer) --------
  const exporterFields = [
    { key: 'exporterName', label: 'Exporter Name' },
    { key: 'exporterAddress', label: 'Address', type: 'textarea' },
    { key: 'exporterEmail', label: 'Email' },
    { key: 'exporterPhone', label: 'Phone' },
    { key: 'exporterGstin', label: 'GSTIN No.' },
    { key: 'exporterPan', label: 'PAN No.' },
    { key: 'exporterRef', label: "Exporter's Ref." }
  ];
  const commercialFields = [
    { key: 'referenceNo', label: 'Reference No.' },
    { key: 'validTill', label: 'Valid Till', type: 'date' },
    { key: 'sourceRef', label: 'Customer Purchase Order' },
    { key: 'clientName', label: 'Customer' },
    { key: 'contactPerson', label: 'Contact Person' },
    { key: 'source', label: 'Source', type: 'select' }
  ];
  const shipFields = [
    { key: 'countryOfOrigin', label: 'Country of Origin of Goods' },
    { key: 'preCarriageBy', label: 'Pre-Carriage By' },
    { key: 'placeOfReceipt', label: 'Place of Receipt' },
    { key: 'vesselFlightNo', label: 'Vessel / Flight No.' },
    { key: 'portOfLoading', label: 'Port of Loading' }
  ];
  const destFields = [
    { key: 'countryOfFinalDestination', label: 'Country of Final Destination' },
    { key: 'hsCode', label: 'HS Code' },
    { key: 'commodity', label: 'Commodity' },
    { key: 'portOfDischarge', label: 'Port of Discharge' },
    { key: 'placeOfDelivery', label: 'Place of Delivery' },
    { key: 'termsOfDelivery', label: 'Terms of Delivery', type: 'select' },
    { key: 'paymentTerms', label: 'Payment Terms', type: 'select' }
  ];

  const declText =
    String(val('declaration') || '').trim() ||
    'We declare that this Packing List shows the actual weight of the goods described and that all particulars are true and correct.';

  const inputCls =
    'w-full bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-[10.5px] text-slate-700 outline-none focus:border-[var(--acc)]';

  // ---- Item table columns ---------------------------------------------------
  const itemCols = [
    { label: 'S.No', w: '4%' },
    { label: 'Description of Goods', w: '34%' },
    { label: 'Packing / Package No.', w: '14%' },
    { label: 'Qty', w: '8%' },
    { label: 'Unit', w: '8%' },
    { label: 'Net Weight (KGS)', w: '16%' },
    { label: 'Gross Weight (KGS)', w: '16%' }
  ];

  const attNames = (Array.isArray(attachments) ? attachments : [])
    .map((a) => a?.fileName || a?.originalName || a?.name || '')
    .filter(Boolean);

  return (
    <>
      {/* ===== Document header: locked company letterhead (global) ===== */}
      <Letterhead className="mb-2" />

      <div className="packing-list-doc packing-list-doc--view" data-pl-layout={plTemplate}>
        {/* ===== Masthead (title + document identity) ================== */}
        <div className="pl-masthead">
          <span className="pl-doc-title">{docTitle}</span>
          {shipmentStages.length >= 2 && (
            <div className="pl-timeline">
              {shipmentStages.map(([label, value]) => (
                <div key={label} className="pl-timeline-step">
                  <span className="pl-timeline-dot" />
                  <span className="pl-timeline-label">{label}</span>
                  <span className="pl-timeline-value">{value}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ===== Document references (No & Date rows) ================== */}
        <div className="pl-meta">
          <PlSection icon={FileText} title="Document References" className="pl-meta-sec">
            {bannerRefs.map(([label, value]) => (
              <div key={label} className="pl-ref-line">
                <span className="pl-lbl">{label}</span>
                <span className="pl-val">{value}</span>
              </div>
            ))}
          </PlSection>
        </div>

        {/* ===== Exporter / Manufacturer =============================== */}
        <PlSection icon={Building2} title="Exporter / Manufacturer" className="pl-exporter">
          {editing ? (
            <div className="space-y-1.5">
              {exporterFields.map((f) => renderFieldInput({ ...f, key: f.key, label: f.label, type: f.type, rows: f.type === 'textarea' ? 2 : undefined }))}
            </div>
          ) : (
            <>
              <div className="pl-name">{val('exporterName') || '—'}</div>
              <div className="pl-addr">{val('exporterAddress') || '—'}</div>
              <div className="pl-contact-lines">
                {val('exporterEmail') ? <div className="pl-contact-line"><span className="pl-contact-lbl">Email</span><span className="pl-contact-val">{val('exporterEmail')}</span></div> : null}
                {val('exporterPhone') ? <div className="pl-contact-line"><span className="pl-contact-lbl">Phone</span><span className="pl-contact-val">{val('exporterPhone')}</span></div> : null}
                {val('exporterGstin') ? <div className="pl-contact-line"><span className="pl-contact-lbl">GSTIN</span><span className="pl-contact-val">{val('exporterGstin')}</span></div> : null}
                {val('exporterPan') ? <div className="pl-contact-line"><span className="pl-contact-lbl">PAN</span><span className="pl-contact-val">{val('exporterPan')}</span></div> : null}
                {val('exporterRef') ? <div className="pl-contact-line"><span className="pl-contact-lbl">Ref</span><span className="pl-contact-val">{val('exporterRef')}</span></div> : null}
              </div>
            </>
          )}
        </PlSection>

        {/* ===== Buyer / Consignee ===================================== */}
        <PlSection icon={Users} title="Buyer / Consignee" className="pl-buyer">
          {editing ? (
            <div className="space-y-1.5">
              {renderFieldInput({ key: 'buyerName', label: 'Buyer Name', type: 'text' })}
              {renderFieldInput({ key: 'buyerAddress', label: 'Buyer Address', type: 'textarea', rows: 2 })}
              {renderFieldInput({ key: 'consigneeName', label: 'Consignee Name', type: 'text' })}
              {renderFieldInput({ key: 'consigneeAddress', label: 'Consignee Address', type: 'textarea', rows: 2 })}
              {renderFieldInput({ key: 'contactPerson', label: 'Contact Person', type: 'text' })}
            </div>
          ) : (
            <>
              <div className="pl-sub-head">Buyer (If Other Than Consignee)</div>
              <div className="pl-name">{val('buyerName') || '—'}</div>
              <div className="pl-addr">{val('buyerAddress') || '—'}</div>
              {val('contactPerson') ? <div className="pl-extra">Contact: {val('contactPerson')}</div> : null}
              <div className="pl-sub-head">Consignee</div>
              <div className="pl-name">{val('consigneeName') || '—'}</div>
              <div className="pl-addr">{val('consigneeAddress') || '—'}</div>
            </>
          )}
        </PlSection>

        {/* ===== Totals (Logistics) ===================================== */}
        <PlSection icon={BarChartIcon} title="Totals (Logistics)" className="pl-totals">
          {logistics.map(({ label, value }) => (
            <div key={label} className="pl-log-row">
              <span className="pl-lbl">{label}</span>
              <span className="pl-val pl-log-val">{value}</span>
            </div>
          ))}
        </PlSection>

        {/* ===== Status ================================================ */}
        {status ? (
          <PlSection icon={Flag} title="Status" className="pl-status">
            <div className="pl-status-val">{String(status).replace(/_/g, ' ')}</div>
          </PlSection>
        ) : null}

        {/* ===== Commercial Details ===================================== */}
        <PlSection icon={ClipboardList} title="Commercial Details" className="pl-commercial">
          <PlComboRow label="Invoice No & Date" noKey="invoiceNo" dateKey="invoiceDate" {...comboCtx} />
          <PlComboRow label="Contract No & Date" noKey="contractNo" dateKey="contractDate" {...comboCtx} />
          <PlComboRow label="Appendix / PO No & Date" noKey="appendixPoNo" dateKey="appendixDate" {...comboCtx} />
          <PlComboRow label="Buyer's Order No & Date" noKey="buyersOrderNo" dateKey="buyersOrderDate" {...comboCtx} />
          {commercialFields.map((f) => (
            <PlRow key={f.key} fkey={f.key} label={f.label} type={f.type} {...rowCtx} />
          ))}
        </PlSection>

        {/* ===== Shipping / Export Information ========================= */}
        <PlSection icon={Ship} title="Shipping / Export Information" className="pl-shipment">
          {shipFields.map((f) => (
            <PlRow key={f.key} fkey={f.key} label={f.label} type={f.type} {...rowCtx} />
          ))}
        </PlSection>

        {/* ===== Destination & Terms =================================== */}
        <PlSection icon={Globe} title="Destination & Terms" className="pl-destination">
          {destFields.map((f) => (
            <PlRow key={f.key} fkey={f.key} label={f.label} type={f.type} {...rowCtx} />
          ))}
        </PlSection>

        {/* ===== Remarks (only when content exists) ==================== */}
        {(editing || has('notes')) && (
          <PlSection icon={StickyNote} title="Remarks" className="pl-remarks">
            <PlRow fkey="notes" label="Remarks" type="textarea" {...rowCtx} />
          </PlSection>
        )}

        {/* ===== Terms & Conditions (only when content exists) ========= */}
        {(editing || has('terms')) && (
          <PlSection icon={ClipboardList} title="Terms & Conditions" className="pl-terms">
            {editing ? (
              renderFieldInput({ key: 'terms', label: 'Terms & Conditions', type: 'textarea', rows: 5 })
            ) : (
              <div className="pl-terms-text">{val('terms')}</div>
            )}
          </PlSection>
        )}

        {/* ===== Package Details table ================================= */}
        <PlSection icon={Box} title="Package Details" className="pl-packages">
          <table className="pl-table pl-table--packages">
            <colgroup>
              <col style={{ width: '5%' }} />
              <col style={{ width: '20%' }} />
              <col style={{ width: '20%' }} />
              <col style={{ width: '22%' }} />
              <col style={{ width: '11%' }} />
              <col style={{ width: '11%' }} />
              <col style={{ width: '11%' }} />
            </colgroup>
            <thead>
              <tr>
                <th className="pl-col-num">S.No</th>
                <th>Marks &amp; Nos / Container No.</th>
                <th>No. &amp; Kind of Packages</th>
                <th>Package Dimensions (L × W × H)</th>
                <th className="pl-col-num">Qty (NOS)</th>
                <th className="pl-col-num">Net Weight (KGS)</th>
                <th className="pl-col-num">Gross Weight (KGS)</th>
              </tr>
            </thead>
            <tbody>
              <tr className="pl-item-row">
                <td className="pl-cell pl-cell-num">1</td>
                {['packageMarksNos', 'packageNoKindPkgs', 'packageDimensions'].map((k) => (
                  <td key={k} className="pl-cell">
                    {editing ? (
                      <input className={inputCls} value={sheetVal ? sheetVal(k) || '' : ''} onChange={(e) => setField(k, e.target.value)} />
                    ) : (
                      has(k) ? String(sheetVal(k)) : '—'
                    )}
                  </td>
                ))}
                <td className="pl-cell pl-cell-num">{fmtNum(totalQtyVal)}</td>
                <td className="pl-cell pl-cell-num">{fmtNum(netVal)}</td>
                <td className="pl-cell pl-cell-num">{fmtNum(grossVal)}</td>
              </tr>
              <tr className="pl-total-row">
                <td colSpan={4} className="pl-cell pl-cell-total-lbl">TOTAL</td>
                <td className="pl-cell pl-cell-num pl-cell-total">{fmtNum(totalQtyVal)}</td>
                <td className="pl-cell pl-cell-num pl-cell-total">{fmtNum(netVal)}</td>
                <td className="pl-cell pl-cell-num pl-cell-total">{fmtNum(grossVal)}</td>
              </tr>
            </tbody>
          </table>
        </PlSection>

        {/* ===== Item Details table ==================================== */}
        <PlSection icon={List} title="Item Details" className="pl-items">
          {editing && (
            <div className="pl-add-row">
              <button
                type="button"
                onClick={addRow}
                className="inline-flex items-center gap-1 text-[9px] font-bold px-2 py-1 rounded bg-white text-[var(--acc)] hover:bg-slate-100 cursor-pointer"
              >
                <span>+</span> Add Item
              </button>
            </div>
          )}
          <table className="pl-table pl-table--items">
            <colgroup>
              {itemCols.map((c) => (
                <col key={c.label} style={{ width: c.w }} />
              ))}
              {editing && <col style={{ width: '12%' }} />}
            </colgroup>
            <thead>
              <tr>
                {itemCols.map((c) => (
                  <th key={c.label} className={c.label === 'Qty' || c.label.startsWith('Net') || c.label.startsWith('Gross') ? 'pl-col-num' : ''}>
                    {c.label}
                  </th>
                ))}
                {editing && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {realItems.length === 0 ? (
                <tr>
                  <td colSpan={editing ? 8 : 7} className="pl-empty">
                    No items added yet
                  </td>
                </tr>
              ) : (
                realItems.map((it, i) => (
                  <tr key={`${it.productId || ''}-${i}`} className="pl-item-row">
                    <td className="pl-cell pl-cell-num">{i + 1}</td>
                    <td className="pl-cell">
                      {editing ? (
                        <input className={inputCls} value={it.description || ''} onChange={(e) => updateItem(i, 'description', e.target.value)} placeholder="Description" />
                      ) : (
                        <div className="pl-desc">
                          {[it.description, it.sku, it.drawingNo, it.material, it.manufacturer, it.countryOfOrigin]
                            .filter(Boolean)
                            .map((line, li) => (
                              <div key={li} className={li === 0 ? 'pl-desc-main' : 'pl-desc-sub'}>{line}</div>
                            )) || '—'}
                        </div>
                      )}
                    </td>
                    <td className="pl-cell">
                      {editing ? (
                        <div className="space-y-1">
                          <input className={inputCls} value={it.marksNos || ''} onChange={(e) => updateItem(i, 'marksNos', e.target.value)} placeholder="Marks & Nos" />
                          <input className={inputCls} value={it.noKindPkgs || ''} onChange={(e) => updateItem(i, 'noKindPkgs', e.target.value)} placeholder="Package No." />
                        </div>
                      ) : (
                        it.noKindPkgs || it.marksNos || '—'
                      )}
                    </td>
                    <td className="pl-cell pl-cell-num">
                      {editing ? (
                        <input type="number" min="0" step="any" className={inputCls} value={Number(it.qty) || 0} onChange={(e) => updateItem(i, 'qty', e.target.value)} />
                      ) : (
                        fmtQty(it.qty)
                      )}
                    </td>
                    <td className="pl-cell">
                      {editing ? (
                        <input className={inputCls} value={it.unit || ''} onChange={(e) => updateItem(i, 'unit', e.target.value)} />
                      ) : (
                        it.unit || '—'
                      )}
                    </td>
                    <td className="pl-cell pl-cell-num">
                      {editing ? (
                        <input type="number" min="0" step="any" className={inputCls} value={Number(it.netWeight) || 0} onChange={(e) => updateItem(i, 'netWeight', e.target.value)} />
                      ) : (
                        fmtNum(it.netWeight)
                      )}
                    </td>
                    <td className="pl-cell pl-cell-num">
                      {editing ? (
                        <input type="number" min="0" step="any" className={inputCls} value={Number(it.grossWeight) || 0} onChange={(e) => updateItem(i, 'grossWeight', e.target.value)} />
                      ) : (
                        fmtNum(it.grossWeight)
                      )}
                    </td>
                    {editing && (
                      <td className="pl-cell pl-cell-num pl-cell-actions">
                        <button type="button" title="Duplicate item" onClick={() => duplicateItem(i)} className="p-0.5 text-slate-500 hover:text-[var(--acc)] cursor-pointer bg-transparent border-none">
                          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                        </button>
                        <button type="button" title="Delete item" onClick={() => removeItem(i)} className="p-0.5 text-rose-500 hover:text-rose-700 cursor-pointer bg-transparent border-none">
                          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
              <tr className="pl-total-row">
                <td colSpan={3} className="pl-cell pl-cell-total-lbl">TOTAL</td>
                <td className="pl-cell pl-cell-num pl-cell-total">{fmtNum(totalQtyVal)}</td>
                <td className="pl-cell" />
                <td className="pl-cell pl-cell-num pl-cell-total">{fmtNum(netVal)}</td>
                <td className="pl-cell pl-cell-num pl-cell-total">{fmtNum(grossVal)}</td>
                {editing && <td className="pl-cell" />}
              </tr>
            </tbody>
          </table>
        </PlSection>

        {/* ===== Declaration =========================================== */}
        <PlSection icon={FileText} title="Declaration" className="pl-declaration">
          {editing ? (
            renderFieldInput({ key: 'declaration', label: 'Declaration', type: 'textarea', rows: 3 })
          ) : (
            <>
              <div className="pl-decl-text">{declText}</div>
              <div className="pl-decl-meta">
                <span>Place : {val('place') || '________'}</span>
                <span>Date : {fmtDate('authorizationDate') || '________'}</span>
              </div>
            </>
          )}
        </PlSection>

        {/* ===== Signature / For VISHAK TECH =========================== */}
        <PlSection icon={PenLine} title={`For ${brandName}`} className="pl-signature">
          {editing ? (
            <div className="space-y-1.5 w-full">
              {renderFieldInput({ key: 'authorizedSignatory', label: 'Authorized Signatory', type: 'text' })}
              {renderFieldInput({ key: 'designation', label: 'Designation', type: 'text' })}
              {renderFieldInput({ key: 'place', label: 'Place', type: 'text' })}
              {renderFieldInput({ key: 'authorizationDate', label: 'Date', type: 'date' })}
            </div>
          ) : (
            <div className="pl-signature-block">
              {merged.companyStamp ? (
                <img src={merged.companyStamp} alt="Signature" className="pl-stamp" />
              ) : (
                <div className="pl-stamp-placeholder">
                  <Stamp className="w-4 h-4 mr-1" /> Signature / Stamp
                </div>
              )}
              <div className="pl-sign-label">Authorized Signatory</div>
              <div className="pl-sign-rule" />
              <div className="pl-sign-meta">
                <span>Name : {val('authorizedSignatory') || '________'}</span>
                <span>Designation : {merged.designation || '________'}</span>
              </div>
            </div>
          )}
        </PlSection>

        {/* ===== Attachments (existing files only) ===================== */}
        {attNames.length > 0 && (
          <PlSection icon={FileText} title="Attachments" className="pl-attachments">
            <div className="flex flex-wrap gap-2">
              {attNames.map((name, i) => (
                <span key={i} className="pl-attachment">
                  <FileText className="w-3 h-3" style={{ color: ACC }} />
                  {name}
                </span>
              ))}
            </div>
          </PlSection>
        )}

        {/* ===== Footer bar ============================================ */}
        <div className="pl-footer">
          <span>ENGINEERING ACROSS BORDERS</span>
          <span>TRUSTED QUALITY</span>
          <span>STRONGER TOGETHER</span>
        </div>
      </div>
    </>
  );
}

// BarChart3-like icon kept local (kept as a tiny inline svg to avoid extra imports).
function BarChartIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <line x1="12" y1="20" x2="12" y2="10" />
      <line x1="18" y1="20" x2="18" y2="4" />
      <line x1="6" y1="20" x2="6" y2="16" />
    </svg>
  );
}