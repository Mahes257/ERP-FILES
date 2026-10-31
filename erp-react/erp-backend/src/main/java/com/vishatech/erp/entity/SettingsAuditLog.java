package com.vishatech.erp.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import java.time.LocalDateTime;

/**
 * Audit trail for application settings changes.
 *
 * One row is written every time an ADMIN modifies the marketing or financial
 * settings through the settings endpoints.  Stored in the same {@code app_settings}
 * family so it can be queried alongside the active configuration.
 *
 * Columns:
 *   setting_key   – which settings group was changed (e.g. "marketing_settings")
 *   section       – which top-level section (e.g. "leadManagement")
 *   field_path    – dotted path to the changed field (e.g. "leadManagement.leadSources[2]")
 *   previous_value – JSON-serialised previous value (may be null for inserts)
 *   new_value     – JSON-serialised new value
 *   changed_by    – username / principal of the actor
 *   changed_at    – timestamp
 */
@Entity
@Table(name = "settings_audit_log")
public class SettingsAuditLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 60)
    private String settingKey;

    @Column(length = 60)
    private String section;

    @Column(length = 255)
    private String fieldPath;

    @Column(length = 2000000, columnDefinition = "LONGTEXT")
    private String previousValue;

    @Column(length = 2000000, columnDefinition = "LONGTEXT")
    private String newValue;

    @Column(nullable = false, length = 120)
    private String changedBy;

    @Column(nullable = false)
    private LocalDateTime changedAt;

    public SettingsAuditLog() {
    }

    public SettingsAuditLog(String settingKey, String section, String fieldPath,
                            String previousValue, String newValue, String changedBy) {
        this.settingKey = settingKey;
        this.section = section;
        this.fieldPath = fieldPath;
        this.previousValue = previousValue;
        this.newValue = newValue;
        this.changedBy = changedBy;
    }

    @PrePersist
    void onCreate() {
        changedAt = LocalDateTime.now();
    }

    // ── getters / setters ──────────────────────────────────────────────

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getSettingKey() {
        return settingKey;
    }

    public void setSettingKey(String settingKey) {
        this.settingKey = settingKey;
    }

    public String getSection() {
        return section;
    }

    public void setSection(String section) {
        this.section = section;
    }

    public String getFieldPath() {
        return fieldPath;
    }

    public void setFieldPath(String fieldPath) {
        this.fieldPath = fieldPath;
    }

    public String getPreviousValue() {
        return previousValue;
    }

    public void setPreviousValue(String previousValue) {
        this.previousValue = previousValue;
    }

    public String getNewValue() {
        return newValue;
    }

    public void setNewValue(String newValue) {
        this.newValue = newValue;
    }

    public String getChangedBy() {
        return changedBy;
    }

    public void setChangedBy(String changedBy) {
        this.changedBy = changedBy;
    }

    public LocalDateTime getChangedAt() {
        return changedAt;
    }

    public void setChangedAt(LocalDateTime changedAt) {
        this.changedAt = changedAt;
    }
}
