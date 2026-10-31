/**
 * itemCustomFields.js — helpers for per-row custom grid column values.
 * ------------------------------------------------------------------
 * A row's custom column values are stored as {columnId: value}:
 *  · in memory on the row itself (`row.customFields`)
 *  · in MySQL as a JSON object on the item row (identical shape to the CPR
 *    item grid's CprItem.customFieldsJson / every sales item's
 *    customFieldsJson) — never a dynamic ALTER TABLE per custom column.
 *
 * The API returns the value either as an already-parsed object or (for older
 * records) as a JSON string, so every loader funnels through this normalizer.
 */
export function normalizeItemCustomFields(raw) {
  if (!raw) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return { ...raw };
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

/** Copy a row's custom values into a new, independent object (never shared). */
export function cloneItemCustomFields(raw) {
  return { ...normalizeItemCustomFields(raw) };
}
