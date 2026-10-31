package com.vishatech.erp.crm.dto;

public record CustomerTimelineEntry(
        String type,
        String title,
        String detail,
        String createdAt
) {
}
