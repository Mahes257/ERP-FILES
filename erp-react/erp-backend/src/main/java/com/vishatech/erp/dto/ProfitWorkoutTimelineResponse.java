package com.vishatech.erp.dto;

public record ProfitWorkoutTimelineResponse(
        Long id,
        String type,
        String title,
        String detail,
        String createdAt
) {
}
