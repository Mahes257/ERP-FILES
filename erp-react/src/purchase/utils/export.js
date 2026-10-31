/**
 * purchase/utils/export.js
 * ------------------------------------------------------------------
 * Shared export helpers for Purchase list tables: CSV, Excel (xlsx)
 * and a print-ready HTML window. Reuses the base download utilities
 * so every list page exposes the same export behaviour.
 *
 * SheetJS (xlsx) is NOT imported at module scope. It is ~420 kB and this
 * module is imported by ~50 Purchase routes, so a top-level import put the
 * whole library into every one of those routes' eager chunk — downloaded on
 * every visit even though Excel export is a single menu action. It is now
 * fetched on demand inside exportExcel(), so the cost is paid only when the
 * user actually exports a spreadsheet. jspdf below already works this way.
 * ------------------------------------------------------------------
 */
import { buildExportFilename, downloadBlob } from './helpers';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Resolves an exportable header/cell list from table column defs. */
export function resolveExportColumns(columns) {
  return columns.filter((col) => col.key !== 'actions' && col.visible !== false);
}

/** Builds { header, body } grid from column defs + records. */
export function buildExportRows(columns, records = []) {
  const exportCols = resolveExportColumns(columns);
  const header = exportCols.map((col) => col.label);
  const body = records.map((row) =>
    exportCols.map((col) => {
      const value = row?.[col.key];
      if (value == null) return '';
      if (value instanceof Date) return value.toISOString().slice(0, 10);
      return typeof value === 'object' ? JSON.stringify(value) : String(value);
    })
  );
  return { header, body };
}

/** Downloads records as a UTF-8 CSV file. */
export function exportCsv(columns, records, prefix) {
  const { header, body } = buildExportRows(columns, records);
  const rows = [header, ...body]
    .map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n');
  downloadBlob(new Blob([rows], { type: 'text/csv;charset=utf-8;' }), `${buildExportFilename(prefix)}.csv`);
}

/**
 * Downloads records as an .xlsx workbook via SheetJS.
 *
 * Async because SheetJS is loaded on demand (see the module header). Callers
 * already run inside async handlers with try/catch, so awaiting it keeps the
 * existing success and error behaviour — the file is written by the time the
 * promise resolves.
 */
export async function exportExcel(columns, records, prefix) {
  const { header, body } = buildExportRows(columns, records);
  const XLSX = await import('xlsx');
  const sheet = XLSX.utils.aoa_to_sheet([header, ...body]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Data');
  XLSX.writeFile(workbook, `${buildExportFilename(prefix)}.xlsx`);
}

/**
 * Generates a printable PDF for a document (form preview) via jsPDF +
 * autotable. `meta` is an array of [label, value] rows rendered as a
 * header block above the table.
 */
export async function exportPdf({ title, meta = [], columns, records = [], filename = 'document' }) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const { header, body } = buildExportRows(columns, records);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(11, 74, 61);
  doc.text(String(title || 'Document'), 40, 40);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  let y = 56;
  (meta || []).forEach(([label, value]) => {
    if (value == null || value === '') return;
    doc.text(`${label}: ${value}`, 40, y);
    y += 12;
  });

  autoTable(doc, {
    startY: Math.min(y + 10, 100),
    head: [header],
    body,
    styles: { fontSize: 8, cellPadding: 4, textColor: [30, 41, 59] },
    headStyles: { fillColor: [11, 74, 61], textColor: [241, 245, 249], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: 40, right: 40 }
  });

  doc.save(`${buildExportFilename(filename)}.pdf`);
}

/**
 * Rasterises a DOM node to a canvas using the browser's own layout
 * engine via an SVG <foreignObject> data URL (no extra dependency).
 * The node is cloned and serialised together with its inline <style>
 * rules, so the bitmap is pixel-identical to the on-screen document.
 */
/** Collects every stylesheet rule the current document can see and
 * returns them as one CSS string. Cross-origin sheets are skipped
 * (reading their cssRules throws) — they never style local nodes. */
function collectDocumentStyles() {
  try {
    const seen = new Set();
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        for (const rule of Array.from(sheet.cssRules || [])) {
          seen.add(rule.cssText);
        }
      } catch {
        /* cross-origin stylesheet — skip */
      }
    }
    return Array.from(seen).join('\n');
  } catch {
    return '';
  }
}

