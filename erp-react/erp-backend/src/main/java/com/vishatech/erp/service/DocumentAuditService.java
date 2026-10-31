package com.vishatech.erp.service;

import com.vishatech.erp.dto.DocumentAuditResponse;
import com.vishatech.erp.entity.DocumentAudit;
import com.vishatech.erp.entity.DocumentRepositoryEntry;
import com.vishatech.erp.repository.DocumentAuditRepository;
import com.vishatech.erp.util.AuditContext;
import java.time.LocalDateTime;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Centralised persistence of document lifecycle events.
 *
 * Every document mutation records an entry so the audit trail is always
 * retrievable from the database and survives restarts.
 */
@Service
public class DocumentAuditService {

    private final DocumentAuditRepository repository;
    private final AuditContext auditContext;

    public DocumentAuditService(DocumentAuditRepository repository, AuditContext auditContext) {
        this.repository = repository;
        this.auditContext = auditContext;
    }

    /** Record a document-lifecycle event (no version link). */
    @Transactional
    public void record(DocumentRepositoryEntry doc, String action,
                       DocumentRepositoryEntry previous, DocumentRepositoryEntry current) {
        DocumentAudit audit = new DocumentAudit();
        audit.setDocumentId(doc.getId());
        audit.setAction(action);
        audit.setUserId(auditContext.currentUserId());
        audit.setUserName(auditContext.currentUserName());
        audit.setSourceModule(doc.getModule());
        audit.setSourceRecordId(doc.getRelatedRecordId());
        audit.setRecordNumber(doc.getRecordNumber());
        audit.setPreviousState(previous == null ? null : entryState(previous));
        audit.setNewState(current == null ? null : entryState(current));
        audit.setIpAddress(auditContext.ipAddress());
        audit.setDeviceInfo(auditContext.deviceInfo());
        audit.setTimestamp(LocalDateTime.now());
        repository.save(audit);
    }

    /** Record a lifecycle event tied to a specific version row. */
    @Transactional
    public void record(DocumentRepositoryEntry doc, Long versionId, String action,
                       DocumentRepositoryEntry previous, DocumentRepositoryEntry current) {
        DocumentAudit audit = new DocumentAudit();
        audit.setDocumentId(doc.getId());
        audit.setVersionId(versionId);
        audit.setAction(action);
        audit.setUserId(auditContext.currentUserId());
        audit.setUserName(auditContext.currentUserName());
        audit.setSourceModule(doc.getModule());
        audit.setSourceRecordId(doc.getRelatedRecordId());
        audit.setRecordNumber(doc.getRecordNumber());
        audit.setPreviousState(previous == null ? null : entryState(previous));
        audit.setNewState(current == null ? null : entryState(current));
        audit.setIpAddress(auditContext.ipAddress());
        audit.setDeviceInfo(auditContext.deviceInfo());
        audit.setTimestamp(LocalDateTime.now());
        repository.save(audit);
    }

    /** Record a read/download access event (VIEWED / DOWNLOADED). */
    @Transactional
    public void recordAccess(DocumentRepositoryEntry doc, Integer versionNumber, String action) {
        DocumentAudit audit = new DocumentAudit();
        audit.setDocumentId(doc.getId());
        if (versionNumber != null) {
            audit.setVersionId(versionNumber.longValue());
        }
        audit.setAction(action);
        audit.setUserId(auditContext.currentUserId());
        audit.setUserName(auditContext.currentUserName());
        audit.setSourceModule(doc.getModule());
        audit.setSourceRecordId(doc.getRelatedRecordId());
        audit.setRecordNumber(doc.getRecordNumber());
        audit.setIpAddress(auditContext.ipAddress());
        audit.setDeviceInfo(auditContext.deviceInfo());
        audit.setTimestamp(LocalDateTime.now());
        repository.save(audit);
    }

    @Transactional(readOnly = true)
    public List<DocumentAuditResponse> getByDocument(Long documentId) {
        return repository.findByDocumentIdOrderByIdAsc(documentId)
                .stream()
                .map(DocumentAuditResponse::from)
                .toList();
    }

    /** Remove all audit rows for a document (used by permanent delete). */
    @Transactional
    public void deleteByDocument(Long documentId) {
        repository.deleteByDocumentId(documentId);
    }

    private String entryState(DocumentRepositoryEntry e) {
        return "{\"documentName\":\"" + safe(e.getDocumentName())
                + "\",\"documentType\":\"" + safe(e.getDocumentType())
                + "\",\"status\":\"" + safe(e.getStatus())
                + "\",\"versionNumber\":" + e.getVersionNumber()
                + ",\"visibility\":\"" + safe(String.valueOf(e.getVisibility()))
                + "\",\"recordNumber\":\"" + safe(e.getRecordNumber()) + "\"}";
    }

    private String safe(String value) {
        if (value == null) return "";
        return value.replace("\\", "\\\\").replace("\"", "\\\"");
    }
}