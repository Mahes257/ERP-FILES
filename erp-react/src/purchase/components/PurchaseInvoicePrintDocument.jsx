/**
 * purchase/components/PurchaseInvoicePrintDocument.jsx
 * ------------------------------------------------------------------
 * THE single reusable Purchase Invoice document template.
 *
 * Used for: Preview · Print · PDF Download (single source of truth).
 *
 * Visually styled to match a professional A4 business invoice:
 *   - A4 portrait, clean typography
 *   - Company header + logo
 *   - Vendor / Buyer info blocks
 *   - Invoice information box
 *   - Compact grid item table
 *   - Tax summary + totals
 *   - Amount in Words
 *   - Payment info, Notes, Terms
 *   - Signatures, Footer
 *
 * EDIT MODE: a flat inline document — the very same DOM is measured,
 * previewed, printed and rasterised to PDF.
 * ------------------------------------------------------------------
 */
import { Plus, Trash2, Copy, ArrowUp, ArrowDown } from 'lucide-react';
import { formatAmount, round2, numberToWords } from '../utils/purchase';
import { formatDate, formatDateTime } from '../utils/helpers';
import { getDefaultTermsContent } from '../services/settings';
import { DEFAULT_INVOICE_PRINT_DESIGN, SIGNATURE_LAYOUTS } from '../services/invoicePrintDesign';

