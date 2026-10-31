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
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import org.hibernate.annotations.BatchSize;

/**
 * Request for Quotation (RFQ) — sourcing document inviting one or more
 * vendors to quote against a Purchase Requisition.
 *
 * Lifecycle mirrors the frontend RFQ_STATUS contract exactly:
 * Draft → Pending Approval → Approved → Sent → Quotation Received →
 * Evaluation → 1st/2nd/Final Approval (Approval Flow / NFA stages) →
 * Awarded → Closed, with Cancelled as the terminal side-branch.
 */
@Entity
@Table(name = "purchase_rfqs", indexes = {
        @Index(name = "idx_rfq_status", columnList = "status"),
        @Index(name = "idx_rfq_no", columnList = "rfqNo")
})
public class PurchaseRfq {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 60)
    private String rfqNo;

    @Column(nullable = false, length = 200)
    private String title;

    @Column(length = 60)
    private String reference;

    @Column(length = 80)
    private String category;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String description;

    @Column(length = 60)
    private String department;

    @Column(length = 120)
    private String project;

    @Column(length = 120)
    private String requester;

    @Column(length = 120)
    private String buyer;

    @Column(length = 20)
    private String priority;

    /** Comma/JSON list is avoided: invited vendors persist as JSON array. */
    @Lob
    @Column(columnDefinition = "TEXT")
    private String vendorNamesJson;

    /** Quoted vendors persisted as JSON array (derived quotations list). */
    @Lob
    @Column(columnDefinition = "TEXT")
    private String vendorsJson;

    private Integer validity;

    @Column(length = 10)
    private String dueDate;

    @Column(length = 10)
    private String currency;

    @Column(length = 20)
    private String incoterm;

    @Column(length = 255)
    private String deliveryAddress;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String notes;

    /** Commercial terms as JSON ({paymentTerms, deliveryTerms, warranty, taxRate, freight, insurance}). */
    @Lob
    @Column(columnDefinition = "TEXT")
    private String commercialTermsJson;

    @Column(nullable = false, length = 60)
    private String status = "Draft";

    @Column(nullable = false, length = 20)
    private String approvalStatus = "Pending";

    /** Estimated value (budget) for the RFQ. */
    @Column(precision = 16, scale = 2)
    private BigDecimal estimatedValue;

    /** Awarded vendor name ("" when not awarded). */
    @Column(length = 160)
    private String awardedVendor;

    @Column(length = 60)
    private String awardedQuoteId;

    @Column(precision = 16, scale = 2)
    private BigDecimal awardedValue;

    private LocalDateTime awardedAt;

    @Column(length = 60)
    private String poNo;

    @Column(length = 60)
    private String prNo;

    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    /**
     * Line items.
     *
     * <p>{@code @BatchSize} because the RFQ list assembles every row's items: one
     * select per RFQ (N+1) before, one {@code IN (...)} select per 50 RFQs now.
     */
    @OneToMany(mappedBy = "rfq", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    @OrderColumn(name = "line_order")
    @BatchSize(size = 50)
    private List<PurchaseRfqItem> items = new ArrayList<>();

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
    public String getRfqNo() { return rfqNo; }
    public void setRfqNo(String rfqNo) { this.rfqNo = rfqNo; }
    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public String getReference() { return reference; }
    public void setReference(String reference) { this.reference = reference; }
    public String getCategory() { return category; }
    public void setCategory(String category) { this.category = category; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public String getDepartment() { return department; }
    public void setDepartment(String department) { this.department = department; }
    public String getProject() { return project; }
    public void setProject(String project) { this.project = project; }
    public String getRequester() { return requester; }
    public void setRequester(String requester) { this.requester = requester; }
    public String getBuyer() { return buyer; }
    public void setBuyer(String buyer) { this.buyer = buyer; }
    public String getPriority() { return priority; }
    public void setPriority(String priority) { this.priority = priority; }
    public String getVendorNamesJson() { return vendorNamesJson; }
    public void setVendorNamesJson(String vendorNamesJson) { this.vendorNamesJson = vendorNamesJson; }
    public String getVendorsJson() { return vendorsJson; }
    public void setVendorsJson(String vendorsJson) { this.vendorsJson = vendorsJson; }
    public Integer getValidity() { return validity; }
    public void setValidity(Integer validity) { this.validity = validity; }
    public String getDueDate() { return dueDate; }
    public void setDueDate(String dueDate) { this.dueDate = dueDate; }
    public String getCurrency() { return currency; }
    public void setCurrency(String currency) { this.currency = currency; }
    public String getIncoterm() { return incoterm; }
    public void setIncoterm(String incoterm) { this.incoterm = incoterm; }
    public String getDeliveryAddress() { return deliveryAddress; }
    public void setDeliveryAddress(String deliveryAddress) { this.deliveryAddress = deliveryAddress; }
    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }
    public String getCommercialTermsJson() { return commercialTermsJson; }
    public void setCommercialTermsJson(String commercialTermsJson) { this.commercialTermsJson = commercialTermsJson; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public String getApprovalStatus() { return approvalStatus; }
    public void setApprovalStatus(String approvalStatus) { this.approvalStatus = approvalStatus; }
    public BigDecimal getEstimatedValue() { return estimatedValue; }
    public void setEstimatedValue(BigDecimal estimatedValue) { this.estimatedValue = estimatedValue; }
    public String getAwardedVendor() { return awardedVendor; }
    public void setAwardedVendor(String awardedVendor) { this.awardedVendor = awardedVendor; }
    public String getAwardedQuoteId() { return awardedQuoteId; }
    public void setAwardedQuoteId(String awardedQuoteId) { this.awardedQuoteId = awardedQuoteId; }
    public BigDecimal getAwardedValue() { return awardedValue; }
    public void setAwardedValue(BigDecimal awardedValue) { this.awardedValue = awardedValue; }
    public LocalDateTime getAwardedAt() { return awardedAt; }
    public void setAwardedAt(LocalDateTime awardedAt) { this.awardedAt = awardedAt; }
    public String getPoNo() { return poNo; }
    public void setPoNo(String poNo) { this.poNo = poNo; }
    public String getPrNo() { return prNo; }
    public void setPrNo(String prNo) { this.prNo = prNo; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
    public List<PurchaseRfqItem> getItems() { return items; }
    public void setItems(List<PurchaseRfqItem> items) { this.items = items; }
}
