/**
 * purchase/components/RequisitionPrintDocument.jsx
 * ------------------------------------------------------------------
 * THE single reusable Purchase Requisition document template.
 *
 * The SAME DOM rendered here feeds all three outputs:
 *   1. On-screen A4 print preview (PurchaseRequisitionPrint)
 *   2. Browser Print (window.print() — @media print rules below)
 *   3. Downloaded PDF (each `.pr-sheet` node is rasterised via SVG
 *      <foreignObject> + jsPDF — see utils/export.js)
 *
 * Pagination is measurement-driven: the preview page measures the real
 * rendered heights (header block, table header, every item row, bottom
 * block, footer) and splits line items across A4 pages so rows are
 * never cut in half and the table header repeats on every page.
 *
 * The stylesheet below (PRINT_SHEET_STYLES) is intentionally
 * self-contained — plain CSS, hex colours, no Tailwind utilities — so
 * the exported PDF carries exactly the same styles and is never
 * affected by dark mode or theme changes.
 *
 * EDIT MODE: When `editMode` is true, text fields are rendered as
 * proper HTML form inputs (<input>, <select>, <textarea>) so values
 * can be typed, selected, and modified reliably. When false (preview),
 * fields render as plain text (measurement area, PDF).
 * ------------------------------------------------------------------ */
import { formatAmountConverted, formatAmountInWords } from '../utils/purchase';
import { formatDate, formatDateTime } from '../utils/helpers';
import { Plus, Trash2 } from 'lucide-react';
import { GST_RATES } from '../constants';

