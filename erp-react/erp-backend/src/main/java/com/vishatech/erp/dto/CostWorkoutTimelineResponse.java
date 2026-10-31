package com.vishatech.erp.dto;

public record CostWorkoutTimelineResponse(
        Long id,
        String type,
        String title,
        String detail,
        String createdAt
) {
}
