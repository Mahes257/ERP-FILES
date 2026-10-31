package com.vishatech.erp.dashboard.dto;

/**
 * Quality-inspection counters by status.
 *
 * @param total      every inspection
 * @param pending    inspections pending
 * @param inProgress inspections in progress
 * @param passed     inspections passed
 * @param failed     inspections failed
 * @param hold       inspections on hold
 */
public record QualityCounts(long total, long pending, long inProgress,
                            long passed, long failed, long hold) {
}