async function elementToCanvas(node, scale = 2) {
  const rect = node.getBoundingClientRect();
  const width = Math.max(1, rect.width);
  const height = Math.max(1, rect.height);

  const clone = node.cloneNode(true);
  clone.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
  const body = new XMLSerializer().serializeToString(clone);

  /* The rasterised SVG data-URL is a standalone document, so its HTML
     content must carry its own styling: inline the document's stylesheet
     rules into an SVG <style> element (also covers Tailwind + cpr/po
     utilities). Without this, charts relying on class-based fills would
     render unstyled/blank in browsers that don't inherit host CSS. */
  const injectedCss = collectDocumentStyles().replace(/</g, '&lt;');

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width * scale}" height="${height * scale}" viewBox="0 0 ${width} ${height}">`,
    injectedCss ? `<defs><style type="text/css">${injectedCss}</style></defs>` : '',
    `<foreignObject width="100%" height="100%">`,
    `<div xmlns="http://www.w3.org/1999/xhtml">`,
    body,
    `</div></foreignObject></svg>`
  ].join('');

  const img = new Image();
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = () => reject(new Error('Unable to rasterise the document for PDF export'));
    img.src = url;
  });

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/**
 * Exports a list of A4 page elements (the `.pr-sheet` nodes rendered by
 * the print preview) into a single A4 portrait PDF. Every page is
 * rasterised from the exact same DOM node shown in the preview, so the
 * PDF is identical to the preview — no second template is ever built.
 */
export async function exportSheetsAsPdf(sheets = [], { filename = 'document', scale = 2 } = {}) {
  const nodes = sheets.filter(Boolean);
  if (nodes.length === 0) throw new Error('Nothing to export');

  /* Requirement: wait for fonts before rasterising so the PDF matches
     the on-screen document exactly. */
  try {
    await (document.fonts?.ready ?? Promise.resolve());
  } catch {
    /* fonts API unavailable — proceed anyway */
  }

  const [{ jsPDF }] = await Promise.all([import('jspdf')]);
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });

  const pageW = 210;
  const pageH = 297;
  for (let i = 0; i < nodes.length; i += 1) {
    const canvas = await elementToCanvas(nodes[i], scale);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    /* Scale-to-fit guard (only relevant if a page is ever taller than A4). */
    const ratio = Math.min(pageW / canvas.width, pageH / canvas.height);
    const width = canvas.width * ratio;
    const height = canvas.height * ratio;
    if (i > 0) doc.addPage('a4', 'portrait');
    doc.addImage(dataUrl, 'JPEG', (pageW - width) / 2, (pageH - height) / 2, width, height);
  }

  doc.save(`${buildExportFilename(filename)}.pdf`);
}

/**
 * Rasterises a single DOM node (chart / card) into a PNG download.
 * Reuses the same canvas pipeline as the sheet PDF export so charts
 * export pixel-identically to what is on screen.
 */
export async function exportNodeAsPng(node, { filename = 'chart', scale = 2 } = {}) {
  if (!node) throw new Error('Nothing to export');
  try {
    await (document.fonts?.ready ?? Promise.resolve());
  } catch {
    /* fonts API unavailable — proceed anyway */
  }
  const canvas = await elementToCanvas(node, scale);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Unable to rasterise the chart');
  downloadBlob(blob, `${buildExportFilename(filename)}.png`);
}

/**
 * Rasterises a single DOM node (chart / card) into a one-page A4
 * landscape PDF. Ideal for "Download chart as PDF" actions.
 */
export async function exportNodeAsPdf(node, { filename = 'chart', scale = 2 } = {}) {
  if (!node) throw new Error('Nothing to export');
  try {
    await (document.fonts?.ready ?? Promise.resolve());
  } catch {
    /* fonts API unavailable — proceed anyway */
  }
  const [{ jsPDF }] = await Promise.all([import('jspdf')]);
  const canvas = await elementToCanvas(node, scale);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = 297;
  const pageH = 210;
  const ratio = Math.min(pageW / canvas.width, pageH / canvas.height);
  const width = canvas.width * ratio;
  const height = canvas.height * ratio;
  doc.addImage(dataUrl, 'JPEG', (pageW - width) / 2, (pageH - height) / 2, width, height);
  doc.save(`${buildExportFilename(filename)}.pdf`);
}

/** Opens a print-friendly window and triggers the browser print dialog. */
export function printTable(title, columns, records) {
  const { header, body } = buildExportRows(columns, records);
  const win = window.open('', '_blank', 'width=1024,height=768');
  if (!win) return false;

  const head = header.map((h) => `<th>${escapeHtml(h)}</th>`).join('');
  const rows = body
    .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`)
    .join('');

  win.document.write(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; padding: 32px; color: #0f172a; }
    h1 { font-size: 18px; margin: 0 0 4px; }
    .meta { font-size: 12px; color: #64748b; margin-bottom: 20px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th { background: #1e3a8a; color: #f1f5f9; text-align: left; padding: 8px 10px; font-weight: 700; }
    td { padding: 7px 10px; border-bottom: 1px solid #e2e8f0; }
    tbody tr:nth-child(even) { background: #f8fafc; }
    @media print { body { padding: 12px; } }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <div class="meta">Generated on ${new Date().toLocaleString('en-GB')}</div>
  <table>
    <thead><tr>${head}</tr></thead>
    <tbody>${rows || '<tr><td colspan="99">No records</td></tr>'}</tbody>
  </table>
  <script>window.onload = function () { window.print(); };</script>
</body>
</html>`);
  win.document.close();
  return true;
}
