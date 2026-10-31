/**
 * purchase/components/PurchaseOrderPrintDocument.jsx
 * ------------------------------------------------------------------
 * THE single reusable Purchase Order document template.
 *
 * Visually matched to the "SWASTIK PO 2026.pdf" reference specimen:
 *   - A4 portrait, Times New Roman 12pt throughout
 *   - Supplier block (left) · Buyer block with logo + address + bordered
 *     Purchase-Order box (right)
 *   - Compact grid item table: S.No · Item Description · QTY ·
 *     Unit Rate · Amount
 *   - Concluding "Total" row + right-aligned tax/INR summary box
 *   - Amount in Words · Notes · Delivery / Payment · T&C ·
 *     Supplier Code of Conduct · signatures · footer
 *
 * EDIT MODE: a flat inline document — the very same DOM is measured,
 * previewed, printed and rasterised to PDF, so preview === print === PDF
 * (single source of truth). Editable fields become inputs; upload
 * controls add the logo / signature images; the design (layout,
 * visibility, signatures) flows through the `design` prop.
 * ------------------------------------------------------------------ */
import { formatAmountConverted } from '../utils/purchase';
import { formatDateTime } from '../utils/helpers';
import { paymentTermsLabel } from '../utils/paymentTerms';
import { ArrowDown, ArrowUp, Copy, Plus, Trash2 } from 'lucide-react';
import { getDefaultTermsContent } from '../services/settings';
import { DEFAULT_PO_PRINT_DESIGN } from '../services/poPrintDesign';

