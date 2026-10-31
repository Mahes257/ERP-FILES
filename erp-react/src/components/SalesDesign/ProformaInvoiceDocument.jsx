// ============================================================================
// ProformaInvoiceDocument — A4 Proforma Invoice preview.
//
// ONE component renders the Proforma Invoice for Preview, Download PDF and
// Print (the SalesDocumentDesign workspace captures / prints the same
// #salesdoc-sheet DOM), so the three outputs are pixel-identical by
// construction — there is no separate preview, print or PDF template.
//
// The document is composed of NAMED sections (exporter, invoice meta,
// consignee, buyer, shipment, destination, packing, items, finance, bank,
// terms, signature, footer) rendered in a fixed, content-aware order. The 10
// Proforma templates (proforma-templates.css, keyed off the `data-pi-layout`
// attribute) rearrange and restyle these same sections into genuinely
// different A4 compositions — Preview = Print = PDF everywhere.
//
// Every value comes from the live proforma record (merged = doc + form).
// Empty fields render their label with an empty value — nothing is omitted.
// The financial summary, packing details and attachments sections only appear
// when their data exists (content-aware; no invented values).
// ============================================================================
import { lineAmount } from '../../utils/salesHelpers';
import { formatDate } from '../../utils/leadHelpers';
import Letterhead from './Letterhead';

// ---- Helpers ----------------------------------------------------------------
function val(merged, key) {
  const v = merged[key];
  return v === undefined || v === null ? '' : String(v);
}

function fmtDate(merged, key) {
  const v = merged[key];
  if (!v) return '';
  return /^\d{4}-\d{2}-\d{2}/.test(String(v)) ? formatDate(String(v)) : String(v);
}

// Normalize a packing entry — supports both the proformaExport key set and the
// packing-list key set so existing records render whatever they actually store.
function packingEntry(p) {
  const first = (a, b) => (p[a] !== undefined && p[a] !== null && String(p[a]).trim() !== '' ? p[a] : p[b]);
  return {
    packageType: first('packageType', 'packageNoKindPkgs'),
    noOfPackages: first('noOfPackages', 'packageQty'),
    dimensions: first('dimensions', 'packageDimensions'),
    volume: first('volume', 'packageVolume'),
    weight: first('weight', 'packageWeight'),
    remarks: first('packingRemarks', 'packageMarksNos')
  };
}

