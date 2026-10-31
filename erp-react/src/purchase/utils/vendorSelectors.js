/**
 * purchase/utils/vendorSelectors.js
 * ------------------------------------------------------------------
 * Centralized vendor data selectors. Every vendor page (Performance,
 * Reports, Purchase Reports) consumes the same source of truth
 * through these functions. No business logic is duplicated inside
 * individual components.
 * ------------------------------------------------------------------
 */
import { VENDOR_STATUS } from '../constants';
import { computeVendorScore, isPreferredVendor, qualityOfVendor } from './vendorMetrics';

/**
 * Compute summary statistics from an array of vendor records.
 * Returns: total, approved, pending, blocked, preferred, totalSpend,
 * avgRating, avgOnTime, qualityScore, avgLeadTime, topVendor.
 */
export function computeVendorStats(vendors) {
  const total = vendors.length;
  const approved = vendors.filter((v) => v.status === VENDOR_STATUS.APPROVED).length;
  const pending = vendors.filter((v) => v.status === VENDOR_STATUS.PENDING).length;
  const blocked = vendors.filter((v) => v.status === VENDOR_STATUS.BLOCKED).length;
  const preferred = vendors.filter((v) => isPreferredVendor(v)).length;
  const totalSpend = vendors.reduce((sum, v) => sum + (Number(v.spend) || 0), 0);
  const avgRating = total
    ? Math.round((vendors.reduce((sum, v) => sum + (Number(v.rating) || 0), 0) / total) * 10) / 10
    : 0;
  const avgOnTime = total
    ? Math.round(vendors.reduce((sum, v) => sum + (Number(v.onTimeDelivery) || 0), 0) / total)
    : 0;
  const qualityScore = total
    ? Math.round(vendors.reduce((sum, v) => sum + qualityOfVendor(v), 0) / total)
    : 0;
  const avgLeadTime = total
    ? Math.round((vendors.reduce((sum, v) => sum + (Number(v.leadTimeDays) || 0), 0) / total) * 10) / 10
    : 0;

  const sorted = [...vendors].sort((a, b) => (Number(b.spend) || 0) - (Number(a.spend) || 0));
  const topVendor = sorted[0] || null;

  return {
    total,
    approved,
    pending,
    blocked,
    preferred,
    totalSpend,
    avgRating,
    avgOnTime,
    qualityScore,
    avgLeadTime,
    topVendor
  };
}

/**
 * Rank vendors by spend, descending. Returns array of objects:
 * { rank, id, name, category, spend, spendPct, orders }
 */
export function rankVendorsBySpend(vendors, limit) {
  const totalSpend = vendors.reduce((sum, v) => sum + (Number(v.spend) || 0), 0);
  const ranked = [...vendors]
    .sort((a, b) => (Number(b.spend) || 0) - (Number(a.spend) || 0))
    .map((v, i) => ({
      rank: i + 1,
      id: v.id,
      name: v.name,
      category: v.category,
      spend: Number(v.spend) || 0,
      spendPct: totalSpend > 0 ? Math.round(((Number(v.spend) || 0) / totalSpend) * 1000) / 10 : 0,
      orders: v.orders || 0
    }));
  return limit ? ranked.slice(0, limit) : ranked;
}

/**
 * Rank vendors by composite performance score, descending.
 * Returns: { id, name, category, score, rating, onTimeDelivery, leadTimeDays, orders, spend }
 */
export function rankVendorsByScore(vendors, limit) {
  const ranked = [...vendors]
    .map((v) => ({ ...v, score: computeVendorScore(v) }))
    .sort((a, b) => b.score - a.score);
  return limit ? ranked.slice(0, limit) : ranked;
}

/**
 * Group vendors by category and compute average on-time delivery.
 * Returns: [{ category, avgOnTime, count }]
 */
export function vendorsByCategory(vendors) {
  const map = {};
  vendors.forEach((v) => {
    const key = v.category || 'Other';
    if (!map[key]) map[key] = { total: 0, count: 0 };
    map[key].total += Number(v.onTimeDelivery) || 0;
    map[key].count += 1;
  });
  return Object.entries(map)
    .map(([category, data]) => ({
      category,
      avgOnTime: Math.round(data.total / data.count),
      count: data.count
    }))
    .sort((a, b) => b.avgOnTime - a.avgOnTime);
}

/**
 * Group vendors by category and sum spend.
 * Returns: [{ category, spend, vendors }]
 */
export function spendByCategory(vendors) {
  const map = {};
  vendors.forEach((v) => {
    const key = v.category || 'Other';
    if (!map[key]) map[key] = { spend: 0, vendors: 0 };
    map[key].spend += Number(v.spend) || 0;
    map[key].vendors += 1;
  });
  return Object.entries(map)
    .map(([category, data]) => ({ category, spend: Math.round(data.spend), vendors: data.vendors }))
    .sort((a, b) => b.spend - a.spend);
}

/**
 * Top N vendors by spend for chart display.
 * Returns: [{ name, value }]
 */
export function topVendorsBySpend(vendors, limit = 6) {
  return [...vendors]
    .sort((a, b) => (Number(b.spend) || 0) - (Number(a.spend) || 0))
    .slice(0, limit)
    .map((v) => ({ name: v.name, value: Number(v.spend) || 0 }));
}

/**
 * Vendor spend share (percentage) for each vendor.
 * Returns: [{ id, name, share }]
 */
export function vendorSpendShares(vendors) {
  const total = vendors.reduce((sum, v) => sum + (Number(v.spend) || 0), 0);
  return [...vendors]
    .sort((a, b) => (Number(b.spend) || 0) - (Number(a.spend) || 0))
    .map((v) => ({
      id: v.id,
      name: v.name,
      share: total > 0 ? Math.round(((Number(v.spend) || 0) / total) * 1000) / 10 : 0
    }));
}
