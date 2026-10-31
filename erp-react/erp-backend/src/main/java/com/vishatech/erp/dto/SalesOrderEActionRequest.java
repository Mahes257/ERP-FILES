package com.vishatech.erp.dto;

import java.util.Map;

/**
 * One E-Action / Participation record of a Customer Purchase Order.
 *
 * <p>{@code customFields} carries the values of the user-defined columns for
 * this row, keyed by the column's stable id (the column label is NEVER part of
 * the key, so renaming a column never orphans its data).
 *
 * <p>{@code salesOrderId} is the CPO this action belongs to. It is optional:
 * an action may instead carry a manually entered {@code cpoReference} for an
 * order that has no CPO record here (the standalone E-Actions endpoints read
 * these two fields; the CPO-nested endpoints take the id from the path).
 */
public record SalesOrderEActionRequest(
        Long id,
        String participantTeam,
        String assignedAction,
        String assignedTo,
        String status,
        String requestedOn,
        String startedOn,
        String completedOn,
        String result,
        String remarks,
        Map<String, String> customFields,
        Long salesOrderId,
        String cpoReference
) {
}
