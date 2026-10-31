package com.vishatech.erp.dashboard.dto;

/**
 * Packing-list counters by status.
 *
 * @param total            every packing list
 * @param pending          pending lists
 * @param inProgress       lists in progress
 * @param completed        completed lists
 * @param readyForDispatch lists ready for dispatch
 */
public record PackingCounts(long total, long pending, long inProgress,
                            long completed, long readyForDispatch) {
}
