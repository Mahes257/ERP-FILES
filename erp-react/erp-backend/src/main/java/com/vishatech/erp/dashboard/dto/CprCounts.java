package com.vishatech.erp.dashboard.dto;

/**
 * CPR counters. Only the current revision of each CPR chain is counted, exactly
 * as the CPR module's own stats document does.
 *
 * @param total          every current CPR that is neither archived nor deleted
 * @param pendingApproval current CPRs waiting for approval
 * @param draft          current draft CPRs
 * @param approved       current approved CPRs
 * @param rejected       current rejected CPRs
 * @param converted      current CPRs converted into a sales document
 */
public record CprCounts(long total, long pendingApproval, long draft, long approved,
                        long rejected, long converted) {
}
