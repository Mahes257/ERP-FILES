package com.vishatech.erp.dashboard.dto;

/**
 * Open follow-up buckets the dashboards alert on, counted against one day.
 *
 * @param open        every open follow-up
 * @param overdue     open follow-ups whose next follow-up date is before today
 * @param today       open follow-ups whose follow-up date is today
 * @param dueThisWeek open follow-ups whose next follow-up date falls in the next seven days
 */
public record FollowUpActivity(long open, long overdue, long today, long dueThisWeek) {
}
