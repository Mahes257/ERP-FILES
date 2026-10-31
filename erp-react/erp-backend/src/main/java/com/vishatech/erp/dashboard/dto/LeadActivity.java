package com.vishatech.erp.dashboard.dto;

import java.time.LocalDateTime;

/**
 * One lead row for the dashboard's recent-activity feed, before the dashboard
 * turns it into its own activity entry (type label, reference and route are
 * presentation and stay in the dashboard).
 *
 * @param id        lead id
 * @param company   company name, if any
 * @param name      lead name, used when there is no company
 * @param stage     stage name
 * @param createdAt creation timestamp
 */
public record LeadActivity(Long id, String company, String name, String stage, LocalDateTime createdAt) {
}
