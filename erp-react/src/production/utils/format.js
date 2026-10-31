// ============================================================
// Display formatting helpers (frontend only).
// ============================================================

/** '2026-08-10' → '10 Aug 2026' */
export function formatDate(value) {
  if (!value) return '—';
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** '2026-08-10T08:00:00' → '10 Aug 2026 · 08:00' */
export function formatDateTime(value) {
  if (!value) return '—';
  const [datePart, timePart] = String(value).split('T');
  const time = timePart ? timePart.slice(0, 5) : '';
  const date = formatDate(datePart);
  return time ? `${date} · ${time}` : date;
}

/** bytes → '1.4 KB' / '2.3 MB' */
export function formatFileSize(bytes) {
  if (bytes === undefined || bytes === null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Generate and download a CSV file entirely in the browser.
 * `columns` are header labels; `rows` are arrays of cell values.
 */
export function exportCsv(filename, columns, rows) {
  const escape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const csv = [
    columns.map(escape).join(','),
    ...rows.map((row) => row.map(escape).join(',')),
  ].join('\n');

  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
