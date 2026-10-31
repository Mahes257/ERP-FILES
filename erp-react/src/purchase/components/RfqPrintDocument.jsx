/**
 * purchase/components/RfqPrintDocument.jsx
 * ------------------------------------------------------------------
 * THE single reusable RFQ document template.
 *
 * The SAME DOM rendered here feeds all three outputs:
 *   1. On-screen A4 print preview (pages/rfq/RfqPrint)
 *   2. Browser Print (window.print() — @media print rules below)
 *   3. Downloaded PDF (each `.pr-sheet` node is rasterised via SVG
 *      <foreignObject> + jsPDF — see utils/export.js)
 *
 * Pagination is measurement-driven (mirrors the requisition flow):
 * the preview page measures the real rendered heights and splits line
 * items across A4 pages so rows are never cut in half and the table
 * header repeats on every page.
 *
 * The stylesheet is intentionally self-contained — plain CSS, hex
 * colours, no Tailwind utilities — so the exported PDF carries exactly
 * the same styles regardless of theme or dark mode.
 * ------------------------------------------------------------------
 */
import { formatAmount, formatAmountInWords, numberToWords, round2 } from '../utils/purchase';
import { formatDate, formatDateTime } from '../utils/helpers';

/* ------------------------------------------------------------------ */
/*  RFQ_PRINT_SHEET_STYLES — the entire document + preview chrome.     */
/* ------------------------------------------------------------------ */
export const RFQ_PRINT_SHEET_STYLES = `
/* ============ RFQ — A4 print document ============
   Palette: brand #0B4A3D · ink #0f172a · slate #334155/#64748b/#94a3b8
   · lines #e2e8f0/#cbd5e1 · soft #f8fafc. All plain hex for PDF.  */

* { box-sizing: border-box; margin: 0; padding: 0; }

/* ---- Print-flow pagination (the browser breaks exactly here) ---- */
.pr-sheet { page-break-before: auto; page-break-after: auto; break-before: auto; break-after: auto; }
.pr-sheet thead { display: table-header-group; }
.pr-sheet tr,
.pr-sheet td { page-break-inside: avoid; break-inside: avoid; }
.pr-sheet .pr-bottom,
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

/* ---- Company header (page 1) ---- */
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
.pr-rfq-no { padding-top: 1.5mm; font-size: 13px; font-weight: 800; color: #0B4A3D; }
.pr-status {
  display: inline-block; margin-top: 2.5mm; padding: 1.4mm 3.5mm; border-radius: 10mm;
  font-size: 7.5px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase;
}
.pr-status--gray  { background: #f3f4f6; color: #6b7280; }
.pr-status--amber { background: #fffbeb; color: #d97706; }
.pr-status--green { background: #f0fdf4; color: #16a34a; }
.pr-status--red   { background: #fef2f2; color: #dc2626; }
.pr-status--cyan  { background: #ecfeff; color: #0891b2; }
.pr-status--purple { background: #faf5ff; color: #7c3aed; }
.pr-status--indigo { background: #eef2ff; color: #4f46e5; }
.pr-status--blue  { background: #eff6ff; color: #2563eb; }

/* ---- Details grid (page 1) ---- */
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

/* ---- Section label ---- */
.pr-section-label {
  font-size: 7px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.7px; color: #64748b; padding-bottom: 3mm;
}

/* ---- Invited vendors + commercial terms (page 1) ---- */
.pr-blocks { display: grid; grid-template-columns: 1fr 1fr; gap: 6mm 10mm; padding-top: 5mm; }
.pr-vendor-pill {
  display: flex; align-items: center; gap: 2.5mm;
  padding: 2.2mm 3mm; margin-bottom: 2mm;
  border: 1px solid #e2e8f0; border-radius: 1.5mm; background: #f8fafc;
  font-size: 8.5px; font-weight: 600; color: #0f172a;
}
.pr-vendor-pill::before {
  content: ""; width: 2mm; height: 2mm; border-radius: 50%;
  background: #0B4A3D; flex-shrink: 0;
}
.pr-term-row {
  display: flex; justify-content: space-between; gap: 4mm;
  padding: 1.6mm 0; border-bottom: 1px dashed #e2e8f0;
  font-size: 8.5px; color: #475569;
}
.pr-term-row span:last-child { font-weight: 700; color: #334155; text-align: right; }

/* ---- Items table ---- */
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
.pr-items-table .col-desc   { width: 48%; }
.pr-items-table .col-hsn    { width: 9%; }
.pr-items-table .col-uom    { width: 9%; }
.pr-items-table .col-qty    { width: 10%; }
.pr-items-table .col-rate   { width: 10%; }
.pr-items-table .col-amount { width: 10%; }
.pr-empty-row td { text-align: center; font-style: italic; color: #94a3b8; padding: 6mm 2mm !important; }

/* ---- Running header (pages 2+) ---- */
.pr-running {
  display: flex; justify-content: space-between; align-items: baseline; gap: 4mm;
  padding-bottom: 9mm; border-bottom: 1px solid #cbd5e1;
  font-size: 8.5px; color: #64748b;
}
.pr-running-left { font-weight: 700; color: #334155; }
.pr-running-company { color: #0B4A3D; font-weight: 800; }
.pr-running-right { font-weight: 600; }

/* ---- Bottom section: notes · summary · signatures ---- */
.pr-bottom { display: grid; grid-template-columns: 1fr 1fr; gap: 6mm 10mm; padding-top: 7mm; page-break-inside: avoid; break-inside: avoid; }
.pr-totals { grid-column: 1 / -1; padding-top: 3mm; break-inside: avoid; page-break-inside: avoid; }
.pr-notes-text { margin: 0; font-size: 9px; color: #334155; line-height: 1.55; white-space: pre-wrap; overflow-wrap: anywhere; word-break: break-word; }
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

/* ---- Signatures ---- */
.pr-sign { grid-column: 1 / -1; display: grid; grid-template-columns: repeat(2, 1fr); gap: 12mm; margin-top: 8mm; }
.pr-sign-item { break-inside: avoid; page-break-inside: avoid; }
.pr-sign-role {
  font-size: 7px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.6px; color: #64748b; margin-bottom: 9mm;
}
.pr-sign-line { border-top: 1px solid #94a3b8; padding-top: 1.5mm; }
.pr-sign-name { margin: 0; font-size: 10px; font-weight: 700; color: #0f172a; }
.pr-sign-sub { margin: 0.5mm 0 0; font-size: 7.5px; color: #94a3b8; }

/* ---- Sheet footer (every page) ---- */
.pr-sheet-foot {
  border-top: 1px solid #e2e8f0;
  margin: 0 10mm; padding: 2.5mm 0 8mm;
  display: flex; justify-content: space-between; gap: 4mm;
  font-size: 7.5px; color: #94a3b8;
}

/* ============ Preview page chrome (screen only) ============ */
.pr-print-page { padding: 8px 24px 0; }
.pr-sheet-stack { display: flex; flex-direction: column; align-items: center; gap: 32px; padding: 4px 0 48px; }
.pr-sheet-card {
  background: #ffffff; border: 1px solid #e2e8f0; border-radius: 4px;
  box-shadow: 0 12px 32px rgba(15, 23, 42, 0.10); max-width: 100%;
}
.pr-sheet-loading { display: flex; align-items: center; justify-content: center; gap: 10px; padding: 64px 0; color: #64748b; font-size: 12px; font-weight: 600; }

/* Hidden measurement area (rendered at the sheet content width so the
   measured heights match the real pages exactly — sheet 210mm − 2×10mm
   padding = 190mm content width). */
.pr-measure {
  position: fixed; left: -10000px; top: 0; width: 190mm;
  visibility: hidden; pointer-events: none;
}

@media (max-width: 720px) {
  .pr-print-page { padding: 8px 12px 0; }
  .pr-details { grid-template-columns: 1fr; }
  .pr-blocks { grid-template-columns: 1fr; }
  .pr-bottom { grid-template-columns: 1fr; }
  .pr-sign { grid-template-columns: 1fr; gap: 8mm; }
}

/* ============ Browser print ============ */
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
/*  Status pill tones (mirror the app's status palette).              */
/* ------------------------------------------------------------------ */
/* Status pill tones mirror the app's shared semantic palette (see
   utils/statusTone): orange for pending, blue for info/in-progress,
   green for success, gray for draft/closed, red for cancelled. */
const STATUS_TONES = {
  Draft: 'gray',
  'Pending Approval': 'amber',
  Approved: 'green',
  Sent: 'blue',
  'Quotation Received': 'blue',
  Evaluation: 'amber',
  Awarded: 'green',
  Closed: 'gray',
  Cancelled: 'red'
};

/* ------------------------------------------------------------------ */
/*  Small presentational pieces (also used by the measure stage).      */
/* ------------------------------------------------------------------ */
function Detail({ label, value }) {
  return (
    <div className="pr-detail-row">
      <span className="pr-detail-label">{label}</span>
      <span className="pr-detail-value">{value || '—'}</span>
    </div>
  );
}

function companyInitials(name = '') {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0])
      .join('')
      .toUpperCase() || 'CO'
  );
}

/** Estimated value of the RFQ line items (budget the vendors quote against). */
function rfqEstimatedValue(record) {
  return (record.items || []).reduce(
    (sum, item) => sum + (Number(item.qty) || 0) * (Number(item.rate ?? item.expectedRate) || 0),
    0
  );
}

/** Computed print totals — subtotal, tax, other charges and grand total.
 *  Uses `record.totals` when present (set by RfqPrint's normaliser), else
 *  derives them from the items and commercial terms. */
function rfqDocumentTotals(record = {}) {
  if (record.totals && Number.isFinite(record.totals.subtotal)) return record.totals;
  const subtotal = round2(rfqEstimatedValue(record));
  const taxRate = Number((record.commercialTerms || {}).taxRate) || 0;
  const tax = round2(subtotal * (taxRate / 100));
  const otherCharges = round2(Number(record.otherCharges ?? record.charges) || 0);
  return { subtotal, tax, taxRate, otherCharges, grandTotal: round2(subtotal + tax + otherCharges) };
}

/** Company letterhead + document title block (page 1 top). */
export function RfqPrintHeader({ company, record }) {
  const terms = record.commercialTerms || {};
  return (
    <header>
      <div className="pr-company">
        <div className="pr-company-left">
          <div className="pr-logo" aria-hidden="true">{companyInitials(company.name)}</div>
          <div>
            <h1 className="pr-company-name">{company.name}</h1>
            <p className="pr-company-address">{company.address}</p>
            <p className="pr-company-contact">
              <span>GSTIN {company.gstin}</span>
              <span className="pr-dot">·</span>
              <span>{company.phone}</span>
              <span className="pr-dot">·</span>
              <span>{company.email}</span>
            </p>
          </div>
        </div>
        <div className="pr-company-right">
          <h2 className="pr-doc-title">Request for Quotation</h2>
          <p className="pr-rfq-no">{record.rfqNo}</p>
          <span className={`pr-status pr-status--${STATUS_TONES[record.status] || 'gray'}`}>{record.status}</span>
        </div>
      </div>

      <div className="pr-details">
        <div>
          <Detail label="Title" value={record.title} />
          <Detail label="Reference PR" value={record.reference} />
          <Detail label="Category" value={record.category} />
          <Detail label="Department" value={record.department} />
          <Detail label="Requester" value={record.requester} />
          <Detail label="Buyer" value={record.buyer} />
        </div>
        <div>
          <Detail label="Priority" value={record.priority} />
          <Detail label="Validity" value={record.validity ? `${record.validity} days` : ''} />
          <Detail label="Due Date" value={record.dueDate ? formatDate(record.dueDate) : ''} />
          <Detail label="Currency" value={record.currency} />
          <Detail label="Incoterm" value={record.incoterm} />
          <Detail label="Delivery Address" value={record.deliveryAddress} />
        </div>
      </div>

      <div className="pr-blocks">
        <div>
          <div className="pr-section-label">Invited Vendors ({record.vendorCount ?? (record.vendors || []).length})</div>
          {(record.vendors || []).map((vendor) => (
            <div className="pr-vendor-pill" key={vendor}>{vendor}</div>
          ))}
          {(record.vendors || []).length === 0 && <p className="pr-notes-text">No vendors invited.</p>}
        </div>
        <div>
          <div className="pr-section-label">Commercial Terms</div>
          <div className="pr-term-row"><span>Payment Terms</span><span>{terms.paymentTerms || '—'}</span></div>
          <div className="pr-term-row"><span>Delivery Terms</span><span>{terms.deliveryTerms || '—'}</span></div>
          <div className="pr-term-row"><span>Warranty</span><span>{terms.warranty || '—'}</span></div>
          <div className="pr-term-row"><span>Tax Rate</span><span>{terms.taxRate != null ? `${terms.taxRate}%` : '—'}</span></div>
          <div className="pr-term-row"><span>Freight</span><span>{terms.freight || '—'}</span></div>
          <div className="pr-term-row"><span>Insurance</span><span>{terms.insurance || '—'}</span></div>
        </div>
      </div>
    </header>
  );
}

/** Compact continuation header for pages 2+. */
export function RfqRunningHeader({ company, record, pageNumber, totalPages }) {
  return (
    <div className="pr-running">
      <span className="pr-running-left">
        <strong className="pr-running-company">{company.name}</strong>
        <span className="pr-dot" aria-hidden="true">·</span>
        Request for Quotation
        <span className="pr-dot" aria-hidden="true">·</span>
        {record.rfqNo}
      </span>
      <span className="pr-running-right">Page {pageNumber} of {totalPages}</span>
    </div>
  );
}

/**
 * Line items table. `indices` are GLOBAL row indexes into `items` so the
 * numbering stays correct when the table is split across pages. `refs`
 * (optional) exposes the thead/tbody for measurement.
 */
export function RfqItemsTable({ items = [], indices = [], currency = '', refs, headOnly = false }) {
  return (
    <div className="pr-items">
      <div className="pr-section-label">Required Items</div>
      <table className="pr-items-table">
        <thead ref={refs?.thead}>
          <tr>
            <th className="col-no">#</th>
            <th className="col-desc">Item Description</th>
            <th className="col-hsn">HSN</th>
            <th className="col-uom">UOM</th>
            <th className="num col-qty">Qty</th>
            <th className="num col-rate">Est. Rate</th>
            <th className="num col-amount">Est. Amount</th>
          </tr>
        </thead>
        {!headOnly && (
          <tbody ref={refs?.tbody}>
            {indices.length === 0 ? (
              <tr className="pr-empty-row">
                <td colSpan={7}>No line items</td>
              </tr>
            ) : (
              indices.map((globalIndex) => {
                const item = items[globalIndex] || {};
                const rate = Number(item.rate ?? item.expectedRate) || 0;
                const qty = Number(item.qty) || 0;
                return (
                  <tr key={globalIndex}>
                    <td className="col-no">{globalIndex + 1}</td>
                    <td className="desc col-desc">
                      {item.product || '—'}
                      {item.specification ? <span style={{ display: 'block', fontSize: '7px', color: '#94a3b8' }}>{item.specification}</span> : null}
                    </td>
                    <td className="col-hsn">{item.hsn || '—'}</td>
                    <td className="col-uom">{item.uom || '—'}</td>
                    <td className="num col-qty">{qty}</td>
                    <td className="num col-rate">{formatAmount(rate, currency)}</td>
                    <td className="num col-amount">{formatAmount(qty * rate, currency)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        )}
      </table>
    </div>
  );
}

/** Notes · amount in words · estimated summary · totals · signatures. */
export function RfqDocumentBottom({ record, currency, preparedBy, approvedBy }) {
  const estimated = rfqEstimatedValue(record);
  const totals = rfqDocumentTotals(record);
  const inWords = numberToWords(estimated);
  const signatories = [
    ['Prepared By', preparedBy],
    ['Approved By', approvedBy]
  ];

  return (
    <div className="pr-bottom">
      <div>
        <div className="pr-section-label">Description &amp; Notes</div>
        <p className="pr-notes-text">{record.description || record.notes || 'No additional notes.'}</p>

        <div className="pr-section-label pr-words-label">Estimated Amount in Words</div>
        <p className="pr-words-text">{inWords}</p>
        {currency && String(currency).toUpperCase() !== 'INR' && (
          <p className="pr-words-foreign">{formatAmountInWords(estimated, currency)}</p>
        )}
      </div>

      <div>
        <div className="pr-section-label">Estimated Value</div>
        <div className="pr-summary">
          <div className="pr-summary-row">
            <span>Line Items</span>
            <span>{(record.items || []).length}</span>
          </div>
          <div className="pr-summary-row">
            <span>Invited Vendors</span>
            <span>{record.vendorCount ?? (record.vendors || []).length}</span>
          </div>
          <div className="pr-summary-row">
            <span>Validity</span>
            <span>{record.validity ? `${record.validity} days` : '—'}</span>
          </div>
          <div className="pr-summary-grand">
            <span>Estimated Total</span>
            <span>{formatAmount(estimated, currency)}</span>
          </div>
        </div>
      </div>

      <div className="pr-totals">
        <div className="pr-section-label">Totals</div>
        <div className="pr-summary">
          <div className="pr-summary-row">
            <span>Subtotal</span>
            <span>{formatAmount(totals.subtotal, currency)}</span>
          </div>
          <div className="pr-summary-row">
            <span>Tax ({totals.taxRate}%)</span>
            <span>{formatAmount(totals.tax, currency)}</span>
          </div>
          <div className="pr-summary-row">
            <span>Other Charges</span>
            <span>{formatAmount(totals.otherCharges, currency)}</span>
          </div>
          <div className="pr-summary-grand">
            <span>Grand Total</span>
            <span>{formatAmount(totals.grandTotal, currency)}</span>
          </div>
        </div>
      </div>

      <div className="pr-sign">
        {signatories.map(([role, name]) => (
          <div className="pr-sign-item" key={role}>
            <div className="pr-sign-role">{role}</div>
            <div className="pr-sign-line">
              <p className="pr-sign-name">{name || '—'}</p>
              <p className="pr-sign-sub">Signature</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Running footer with generated date + page number (every sheet). */
export function RfqSheetFooter({ generatedAt, pageNumber, totalPages }) {
  return (
    <footer className="pr-sheet-foot">
      <span>Generated on {formatDateTime(generatedAt)}</span>
      <span>Page {pageNumber} of {totalPages}</span>
    </footer>
  );
}

/**
 * One full A4 sheet. `page` comes from paginateRfqPrint():
 *   { rows: [globalItemIndex...], bottom: boolean }
 */
export function RfqPrintSheet({ page, pageNumber, totalPages, data, sheetRef }) {
  const { record, company, preparedBy, approvedBy, generatedAt } = data;
  return (
    <section className="pr-sheet" ref={sheetRef}>
      <style>{RFQ_PRINT_SHEET_STYLES}</style>
      <div className="pr-sheet-inner">
        {pageNumber === 1 ? (
          <RfqPrintHeader company={company} record={record} />
        ) : (
          <RfqRunningHeader company={company} record={record} pageNumber={pageNumber} totalPages={totalPages} />
        )}

        {page.rows.length > 0 && (
          <RfqItemsTable items={record.items || []} indices={page.rows} currency={record.currency} />
        )}

        {page.bottom && (
          <RfqDocumentBottom
            record={record}
            currency={record.currency}
            preparedBy={preparedBy}
            approvedBy={approvedBy}
          />
        )}
      </div>
      <RfqSheetFooter generatedAt={generatedAt} pageNumber={pageNumber} totalPages={totalPages} />
    </section>
  );
}
