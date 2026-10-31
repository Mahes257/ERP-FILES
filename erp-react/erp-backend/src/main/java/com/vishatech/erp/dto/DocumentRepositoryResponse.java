package com.vishatech.erp.dto;

import com.vishatech.erp.entity.DocumentRepositoryEntry;
import com.vishatech.erp.entity.DocumentVisibility;
import java.time.LocalDateTime;

public record DocumentRepositoryResponse(
        Long id,
        String documentName,
        String documentType,
        String module,
        Long relatedRecordId,
        String recordNumber,
        Long customerId,
        String customerName,
        String filePath,
        String fileType,
        long fileSize,
        int versionNumber,
        DocumentVisibility visibility,
        String status,
        String uploadedBy,
        Long uploadedById,
        String description,
        String metadata,
        LocalDateTime createdAt,
        LocalDateTime updatedAt,
        // Permission flags for the current user
        boolean canView,
        boolean canDownload,
        boolean canEdit,
        boolean canDelete
) {
    public static DocumentRepositoryResponse from(DocumentRepositoryEntry e) {
        return new DocumentRepositoryResponse(
                e.getId(),
                e.getDocumentName(),
                e.getDocumentType(),
                e.getModule(),
                e.getRelatedRecordId(),
                e.getRecordNumber(),
                e.getCustomerId(),
                e.getCustomerName(),
                e.getFilePath(),
                e.getFileType(),
                e.getFileSize(),
                e.getVersionNumber(),
                e.getVisibility(),
                e.getStatus(),
                e.getUploadedBy(),
                e.getUploadedById(),
                e.getDescription(),
                e.getMetadata(),
                e.getCreatedAt(),
                e.getUpdatedAt(),
                true, true, true, true // defaults — overridden by service
        );
    }
}