/* ------------------------------------------------------------------ */
/*  PRINT_SHEET_STYLES — the entire document + preview chrome styles.  */
/*  Injected via <style> tags inside each sheet so the PDF rasteriser  */
/*  (which clones a sheet node) gets identical styling for free.       */
/* ------------------------------------------------------------------ */
export const PRINT_SHEET_STYLES = `
/* ============ Purchase Requisition — A4 print document ============ */
* { box-sizing: border-box; margin: 0; padding: 0; }

.pr-sheet { page-break-before: auto; page-break-after: auto; break-before: auto; break-after: auto; }
.pr-sheet thead { display: table-header-group; }
.pr-sheet tfoot { display: table-footer-group; }
.pr-sheet tr,
.pr-sheet td { page-break-inside: avoid; break-inside: avoid; }
.pr-sheet .pr-bottom,
.pr-sheet .pr-summary,
.pr-sheet .pr-sign,
.pr-sheet .pr-sign-item { page-break-inside: avoid; break-inside: avoid; }

.pr-sheet {
  width: 210mm;
  min-height: 297mm;
  box-sizing: border-box;
  background: #ffffff;
  color: #0f172a;
  display: flex;
  flex-direction: column;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  font-size: 10px;
  line-height: 1.45;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

.pr-sheet-inner { flex: 1 0 auto; padding: 10mm; }

.pr-company {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12mm;
  padding-bottom: 6mm;
  border-bottom: 2px solid #0f172a;
}
.pr-company-left { display: flex; align-items: flex-start; gap: 4mm; min-width: 0; }
.pr-logo {
  width: 14mm; height: 14mm; border-radius: 3mm; flex-shrink: 0;
  background: #0B4A3D; color: #ffffff;
  display: flex; align-items: center; justify-content: center;
  font-size: 12px; font-weight: 800; letter-spacing: 0.5px;
}
.pr-company-name { margin: 0; font-size: 16px; font-weight: 800; letter-spacing: -0.2px; color: #0f172a; }
.pr-company-address { margin: 1.2mm 0 0; font-size: 8.5px; color: #64748b; line-height: 1.5; overflow-wrap: anywhere; word-break: break-word; }
.pr-company-contact { margin: 1.2mm 0 0; font-size: 8.5px; color: #475569; }
.pr-dot { margin: 0 1.5mm; color: #94a3b8; }
.pr-company-right { text-align: right; flex-shrink: 0; }
.pr-doc-title { margin: 0; font-size: 17px; font-weight: 800; color: #0f172a; letter-spacing: -0.2px; }
.pr-pr-no { padding-top: 1.5mm; font-size: 13px; font-weight: 800; color: #0B4A3D; }
.pr-status {
  display: inline-block; margin-top: 2.5mm; padding: 1.4mm 3.5mm; border-radius: 10mm;
  font-size: 7.5px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase;
}
.pr-status--gray  { background: #f3f4f6; color: #6b7280; }
.pr-status--amber { background: #fffbeb; color: #d97706; }
.pr-status--green { background: #f0fdf4; color: #16a34a; }
.pr-status--red   { background: #fef2f2; color: #dc2626; }
.pr-status--cyan  { background: #ecfeff; color: #0891b2; }

.pr-details { display: grid; grid-template-columns: 1fr 1fr; column-gap: 12mm; padding: 5mm 0 2mm; }
.pr-detail-row {
  display: flex; align-items: baseline; justify-content: space-between; gap: 4mm;
  padding: 1.6mm 0; border-bottom: 1px dashed #e2e8f0;
}
.pr-detail-label {
  flex-shrink: 0; font-size: 6.5px; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.6px; color: #64748b;
}
.pr-detail-value { font-size: 9.5px; font-weight: 600; color: #0f172a; text-align: right; word-break: break-word; }

.pr-section-label {
  font-size: 7px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.7px; color: #64748b; padding-bottom: 3mm;
}

.pr-items { padding-top: 6mm; }
.pr-items-table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 8.5px; }
.pr-items-table thead th {
  background: #0B4A3D; color: #ffffff;
  font-size: 7px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px;
  text-align: left; padding: 2.5mm 2mm;
  word-break: break-word; overflow-wrap: anywhere;
}
.pr-items-table thead th.num { text-align: right; }
.pr-items-table tbody td { padding: 2.2mm 2mm; border-bottom: 1px solid #e2e8f0; vertical-align: top; color: #334155; word-break: break-word; overflow-wrap: anywhere; }
.pr-items-table tbody td.num { text-align: right; font-variant-numeric: tabular-nums; color: #0f172a; }
.pr-items-table tbody td.desc { font-weight: 600; color: #0f172a; }
.pr-items-table tbody tr:nth-child(even) td { background: #f8fafc; }
.pr-items-table tr {
  break-inside: avoid; page-break-inside: avoid;
  page-break-before: auto; page-break-after: auto; break-before: auto; break-after: auto;
}
.pr-items-table .col-no     { width: 4%; }
.pr-items-table .col-desc   { width: 36%; }
.pr-items-table .col-hsn    { width: 8%; }
.pr-items-table .col-uom    { width: 7%; }
.pr-items-table .col-qty    { width: 7%; }
.pr-items-table .col-rate   { width: 11%; }
.pr-items-table .col-disc   { width: 8%; }
.pr-items-table .col-gst    { width: 8%; }
.pr-items-table .col-amount { width: 11%; }
.pr-items-table .col-actions { width: 5%; }
.pr-empty-row td { text-align: center; font-style: italic; color: #94a3b8; padding: 6mm 2mm !important; }

.pr-running {
  display: flex; justify-content: space-between; align-items: baseline; gap: 4mm;
  padding-bottom: 9mm; border-bottom: 1px solid #cbd5e1;
  font-size: 8.5px; color: #64748b;
}
.pr-running-left { font-weight: 700; color: #334155; }
.pr-running-company { color: #0B4A3D; font-weight: 800; }
.pr-running-right { font-weight: 600; }

.pr-bottom { display: grid; grid-template-columns: 1fr 1fr; gap: 6mm 10mm; padding-top: 7mm; page-break-inside: avoid; break-inside: avoid; }
.pr-notes-text { margin: 0; font-size: 9px; color: #334155; line-height: 1.55; white-space: pre-wrap; overflow-wrap: anywhere; word-break: break-word; }
.pr-notes-internal { padding-top: 2mm; font-size: 8.5px; color: #94a3b8; font-style: italic; }
.pr-words-label { padding-top: 5mm; }
.pr-words-text { margin: 0; font-size: 9.5px; color: #334155; font-style: italic; overflow-wrap: anywhere; word-break: break-word; }
.pr-words-foreign { padding-top: 1.5mm; font-size: 9px; font-weight: 600; color: #475569; }
.pr-summary { border: 1px solid #e2e8f0; border-radius: 1.5mm; overflow: hidden; }
.pr-summary-row {
  display: flex; justify-content: space-between; gap: 4mm;
  padding: 1.8mm 3mm; border-bottom: 1px dashed #e2e8f0;
  font-size: 8.5px; color: #475569;
}
.pr-summary-row span:last-child { font-weight: 700; color: #334155; font-variant-numeric: tabular-nums; }
.pr-summary-grand {
  display: flex; justify-content: space-between; gap: 4mm;
  padding: 2.5mm 3mm; background: #0B4A3D; color: #ffffff;
  font-size: 10px; font-weight: 800;
}
.pr-summary-grand span:last-child { font-variant-numeric: tabular-nums; }

.pr-sign { grid-column: 1 / -1; display: grid; grid-template-columns: repeat(3, 1fr); gap: 12mm; margin-top: 8mm; }
.pr-sign-item { break-inside: avoid; page-break-inside: avoid; }
.pr-sign-role {
  font-size: 7px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.6px; color: #64748b; margin-bottom: 9mm;
}
.pr-sign-line { border-top: 1px solid #94a3b8; padding-top: 1.5mm; }
.pr-sign-name { margin: 0; font-size: 10px; font-weight: 700; color: #0f172a; }
.pr-sign-sub { margin: 0.5mm 0 0; font-size: 7.5px; color: #94a3b8; }

.pr-sheet-foot {
  border-top: 1px solid #e2e8f0;
  margin: 0 10mm; padding: 2.5mm 0 8mm;
  display: flex; justify-content: space-between; gap: 4mm;
  font-size: 7.5px; color: #94a3b8;
}

.pr-print-page { padding: 8px 24px 0; }
.pr-sheet-stack { display: flex; flex-direction: column; align-items: center; gap: 32px; padding: 4px 0 48px; }
.pr-sheet-card {
  background: #ffffff; border: 1px solid #e2e8f0; border-radius: 4px;
  box-shadow: 0 12px 32px rgba(15, 23, 42, 0.10); max-width: 100%;
}
.pr-sheet-loading { display: flex; align-items: center; justify-content: center; gap: 10px; padding: 64px 0; color: #64748b; font-size: 12px; font-weight: 600; }
.pr-measure {
  position: fixed; left: -10000px; top: 0; width: 190mm;
  visibility: hidden; pointer-events: none;
}

/* ============ Edit-mode form inputs ============ */
.pr-edit-input,
.pr-edit-select,
.pr-edit-textarea {
  border: 1px solid transparent;
  border-radius: 2px;
  background: transparent;
  font: inherit;
  color: inherit;
  transition: all 0.15s ease;
  padding: 0;
  width: 100%;
}
.pr-edit-input:hover,
.pr-edit-select:hover,
.pr-edit-textarea:hover {
  background: rgba(11, 74, 61, 0.03);
  border-color: rgba(11, 74, 61, 0.12);
}
.pr-edit-input:focus,
.pr-edit-select:focus,
.pr-edit-textarea:focus {
  background: rgba(11, 74, 61, 0.06);
  border-color: rgba(11, 74, 61, 0.35);
  box-shadow: 0 0 0 2px rgba(11, 74, 61, 0.12);
  outline: none;
}
.pr-edit-input { font-size: 9.5px; font-weight: 600; text-align: right; }
.pr-edit-input--left { text-align: left; }
.pr-edit-input--desc { font-weight: 600; text-align: left; color: #0f172a; }
.pr-edit-select {
  font-size: 9.5px;
  font-weight: 600;
  text-align: right;
  -webkit-appearance: auto;
  appearance: auto;
  cursor: pointer;
}
.pr-edit-textarea {
  font-size: 9px;
  line-height: 1.55;
  resize: vertical;
  min-height: 18mm;
  white-space: pre-wrap;
}
.pr-edit-input-num {
  font-variant-numeric: tabular-nums;
}
.pr-item-add-btn,
.pr-item-del-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 1mm;
  border: 1px solid #0B4A3D;
  border-radius: 1.5mm;
  background: #E8F0EE;
  color: #0B4A3D;
  font-size: 7px;
  font-weight: 700;
  cursor: pointer;
  padding: 1mm 2.5mm;
  transition: background 0.15s;
  line-height: 1;
}
.pr-item-add-btn:hover { background: #d0e8e0; }
.pr-item-del-btn {
  border-color: #fecaca;
  background: #fef2f2;
  color: #dc2626;
  padding: 0.8mm 1.5mm;
}
.pr-item-del-btn:hover { background: #fee2e2; }

@media print {
  .pr-edit-input, .pr-edit-select, .pr-edit-textarea {
    border: none !important;
    background: transparent !important;
    box-shadow: none !important;
    pointer-events: none;
    -webkit-appearance: none;
    appearance: none;
    padding: 0;
  }
  .pr-item-add-btn, .pr-item-del-btn { display: none !important; }
}

@media (max-width: 720px) {
  .pr-print-page { padding: 8px 12px 0; }
  .pr-details { grid-template-columns: 1fr; }
  .pr-bottom { grid-template-columns: 1fr; }
  .pr-sign { grid-template-columns: 1fr; gap: 8mm; }
}

@page { size: A4 portrait; margin: 0; }

@media print {
  body.pr-print-page { background: #ffffff !important; }
  body.pr-print-page .app-sidebar,
  body.pr-print-page .app-topbar,
  body.pr-print-page .sb-backdrop,
  body.pr-print-page .sb-tooltip,
  body.pr-print-page .pr-print-toolbar { display: none !important; }
  body.pr-print-page .app-shell { display: block !important; height: auto !important; overflow: visible !important; }
  body.pr-print-page main,
  body.pr-print-page .flex-1 { overflow: visible !important; }
  body.pr-print-page .pr-print-page { padding: 0 !important; background: #ffffff !important; }
  .pr-sheet-card { border: 0 !important; border-radius: 0 !important; box-shadow: none !important; overflow: visible !important; }
  .pr-sheet-stack { gap: 0 !important; padding: 0 !important; }
  .pr-sheet {
    width: 210mm; min-height: 296mm; margin: 0 !important;
    page-break-before: auto; page-break-after: always;
    break-before: auto; break-after: page;
  }
  .pr-sheet-stack .pr-sheet-card:last-child .pr-sheet { break-after: auto; page-break-after: auto; }
}
`;

