package com.vishatech.erp.dashboard.dto;

/**
 * Shop-floor job counters for one production type (casting, fabrication or
 * assembly), by entry status.
 *
 * @param total      every job of that type
 * @param pending    jobs pending
 * @param inProgress jobs in progress
 * @param hold       jobs on hold
 * @param completed  jobs completed
 */
public record ShopFloorCounts(long total, long pending, long inProgress, long hold, long completed) {
}
