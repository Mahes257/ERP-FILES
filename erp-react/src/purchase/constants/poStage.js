/**
 * purchase/constants/poStage.js
 * ------------------------------------------------------------------
 * Canonical Purchase Order stage system — single source of truth.
 *
 * Legacy records may still carry the statuses "Open" and "Partial".
 * Every PO returned from the service MUST carry a canonical stage.
 * The `normalizePOStatus` function maps legacy values:
 *
 *   Open    → In Progress
 *   Partial → Partially Delivered
 *
 * All filtering, counts, KPIs, dashboard metrics, action menus and
 * table renderers MUST use the canonical stage produced here.
 * ------------------------------------------------------------------
 */

/**
 * Legacy-to-canonical PO stage map.
 * Every key that is NOT a canonical stage is remapped; canonical
 * stages pass through unchanged. Uses string literals to avoid
 * circular dependency with constants/index.js (which re-exports
 * this module).
 */
const LEGACY_STAGE_MAP = {
  Open: 'In Progress',
  Partial: 'Partially Delivered'
};

/**
 * Normalize any PO status value to its canonical stage.
 * Unknown / unrecognized values are returned as-is so callers
 * never silently lose information.
 *
 * @param {string} status - Raw status from a PO record
 * @returns {string} Canonical stage
 */
export function normalizePOStatus(status) {
  if (!status) return status;
  return LEGACY_STAGE_MAP[status] || status;
}

/**
 * Normalize an entire PO record — mutates only the `status` field.
 * Call on every PO object before it leaves the service layer.
 *
 * @param {object} order - PO record
 * @returns {object} Same record with canonical `status`
 */
export function normalizePoRecord(order) {
  if (!order) return order;
  const normalized = normalizePOStatus(order.status);
  if (normalized === order.status) return order;
  return { ...order, status: normalized };
}

/**
 * Canonical PO stages list — every page, filter, tab and KPI
 * must reference this array for stage ordering and display.
 * Uses string literals to avoid circular dependency.
 */
export const PO_CANONICAL_STAGES = [
  'Draft',
  'Pending Approval',
  'Approved',
  'Released',
  'Supplier Acknowledged',
  'In Progress',
  'Partially Delivered',
  'Completed',
  'Closed',
  'Cancelled'
];

/**
 * Stages that count as "released to the supplier" — the membership of
 * the Released Orders & Supplier Acknowledgement workspace and of the
 * sidebar acknowledgement badge. Approved-but-not-yet-released POs are
 * deliberately excluded (they were never sent to the vendor), and
 * Completed / Closed POs have left the acknowledgement window.
 * The PO's ONE source of truth stays `status`; every other stage-like
 * field (releaseStage / acknowledgementStage / ack status / pipeline
 * position) is derived from it (or its ack timestamps) and never
 * updated independently.
 */
export const PO_RELEASED_STAGES = [
  'Released',
  'Supplier Acknowledged',
  'In Progress',
  'Partially Delivered'
];

/** True when a PO's canonical status is a released (supplier-facing) stage. */
export function isPoReleased(status) {
  return PO_RELEASED_STAGES.includes(normalizePOStatus(status));
}

export default {
  normalizePOStatus,
  normalizePoRecord,
  PO_CANONICAL_STAGES,
  PO_RELEASED_STAGES,
  isPoReleased,
  LEGACY_STAGE_MAP
};