/* ------------------------------------------------------------------ */
/*  Status pill tone (mirrors the app's status palette).              */
/* ------------------------------------------------------------------ */
const STATUS_TONES = {
  Draft: 'gray',
  'Pending Approval': 'amber',
  Approved: 'green',
  Rejected: 'red',
  Returned: 'amber',
  'PO Raised': 'green',
  Converted: 'green',
  'Converted to RFQ': 'green'
};

/* ------------------------------------------------------------------ */
/*  Inline editable field — renders input or plain text.              */
/* ------------------------------------------------------------------ */
function EditableField({ value, editMode, onChange, type = 'text', className = '', style = {}, ...inputProps }) {
  if (!editMode) {
    return <span className={className} style={style}>{value || '—'}</span>;
  }
  return (
    <input
      type={type}
      value={value || ''}
      onChange={(e) => onChange?.(e.target.value)}
      className={`pr-edit-input ${className}`}
      style={style}
      {...inputProps}
    />
  );
}


function EditableTextarea({ value, editMode, onChange, className = '', style = {} }) {
  if (!editMode) {
    return <span className={className} style={style}>{value || '—'}</span>;
  }
  return (
    <textarea
      value={value || ''}
      onChange={(e) => onChange?.(e.target.value)}
      className={`pr-edit-textarea ${className}`}
      style={style}
      rows={4}
    />
  );
}

