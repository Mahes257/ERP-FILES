package com.vishatech.erp.dto;

public record CprTimelineResponse(
        Long id,
        String type,
        String title,
        String detail,
        String field,
        String oldValue,
        String newValue,
        Long userId,
        String userName,
        String userRole,
        String ipAddress,
        String deviceInfo,
        String createdAt
) {
}
