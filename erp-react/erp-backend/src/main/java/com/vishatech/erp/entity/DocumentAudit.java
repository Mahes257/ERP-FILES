package com.vishatech.erp.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Lob;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import java.time.LocalDateTime;

/**
 * Persistent audit trail for document lifecycle events.
 *
 * Every significant event on a document (created, edited, versioned, viewed,
 * downloaded, archived, restored, deleted) is recorded here so the trial can
 * be reconstructed independently of the document row itself.
 */
@Entity
@Table(name = "document_audit", indexes = {
        @Index(name = "idx_doc_audit_document", columnList = "documentId"),
        @Index(name = "idx_doc_audit_action", columnList = "action"),
        @Index(name = "idx_doc_audit_timestamp", columnList = "timestamp")
})
public class DocumentAudit {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long documentId;

    private Long versionId;

    @Column(nullable = false, length = 40)
    private String action;

    private Long userId;

    @Column(length = 255)
    private String userName;

    @Column(length = 100)
    private String sourceModule;

    private Long sourceRecordId;

    @Column(length = 100)
    private String recordNumber;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String previousState;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String newState;

    @Column(length = 64)
    private String ipAddress;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String deviceInfo;

    private LocalDateTime timestamp;

    @PrePersist
    void onCreate() {
        if (timestamp == null) {
            timestamp = LocalDateTime.now();
        }
    }

    public Long getId() { return id; }

    public Long getDocumentId() { return documentId; }
    public void setDocumentId(Long documentId) { this.documentId = documentId; }

    public Long getVersionId() { return versionId; }
    public void setVersionId(Long versionId) { this.versionId = versionId; }

    public String getAction() { return action; }
    public void setAction(String action) { this.action = action; }

    public Long getUserId() { return userId; }
    public void setUserId(Long userId) { this.userId = userId; }

    public String getUserName() { return userName; }
    public void setUserName(String userName) { this.userName = userName; }

    public String getSourceModule() { return sourceModule; }
    public void setSourceModule(String sourceModule) { this.sourceModule = sourceModule; }

    public Long getSourceRecordId() { return sourceRecordId; }
    public void setSourceRecordId(Long sourceRecordId) { this.sourceRecordId = sourceRecordId; }

    public String getRecordNumber() { return recordNumber; }
    public void setRecordNumber(String recordNumber) { this.recordNumber = recordNumber; }

    public String getPreviousState() { return previousState; }
    public void setPreviousState(String previousState) { this.previousState = previousState; }

    public String getNewState() { return newState; }
    public void setNewState(String newState) { this.newState = newState; }

    public String getIpAddress() { return ipAddress; }
    public void setIpAddress(String ipAddress) { this.ipAddress = ipAddress; }

    public String getDeviceInfo() { return deviceInfo; }
    public void setDeviceInfo(String deviceInfo) { this.deviceInfo = deviceInfo; }

    public LocalDateTime getTimestamp() { return timestamp; }
    public void setTimestamp(LocalDateTime timestamp) { this.timestamp = timestamp; }
}