package com.vishatech.erp.dto;

/**
 * Attachment payload for Profit Workouts — mirrors the original ERP's
 * cwFiles entries ({name, size, type, data(base64)}). Used both in the
 * create/update request and the /attachments response.
 */
public record ProfitWorkoutAttachment(
        String name,
        Long size,
        String type,
        String data
) {
}
