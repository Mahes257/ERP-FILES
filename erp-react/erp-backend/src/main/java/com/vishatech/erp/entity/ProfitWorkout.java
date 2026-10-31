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
import jakarta.persistence.JoinColumn;
import jakarta.persistence.Lob;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "profit_workouts")
public class ProfitWorkout {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 40, unique = true)
    private String pwNo;

    private LocalDateTime pwDate;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 40)
    private ProfitWorkoutStatus status = ProfitWorkoutStatus.DRAFT;

    private String preparedBy;

    private String contactPerson;

    private String department;

    /** Currency code (INR default) used for display and pricing. */
    @Column(nullable = false, length = 8)
    private String currency = "INR";

    /** Free-text project reference (no project master in this ERP). */
    private String project;

    private String sourceLead;

    private String customerName;

    private String cprRef;

    /**
     * Linked CPR — real relational FK to cprs.id (referential integrity,
     * prevents orphan Profit Workouts). Set via setCprId() for convenience.
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "cpr_id")
    private Cpr cpr;

    private String phone;

    private String email;

    private String company;

    private String gst;

    private String pan;

    private String linkedCpr;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String billingAddress;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String shippingAddress;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String remarks;

    @Column(precision = 10, scale = 2)
    private BigDecimal profitPct = BigDecimal.ZERO;

    @Column(precision = 18, scale = 2)
    private BigDecimal profitAmt = BigDecimal.ZERO;

    @Column(precision = 18, scale = 2)
    private BigDecimal sellingPrice = BigDecimal.ZERO;

    @Column(precision = 10, scale = 2)
    private BigDecimal discountPct = BigDecimal.ZERO;

    @Column(precision = 18, scale = 2)
    private BigDecimal discountAmt = BigDecimal.ZERO;

    /** Additional charges (non-GST) added to the grand total. */
    @Column(precision = 18, scale = 2)
    private BigDecimal additionalCharges = BigDecimal.ZERO;

    @Column(precision = 10, scale = 2)
    private BigDecimal gstPct = BigDecimal.valueOf(18);

    @Column(precision = 18, scale = 2)
    private BigDecimal gstAmt = BigDecimal.ZERO;

    @Column(precision = 18, scale = 2)
    private BigDecimal subtotal = BigDecimal.ZERO;

    @Column(precision = 18, scale = 2)
    private BigDecimal grandTotal = BigDecimal.ZERO;

    private String approvedBy;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String rejectionReason;


    private LocalDateTime createdAt;

    private LocalDateTime updatedAt;

    private LocalDateTime archivedAt;

    /**
     * Source Cost Workout this Profit Workout was converted from (one CW → one
     * PW). Null for manually created Profit Workouts.
     */
    private Long sourceCwId;

    private String sourceCwNo;

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
     * and has never been explicitly saved. The first explicit save commits the
     * row in place (no revision) and clears this flag — mirroring the CPR
     * module's create-vs-edit rule.
     */
    @Column(nullable = false)
    private boolean draftOnly = false;

    @OneToMany(mappedBy = "profitWorkout", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("id ASC")
    private List<ProfitWorkoutItem> items = new ArrayList<>();

    @OneToMany(mappedBy = "profitWorkout", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("createdAt ASC")
    private List<ProfitWorkoutTimeline> timeline = new ArrayList<>();

    @Lob
    @Column(columnDefinition = "LONGTEXT")
    private String attachmentsJson;

    @PrePersist
    void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = createdAt;
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = LocalDateTime.now();
    }

    public void addItem(ProfitWorkoutItem item) {
        item.setProfitWorkout(this);
        items.add(item);
    }

    public void addTimeline(ProfitWorkoutTimeline entry) {
        entry.setProfitWorkout(this);
        timeline.add(entry);
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getPwNo() {
        return pwNo;
    }

    public void setPwNo(String pwNo) {
        this.pwNo = pwNo;
    }

    public LocalDateTime getPwDate() {
        return pwDate;
    }

    public void setPwDate(LocalDateTime pwDate) {
        this.pwDate = pwDate;
    }

    public ProfitWorkoutStatus getStatus() {
        return status;
    }

    public void setStatus(ProfitWorkoutStatus status) {
        this.status = status;
    }

    public String getPreparedBy() {
        return preparedBy;
    }

    public void setPreparedBy(String preparedBy) {
        this.preparedBy = preparedBy;
    }

    public String getContactPerson() {
        return contactPerson;
    }

    public void setContactPerson(String contactPerson) {
        this.contactPerson = contactPerson;
    }

    public String getDepartment() {
        return department;
    }

    public void setDepartment(String department) {
        this.department = department;
    }

    public String getCurrency() {
        return currency;
    }

    public void setCurrency(String currency) {
        this.currency = currency == null || currency.isBlank() ? "INR" : currency.trim();
    }

    public String getProject() {
        return project;
    }

    public void setProject(String project) {
        this.project = project;
    }

    public String getSourceLead() {
        return sourceLead;
    }

    public void setSourceLead(String sourceLead) {
        this.sourceLead = sourceLead;
    }

    public String getCustomerName() {
        return customerName;
    }

    public void setCustomerName(String customerName) {
        this.customerName = customerName;
    }

    public String getCprRef() {
        return cprRef;
    }

    public void setCprRef(String cprRef) {
        this.cprRef = cprRef;
    }

    public Long getCprId() {
        return cpr == null ? null : cpr.getId();
    }

    public void setCprId(Long cprId) {
        if (cprId == null) {
            this.cpr = null;
        } else if (this.cpr == null || !cprId.equals(this.cpr.getId())) {
            Cpr ref = new Cpr();
            ref.setId(cprId);
            this.cpr = ref;
        }
    }

    public Cpr getCpr() {
        return cpr;
    }

    public void setCpr(Cpr cpr) {
        this.cpr = cpr;
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

    public String getPan() {
        return pan;
    }

    public void setPan(String pan) {
        this.pan = pan;
    }

    public String getLinkedCpr() {
        return linkedCpr;
    }

    public void setLinkedCpr(String linkedCpr) {
        this.linkedCpr = linkedCpr;
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

    public BigDecimal getProfitPct() {
        return profitPct;
    }

    public void setProfitPct(BigDecimal profitPct) {
        this.profitPct = profitPct;
    }

    public BigDecimal getProfitAmt() {
        return profitAmt;
    }

    public void setProfitAmt(BigDecimal profitAmt) {
        this.profitAmt = profitAmt;
    }

    public BigDecimal getSellingPrice() {
        return sellingPrice;
    }

    public void setSellingPrice(BigDecimal sellingPrice) {
        this.sellingPrice = sellingPrice;
    }

    public BigDecimal getDiscountPct() {
        return discountPct;
    }

    public void setDiscountPct(BigDecimal discountPct) {
        this.discountPct = discountPct;
    }

    public BigDecimal getDiscountAmt() {
        return discountAmt;
    }

    public void setDiscountAmt(BigDecimal discountAmt) {
        this.discountAmt = discountAmt;
    }

    public BigDecimal getAdditionalCharges() {
        return additionalCharges;
    }

    public void setAdditionalCharges(BigDecimal additionalCharges) {
        this.additionalCharges = additionalCharges == null ? BigDecimal.ZERO : additionalCharges;
    }

    public BigDecimal getGstPct() {
        return gstPct;
    }

    public void setGstPct(BigDecimal gstPct) {
        this.gstPct = gstPct;
    }

    public BigDecimal getGstAmt() {
        return gstAmt;
    }

    public void setGstAmt(BigDecimal gstAmt) {
        this.gstAmt = gstAmt;
    }

    public BigDecimal getSubtotal() {
        return subtotal;
    }

    public void setSubtotal(BigDecimal subtotal) {
        this.subtotal = subtotal;
    }

    public BigDecimal getGrandTotal() {
        return grandTotal;
    }

    public void setGrandTotal(BigDecimal grandTotal) {
        this.grandTotal = grandTotal;
    }

    public String getApprovedBy() {
        return approvedBy;
    }

    public void setApprovedBy(String approvedBy) {
        this.approvedBy = approvedBy;
    }

    public String getRejectionReason() {
        return rejectionReason;
    }

    public void setRejectionReason(String rejectionReason) {
        this.rejectionReason = rejectionReason;
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

    public Long getSourceCwId() {
        return sourceCwId;
    }

    public void setSourceCwId(Long sourceCwId) {
        this.sourceCwId = sourceCwId;
    }

    public String getSourceCwNo() {
        return sourceCwNo;
    }

    public void setSourceCwNo(String sourceCwNo) {
        this.sourceCwNo = sourceCwNo;
    }

    public List<ProfitWorkoutItem> getItems() {
        return items;
    }

    public void setItems(List<ProfitWorkoutItem> items) {
        this.items = items;
    }

    public List<ProfitWorkoutTimeline> getTimeline() {
        return timeline;
    }

    public void setTimeline(List<ProfitWorkoutTimeline> timeline) {
        this.timeline = timeline;
    }

    public String getAttachmentsJson() {
        return attachmentsJson;
    }

    public void setAttachmentsJson(String attachmentsJson) {
        this.attachmentsJson = attachmentsJson;
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
