// CPR Reports — replicates the original ERP pr-reports.html exactly.
// Summary KPIs/tables come from the backend /cprs/reports/summary endpoint;
// this module only formats and exports the underlying CPR list records.

import { pdfSafe } from './pdfText';

export function reportAmount(cpr) {
  const amount = Number(cpr?.grandTotal ?? cpr?.subtotal ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

export function reportDate(cpr) {
  return cpr?.prDate || cpr?.createdAt || '';
}

export function fmtReportAmount(value) {
  let n = Number(value);
  if (!Number.isFinite(n)) n = 0;
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function fmtReportDate(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    try {
      return value.substring(0, 10);
    } catch {
      return '-';
    }
  }
  return d.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
}

export const CPR_REPORT_EXPORT_COLUMNS = [
  { key: 'prNo', label: 'CPR No' },
  { key: 'date', label: 'Date' },
  { key: 'department', label: 'Department' },
  { key: 'requestedBy', label: 'Requested By' },
  { key: 'client', label: 'Client' },
  { key: 'leadNo', label: 'Lead No' },
  { key: 'status', label: 'Status' },
  { key: 'priority', label: 'Priority' },
  { key: 'amount', label: 'Amount' }
];

export function cprReportRow(cpr) {
  return {
    prNo: cpr?.prNo || cpr?.id || '',
    date: fmtReportDate(reportDate(cpr)),
    department: cpr?.department || '',
    requestedBy: cpr?.requestedBy || cpr?.createdBy || '',
    client: cpr?.client || cpr?.clientName || '',
    leadNo: cpr?.leadNo || '',
    status: cpr?.status || '',
    priority: cpr?.priority || '',
    amount: fmtReportAmount(reportAmount(cpr))
  };
}

function escapeCSV(value) {
  const str = value == null ? '' : String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportCprReportsCsv(cprs, filename) {
  const header = CPR_REPORT_EXPORT_COLUMNS.map((c) => c.label);
  const body = cprs.map((cpr) => CPR_REPORT_EXPORT_COLUMNS.map((c) => escapeCSV(cprReportRow(cpr)[c.key])));
  const csv = [header, ...body].map((row) => row.join(',')).join('\r\n');
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

export async function exportCprReportsExcel(cprs, filename) {
  const XLSX = await import('xlsx');
  const header = CPR_REPORT_EXPORT_COLUMNS.map((c) => c.label);
  const body = cprs.map((cpr) => CPR_REPORT_EXPORT_COLUMNS.map((c) => cprReportRow(cpr)[c.key]));
  const worksheet = XLSX.utils.aoa_to_sheet([header, ...body]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'CPR Reports');
  XLSX.writeFile(workbook, `${filename}.xlsx`);
}

export async function exportCprReportsPdf(cprs, filename) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  doc.setFontSize(16);
  doc.setTextColor(3, 47, 37);
  doc.text('CPR Reports', 40, 40);
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(`Generated on ${new Date().toLocaleString()} - ${cprs.length} records`, 40, 55);

  const columns = CPR_REPORT_EXPORT_COLUMNS.map((c) => ({ header: c.label, dataKey: c.key }));
  // pdfSafe: the amount carries a ₹ sign the PDF's built-in font cannot encode
  // (jsPDF then drew every character separately — the spaced-out digits bug).
  const body = cprs.map((cpr) => {
    const row = cprReportRow(cpr);
    return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, pdfSafe(value)]));
  });

  autoTable(doc, {
    startY: 70,
    columns,
    body,
    styles: { fontSize: 8, cellPadding: 4, textColor: [30, 41, 59] },
    headStyles: { fillColor: [3, 47, 37], textColor: 255, fontStyle: 'bold', fontSize: 8 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    // Amount sits right-aligned under its header, like every other money column.
    columnStyles: { amount: { halign: 'right', cellWidth: 'wrap' } },
    didParseCell: (data) => {
      if (data.section === 'head' && data.column.dataKey === 'amount') data.cell.styles.halign = 'right';
    },
    margin: { top: 40, bottom: 30 }
  });

  doc.save(`${filename}.pdf`);
}

export function printCprReports(cprs) {
  const header = CPR_REPORT_EXPORT_COLUMNS.map((c) => `<th>${c.label}</th>`).join('');
  const body = cprs
    .map((cpr) => {
      const row = cprReportRow(cpr);
      return `<tr>${CPR_REPORT_EXPORT_COLUMNS.map((c) => `<td>${row[c.key] || ''}</td>`).join('')}</tr>`;
    })
    .join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>CPR Reports</title>
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
<h1>CPR Reports</h1>
<p class="meta">Generated on ${new Date().toLocaleString()} - ${cprs.length} records</p>
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
