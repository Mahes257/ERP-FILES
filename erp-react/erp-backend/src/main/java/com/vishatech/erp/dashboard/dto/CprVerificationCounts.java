package com.vishatech.erp.dashboard.dto;

/**
 * CPR technical-verification counters.
 *
 * @param total             every technical-verification record
 * @param draft             records still in draft
 * @param underVerification records under verification
 * @param verified          records approved or with verification completed
 * @param rejected          records rejected
 */
public record CprVerificationCounts(long total, long draft, long underVerification,
                                    long verified, long rejected) {
}
