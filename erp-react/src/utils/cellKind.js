/**
 * cellKind(key) — classifies a table column key as an identifier, number, or
 * date column so shared list components can emit the corresponding cell-kind
 * class. The ERP table stylesheets then guarantee those cells render on a
 * single horizontal line (white-space: nowrap; word-break: normal;
 * overflow-wrap: normal) with a sensible min-width, instead of breaking
 * character-by-character or overlapping the neighbouring column.
 *
 * Returns '' for ordinary text columns, which keep normal word wrapping.
 *
 * @param {string} key  column key (e.g. 'orderNo', 'grandTotal', 'orderDate')
 * @returns {'cell-id'|'cell-num'|'cell-date'|''}
 */
export default function cellKind(key) {
  const k = String(key || '').toLowerCase();
  if (!k || k === 'checkbox' || k === 'actions') return '';

  if (k.includes('date') || k.endsWith('day')) return 'cell-date';

  if (
    /^(qty|quantity|amount|total|subtotal|grandtotal|net|balance|value|rate|price|cost|count|weight|width|height|length|thickness|nos|pieces)$/.test(k) ||
    /(amount|total|value|qty|quantity|price|rate|balance|weight|count)$/.test(k)
  ) {
    return 'cell-num';
  }

  if (
    /(number|no|id|code|ref|voucher|cpr|sr)$/.test(k) ||
    /(^|_|-)(doc|order|invoice|quote|contract|po|so|sc|dc|dn|wot|lead|client|visit|model|part|serial|followup|contact|customer|receipt|payment|challan|work)(_?)(number|no|id|code|ref)?$/i.test(k)
  ) {
    return 'cell-id';
  }

  return '';
}