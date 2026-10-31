package com.vishatech.erp.dashboard.dto;

/**
 * Follow-up workload for the dashboard's workflow stages.
 *
 * @param total       every follow-up that is not deleted (the workflow total)
 * @param open        follow-ups whose status is open
 * @param completed   follow-ups whose status is completed
 * @param rescheduled follow-ups whose status is rescheduled
 * @param overdue     open follow-ups whose next follow-up date is before today
 */
public record FollowUpCounts(long total, long open, long completed, long rescheduled, long overdue) {
}