/* ------------------------------------------------------------------ */
/*  PO_PRINT_STYLES — self-contained A4 + preview styles.              */
/*  Units are CSS points on a 595.28×841.89pt (A4) sheet so the layout  */
/*  reproduces the measured reference geometry exactly.                */
/* ------------------------------------------------------------------ */
export const PO_PRINT_STYLES = `
/* ============================================================
   Purchase Order — A4 document (reference-matched)
   ============================================================ */
* { box-sizing: border-box; margin: 0; padding: 0; }

/* --- Page breaks & table grouping --- */
.po-sheet { page-break-before: auto; page-break-after: auto; break-before: auto; break-after: auto; }
.po-sheet thead { display: table-header-group; }
.po-sheet .po-bottom,
.po-sheet .po-summary,
.po-sheet .po-sign,
.po-sheet .po-sign-item,
.po-sheet .po-tc,
.po-sheet .po-soc,
.po-sheet .po-po-box,
.po-sheet .po-notes { page-break-inside: avoid; break-inside: avoid; }
.po-items-table tr { page-break-inside: avoid; break-inside: avoid; }

/* --- A4 sheet container --- */
.po-sheet {
  width: 595.28pt;
  min-height: 841.89pt;
  box-sizing: border-box;
  background: #ffffff;
  color: #111111;
  display: flex;
  flex-direction: column;
  font-family: 'Times New Roman', Times, 'Liberation Serif', serif;
  font-size: 12pt;
  line-height: 1.22;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

.po-sheet-inner { flex: 1 0 auto; padding: 30pt 22pt 16pt 36pt; }

/* ============================================================
   HEADER — Supplier (left) · Buyer (logo + address + PO box)
   ============================================================ */
.po-hdr-cols {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.po-supp { flex: 0 0 205pt; }
.po-supp-k { margin-bottom: 3pt; }
.po-supp-name { font-weight: 700; margin-bottom: 3pt; overflow-wrap: anywhere; }
.po-supp-addr {
  margin-bottom: 4pt;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.po-supp-line { margin-top: 1pt; overflow-wrap: anywhere; }
.po-supp-line b { font-weight: 700; }

.po-buyer { flex: 1 1 0; display: flex; flex-direction: column; min-width: 0; }
.po-buyer-logo {
  height: 44pt;
  display: flex;
  justify-content: flex-end;
  align-items: flex-start;
  margin-bottom: 5pt;
}
.po-logo-img {
  max-height: 44pt;
  max-width: 190pt;
  object-fit: contain;
  display: block;
}
.po-logo-ph {
  border: 1pt dashed #999;
  color: #666;
  font-size: 9.5pt;
  padding: 3pt 8pt;
  border-radius: 2pt;
  cursor: pointer;
}
.po-buyer-addr {
  margin-bottom: 7pt;
  text-align: left;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  min-height: 0;
  overflow: hidden;
}
.po-buyer-addr b { font-weight: 700; }

/* Bordered Purchase-Order information box */
.po-po-box {
  border: 0.75pt solid #111111;
  padding: 6pt 8pt 5pt;
}
.po-po-title { font-weight: 700; margin-bottom: 3pt; line-height: 1.05; }
.po-po-row {
  display: grid;
  grid-template-columns: 78pt 1fr;
  margin-top: 1.4pt;
  line-height: 1.2;
}
.po-po-k {
  text-align: right;
  padding-right: 8pt;
  white-space: nowrap;
  overflow: hidden;
}
.po-po-v { text-align: left; overflow-wrap: anywhere; word-break: break-word; }

/* ============================================================
   RUNNING HEADER (pages 2+) — logo only, like the reference
   ============================================================ */
.po-running {
  height: 41pt;
  display: flex;
  justify-content: flex-end;
  align-items: center;
}

/* ============================================================
   LINE ITEMS TABLE (reference column widths)
   ============================================================ */
.po-items { margin-top: 7pt; width: 100%; }
.po-items-table-wrap { width: 100%; display: flex; flex-direction: column; }
.po-items-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  flex: 1 1 auto;
  min-width: 0;
}
.po-items-table th,
.po-items-table td {
  border: 0.6pt solid #555;
  padding: 3pt 3pt;
  vertical-align: top;
  overflow-wrap: anywhere;
}
.po-items-table thead th {
  font-weight: 700;
  text-align: center;
  padding: 3.2pt 3pt;
  line-height: 1.15;
}
.po-items-table tbody td { color: #111; }
.po-items-table .col-no     { width: 26pt;  text-align: center; }
.po-items-table .col-desc   { width: auto; text-align: left; }
.po-items-table .col-unit   { width: 54pt;  text-align: center; }
.po-items-table .col-qty    { width: 50pt;  text-align: center; }
.po-items-table .col-rate   { width: 90pt;  text-align: right; font-variant-numeric: tabular-nums; }
.po-items-table .col-amount { width: 90pt;  text-align: right; font-variant-numeric: tabular-nums; }
.po-items-table .col-actions { width: 74pt; text-align: center; }
.po-empty-row td {
  text-align: center;
  font-style: italic;
  color: #666;
}
.po-item-add-row {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  margin: 3pt 0 0;
}
.po-item-actions {
  display: flex;
  gap: 2pt;
  justify-content: center;
  align-items: center;
  flex-wrap: wrap;
}
.po-item-act-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1pt solid #999;
  border-radius: 2pt;
  background: #f5f5f5;
  color: #333;
  cursor: pointer;
  padding: 1pt 3pt;
  transition: background 0.15s;
  line-height: 1;
}
.po-item-act-btn:hover { background: #e0e0e0; }
.po-item-act-btn:disabled { opacity: 0.3; cursor: default; }

/* ============================================================
   BOTTOM SECTION — Total row · Summary · Words · Notes ·
   Delivery/Payment · T&C · SOC · Signatures
   ============================================================ */
.po-bottom { margin-top: 7pt; }

/* Total row — concludes the items table (reference Total strip) */
.po-total {
  display: flex;
  justify-content: space-between;
  gap: 8pt;
  padding: 3pt 9pt 3pt 4pt;
  border-top: 1.2pt solid #111111;
  border-bottom: 1.2pt solid #111111;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  align-items: center;
}

/* Tax / INR summary box — label column + value column */
.po-summary {
  width: 220pt;
  margin: 6pt 0 0 auto;
  border: 0.75pt solid #444;
  flex: 0 0 220pt;
}
.po-summary-row {
  display: flex;
  justify-content: space-between;
  gap: 8pt;
  padding: 2.3pt 10pt;
  border-bottom: 0.75pt solid #444;
  font-variant-numeric: tabular-nums;
  align-items: center;
}
.po-summary-row > span:last-child {
  text-align: right;
  margin-left: auto;
}
.po-summary-row:last-child { border-bottom: none; }
.po-summary-k { font-weight: 700; }
.po-summary-grand {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 3pt 10pt;
  border-top: 0.75pt solid #444;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.po-summary-grand > span:last-child {
  text-align: right;
  margin-left: auto;
}

/* Amount in words */
.po-words { margin-top: 6pt; }
.po-words-k { font-weight: 700; }
.po-words-row { display: flex; justify-content: space-between; align-items: baseline; gap: 8pt; }
.po-words-row span:last-child { text-align: right; margin-left: auto; }

/* Notes */
.po-notes { margin-top: 7pt; }
.po-notes-k { font-weight: 700; }
.po-notes-text { white-space: pre-wrap; overflow-wrap: anywhere; }

/* Delivery / Payment plain lines (reference page 2) */
.po-terms-lines { margin-top: 8pt; }
.po-term-line { margin: 1pt 0; overflow-wrap: anywhere; }
.po-term-k { font-weight: 700; }

/* Terms & Conditions + Supplier Code of Conduct */
.po-tc { margin-top: 7pt; }
.po-tc-k { font-weight: 700; }
.po-tc-text, .po-soc-text { white-space: pre-wrap; overflow-wrap: anywhere; }
.po-soc { margin-top: 6pt; }
.po-soc-k { font-weight: 700; }

/* Signatures */
.po-sign {
  margin-top: 12pt;
  display: flex;
  justify-content: space-between;
  gap: 14pt;
  align-items: flex-start;
}
.po-sign--single {
  flex-direction: column;
  max-width: 50%;
  margin-left: auto;
}
.po-sign-item { flex: 1 1 0; min-width: 0; align-items: flex-start; }
.po-sign-role { font-weight: 700; text-align: center; margin-bottom: 4pt; }
.po-sign-img {
  display: block;
  max-height: 40pt;
  max-width: 110pt;
  margin: 0 auto 3pt;
  object-fit: contain;
}
.po-sign-line { border-bottom: 1pt solid #111; height: 14pt; }
.po-sign-name { font-weight: 700; text-align: center; margin-top: 3pt; overflow-wrap: anywhere; }
.po-sign-sub { text-align: center; font-size: 10pt; color: #333; overflow-wrap: anywhere; }

/* Signature image controls (edit mode) */
.po-sig-upload { display: flex; justify-content: center; align-items: center; gap: 4pt; margin-bottom: 3pt; }
.po-sig-upload-label {
  border: 1pt dashed #999;
  color: #666;
  font-size: 9pt;
  padding: 1pt 6pt;
  border-radius: 2pt;
  cursor: pointer;
}
.po-sig-clear {
  border: none;
  background: transparent;
  color: #b91c1c;
  font-size: 12pt;
  cursor: pointer;
  line-height: 1;
}

/* Vertical alignment helper: sign blocks on the same baseline */
.po-sign-item:after {
  content: "\\00a0";
  display: inline-block !important;
}

/* ============================================================
   FOOTER
   ============================================================ */
.po-sheet-foot {
  border-top: 0.75pt solid #777;
  margin: 0 30pt;
  padding: 3pt 0 4pt;
  display: flex;
  justify-content: space-between;
  gap: 12pt;
  font-size: 9.5pt;
  color: #333;
  align-items: center;
}

/* ============================================================
   SIGNATURE SECTION — keep totals + words + sigs together where possible
   ============================================================ */
.po-bottom { margin-top: 7pt; }

/* ============================================================
   PREVIEW CHROME (screen only)
   ============================================================ */
.po-print-page { padding: 8px 24px 0; }
.po-sheet-stack {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 32px;
  padding: 4px 0 48px;
  overflow-x: auto;
}
.po-sheet-card {
  background: #ffffff;
  border: 1px solid #e0e0e0;
  border-radius: 3px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.10);
  max-width: 100%;
  flex-shrink: 0;
}
.po-sheet-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 64px 0;
  color: #666;
  font-size: 12px;
  font-weight: 600;
}
.po-measure {
  position: fixed;
  left: -10000px;
  top: 0;
  width: 190mm;
  visibility: hidden;
  pointer-events: none;
}

/* ============================================================
   EDIT-MODE INPUTS
   ============================================================ */
.po-edit-input,
.po-edit-select,
.po-edit-textarea {
  border: 1pt solid transparent;
  border-radius: 2px;
  background: transparent;
  font: inherit;
  color: inherit;
  transition: border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
  padding: 1pt 2pt;
  width: 100%;
}
.po-edit-input:hover,
.po-edit-select:hover,
.po-edit-textarea:hover {
  background: rgba(7, 94, 84, 0.04);
  border-color: rgba(7, 94, 84, 0.25);
}
.po-edit-input:focus,
.po-edit-select:focus,
.po-edit-textarea:focus {
  background: rgba(7, 94, 84, 0.06);
  border-color: rgba(7, 94, 84, 0.5);
  box-shadow: 0 0 0 2px rgba(7, 94, 84, 0.1);
  outline: none;
}
.po-edit-input { text-align: left; font-size: 11pt; }
.po-edit-input--num {
  text-align: center;
  font-variant-numeric: tabular-nums;
  font-size: 11pt;
  /* Keep native spinner clickable while true-centring the numeric value:
     - text-align: center centres the rendered text baseline (*) in the
       content box.
     - The browser still carves out its spinner gutter on the right, so we
       slightly bias the value toward the left to visually compensate.
     - padding is asymmetric on purpose to avoid hiding the gutter and to
       prevent the value from being clipped by the spinner area. */
  padding: 1pt 12pt 1pt 2pt;
}
.po-edit-input--c { text-align: center; font-size: 11pt; }
.po-edit-select { font-size: 11pt; -webkit-appearance: auto; appearance: auto; cursor: pointer; }

/* --- Print-mode numeric inputs keep the same visual centre behaviour ---
   when the PO preview is printed/PDF-exported. The screen preview and the
   printed sheet must use the same alignment, so we style the actual
   input (not just the borderless print replacement). --- */
@media print {
  .po-edit-input--num {
    text-align: center !important;
    padding: 0 12pt 0 2pt !important;
    -webkit-appearance: textfield !important;
    appearance: textfield !important;
  }
}
.po-edit-textarea {
  font-size: 11pt;
  line-height: 1.3;
  resize: vertical;
  min-height: 40pt;
  white-space: pre-wrap;
}

.po-item-add-btn,
.po-item-del-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 2pt;
  border: 1pt solid #4a5f57;
  border-radius: 2pt;
  background: #eef4f2;
  color: #23443a;
  font-size: 9pt;
  font-weight: 700;
  cursor: pointer;
  padding: 1pt 5pt;
  transition: background 0.15s;
  line-height: 1.2;
}
.po-item-add-btn:hover { background: #dcebe5; }
.po-item-del-btn {
  border-color: #f3c0c0;
  background: #fdf1f1;
  color: #b91c1c;
  padding: 1pt 3pt;
}
.po-item-del-btn:hover { background: #fbe3e3; }

/* ============================================================
   UNSAVED CHANGES DIALOG
   ============================================================ */
.po-unsaved-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.po-unsaved-dialog {
  background: #ffffff;
  border-radius: 12px;
  padding: 24px;
  min-width: 380px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
}
.po-unsaved-dialog h3 {
  margin: 0 0 8px;
  font-size: 16px;
  font-weight: 700;
  color: #0f172a;
}
.po-unsaved-dialog p {
  margin: 0 0 20px;
  font-size: 13px;
  color: #64748b;
  line-height: 1.5;
}
.po-unsaved-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

/* ============================================================
   PRINT CSS
   ============================================================ */
@page { size: A4 portrait; margin: 0; }
@media print {
  .po-edit-input, .po-edit-select, .po-edit-textarea {
    border: none !important;
    background: transparent !important;
    box-shadow: none !important;
    pointer-events: none;
    -webkit-appearance: none;
    appearance: none;
    padding: 0;
    color: inherit !important;
    font: inherit !important;
  }
  .po-item-add-btn, .po-item-del-btn,
  .po-item-actions, .po-item-add-row,
  .po-sig-upload, .po-logo-ph, .po-sig-clear { display: none !important; }

  body.po-print-page { background: #ffffff !important; }
  body.po-print-page .app-sidebar,
  body.po-print-page .app-topbar,
  body.po-print-page .sb-backdrop,
  body.po-print-page .sb-tooltip,
  body.po-print-page .po-print-toolbar,
  body.po-print-page .poe-panel,
  body.po-print-page .po-edit-indicator { display: none !important; }
  body.po-print-page .app-shell {
    display: block !important;
    height: auto !important;
    overflow: visible !important;
  }
  body.po-print-page main,
  body.po-print-page .flex-1 { overflow: visible !important; }
  body.po-print-page .po-print-page {
    padding: 0 !important;
    background: #ffffff !important;
  }

  .po-sheet-card {
    border: 0 !important;
    border-radius: 0 !important;
    box-shadow: none !important;
    overflow: visible !important;
  }
  .po-sheet-stack {
    gap: 0 !important;
    padding: 0 !important;
  }
  .po-sheet {
    width: 210mm;
    min-height: 296mm;
    margin: 0 !important;
    page-break-before: auto;
    page-break-after: always;
    break-before: auto;
    break-after: page;
  }
  .po-sheet-stack .po-sheet-card:last-child .po-sheet {
    break-after: auto;
    page-break-after: auto;
  }
}

/* ============================================================
   RESPONSIVE — keep A4 fixed; allow horizontal scroll on small screens
   ============================================================ */
@media (max-width: 720px) {
  .po-print-page { padding: 8px 12px 0; }
  .po-sheet-stack { overflow-x: auto; }
}
`;

