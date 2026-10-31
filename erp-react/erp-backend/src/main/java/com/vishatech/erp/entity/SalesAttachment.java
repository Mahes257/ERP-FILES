package com.vishatech.erp.entity;

import com.vishatech.erp.service.AttachmentStorageLedgerListener;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EntityListeners;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import java.time.LocalDateTime;

/**
 * Generic attachment shared by all Sales Execution modules.
 */
@Entity
@EntityListeners(AttachmentStorageLedgerListener.class)
@Table(name = "sales_attachments", indexes = {
        @Index(name = "idx_sales_attachments_module", columnList = "moduleType,moduleId")
})
public class SalesAttachment implements AttachmentSized {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 40)
    private String moduleType;

    @Column(nullable = false)
    private Long moduleId;

    @Column(nullable = false, length = 255)
    private String name;

    @Column(nullable = false, length = 255)
    private String storedName;

    private String contentType;

    private long size;

    private String url;

    private LocalDateTime uploadedAt;

    /**
     * Who uploaded the file (the authenticated principal name, resolved the
     * same way the edit history resolves {@code changedBy}). Nullable: rows
     * written before this column existed simply render without an uploader.
     */
    @Column(length = 120)
    private String uploadedBy;

    /**
     * The attachment's own category, for the modules that document one — a
     * Sales Contract distinguishes an E-Sign (digitally signed) file from a
     * Scanned Copy of a signed/physical contract. Nullable and free-form: an
     * upload that names no category (every other sales module, and every row
     * written before this column existed) simply renders without one, so the
     * shared attachment store keeps one table and no module has to adopt the
     * concept. Values are normalised by the owning service (trimmed, length
     * capped at the column width).
     */
    @Column(length = 40)
    private String attachmentCategory;

    @PrePersist
    void onCreate() {
        uploadedAt = LocalDateTime.now();
    }

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

    public Long getModuleId() {
        return moduleId;
    }

    public void setModuleId(Long moduleId) {
        this.moduleId = moduleId;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getStoredName() {
        return storedName;
    }

    public void setStoredName(String storedName) {
        this.storedName = storedName;
    }

    public String getContentType() {
        return contentType;
    }

    public void setContentType(String contentType) {
        this.contentType = contentType;
    }

    public long getSize() {
        return size;
    }

    public void setSize(long size) {
        this.size = size;
    }

    public String getUrl() {
        return url;
    }

    public void setUrl(String url) {
        this.url = url;
    }

    public String getUploadedBy() {
        return uploadedBy;
    }

    public void setUploadedBy(String uploadedBy) {
        this.uploadedBy = uploadedBy;
    }

    public String getAttachmentCategory() {
        return attachmentCategory;
    }

    public void setAttachmentCategory(String attachmentCategory) {
        this.attachmentCategory = attachmentCategory;
    }

    public LocalDateTime getUploadedAt() {
        return uploadedAt;
    }

    public void setUploadedAt(LocalDateTime uploadedAt) {
        this.uploadedAt = uploadedAt;
    }
}
