package com.vishatech.erp.dto;

import java.util.List;

public record EditHistoryGroupResponse(
        int version,
        String changedBy,
        String createdAt,
        String changeSummary,
        List<FieldChange> changes
) {
    public record FieldChange(String field, String oldValue, String newValue) {}
}