/* ------------------------------------------------------------------ */
/*  Editable field components.                                          */
/* ------------------------------------------------------------------ */
function textValueOf(value) {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) {
    return value.map(textValueOf).filter(Boolean).join('\n');
  }
  return '';
}

function EditableField({ value, editMode, onChange, type = 'text', className = '', style = {}, ...inputProps }) {
  const text = textValueOf(value);
  if (!editMode) {
    return <span className={className} style={style}>{text || '\u2014'}</span>;
  }
  return (
    <input
      type={type}
      value={text}
      onChange={(e) => onChange?.(e.target.value)}
      className={`po-edit-input ${className}`}
      style={style}
      {...inputProps}
    />
  );
}

function EditableTextarea({ value, editMode, onChange, className = '', style = {} }) {
  const text = textValueOf(value);
  if (!editMode) {
    return <span className={className} style={style}>{text || '\u2014'}</span>;
  }
  return (
    <textarea
      value={text}
      onChange={(e) => onChange?.(e.target.value)}
      className={`po-edit-textarea ${className}`}
      style={style}
      rows={3}
    />
  );
}

/* Date display in the reference DD.MM.YYYY style. */
function referenceDate(value) {
  if (value == null || value === '') return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}.${date.getFullYear()}`;
}

/* Date input value must be YYYY-MM-DD. */
function dateInputValue(value) {
  const str = String(value || '');
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
  const date = new Date(str);
  if (Number.isNaN(date.getTime())) return '';
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${date.getFullYear()}-${mm}-${dd}`;
}

