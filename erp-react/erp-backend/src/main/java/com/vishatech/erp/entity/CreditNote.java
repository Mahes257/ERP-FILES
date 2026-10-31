package com.vishatech.erp.entity;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
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
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "credit_notes")
public class CreditNote {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 40, unique = true)
    private String cnNo;

    private LocalDateTime cnDate;

    @Column(nullable = false, length = 40)
    private String status = "draft";

    private String source;

    private String sourceRef;

    /** Original invoice / source document date — auto-filled when the source
     *  document is selected. Stored as a real DATE value (LocalDateTime). */
    private LocalDateTime sourceDate;

    /**
     * Date the credited consignment reached the customer's destination.
     *
     * <p>Credit-Note owned: no other document in the chain records it. The
     * Delivery Challan's {@code delivery_date} is the EXPECTED delivery date
     * (that is its label on the challan form and its meaning everywhere it is
     * read), so it is deliberately not relabelled as a "reached" date here.
     * Nullable: nothing is back-filled for historical notes.
     */
    private LocalDateTime destinationReachedDate;

    /**
     * Manual override of the linked Delivery Challan's dispatch date.
     *
     * <p>Dispatch Date is normally resolved from the Delivery Challan that
     * shipped the credited goods. When that challan records no dispatch date (or
     * records one the user must correct), the note keeps its OWN copy here —
     * the linked document is never written to. Nullable: null means "use the
     * linked challan's value", so an existing note keeps resolving exactly as
     * before until someone deliberately overrides it.
     */
    private LocalDateTime dispatchDateOverride;

    /**
     * Manual override of the authoritative Due Date.
     *
     * <p>Due Date is normally resolved from the linked invoice's due date, else
     * the linked CPO's delivery date. This override REPLACES that resolved value
     * as the authoritative date, including for the derived "Due Date Exceeded"
     * indicator — the indicator itself stays computed from this date and the
     * note's settlement state, so it can never be set inconsistently by hand.
     * Nullable: null means "resolve from the linked documents".
     */
    private LocalDateTime dueDateOverride;

    /** Settlement method for the credit amount (Adjust Against Invoice /
     *  Customer Credit / Refund). */
    private String settlementMethod;

    private String reason;

    @Column(precision = 18, scale = 2)
    private BigDecimal refundAmount = BigDecimal.ZERO;

    @Column(precision = 18, scale = 3)
    private BigDecimal returnQty = BigDecimal.ZERO;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String reasonDetail;

    private String inventoryImpact;

    private String companyName;

    private String companyGstin;

    private String companyPan;

    private String companyState;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String companyAddress;

    private Long clientId;

    private String clientName;

    private String contactPerson;

    private String gstin;
    private String taxType;

    private String hsnView;

    /** Document currency code (default INR). */
    private String currency;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String terms;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String remarks;

    private String email;

    private String phone;

    @Column(precision = 18, scale = 2)
    private BigDecimal subTotal = BigDecimal.ZERO;

    @Column(precision = 18, scale = 2)
    private BigDecimal discount = BigDecimal.ZERO;

    @Column(precision = 8, scale = 2)
    private BigDecimal discountPct = BigDecimal.ZERO;

    @Column(precision = 18, scale = 2)
    private BigDecimal cgstTotal = BigDecimal.ZERO;

    @Column(precision = 18, scale = 2)
    private BigDecimal sgstTotal = BigDecimal.ZERO;

    @Column(precision = 18, scale = 2)
    private BigDecimal taxTotal = BigDecimal.ZERO;

    @Column(precision = 18, scale = 2)
    private BigDecimal charges = BigDecimal.ZERO;

    @Column(precision = 18, scale = 2)
    private BigDecimal grandTotal = BigDecimal.ZERO;

    private String convertedToPr;

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

    @OneToMany(mappedBy = "creditNote", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("id ASC")
    private List<CreditNoteItem> items = new ArrayList<>();

    @PrePersist
    void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = createdAt;
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = LocalDateTime.now();
    }

    public void addItem(CreditNoteItem item) {
        item.setCreditNote(this);
        items.add(item);
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getCnNo() {
        return cnNo;
    }

    public void setCnNo(String cnNo) {
        this.cnNo = cnNo;
    }

    public LocalDateTime getCnDate() {
        return cnDate;
    }

    public void setCnDate(LocalDateTime cnDate) {
        this.cnDate = cnDate;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public String getSource() {
        return source;
    }

    public void setSource(String source) {
        this.source = source;
    }

    public String getSourceRef() {
        return sourceRef;
    }

    public void setSourceRef(String sourceRef) {
        this.sourceRef = sourceRef;
    }

    public LocalDateTime getSourceDate() {
        return sourceDate;
    }

    public void setSourceDate(LocalDateTime sourceDate) {
        this.sourceDate = sourceDate;
    }

    public LocalDateTime getDestinationReachedDate() {
        return destinationReachedDate;
    }

    public void setDestinationReachedDate(LocalDateTime destinationReachedDate) {
        this.destinationReachedDate = destinationReachedDate;
    }

    public LocalDateTime getDispatchDateOverride() {
        return dispatchDateOverride;
    }

    public void setDispatchDateOverride(LocalDateTime dispatchDateOverride) {
        this.dispatchDateOverride = dispatchDateOverride;
    }

    public LocalDateTime getDueDateOverride() {
        return dueDateOverride;
    }

    public void setDueDateOverride(LocalDateTime dueDateOverride) {
        this.dueDateOverride = dueDateOverride;
    }

    public String getSettlementMethod() {
        return settlementMethod;
    }

    public void setSettlementMethod(String settlementMethod) {
        this.settlementMethod = settlementMethod;
    }

    public String getReason() {
        return reason;
    }

    public void setReason(String reason) {
        this.reason = reason;
    }

    public BigDecimal getRefundAmount() {
        return refundAmount;
    }

    public void setRefundAmount(BigDecimal refundAmount) {
        this.refundAmount = refundAmount;
    }

    public BigDecimal getReturnQty() {
        return returnQty;
    }

    public void setReturnQty(BigDecimal returnQty) {
        this.returnQty = returnQty;
    }

    public String getReasonDetail() {
        return reasonDetail;
    }

    public void setReasonDetail(String reasonDetail) {
        this.reasonDetail = reasonDetail;
    }

    public String getInventoryImpact() {
        return inventoryImpact;
    }

    public void setInventoryImpact(String inventoryImpact) {
        this.inventoryImpact = inventoryImpact;
    }

    public String getCompanyName() {
        return companyName;
    }

    public void setCompanyName(String companyName) {
        this.companyName = companyName;
    }

    public String getCompanyGstin() {
        return companyGstin;
    }

    public void setCompanyGstin(String companyGstin) {
        this.companyGstin = companyGstin;
    }

    public String getCompanyPan() {
        return companyPan;
    }

    public void setCompanyPan(String companyPan) {
        this.companyPan = companyPan;
    }

    public String getCompanyState() {
        return companyState;
    }

    public void setCompanyState(String companyState) {
        this.companyState = companyState;
    }

    public String getCompanyAddress() {
        return companyAddress;
    }

    public void setCompanyAddress(String companyAddress) {
        this.companyAddress = companyAddress;
    }

    public Long getClientId() {
        return clientId;
    }

    public void setClientId(Long clientId) {
        this.clientId = clientId;
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

    public String getGstin() {
        return gstin;
    }

    public void setGstin(String gstin) {
        this.gstin = gstin;
    }

    public String getTaxType() {
        return taxType;
    }

    public void setTaxType(String taxType) {
        this.taxType = taxType;
    }

    public String getHsnView() {
        return hsnView;
    }

    public void setHsnView(String hsnView) {
        this.hsnView = hsnView;
    }

    public String getCurrency() {
        return currency;
    }

    public void setCurrency(String currency) {
        this.currency = currency;
    }

    public String getTerms() {
        return terms;
    }

    public void setTerms(String terms) {
        this.terms = terms;
    }

    public String getRemarks() {
        return remarks;
    }

    public void setRemarks(String remarks) {
        this.remarks = remarks;
    }

    public String getEmail() {
        return email;
    }

    public void setEmail(String email) {
        this.email = email;
    }

    public String getPhone() {
        return phone;
    }

    public void setPhone(String phone) {
        this.phone = phone;
    }

    public BigDecimal getSubTotal() {
        return subTotal;
    }

    public void setSubTotal(BigDecimal subTotal) {
        this.subTotal = subTotal;
    }

    public BigDecimal getDiscount() {
        return discount;
    }

    public void setDiscount(BigDecimal discount) {
        this.discount = discount;
    }

    public BigDecimal getDiscountPct() {
        return discountPct;
    }

    public void setDiscountPct(BigDecimal discountPct) {
        this.discountPct = discountPct;
    }

    public BigDecimal getCgstTotal() {
        return cgstTotal;
    }

    public void setCgstTotal(BigDecimal cgstTotal) {
        this.cgstTotal = cgstTotal;
    }

    public BigDecimal getSgstTotal() {
        return sgstTotal;
    }

    public void setSgstTotal(BigDecimal sgstTotal) {
        this.sgstTotal = sgstTotal;
    }

    public BigDecimal getTaxTotal() {
        return taxTotal;
    }

    public void setTaxTotal(BigDecimal taxTotal) {
        this.taxTotal = taxTotal;
    }

    public BigDecimal getCharges() {
        return charges;
    }

    public void setCharges(BigDecimal charges) {
        this.charges = charges;
    }

    public BigDecimal getGrandTotal() {
        return grandTotal;
    }

    public void setGrandTotal(BigDecimal grandTotal) {
        this.grandTotal = grandTotal;
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

    public String getConvertedToPr() {
        return convertedToPr;
    }

    public void setConvertedToPr(String convertedToPr) {
        this.convertedToPr = convertedToPr;
    }

    public LocalDateTime getArchivedAt() {
        return archivedAt;
    }

    public void setArchivedAt(LocalDateTime archivedAt) {
        this.archivedAt = archivedAt;
    }

    public List<CreditNoteItem> getItems() {
        return items;
    }

    public void setItems(List<CreditNoteItem> items) {
        this.items = items;
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
}
