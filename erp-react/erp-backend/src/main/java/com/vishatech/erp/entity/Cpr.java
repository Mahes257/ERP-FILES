package com.vishatech.erp.entity;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "cprs")
public class Cpr {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 40, unique = true)
    private String prNo;

    /** Optional external Purchase Requisition number referenced by this CPR. */
    private String referencePrNo;

    private LocalDateTime prDate;

    private String department;

    private String requestedBy;

    private LocalDateTime requiredDate;

    /** Original deadline for converting this CPR into a quotation. */
    private LocalDate quotationDeadline;

    /** Effective (extended) quotation deadline — original is preserved in quotationDeadline. */
    private LocalDate extendedDeadline;

    private String priority;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 40)
    private CprStatus status = CprStatus.DRAFT;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 40)
    private CprApprovalStatus approvalStatus = CprApprovalStatus.PENDING;

    private String sourceLead;

    /** FK-style link to the CRM Customer master. Set when the source is a Client. */
    private Long clientId;

    private String clientName;

    private String contactPerson;

    private String phone;

    private String email;

    private String company;

    private String gst;

    private String project;

    private String leadNo;

    private String pan;

    private String vendor;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String billingAddress;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String shippingAddress;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String remarks;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String description;

    @Column(precision = 18, scale = 2)
    private BigDecimal costWorkout;

    @Column(precision = 10, scale = 2)
    private BigDecimal profitPercent;

    @Column(precision = 18, scale = 2)
    private BigDecimal grandTotal;

    private String convertedToQtn;

    /** Id of the real Quotation row created when this CPR is converted (FK-style link). */
    private Long quotationId;

    /** Id of the Cost Workout linked to this CPR (FK-style link). */
    private Long costWorkoutId;

    /** Cost Workout number for linked-document display. */
    private String costWorkoutCwNo;

    /** Current Cost Workout status for linked-document display. */
    private String costWorkoutStatus;

    /**
     * The Admin's approved float destination (PR or Cost Workout).
     *
     * Set ONLY by an Admin approval, and ONLY once this CPR's Technical
     * Verification is complete — the verification is the gate, the Admin decides
     * the destination. Null means no destination has been decided yet.
     */
    @Enumerated(EnumType.STRING)
    @Column(length = 20)
    private CprFloatDestination floatDestination;

    /** When the approved destination was actually executed (document created). */
    private LocalDateTime floatedAt;

    /** Who executed the float. */
    private String floatedBy;

    /**
     * The Purchase Requisition number this CPR was floated as.
     *
     * Filled only when {@link #floatDestination} is {@link CprFloatDestination#PR}:
     * the CPR's own Reference PR No when it carries one, otherwise a number
     * generated once and registered in the shared {@code pr_references} catalog
     * (see {@code PrReferenceService#registerForCpr}). Never overwrites
     * {@link #referencePrNo} — the customer's PR number is theirs, not ours.
     */
    @Column(length = 60)
    private String floatedPrNo;

    private String currentStage;

    private String submittedBy;

    private LocalDateTime submittedAt;

    private String approvedBy;

    private LocalDateTime approvalDate;

    private String rejectedBy;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String approvalRemarks;

    private LocalDateTime createdAt;

    private LocalDateTime updatedAt;

    private LocalDateTime archivedAt;

    // ---- Revision chain (every edit creates a new revision row; the
    // previous version is NEVER deleted or overwritten) ----

    /** Id of the chain root (the original document). Null for the original. */
    private Long revisionOf;

    /** 0 = original, 1, 2, 3 ... per edit. */
    @Column(nullable = false)
    private int revision;

    /** When this revision was created. */
    private LocalDateTime revisionDate;

    /** Only the newest revision is editable/current. */
    @Column(nullable = false)
    private boolean latestRevision = true;

    /**
     * True only while this row exists purely because of an autosave / Save-Draft
     * and has never been explicitly committed by the user.
     * <p>
     * This is deliberately separate from {@link CprStatus#DRAFT}: the business
     * status "draft" is a normal lifecycle state a committed CPR may sit in for
     * a long time, whereas {@code draftOnly} answers the different question
     * "has this record ever really been saved?".
     * <p>
     * The first explicit (non-draft) save converts the row in place, clears the
     * flag and creates NO revision — so a brand-new CPR always ends up as one
     * original record with {@code revision == 0}. Only edits of an already
     * committed record produce a revision.
     */
    @Column(nullable = false)
    private boolean draftOnly = false;

    // Item-table column configuration (id/key/label/type/required/system/order +
    // custom column definitions) as a JSON array, saved with the CPR so reopening
    // the form restores the exact user-customized columns and their order.
    // Stored as JSON — no dynamic ALTER TABLE per user column.
    @Lob
    @Column(columnDefinition = "TEXT")
    private String itemColumnsJson;

    @OneToMany(mappedBy = "cpr", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("id ASC")
    private List<CprItem> items = new ArrayList<>();

    @OneToMany(mappedBy = "cpr", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("uploadedAt ASC")
    private List<CprAttachment> attachments = new ArrayList<>();

    @OneToMany(mappedBy = "cpr", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("createdAt ASC")
    private List<CprTimeline> timeline = new ArrayList<>();

    @OneToMany(mappedBy = "cpr", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("createdAt ASC")
    private List<CprHistory> history = new ArrayList<>();

    @OneToMany(mappedBy = "cpr", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("createdAt ASC")
    private List<CprComment> comments = new ArrayList<>();

    @PrePersist
    void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = createdAt;
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = LocalDateTime.now();
    }

    public void addItem(CprItem item) {
        item.setCpr(this);
        items.add(item);
    }

    public void addAttachment(CprAttachment attachment) {
        attachment.setCpr(this);
        attachments.add(attachment);
    }

    public void addTimeline(CprTimeline entry) {
        entry.setCpr(this);
        timeline.add(entry);
    }

    public void addHistory(CprHistory entry) {
        entry.setCpr(this);
        history.add(entry);
    }

    public void addComment(CprComment entry) {
        entry.setCpr(this);
        comments.add(entry);
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getPrNo() {
        return prNo;
    }

    public void setPrNo(String prNo) {
        this.prNo = prNo;
    }

    public String getReferencePrNo() {
        return referencePrNo;
    }

    public void setReferencePrNo(String referencePrNo) {
        this.referencePrNo = referencePrNo;
    }

    public LocalDateTime getPrDate() {
        return prDate;
    }

    public void setPrDate(LocalDateTime prDate) {
        this.prDate = prDate;
    }

    public String getDepartment() {
        return department;
    }

    public void setDepartment(String department) {
        this.department = department;
    }

    public String getRequestedBy() {
        return requestedBy;
    }

    public void setRequestedBy(String requestedBy) {
        this.requestedBy = requestedBy;
    }

    public LocalDateTime getRequiredDate() {
        return requiredDate;
    }

    public void setRequiredDate(LocalDateTime requiredDate) {
        this.requiredDate = requiredDate;
    }

    public LocalDate getQuotationDeadline() {
        return quotationDeadline;
    }

    public void setQuotationDeadline(LocalDate quotationDeadline) {
        this.quotationDeadline = quotationDeadline;
    }

    public LocalDate getExtendedDeadline() {
        return extendedDeadline;
    }

    public void setExtendedDeadline(LocalDate extendedDeadline) {
        this.extendedDeadline = extendedDeadline;
    }

    public String getPriority() {
        return priority;
    }

    public void setPriority(String priority) {
        this.priority = priority;
    }

    public CprStatus getStatus() {
        return status;
    }

    public void setStatus(CprStatus status) {
        this.status = status;
    }

    public CprApprovalStatus getApprovalStatus() {
        return approvalStatus;
    }

    public void setApprovalStatus(CprApprovalStatus approvalStatus) {
        this.approvalStatus = approvalStatus;
    }

    public String getSourceLead() {
        return sourceLead;
    }

    public void setSourceLead(String sourceLead) {
        this.sourceLead = sourceLead;
    }

    public String getClientName() {
        return clientName;
    }

    public void setClientName(String clientName) {
        this.clientName = clientName;
    }

    public String getContactPerson() {
        return contactPerson;
    }

    public void setContactPerson(String contactPerson) {
        this.contactPerson = contactPerson;
    }

    public String getPhone() {
        return phone;
    }

    public void setPhone(String phone) {
        this.phone = phone;
    }

    public String getEmail() {
        return email;
    }

    public void setEmail(String email) {
        this.email = email;
    }

    public String getCompany() {
        return company;
    }

    public void setCompany(String company) {
        this.company = company;
    }

    public String getGst() {
        return gst;
    }

    public void setGst(String gst) {
        this.gst = gst;
    }

    public String getProject() {
        return project;
    }

    public void setProject(String project) {
        this.project = project;
    }

    public String getLeadNo() {
        return leadNo;
    }

    public void setLeadNo(String leadNo) {
        this.leadNo = leadNo;
    }

    public String getPan() {
        return pan;
    }

    public void setPan(String pan) {
        this.pan = pan;
    }

    public String getVendor() {
        return vendor;
    }

    public void setVendor(String vendor) {
        this.vendor = vendor;
    }

    public String getBillingAddress() {
        return billingAddress;
    }

    public void setBillingAddress(String billingAddress) {
        this.billingAddress = billingAddress;
    }

    public String getShippingAddress() {
        return shippingAddress;
    }

    public void setShippingAddress(String shippingAddress) {
        this.shippingAddress = shippingAddress;
    }

    public String getRemarks() {
        return remarks;
    }

    public void setRemarks(String remarks) {
        this.remarks = remarks;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public BigDecimal getCostWorkout() {
        return costWorkout;
    }

    public void setCostWorkout(BigDecimal costWorkout) {
        this.costWorkout = costWorkout;
    }

    public BigDecimal getProfitPercent() {
        return profitPercent;
    }

    public void setProfitPercent(BigDecimal profitPercent) {
        this.profitPercent = profitPercent;
    }

    public BigDecimal getGrandTotal() {
        return grandTotal;
    }

    public void setGrandTotal(BigDecimal grandTotal) {
        this.grandTotal = grandTotal;
    }

    public String getConvertedToQtn() {
        return convertedToQtn;
    }

    public void setConvertedToQtn(String convertedToQtn) {
        this.convertedToQtn = convertedToQtn;
    }

    public Long getQuotationId() {
        return quotationId;
    }

    public void setQuotationId(Long quotationId) {
        this.quotationId = quotationId;
    }

    public Long getCostWorkoutId() {
        return costWorkoutId;
    }

    public void setCostWorkoutId(Long costWorkoutId) {
        this.costWorkoutId = costWorkoutId;
    }

    public String getCostWorkoutCwNo() {
        return costWorkoutCwNo;
    }

    public void setCostWorkoutCwNo(String costWorkoutCwNo) {
        this.costWorkoutCwNo = costWorkoutCwNo;
    }

    public String getCostWorkoutStatus() {
        return costWorkoutStatus;
    }

    public void setCostWorkoutStatus(String costWorkoutStatus) {
        this.costWorkoutStatus = costWorkoutStatus;
    }

    public CprFloatDestination getFloatDestination() {
        return floatDestination;
    }

    public void setFloatDestination(CprFloatDestination floatDestination) {
        this.floatDestination = floatDestination;
    }

    public LocalDateTime getFloatedAt() {
        return floatedAt;
    }

    public void setFloatedAt(LocalDateTime floatedAt) {
        this.floatedAt = floatedAt;
    }

    public String getFloatedBy() {
        return floatedBy;
    }

    public void setFloatedBy(String floatedBy) {
        this.floatedBy = floatedBy;
    }

    public String getFloatedPrNo() {
        return floatedPrNo;
    }

    public void setFloatedPrNo(String floatedPrNo) {
        this.floatedPrNo = floatedPrNo;
    }

    public String getCurrentStage() {
        return currentStage;
    }

    public void setCurrentStage(String currentStage) {
        this.currentStage = currentStage;
    }

    public String getSubmittedBy() {
        return submittedBy;
    }

    public void setSubmittedBy(String submittedBy) {
        this.submittedBy = submittedBy;
    }

    public LocalDateTime getSubmittedAt() {
        return submittedAt;
    }

    public void setSubmittedAt(LocalDateTime submittedAt) {
        this.submittedAt = submittedAt;
    }

    public String getApprovedBy() {
        return approvedBy;
    }

    public void setApprovedBy(String approvedBy) {
        this.approvedBy = approvedBy;
    }

    public LocalDateTime getApprovalDate() {
        return approvalDate;
    }

    public void setApprovalDate(LocalDateTime approvalDate) {
        this.approvalDate = approvalDate;
    }

    public String getRejectedBy() {
        return rejectedBy;
    }

    public void setRejectedBy(String rejectedBy) {
        this.rejectedBy = rejectedBy;
    }

    public String getApprovalRemarks() {
        return approvalRemarks;
    }

    public void setApprovalRemarks(String approvalRemarks) {
        this.approvalRemarks = approvalRemarks;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }

    public LocalDateTime getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(LocalDateTime updatedAt) {
        this.updatedAt = updatedAt;
    }

    public LocalDateTime getArchivedAt() {
        return archivedAt;
    }

    public void setArchivedAt(LocalDateTime archivedAt) {
        this.archivedAt = archivedAt;
    }

    public String getItemColumnsJson() {
        return itemColumnsJson;
    }

    public void setItemColumnsJson(String itemColumnsJson) {
        this.itemColumnsJson = itemColumnsJson;
    }

    public List<CprItem> getItems() {
        return items;
    }

    public void setItems(List<CprItem> items) {
        this.items = items;
    }

    public List<CprAttachment> getAttachments() {
        return attachments;
    }

    public void setAttachments(List<CprAttachment> attachments) {
        this.attachments = attachments;
    }

    public List<CprTimeline> getTimeline() {
        return timeline;
    }

    public void setTimeline(List<CprTimeline> timeline) {
        this.timeline = timeline;
    }

    public List<CprHistory> getHistory() {
        return history;
    }

    public void setHistory(List<CprHistory> history) {
        this.history = history;
    }

    public List<CprComment> getComments() {
        return comments;
    }

    public void setComments(List<CprComment> comments) {
        this.comments = comments;
    }

    public Long getClientId() {
        return clientId;
    }

    public void setClientId(Long clientId) {
        this.clientId = clientId;
    }

    public Long getRevisionOf() {
        return revisionOf;
    }

    public void setRevisionOf(Long revisionOf) {
        this.revisionOf = revisionOf;
    }

    public int getRevision() {
        return revision;
    }

    public void setRevision(int revision) {
        this.revision = revision;
    }

    public LocalDateTime getRevisionDate() {
        return revisionDate;
    }

    public void setRevisionDate(LocalDateTime revisionDate) {
        this.revisionDate = revisionDate;
    }

    public boolean isLatestRevision() {
        return latestRevision;
    }

    public void setLatestRevision(boolean latestRevision) {
        this.latestRevision = latestRevision;
    }

    public boolean isDraftOnly() {
        return draftOnly;
    }

    public void setDraftOnly(boolean draftOnly) {
        this.draftOnly = draftOnly;
    }
}