/* ------------------------------------------------------------------ */
/*  Invoice print styles — self-contained A4 + preview styles.         */
/* ------------------------------------------------------------------ */
export const INVOICE_PRINT_STYLES = `
/* ============================================================
   Purchase Invoice — A4 document
   ============================================================ */
* { box-sizing: border-box; margin: 0; padding: 0; }

/* --- Page breaks --- */
.inv-sheet { page-break-before: auto; page-break-after: auto; break-before: auto; break-after: auto; }
.inv-sheet thead { display: table-header-group; }
.inv-sheet .inv-bottom,
.inv-sheet .inv-summary,
.inv-sheet .inv-sign,
.inv-sheet .inv-sign-item,
.inv-sheet .inv-tc,
.inv-sheet .inv-po-box { page-break-inside: avoid; break-inside: avoid; }
.inv-items-table tr { page-break-inside: avoid; break-inside: avoid; }

/* --- A4 sheet container --- */
.inv-sheet {
  width: 595.28pt;
  min-height: 841.89pt;
  box-sizing: border-box;
  background: #ffffff;
  color: #111111;
  display: flex;
  flex-direction: column;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  font-size: 10pt;
  line-height: 1.4;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.inv-sheet-inner { flex: 1 0 auto; padding: 10mm 10mm 8mm 10mm; }

/* ============================================================
   HEADER — Company (left) · Invoice title (right)
   ============================================================ */
.inv-hdr {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12pt;
  padding-bottom: 6pt;
  border-bottom: 1.5pt solid #111;
}
.inv-hdr-left { display: flex; align-items: flex-start; gap: 8pt; min-width: 0; }
.inv-logo {
  width: 36pt; height: 36pt; border-radius: 3pt; flex-shrink: 0;
  object-fit: contain; display: block;
}
.inv-logo-ph {
  width: 36pt; height: 36pt; border: 1pt dashed #999; border-radius: 3pt;
  display: flex; align-items: center; justify-content: center;
  color: #666; font-size: 8pt; cursor: pointer; flex-shrink: 0;
}
.inv-co-name { font-size: 14pt; font-weight: 800; color: #111; margin-bottom: 1pt; }
.inv-co-addr { font-size: 8pt; color: #555; line-height: 1.4; white-space: pre-wrap; overflow-wrap: anywhere; }
.inv-co-contact { font-size: 8pt; color: #444; margin-top: 1pt; }
.inv-hdr-right { text-align: right; flex-shrink: 0; }
.inv-doc-title { font-size: 16pt; font-weight: 800; color: #111; }
.inv-doc-number { font-size: 12pt; font-weight: 800; color: #0B4A3D; margin-top: 2pt; }

/* ============================================================
   INFO BOX — Invoice details grid
   ============================================================ */
.inv-info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 12pt;
  padding: 5pt 0 3pt;
}
.inv-info-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 4pt;
  padding: 1.5pt 0;
  border-bottom: 0.5pt dashed #ddd;
}
.inv-info-k {
  font-size: 7pt; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.5pt; color: #888; flex-shrink: 0;
}
.inv-info-v { font-size: 9pt; font-weight: 600; color: #111; text-align: right; word-break: break-word; }

/* ============================================================
   VENDOR / BUYER blocks
   ============================================================ */
.inv-blocks {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6pt 12pt;
  padding: 5pt 0 3pt;
}
.inv-block-title {
  font-size: 7pt; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.6pt; color: #888; margin-bottom: 3pt;
}
.inv-block-text { font-size: 9pt; color: #333; line-height: 1.4; overflow-wrap: anywhere; }
.inv-block-text b { font-weight: 700; color: #111; }

/* ============================================================
   ITEM TABLE
   ============================================================ */
.inv-items { margin-top: 8pt; }
.inv-items-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}
.inv-items-table th,
.inv-items-table td {
  border: 0.5pt solid #bbb;
  padding: 2pt 2.5pt;
  vertical-align: top;
  overflow-wrap: anywhere;
}
.inv-items-table thead th {
  background: #0B4A3D;
  color: #ffffff;
  font-size: 7pt;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.4pt;
  text-align: center;
  padding: 2.5pt 2pt;
}
.inv-items-table tbody td { color: #222; font-size: 9pt; }
.inv-items-table tbody tr:nth-child(even) td { background: #f8f9fa; }
.inv-items-table .col-no     { width: 26pt;  text-align: center; }
.inv-items-table .col-desc   { width: 200pt; text-align: left; }
.inv-items-table .col-unit   { width: 40pt;  text-align: center; }
.inv-items-table .col-qty    { width: 50pt;  text-align: center; }
.inv-items-table .col-rate   { width: 70pt;  text-align: right; font-variant-numeric: tabular-nums; }
.inv-items-table .col-tax    { width: 40pt;  text-align: center; }
.inv-items-table .col-amount { width: 70pt;  text-align: right; font-variant-numeric: tabular-nums; }
.inv-items-table .col-actions { width: 65pt; text-align: center; }
.inv-empty-row td {
  text-align: center; font-style: italic; color: #999;
}

/* ============================================================
   BOTTOM — Total row · Summary · Words · Notes · Terms · Sigs
   ============================================================ */
.inv-bottom { margin-top: 8pt; }

/* Total row */
.inv-total {
  display: flex; justify-content: space-between; gap: 8pt;
  padding: 2.5pt 6pt;
  border-top: 1pt solid #111; border-bottom: 1pt solid #111;
  font-weight: 700; font-variant-numeric: tabular-nums;
}

/* Tax / INR summary box */
.inv-summary {
  width: 220pt; margin: 6pt 0 0 auto;
  border: 0.75pt solid #444;
}
.inv-summary-row {
  display: flex; justify-content: space-between; gap: 8pt;
  padding: 2pt 8pt; border-bottom: 0.5pt solid #ddd;
  font-size: 9pt; font-variant-numeric: tabular-nums;
}
.inv-summary-row:last-child { border-bottom: none; }
.inv-summary-k { font-weight: 700; }
.inv-summary-grand {
  display: flex; justify-content: space-between; gap: 8pt;
  padding: 2.5pt 8pt; border-top: 0.75pt solid #444;
  font-weight: 700; font-variant-numeric: tabular-nums;
  font-size: 10pt;
}

/* Amount in words */
.inv-words { margin-top: 7pt; }
.inv-words-k { font-weight: 700; font-size: 9pt; }

/* Notes */
.inv-notes { margin-top: 8pt; }
.inv-notes-k { font-weight: 700; font-size: 9pt; }
.inv-notes-text { white-space: pre-wrap; overflow-wrap: anywhere; font-size: 9pt; color: #333; }

/* Terms */
.inv-terms { margin-top: 8pt; }
.inv-terms-k { font-weight: 700; font-size: 9pt; }
.inv-terms-text { white-space: pre-wrap; overflow-wrap: anywhere; font-size: 9pt; color: #333; }

/* Payment info */
.inv-payment { margin-top: 8pt; padding: 4pt 6pt; border: 0.5pt solid #ddd; border-radius: 2pt; }
.inv-payment-title { font-weight: 700; font-size: 9pt; margin-bottom: 3pt; }
.inv-payment-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2pt 12pt; }
.inv-payment-row { display: flex; justify-content: space-between; gap: 4pt; font-size: 8.5pt; }
.inv-payment-k { font-weight: 600; color: #666; }
.inv-payment-v { font-weight: 600; color: #111; }

/* Signatures */
.inv-sign {
  margin-top: 16pt;
  display: flex; justify-content: space-between; gap: 14pt;
}
.inv-sign-item { flex: 1; min-width: 0; }
.inv-sign-role {
  font-weight: 700; text-align: center; margin-bottom: 6pt;
  font-size: 8pt; text-transform: uppercase; letter-spacing: 0.5pt; color: #888;
}
.inv-sign-img {
  display: block; max-height: 36pt; max-width: 100pt;
  margin: 0 auto 3pt; object-fit: contain;
}
.inv-sign-line { border-bottom: 0.75pt solid #999; height: 12pt; }
.inv-sign-name { font-weight: 700; text-align: center; margin-top: 3pt; font-size: 9pt; overflow-wrap: anywhere; }
.inv-sign-sub { text-align: center; font-size: 7pt; color: #888; overflow-wrap: anywhere; }

/* Edit-mode signature upload */
.inv-sig-upload { display: flex; justify-content: center; align-items: center; gap: 4pt; margin-bottom: 3pt; }
.inv-sig-upload-label {
  border: 1pt dashed #999; color: #666; font-size: 8pt;
  padding: 1pt 5pt; border-radius: 2pt; cursor: pointer;
}
.inv-sig-clear {
  border: none; background: transparent; color: #b91c1c;
  font-size: 11pt; cursor: pointer; line-height: 1;
}

/* ============================================================
   FOOTER
   ============================================================ */
.inv-sheet-foot {
  border-top: 0.5pt solid #ccc;
  margin: 0 10mm; padding: 3pt 0 5pt;
  display: flex; justify-content: space-between; gap: 12pt;
  font-size: 7pt; color: #999;
}

/* ============================================================
   PREVIEW CHROME (screen only)
   ============================================================ */
.inv-print-page { padding: 8px 24px 0; }
.inv-sheet-stack {
  display: flex; flex-direction: column; align-items: center;
  gap: 32px; padding: 4px 0 48px; overflow-x: auto;
}
.inv-sheet-card {
  background: #ffffff; border: 1px solid #e0e0e0; border-radius: 3px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.10); max-width: 100%; flex-shrink: 0;
}
.inv-sheet-loading {
  display: flex; align-items: center; justify-content: center;
  gap: 10px; padding: 64px 0; color: #666; font-size: 12px; font-weight: 600;
}
.inv-measure {
  position: fixed; left: -10000px; top: 0; width: 190mm;
  visibility: hidden; pointer-events: none;
}

/* ============================================================
   EDIT-MODE INPUTS
   ============================================================ */
.inv-edit-input,
.inv-edit-select,
.inv-edit-textarea {
  border: 1pt solid transparent; border-radius: 2px; background: transparent;
  font: inherit; color: inherit; transition: all 0.15s ease;
  padding: 0 1pt; width: 100%;
}
.inv-edit-input:hover, .inv-edit-select:hover, .inv-edit-textarea:hover {
  background: rgba(0,0,0,0.05); border-color: rgba(0,0,0,0.2);
}
.inv-edit-input:focus, .inv-edit-select:focus, .inv-edit-textarea:focus {
  background: rgba(0,0,0,0.06); border-color: rgba(0,0,0,0.4);
  box-shadow: 0 0 0 2px rgba(0,0,0,0.08); outline: none;
}
.inv-edit-input { text-align: left; font-size: 9pt; }
.inv-edit-input--num { text-align: right; font-variant-numeric: tabular-nums; font-size: 9pt; }
.inv-edit-input--c { text-align: center; font-size: 9pt; }
.inv-edit-select { font-size: 9pt; -webkit-appearance: auto; appearance: auto; cursor: pointer; }
.inv-edit-textarea {
  font-size: 9pt; line-height: 1.3; resize: vertical;
  min-height: 30pt; white-space: pre-wrap;
}

.inv-item-add-btn, .inv-item-del-btn, .inv-item-act-btn {
  display: inline-flex; align-items: center; justify-content: center;
  gap: 2pt; border-radius: 2pt; font-size: 8pt; font-weight: 700;
  cursor: pointer; padding: 1pt 4pt; transition: background 0.15s; line-height: 1.2;
}
.inv-item-add-btn {
  border: 1pt solid #4a5f57; background: #eef4f2; color: #23443a;
}
.inv-item-add-btn:hover { background: #dcebe5; }
.inv-item-del-btn {
  border: 1pt solid #f3c0c0; background: #fdf1f1; color: #b91c1c; padding: 1pt 3pt;
}
.inv-item-del-btn:hover { background: #fbe3e3; }
.inv-item-act-btn {
  border: 1pt solid #ccc; background: #f5f5f5; color: #333; padding: 1pt 3pt;
}
.inv-item-act-btn:hover { background: #e0e0e0; }
.inv-item-act-btn:disabled { opacity: 0.3; cursor: default; }
.inv-item-add-row {
  display: flex; justify-content: flex-end; align-items: center; margin: 3pt 0 0;
}
.inv-item-actions {
  display: flex; gap: 2pt; justify-content: center; align-items: center; flex-wrap: wrap;
}

/* ============================================================
   PRINT CSS
   ============================================================ */
@page { size: A4 portrait; margin: 0; }
@media print {
  .inv-edit-input, .inv-edit-select, .inv-edit-textarea {
    border: none !important; background: transparent !important;
    box-shadow: none !important; pointer-events: none;
    -webkit-appearance: none; appearance: none; padding: 0;
  }
  .inv-item-add-btn, .inv-item-del-btn, .inv-item-act-btn,
  .inv-sig-upload, .inv-logo-ph, .inv-sig-clear { display: none !important; }

  body.inv-print-page { background: #ffffff !important; }
  body.inv-print-page .app-sidebar,
  body.inv-print-page .app-topbar,
  body.inv-print-page .sb-backdrop,
  body.inv-print-page .sb-tooltip,
  body.inv-print-page .poe-panel { display: none !important; }
  body.inv-print-page .app-shell { display: block !important; height: auto !important; overflow: visible !important; }
  body.inv-print-page main, body.inv-print-page .flex-1 { overflow: visible !important; }
  body.inv-print-page .inv-print-page { padding: 0 !important; background: #ffffff !important; }

  .inv-sheet-card { border: 0 !important; border-radius: 0 !important; box-shadow: none !important; overflow: visible !important; }
  .inv-sheet-stack { gap: 0 !important; padding: 0 !important; }
  .inv-sheet {
    width: 210mm; min-height: 296mm; margin: 0 !important;
    page-break-before: auto; page-break-after: always; break-before: auto; break-after: page;
  }
  .inv-sheet-stack .inv-sheet-card:last-child .inv-sheet { break-after: auto; page-break-after: auto; }
}

@media (max-width: 720px) {
  .inv-print-page { padding: 8px 12px 0; }
  .inv-sheet-stack { overflow-x: auto; }
}
`;