/* ------------------------------------------------------------------ */
/*  Small presentational pieces.                                      */
/* ------------------------------------------------------------------ */
function Detail({ label, value, editMode, onChange, type = 'text', inputClassName = '' }) {
  return (
    <div className="pr-detail-row">
      <span className="pr-detail-label">{label}</span>
      <EditableField
        value={value}
        editMode={editMode}
        onChange={onChange}
        type={type}
        className={`pr-detail-value ${inputClassName}`}
      />
    </div>
  );
}

function companyInitials(name = '') {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase() || 'CO';
}

/* ------------------------------------------------------------------ */
/*  Company header (page 1)                                           */
/* ------------------------------------------------------------------ */
export function RequisitionPrintHeader({ company, record, editMode, onCompanyChange, onRecordChange }) {
  return (
    <header>
      <div className="pr-company">
        <div className="pr-company-left">
          <div className="pr-logo" aria-hidden="true">{companyInitials(company.name)}</div>
          <div>
            <h1 className="pr-company-name">
              <EditableField
                value={company.name}
                editMode={editMode}
                onChange={onCompanyChange ? (val) => onCompanyChange('name', val) : undefined}
                className="pr-edit-input--left"
              />
            </h1>
            <EditableField
              value={company.address}
              editMode={editMode}
              onChange={onCompanyChange ? (val) => onCompanyChange('address', val) : undefined}
              className="pr-company-address"
              style={{ display: 'block' }}
            />
            <p className="pr-company-contact">
              <span>GSTIN <EditableField
                value={company.gstin}
                editMode={editMode}
                onChange={onCompanyChange ? (val) => onCompanyChange('gstin', val) : undefined}
              /></span>
              <span className="pr-dot">·</span>
              <span><EditableField
                value={company.phone}
                editMode={editMode}
                onChange={onCompanyChange ? (val) => onCompanyChange('phone', val) : undefined}
              /></span>
              <span className="pr-dot">·</span>
              <span><EditableField
                value={company.email}
                editMode={editMode}
                onChange={onCompanyChange ? (val) => onCompanyChange('email', val) : undefined}
              /></span>
            </p>
          </div>
        </div>
        <div className="pr-company-right">
          <h2 className="pr-doc-title">Purchase Requisition</h2>
          <p className="pr-pr-no">
            <EditableField
              value={record.prNo}
              editMode={editMode}
              onChange={onRecordChange ? (val) => onRecordChange('prNo', val) : undefined}
            />
          </p>
          <span className={`pr-status pr-status--${STATUS_TONES[record.status] || 'gray'}`}>
            {record.status || 'Draft'}
          </span>
        </div>
      </div>

      <div className="pr-details">
        <div>
          <Detail label="Title" value={record.title} editMode={editMode}
            onChange={onRecordChange ? (val) => onRecordChange('title', val) : undefined}
            inputClassName="pr-edit-input--left" />
          <Detail label="Department" value={record.department} editMode={editMode}
            onChange={onRecordChange ? (val) => onRecordChange('department', val) : undefined}
            inputClassName="pr-edit-input--left" />
          <Detail label="Project" value={record.project} editMode={editMode}
            onChange={onRecordChange ? (val) => onRecordChange('project', val) : undefined}
            inputClassName="pr-edit-input--left" />
          <Detail label="Requester" value={record.requester} editMode={editMode}
            onChange={onRecordChange ? (val) => onRecordChange('requester', val) : undefined}
            inputClassName="pr-edit-input--left" />
          <Detail label="Buyer" value={record.buyer} editMode={editMode}
            onChange={onRecordChange ? (val) => onRecordChange('buyer', val) : undefined}
            inputClassName="pr-edit-input--left" />
          <Detail label="Priority" value={record.priority} editMode={editMode}
            onChange={onRecordChange ? (val) => onRecordChange('priority', val) : undefined}
            inputClassName="pr-edit-input--left" />
          <Detail label="PR Type" value={record.prType} editMode={editMode}
            onChange={onRecordChange ? (val) => onRecordChange('prType', val) : undefined}
            inputClassName="pr-edit-input--left" />
        </div>
        <div>
          <Detail label="Vendor" value={record.vendor} editMode={editMode}
            onChange={onRecordChange ? (val) => onRecordChange('vendor', val) : undefined}
            inputClassName="pr-edit-input--left" />
          <Detail label="Required Date" value={record.expectedDate ? formatDate(record.expectedDate) : ''} editMode={editMode}
            onChange={onRecordChange ? (val) => onRecordChange('expectedDate', val) : undefined}
            type="date" />
          <Detail label="Payment Terms" value={record.terms} editMode={editMode}
            onChange={onRecordChange ? (val) => onRecordChange('terms', val) : undefined}
            inputClassName="pr-edit-input--left" />
          <Detail label="Currency" value={record.currency} editMode={editMode}
            onChange={onRecordChange ? (val) => onRecordChange('currency', val) : undefined}
            inputClassName="pr-edit-input--left" />
          <Detail label="Created" value={record.createdAt ? formatDateTime(record.createdAt) : ''} />
          <Detail label="GST Type" value={record.gstType} editMode={editMode}
            onChange={onRecordChange ? (val) => onRecordChange('gstType', val) : undefined}
            inputClassName="pr-edit-input--left" />
        </div>
      </div>
    </header>
  );
}

