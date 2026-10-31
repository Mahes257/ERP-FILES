package com.vishatech.erp.dto;

public record SalesTimelineResponse(
        Long id,
        String type,
        String title,
        String detail,
        String createdAt
) {
}
