package com.vishatech.erp.entity;

import com.vishatech.erp.service.AttachmentStorageLedgerListener;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EntityListeners;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.Lob;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import java.time.LocalDateTime;

/**
 * Attachment row for every Purchase document type (PR / RFQ / Vendor /
 * Order / Invoice). Stored through the shared FileStorageService and
 * counted against the project-wide AttachmentStorageService 4 GB pool.
 * The JSON payload shape matches the frontend attachment contract
 * ({id, name, size, type, downloadUrl|dataUrl, uploadedAt, uploadedBy}).
 */
@Entity
@EntityListeners(AttachmentStorageLedgerListener.class)
@Table(name = "purchase_attachments", indexes = @Index(name = "idx_patt_doc", columnList = "docType, docId"))
public class PurchaseAttachment implements AttachmentSized {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 20)
    private String docType;

    @Column(nullable = false)
    private Long docId;

    @Column(nullable = false, length = 255)
    private String name;

    @Column(nullable = false, length = 255)
    private String storedName;

    private String contentType;

    private long size;

    private String url;

    @Column(length = 120)
    private String uploadedBy;

    private LocalDateTime uploadedAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "requisition_id")
    private PurchaseRequisition requisition;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "rfq_id")
    private PurchaseRfq rfq;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "vendor_id")
    private PurchaseVendor vendor;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "order_id")
    private PurchaseOrder order;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "invoice_id")
    private PurchaseInvoice invoice;

    @PrePersist
    void onCreate() {
        if (uploadedAt == null) {
            uploadedAt = LocalDateTime.now();
        }
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getDocType() { return docType; }
    public void setDocType(String docType) { this.docType = docType; }
    public Long getDocId() { return docId; }
    public void setDocId(Long docId) { this.docId = docId; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getStoredName() { return storedName; }
    public void setStoredName(String storedName) { this.storedName = storedName; }
    public String getContentType() { return contentType; }
    public void setContentType(String contentType) { this.contentType = contentType; }
    public long getSize() { return size; }
    public void setSize(long size) { this.size = size; }
    public String getUrl() { return url; }
    public void setUrl(String url) { this.url = url; }
    public String getUploadedBy() { return uploadedBy; }
    public void setUploadedBy(String uploadedBy) { this.uploadedBy = uploadedBy; }
    public LocalDateTime getUploadedAt() { return uploadedAt; }
    public void setUploadedAt(LocalDateTime uploadedAt) { this.uploadedAt = uploadedAt; }
    public PurchaseRequisition getRequisition() { return requisition; }
    public void setRequisition(PurchaseRequisition requisition) { this.requisition = requisition; }
    public PurchaseRfq getRfq() { return rfq; }
    public void setRfq(PurchaseRfq rfq) { this.rfq = rfq; }
    public PurchaseVendor getVendor() { return vendor; }
    public void setVendor(PurchaseVendor vendor) { this.vendor = vendor; }
    public PurchaseOrder getOrder() { return order; }
    public void setOrder(PurchaseOrder order) { this.order = order; }
    public PurchaseInvoice getInvoice() { return invoice; }
    public void setInvoice(PurchaseInvoice invoice) { this.invoice = invoice; }
}
