/**
 * purchase/utils/helpers.js
 * ------------------------------------------------------------------
 * Generic display helpers vendored from the main project so the
 * Purchase package stays self-contained: date / money formatting,
 * initials + avatar colours, CSV export utilities and a generic
 * table cell value resolver.
 * ------------------------------------------------------------------
 */
import { AVATAR_COLORS } from '../constants';

export function formatINR(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '₹0';
  return `₹${num.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

export function getInitials(name = '') {
  return name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export function avatarColor(name = '') {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) % 997;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

/**
 * THE single shared, NaN-safe date formatter. Every page/component date
 * display routes through this (or the formatDateTime / formatActivityDate
 * wrappers below). Empty or unparseable values render "—" and never throw
 * RangeError: Invalid time value.
 */
export function safeFormatDate(value) {
  if (value == null || value === '') return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDate(value) {
  return safeFormatDate(value);
}

export function formatDateTime(value) {
  if (value == null || value === '') return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/**
 * Relative date for the “Last Activity” KPI card — the value is always
 * shown in full, never truncated:
 *   · same calendar day  → “Today 2:15 PM”
 *   · yesterday          → “Yesterday”
 *   · anything else      → “04 Aug 2026 15:15”
 */
export function formatActivityDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const dayDiff = Math.round((startOfToday - startOfDate) / 86400000);

  if (dayDiff === 0) {
    return `Today ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
  }
  if (dayDiff === 1) {
    return 'Yesterday';
  }
  /* en-GB yields “04 Aug 2026, 15:15” — drop the comma for a compact label. */
  return date
    .toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
    .replace(',', '');
}

export function toISODate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

/**
 * Null-safe millisecond value for date comparisons / sorting. Missing or
 * unparseable values sort as 0 (epoch) instead of NaN, so `.sort((a, b) =>
 * safeGetTime(b.createdAt) - safeGetTime(a.createdAt))` can never throw or
 * yield NaN comparators.
 */
export function safeGetTime(value) {
  if (value == null || value === '') return 0;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/** Generic cell resolver for tables without a custom renderer. */
export function getCellValue(row, key) {
  if (row == null) return '';
  return row[key] != null ? String(row[key]) : '';
}

export function buildExportFilename(prefix) {
  const stamp = new Date().toISOString().slice(0, 10);
  return `${prefix}-${stamp}`;
}

export function downloadBlob(blob, filename) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}
