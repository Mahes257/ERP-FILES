package com.vishatech.erp.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDateTime;

/**
 * Full-state snapshot of a CRM record (Customer / Lead / Follow-up) captured on
 * every edit.  The master row keeps its id (so clientId/leadId references stay
 * intact); each edit appends one row here so the complete prior state is
 * permanently preserved and can be shown in the version-history UI.
 */
@Entity
@Table(name = "record_revisions")
public class RecordRevision {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** "customer", "lead", "follow-up" */
    @Column(nullable = false, length = 40)
    private String moduleType;

    /** Id of the master record that was edited. */
    @Column(nullable = false)
    private Long recordId;

    /** 1, 2, 3, ... per edit (increments within the module+record). */
    @Column(nullable = false)
    private int version;

    /** Full scalar-field snapshot of the record BEFORE the edit, as JSON. */
    @Column(columnDefinition = "TEXT")
    private String snapshotJson;

    private String changedBy;

    private LocalDateTime createdAt;

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getModuleType() {
        return moduleType;
    }

    public void setModuleType(String moduleType) {
        this.moduleType = moduleType;
    }

    public Long getRecordId() {
        return recordId;
    }

    public void setRecordId(Long recordId) {
        this.recordId = recordId;
    }

    public int getVersion() {
        return version;
    }

    public void setVersion(int version) {
        this.version = version;
    }

    public String getSnapshotJson() {
        return snapshotJson;
    }

    public void setSnapshotJson(String snapshotJson) {
        this.snapshotJson = snapshotJson;
    }

    public String getChangedBy() {
        return changedBy;
    }

    public void setChangedBy(String changedBy) {
        this.changedBy = changedBy;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }
}
