import { exportCSV, exportExcel, exportPDFSummary, exportPDFDetailed, printLeads } from '../utils/exportUtils';
import { buildExportFilename, downloadBlob } from '../utils/leadHelpers';
import leadService from './leadService';

export const EXPORT_FORMATS = [
  { key: 'pdf-summary', label: 'PDF Summary', icon: 'FileText', hint: 'Summary + stage breakdown' },
  { key: 'pdf-detailed', label: 'PDF Detailed', icon: 'FileText', hint: 'Full column detail' },
  { key: 'excel', label: 'Excel', icon: 'FileSpreadsheet', hint: '.xlsx workbook' },
  { key: 'csv', label: 'CSV', icon: 'FileDown', hint: 'Comma separated values' },
  { key: 'print', label: 'Print', icon: 'Printer', hint: 'Printable HTML view' }
];

export function getExportFormat(key) {
  return EXPORT_FORMATS.find((format) => format.key === key) || null;
}

export async function exportLeads(format, leads, columns, prefix = 'leads') {
  const filename = buildExportFilename(prefix);
  switch (format) {
    case 'pdf-summary':
      await exportPDFSummary(leads, columns, filename);
      break;
    case 'pdf-detailed':
      await exportPDFDetailed(leads, columns, filename);
      break;
    case 'excel':
      await exportExcel(leads, columns, filename);
      break;
    case 'csv':
      exportCSV(leads, columns, filename);
      break;
    case 'print':
      printLeads(leads, columns);
      break;
    default:
      throw new Error(`Unsupported export format: ${format}`);
  }
}

export async function exportFromBackend(params, format, prefix = 'leads') {
  const filename = buildExportFilename(prefix);
  const blob = await leadService.exportLeads(params, { responseType: 'blob' });

  if (blob && blob.type && blob.type.includes('application/json')) {
    const text = await blob.text();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      throw new Error('Export failed on the server', { cause: err });
    }
    throw new Error(parsed?.message || 'Export failed on the server');
  }

  const extension = format === 'pdf-summary' || format === 'pdf-detailed'
    ? 'pdf'
    : format === 'excel'
      ? 'xlsx'
      : format === 'csv'
        ? 'csv'
        : null;

  if (extension) {
    downloadBlob(blob, `${filename}.${extension}`);
  } else {
    throw new Error(`Unsupported export format: ${format}`);
  }
}

export default {
  EXPORT_FORMATS,
  getExportFormat,
  exportLeads,
  exportFromBackend
};
