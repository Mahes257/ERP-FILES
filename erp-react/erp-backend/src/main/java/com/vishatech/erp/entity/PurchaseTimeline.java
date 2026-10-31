package com.vishatech.erp.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
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
 * Shared audit/timeline entry for every Purchase document type.
 *
 * One table serves PR, RFQ, Vendor, Order and Invoice timelines:
 * {@code docType} names the document family and {@code docId} is the
 * owning entity's id. Entries mirror the frontend activity contract
 * ({type, label, note, actor, timestamp}) plus the full ERP audit
 * stamp (user, role, IP, device) reused from the CPR timeline design.
 */
@Entity
@Table(name = "purchase_timeline", indexes = {
        @Index(name = "idx_ptl_doc", columnList = "docType, docId"),
        @Index(name = "idx_ptl_created", columnList = "createdAt")
})
public class PurchaseTimeline {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Document family: PR / RFQ / VENDOR / PO / INVOICE. */
    @Column(nullable = false, length = 20)
    private String docType;

    /** Owning entity's numeric id. */
    @Column(nullable = false)
    private Long docId;

    /** Activity type: create / submit / approve / reject / return / rfq / po / print / comment / attachment / update / status. */
    @Column(nullable = false, length = 40)
    private String type;

    /** Human label, e.g. "Submitted for approval". */
    @Column(nullable = false, length = 200)
    private String label;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String note;

    /** Actor display name (resolved server-side from the JWT user). */
    @Column(length = 120)
    private String actor;

    private LocalDateTime timestamp;

    /** Optional document status at the time of the event. */
    @Column(length = 60)
    private String status;

    @Column(length = 120)
    private String oldValue;

    @Column(length = 120)
    private String newValue;

    /** Audit fields. */
    private Long userId;
    private String userName;
    private String userRole;
    private String ipAddress;
    @Column(length = 500)
    private String deviceInfo;

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
        if (timestamp == null) {
            timestamp = LocalDateTime.now();
        }
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getDocType() { return docType; }
    public void setDocType(String docType) { this.docType = docType; }
    public Long getDocId() { return docId; }
    public void setDocId(Long docId) { this.docId = docId; }
    public String getType() { return type; }
    public void setType(String type) { this.type = type; }
    public String getLabel() { return label; }
    public void setLabel(String label) { this.label = label; }
    public String getNote() { return note; }
    public void setNote(String note) { this.note = note; }
    public String getActor() { return actor; }
    public void setActor(String actor) { this.actor = actor; }
    public LocalDateTime getTimestamp() { return timestamp; }
    public void setTimestamp(LocalDateTime timestamp) { this.timestamp = timestamp; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public String getOldValue() { return oldValue; }
    public void setOldValue(String oldValue) { this.oldValue = oldValue; }
    public String getNewValue() { return newValue; }
    public void setNewValue(String newValue) { this.newValue = newValue; }
    public Long getUserId() { return userId; }
    public void setUserId(Long userId) { this.userId = userId; }
    public String getUserName() { return userName; }
    public void setUserName(String userName) { this.userName = userName; }
    public String getUserRole() { return userRole; }
    public void setUserRole(String userRole) { this.userRole = userRole; }
    public String getIpAddress() { return ipAddress; }
    public void setIpAddress(String ipAddress) { this.ipAddress = ipAddress; }
    public String getDeviceInfo() { return deviceInfo; }
    public void setDeviceInfo(String deviceInfo) { this.deviceInfo = deviceInfo; }
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
