package com.vishatech.erp.entity;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Lob;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderColumn;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import org.hibernate.annotations.BatchSize;

/**
 * Purchase Order (PO) — the released commercial order to a supplier.
 *
 * Canonical stage machine mirrors the frontend PO_STAGE_TRANSITIONS:
 * Draft → Pending Approval → Approved → Released → Supplier
 * Acknowledged → In Progress → Partially Delivered → Completed →
 * Closed, with Cancelled reachable from every pre-terminal stage.
 */
@Entity
@Table(name = "purchase_orders", indexes = {
        @Index(name = "idx_po_status", columnList = "status"),
        @Index(name = "idx_po_no", columnList = "poNo"),
        @Index(name = "idx_po_vendor", columnList = "vendor")
})
public class PurchaseOrder {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Optimistic lock on the purchase-order header (see Quotation#version). */
    @Version
    @Column(nullable = false)
    private Long version;

    @Column(nullable = false, unique = true, length = 60)
    private String poNo;

    @Column(nullable = false, length = 200)
    private String title;

    @Column(nullable = false, length = 160)
    private String vendor;

    @Column(length = 60)
    private String reference;

    @Column(length = 60)
    private String prNo;

    @Column(length = 60)
    private String rfqNo;

    @Column(length = 60)
    private String quotationNo;

    @Column(length = 40)
    private String nfaId;

    @Column(length = 60)
    private String nfaNo;

    @Column(precision = 16, scale = 2)
    private BigDecimal awardedValue;

    @Column(length = 10)
    private String orderDate;

    @Column(length = 10)
    private String expectedDate;

    @Column(length = 10)
    private String deliveryDate;

    @Column(length = 10)
    private String currency;

    @Column(length = 40)
    private String terms;

    @Column(length = 60)
    private String gstType;

    @Column(length = 20)
    private String incoterm;

    @Column(length = 20)
    private String transportMode;

    @Column(length = 60)
    private String warehouse;

    @Column(length = 80)
    private String costCenter;

    @Column(length = 60)
    private String location;

    @Column(length = 60)
    private String department;

    @Column(length = 120)
    private String project;

    @Column(length = 255)
    private String deliveryAddress;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String deliveryInstructions;

    @Column(length = 40)
    private String deliveryTerms;

    @Column(length = 40)
    private String warranty;

    @Column(precision = 14, scale = 2)
    private BigDecimal freight;

    @Column(precision = 14, scale = 2)
    private BigDecimal insurance;

    /** Payment terms persisted as JSON (normalizePaymentTerms shape). */
    @Lob
    @Column(columnDefinition = "TEXT")
    private String paymentTermsJson;

    private Boolean paymentTermsRequired;

    /** Required / Not Required / Requested / Approved / Paid. */
    @Column(length = 30)
    private String advanceStatus;

    @Column(precision = 6, scale = 2)
    private BigDecimal advancePercentage;

    @Column(precision = 16, scale = 2)
    private BigDecimal advanceAmount;

    @Column(precision = 16, scale = 2)
    private BigDecimal balanceAmount;

    @Column(nullable = false, precision = 6, scale = 2)
    private BigDecimal discount = BigDecimal.ZERO;

    @Column(nullable = false, precision = 14, scale = 2)
    private BigDecimal charges = BigDecimal.ZERO;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String notes;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String internalNotes;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String vendorNotes;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String termsAndConditions;

    @Column(nullable = false, precision = 16, scale = 2)
    private BigDecimal amount = BigDecimal.ZERO;

    @Column(nullable = false, length = 60)
    private String status = "Draft";

    @Column(nullable = false, length = 20)
    private String approvalStatus = "Pending";

    private String approvedBy;
    private LocalDateTime approvalDate;
    private String rejectedBy;
    private String rejectedReason;

    private String releasedBy;
    private LocalDateTime releasedAt;

    private LocalDateTime acknowledgedAt;
    @Column(length = 120)
    private String acknowledgedBy;
    private String acknowledgementRef;

    @Column(length = 20)
    private String deliveryStatus;

    @Column(length = 40)
    private String createdBy;

    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    /**
     * Line items.
     *
     * <p>{@code @BatchSize} because the PO list assembles every row's items: one
     * select per order (N+1) before, one {@code IN (...)} select per 50 orders now.
     * The list endpoint is not paged in SQL yet, so a batch fetch (rather than a
     * fetch join) also keeps the result free of duplicated parent rows.
     */
    @OneToMany(mappedBy = "order", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    @OrderColumn(name = "line_order")
    @BatchSize(size = 50)
    private List<PurchaseOrderItem> items = new ArrayList<>();

    @PrePersist
    void onCreate() {
        if (createdAt == null) createdAt = LocalDateTime.now();
        updatedAt = createdAt;
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = LocalDateTime.now();
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getPoNo() { return poNo; }
    public void setPoNo(String poNo) { this.poNo = poNo; }
    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public String getVendor() { return vendor; }
    public void setVendor(String vendor) { this.vendor = vendor; }
    public String getReference() { return reference; }
    public void setReference(String reference) { this.reference = reference; }
    public String getPrNo() { return prNo; }
    public void setPrNo(String prNo) { this.prNo = prNo; }
    public String getRfqNo() { return rfqNo; }
    public void setRfqNo(String rfqNo) { this.rfqNo = rfqNo; }
    public String getQuotationNo() { return quotationNo; }
    public void setQuotationNo(String quotationNo) { this.quotationNo = quotationNo; }
    public String getNfaId() { return nfaId; }
    public void setNfaId(String nfaId) { this.nfaId = nfaId; }
    public String getNfaNo() { return nfaNo; }
    public void setNfaNo(String nfaNo) { this.nfaNo = nfaNo; }
    public BigDecimal getAwardedValue() { return awardedValue; }
    public void setAwardedValue(BigDecimal awardedValue) { this.awardedValue = awardedValue; }
    public String getOrderDate() { return orderDate; }
    public void setOrderDate(String orderDate) { this.orderDate = orderDate; }
    public String getExpectedDate() { return expectedDate; }
    public void setExpectedDate(String expectedDate) { this.expectedDate = expectedDate; }
    public String getDeliveryDate() { return deliveryDate; }
    public void setDeliveryDate(String deliveryDate) { this.deliveryDate = deliveryDate; }
    public String getCurrency() { return currency; }
    public void setCurrency(String currency) { this.currency = currency; }
    public String getTerms() { return terms; }
    public void setTerms(String terms) { this.terms = terms; }
    public String getGstType() { return gstType; }
    public void setGstType(String gstType) { this.gstType = gstType; }
    public String getIncoterm() { return incoterm; }
    public void setIncoterm(String incoterm) { this.incoterm = incoterm; }
    public String getTransportMode() { return transportMode; }
    public void setTransportMode(String transportMode) { this.transportMode = transportMode; }
    public String getWarehouse() { return warehouse; }
    public void setWarehouse(String warehouse) { this.warehouse = warehouse; }
    public String getCostCenter() { return costCenter; }
    public void setCostCenter(String costCenter) { this.costCenter = costCenter; }
    public String getLocation() { return location; }
    public void setLocation(String location) { this.location = location; }
    public String getDepartment() { return department; }
    public void setDepartment(String department) { this.department = department; }
    public String getProject() { return project; }
    public void setProject(String project) { this.project = project; }
    public String getDeliveryAddress() { return deliveryAddress; }
    public void setDeliveryAddress(String deliveryAddress) { this.deliveryAddress = deliveryAddress; }
    public String getDeliveryInstructions() { return deliveryInstructions; }
    public void setDeliveryInstructions(String deliveryInstructions) { this.deliveryInstructions = deliveryInstructions; }
    public String getDeliveryTerms() { return deliveryTerms; }
    public void setDeliveryTerms(String deliveryTerms) { this.deliveryTerms = deliveryTerms; }
    public String getWarranty() { return warranty; }
    public void setWarranty(String warranty) { this.warranty = warranty; }
    public BigDecimal getFreight() { return freight; }
    public void setFreight(BigDecimal freight) { this.freight = freight; }
    public BigDecimal getInsurance() { return insurance; }
    public void setInsurance(BigDecimal insurance) { this.insurance = insurance; }
    public String getPaymentTermsJson() { return paymentTermsJson; }
    public void setPaymentTermsJson(String paymentTermsJson) { this.paymentTermsJson = paymentTermsJson; }
    public Boolean getPaymentTermsRequired() { return paymentTermsRequired; }
    public void setPaymentTermsRequired(Boolean paymentTermsRequired) { this.paymentTermsRequired = paymentTermsRequired; }
    public String getAdvanceStatus() { return advanceStatus; }
    public void setAdvanceStatus(String advanceStatus) { this.advanceStatus = advanceStatus; }
    public BigDecimal getAdvancePercentage() { return advancePercentage; }
    public void setAdvancePercentage(BigDecimal advancePercentage) { this.advancePercentage = advancePercentage; }
    public BigDecimal getAdvanceAmount() { return advanceAmount; }
    public void setAdvanceAmount(BigDecimal advanceAmount) { this.advanceAmount = advanceAmount; }
    public BigDecimal getBalanceAmount() { return balanceAmount; }
    public void setBalanceAmount(BigDecimal balanceAmount) { this.balanceAmount = balanceAmount; }
    public BigDecimal getDiscount() { return discount; }
    public void setDiscount(BigDecimal discount) { this.discount = discount; }
    public BigDecimal getCharges() { return charges; }
    public void setCharges(BigDecimal charges) { this.charges = charges; }
    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }
    public String getInternalNotes() { return internalNotes; }
    public void setInternalNotes(String internalNotes) { this.internalNotes = internalNotes; }
    public String getVendorNotes() { return vendorNotes; }
    public void setVendorNotes(String vendorNotes) { this.vendorNotes = vendorNotes; }
    public String getTermsAndConditions() { return termsAndConditions; }
    public void setTermsAndConditions(String termsAndConditions) { this.termsAndConditions = termsAndConditions; }
    public BigDecimal getAmount() { return amount; }
    public void setAmount(BigDecimal amount) { this.amount = amount; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public String getApprovalStatus() { return approvalStatus; }
    public void setApprovalStatus(String approvalStatus) { this.approvalStatus = approvalStatus; }
    public String getApprovedBy() { return approvedBy; }
    public void setApprovedBy(String approvedBy) { this.approvedBy = approvedBy; }
    public LocalDateTime getApprovalDate() { return approvalDate; }
    public void setApprovalDate(LocalDateTime approvalDate) { this.approvalDate = approvalDate; }
    public String getRejectedBy() { return rejectedBy; }
    public void setRejectedBy(String rejectedBy) { this.rejectedBy = rejectedBy; }
    public String getRejectedReason() { return rejectedReason; }
    public void setRejectedReason(String rejectedReason) { this.rejectedReason = rejectedReason; }
    public String getReleasedBy() { return releasedBy; }
    public void setReleasedBy(String releasedBy) { this.releasedBy = releasedBy; }
    public LocalDateTime getReleasedAt() { return releasedAt; }
    public void setReleasedAt(LocalDateTime releasedAt) { this.releasedAt = releasedAt; }
    public LocalDateTime getAcknowledgedAt() { return acknowledgedAt; }
    public void setAcknowledgedAt(LocalDateTime acknowledgedAt) { this.acknowledgedAt = acknowledgedAt; }
    public String getAcknowledgedBy() { return acknowledgedBy; }
    public void setAcknowledgedBy(String acknowledgedBy) { this.acknowledgedBy = acknowledgedBy; }
    public String getAcknowledgementRef() { return acknowledgementRef; }
    public void setAcknowledgementRef(String acknowledgementRef) { this.acknowledgementRef = acknowledgementRef; }
    public String getDeliveryStatus() { return deliveryStatus; }
    public void setDeliveryStatus(String deliveryStatus) { this.deliveryStatus = deliveryStatus; }
    public String getCreatedBy() { return createdBy; }
    public void setCreatedBy(String createdBy) { this.createdBy = createdBy; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
    public List<PurchaseOrderItem> getItems() { return items; }
    public void setItems(List<PurchaseOrderItem> items) { this.items = items; }
}
