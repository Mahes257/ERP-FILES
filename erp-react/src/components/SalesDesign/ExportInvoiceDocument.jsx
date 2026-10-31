// ============================================================================
// ExportInvoiceDocument — the single reusable Invoice A4 document.
//
// ONE component renders the invoice for Preview, Download PDF and Print (the
// SalesDocumentDesign workspace captures / prints the same #salesdoc-sheet
// DOM), so the three outputs are pixel-identical by construction — there is
// no separate preview, print or PDF template.
//
// The document is composed of NAMED sections — masthead, exporter, invoice
// meta, consignee, buyer, shipment, destination, packing, items, finance,
// bank, terms, signature, remarks, attachments, footer — rendered in a fixed,
// content-aware order. The 10 Invoice templates (invoice-templates.css, keyed
// off the `data-inv-layout` attribute) rearrange and restyle these same
// sections into genuinely different A4 compositions — Preview = Print = PDF
// everywhere.
//
// EXPORT vs DOMESTIC: the design language is shared, the content adapts.
// Export / SEZ invoices show exporter / buyer / consignee, shipment + LUT
// information and an IGST row (0 under LUT); domestic invoices show the
// billing / shipping structure and CGST + SGST (or IGST for interstate)
// rows. Every value comes from the live record — never sample data.
//
// Edit mode swaps values for the module's own inputs (renderFieldInput), so
// the document stays visually identical to the final invoice while editing.
// ============================================================================
import {
  Box,
  Building2,
  CircleDollarSign,
  Copy,
  FileText,
  Globe,
  Landmark,
  Mail,
  PenLine,
  Phone,
  Plus,
  Ship,
  Trash2,
  Truck,
  Users
} from 'lucide-react';
import { lineAmount, parsePackingDetails } from '../../utils/salesHelpers';
import { formatDate } from '../../utils/leadHelpers';
import { formatAmountInWords } from '../../utils/quotationPrintUtils';
import CompanyLogo from '../Common/CompanyLogo';
import Letterhead from './Letterhead';

// Accent colours come from the shared design system (CSS variables on the
// #salesdoc-sheet element — see documentTemplates.js / document-templates.css).
const ACC = 'var(--acc)';

// ---- Label / value row; edit mode swaps in the module's own input. ---------
function DocInfoRow({ fkey, label, type, extra = {}, left, fieldMap, editing, renderFieldInput, val }) {
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
  return (
    <div className={`inv-row${left ? ' inv-row--left' : ''}`}>
      <span className="inv-lbl">{label}</span>
      <div className="inv-val">
        {edit ? (
          renderFieldInput(f)
        ) : (
          <span className={f.type === 'textarea' ? 'inv-val--wrap' : ''}>{val(fkey) || '—'}</span>
        )}
      </div>
    </div>
  );
}

