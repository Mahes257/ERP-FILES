package com.vishatech.erp.dashboard.dto;

/**
 * A total with the three outcomes the dashboard renders for a reviewed record
 * set: pending, verified and rejected. Used for technical verification,
 * drawings and models.
 *
 * @param total    every record
 * @param pending  records waiting for review
 * @param verified records verified
 * @param rejected records rejected
 */
public record ApprovalCounts(long total, long pending, long verified, long rejected) {
}
