package com.vishatech.erp.dto;

/**
 * One column of the CPR Item Details grid.
 *
 * System columns carry a stable key (drawingNo, description, ...) matching the
 * real CprItem entity fields; custom columns carry a stable generated id
 * (custom_xxx) whose per-row values are stored in CprItem.customFieldsJson.
 * Display labels may be renamed freely — internal keys/ids never change, so
 * renaming never breaks backend mappings.
 */
public record CprItemColumn(
        String id,
        String key,
        String label,
        String type,
        Boolean required,
        Boolean system,
        Integer order,
        Boolean hidden
) {
}
