import { cprDocument } from './cprHelpers';
import { downloadBlob, formatDate, formatDateTime, formatINR, todayISO } from './leadHelpers';
import { fitTableColumns, pdfSafe } from './pdfText';
import { VH_LETTERHEAD_ASSET } from '../components/SalesDesign/Letterhead';

// Returns the display value for a standard CPR item column given an item row.
function stdCellValue(it, col) {
  switch (col.id) {
    case 'drawingNo': return it.drawingNo || '—';
    case 'description': return it.description || '—';
    case 'specification': return it.specification || '—';
    case 'qty': return String(it.qty ?? '—');
    case 'unit': return it.unit || '—';
    case 'estimatedCost': return formatINR(Number(it.estimatedCost) || 0);
    case 'remarks': return it.remarks || '—';
    default: return '—';
  }
}

// Returns the numeric value used for computing the row total.
function rowTotalValue(it) {
  return (Number(it.qty) || 0) * (Number(it.estimatedCost) || 0);
}

export const CPR_EXPORT_COLUMNS = [
  { key: 'prNo', label: 'CPR No' },
  { key: 'leadNo', label: 'Lead No' },
  { key: 'client', label: 'Client' },
  { key: 'company', label: 'Company' },
  { key: 'description', label: 'Description' },
  { key: 'project', label: 'Project' },
  { key: 'department', label: 'Department' },
  { key: 'requestedBy', label: 'Requested By' },
  { key: 'priority', label: 'Priority' },
  { key: 'costWorkout', label: 'Cost Workout' },
  { key: 'profitPercent', label: 'Profit %' },
  { key: 'status', label: 'Status' },
  { key: 'approvalStatus', label: 'Approval' },
  { key: 'createdAt', label: 'Created Date' },
  { key: 'grandTotal', label: 'Total Amount' },
  { key: 'convertedToQtn', label: 'Quotation' }
];

export function cprCellValue(cpr, key) {
  switch (key) {
    case 'client':
      return cpr.client || cpr.clientName || '';
    case 'costWorkout':
      return cpr.costWorkout != null ? formatINR(cpr.costWorkout) : '';
    case 'profitPercent':
      return cpr.profitPercent != null ? `${cpr.profitPercent}%` : '';
    case 'status':
      return String(cpr.status || 'draft').replace(/(^|\s)\S/g, (c) => c.toUpperCase());
    case 'approvalStatus':
      return cpr.approvalStatus || '';
    case 'createdAt':
      return formatDate(cpr.createdAt || cpr.prDate);
    case 'grandTotal':
      return cpr.grandTotal != null ? formatINR(cpr.grandTotal) : '';
    default:
      return cpr[key] != null ? String(cpr[key]) : '';
  }
}

function escapeCSV(value) {
  const str = value == null ? '' : String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportCprsCsv(cprs, filename) {
  const header = CPR_EXPORT_COLUMNS.map((c) => c.label);
  const body = cprs.map((cpr) => CPR_EXPORT_COLUMNS.map((c) => escapeCSV(cprCellValue(cpr, c.key))));
  const csv = [header, ...body].map((row) => row.join(',')).join('\r\n');
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, `${filename}.csv`);
}

// Mirrors the original ERP's bulkExport (pr-module.js): selected rows only,
// exact 7-column order, filename 'CPR_Bulk_YYYY-MM-DD.csv'.
export function exportCprsBulkCsv(selected, filename) {
  const headers = ['CPR No', 'Date', 'Client', 'Lead No', 'Department', 'Status', 'Amount'];
  const rows = selected.map((pr) => [
    escapeCSV(pr.prNo || pr.id || ''),
    escapeCSV(String(pr.createdAt || pr.prDate || '').substring(0, 10)),
    escapeCSV(pr.client || pr.clientName || ''),
    escapeCSV(pr.leadNo || ''),
    escapeCSV(pr.department || ''),
    escapeCSV(pr.status || ''),
    escapeCSV(pr.grandTotal || pr.subtotal || 0)
  ]);
  const csv = [headers, ...rows].map((row) => row.join(',')).join('\r\n');
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, `${filename}.csv`);
}

