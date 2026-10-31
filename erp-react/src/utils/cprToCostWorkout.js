/**
 * cprToCostWorkout.js
 * ------------------------------------------------------------------
 * The CPR → Cost Workout HEADER mapping.
 *
 * A Cost Workout is opened from a Customer Purchase Requisition by
 * `/cost-workouts/new?cpr=<id>` — the CPR list's ⋮ → "Convert to Cost Workout"
 * and the CPR detail page's "Cost Workout" action — and by the backend's
 * Admin float (`POST /cprs/{id}/float` with destination CW). AddCostWorkout
 * reloads the CPR from the backend by its real id and maps its header with
 * these helpers.
 *
 * WHAT TRAVELS AND WHAT DOES NOT
 *
 *   The CPR holds what the CUSTOMER asked for; the Cost Workout is the
 *   company's own costing of the same job. Only the CPR's header information
 *   travels:
 *
 *     CPR reference (prNo → cprRef / linkedCpr / cprId)
 *     client / company / contact person / phone / email / GST / PAN / addresses
 *     the CPR's own description and remarks, folded into the Cost Workout's
 *       Remarks as a labelled provenance note
 *
 *   The CPR's individual material/item rows (Drawing No., Material,
 *   Description, Remarks, Qty, UOM, Est. Cost, row Total and user-defined item
 *   columns) are deliberately NOT carried into the Cost Workout form or its
 *   item/material sections: that section belongs to the estimator and opens on
 *   the form's own single blank row. The CPR keeps its items untouched, and the
 *   record-level link (cprId / cprRef) keeps both documents connected.
 *
 * `foldCprItemCustomFields` is exported for the OTHER CPR conversion — the
 * CPR → Quotation mapping in QuotationFormPage, which does fold a CPR item's
 * user-defined columns into the quotation item's material, using the same
 * "Label: value" shape the backend uses (QuotationService.foldCprCustomFields).
 *
 * This module is intentionally dependency-free so `node --test` can cover the
 * mapping directly (see tests/cpr-to-cost-workout-mapping.test.js).
 */

/** Trimmed string, or '' for null/undefined/non-string values. */
function text(value) {
  return value == null ? '' : String(value).trim();
}

/**
 * The CPR item's user-defined column values in configured column order.
 * Standard (system) CPR columns are excluded — they map onto the destination's
 * own columns instead.
 *
 * @returns {Array<[columnId, label]>}
 */
function cprCustomColumnRefs(cpr, customFields) {
  const values = customFields && typeof customFields === 'object' && !Array.isArray(customFields)
    ? customFields
    : {};
  const refs = [];
  const seen = new Set();
  (Array.isArray(cpr?.itemColumns) ? cpr.itemColumns : []).forEach((column) => {
    if (!column || !column.id || column.system || !(column.id in values)) return;
    refs.push([column.id, column.label || column.id]);
    seen.add(column.id);
  });
  // Values whose column definition is missing (legacy rows) are still carried,
  // labelled with their column id.
  Object.keys(values).forEach((id) => {
    if (!seen.has(id)) refs.push([id, id]);
  });
  return refs;
}

/**
 * Folds a CPR item's user-defined grid columns into one
 * "Label: value; Label: value" string (configured column order) so custom item
 * information survives the CPR → QUOTATION conversion — the same shape the
 * backend uses for that conversion.
 */
export function foldCprItemCustomFields(cpr, item) {
  const values = item?.customFields;
  if (!values || typeof values !== 'object' || Array.isArray(values)) return '';
  return cprCustomColumnRefs(cpr, values)
    .map(([id, label]) => {
      const value = text(values[id]);
      return value === '' ? null : `${label}: ${value}`;
    })
    .filter(Boolean)
    .join('; ');
}

/**
 * The provenance note written into the Cost Workout's Remarks when it is
 * opened from a CPR, so the destination states where it came from without
 * inventing a field. The CPR's own header description/remarks are appended,
 * labelled and only when present, because the Cost Workout has no other
 * free-text header field for them.
 */
export function cprConversionRemarks(cpr, userName = '') {
  const prNo = text(cpr?.prNo) || 'CPR';
  const note = `Raised from ${prNo}${userName ? ` by ${userName}` : ''}.`;
  const source = [];
  const description = text(cpr?.description);
  const remarks = text(cpr?.remarks);
  if (description) source.push(`CPR description: ${description}`);
  if (remarks) source.push(`CPR remarks: ${remarks}`);
  return source.length ? `${note} ${source.join(' ')}` : note;
}
