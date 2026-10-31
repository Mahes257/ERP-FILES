package com.vishatech.erp.entity;

import jakarta.persistence.CascadeType;
import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
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

/**
 * Purchase Requisition (PR) — the entry document of the Purchase module.
 *
 * Lifecycle (mirrors the frontend's PR_STATUS contract exactly):
 * Draft → Pending Approval → Technical Specification Review →
 * Ready for RFQ → Converted to RFQ → PO Raised, with Rejected and
 * Returned as side branches. Records use a soft-lifecycle recordState
 * (active / archived / deleted) so lists never lose history.
 */
@Entity
@Table(name = "purchase_requisitions", indexes = {
        @Index(name = "idx_pr_status", columnList = "status"),
        @Index(name = "idx_pr_record_state", columnList = "recordState"),
        @Index(name = "idx_pr_no", columnList = "prNo")
})
public class PurchaseRequisition {

    public static final String RECORD_ACTIVE = "active";
    public static final String RECORD_ARCHIVED = "archived";
    public static final String RECORD_DELETED = "deleted";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Business document number, e.g. PR-2026-0045 (unique). */
    @Column(nullable = false, unique = true, length = 60)
    private String prNo;

    @Column(nullable = false, length = 200)
    private String title;

    @Column(length = 60)
    private String prType;

    @Column(length = 60)
    private String department;

    @Column(length = 120)
    private String project;

    @Column(length = 120)
    private String requester;

    @Column(length = 120)
    private String buyer;

    /** Preferred supplier (optional on a requisition). */
    @Column(length = 160)
    private String vendor;

    @Column(length = 10)
    private String currency;

    @Column(length = 20)
    private String priority;

    /** GST treatment label, e.g. "Inter-State (IGST)". */
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

    @Column(length = 255)
    private String deliveryAddress;

    @Column(length = 120)
    private String company;

    @Column(length = 120)
    private String branch;

    /** PR creation date (yyyy-MM-dd) as entered on the form. */
    /** Payment terms label carried from the form (e.g. "30 Days"). */
    @Column(length = 40)
    private String terms;

    @Column(length = 10)
    private String date;

    /** Required/expected delivery date (yyyy-MM-dd). */
    @Column(length = 10)
    private String expectedDate;

    /** Document-level discount percentage. */
    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal discount = BigDecimal.ZERO;

    /** Non-taxable freight/handling charges. */
    @Column(nullable = false, precision = 14, scale = 2)
    private BigDecimal charges = BigDecimal.ZERO;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String notes;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String internalNotes;

    /** Canonical lifecycle status (PR_STATUS values on the frontend). */
    @Column(nullable = false, length = 60)
    private String status = "Draft";

    /** Pending / Approved / Rejected (APPROVAL_STATUS values). */
    @Column(nullable = false, length = 20)
    private String approvalStatus = "Pending";

    /** active / archived / deleted. */
    @Column(nullable = false, length = 20)
    private String recordState = RECORD_ACTIVE;

    private String approvedBy;
    private LocalDateTime approvalDate;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String approvalNote;

    private String rejectedBy;

    /** RFQ number this PR was converted into ("" when not converted). */
    @Column(length = 60)
    private String rfqNo;

    /** PO number raised against this PR ("" when none). */
    @Column(length = 60)
    private String poNo;

    /** Recomputed grand total (incl. GST split + charges). */
    @Column(nullable = false, precision = 16, scale = 2)
    private BigDecimal amount = BigDecimal.ZERO;

    /** Technical Specification Review — persisted as JSON (specification,
     *  drawing, materialGrade, dimensions, comments, reviewStatus,
     *  reviewedBy, reviewedAt) so the shape stays identical to the
     *  frontend's technicalReview object. */
    @Lob
    @Column(columnDefinition = "TEXT")
    private String technicalReviewJson;

    private LocalDateTime createdAt;

    private LocalDateTime updatedAt;

    @Column(length = 120)
    private String createdBy;

    @Column(length = 120)
    private String updatedBy;