/* ------------------------------------------------------------------ */
/*  Editable field components                                          */
/* ------------------------------------------------------------------ */
function textValueOf(value) {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(textValueOf).filter(Boolean).join('\n');
  return '';
}

function EditableField({ value, editMode, onChange, type = 'text', className = '', style = {}, ...inputProps }) {
  const text = textValueOf(value);
  if (!editMode) return <span className={className} style={style}>{text || '\u2014'}</span>;
  return (
    <input type={type} value={text} onChange={(e) => onChange?.(e.target.value)}
      className={`inv-edit-input ${className}`} style={style} {...inputProps} />
  );
}

function EditableTextarea({ value, editMode, onChange, className = '', style = {} }) {
  const text = textValueOf(value);
  if (!editMode) return <span className={className} style={style}>{text || '\u2014'}</span>;
  return (
    <textarea value={text} onChange={(e) => onChange?.(e.target.value)}
      className={`inv-edit-textarea ${className}`} style={style} rows={3} />
  );
}

function readFileAsDataUrl(file, onLoad) {
  const reader = new FileReader();
  reader.onload = () => onLoad(reader.result);
  reader.readAsDataURL(file);
}

function UploadImageControl({ label, value, onPick, onClear }) {
  return (
    <span className="inv-sig-upload">
      <label className="inv-sig-upload-label">
        {label}
        <input type="file" accept="image/*" style={{ display: 'none' }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) readFileAsDataUrl(f, onPick); e.target.value = ''; }} />
      </label>
      {value && <button type="button" className="inv-sig-clear" onClick={onClear} title="Remove">&times;</button>}
    </span>
  );
}

