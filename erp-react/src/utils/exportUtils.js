import { formatINR, getCellValue, downloadBlob, formatDate, todayISO } from './leadHelpers';
import { STAGES } from './leadConstants';

function buildAoa(leads, columns) {
  const header = columns.map((c) => c.label);
  const body = leads.map((lead) => columns.map((c) => getCellValue(lead, c.key)));
  return [header, ...body];
}

function escapeCSV(value) {
  const str = value == null ? '' : String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportCSV(leads, columns, filename) {
  const aoa = buildAoa(leads, columns);
  const csv = aoa.map((row) => row.map(escapeCSV).join(',')).join('\r\n');
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, `${filename}.csv`);
}

export async function exportExcel(leads, columns, filename) {
  const XLSX = await import('xlsx');
  const aoa = buildAoa(leads, columns);
  const worksheet = XLSX.utils.aoa_to_sheet(aoa);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Leads');
  XLSX.writeFile(workbook, `${filename}.xlsx`);
}

function buildPdfRows(leads, columns) {
  return leads.map((lead) => {
    const row = {};
    columns.forEach((c) => {
      row[c.key] = getCellValue(lead, c.key);
    });
    return row;
  });
}

function applyPdfTable(doc, autoTable, columns, rows, startY) {
  autoTable(doc, {
    startY,
    columns: columns.map((c) => ({ header: c.label, dataKey: c.key })),
    body: rows,
    styles: { fontSize: 8, cellPadding: 4, textColor: [30, 41, 59] },
    headStyles: { fillColor: [3, 47, 37], textColor: 255, fontStyle: 'bold', fontSize: 8 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: { value: { halign: 'right' } },
    margin: { top: 40, bottom: 30 }
  });
}

export async function exportPDFSummary(leads, columns, filename) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  doc.setFontSize(16);
  doc.setTextColor(3, 47, 37);
  doc.text('Lead Summary Report', 40, 40);
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(`Generated on ${formatDate(todayISO())}`, 40, 55);

  const totalValue = leads.reduce((sum, l) => sum + (Number(l.value) || 0), 0);
  const stats = [
    ['Total Leads', String(leads.length)],
    ['Total Pipeline Value', formatINR(totalValue)],
    ['Average Lead Value', formatINR(leads.length ? totalValue / leads.length : 0)],
    ['Active Leads', String(leads.filter((l) => l.status !== 'Archived').length)],
    ['Archived Leads', String(leads.filter((l) => l.status === 'Archived').length)]
  ];

  const stageCounts = STAGES.map((s) => [s.label, String(leads.filter((l) => l.stage === s.value).length)]);

  autoTable(doc, {
    startY: 70,
    head: [['Metric', 'Value']],
    body: stats,
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 5 },
    headStyles: { fillColor: [3, 47, 37], textColor: 255 },
    columnStyles: { 1: { halign: 'right' } }
  });

  const stageStartY = (doc.lastAutoTable?.finalY || 70) + 20;
  autoTable(doc, {
    startY: stageStartY,
    head: [['Pipeline Stage', 'Lead Count']],
    body: stageCounts,
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 5 },
    headStyles: { fillColor: [3, 47, 37], textColor: 255 },
    columnStyles: { 1: { halign: 'right' } }
  });

  const detailStartY = (doc.lastAutoTable?.finalY || stageStartY) + 20;
  applyPdfTable(doc, autoTable, columns, buildPdfRows(leads, columns), detailStartY);
  doc.save(`${filename}-summary.pdf`);
}

export async function exportPDFDetailed(leads, columns, filename) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  doc.setFontSize(16);
  doc.setTextColor(3, 47, 37);
  doc.text('Lead Detailed Report', 40, 40);
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(`Generated on ${formatDate(todayISO())} - ${leads.length} records`, 40, 55);

  applyPdfTable(doc, autoTable, columns, buildPdfRows(leads, columns), 70);
  doc.save(`${filename}-detailed.pdf`);
}

export function printLeads(leads, columns) {
  const header = columns.map((c) => `<th>${c.label}</th>`).join('');
  const body = leads
    .map((lead) => `<tr>${columns.map((c) => `<td>${getCellValue(lead, c.key)}</td>`).join('')}</tr>`)
    .join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Leads Report</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #1e293b; margin: 24px; }
  h1 { color: #032f25; font-size: 20px; margin: 0 0 4px; }
  p.meta { color: #6B7280; font-size: 12px; margin: 0 0 16px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  thead th { background: #032f25; color: #F3F4F6; text-align: left; padding: 8px; text-transform: uppercase; font-size: 10px; letter-spacing: .04em; }
  tbody td { border-bottom: 1px solid #e2e8f0; padding: 7px 8px; }
  tbody tr:nth-child(even) { background: #f8fafc; }
  @media print { body { margin: 8mm; } thead { display: table-header-group; } }
</style>
</head>
<body>
<h1>Leads Report</h1>
<p class="meta">Generated on ${formatDate(todayISO())} - ${leads.length} records</p>
<table><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table>
<script>window.onload = function () { window.print(); };</script>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=1200,height=800');
  if (!win) {
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
}
