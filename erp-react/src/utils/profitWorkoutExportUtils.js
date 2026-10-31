import { downloadBlob, formatDate, formatINR, todayISO } from './leadHelpers';
import { pdfSafe } from './pdfText';

// ===== Profit Workout export helpers (matching the original ERP export layout) =====

export const PW_EXPORT_COLUMNS = [
  { key: 'pwNo', label: 'PW No' },
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

function escapeCSV(value) {
  const str = value == null ? '' : String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function pwCellValue(pw, key) {
  switch (key) {
    case 'description':
      return Array.isArray(pw.items) && pw.items[0] ? pw.items[0].description || '' : '';
    case 'subtotal':
      return pw.subtotal != null ? formatINR(pw.subtotal) : '';
    case 'profitPct':
      return pw.profitPct != null ? `${pw.profitPct}%` : '';
    case 'sellingPrice':
      return pw.sellingPrice != null ? formatINR(pw.sellingPrice) : '';
    case 'status':
      return pw.status || '';
    case 'createdAt':
      return formatDate(pw.createdAt || pw.pwDate);
    default:
      return pw[key] != null ? String(pw[key]) : '';
  }
}

export function exportPwsCsv(pws, filename) {
  const header = PW_EXPORT_COLUMNS.map((c) => c.label);
  const body = pws.map((pw) => PW_EXPORT_COLUMNS.map((c) => escapeCSV(pwCellValue(pw, c.key))));
  const csv = [header, ...body].map((row) => row.join(',')).join('\r\n');
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, `${filename}.csv`);
}

export async function exportPwsExcel(pws, filename) {
  const XLSX = await import('xlsx');
  const header = PW_EXPORT_COLUMNS.map((c) => c.label);
  const body = pws.map((pw) => PW_EXPORT_COLUMNS.map((c) => pwCellValue(pw, c.key)));
  const worksheet = XLSX.utils.aoa_to_sheet([header, ...body]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Profit Workouts');
  XLSX.writeFile(workbook, `${filename}.xlsx`);
}

export async function exportPwsPdf(pws, filename) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  doc.setFontSize(16);
  doc.setTextColor(3, 47, 37);
  doc.text('Profit Workout Report', 40, 40);
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(`Generated on ${formatDate(todayISO())} - ${pws.length} records`, 40, 55);

  const columns = PW_EXPORT_COLUMNS.map((c) => ({ header: c.label, dataKey: c.key }));
  // pdfSafe: cost / selling price carry a ₹ sign the PDF's built-in font cannot
  // encode (jsPDF then drew each character separately — spaced-out digits).
  const body = pws.map((pw) => {
    const row = {};
    PW_EXPORT_COLUMNS.forEach((c) => {
      row[c.key] = pdfSafe(pwCellValue(pw, c.key));
    });
    return row;
  });

  const moneyColumns = {
    subtotal: { halign: 'right', cellWidth: 'wrap' },
    sellingPrice: { halign: 'right', cellWidth: 'wrap' },
    profitPct: { halign: 'right', cellWidth: 'wrap' }
  };

  autoTable(doc, {
    startY: 70,
    columns,
    body,
    styles: { fontSize: 8, cellPadding: 4, textColor: [30, 41, 59] },
    headStyles: { fillColor: [3, 47, 37], textColor: 255, fontStyle: 'bold', fontSize: 8 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    // Money and percentage columns follow their headers, right-aligned.
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

export function printPws(pws) {
  const header = PW_EXPORT_COLUMNS.map((c) => `<th>${c.label}</th>`).join('');
  const body = pws
    .map((pw) => `<tr>${PW_EXPORT_COLUMNS.map((c) => `<td>${pwCellValue(pw, c.key)}</td>`).join('')}</tr>`)
    .join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Profit Workout Report</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #1e293b; margin: 24px; }
  h1 { color: #032f25; font-size: 20px; margin: 0 0 4px; }
  p.meta { color: #6B7280; font-size: 12px; margin: 0 0 16px; }
  table { width: 100%; border-collapse: collapse; font-size: 10px; }
  thead th { background: #032f25; color: #F3F4F6; text-align: left; padding: 7px; text-transform: uppercase; font-size: 9px; letter-spacing: .04em; }
  tbody td { border-bottom: 1px solid #e2e8f0; padding: 6px 7px; }
  tbody tr:nth-child(even) { background: #f8fafc; }
  @media print { body { margin: 8mm; } thead { display: table-header-group; } }
</style>
</head>
<body>
<h1>Profit Workout Report</h1>
<p class="meta">Generated on ${formatDate(todayISO())} - ${pws.length} records</p>
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

// Mirrors the original ERP's cwBulkExport (cost-workout-list.html): selected
// rows only, exact 10-column order, filename 'ProfitWorkout_Bulk_YYYY-MM-DD.csv'.
export function exportPwsBulkCsv(selected, filename) {
  const headers = ['PW No', 'CPR No', 'Customer', 'Company', 'Description', 'Prepared By', 'Total Cost', 'Profit %', 'Selling Price', 'Status'];
  const rows = selected.map((pw) => {
    const firstItem = pw.items && pw.items[0] ? pw.items[0] : null;
    const desc = firstItem ? firstItem.description || '' : '';
    return [
      escapeCSV(pw.pwNo || pw.id || ''),
      escapeCSV(pw.cprRef || ''),
      escapeCSV(pw.customerName || ''),
      escapeCSV(pw.companyName || ''),
      escapeCSV(desc),
      escapeCSV(pw.preparedBy || ''),
      escapeCSV(pw.subtotal || 0),
      escapeCSV(pw.profitPct != null ? `${pw.profitPct}%` : ''),
      escapeCSV(pw.sellingPrice || 0),
      escapeCSV(pw.status || '')
    ];
  });
  const csv = [headers, ...rows].map((row) => row.join(',')).join('\r\n');
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, `${filename}.csv`);
}
