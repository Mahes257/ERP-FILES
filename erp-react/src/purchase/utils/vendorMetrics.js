/**
 * purchase/utils/vendorMetrics.js
 * ------------------------------------------------------------------
 * Shared vendor scoring / metrics helpers used by the performance
 * board, approved-vendors list and reports. Single source of truth
 * so the composite score, quality % and preferred threshold never
 * drift between pages.
 * ------------------------------------------------------------------
 */

/** A vendor qualifies as Preferred at or above this rating. */
export const PREFERRED_RATING = 4.2;

/**
 * Coerces a metric to a finite number. The performance board is fed by
 * the API, where a supplier with no transaction history legitimately has
 * no delivery/order/spend aggregate yet — those missing (or non-numeric)
 * values must degrade to the documented zero/empty state rather than
 * propagating NaN into the rendered score, KPIs and charts.
 */
export function metricNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Composite performance score (0–100):
 * 40% rating, 30% on-time delivery, 15% lead time, 15% order volume.
 */
export function computeVendorScore(vendor = {}) {
  const rating = Math.min(metricNumber(vendor.rating), 5) / 5;
  const onTime = Math.min(metricNumber(vendor.onTimeDelivery), 100) / 100;
  const leadTime = Math.max(0, 1 - metricNumber(vendor.leadTimeDays) / 60);
  const volume = Math.min(metricNumber(vendor.orders) / 30, 1);
  return Math.round((rating * 40 + onTime * 30 + leadTime * 15 + volume * 15) * 10) / 10;
}

/** Rating out of 5 → quality percentage (0–100). */
export function qualityOfVendor(vendor = {}) {
  return Math.round((Math.min(metricNumber(vendor.rating), 5) / 5) * 100);
}

/** True when a vendor's rating meets the preferred threshold. */
export function isPreferredVendor(vendor = {}) {
  return metricNumber(vendor.rating) >= PREFERRED_RATING;
}
