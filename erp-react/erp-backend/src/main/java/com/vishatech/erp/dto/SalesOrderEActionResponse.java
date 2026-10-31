package com.vishatech.erp.dto;

import java.util.Map;

/** One persisted E-Action / Participation record of a Customer Purchase Order. */
public record SalesOrderEActionResponse(
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
        Map<String, String> customFields
) {
}
