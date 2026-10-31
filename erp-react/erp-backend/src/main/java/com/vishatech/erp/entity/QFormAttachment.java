package com.vishatech.erp.entity;

import com.vishatech.erp.service.AttachmentStorageLedgerListener;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EntityListeners;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import java.time.LocalDateTime;

/**
 * File attachment for a Questionnaire Form.  Attached to the Q Form as a
 * whole (section 23).  Uses the same server-generated UUID storage name
 * convention as every other attachment module.
 */
@Entity
@EntityListeners(AttachmentStorageLedgerListener.class)
@Table(name = "qform_attachments")
public class QFormAttachment implements AttachmentSized {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long formId;

    /** Original filename (sanitised). */
    @Column(nullable = false, length = 255)
    private String name;

    /** Server-generated UUID storage name. */
    @Column(nullable = false, length = 255)
    private String storedName;

    private String contentType;

    private long size;

    /** Optional label — GA, Dimensional Drawing, Sample, Supporting Document */
    private String label;

    private LocalDateTime uploadedAt;

    @PrePersist
    void onCreate() {
        uploadedAt = LocalDateTime.now();
    }

    // ---- Getters and Setters -----------------------------------------------

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Long getFormId() { return formId; }
    public void setFormId(Long formId) { this.formId = formId; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getStoredName() { return storedName; }
    public void setStoredName(String storedName) { this.storedName = storedName; }

    public String getContentType() { return contentType; }
    public void setContentType(String contentType) { this.contentType = contentType; }

    public long getSize() { return size; }
    public void setSize(long size) { this.size = size; }

    public String getLabel() { return label; }
    public void setLabel(String label) { this.label = label; }

    public LocalDateTime getUploadedAt() { return uploadedAt; }
    public void setUploadedAt(LocalDateTime uploadedAt) { this.uploadedAt = uploadedAt; }
}
