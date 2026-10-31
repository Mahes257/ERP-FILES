package com.vishatech.erp.entity;

import com.vishatech.erp.service.AttachmentStorageLedgerListener;
import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@EntityListeners(AttachmentStorageLedgerListener.class)
@Table(name = "marketing_expense_attachments")
public class MarketingExpenseAttachment implements AttachmentSized {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @Column(nullable = false) private Long expenseId;
    @Column(nullable = false) private Long tripId;
    @Column(nullable = false, length = 255) private String name;
    @Column(nullable = false, length = 255) private String storedName;
    private String contentType;
    private long size;
    private LocalDateTime uploadedAt;

    @PrePersist void onCreate() { uploadedAt = LocalDateTime.now(); }

    public Long getId() { return id; } public void setId(Long id) { this.id = id; }
    public Long getExpenseId() { return expenseId; } public void setExpenseId(Long v) { this.expenseId = v; }
    public Long getTripId() { return tripId; } public void setTripId(Long v) { this.tripId = v; }
    public String getName() { return name; } public void setName(String v) { this.name = v; }
    public String getStoredName() { return storedName; } public void setStoredName(String v) { this.storedName = v; }
    public String getContentType() { return contentType; } public void setContentType(String v) { this.contentType = v; }
    public long getSize() { return size; } public void setSize(long v) { this.size = v; }
    public LocalDateTime getUploadedAt() { return uploadedAt; } public void setUploadedAt(LocalDateTime v) { this.uploadedAt = v; }
}