function readFileAsDataUrl(file, onLoad) {
  const reader = new FileReader();
  reader.onload = () => onLoad(reader.result);
  reader.readAsDataURL(file);
}

function UploadImageControl({ label, value, onPick, onClear }) {
  return (
    <span className="po-sig-upload">
      <label className="po-sig-upload-label">
        {label}
        <input
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files && e.target.files[0];
            if (file) readFileAsDataUrl(file, onPick);
            e.target.value = '';
          }}
        />
      </label>
      {value && (
        <button type="button" className="po-sig-clear" onClick={onClear} title="Remove">×</button>
      )}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Exports: sub-components                                             */
/* ------------------------------------------------------------------ */

export function PoPrintHeader({
  company, record, editMode,
  design = DEFAULT_PO_PRINT_DESIGN,
  onCompanyChange, onRecordChange, onDesignChange
}) {
  const logo = design.logo || company.logo || '';
  const vendorName = editMode
    ? <EditableField value={record.vendor} editMode onChange={onRecordChange ? (val) => onRecordChange('vendor', val) : undefined} />
    : <span>{textValueOf(record.vendor) || '\u2014'}</span>;

  const addrText = [record.vendorAddress, record.vendorCity, record.vendorState]
    .filter(Boolean)
    .join(', ');
  const vendorAddr = editMode
    ? <>
        <EditableTextarea
          value={addrText}
          editMode
          onChange={onRecordChange ? (val) => {
            const parts = String(val || '').split(/\n/).map((s) => s.trim()).filter(Boolean);
            onRecordChange('vendorAddress', parts[0] || '');
            onRecordChange('vendorCity', parts[1] || '');
            onRecordChange('vendorState', parts[2] || '');
          } : undefined}
          className="po-edit-textarea"
        />
      </>
    : <span>{addrText}</span>;

  const contactPerson = record.buyer || record.requester || '';

  return (
    <header>
      <div className="po-hdr-cols">
        {/* Supplier */}
        <div className="po-supp">
          <div className="po-supp-k">Company</div>
          <div className="po-supp-name">{vendorName}</div>
          <div className="po-supp-addr">{vendorAddr}</div>
          <div className="po-supp-line">
            Ph :
            <EditableField
              value={record.vendorPhone || ''}
              editMode={editMode}
              onChange={onRecordChange ? (val) => onRecordChange('vendorPhone', val) : undefined}
            />
          </div>
          <div className="po-supp-line">
            Email
            <EditableField
              value={record.vendorEmail || ''}
              editMode={editMode}
              onChange={onRecordChange ? (val) => onRecordChange('vendorEmail', val) : undefined}
            />
          </div>
          <div className="po-supp-line">
            GSTIN : <b>
              <EditableField
                value={record.vendorGstin || ''}
                editMode={editMode}
                onChange={onRecordChange ? (val) => onRecordChange('vendorGstin', val) : undefined}
              />
            </b>
          </div>
        </div>

        {/* Buyer: logo · address · PO box */}
        <div className="po-buyer">
          <div className="po-buyer-logo">
            {logo ? (
              <img className="po-logo-img" src={logo} alt="Company logo" />
            ) : (
              editMode && (
                <label className="po-logo-ph">
                  + Add Logo
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const file = e.target.files && e.target.files[0];
                      if (file) readFileAsDataUrl(file, (dataUrl) => onDesignChange?.({ logo: dataUrl }));
                      e.target.value = '';
                    }}
                  />
                </label>
              )
            )}
          </div>

          <div className="po-buyer-addr">
            <EditableTextarea
              value={company.address}
              editMode={editMode}
              onChange={onCompanyChange ? (val) => onCompanyChange('address', val) : undefined}
              className="po-buyer-addr"
            />
            {company.gstin ? (
              <div>
                GSTIN : <b><EditableField value={company.gstin} editMode={editMode} onChange={onCompanyChange ? (val) => onCompanyChange('gstin', val) : undefined} /></b>
              </div>
            ) : (
              editMode && (
                <div>
                  GSTIN : <EditableField value="" editMode onChange={onCompanyChange ? (val) => onCompanyChange('gstin', val) : undefined} />
                </div>
              )
            )}          </div>

          <div className="po-po-box">
            <div className="po-po-title">PURCHASE ORDER</div>
            <div className="po-po-row">
              <span className="po-po-k">Order No.</span>
              <span className="po-po-v">
                <EditableField value={record.poNo} editMode={editMode} onChange={onRecordChange ? (val) => onRecordChange('poNo', val) : undefined} />
              </span>
            </div>
            <div className="po-po-row">
              <span className="po-po-k">Date</span>
              <span className="po-po-v">
                <EditableField
                  value={referenceDate(record.orderDate)}
                  editMode={editMode}
                  onChange={onRecordChange ? (val) => onRecordChange('orderDate', dateInputValue(val)) : undefined}
                  type="date"
                  inputMode="numeric"
                />
              </span>
            </div>
            {(record.reference || record.prNo || editMode) && (
              <div className="po-po-row">
                <span className="po-po-k">PR Ref.</span>
                <span className="po-po-v">
                  <EditableField value={record.reference || record.prNo || ''} editMode={editMode} onChange={onRecordChange ? (val) => onRecordChange('reference', val) : undefined} />
                </span>
              </div>
            )}
            {(record.expectedDate || record.deliveryDate || editMode) && (
              <div className="po-po-row">
                <span className="po-po-k">Delivery Date</span>
                <span className="po-po-v">
                  <EditableField value={referenceDate(record.expectedDate || record.deliveryDate)} editMode={editMode} onChange={onRecordChange ? (val) => onRecordChange('expectedDate', dateInputValue(val)) : undefined} type="date" inputMode="numeric" />
                </span>
              </div>
            )}
            <div className="po-po-row">
              <span className="po-po-k">Contact Person</span>
              <span className="po-po-v">
                <EditableField value={contactPerson} editMode={editMode} onChange={onRecordChange ? (val) => onRecordChange('buyer', val) : undefined} />
              </span>
            </div>
            <div className="po-po-row">
              <span className="po-po-k">Phone</span>
              <span className="po-po-v">
                <EditableField value={company.phone || ''} editMode={editMode} onChange={onCompanyChange ? (val) => onCompanyChange('phone', val) : undefined} />
              </span>
            </div>
            <div className="po-po-row">
              <span className="po-po-k">Email</span>
              <span className="po-po-v">
                <EditableField value={company.email || ''} editMode={editMode} onChange={onCompanyChange ? (val) => onCompanyChange('email', val) : undefined} />
              </span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

