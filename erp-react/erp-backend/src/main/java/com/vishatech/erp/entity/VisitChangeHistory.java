package com.vishatech.erp.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

/**
 * Records before/after values when a marketing visit is edited or rescheduled.
 * One row per changed field per edit event.
 */
@Entity
@Table(name = "visit_change_history")
public class VisitChangeHistory {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** The marketing visit that was changed. */
    @Column(name = "visit_id", nullable = false)
    private Long visitId;

    /** Field label shown to the user, e.g. "Schedule Date", "Meeting Person". */
    @Column(name = "field_name", nullable = false)
    private String fieldName;

    /** Internal field key used programmatically, e.g. "scheduleDate". */
    @Column(name = "field_key", nullable = false)
    private String fieldKey;

    /** Value before the change (may be null for new values). */
    @Column(name = "old_value", columnDefinition = "TEXT")
    private String oldValue;

    /** Value after the change (may be null for deletions). */
    @Column(name = "new_value", columnDefinition = "TEXT")
    private String newValue;

    /** Type of change: EDIT, RESCHEDULE, STATUS_CHANGE */
    @Column(name = "change_type", nullable = false)
    private String changeType;

    /** Who made the change. */
    @Column(name = "changed_by")
    private String changedBy;

    /** When the change was made. */
    @Column(name = "changed_at", nullable = false)
    private LocalDateTime changedAt;

    @PrePersist
    protected void onCreate() {
        if (changedAt == null) changedAt = LocalDateTime.now();
    }

    // --- Constructors ---
    public VisitChangeHistory() {}

    public VisitChangeHistory(Long visitId, String fieldName, String fieldKey,
                               String oldValue, String newValue, String changeType, String changedBy) {
        this.visitId = visitId;
        this.fieldName = fieldName;
        this.fieldKey = fieldKey;
        this.oldValue = oldValue;
        this.newValue = newValue;
        this.changeType = changeType;
        this.changedBy = changedBy;
    }

    // --- Getters & Setters ---
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Long getVisitId() { return visitId; }
    public void setVisitId(Long visitId) { this.visitId = visitId; }

    public String getFieldName() { return fieldName; }
    public void setFieldName(String fieldName) { this.fieldName = fieldName; }

    public String getFieldKey() { return fieldKey; }
    public void setFieldKey(String fieldKey) { this.fieldKey = fieldKey; }

    public String getOldValue() { return oldValue; }
    public void setOldValue(String oldValue) { this.oldValue = oldValue; }

    public String getNewValue() { return newValue; }
    public void setNewValue(String newValue) { this.newValue = newValue; }

    public String getChangeType() { return changeType; }
    public void setChangeType(String changeType) { this.changeType = changeType; }

    public String getChangedBy() { return changedBy; }
    public void setChangedBy(String changedBy) { this.changedBy = changedBy; }

    public LocalDateTime getChangedAt() { return changedAt; }
    public void setChangedAt(LocalDateTime changedAt) { this.changedAt = changedAt; }
}
