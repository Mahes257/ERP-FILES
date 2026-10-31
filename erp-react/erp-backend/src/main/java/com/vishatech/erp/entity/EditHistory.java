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
 * Generic field-level edit history shared by ALL editable modules.
 *
 * Every successful update across Leads, CPR, Cost Workout, Customers,
 * Follow-ups and every Sales Execution module (Quotation, Sales Order,
 * Sales Contract, Proforma Invoice, Delivery Challan, Invoice, Credit
 * Note, Payment Receipt, etc.) records per-field diffs here.
 *
 * Rows belonging to the same save are grouped under the same
 * {@code version} number, which increments sequentially per record.
 */
@Entity
@Table(name = "edit_history", indexes = {
        @Index(name = "idx_edit_history_record", columnList = "moduleType,recordId")
})
public class EditHistory {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 40)
    private String moduleType;

    @Column(nullable = false)
    private Long recordId;

    /** Sequential version number (1 = first edit, 2 = second, …). */
    private int version;

    /** The name of the field that changed (column name or label). */
    private String field;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String oldValue;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String newValue;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String changeSummary;

    private String changedBy;

    private LocalDateTime createdAt;

    @PrePersist
    void onCreate() {
        createdAt = LocalDateTime.now();
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getModuleType() { return moduleType; }
    public void setModuleType(String moduleType) { this.moduleType = moduleType; }

    public Long getRecordId() { return recordId; }
    public void setRecordId(Long recordId) { this.recordId = recordId; }

    public int getVersion() { return version; }
    public void setVersion(int version) { this.version = version; }

    public String getField() { return field; }
    public void setField(String field) { this.field = field; }

    public String getOldValue() { return oldValue; }
    public void setOldValue(String oldValue) { this.oldValue = oldValue; }

    public String getNewValue() { return newValue; }
    public void setNewValue(String newValue) { this.newValue = newValue; }

    public String getChangeSummary() { return changeSummary; }
    public void setChangeSummary(String changeSummary) { this.changeSummary = changeSummary; }

    public String getChangedBy() { return changedBy; }
    public void setChangedBy(String changedBy) { this.changedBy = changedBy; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
}