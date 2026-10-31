package com.vishatech.erp.dto;

import java.util.Map;

/** One saved version of a CRM record (Customer / Lead / Follow-up). */
public record RecordRevisionResponse(
        long id,
        int version,
        String changedBy,
        String createdAt,
        Map<String, String> fields
) {
}
