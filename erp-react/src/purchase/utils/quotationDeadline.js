/**
 * purchase/utils/quotationDeadline.js
 * ------------------------------------------------------------------
 * Frontend-only helpers for the Quotation Deadline / Extended Deadline
 * field pair on the Purchase Requisition form.
 *
 * The original deadline is preserved in `quotationDeadline`; the
 * effective (possibly extended) deadline lives in `extendedDeadline`
 * ('' = no extension). Pure date math + option derivation only — no
 * services, no persistence, no backend involvement.
 * ------------------------------------------------------------------
 */

/** Options for the Extended Deadline dropdown. */
export const EXTENDED_DEADLINE_OPTIONS = [
  { value: 'NONE', label: 'No Extension' },
  { value: '+1', label: '+1 Day' },
  { value: '+3', label: '+3 Days' },
  { value: '+7', label: '+7 Days' },
  { value: '+14', label: '+14 Days' },
  { value: 'CUSTOM', label: 'Custom Date' }
];

function toYmd(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** Adds `days` to a YYYY-MM-DD string; returns '' for empty/invalid input. */
export function addDaysToDate(dateStr, days) {
  if (!dateStr) return '';
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  d.setDate(d.getDate() + (Number(days) || 0));
  return toYmd(d);
}

function dayDiff(from, to) {
  const a = new Date(`${from}T00:00:00`);
  const b = new Date(`${to}T00:00:00`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return Math.round((b - a) / 86400000);
}

/** Effective quotation deadline = extended deadline when set, else the original. */
export function effectiveQuotationDeadline(quotationDeadline, extendedDeadline) {
  return extendedDeadline || quotationDeadline || '';
}

/**
 * Re-derives the dropdown option from the stored dates so the form shows
 * exactly what was saved: exact +1/+3/+7/+14 day differences map back to
 * their preset, anything else that differs is a Custom Date, and no
 * extension is 'NONE'. An extended date without a base deadline is Custom.
 */
export function deriveExtendedDeadlineOption(quotationDeadline, extendedDeadline) {
  if (!extendedDeadline) return 'NONE';
  if (!quotationDeadline) return 'CUSTOM';
  if (extendedDeadline === quotationDeadline) return 'NONE';
  const diff = dayDiff(quotationDeadline, extendedDeadline);
  if (diff === 1) return '+1';
  if (diff === 3) return '+3';
  if (diff === 7) return '+7';
  if (diff === 14) return '+14';
  return 'CUSTOM';
}
