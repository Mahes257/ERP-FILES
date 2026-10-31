package com.vishatech.erp.dashboard.dto;

import java.time.LocalDateTime;

/**
 * One CPR row for the dashboard's recent-activity feed.
 *
 * @param id         CPR id
 * @param prNo       CPR reference
 * @param clientName client name, if any
 * @param company    company name, used when there is no client name
 * @param status     status name
 * @param createdAt  creation timestamp
 */
public record CprActivity(Long id, String prNo, String clientName, String company,
                          String status, LocalDateTime createdAt) {
}