// ---- Combined "No & Date" row (reference Invoice Details rows). ------------
function DocComboRow({ label, noKey, dateKey, noFallback, dateFallback, editing, renderFieldInput, val, fmtDate }) {
  const noVal = val(noKey) || val(noFallback);
  const dtVal = fmtDate(dateKey) || fmtDate(dateFallback);
  return (
    <div className="inv-row">
      <span className="inv-lbl">{label}</span>
      <div className="inv-val">
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

// ---- Section frame ----
function DocSection({ title, icon: Icon, className = '', children, sub }) {
  return (
    <section className={`inv-sec ${className}`.trim()}>
      <div className="inv-sec-head">
        <span className="inv-sec-title">
          {Icon ? <Icon className="inv-sec-icon" /> : null}
          {title}
        </span>
        {sub ? <span className="inv-sec-sub">{sub}</span> : null}
      </div>
      <div className="inv-sec-body">{children}</div>
    </section>
  );
}

export default function ExportInvoiceDocument({
  merged = {},
  fieldMap = {},
  editMode = false,
  canEdit = false,
  renderFieldInput,
  brandName = 'VISHAK TECH',
  docTitle = 'EXPORT INVOICE',
  fieldAliases = {},
  items = [],
  totals = {},
  grandTotalValue = 0,
  money = (v) => String(v ?? 0),
  fmtQty = (v) => String(v ?? 0),
  addRow,
  updateItem,
  removeItem,
  duplicateItem,
  lutNoIgst = false,
  attachments = [],
  sheetVal,
  invTemplate = 'dynamic-grid'
}) {
  const cur = String(merged.currency || 'EUR').toUpperCase();
  const editing = editMode && canEdit;
  const isExport = ['export', 'sez'].includes(String(merged.invoiceType || 'export').toLowerCase());
  const isInterState = String(merged.taxType || '').toLowerCase().includes('igst');

  // Some modules persist the same logical fields under different keys.
  // fieldAliases maps the document's canonical key to the module's key so
  // value read-back AND edit-mode inputs bind to the real form field.
  const srcKey = (key) => (fieldAliases[key] || key);
  const rf = (f) => renderFieldInput({ ...f, key: srcKey(f.key) });

  const val = (key) => {
    const v = sheetVal ? sheetVal(srcKey(key)) : merged[srcKey(key)];
    return v === undefined || v === null ? '' : String(v);
  };
  const fmtDate = (key) => {
    const v = sheetVal ? sheetVal(srcKey(key)) : merged[srcKey(key)];
    if (!v) return '';
    return /^\d{4}-\d{2}-\d{2}/.test(String(v)) ? formatDate(String(v)) : String(v);
  };
  const hasVal = (key) => {
    const v = sheetVal ? sheetVal(srcKey(key)) : merged[srcKey(key)];
    return v !== undefined && v !== null && String(v).trim() !== '';
  };

  const rowCtx = { fieldMap, editing, renderFieldInput: rf, val };
  const comboCtx = { editing, renderFieldInput: rf, val, fmtDate };

  const inputCls =
    'w-full bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-[10.5px] text-slate-700 outline-none focus:border-[var(--acc)]';

  // ==================== Item Details table ===================================
  const viewCols = [
    { label: 'S.No', w: '4%' },
    { label: 'HSN Code', w: '10%' },
    { label: 'No. & Kind of Packages', w: '15%' },
    { label: 'Description of Goods', w: '33%' },
    { label: 'Qty', w: '6%' },
    { label: 'Units', w: '8%' },
    { label: `Cost for PCS (${cur})`, w: '12%' },
    { label: `Total Cost (${cur})`, w: '12%' }
  ];
  const editCols = [
    ...viewCols.slice(0, 7),
    { label: `Total Cost (${cur})`, w: '10%' },
    { label: 'Actions', w: '9%' }
  ];
  const cols = editing ? editCols : viewCols;

  const descStack = (it, i) => (
    <div className="space-y-[2px]">
      {[
        ['Description', it?.description || it?.productName || ''],
        ['Item Code', it?.sku || ''],
        ['Drawing No', it?.drawingNo || ''],
        ['Material', it?.material || ''],
        ['Manufacturer', it?.manufacturer || ''],
        ['Country of Origin', it?.countryOfOrigin || ''],
        ['Delivery', it?.delivery || '']
      ].map(([lbl, value]) => {
        const field =
          lbl === 'Description' ? 'description' : lbl === 'Item Code' ? 'sku' : lbl === 'Country of Origin' ? 'countryOfOrigin' : lbl.toLowerCase().replace(/ /g, '');
        return editing ? (
          <div key={lbl} className="flex items-center gap-1.5">
            <span className="text-[7.5px] font-bold text-slate-400 uppercase tracking-wide shrink-0 w-[72px]">{lbl}</span>
            <input className={inputCls} value={value ?? ''} onChange={(e) => updateItem(i, field, e.target.value)} />
          </div>
        ) : (
          <div key={lbl} className="flex items-baseline gap-1.5">
            <span className="inv-desc-lbl">{lbl}</span>
            <span className="inv-desc-val">{value || ''}</span>
          </div>
        );
      })}
    </div>
  );

  const emptyRows = !editing && items.length === 0 ? Array.from({ length: 4 }) : [];

  const renderItems = () => {
    const list = items.length > 0 ? items : emptyRows;
    if (list.length === 0) {
      return (
        <tbody>
          <tr>
            <td colSpan={cols.length} className="inv-empty">
              No items added yet
            </td>
          </tr>
        </tbody>
      );
    }
    return (
      <tbody>
        {list.map((it, i) => {
          const isPlaceholder = !it;
          const calc = isPlaceholder ? null : lineAmount(it);
          return (
            <tr key={isPlaceholder ? `blank-${i}` : `${it.productId || ''}-${i}`} className="inv-item-row">
              <td className="inv-cell">{isPlaceholder ? '' : i + 1}</td>
              <td className="inv-cell">
                {editing ? (
                  <input className={inputCls} value={it.hsn || ''} onChange={(e) => updateItem(i, 'hsn', e.target.value)} placeholder="HSN" />
                ) : (
                  it.hsn || ''
                )}
              </td>
              <td className="inv-cell">
                {editing ? (
                  <input className={inputCls} value={it.noKindPkgs || ''} onChange={(e) => updateItem(i, 'noKindPkgs', e.target.value)} placeholder="Packages" />
                ) : (
                  [it.marksNos, it.noKindPkgs].filter(Boolean).join(' · ') || ''
                )}
              </td>
              <td className="inv-cell inv-cell-desc">{isPlaceholder ? <div className="h-10" /> : descStack(it, i)}</td>
              <td className="inv-cell inv-cell-num">
                {editing ? (
                  <input className={inputCls} type="number" min="0" step="0.01" value={Number(it.qty) || 0} onChange={(e) => updateItem(i, 'qty', e.target.value)} />
                ) : (
                  fmtQty(it.qty)
                )}
              </td>
              <td className="inv-cell">
                {editing ? (
                  <input className={inputCls} value={it.unit || it.uom || ''} onChange={(e) => updateItem(i, 'unit', e.target.value)} placeholder="Unit" />
                ) : (
                  it.unit || it.uom || ''
                )}
              </td>
              <td className="inv-cell inv-cell-num">
                {editing ? (
                  <input className={inputCls} type="number" min="0" step="0.01" value={Number(it.rate) || 0} onChange={(e) => updateItem(i, 'rate', e.target.value)} />
                ) : (
                  money(it.rate)
                )}
              </td>
              <td className="inv-cell inv-cell-num inv-cell-total">
                {isPlaceholder ? '' : money(calc.total)}
              </td>
              {editing && (
                <td className="inv-cell">
                  <div className="flex items-center justify-center gap-1">
                    <button type="button" title="Duplicate item" onClick={() => duplicateItem(i)} className="p-0.5 text-slate-500 hover:text-[var(--acc)] cursor-pointer bg-transparent border-none">
                      <Copy className="w-3 h-3" />
                    </button>
                    <button type="button" title="Delete item" onClick={() => removeItem(i)} className="p-0.5 text-rose-500 hover:text-rose-700 cursor-pointer bg-transparent border-none">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </td>
              )}
            </tr>
          );
        })}
      </tbody>
    );
  };

  // ==================== Financial summary (export / domestic aware) ==========
  const t = totals && typeof totals === 'object' ? totals : {};
  const taxTotal = Number(t.taxTotal || 0);
  const finRows = [];
  finRows.push(['Sub Total', money(t.subTotal)]);
  if (taxTotal > 0) {
    if (isExport) {
      finRows.push(['IGST', money(lutNoIgst ? 0 : taxTotal)]);
    } else if (isInterState) {
      finRows.push(['IGST', money(taxTotal)]);
    } else {
      finRows.push(['CGST', money(t.cgstTotal)]);
      finRows.push(['SGST', money(t.sgstTotal)]);
    }
  }
  if (Number(t.discount || 0) > 0) finRows.push(['Discount', `− ${money(t.discount)}`]);
  if (Number(merged.charges || 0) > 0) finRows.push(['Additional Charges', money(Number(merged.charges) || 0)]);
  finRows.push(['Grand Total', money(grandTotalValue)]);

  const totalQty = items.reduce((s, it) => s + (Number(it.qty) || 0), 0);

  // ==================== Timeline stages (only populated stages render) ========
  const timelineStages = [
    ['Invoice', [val('invoiceNo'), fmtDate('invoiceDate')].filter(Boolean).join(' · ')],
    ['Order / Reference', val('contractNo') || val('referenceNo') || val('exporterRef')],
    ['Shipment', [val('portOfLoading'), val('vesselFlightNo')].filter(Boolean).join(' · ')],
    ['Delivery', val('portOfDelivery') || val('countryOfFinalDestination')],
    ['Payment', val('paymentTerms') || val('bankName')]
  ].filter(([, v]) => v && String(v).trim() !== '');

  // ==================== Packing entries ======================================
  const packingList = parsePackingDetails(merged.packingDetails);

  // ==================== Terms (numbered list, all lines) =====================
  const termsLines = val('terms').split('\n').filter(Boolean);

  // ==================== Signature / stamp ====================================
  const stamp = merged.companyStamp ? (
    <img src={merged.companyStamp} alt="Company Stamp" className="inv-stamp" />
  ) : (
    <div className="inv-stamp-placeholder" style={{ borderColor: ACC, color: ACC }}>
      <div style={{ border: `1px solid ${ACC}` }}>
        <div className="text-center leading-tight px-1">
          <div className="inv-stamp-brand">{brandName}</div>
          <CompanyLogo variant="plate" className="h-7 w-auto mx-auto my-0.5" />
          <div className="inv-stamp-place">{val('place')}</div>
        </div>
      </div>
    </div>
  );

  const attNames = (Array.isArray(attachments) ? attachments : [])
    .map((a) => a?.fileName || a?.originalName || a?.name || '')
    .filter(Boolean);

  return (
    <>
      {/* ===== Document header: locked company letterhead (global) ===== */}
      <Letterhead className="mb-2" />

      <div className="invoice-doc invoice-doc--view" data-inv-layout={invTemplate}>
        {/* ===== Masthead (title + document progression) =============== */}
        <div className="inv-masthead">
          <span className="inv-doc-title">{docTitle}</span>
          {timelineStages.length >= 2 && (
            <div className="inv-timeline">
              {timelineStages.map(([label, value], i) => (
                <div key={label} className="inv-timeline-step">
                  <span className="inv-timeline-dot" />
                  <span className="inv-timeline-label">{label}</span>
                  <span className="inv-timeline-value">{value}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ===== Exporter / Manufacturer ============================== */}
        <DocSection icon={Building2} title="Exporter / Manufacturer" className="inv-exporter">
          <div className="inv-name">{val('companyName') || '—'}</div>
          <div className="inv-addr">{val('companyAddress') || '—'}</div>
          <div className="inv-contact">
            <DocInfoRow fkey="lutArn" label="LUT ARN & Date" {...rowCtx} left />
          </div>
          <div className="inv-taxids">
            <DocInfoRow fkey="companyGstin" label="GSTIN" {...rowCtx} left />
            <DocInfoRow fkey="companyPan" label="PAN" {...rowCtx} left />
            <DocInfoRow fkey="companyState" label="State" {...rowCtx} left />
          </div>
          <div className="inv-contact-lines">
            {val('companyEmail') ? (
              <div className="inv-contact-line"><Mail className="inv-contact-icon" style={{ color: ACC }} />{val('companyEmail')}</div>
            ) : null}
            {val('companyPhone') ? (
              <div className="inv-contact-line"><Phone className="inv-contact-icon" style={{ color: ACC }} />{val('companyPhone')}</div>
            ) : null}
          </div>
        </DocSection>

        {/* ===== Invoice Details ====================================== */}
        <DocSection icon={FileText} title="Invoice Details" className="inv-meta">
          <DocComboRow label="Invoice No & Date" noKey="invoiceNo" dateKey="invoiceDate" {...comboCtx} />
          <DocComboRow label="Contract No & Date" noKey="contractNo" dateKey="contractDate" {...comboCtx} />
          <DocComboRow label="Appendix / PO No & Date" noKey="appendixNo" dateKey="appendixDate" noFallback="poNo" dateFallback="poDate" {...comboCtx} />
          <DocInfoRow fkey="exporterRef" label="Exporter's Ref" {...rowCtx} />
          <DocInfoRow fkey="dueDate" label="Due Date" type="date" {...rowCtx} />
          <DocInfoRow fkey="referenceNo" label="Reference No" {...rowCtx} />
          <DocInfoRow fkey="sourceRef" label="Source / Source Document" {...rowCtx} />
          {isExport && <DocInfoRow fkey="taxTreatment" label="Tax Treatment" {...rowCtx} />}
        </DocSection>

        {/* ===== Consignee (Ship To) ================================== */}
        <DocSection icon={Truck} title={isExport ? 'Consignee (Ship To)' : 'Ship To'} className="inv-consignee">
          {editing ? (
            <div className="space-y-1.5">
              {rf({ key: 'consigneeName', label: 'Consignee Name', type: 'text' })}
              {rf({ key: 'consigneeAddress', label: 'Address', type: 'textarea', rows: 2 })}
            </div>
          ) : (
            <div>
              <div className="inv-name">{val('consigneeName') || (isExport ? '—' : val('shippingAddress') ? 'Ship To' : '—')}</div>
              <div className="inv-addr">{val('consigneeAddress') || (isExport ? '' : val('shippingAddress')) || '—'}</div>
              {val('consigneeCountry') && <div className="inv-extra">{val('consigneeCountry')}</div>}
            </div>
          )}
        </DocSection>

        {/* ===== Buyer (Bill To) ====================================== */}
        <DocSection icon={Users} title={isExport ? 'Buyer (Bill To)' : 'Bill To'} className="inv-buyer">
          {editing ? (
            <div className="space-y-1.5">
              {rf({ key: 'buyerName', label: 'Buyer Name', type: 'text' })}
              {rf({ key: 'buyerAddress', label: 'Address', type: 'textarea', rows: 2 })}
            </div>
          ) : (
            <div>
              <div className="inv-name">{val('buyerName') || val('clientName') || '—'}</div>
              <div className="inv-addr">{val('buyerAddress') || val('billingAddress') || '—'}</div>
              {val('buyerCountry') && <div className="inv-extra">{val('buyerCountry')}</div>}
              {!isExport && val('contactPerson') && <div className="inv-extra">Contact: {val('contactPerson')}</div>}
            </div>
          )}
        </DocSection>

        {/* ===== Shipment / Export Information ======================== */}
        <DocSection icon={Ship} title="Shipment / Export Information" className="inv-shipment">
          <DocInfoRow fkey="countryOfOrigin" label="Country of Origin of Goods" {...rowCtx} />
          <DocInfoRow fkey="preCarriageBy" label="Pre-Carriage By" {...rowCtx} />
          <DocInfoRow fkey="placeOfReceipt" label="Place of Receipt" {...rowCtx} />
          <DocInfoRow fkey="vesselFlightNo" label="Vessel / Flight No" {...rowCtx} />
          <DocInfoRow fkey="portOfLoading" label="Port of Loading" {...rowCtx} />
          <DocInfoRow fkey="termsOfDelivery" label="Terms of Delivery (Incoterms)" {...rowCtx} />
        </DocSection>

        {/* ===== Destination & Terms ================================== */}
        <DocSection icon={Globe} title="Destination & Terms" className="inv-destination">
          <DocInfoRow fkey="countryOfFinalDestination" label="Country of Final Destination" {...rowCtx} />
          <DocInfoRow fkey="portOfDischarge" label="Port of Discharge" {...rowCtx} />
          <DocInfoRow fkey="portOfDelivery" label="Port of Delivery" {...rowCtx} />
          <DocInfoRow fkey="hsCode" label="HS Code" {...rowCtx} />
          <DocInfoRow fkey="commodity" label="Commodity" {...rowCtx} />
          <DocInfoRow fkey="paymentTerms" label="Payment Terms" {...rowCtx} />
        </DocSection>

        {/* ===== Packing Details (only when the record has packing data) ==== */}
        {packingList.length > 0 && (
          <DocSection icon={Box} title="Packing Details" className="inv-packing">
            <table className="inv-table">
              <thead>
                <tr>
                  <th className="inv-col-sno">S.No</th>
                  <th>Package Type</th>
                  <th>No. of Packages</th>
                  <th>Dimensions (L × W × H) mm</th>
                  <th>Total Volume (m³)</th>
                  <th>Weight (kg)</th>
                  <th>Remarks</th>
                </tr>
              </thead>
              <tbody>
                {packingList.map((p, i) => (
                  <tr key={i} className="inv-item-row">
                    <td className="inv-cell">{i + 1}</td>
                    <td className="inv-cell">{p.packageType || '—'}</td>
                    <td className="inv-cell inv-cell-num">{p.noOfPackages ?? '—'}</td>
                    <td className="inv-cell">{p.dimensions || '—'}</td>
                    <td className="inv-cell inv-cell-num">{p.volume != null && p.volume !== '' ? Number(p.volume).toLocaleString('en-US', { maximumFractionDigits: 3 }) : '—'}</td>
                    <td className="inv-cell inv-cell-num">{p.weight != null && p.weight !== '' ? Number(p.weight).toLocaleString('en-US', { maximumFractionDigits: 3 }) : '—'}</td>
                    <td className="inv-cell">{p.packingRemarks || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DocSection>
        )}

        {/* ===== Item Details (full width, splittable table) ========== */}
        <DocSection icon={Box} title="Item Details" className="inv-items">
          {editing && (
            <div className="inv-add-row">
              <button
                type="button"
                onClick={addRow}
                className="inline-flex items-center gap-1 text-[9px] font-bold px-2 py-1 rounded bg-white text-[var(--acc)] hover:bg-slate-100 cursor-pointer"
              >
                <Plus className="w-3 h-3" /> Add Item
              </button>
            </div>
          )}
          <table className="inv-table inv-table--items">
            <colgroup>
              {cols.map((c) => (
                <col key={c.label} style={{ width: c.w }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                {cols.map((c) => (
                  <th key={c.label} className="inv-col-num">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            {renderItems()}
          </table>
        </DocSection>

        {/* ===== Financial Summary ==================================== */}
        <DocSection icon={CircleDollarSign} title={`Invoice Total (${cur})`} className="inv-finance">
          <div className="inv-finance-rows">
            {finRows.map(([label, value]) => (
              <div key={label} className={`inv-fin-row${label === 'Grand Total' ? ' inv-fin-row--total' : ''}`}>
                <span className="inv-lbl">{label}</span>
                <span className="inv-val inv-fin-value">{value}</span>
              </div>
            ))}
          </div>
          <div className="inv-fin-words">
            <span className="inv-lbl">Amount in Words</span>
            <span className="inv-val inv-fin-words-value">{formatAmountInWords(grandTotalValue, cur, merged.numberFormat)}</span>
          </div>
        </DocSection>

        {/* ===== Bank Details ========================================= */}
        <DocSection icon={Landmark} title="Bank Details" className="inv-bank">
          <DocInfoRow fkey="bankName" label="Bank Name" {...rowCtx} left />
          <DocInfoRow fkey="bankAccount" label="Account Number" {...rowCtx} left />
          <DocInfoRow fkey="bankIfsc" label="IFSC Code" {...rowCtx} left />
          <DocInfoRow fkey="bankBranch" label="Branch Name" {...rowCtx} left />
          <DocInfoRow fkey="bankType" label="Account Type" {...rowCtx} left />
          <DocInfoRow fkey="bankUpi" label="UPI ID" {...rowCtx} left />
          <DocInfoRow fkey="bankSwift" label="SWIFT / BIC Code" {...rowCtx} left />
          <DocInfoRow fkey="bankAddress" label="Bank Address" type="textarea" {...rowCtx} left />
        </DocSection>

        {/* ===== Terms & Conditions =================================== */}
        <DocSection icon={FileText} title="Terms & Conditions" className="inv-terms">
          {editing ? (
            rf({ key: 'terms', label: 'Terms & Conditions', type: 'textarea', rows: 5 })
          ) : (
            <ol className="inv-terms-list">
              {termsLines.length === 0 ? (
                <li className="inv-terms-line"><span className="inv-lbl">—</span></li>
              ) : (
                termsLines.map((line, i) => (
                  <li key={i} className="inv-terms-line">
                    <span className="inv-terms-no">{i + 1}.</span>
                    <span className="inv-terms-text">{line}</span>
                  </li>
                ))
              )}
            </ol>
          )}
        </DocSection>

        {/* ===== Signature / Authorization ============================ */}
        <DocSection icon={PenLine} title={`For ${brandName}`} className="inv-signature">
          <div className="inv-signature-block">
            <div className="inv-stamp-wrap">{stamp}</div>
            {editing ? (
              <div className="space-y-1.5 w-full">
                {rf({ key: 'authorizedSignatory', label: 'Authorized Signatory', type: 'text' })}
                {rf({ key: 'designation', label: 'Designation', type: 'text' })}
                {rf({ key: 'place', label: 'Place', type: 'text' })}
                {rf({ key: 'authorizationDate', label: 'Date', type: 'date' })}
              </div>
            ) : (
              <>
                <div className="inv-sign-name">{val('authorizedSignatory') || '—'}</div>
                <div className="inv-sign-designation">
                  {val('designation') ? `${val('designation')} / Authorized Signatory` : 'Authorized Signatory'}
                </div>
                <div className="inv-sign-rule" />
                <div className="inv-sign-meta">
                  <span>Place : {val('place') || '________'}</span>
                  <span>Date : {fmtDate('authorizationDate') || '________'}</span>
                </div>
              </>
            )}
          </div>
        </DocSection>

        {/* ===== Remarks (creation-page block — hidden until content) === */}
        {(editing || hasVal('notes') || hasVal('remarks')) && (
          <DocSection icon={FileText} title="Remarks" className="inv-remarks">
            <DocInfoRow fkey="notes" label="Remarks" type="textarea" {...rowCtx} />
          </DocSection>
        )}

        {/* ===== Attachments (existing files only) ==================== */}
        {attNames.length > 0 && (
          <div className="inv-sec inv-attachments">
            <div className="inv-sec-head">
              <span className="inv-sec-title"><FileText className="inv-sec-icon" /> Attachments</span>
            </div>
            <div className="inv-sec-body">
              <div className="flex flex-wrap gap-2">
                {attNames.map((name, i) => (
                  <span key={i} className="inv-attachment">
                    <FileText className="w-3 h-3" style={{ color: ACC }} />
                    {name}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ===== Footer bar ============================================ */}
        <div className="inv-footer">
          <span>QUALITY | PRECISION | GLOBAL REACH</span>
          <span>Your Partner in Engineering Excellence</span>
        </div>
      </div>
    </>
  );
}