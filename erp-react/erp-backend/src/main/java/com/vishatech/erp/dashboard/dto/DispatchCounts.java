package com.vishatech.erp.dashboard.dto;

/**
 * Dispatch counters by status.
 *
 * @param total      every dispatch
 * @param ready      dispatches ready to go
 * @param dispatched dispatches sent
 * @param inTransit  dispatches in transit
 * @param delivered  dispatches delivered
 */
public record DispatchCounts(long total, long ready, long dispatched, long inTransit, long delivered) {
}
