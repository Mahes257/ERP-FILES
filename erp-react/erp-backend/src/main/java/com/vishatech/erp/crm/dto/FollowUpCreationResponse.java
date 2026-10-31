package com.vishatech.erp.crm.dto;

/**
 * Result of the automatic Lead → Follow-up conversion.
 * {@code created} is false when an existing (non-deleted) follow-up for the
 * lead was returned instead of creating a duplicate (idempotent operation).
 */
public record FollowUpCreationResponse(
        boolean created,
        FollowUpResponse followUp
) {
}