    @OneToMany(mappedBy = "requisition", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    @OrderColumn(name = "line_order")
    private List<PurchaseRequisitionItem> items = new ArrayList<>();

    @OneToMany(mappedBy = "requisition", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    @OrderColumn(name = "entry_order")
    private List<PurchaseTimeline> timeline = new ArrayList<>();

    @OneToMany(mappedBy = "requisition", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    private List<PurchaseAttachment> attachments = new ArrayList<>();

    @ElementCollection(fetch = FetchType.LAZY)
    @CollectionTable(name = "purchase_requisition_comments", joinColumns = @JoinColumn(name = "requisition_id"))
    @Column(name = "comment_json", columnDefinition = "TEXT")
    private List<String> commentsJson = new ArrayList<>();

    @PrePersist
    void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = createdAt;
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = LocalDateTime.now();
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getPrNo() { return prNo; }
    public void setPrNo(String prNo) { this.prNo = prNo; }
    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public String getPrType() { return prType; }
    public void setPrType(String prType) { this.prType = prType; }
    public String getDepartment() { return department; }
    public void setDepartment(String department) { this.department = department; }
    public String getProject() { return project; }
    public void setProject(String project) { this.project = project; }
    public String getRequester() { return requester; }
    public void setRequester(String requester) { this.requester = requester; }
    public String getBuyer() { return buyer; }
    public void setBuyer(String buyer) { this.buyer = buyer; }
    public String getVendor() { return vendor; }
    public void setVendor(String vendor) { this.vendor = vendor; }
    public String getCurrency() { return currency; }
    public void setCurrency(String currency) { this.currency = currency; }
    public String getPriority() { return priority; }
    public void setPriority(String priority) { this.priority = priority; }
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
    public String getDeliveryAddress() { return deliveryAddress; }
    public void setDeliveryAddress(String deliveryAddress) { this.deliveryAddress = deliveryAddress; }
    public String getCompany() { return company; }
    public void setCompany(String company) { this.company = company; }
    public String getBranch() { return branch; }
    public void setBranch(String branch) { this.branch = branch; }
    public String getTerms() { return terms; }
    public void setTerms(String terms) { this.terms = terms; }
    public String getDate() { return date; }
    public void setDate(String date) { this.date = date; }
    public String getExpectedDate() { return expectedDate; }
    public void setExpectedDate(String expectedDate) { this.expectedDate = expectedDate; }
    public BigDecimal getDiscount() { return discount; }
    public void setDiscount(BigDecimal discount) { this.discount = discount; }
    public BigDecimal getCharges() { return charges; }
    public void setCharges(BigDecimal charges) { this.charges = charges; }
    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }
    public String getInternalNotes() { return internalNotes; }
    public void setInternalNotes(String internalNotes) { this.internalNotes = internalNotes; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public String getApprovalStatus() { return approvalStatus; }
    public void setApprovalStatus(String approvalStatus) { this.approvalStatus = approvalStatus; }
    public String getRecordState() { return recordState; }
    public void setRecordState(String recordState) { this.recordState = recordState; }
    public String getApprovedBy() { return approvedBy; }
    public void setApprovedBy(String approvedBy) { this.approvedBy = approvedBy; }
    public LocalDateTime getApprovalDate() { return approvalDate; }
    public void setApprovalDate(LocalDateTime approvalDate) { this.approvalDate = approvalDate; }
    public String getApprovalNote() { return approvalNote; }
    public void setApprovalNote(String approvalNote) { this.approvalNote = approvalNote; }
    public String getRejectedBy() { return rejectedBy; }
    public void setRejectedBy(String rejectedBy) { this.rejectedBy = rejectedBy; }
    public String getRfqNo() { return rfqNo; }
    public void setRfqNo(String rfqNo) { this.rfqNo = rfqNo; }
    public String getPoNo() { return poNo; }
    public void setPoNo(String poNo) { this.poNo = poNo; }
    public BigDecimal getAmount() { return amount; }
    public void setAmount(BigDecimal amount) { this.amount = amount; }
    public String getTechnicalReviewJson() { return technicalReviewJson; }
    public void setTechnicalReviewJson(String technicalReviewJson) { this.technicalReviewJson = technicalReviewJson; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
    public String getCreatedBy() { return createdBy; }
    public void setCreatedBy(String createdBy) { this.createdBy = createdBy; }
    public String getUpdatedBy() { return updatedBy; }
    public void setUpdatedBy(String updatedBy) { this.updatedBy = updatedBy; }
    public List<PurchaseRequisitionItem> getItems() { return items; }
    public void setItems(List<PurchaseRequisitionItem> items) { this.items = items; }
    public List<PurchaseTimeline> getTimeline() { return timeline; }
    public void setTimeline(List<PurchaseTimeline> timeline) { this.timeline = timeline; }
    public List<PurchaseAttachment> getAttachments() { return attachments; }
    public void setAttachments(List<PurchaseAttachment> attachments) { this.attachments = attachments; }
    public List<String> getCommentsJson() { return commentsJson; }
    public void setCommentsJson(List<String> commentsJson) { this.commentsJson = commentsJson; }
}