// Mirrors the original ERP's cwBulkExport (cost-workout-list.html): selected
// rows only, filename 'CostWorkout_Bulk_YYYY-MM-DD.csv'. The CW number is an
// internal identity, so it is not exported as a column.
export function exportCwsBulkCsv(selected, filename) {
  const headers = ['CPR No', 'Customer', 'Company', 'Description', 'Prepared By', 'Total Cost', 'Profit %', 'Selling Price', 'Status'];
  const rows = selected.map((cw) => {
    const firstItem = cw.items && cw.items[0] ? cw.items[0] : null;
    const desc = firstItem ? firstItem.description || '' : '';
    return [
      escapeCSV(cw.cprRef || ''),
      escapeCSV(cw.customerName || ''),
      escapeCSV(cw.companyName || ''),
      escapeCSV(desc),
      escapeCSV(cw.preparedBy || ''),
      escapeCSV(cw.subtotal || 0),
      escapeCSV(cw.profitPct != null ? `${cw.profitPct}%` : ''),
      escapeCSV(cw.sellingPrice || 0),
      escapeCSV(cw.status || '')
    ];
  });
  const csv = [headers, ...rows].map((row) => row.join(',')).join('\r\n');
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, `${filename}.csv`);
}

export async function exportCprsExcel(cprs, filename) {
  const XLSX = await import('xlsx');
  const header = CPR_EXPORT_COLUMNS.map((c) => c.label);
  const body = cprs.map((cpr) => CPR_EXPORT_COLUMNS.map((c) => cprCellValue(cpr, c.key)));
  const worksheet = XLSX.utils.aoa_to_sheet([header, ...body]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'CPRs');
  XLSX.writeFile(workbook, `${filename}.xlsx`);
}

export async function exportCprsPdf(cprs, filename) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  doc.setFontSize(16);
  doc.setTextColor(3, 47, 37);
  doc.text('CPR Report', 40, 40);
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(`Generated on ${formatDate(todayISO())} - ${cprs.length} records`, 40, 55);

  const columns = CPR_EXPORT_COLUMNS.map((c) => ({ header: c.label, dataKey: c.key }));
  // pdfSafe: the ₹ sign is outside the built-in font's encoding — jsPDF used to
  // draw every character of such a cell separately (spaced-out amounts).
  const body = cprs.map((cpr) => {
    const row = {};
    CPR_EXPORT_COLUMNS.forEach((c) => {
      row[c.key] = pdfSafe(cprCellValue(cpr, c.key));
    });
    return row;
  });
  const moneyColumns = {
    // 'wrap' sizes the column to its content, so an amount never breaks into
    // "Rs" on one line and the digits on the next.
    costWorkout: { halign: 'right', cellWidth: 'wrap' },
    profitPercent: { halign: 'right', cellWidth: 'wrap' },
    grandTotal: { halign: 'right', cellWidth: 'wrap' }
  };

  autoTable(doc, {
    startY: 70,
    columns,
    body,
    styles: { fontSize: 8, cellPadding: 4, textColor: [30, 41, 59] },
    headStyles: { fillColor: [3, 47, 37], textColor: 255, fontStyle: 'bold', fontSize: 8 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    // Money / percentage values right-align under their own headers.
    columnStyles: moneyColumns,
    didParseCell: (data) => {
      if (data.section === 'head' && moneyColumns[data.column.dataKey]) {
        data.cell.styles.halign = 'right';
      }
    },
    margin: { top: 40, bottom: 30 }
  });

  doc.save(`${filename}.pdf`);
}