export function RequisitionRunningHeader({ company, record, pageNumber, totalPages }) {
  return (
    <div className="pr-running">
      <span className="pr-running-left">
        <strong className="pr-running-company">{company.name}</strong>
        <span className="pr-dot" aria-hidden="true">·</span>
        Purchase Requisition
        <span className="pr-dot" aria-hidden="true">·</span>
        {record.prNo}
      </span>
      <span className="pr-running-right">Page {pageNumber} of {totalPages}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Line items table.                                                 */
/* ------------------------------------------------------------------ */
export function RequisitionItemsTable({
  items = [], indices = [], currency = '', totals = {}, refs, headOnly = false,
  editMode = false, onItemChange, onAddItem, onRemoveItem
}) {
  const fmt = (value) => formatAmountConverted(value, currency);

  return (
    <div className="pr-items">
      <div className="pr-section-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>Line Items</span>
        {editMode && (
          <button type="button" className="pr-item-add-btn" onClick={onAddItem}>
            <Plus style={{ width: '2.5mm', height: '2.5mm' }} /> Add Item
          </button>
        )}
      </div>
      <table className="pr-items-table">
        <thead ref={refs?.thead}>
          <tr>
            <th className="col-no">#</th>
            <th className="col-desc">Description</th>
            <th className="col-hsn">HSN</th>
            <th className="col-uom">UOM</th>
            <th className="num col-qty">Qty</th>
            <th className="num col-rate">Rate</th>
            <th className="num col-disc">Disc %</th>
            <th className="num col-gst">GST %</th>
            <th className="num col-amount">Amount</th>
            {editMode && <th className="col-actions" />}
          </tr>
        </thead>
        {!headOnly && <tbody ref={refs?.tbody}>
          {indices.length === 0 ? (
            <tr className="pr-empty-row">
              <td colSpan={editMode ? 10 : 9}>No line items</td>
            </tr>
          ) : (
            indices.map((globalIndex) => {
              const item = items[globalIndex] || {};
              const lineTotal =
                totals?.lines?.[globalIndex]?.total ??
                (Number(item.qty) || 0) * (Number(item.rate) || 0) * (1 - (Number(item.discount) || 0) / 100);
              return (
                <tr key={globalIndex}>
                  <td className="col-no">{globalIndex + 1}</td>
                  <td className="desc col-desc">
                    <EditableField
                      value={item.product}
                      editMode={editMode}
                      onChange={onItemChange ? (val) => onItemChange(globalIndex, 'product', val) : undefined}
                      className="pr-edit-input--desc pr-edit-input--left"
                    />
                  </td>
                  <td className="col-hsn">
                    <EditableField
                      value={item.hsn}
                      editMode={editMode}
                      onChange={onItemChange ? (val) => onItemChange(globalIndex, 'hsn', val) : undefined}
                    />
                  </td>
                  <td className="col-uom">
                    <EditableField
                      value={item.uom}
                      editMode={editMode}
                      onChange={onItemChange ? (val) => onItemChange(globalIndex, 'uom', val) : undefined}
                    />
                  </td>
                  <td className="num col-qty">
                    <EditableField
                      value={String(Number(item.qty) || 0)}
                      editMode={editMode}
                      onChange={onItemChange ? (val) => onItemChange(globalIndex, 'qty', val) : undefined}
                      type="number"
                      step="any"
                      min="0"
                      className="pr-edit-input-num"
                    />
                  </td>
                  <td className="num col-rate">
                    <EditableField
                      value={String(item.rate || '')}
                      editMode={editMode}
                      onChange={onItemChange ? (val) => onItemChange(globalIndex, 'rate', val) : undefined}
                      type="number"
                      step="any"
                      min="0"
                      className="pr-edit-input-num"
                    />
                  </td>
                  <td className="num col-disc">
                    <EditableField
                      value={String(Number(item.discount) || 0)}
                      editMode={editMode}
                      onChange={onItemChange ? (val) => onItemChange(globalIndex, 'discount', val) : undefined}
                      type="number"
                      step="any"
                      min="0"
                      max="100"
                      className="pr-edit-input-num"
                    />
                  </td>
                  <td className="num col-gst">
                    {editMode ? (
                      <select
                        value={String(Number(item.gstRate) || 0)}
                        onChange={(e) => onItemChange?.(globalIndex, 'gstRate', e.target.value)}
                        className="pr-edit-select pr-edit-input-num"
                      >
                        {GST_RATES.map((rate) => (
                          <option key={rate} value={rate}>{rate}%</option>
                        ))}
                      </select>
                    ) : (
                      <span>{String(Number(item.gstRate) || 0)}%</span>
                    )}
                  </td>
                  <td className="num col-amount">{fmt(lineTotal)}</td>
                  {editMode && (
                    <td className="col-actions" style={{ textAlign: 'center' }}>
                      <button type="button" className="pr-item-del-btn" onClick={() => onRemoveItem?.(globalIndex)} title="Remove item">
                        <Trash2 style={{ width: '2mm', height: '2mm' }} />
                      </button>
                    </td>
                  )}
                </tr>
              );
            }))}
          </tbody>
        }
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Notes · amount in words · financial summary · signatures.         */
/* ------------------------------------------------------------------ */
export function RequisitionDocumentBottom({
  record, totals, currency, preparedBy, checkedBy, approvedBy,
  editMode = false, onRecordChange, onTopLevelChange
}) {
  const showIgst = Number(totals.igst ?? 0) > 0;

  const summaryRows = [
    ['Subtotal', formatAmountConverted(totals.subtotal ?? 0, currency)],
    ['Discount', totals.discountAmount ? `− ${formatAmountConverted(totals.discountAmount, currency)}` : '—'],
    ['Taxable Value', formatAmountConverted(totals.taxable ?? 0, currency)],
    ...(showIgst
      ? [['IGST', formatAmountConverted(totals.igst ?? 0, currency)]]
      : [
          ['CGST', formatAmountConverted(totals.cgst ?? 0, currency)],
          ['SGST', formatAmountConverted(totals.sgst ?? 0, currency)]
        ]),
    ['Charges', formatAmountConverted(totals.charges ?? 0, currency)],
    ['Round Off', `${(totals.roundOff ?? 0) >= 0 ? '+' : '−'} ${formatAmountConverted(Math.abs(totals.roundOff ?? 0), currency)}`]
  ];

  const signatories = [
    ['Prepared By', preparedBy],
    ['Checked By', checkedBy],
    ['Approved By', approvedBy]
  ];

  return (
    <div className="pr-bottom">
      <div>
        <div className="pr-section-label">Notes</div>
        <EditableTextarea
          value={record.notes || ''}
          editMode={editMode}
          onChange={onRecordChange ? (val) => onRecordChange('notes', val) : undefined}
          className="pr-notes-text"
        />
        {record.internalNotes && (
          <div className="pr-notes-internal">
            Internal:&nbsp;
            <EditableField
              value={record.internalNotes}
              editMode={editMode}
              onChange={onRecordChange ? (val) => onRecordChange('internalNotes', val) : undefined}
            />
          </div>
        )}

        <div className="pr-section-label pr-words-label">Amount in Words</div>
        <p className="pr-words-text">{totals.inWords || 'Zero Rupees Only'}</p>
        {currency && String(currency).toUpperCase() !== 'INR' && (
          <p className="pr-words-foreign">
            {formatAmountInWords(totals.roundedTotal ?? totals.total ?? 0, currency)}
          </p>
        )}
      </div>

      <div>
        <div className="pr-section-label">Financial Summary</div>
        <div className="pr-summary">
          {summaryRows.map(([label, value]) => (
            <div className="pr-summary-row" key={label}>
              <span>{label}</span>
              <span>{value}</span>
            </div>
          ))}
          <div className="pr-summary-grand">
            <span>Grand Total</span>
            <span>{formatAmountConverted(totals.roundedTotal ?? totals.total ?? 0, currency)}</span>
          </div>
        </div>
      </div>

      <div className="pr-sign">
        {signatories.map(([role, name]) => (
          <div className="pr-sign-item" key={role}>
            <div className="pr-sign-role">{role}</div>
            <div className="pr-sign-line">
              <p className="pr-sign-name">
                <EditableField
                  value={name}
                  editMode={editMode}
                  onChange={onTopLevelChange ? (val) => {
                    const fieldMap = { 'Prepared By': 'preparedBy', 'Checked By': 'checkedBy', 'Approved By': 'approvedBy' };
                    onTopLevelChange(fieldMap[role], val);
                  } : undefined}
                />
              </p>
              <p className="pr-sign-sub">Signature</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function RequisitionSheetFooter({ generatedAt, pageNumber, totalPages }) {
  return (
    <footer className="pr-sheet-foot">
      <span>Generated on {formatDateTime(generatedAt)}</span>
      <span>Page {pageNumber} of {totalPages}</span>
    </footer>
  );
}

/* ------------------------------------------------------------------ */
/*  One full A4 sheet.                                                */
/* ------------------------------------------------------------------ */
export function RequisitionPrintSheet({
  page, pageNumber, totalPages, data, sheetRef,
  editMode = false,
  onCompanyChange, onRecordChange, onItemChange,
  onAddItem, onRemoveItem, onTopLevelChange
}) {
  const { record, company, preparedBy, checkedBy, approvedBy, generatedAt } = data;
  const totals = record.totals || {};

  return (
    <section className="pr-sheet" ref={sheetRef}>
      <style>{PRINT_SHEET_STYLES}</style>
      <div className="pr-sheet-inner">
        {pageNumber === 1 ? (
          <RequisitionPrintHeader
            company={company}
            record={record}
            editMode={editMode}
            onCompanyChange={onCompanyChange}
            onRecordChange={onRecordChange}
          />
        ) : (
          <RequisitionRunningHeader company={company} record={record} pageNumber={pageNumber} totalPages={totalPages} />
        )}

        {page.rows.length > 0 && (
          <RequisitionItemsTable
            items={record.items || []}
            indices={page.rows}
            currency={record.currency}
            totals={totals}
            editMode={editMode}
            onItemChange={onItemChange}
            onAddItem={onAddItem}
            onRemoveItem={onRemoveItem}
          />
        )}

        {page.bottom && (
          <RequisitionDocumentBottom
            record={record}
            totals={totals}
            currency={record.currency}
            preparedBy={preparedBy}
            checkedBy={checkedBy}
            approvedBy={approvedBy}
            editMode={editMode}
            onRecordChange={onRecordChange}
            onTopLevelChange={onTopLevelChange}
          />
        )}
      </div>
      <RequisitionSheetFooter generatedAt={generatedAt} pageNumber={pageNumber} totalPages={totalPages} />
    </section>
  );
}
