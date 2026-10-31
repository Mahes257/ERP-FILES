/**
 * purchase/utils/technicalReview.js
 * ------------------------------------------------------------------
 * Display-only derivation helpers for the Technical Specification
 * Review workspace. They map raw requisition records (plus their
 * `technicalReview` payload) onto the badge states shown in the
 * review table and expansion panel. Purely presentational — records
 * are never mutated and no service / API is touched.
 * ------------------------------------------------------------------
 */
import { PR_STATUS, REVIEW_STATUS } from '../constants';

/** Derived review-stage statuses shown in the table's Status column. */
export const REVIEW_STAGE_STATUS = {
  READY: 'Ready for Review',
  REVIEWED: 'Reviewed',
  RETURNED: 'Returned',
  PENDING_APPROVAL: 'Pending Approval',
  NOT_STARTED: 'Not Started'
};

/** Statuses whose records land in the technical review workspace as
 *  reviewable. Action-queue scope: ONLY the canonical Technical
 *  Specification Review stage — records awaiting Admin approval
 *  (PENDING_APPROVAL) and legacy Approved records belong to the Admin
 *  approval flow, not the technical reviewer's queue. */
export const REVIEWABLE_STATUSES = [
  PR_STATUS.TECHNICAL_REVIEW
];

/**
 * Maps a record onto its technical-review-stage status:
 *  - review completed  → "Reviewed"
 *  - returned          → "Returned"
 *  - in technical review and unreviewed → "Ready for Review"
 *
 * A review can only be recorded AFTER the PR approval (the service
 * enforces it), so the legacy "reviewed while still Pending Approval"
 * state no longer exists — REVIEWED always means the review is done.
 */
export function reviewStatusOf(record) {
  const review = record?.technicalReview;
  if (review?.reviewStatus === REVIEW_STATUS.REVIEWED) {
    return REVIEW_STAGE_STATUS.REVIEWED;
  }
  if (record?.status === PR_STATUS.RETURNED) return REVIEW_STAGE_STATUS.RETURNED;
  if (REVIEWABLE_STATUSES.includes(record?.status)) return REVIEW_STAGE_STATUS.READY;
  return review?.reviewStatus || REVIEW_STAGE_STATUS.NOT_STARTED;
}

/** Specification readiness badge: Complete / Missing / Needs Review. */
export function specificationStatusOf(record) {
  const review = record?.technicalReview;
  if (review?.specification) return 'Complete';
  if (review?.reviewStatus === REVIEW_STATUS.REVIEWED) return 'Missing';
  return 'Needs Review';
}

/** Material verification badge: Verified / Pending / Mismatch. */
export function materialStatusOf(record) {
  if (record?.status === PR_STATUS.RETURNED) return 'Mismatch';
  return record?.technicalReview?.materialGrade ? 'Verified' : 'Pending';
}

/** True when a drawing reference has been recorded. */
export function hasDrawing(record) {
  return Boolean(record?.technicalReview?.drawing);
}

/** Primary line item label for the "Item" column (falls back to title). */
export function itemLabel(record) {
  const first = record?.items?.[0];
  return first?.product || record?.title || '—';
}

/** Compact line-item rows for the Material Details section. */
export function materialLines(record, limit = 4) {
  return (record?.items || []).slice(0, limit).map((item) => ({
    product: item.product,
    spec: item.hsn ? `HSN ${item.hsn}` : '',
    qty: `${Number(item.qty) || 0} ${item.uom || ''}`.trim()
  }));
}

/** Vendor-facing attachment list for the expansion panel. */
export function attachmentItems(record) {
  const real = (record?.attachments || []).map((att) => ({
    name: att.name || 'Attachment',
    kind: att.type || 'file'
  }));
  if (real.length > 0) return real;
  const drawing = record?.technicalReview?.drawing;
  if (drawing) return [{ name: `${drawing}.pdf`, kind: 'pdf' }];
  return [];
}

/** Review-relevant history events (submit / review / return / approve / …). */
export function reviewHistory(record) {
  return (record?.activity || [])
    .filter((entry) => ['submit', 'review', 'return', 'approve', 'reject', 'comment'].includes(entry.type))
    .map((entry) => ({
      type: entry.type,
      label: entry.label || entry.type,
      actor: entry.actor || 'System',
      timestamp: entry.timestamp || '',
      note: entry.note || ''
    }));
}

/** True when the record can still be approved / returned from here. */
export function isActionable(record) {
  return REVIEWABLE_STATUSES.includes(record?.status);
}
