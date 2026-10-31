package com.vishatech.erp.dto;

public record TechnicalVerificationDocumentResponse(
        Long id,
        String name,
        String contentType,
        Long size,
        String url,
        String visibility,
        String documentCategory,
        boolean sentToCostWorkout,
        Long costWorkoutId,
        String costWorkoutCwNo,
        String sentAt,
        String sentBy,
        String uploadedBy,
        String uploadedAt
) {
}
