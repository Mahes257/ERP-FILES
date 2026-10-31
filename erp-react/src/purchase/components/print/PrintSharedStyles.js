/**
 * purchase/components/print/PrintSharedStyles.js
 * ------------------------------------------------------------------
 * THE single shared stylesheet for ALL Purchase print documents.
 *
 * Extracted from the RFQ master template. Every print preview page
 * injects this CSS via <style> tags inside each sheet node so the
 * PDF rasteriser (which clones sheet nodes) gets identical styling.
 *
 * This is the SINGLE SOURCE OF TRUTH for:
 *   - A4 page dimensions
 *   - Company header layout
 *   - Detail grid
 *   - Items table
 *   - Summary/totals
 *   - Signatures
 *   - Sheet footer
 *   - Print chrome (toolbar, sheet stack, measurement area)
 *   - @media print rules
 * ------------------------------------------------------------------
 */

export const PRINT_SHARED_STYLES = `
/* ============ Purchase Print Document — A4 shared stylesheet ============ */
/* Palette: brand #0B4A3D · ink #0f172a · slate #334155/#64748b/#94a3b8 */
/* · lines #e2e8f0/#cbd5e1 · soft #f8fafc. All plain hex for PDF export. */

* { box-sizing: border-box; margin: 0; padding: 0; }

/* ---- Print-flow pagination ---- */
.pr-sheet { page-break-before: auto; page-break-after: auto; break-before: auto; break-after: auto; }
.pr-sheet thead { display: table-header-group; }
.pr-sheet tfoot { display: table-footer-group; }
.pr-sheet tr,
.pr-sheet td { page-break-inside: avoid; break-inside: avoid; }
.pr-sheet .pr-bottom,
.pr-sheet .pr-summary,
.pr-sheet .pr-sign,
.pr-sheet .pr-sign-item { page-break-inside: avoid; break-inside: avoid; }

/* ---- A4 sheet ---- */
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
.pr-doc-number { padding-top: 1.5mm; font-size: 13px; font-weight: 800; color: #0B4A3D; }
.pr-status {
  display: inline-block; margin-top: 2.5mm; padding: 1.4mm 3.5mm; border-radius: 10mm;
  font-size: 7.5px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase;
}
.pr-status--gray    { background: #f3f4f6; color: #6b7280; }
.pr-status--amber   { background: #fffbeb; color: #d97706; }
.pr-status--green   { background: #f0fdf4; color: #16a34a; }
.pr-status--red     { background: #fef2f2; color: #dc2626; }
.pr-status--cyan    { background: #ecfeff; color: #0891b2; }
.pr-status--purple  { background: #faf5ff; color: #7c3aed; }
.pr-status--indigo  { background: #eef2ff; color: #4f46e5; }
.pr-status--blue    { background: #eff6ff; color: #2563eb; }
.pr-status--teal    { background: #f0fdfa; color: #0d9488; }

/* ---- Details grid ---- */
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

/* ---- Blocks grid (vendors + commercial terms) ---- */
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

/* ---- Signatures ---- */
.pr-sign { grid-column: 1 / -1; display: grid; grid-template-columns: repeat(2, 1fr); gap: 12mm; margin-top: 8mm; }
.pr-sign--3col { grid-template-columns: repeat(3, 1fr); }
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

/* Hidden measurement area */
.pr-measure {
  position: fixed; left: -10000px; top: 0; width: 190mm;
  visibility: hidden; pointer-events: none;
}

/* ---- Comparison table (for Quotation Comparison) ---- */
.pr-compare-table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 8px; }
.pr-compare-table thead th {
  background: #0B4A3D; color: #ffffff;
  font-size: 6.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px;
  text-align: center; padding: 2mm 1.5mm;
}
.pr-compare-table thead th:first-child { text-align: left; }
.pr-compare-table tbody td {
  padding: 1.8mm 1.5mm; border-bottom: 1px solid #e2e8f0;
  text-align: center; font-size: 8px; color: #334155;
}
.pr-compare-table tbody td:first-child { text-align: left; font-weight: 600; color: #0f172a; }
.pr-compare-table tbody tr:nth-child(even) td { background: #f8fafc; }
.pr-compare-table .best { background: #f0fdf4 !important; color: #16a34a !important; font-weight: 700; }

/* ---- Info box (for notes, terms, conditions) ---- */
.pr-info-box {
  border: 1px solid #e2e8f0; border-radius: 1.5mm; padding: 3mm;
  background: #f8fafc; font-size: 8.5px; color: #334155;
  line-height: 1.5; white-space: pre-wrap; overflow-wrap: anywhere;
}

@media (max-width: 720px) {
  .pr-print-page { padding: 8px 12px 0; }
  .pr-details { grid-template-columns: 1fr; }
  .pr-blocks { grid-template-columns: 1fr; }
  .pr-bottom { grid-template-columns: 1fr; }
  .pr-sign { grid-template-columns: 1fr; gap: 8mm; }
  .pr-sign--3col { grid-template-columns: 1fr; }
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
/*  Status pill tones — shared across all document types.              */
/* ------------------------------------------------------------------ */
export const PRINT_STATUS_TONES = {
  Draft: 'gray',
  'Pending Approval': 'amber',
  Submitted: 'amber',
  Approved: 'green',
  Rejected: 'red',
  Returned: 'amber',
  Sent: 'blue',
  'Quotation Received': 'blue',
  Evaluation: 'amber',
  Awarded: 'green',
  'PO Raised': 'green',
  Converted: 'teal',
  'Converted to RFQ': 'teal',
  Completed: 'green',
  Paid: 'green',
  Cancelled: 'red',
  Closed: 'gray',
  Open: 'blue',
  Overdue: 'red',
  'In Progress': 'blue',
  Agreed: 'green',
  'Not Started': 'gray',
  'Pending Generation': 'amber',
  Generated: 'green',
  Final: 'green',
};
