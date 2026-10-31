package com.vishatech.erp.dto;

/**
 * Attachment payload for Cost Workouts — mirrors the original ERP's
 * cwFiles entries ({name, size, type, data(base64)}). Used both in the
 * create/update request and the /attachments response.
 */
public record CostWorkoutAttachment(
        String name,
        Long size,
        String type,
        String data
) {
}