// ---- Exported component -----------------------------------------------------
export default function ProformaInvoiceDocument({
  merged = {},
  editMode = false,
  canEdit = false,
  renderFieldInput,
  brandName = 'VISHAK TECH',
  items = [],
  grandTotalValue = 0,
  totals = null,
  words = (v) => String(v ?? 0),
  money = (v) => String(v ?? 0),
  fmtQty = (v) => String(v ?? 0),
  addRow,
  updateItem,
  removeItem,
  duplicateItem,
  attachments = [],
  fieldMap = {},
  sheetVal,
  hasSheetVal,
  packingEntries = [],
  piTemplate = 'minimalist-professional'
}) {
  const editing = editMode && canEdit;
  const cur = String(merged.currency || 'INR').toUpperCase();

  // Prefer live editing state when present, else fall back to the stored record.
  const sv = (key) => {
    if (sheetVal) {
      const v = sheetVal(key);
      if (v !== undefined && v !== null && String(v).trim() !== '') return String(v);
    }
    return val(merged, key);
  };
  const sfd = (key) => {
    if (sheetVal) {
      const v = sheetVal(key);
      if (v !== undefined && v !== null && String(v).trim() !== '') return fmtDate(merged, key);
    }
    return fmtDate(merged, key);
  };
  const shv = (key) => {
    if (hasSheetVal) return hasSheetVal(key);
    const v = merged[key];
    return v !== undefined && v !== null && String(v).trim() !== '';
  };

  const realItems = items.filter((it) => !it.rowType || it.rowType === 'item');
  const totalQty = realItems.reduce((sum, it) => sum + (Number(it.qty) || 0), 0);

  // Combined "No & Date" row value
  const comboVal = (noKey, dtKey) => {
    const n = sv(noKey);
    const d = sfd(dtKey);
    return [n, d].filter(Boolean).join('  ·  ');
  };

  // Financial summary rows — only populated rows render (content-aware).
  const t = totals && typeof totals === 'object' ? totals : {};
  const finRows = [];
  finRows.push(['Subtotal', money(t.subTotal)]);
  if (Number(t.discount || 0) !== 0) finRows.push(['Discount', `- ${money(t.discount)}`]);
  if (Number(t.charges || 0) !== 0) finRows.push(['Charges', money(t.charges)]);
  if (Number(t.taxTotal || 0) !== 0) finRows.push(['GST', money(t.taxTotal)]);
  finRows.push(['Grand Total', money(grandTotalValue)]);

  const packingList = (Array.isArray(packingEntries) ? packingEntries : []).map(packingEntry);
  const attNames = (Array.isArray(attachments) ? attachments : [])
    .map((a) => a?.fileName || a?.originalName || a?.name || '')
    .filter(Boolean);

  // ---- Info row: label left, value right ----
  const Row = ({ label, value, left }) => (
    <div className={`pi-row${value ? ' pi-row--has-value' : ''}${left ? ' pi-row--left' : ''}`}>
      <span className="pi-lbl">{label}</span>
      <span className="pi-val">{value || '—'}</span>
    </div>
  );

  // ---- Editable info row (only ever used when the workspace edits inline) ----
  const EditRow = ({ label, value, fkey, type = 'text', extra = {} }) => {
    if (!editing) return Row({ label, value });
    const src = fieldMap[fkey] || {};
    const f = { key: fkey, label, type: type || src.type || 'text', options: src.options, rows: src.rows || 2, placeholder: src.placeholder || '', ...extra };
    return (
      <div className={`pi-row${value ? ' pi-row--has-value' : ''} pi-row--editable`}>
        <span className="pi-lbl">{label}</span>
        <span className="pi-val">{renderFieldInput ? renderFieldInput(f) : value}</span>
      </div>
    );
  };

  // ---- Section frame ----
  const Section = ({ title, className = '', children, sub }) => (
    <section className={`pi-sec ${className}`.trim()}>
      <div className="pi-sec-head">
        <span className="pi-sec-title">{title}</span>
        {sub ? <span className="pi-sec-sub">{sub}</span> : null}
      </div>
      <div className="pi-sec-body">{children}</div>
    </section>
  );

  // ============================================================================
  // RENDER
  // ============================================================================
  return (
    <div className="proforma-invoice-doc proforma-invoice-doc--view" data-pi-layout={piTemplate}>
      {/* ===== Company Letterhead ===== */}
      <Letterhead className="pi-head" />

      {/* ===== Centered Title ===== */}
      <div className="pi-masthead">
        <span className="pi-doc-title">PROFORMA INVOICE</span>
      </div>

      {/* ===== Seller | Invoice & Reference Details ========================= */}
      <Section title="Exporter / Manufacturer" className="pi-exporter">
        <div className="pi-name">{sv('exporterName') || '—'}</div>
        <div className="pi-addr">{sv('exporterAddress') || '—'}</div>
        <div className="pi-contact">
          {sv('exporterEmail') ? (
            <span className="pi-contact-line">Email: {sv('exporterEmail')}</span>
          ) : null}
          {sv('exporterPhone') ? (
            <span className="pi-contact-line">Phone: {sv('exporterPhone')}</span>
          ) : null}
          {sv('exporterState') ? (
            <span className="pi-contact-line">State: {sv('exporterState')}</span>
          ) : null}
        </div>
      </Section>

      <Section title="Invoice & Reference Details" className="pi-meta">
        <Row label="Invoice No & Date" value={comboVal('piNo', 'piDate')} />
        <Row label="Contract No & Date" value={comboVal('contractNo', 'contractDate')} />
        <Row label="Appendix / PO No & Date" value={comboVal('appendixPoNo', 'appendixDate')} />
        <Row label="Exporter's Ref" value={sv('exporterRef')} />
        <Row label="GSTIN No" value={sv('gstin') || sv('exporterGstin')} />
        <Row label="PAN" value={sv('pan') || sv('exporterPan')} />
        <Row label="Reference No" value={sv('referenceNo')} />
        <Row label="Valid Till" value={sfd('validTill')} />
        <Row label="Customer Purchase Order" value={sv('sourceRef')} />
        <Row label="Source" value={sv('source')} />
      </Section>

      {/* ===== Buyer (Ship To) | Buyer (If Other Than Consignee) =========== */}
      <Section title="Buyer (Ship To / Consignee)" className="pi-consignee">
        <div className="pi-name">{sv('consigneeName') || '—'}</div>
        <div className="pi-addr">{sv('consigneeAddress') || '—'}</div>
        {sv('consigneeCountry') && (
          <div className="pi-party-extra">{sv('consigneeCountry')}</div>
        )}
        {sv('billingAddress') && (
          <div className="pi-party-extra">Billing: {sv('billingAddress')}</div>
        )}
        {sv('shippingAddress') && (
          <div className="pi-party-extra">Shipping: {sv('shippingAddress')}</div>
        )}
        {sv('contactPerson') && (
          <div className="pi-party-extra">Contact: {sv('contactPerson')}</div>
        )}
      </Section>

      <Section title="Buyer (If Other Than Consignee)" className="pi-buyer">
        <div className="pi-name">{sv('buyerName') || '—'}</div>
        <div className="pi-addr">{sv('buyerAddress') || '—'}</div>
        {sv('buyerCountry') && (
          <div className="pi-party-extra">{sv('buyerCountry')}</div>
        )}
      </Section>

      {/* ===== Shipping / Export Info | Destination & Terms ================= */}
      <Section title="Shipment / Export Information" className="pi-shipment">
        <div className="pi-route">
          <Row label="Country of Origin of Goods" value={sv('countryOfOrigin')} />
          <Row label="Port of Loading" value={sv('portOfLoading')} />
          <Row label="Country of Final Destination" value={sv('countryOfFinalDestination')} />
          <Row label="Port of Discharge" value={sv('portOfDischarge')} />
        </div>
        <Row label="Pre-Carriage By" value={sv('preCarriageBy')} />
        <Row label="Place of Receipt" value={sv('placeOfReceipt')} />
        <Row label="Vessel / Flight No" value={sv('vesselFlightNo')} />
        <Row label="Port of Delivery" value={sv('placeOfDelivery')} />
        <Row label="Tax Treatment" value={sv('taxTreatment')} />
      </Section>

      <Section title="Destination & Terms" className="pi-destination">
        <Row label="HS Code" value={sv('hsCode')} />
        <Row label="Commodity" value={sv('commodity')} />
        <Row label="Terms of Delivery" value={sv('termsOfDelivery')} />
        <Row label="Payment Terms" value={sv('paymentTerms')} />
      </Section>

      {/* ===== Packing Details (only when the record has packing data) ====== */}
      {packingList.length > 0 && (
        <Section title="Packing Details" className="pi-packing">
          <table className="pi-table pi-table--packing">
            <thead>
              <tr>
                <th className="pi-col-sno">S.No</th>
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
                <tr key={i}>
                  <td className="pi-cell-sno">{i + 1}</td>
                  <td className="pi-cell">{p.packageType || '—'}</td>
                  <td className="pi-cell-num">{p.noOfPackages ?? '—'}</td>
                  <td className="pi-cell">{p.dimensions || '—'}</td>
                  <td className="pi-cell-num">{p.volume != null && p.volume !== '' ? Number(p.volume).toLocaleString('en-US', { maximumFractionDigits: 3 }) : '—'}</td>
                  <td className="pi-cell-num">{p.weight != null && p.weight !== '' ? Number(p.weight).toLocaleString('en-US', { maximumFractionDigits: 3 }) : '—'}</td>
                  <td className="pi-cell">{p.remarks || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {/* ===== Item Details Table ========================================== */}
      <Section title="Item Details" className="pi-items">
        <table className="pi-table pi-table--items">
          <thead>
            <tr>
              <th className="pi-col-sno">S.No</th>
              <th className="pi-col-marks">Marks &amp; Nos / Container No</th>
              <th className="pi-col-pkgs">No. &amp; Kind of Pkgs</th>
              <th className="pi-col-desc">Description of Goods</th>
              <th className="pi-col-sku">Item Code</th>
              <th className="pi-col-drawing">Drawing No.</th>
              <th className="pi-col-material">Material</th>
              <th className="pi-col-hsn">HSN</th>
              <th className="pi-col-manufacturer">Manufacturer</th>
              <th className="pi-col-qty">Qty</th>
              <th className="pi-col-uom">UOM</th>
              <th className="pi-col-rate">Unit Cost ({cur})</th>
              <th className="pi-col-amount">Total ({cur})</th>
            </tr>
          </thead>
          <tbody>
            {realItems.length === 0 ? (
              <tr>
                <td colSpan={13} className="pi-empty">No items</td>
              </tr>
            ) : (
              realItems.map((it, i) => {
                const calc = lineAmount(it);
                const descLines = [
                  it.description || it.productName,
                  it.sku,
                  it.drawingNo,
                  it.material,
                  it.manufacturer,
                  it.countryOfOrigin,
                  it.delivery
                ].filter(Boolean);

                return (
                  <tr key={`${it.productId || ''}-${i}`} className="pi-item-row">
                    <td className="pi-cell-sno">{i + 1}</td>
                    <td className="pi-cell">{it.marksNos || '—'}</td>
                    <td className="pi-cell">{it.noKindPkgs || '—'}</td>
                    <td className="pi-cell-desc">
                      {descLines.length > 0
                        ? descLines.map((line, li) => (
                            <div key={li} className={li === 0 ? 'pi-desc-main' : 'pi-desc-sub'}>{line}</div>
                          ))
                        : '—'}
                    </td>
                    <td className="pi-cell">{it.sku || '—'}</td>
                    <td className="pi-cell">{it.drawingNo || '—'}</td>
                    <td className="pi-cell">{it.material || '—'}</td>
                    <td className="pi-cell">{it.hsn || '—'}</td>
                    <td className="pi-cell">{it.manufacturer || '—'}</td>
                    <td className="pi-cell-num">{fmtQty(it.qty)}</td>
                    <td className="pi-cell">{it.unit || it.uom || '—'}</td>
                    <td className="pi-cell-num">{money(it.rate)}</td>
                    <td className="pi-cell-num pi-cell-total">{money(calc.total)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
          <tfoot>
            <tr className="pi-total-row">
              <td colSpan={4} className="pi-total-label">TOTAL</td>
              <td className="pi-total-qty">{fmtQty(totalQty)}</td>
              <td colSpan={7} className="pi-total-spacer"></td>
              <td className="pi-total-amount">{money(grandTotalValue)}</td>
            </tr>
          </tfoot>
        </table>
      </Section>

      {/* ===== Financial Summary (separate, from the actual totals) ========= */}
      <Section title="Financial Summary" className="pi-finance">
        <div className="pi-finance-rows">
          {finRows.map(([label, value]) => (
            <div key={label} className={`pi-fin-row${label === 'Grand Total' ? ' pi-fin-row--total' : ''}`}>
              <span className="pi-lbl">{label}</span>
              <span className="pi-val pi-fin-value">{value}</span>
            </div>
          ))}
        </div>
        <div className="pi-fin-words">
          <span className="pi-lbl">Amount in Words</span>
          <span className="pi-val pi-fin-words-value">{words(grandTotalValue)}</span>
        </div>
      </Section>

      {/* ===== Bank Details | Payment Terms, Notes & Authorized Signatory ===== */}
      <Section title="Bank Details" className="pi-bank">
        <Row label="Bank Name" value={sv('bankName')} left />
        <Row label="Account Number" value={sv('bankAccount')} left />
        <Row label="Branch Name" value={sv('bankBranch')} left />
        <Row label="Bank Address" value={sv('bankAddress')} left />
        <Row label="SWIFT / BIC Code" value={sv('bankSwift')} left />
        <Row label="IFSC Code" value={sv('bankIfsc')} left />
        <Row label="Account Type" value={sv('bankType')} left />
        <Row label="UPI ID" value={sv('bankUpi')} left />
      </Section>

      <Section title="Payment Terms & Notes" className="pi-terms">
        <div className="pi-field-wide">
          <span className="pi-lbl">Payment Terms</span>
          <span className="pi-val">{sv('paymentTerms') || '—'}</span>
        </div>
        <div className="pi-field-wide">
          <span className="pi-lbl">Terms &amp; Conditions</span>
          <span className="pi-val">{sv('terms') || '—'}</span>
        </div>
        {(editing || shv('notes')) && (
          <div className="pi-field-wide">
            <span className="pi-lbl">Notes / Remarks</span>
            <span className="pi-val">{sv('notes') || '—'}</span>
          </div>
        )}
        {attNames.length > 0 && (
          <div className="pi-field-wide">
            <span className="pi-lbl">Attachments</span>
            <span className="pi-val">{attNames.join(', ')}</span>
          </div>
        )}
      </Section>

      <Section title={`For ${brandName}`} className="pi-signature">
        <div className="pi-signature-block">
          {merged.companyStamp ? (
            <img src={merged.companyStamp} alt="Company Stamp" className="pi-stamp" />
          ) : (
            <div className="pi-stamp-placeholder">STAMP</div>
          )}
          <div className="pi-signature-name">
            {sv('authorizedSignatory') || '—'}
          </div>
          <div className="pi-signature-designation">
            {sv('designation') && sv('authorizedSignatory')
              ? `${sv('designation')} / ${sv('authorizedSignatory')}`
              : sv('designation') || sv('authorizedSignatory') || 'Authorized Signatory'}
          </div>
          <div className="pi-signature-meta">
            <span className="pi-meta-label">Place : </span>
            <span className="pi-meta-value">{sv('place') || '________'}</span>
            <span className="pi-meta-sep"></span>
            <span className="pi-meta-label">Date : </span>
            <span className="pi-meta-value">{sfd('authorizationDate') || '________'}</span>
          </div>
          <div className="pi-signature-meta">
            <span className="pi-meta-label">Currency : </span>
            <span className="pi-meta-value">{cur}</span>
          </div>
        </div>
      </Section>

      {/* ===== Footer ====================================================== */}
      <div className="pi-footer">
        <span>ENGINEERING TODAY FOR A STRONGER TOMORROW</span>
      </div>
    </div>
  );
}