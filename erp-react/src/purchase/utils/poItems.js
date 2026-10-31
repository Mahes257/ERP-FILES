/**
 * purchase/utils/poItems.js
 * ------------------------------------------------------------------
 * Pure helpers for Purchase Order line-item rows — kept outside the
 * component so they can be unit-tested without rendering.
 * ------------------------------------------------------------------
 */
import { getDefaultTaxRate } from '../services/settings';

/**
 * Maps stored / converted line items into PO form rows.
 *
 * Only populated rows become line items — the empty default row is
 * added ONLY when there is no real data. A conversion pre-fill (e.g. an
 * approved NFA carried into the PO create form) must never render with
 * a blank default row, and blank rows left inside a stale draft must
 * not masquerade as line items — otherwise the grid looks blank and
 * the totals stay 0 even though a document was converted.
 */
export function buildPoFormItems(items) {
  const source = Array.isArray(items) ? items : [];
  const rows = source
    .map((item) => ({ itemCode: '', discount: '', remarks: '', ...item }))
    .filter(
      (item) => String(item.product || '').trim() !== ''
        || Number(item.qty) > 0
        || Number(item.rate) > 0
    );
  return rows.length > 0
    ? rows
    : [{ itemCode: '', product: '', category: '', hsn: '', uom: 'Nos', qty: '', rate: '', discount: '', gstRate: getDefaultTaxRate(), remarks: '' }];
}