export function printCprs(cprs) {
  const header = CPR_EXPORT_COLUMNS.map((c) => `<th>${c.label}</th>`).join('');
  const body = cprs
    .map((cpr) => `<tr>${CPR_EXPORT_COLUMNS.map((c) => `<td>${cprCellValue(cpr, c.key)}</td>`).join('')}</tr>`)
    .join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>CPR Report</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #1e293b; margin: 24px; }
  h1 { color: #032f25; font-size: 20px; margin: 0 0 4px; }
  p.meta { color: #6B7280; font-size: 12px; margin: 0 0 16px; }
  table { width: 100%; border-collapse: collapse; font-size: 10px; }
  thead th { background: #0B4A3D; color: #F3F4F6; text-align: left; padding: 7px; text-transform: uppercase; font-size: 9px; letter-spacing: .04em; }
  tbody td { border-bottom: 1px solid #e2e8f0; padding: 6px 7px; }
  tbody tr:nth-child(even) { background: #f8fafc; }
  @media print { body { margin: 8mm; } thead { display: table-header-group; } }
</style>
</head>
<body>
<h1>CPR Report</h1>
<p class="meta">Generated on ${formatDate(todayISO())} - ${cprs.length} records</p>
<table><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table>
<script>window.onload = function () { window.print(); };</script>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=1200,height=800');
  if (!win) return;
  win.document.open();
  win.document.write(html);
  win.document.close();
}

// ===== Cost Workout export helpers (matching the original ERP export layout) =====

export const CW_EXPORT_COLUMNS = [
  { key: 'cprRef', label: 'CPR No' },
  { key: 'customerName', label: 'Customer' },
  { key: 'company', label: 'Company' },
  { key: 'description', label: 'Description' },
  { key: 'preparedBy', label: 'Prepared By' },
  { key: 'subtotal', label: 'Cost Amount' },
  { key: 'profitPct', label: 'Profit %' },
  { key: 'sellingPrice', label: 'Selling Price' },
  { key: 'status', label: 'Status' },
  { key: 'createdAt', label: 'Created Date' }
];

export function cwCellValue(cw, key) {
  switch (key) {
    case 'description':
      return Array.isArray(cw.items) && cw.items[0] ? cw.items[0].description || '' : '';
    case 'subtotal':
      return cw.subtotal != null ? formatINR(cw.subtotal) : '';
    case 'profitPct':
      return cw.profitPct != null ? `${cw.profitPct}%` : '';
    case 'sellingPrice':
      return cw.sellingPrice != null ? formatINR(cw.sellingPrice) : '';
    case 'status':
      return cw.status || '';
    case 'createdAt':
      return formatDate(cw.createdAt || cw.cwDate);
    default:
      return cw[key] != null ? String(cw[key]) : '';
  }
}

export function exportCwsCsv(cws, filename) {
  const header = CW_EXPORT_COLUMNS.map((c) => c.label);
  const body = cws.map((cw) => CW_EXPORT_COLUMNS.map((c) => escapeCSV(cwCellValue(cw, c.key))));
  const csv = [header, ...body].map((row) => row.join(',')).join('\r\n');
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, `${filename}.csv`);
}

export async function exportCwsExcel(cws, filename) {
  const XLSX = await import('xlsx');
  const header = CW_EXPORT_COLUMNS.map((c) => c.label);
  const body = cws.map((cw) => CW_EXPORT_COLUMNS.map((c) => cwCellValue(cw, c.key)));
  const worksheet = XLSX.utils.aoa_to_sheet([header, ...body]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Cost Workouts');
  XLSX.writeFile(workbook, `${filename}.xlsx`);
}

export async function exportCwsPdf(cws, filename) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  doc.setFontSize(16);
  doc.setTextColor(3, 47, 37);
  doc.text('Cost Workout Report', 40, 40);
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(`Generated on ${formatDate(todayISO())} - ${cws.length} records`, 40, 55);

  const columns = CW_EXPORT_COLUMNS.map((c) => ({ header: c.label, dataKey: c.key }));
  // pdfSafe: the ₹ sign is outside the built-in font's encoding (see pdfText).
  const body = cws.map((cw) => {
    const row = {};
    CW_EXPORT_COLUMNS.forEach((c) => {
      row[c.key] = pdfSafe(cwCellValue(cw, c.key));
    });
    return row;
  });
  const moneyColumns = {
    subtotal: { halign: 'right', cellWidth: 'wrap' },
    profitPct: { halign: 'right', cellWidth: 'wrap' },
    sellingPrice: { halign: 'right', cellWidth: 'wrap' }
  };

  autoTable(doc, {
    startY: 70,
    columns,
    body,
    styles: { fontSize: 8, cellPadding: 4, textColor: [30, 41, 59] },
    headStyles: { fillColor: [3, 47, 37], textColor: 255, fontStyle: 'bold', fontSize: 8 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    // Money / percentage values right-align under their own headers.
    columnStyles: moneyColumns,
    didParseCell: (data) => {
      if (data.section === 'head' && moneyColumns[data.column.dataKey]) {
        data.cell.styles.halign = 'right';
      }
    },
    margin: { top: 40, bottom: 30 }
  });

  doc.save(`${filename}.pdf`);
}

export function printCws(cws) {
  const header = CW_EXPORT_COLUMNS.map((c) => `<th>${c.label}</th>`).join('');
  const body = cws
    .map((cw) => `<tr>${CW_EXPORT_COLUMNS.map((c) => `<td>${cwCellValue(cw, c.key)}</td>`).join('')}</tr>`)
    .join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Cost Workout Report</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #1e293b; margin: 24px; }
  h1 { color: #032f25; font-size: 20px; margin: 0 0 4px; }
  p.meta { color: #6B7280; font-size: 12px; margin: 0 0 16px; }
  table { width: 100%; border-collapse: collapse; font-size: 10px; }
  thead th { background: #0B4A3D; color: #F3F4F6; text-align: left; padding: 7px; text-transform: uppercase; font-size: 9px; letter-spacing: .04em; }
  tbody td { border-bottom: 1px solid #e2e8f0; padding: 6px 7px; }
  tbody tr:nth-child(even) { background: #f8fafc; }
  @media print { body { margin: 8mm; } thead { display: table-header-group; } }
</style>
</head>
<body>
<h1>Cost Workout Report</h1>
<p class="meta">Generated on ${formatDate(todayISO())} - ${cws.length} records</p>
<table><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table>
<script>window.onload = function () { window.print(); };</script>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=1200,height=800');
  if (!win) return;
  win.document.open();
  win.document.write(html);
  win.document.close();
}

function docLines(cpr) {
  const d = cprDocument(cpr);
  const c = cpr;
  // The same fields the CPR preview document (CprDocument) shows: the two
  // quotation deadlines are part of the record and were missing from both the
  // printed document and the PDF.
  const lines = [
    { label: 'CPR No', value: c.prNo || '—' },
    { label: 'Reference No', value: c.referencePrNo || '—' },
    { label: 'Date', value: formatDate(c.prDate || c.createdAt) || '—' },
    { label: 'Quotation Deadline', value: formatDate(c.quotationDeadline) || '—' },
    { label: 'Extended Deadline', value: formatDate(c.extendedDeadline) || '—' },
    { label: 'Required By', value: formatDate(c.requiredDate) || '—' },
    { label: 'Department', value: c.department || '—' },
    { label: 'Requested By', value: c.requestedBy || c.createdBy || '—' },
    { label: 'Priority', value: c.priority || '—' },
    { label: 'Lead No', value: c.leadNo || '—' },
    { label: 'Project', value: c.project || '—' }
  ];
  return { d, lines };
}

export function buildCprPrintHtml(cpr, title = 'Purchase Request') {
  const { d, lines } = docLines(cpr);
  const c = cpr;
  // The printed document reflects the CPR's SAVED column configuration:
  // only columns present in itemColumns (and not hidden) are rendered.
  const allCols = (cpr.itemColumns || []).filter((col) => col && col.id && !col.hidden);
  const stdCols = allCols.filter((col) => col.system);
  const customCols = allCols.filter((col) => !col.system);
  const stdHeads = stdCols.map((col) => `<th>${col.label}</th>`).join('');
  const customHeads = customCols.map((col) => `<th>${col.label}</th>`).join('');
  const itemCount = 1 + stdCols.length + customCols.length + 1; // # + std + custom + Total
  const itemRows = d.items
    .map((it, idx) => {
      const cf = it.customFields && typeof it.customFields === 'object' ? it.customFields : {};
      const stdCells = stdCols.map((col) => `<td${['qty', 'unit'].includes(col.id) ? ' style="text-align:center"' : ['estimatedCost'].includes(col.id) ? ' style="text-align:right"' : ''}>${stdCellValue(it, col)}</td>`).join('');
      const customCells = customCols.map((col) => `<td>${cf[col.id] || '—'}</td>`).join('');
      const row = `<tr><td>${idx + 1}</td>${stdCells}${customCells}<td style="text-align:right">${formatINR(rowTotalValue(it))}</td></tr>`;
      // Item notes print on their own line under the item, line breaks intact.
      const notes = String(it.notes || '').trim();
      const notesRow = notes
        ? `<tr><td colspan="${itemCount}" style="white-space:pre-line;background:#f8fafc;color:#475569;font-size:10px"><strong>Notes:</strong> ${notes}</td></tr>`
        : '';
      return row + notesRow;
    })
    .join('');

  const infoRows = lines.map((l) => `<tr><td class="k">${l.label}</td><td>${l.value}</td></tr>`).join('');
  const summaryRows = [
    ['Estimated Total', formatINR(d.total)],
    ...(d.costWorkout > 0 ? [['Cost Workout', formatINR(d.costWorkout)]] : []),
    ...(d.profit != null ? [['Profit', formatINR(d.profit)]] : []),
    ...(d.marginPct != null ? [['Profit %', `${d.marginPct.toFixed(2)}%`]] : [])
  ]
    .map(([k, v]) => `<tr><td class="k">${k}</td><td style="text-align:right;font-weight:600">${v}</td></tr>`)
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${title} - ${c.prNo || ''}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #1e293b; margin: 24px; }
  .letterhead { width: calc(100% + 4mm); margin-left: -2mm; display: block; border: 0; box-sizing: border-box; }
  .doc-title { font-size: 14px; color: #6B7280; margin-top: 2px; }
  .meta { font-size: 11px; color: #6B7280; margin: 4px 0 16px; }
  .cols { display: flex; gap: 32px; margin-bottom: 20px; }
  .cols h3 { font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: #9CA3AF; margin: 0 0 6px; }
  .cols p { margin: 2px 0; font-size: 12px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 20px; }
  thead th { background: #0B4A3D; color: #F3F4F6; text-align: left; padding: 7px 8px; text-transform: uppercase; font-size: 9px; letter-spacing: .04em; }
  tbody td { border-bottom: 1px solid #e2e8f0; padding: 6px 8px; }
  tr.sum th { background: #F3F4F6; color: #032f25; text-align: right; padding: 7px 8px; }
  .info td.k { width: 150px; color: #6B7280; }
  .info td { padding: 3px 8px; font-size: 12px; }
  .summary { width: 320px; margin-left: auto; }
  .summary td.k { width: 140px; color: #6B7280; }
  .summary td { padding: 4px 8px; font-size: 12px; }
  .total-row td { font-size: 14px; font-weight: 800; color: #032f25; border-top: 2px solid #032f25; }
  .remarks { font-size: 12px; color: #475569; white-space: pre-wrap; }
  @media print { body { margin: 10mm; } }
</style>
</head>
<body>
  <img class="letterhead" src="${VH_LETTERHEAD_ASSET}" alt="Vishak Tech letterhead" />
  <div class="doc-title">${title}</div>
  <div class="meta">${c.prNo || ''} · Generated on ${formatDateTime(new Date().toISOString())}</div>
  <div class="cols">
    <div>
      <h3>Bill To</h3>
      <p><strong>${c.client || c.clientName || '—'}</strong></p>
      ${c.company ? `<p>${c.company}</p>` : ''}
      ${c.contactPerson ? `<p>${c.contactPerson}</p>` : ''}
      ${c.phone ? `<p>${c.phone}</p>` : ''}
      ${c.email ? `<p>${c.email}</p>` : ''}
      ${c.gst ? `<p>GST: ${c.gst}</p>` : ''}
      ${c.billingAddress ? `<p>${c.billingAddress}</p>` : ''}
    </div>
    <div>
      <h3>Details</h3>
      <table class="info">${infoRows}</table>
    </div>
  </div>
  <h3 style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#9CA3AF;margin:0 0 6px">Items</h3>
  <table>
    <thead><tr><th>#</th>${stdHeads}${customHeads}<th>Total</th></tr></thead>
    <tbody>
      ${itemRows}
      <tr class="sum"><th colspan="${itemCount}">Total</th><th>${formatINR(d.total)}</th></tr>
    </tbody>
  </table>
  ${d.costWorkout > 0 ? `<table class="summary">${summaryRows}</table>` : ''}
  ${c.remarks ? `<h3 style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#9CA3AF;margin:0 0 6px">Remarks</h3><div class="remarks">${c.remarks}</div>` : ''}
  <script>window.onload = function () { window.print(); };</script>
</body>
</html>`;
}

export async function exportCprDocumentPdf(cpr, filename) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const { d, lines } = docLines(cpr);
  const c = cpr;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });

  const letterheadData = await fetch(VH_LETTERHEAD_ASSET)
    .then((response) => {
      if (!response.ok) throw new Error('Unable to load the Vishak Tech letterhead');
      return response.blob();
    })
    .then(
      (blob) =>
        new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(new Error('Unable to read the Vishak Tech letterhead'));
          reader.readAsDataURL(blob);
        })
    );
  // Keep the approved asset's 2160:264 aspect ratio when stamping PDF pages.
  doc.addImage(letterheadData, 'PNG', 30, 28, 535, 65.35);
  // The stamped letterhead occupies the top ~93pt of the page; the document
  // number and the details block start below it instead of overlapping it.
  doc.setFontSize(11);
  doc.setTextColor(71, 85, 105);
  doc.text(pdfSafe(c.prNo || ''), 40, 104);

  doc.setFontSize(9);
  // The item table follows the LAST detail line (the header used a fixed
  // offset, so every line added to the document pushed the details into it).
  const linesStartY = 122;
  lines.forEach((l, i) => {
    doc.setTextColor(100, 116, 139);
    doc.text(pdfSafe(l.label), 40, linesStartY + i * 14);
    doc.setTextColor(51, 65, 85);
    doc.text(pdfSafe(l.value), 170, linesStartY + i * 14);
  });

  const allCols = (cpr.itemColumns || []).filter((col) => col && col.id && !col.hidden);
  const stdCols = allCols.filter((col) => col.system);
  const customCols = allCols.filter((col) => !col.system);

  // Columns follow the CPR's saved configuration, and every cell is measured
  // so amounts/costs are never squeezed until the table breaks the number up.
  const heads = ['#', ...stdCols.map((col) => col.label), ...customCols.map((col) => col.label), 'Total'].map(pdfSafe);
  const aligns = [
    'center',
    ...stdCols.map((col) => {
      if (['qty', 'unit'].includes(col.id)) return 'center';
      if (['estimatedCost', 'total'].includes(col.id)) return 'right';
      return 'left';
    }),
    ...customCols.map(() => 'left'),
    'right'
  ];
  const rows = d.items.map((it, idx) => {
    const cf = it.customFields && typeof it.customFields === 'object' ? it.customFields : {};
    return [
      String(idx + 1),
      ...stdCols.map((col) => stdCellValue(it, col)),
      ...customCols.map((col) => cf[col.id] || '—'),
      formatINR(rowTotalValue(it))
    ].map(pdfSafe);
  });
  const flexIndex = heads.findIndex((label) => /description/i.test(label));
  const { widths, fontSize } = fitTableColumns(doc, {
    heads,
    rows,
    flexIndex,
    minFlex: 140,
    padding: 4,
    maxWidth: doc.internal.pageSize.getWidth() - 80
  });
  const columnStyles = {};
  widths.forEach((width, index) => {
    columnStyles[index] = { cellWidth: width, halign: aligns[index] || 'left' };
  });

  autoTable(doc, {
    startY: linesStartY + lines.length * 14 + 12,
    head: [heads],
    body: d.items.flatMap((it, idx) => {
      const row = rows[idx];
      // Per-item notes are part of the CPR (the preview document and the print
      // layout both show them); the PDF printed them nowhere before.
      const notes = String(it.notes || '').trim();
      return notes
        ? [
            row,
            [
              {
                content: pdfSafe(`Notes: ${notes}`),
                colSpan: row.length,
                styles: {
                  fontSize: 7.5,
                  cellPadding: 4,
                  textColor: [71, 85, 105],
                  fillColor: [248, 250, 252],
                  lineWidth: 0.1,
                  lineColor: [226, 232, 240],
                  halign: 'left'
                }
              }
            ]
          ]
        : [row];
    }),
    foot: [
      [
        { content: 'Total', colSpan: Math.max(heads.length - 1, 1), styles: { halign: 'right' } },
        pdfSafe(formatINR(d.total))
      ]
    ],
    styles: { fontSize, cellPadding: 4, textColor: [30, 41, 59], valign: 'top', lineWidth: 0.2, lineColor: [226, 232, 240] },
    headStyles: { fillColor: [3, 47, 37], textColor: 255, fontStyle: 'bold', fontSize },
    // The foot uses the SAME size as the body: a larger foot value no longer
    // outgrows the measured column and wraps onto a second line.
    footStyles: { fillColor: [241, 245, 249], textColor: [3, 47, 37], fontStyle: 'bold', fontSize },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles,
    margin: { left: 40, right: 40, top: 40, bottom: 40 },
    didParseCell: (data) => {
      if (data.section !== 'head' && data.section !== 'foot') return;
      const align = aligns[data.column.index];
      if (align) data.cell.styles.halign = align;
    }
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const contentWidth = pageWidth - 80;
  const pairStyles = { 0: { cellWidth: 240 }, 1: { cellWidth: contentWidth - 240, halign: 'right' } };

  if (d.costWorkout > 0) {
    autoTable(doc, {
      startY: (doc.lastAutoTable?.finalY || 205) + 20,
      head: [[pdfSafe('Cost Summary'), '']],
      body: [
        ['Estimated Total', formatINR(d.total)],
        ['Cost Workout', formatINR(d.costWorkout)],
        ...(d.profit != null ? [['Profit', formatINR(d.profit)]] : []),
        ...(d.marginPct != null ? [['Profit %', `${d.marginPct.toFixed(2)}%`]] : [])
      ].map(([label, value]) => [pdfSafe(label), pdfSafe(value)]),
      theme: 'grid',
      styles: { fontSize: 9, cellPadding: 4, textColor: [30, 41, 59], lineWidth: 0.2, lineColor: [226, 232, 240] },
      headStyles: { fillColor: [3, 47, 37], textColor: 255, fontStyle: 'bold' },
      columnStyles: pairStyles,
      margin: { left: 40, right: 40, top: 40, bottom: 40 }
    });
  }

  if (c.remarks) {
    const pageH = doc.internal.pageSize.getHeight();
    const linesOfText = doc.splitTextToSize(pdfSafe(c.remarks), 500);
    let y = (doc.lastAutoTable?.finalY || 205) + 20;
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text('Remarks', 40, y);
    doc.setTextColor(71, 85, 105);
    linesOfText.forEach((line, i) => {
      y = y + (i === 0 ? 14 : 12);
      if (y > pageH - 48) {
        doc.addPage();
        y = 48;
      }
      doc.text(String(line), 40, y);
    });
  }

  doc.save(`${filename}.pdf`);
}
