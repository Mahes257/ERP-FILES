package com.vishatech.erp.dto;

import java.util.Map;

/**
 * One E-Action / Participation row as it appears in the standalone E-Actions
 * view: the persisted {@code sales_order_e_actions} fields plus the CPO context
 * (which order it belongs to) so a single row can be shown, filtered and
 * opened without loading the whole CPO.
 */
public record SalesOrderEActionListResponse(
        Long id,
        Long salesOrderId,
        String cpoNo,
        String customer,
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
        /** Real stored creation timestamp of the row (the only audit date the row carries). */
        String createdAt,
        /**
         * The CPO reference the user typed when this action is NOT linked to a
         * stored CPO ({@code salesOrderId} is null then). Clients display it in
         * place of the CPO number and never treat it as a record id.
         */
        String cpoReference
) {
}