/* Date display DD.MM.YYYY */
function referenceDate(value) {
  if (value == null || value === '') return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`;
}

function dateInputValue(value) {
  const str = String(value || '');
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
  const d = new Date(str);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function fmtAmount(value, currency = 'INR') {
  const sym = currency === 'INR' ? '\u20B9' : `(${currency})`;
  const num = Number(value) || 0;
  return `${sym} ${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/* ------------------------------------------------------------------ */
/*  Header                                                             */
/* ------------------------------------------------------------------ */
export function InvPrintHeader({ company, record, editMode, design = DEFAULT_INVOICE_PRINT_DESIGN,
  onCompanyChange, onRecordChange, onDesignChange }) {
  const logo = design.logo || company.logo || '';
  return (
    <header>
      <div className="inv-hdr">
        <div className="inv-hdr-left">
          {logo ? (
            <img className="inv-logo" src={logo} alt="Company logo" />
          ) : (
            editMode ? (
              <label className="inv-logo-ph">
                + Logo
                <input type="file" accept="image/*" style={{ display: 'none' }}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) readFileAsDataUrl(f, (d) => onDesignChange?.({ logo: d })); e.target.value = ''; }} />
              </label>
            ) : null
          )}
          <div>
            <div className="inv-co-name">
              <EditableField value={company.name} editMode={editMode}
                onChange={onCompanyChange ? (v) => onCompanyChange('name', v) : undefined} />
            </div>
            <div className="inv-co-addr">
              <EditableField value={company.address} editMode={editMode}
                onChange={onCompanyChange ? (v) => onCompanyChange('address', v) : undefined} />
            </div>
            <div className="inv-co-contact">
              {company.gstin && <>GSTIN: <b>{company.gstin}</b></>}
              {company.phone && <>{company.gstin ? ' · ' : ''}{company.phone}</>}
              {company.email && <>{(company.gstin || company.phone) ? ' · ' : ''}{company.email}</>}
            </div>
          </div>
        </div>
        <div className="inv-hdr-right">
          <div className="inv-doc-title">PURCHASE INVOICE</div>
          <div className="inv-doc-number">
            <EditableField value={record.invoiceNo} editMode={editMode}
              onChange={onRecordChange ? (v) => onRecordChange('invoiceNo', v) : undefined} />
          </div>
        </div>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ */
/*  Items Table                                                        */
/* ------------------------------------------------------------------ */
export function InvItemsTable({
  items = [], indices = [], currency = 'INR', totals = {}, refs, headOnly = false,
  editMode = false, onItemChange, onAddItem, onRemoveItem, onDuplicateItem, onMoveItem
}) {
  const lineTotalOf = (gi) => {
    const item = items[gi] || {};
    const qty = Number(item.qty) || 0;
    const rate = Number(item.rate || item.unitPrice || 0);
    const discRate = Number(item.discount) || 0;
    const base = qty * rate;
    return round2(base * (1 - Math.min(discRate, 100) / 100));
  };
  const actionCols = editMode ? 8 : 7;

  return (
    <div className="inv-items">
      <table className="inv-items-table">
        <thead ref={refs?.thead}>
          <tr>
            <th className="col-no">S.No</th>
            <th className="col-desc">Item Description</th>
            <th className="col-unit">Unit</th>
            <th className="col-qty">Qty</th>
            <th className="col-rate">Rate</th>
            <th className="col-tax">GST%</th>
            <th className="col-amount">Amount</th>
            {editMode && <th className="col-actions" />}
          </tr>
        </thead>
        {!headOnly && (
          <tbody ref={refs?.tbody}>
            {indices.length === 0 ? (
              <tr className="inv-empty-row">
                <td colSpan={actionCols}>No line items</td>
              </tr>
            ) : (
              indices.map((gi) => {
                const item = items[gi] || {};
                const lineTotal = lineTotalOf(gi);
                return (
                  <tr key={gi}>
                    <td className="col-no">{gi + 1}</td>
                    <td className="col-desc">
                      <EditableField value={item.product || item.description} editMode={editMode}
                        onChange={onItemChange ? (v) => onItemChange(gi, 'product', v) : undefined} />
                    </td>
                    <td className="col-unit">
                      <EditableField value={item.uom || ''} editMode={editMode}
                        onChange={onItemChange ? (v) => onItemChange(gi, 'uom', v) : undefined}
                        className="inv-edit-input--c" />
                    </td>
                    <td className="col-qty">
                      <EditableField value={String(Number(item.qty) || 0)} editMode={editMode}
                        onChange={onItemChange ? (v) => onItemChange(gi, 'qty', v) : undefined}
                        type="number" step="any" min="0" className="inv-edit-input--c" />
                    </td>
                    <td className="col-rate">
                      <EditableField value={String(item.rate || item.unitPrice || '')} editMode={editMode}
                        onChange={onItemChange ? (v) => onItemChange(gi, 'rate', v) : undefined}
                        type="number" step="any" min="0" className="inv-edit-input--num" />
                    </td>
                    <td className="col-tax">
                      <EditableField value={String(item.gstRate || item.gst || '')} editMode={editMode}
                        onChange={onItemChange ? (v) => onItemChange(gi, 'gstRate', v) : undefined}
                        type="number" step="any" min="0" className="inv-edit-input--c" />
                    </td>
                    <td className="col-amount">{fmtAmount(lineTotal, currency)}</td>
                    {editMode && (
                      <td className="col-actions">
                        <div className="inv-item-actions">
                          <button type="button" className="inv-item-act-btn" disabled={gi === 0}
                            onClick={() => onMoveItem?.(gi, -1)} title="Move up">
                            <ArrowUp style={{ width: '5pt', height: '5pt' }} />
                          </button>
                          <button type="button" className="inv-item-act-btn"
                            disabled={gi === items.length - 1}
                            onClick={() => onMoveItem?.(gi, 1)} title="Move down">
                            <ArrowDown style={{ width: '5pt', height: '5pt' }} />
                          </button>
                          <button type="button" className="inv-item-act-btn"
                            onClick={() => onDuplicateItem?.(gi)} title="Duplicate">
                            <Copy style={{ width: '5pt', height: '5pt' }} />
                          </button>
                          <button type="button" className="inv-item-del-btn"
                            onClick={() => onRemoveItem?.(gi)} title="Remove">
                            <Trash2 style={{ width: '5pt', height: '5pt' }} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        )}
      </table>
      {editMode && (
        <div className="inv-item-add-row">
          <button type="button" className="inv-item-add-btn" onClick={onAddItem}>
            <Plus style={{ width: '7pt', height: '7pt' }} /> Add Item
          </button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Document Bottom — totals, words, notes, terms, signatures          */
/* ------------------------------------------------------------------ */
export function InvDocumentBottom({
  record, totals, currency, preparedBy, checkedBy, approvedBy,
  design = DEFAULT_INVOICE_PRINT_DESIGN,
  editMode = false, onRecordChange, onTopLevelChange, onDesignChange
}) {
  const vis = design.visibility;
  const fmt = (v) => fmtAmount(v, currency);

  /* Build summary rows from totals */
  const summaryRows = [];
  const amt = Number(totals.amount ?? record.amount) || 0;
  const gst = Number(totals.gst ?? record.gst) || 0;
  const discount = Number(record.discount) || 0;
  const tds = Number(record.tds) || 0;
  const retention = Number(record.retention) || 0;
  const freight = Number(record.freight) || 0;
  const charges = Number(record.charges) || 0;
  const roundOff = Number(totals.roundOff ?? record.roundOff) || 0;

  if (discount > 0) summaryRows.push(['Discount', `\u2212 ${fmt(discount)}`]);
  summaryRows.push(['Taxable Amount', fmt(amt)]);
  if (gst > 0) summaryRows.push(['GST', fmt(gst)]);
  if (charges > 0) summaryRows.push(['Charges', fmt(charges)]);
  if (freight > 0) summaryRows.push(['Freight', fmt(freight)]);
  if (Math.abs(roundOff) >= 0.005) {
    summaryRows.push(['Round Off', `${roundOff >= 0 ? '+' : '\u2212'} ${fmt(Math.abs(roundOff))}`]);
  }
  if (tds > 0) summaryRows.push(['TDS', `\u2212 ${fmt(tds)}`]);
  if (retention > 0) summaryRows.push(['Retention', `\u2212 ${fmt(retention)}`]);

  const grandTotal = Number(record.total) || round2(amt + gst + charges + freight - tds - retention);

  const termsAndConditions = textValueOf(record.termsAndConditions) || getDefaultTermsContent();

  /* Signatures */
  const workflowSignatures = [
    { role: 'Prepared By', name: preparedBy, entry: design.signatures.preparedBy || {}, field: 'preparedBy' },
    { role: 'Verified By', name: checkedBy, entry: design.signatures.verifiedBy || {}, field: 'verifiedBy' },
    { role: 'Approved By', name: approvedBy, entry: design.signatures.approvedBy || {}, field: 'approvedBy' }
  ];
  const vendorBuyerSignatures = [
    { role: 'Vendor', name: (design.signatures.vendor || {}).name || record.vendor, entry: design.signatures.vendor || {}, field: 'vendor' },
    { role: 'Receiver', name: (design.signatures.buyer || {}).name || checkedBy, entry: design.signatures.buyer || {}, field: 'buyer' }
  ];
  const signatures = design.signatureLayout === SIGNATURE_LAYOUTS.VENDOR_BUYER
    ? vendorBuyerSignatures : workflowSignatures;

  const updateSig = (field, patch) => {
    onDesignChange?.({ signatures: { ...design.signatures, [field]: { ...(design.signatures[field] || {}), ...patch } } });
  };

  /* Payment info */
  const paymentInfo = [
    { label: 'Payment Method', value: record.paymentMethod, vis: vis.paymentMethod },
    { label: 'Payment Status', value: record.paymentStatus || record.status, vis: vis.paymentStatus },
    { label: 'Payment Date', value: record.paymentDate, vis: vis.paymentDate },
    { label: 'Due Date', value: record.dueDate, vis: vis.dueDate }
  ].filter((r) => r.vis !== false);

  return (
    <div className="inv-bottom">
      {/* Total */}
      <div className="inv-total">
        <span>Total</span>
        <span>{fmt(grandTotal)}</span>
      </div>

      {/* Summary */}
      {summaryRows.length > 0 && (
        <div className="inv-summary">
          {summaryRows.map(([label, value]) => (
            <div className="inv-summary-row" key={label}>
              <span className="inv-summary-k">{label}</span><span>{value}</span>
            </div>
          ))}
          <div className="inv-summary-grand">
            <span>Grand Total</span><span>{fmt(grandTotal)}</span>
          </div>
        </div>
      )}

      {/* Amount in Words */}
      {vis.amountInWords !== false && (
        <div className="inv-words">
          <span className="inv-words-k">Amount in Words : </span>
          <span>{numberToWords(Math.round(grandTotal)) || 'Zero Rupees Only'}</span>
        </div>
      )}

      {/* Payment info */}
      {vis.paymentInfo !== false && paymentInfo.length > 0 && (
        <div className="inv-payment">
          <div className="inv-payment-title">Payment Information</div>
          <div className="inv-payment-grid">
            {paymentInfo.map(({ label, value }) => (
              <div className="inv-payment-row" key={label}>
                <span className="inv-payment-k">{label}</span>
                <span className="inv-payment-v">{value || '\u2014'}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Notes */}
      {vis.notes !== false && (textValueOf(record.notes) || editMode) && (
        <div className="inv-notes">
          <div className="inv-notes-k">Notes :</div>
          <EditableTextarea value={record.notes || ''} editMode={editMode}
            onChange={onRecordChange ? (v) => onRecordChange('notes', v) : undefined}
            className="inv-notes-text" />
        </div>
      )}

      {/* Terms */}
      {vis.termsAndConditions !== false && (termsAndConditions || editMode) && (
        <div className="inv-terms">
          <div className="inv-terms-k">Terms &amp; Conditions :</div>
          <EditableTextarea value={termsAndConditions} editMode={editMode}
            onChange={onRecordChange ? (v) => onRecordChange('termsAndConditions', v) : undefined}
            className="inv-terms-text" />
        </div>
      )}

      {/* Signatures */}
      <div className="inv-sign">
        {signatures.map(({ role, name, entry, field }) => (
          <div className="inv-sign-item" key={role}>
            <div className="inv-sign-role">{role}</div>
            {editMode && (
              <UploadImageControl label={entry.image ? 'Replace' : 'Upload'} value={entry.image}
                onPick={(d) => updateSig(field, { image: d })}
                onClear={() => updateSig(field, { image: '' })} />
            )}
            {entry.image && !editMode && (
              <img className="inv-sign-img" src={entry.image} alt={`${role} signature`} />
            )}
            <div className="inv-sign-line" />
            <div className="inv-sign-name">
              <EditableField value={name} editMode={editMode}
                onChange={onTopLevelChange
                  ? (val) => {
                      if (design.signatureLayout === SIGNATURE_LAYOUTS.VENDOR_BUYER) {
                        updateSig(field, { name: val });
                      } else {
                        const fieldMap = { preparedBy: 'preparedBy', verifiedBy: 'checkedBy', approvedBy: 'approvedBy' };
                        onTopLevelChange(fieldMap[field], val);
                      }
                    }
                  : undefined} />
            </div>
            <div className="inv-sign-sub">
              <EditableField value={entry.designation || ''} editMode={editMode}
                onChange={onDesignChange ? (val) => updateSig(field, { designation: val }) : undefined} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Footer                                                             */
/* ------------------------------------------------------------------ */
export function InvSheetFooter({ generatedAt, pageNumber, totalPages }) {
  return (
    <footer className="inv-sheet-foot">
      <span>Generated on {formatDateTime(generatedAt)}</span>
      <span>Page {pageNumber} of {totalPages}</span>
    </footer>
  );
}

/* ------------------------------------------------------------------ */
/*  One full A4 sheet                                                  */
/* ------------------------------------------------------------------ */
export function InvPrintSheet({
  page, pageNumber, totalPages, data, sheetRef,
  editMode = false, design = DEFAULT_INVOICE_PRINT_DESIGN,
  onCompanyChange, onRecordChange, onItemChange,
  onAddItem, onRemoveItem, onDuplicateItem, onMoveItem,
  onTopLevelChange, onDesignChange
}) {
  const { record, company, preparedBy, checkedBy, approvedBy, generatedAt } = data;
  const totals = record.totals || {};

  return (
    <section className="inv-sheet" ref={sheetRef}>
      <style>{INVOICE_PRINT_STYLES}</style>
      <div className="inv-sheet-inner">
        {pageNumber === 1 ? (
          <InvPrintHeader company={company} record={record} editMode={editMode} design={design}
            onCompanyChange={onCompanyChange} onRecordChange={onRecordChange} onDesignChange={onDesignChange} />
        ) : (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
            paddingBottom: '6pt', borderBottom: '1pt solid #ccc', fontSize: '8pt', color: '#666', fontWeight: 700 }}>
            <span>{company.name || ''} · Purchase Invoice · {record.invoiceNo || ''}</span>
            <span>Page {pageNumber} of {totalPages}</span>
          </div>
        )}

        {page.rows.length > 0 && (
          <InvItemsTable items={record.items || []} indices={page.rows} currency={record.currency}
            totals={totals} editMode={editMode} onItemChange={onItemChange}
            onAddItem={onAddItem} onRemoveItem={onRemoveItem}
            onDuplicateItem={onDuplicateItem} onMoveItem={onMoveItem} />
        )}

        {page.bottom && (
          <InvDocumentBottom record={record} totals={totals} currency={record.currency}
            preparedBy={preparedBy} checkedBy={checkedBy} approvedBy={approvedBy}
            editMode={editMode} design={design} onRecordChange={onRecordChange}
            onTopLevelChange={onTopLevelChange} onDesignChange={onDesignChange} />
        )}
      </div>
      {design.visibility.footer !== false && (
        <InvSheetFooter generatedAt={generatedAt} pageNumber={pageNumber} totalPages={totalPages} />
      )}
    </section>
  );
}

export default {
  INVOICE_PRINT_STYLES,
  InvPrintHeader,
  InvItemsTable,
  InvDocumentBottom,
  InvSheetFooter,
  InvPrintSheet
};