export function PoRunningHeader({ company, design = DEFAULT_PO_PRINT_DESIGN }) {
  const logo = design.logo || company.logo || '';
  return (
    <div className="po-running">
      {logo && <img className="po-logo-img" src={logo} alt="" />}
    </div>
  );
}

export function PoItemsTable({
  items = [], indices = [], currency = '', totals = {}, refs, headOnly = false,
  editMode = false, onItemChange, onAddItem, onRemoveItem, onDuplicateItem, onMoveItem
}) {
  const fmt = (value) => formatAmountConverted(value, currency);
  const lineTotalOf = (globalIndex) => {
    const item = items[globalIndex] || {};
    return totals?.lines?.[globalIndex]?.amount ??
      (Number(item.qty) || 0) * (Number(item.rate) || 0);
  };
  const curLabel = currency === 'INR' ? '\u20B9' : `(${currency})`;
  const actionCols = editMode ? 7 : 6;

  return (      <div className="po-items">
      <div className="po-items-table-wrap">
      <table className="po-items-table">
        <thead ref={refs?.thead}>
          <tr>
            <th className="col-no">S.No</th>
            <th className="col-desc">Item Description</th>
            <th className="col-unit">Unit</th>
            <th className="col-qty">QTY</th>
            <th className="col-rate">Unit Rate {curLabel}</th>
            <th className="col-amount">Amount {curLabel}</th>
            {editMode && <th className="col-actions" />}
          </tr>
        </thead>
        {!headOnly && (
          <tbody ref={refs?.tbody}>
            {indices.length === 0 ? (
              <tr className="po-empty-row">
                <td colSpan={actionCols}>No line items</td>
              </tr>
            ) : (
              indices.map((globalIndex) => {
                const item = items[globalIndex] || {};
                const lineTotal = lineTotalOf(globalIndex);
                return (
                  <tr key={globalIndex}>
                    <td className="col-no">{globalIndex + 1}</td>
                    <td className="col-desc">
                      <EditableField
                        value={item.product || item.description}
                        editMode={editMode}
                        onChange={onItemChange ? (val) => onItemChange(globalIndex, 'product', val) : undefined}
                      />
                    </td>
                    <td className="col-unit">
                      <EditableField
                        value={item.uom || ''}
                        editMode={editMode}
                        onChange={onItemChange ? (val) => onItemChange(globalIndex, 'uom', val) : undefined}
                        className="po-edit-input--c"
                      />
                    </td>
                    <td className="col-qty">
                      <EditableField
                        value={String(Number(item.qty) || 0)}
                        editMode={editMode}
                        onChange={onItemChange ? (val) => onItemChange(globalIndex, 'qty', val) : undefined}
                        type="number" step="any" min="0"
                        className="po-edit-input--c"
                      />
                    </td>
                    <td className="col-rate">
                      <EditableField
                        value={String(item.rate || '')}
                        editMode={editMode}
                        onChange={onItemChange ? (val) => onItemChange(globalIndex, 'rate', val) : undefined}
                        type="number" step="any" min="0"
                        className="po-edit-input--num"
                      />
                    </td>
                    <td className="col-amount">{fmt(lineTotal)}</td>
                    {editMode && (
                      <td className="col-actions">
                        <div className="po-item-actions">
                          <button type="button" className="po-item-act-btn" onClick={() => onMoveItem?.(globalIndex, -1)} title="Move up" disabled={globalIndex === 0}>
                            <ArrowUp style={{ width: '5pt', height: '5pt' }} />
                          </button>
                          <button type="button" className="po-item-act-btn" onClick={() => onMoveItem?.(globalIndex, 1)} title="Move down" disabled={globalIndex === items.length - 1}>
                            <ArrowDown style={{ width: '5pt', height: '5pt' }} />
                          </button>
                          <button type="button" className="po-item-act-btn" onClick={() => onDuplicateItem?.(globalIndex)} title="Duplicate item">
                            <Copy style={{ width: '5pt', height: '5pt' }} />
                          </button>
                          <button type="button" className="po-item-del-btn" onClick={() => onRemoveItem?.(globalIndex)} title="Remove item">
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
      </div>
      {editMode && (
        <div className="po-item-add-row">
          <button type="button" className="po-item-add-btn" onClick={onAddItem}>
            <Plus style={{ width: '7pt', height: '7pt' }} /> Add Item
          </button>
        </div>
      )}
    </div>
  );
}

export function PoDocumentBottom({
  record, totals, currency,
  design = DEFAULT_PO_PRINT_DESIGN,
  editMode = false, onRecordChange, onTopLevelChange, onDesignChange
}) {
  const vis = design.visibility;
  const fmt = (value) => formatAmountConverted(value, currency);

  const showIgst = Number(totals.igst ?? 0) > 0;
  const hasDeductions = Number(totals.lineDiscountAmount ?? 0) > 0 || Number(totals.discountAmount ?? 0) > 0;
  const taxedLines = (totals.lines || []).filter((line) =>
    Number(line.igst ?? 0) > 0 || Number(line.cgst ?? 0) > 0);
  const gstRate = taxedLines.length ? Math.max(...taxedLines.map((line) => Number(line.gstRate) || 0)) : 18;

  const summaryRows = [];
  /* Always show subtotal and taxable value for a professional summary. */
  summaryRows.push(['Subtotal', fmt(totals.subtotal ?? 0)]);
  if (Number(totals.lineDiscountAmount ?? 0) > 0) {
    summaryRows.push(['Line Discount', `\u2212 ${fmt(totals.lineDiscountAmount)}`]);
  }
  if (Number(totals.discountAmount ?? 0) > 0) {
    summaryRows.push(['Discount', `\u2212 ${fmt(totals.discountAmount)}`]);
  }
  if (hasDeductions) summaryRows.push(['Taxable Value', fmt(totals.taxable ?? 0)]);
  if (showIgst) {
    if (Number(totals.igst ?? 0) > 0) summaryRows.push([`IGST ${gstRate}%`, fmt(totals.igst)]);
  } else if (Number(totals.gstTotal ?? 0) > 0) {
    summaryRows.push([`CGST ${gstRate / 2}%`, fmt(totals.cgst ?? 0)]);
    summaryRows.push([`SGST ${gstRate / 2}%`, fmt(totals.sgst ?? 0)]);
  }
  if (Number(totals.charges ?? 0) > 0) summaryRows.push(['Charges', fmt(totals.charges)]);
  if (Math.abs(Number(totals.roundOff ?? 0)) >= 0.005) {
    summaryRows.push(['Round Off', `${(totals.roundOff ?? 0) >= 0 ? '+' : '\u2212'} ${fmt(Math.abs(totals.roundOff ?? 0))}`]);
  }

  const deliveryTerm = textValueOf(record.deliveryTerms || record.terms);
  const paymentTerm = textValueOf(record.paymentTerms) || paymentTermsLabel(record.paymentTerms) || '';
  const termsAndConditions = textValueOf(record.termsAndConditions) || getDefaultTermsContent();
  const supplierCodeOfConduct = textValueOf(record.supplierCodeOfConduct);

  /* Signatories — Seller / Buyer layout. */
  const signatures = [
    {
      role: 'Seller', name: (design.signatures.seller || {}).name || record.vendor,
      entry: design.signatures.seller || {},
      field: 'seller'
    },
    {
      role: 'Buyer', name: (design.signatures.buyer || {}).name || design.supplier?.name || record.buyer || record.requester,
      entry: design.signatures.buyer || {},
      field: 'buyer'
    }
  ];

  const updateSignature = (field, patch) => {
    onDesignChange?.({
      signatures: {
        ...design.signatures,
        [field]: { ...(design.signatures[field] || {}), ...patch }
      }
    });
  };

  return (
    <div className="po-bottom">
      {/* Total — concludes the items table */}
      <div className="po-total">
        <span>Total</span>
        <span>{fmt(totals.subtotal ?? 0)}</span>
      </div>

      {/* Tax / INR summary box — right aligned */}
      {summaryRows.length > 0 && (
        <div className="po-summary">
          {summaryRows.map(([label, value]) => (
            <div className="po-summary-row" key={label}>
              <span className="po-summary-k">{label}</span>
              <span>{value}</span>
            </div>
          ))}
          <div className="po-summary-grand">
            <span>Total in INR</span>
            <span>{fmt(totals.roundedTotal ?? totals.total ?? 0)}</span>
          </div>
        </div>
      )}

      {/* Amount in Words — kept with totals, single line when possible */}
      {vis.amountInWords && (
        <div className="po-words">
          <div className="po-words-row">
            <span className="po-words-k">Amount in Words :</span>
            <span>{totals.inWords || 'Zero Rupees Only'}</span>
          </div>
        </div>
      )}

      {/* Notes */}
      {vis.notes && (textValueOf(record.notes) || editMode) && (
        <div className="po-notes">
          <div className="po-notes-k">Notes :</div>
          <EditableTextarea
            value={record.notes || ''}
            editMode={editMode}
            onChange={onRecordChange ? (val) => onRecordChange('notes', val) : undefined}
            className="po-notes-text"
          />
        </div>
      )}

      {/* Delivery / Payment */}
      {((vis.deliveryPayment && deliveryTerm) || (vis.deliveryPayment && paymentTerm) || editMode) && (
        <div className="po-terms-lines">
          <div className="po-term-line">
            <span className="po-term-k">Delivery Term : </span>
            <EditableField
              value={deliveryTerm}
              editMode={editMode}
              onChange={onRecordChange ? (val) => onRecordChange('deliveryTerms', val) : undefined}
            />
          </div>
          <div className="po-term-line">
            <span className="po-term-k">Payment : </span>
            {/* Structured paymentTerms (from the PO form) are rendered as
                text — only free-text strings are safely editable inline. */}
            <EditableField
              value={paymentTerm}
              editMode={editMode && typeof record.paymentTerms === 'string'}
              onChange={onRecordChange ? (val) => onRecordChange('paymentTerms', val) : undefined}
            />
          </div>
        </div>
      )}

      {/* Terms & Conditions */}
      {vis.termsAndConditions && (termsAndConditions || editMode) && (
        <div className="po-tc">
          <div className="po-tc-k">Terms &amp; Conditions :</div>
          <EditableTextarea
            value={termsAndConditions}
            editMode={editMode}
            onChange={onRecordChange ? (val) => onRecordChange('termsAndConditions', val) : undefined}
            className="po-tc-text"
          />
        </div>
      )}

      {/* Supplier Code of Conduct */}
      {vis.supplierCodeOfConduct && (supplierCodeOfConduct || editMode) && (
        <div className="po-soc">
          <div className="po-soc-k">Supplier Code of Conduct :</div>
          <div className="po-soc-text">
            <EditableTextarea
              value={supplierCodeOfConduct}
              editMode={editMode}
              onChange={onRecordChange ? (val) => onRecordChange('supplierCodeOfConduct', val) : undefined}
              className="po-soc-text"
            />
          </div>
        </div>
      )}

      {/* Signatures — only rendered when at least one party is visible */}
      {vis.seller || vis.buyer ? (
        <div className={`po-sign${vis.seller && vis.buyer ? '' : ' po-sign--single'}`}>
          {signatures.map(({ role, name, entry, field }) => {
            const visible = vis[role] !== false;
            if (!visible) return null;
            return (
              <div className="po-sign-item" key={role}>
                <div className="po-sign-role">{role}</div>
                {editMode && (
                  <UploadImageControl
                    label={entry.image ? 'Replace' : 'Upload'}
                    value={entry.image}
                    onPick={(dataUrl) => updateSignature(field, { image: dataUrl })}
                    onClear={() => updateSignature(field, { image: '' })}
                  />
                )}
                {entry.image && !editMode && (
                  <img className="po-sign-img" src={entry.image} alt={`${role} signature`} />
                )}
                <div className="po-sign-line" />
                <div className="po-sign-name">
                  <EditableField
                    value={name}
                    editMode={editMode}
                    onChange={updateSignature ? (val) => updateSignature(field, { name: val }) : undefined}
                  />
                </div>
                <div className="po-sign-sub">
                  <EditableField
                    value={entry.designation || ''}
                    editMode={editMode}
                    onChange={updateSignature ? (val) => updateSignature(field, { designation: val }) : undefined}
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export function PoSheetFooter({ generatedAt, pageNumber, totalPages }) {
  return (
    <footer className="po-sheet-foot">
      <span>Generated on {formatDateTime(generatedAt)}</span>
      <span>Page {pageNumber} of {totalPages}</span>
    </footer>
  );
}

/* ------------------------------------------------------------------ */
/*  One full A4 sheet.                                                   */
/* ------------------------------------------------------------------ */
export function PoPrintSheet({
  page, pageNumber, totalPages, data, sheetRef,
  editMode = false, design = DEFAULT_PO_PRINT_DESIGN,
  onCompanyChange, onRecordChange, onItemChange,
  onAddItem, onRemoveItem, onDuplicateItem, onMoveItem,
  onTopLevelChange, onDesignChange
}) {
  const { record, company, generatedAt } = data;
  const totals = record.totals || {};

  return (
    <section className="po-sheet" ref={sheetRef}>
      <style>{PO_PRINT_STYLES}</style>
      <div className="po-sheet-inner">
        {pageNumber === 1 ? (
          <PoPrintHeader
            company={company}
            record={record}
            editMode={editMode}
            design={design}
            onCompanyChange={onCompanyChange}
            onRecordChange={onRecordChange}
            onDesignChange={onDesignChange}
          />
        ) : (
          <PoRunningHeader
            company={company}
            record={record}
            pageNumber={pageNumber}
            totalPages={totalPages}
            design={design}
          />
        )}

        {(() => {
          /* Safety: if pagination returned empty rows but items exist,
             render ALL items so the table is never missing. */
          const allItems = record.items || [];
          const indices = page.rows.length > 0 ? page.rows : allItems.map((_, i) => i);
          if (indices.length === 0 && page.bottom) {
            /* Final empty page — only bottom section, no table. */
            return null;
          }
          return (
            <PoItemsTable
              items={allItems}
              indices={indices}
              currency={record.currency}
              totals={totals}
              editMode={editMode}
              onItemChange={onItemChange}
              onAddItem={onAddItem}
              onRemoveItem={onRemoveItem}
              onDuplicateItem={onDuplicateItem}
              onMoveItem={onMoveItem}
            />
          );
        })()}

        {page.bottom && (
          <PoDocumentBottom
            record={record}
            totals={totals}
            currency={record.currency}
            editMode={editMode}
            design={design}
            onRecordChange={onRecordChange}
            onTopLevelChange={onTopLevelChange}
            onDesignChange={onDesignChange}
          />
        )}
      </div>
      {design.visibility.footer && (
        <PoSheetFooter generatedAt={generatedAt} pageNumber={pageNumber} totalPages={totalPages} />
      )}
    </section>
  );
}

export default {
  PO_PRINT_STYLES,
  PoPrintHeader,
  PoRunningHeader,
  PoItemsTable,
  PoDocumentBottom,
  PoSheetFooter,
  PoPrintSheet
};