package com.vishatech.erp.dto;

import com.vishatech.erp.entity.DocumentAudit;
import java.time.LocalDateTime;

public record DocumentAuditResponse(
        Long id,
        Long documentId,
        Long versionId,
        String action,
        Long userId,
        String userName,
        String sourceModule,
        Long sourceRecordId,
        String recordNumber,
        String previousState,
        String newState,
        String ipAddress,
        LocalDateTime timestamp
) {
    public static DocumentAuditResponse from(DocumentAudit a) {
        return new DocumentAuditResponse(
                a.getId(),
                a.getDocumentId(),
                a.getVersionId(),
                a.getAction(),
                a.getUserId(),
                a.getUserName(),
                a.getSourceModule(),
                a.getSourceRecordId(),
                a.getRecordNumber(),
                a.getPreviousState(),
                a.getNewState(),
                a.getIpAddress(),
                a.getTimestamp()
        );
    }
}