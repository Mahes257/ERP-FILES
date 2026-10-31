package com.vishatech.erp.dto;

public record DocumentVersionResponse(
        Long id,
        int versionNumber,
        String documentName,
        String filePath,
        String fileType,
        long fileSize,
        String storedName,
        String changeNotes,
        String uploadedBy,
        String uploadedAt
) {
}
