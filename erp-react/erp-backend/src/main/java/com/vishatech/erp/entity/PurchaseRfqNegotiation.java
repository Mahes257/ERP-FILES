package com.vishatech.erp.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Lob;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * A single recorded negotiation round between the buyer and one vendor
 * for an RFQ. Rounds are the queryable projection of the negotiation
 * history held on {@link PurchaseRfqEvaluationRecord} — every round the
 * user submits through Final Negotiation lands here.
 */
@Entity
@Table(name = "purchase_rfq_negotiations", indexes = {
        @Index(name = "idx_rfq_negotiation_no", columnList = "rfqNo"),
        @Index(name = "idx_rfq_negotiation_vendor", columnList = "vendor")
})
public class PurchaseRfqNegotiation {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 60)
    private String rfqNo;

    @Column(length = 200)
    private String vendor;

    /** Quotation the round was negotiated against, when known. */
    @Column(length = 60)
    private String quotationNo;

    @Column(length = 60)
    private String vendorRef;

    @Column(nullable = false)
    private Integer roundNo;

    @Column(precision = 18, scale = 2)
    private BigDecimal amount;

    /** Not Started / In Progress / Agreed / Rejected. */
    @Column(length = 40)
    private String stage;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String note;

    @Column(length = 120)
    private String actor;

    /** Item-level negotiated rates keyed by line index (JSON). */
    @Lob
    @Column(columnDefinition = "TEXT")
    private String itemRatesJson;

    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    void onCreate() {
        LocalDateTime now = LocalDateTime.now();
        if (createdAt == null) createdAt = now;
        if (updatedAt == null) updatedAt = now;
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = LocalDateTime.now();
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getRfqNo() {
        return rfqNo;
    }

    public void setRfqNo(String rfqNo) {
        this.rfqNo = rfqNo;
    }

    public String getVendor() {
        return vendor;
    }

    public void setVendor(String vendor) {
        this.vendor = vendor;
    }

    public String getQuotationNo() {
        return quotationNo;
    }

    public void setQuotationNo(String quotationNo) {
        this.quotationNo = quotationNo;
    }

    public String getVendorRef() {
        return vendorRef;
    }

    public void setVendorRef(String vendorRef) {
        this.vendorRef = vendorRef;
    }

    public Integer getRoundNo() {
        return roundNo;
    }

    public void setRoundNo(Integer roundNo) {
        this.roundNo = roundNo;
    }

    public BigDecimal getAmount() {
        return amount;
    }

    public void setAmount(BigDecimal amount) {
        this.amount = amount;
    }

    public String getStage() {
        return stage;
    }

    public void setStage(String stage) {
        this.stage = stage;
    }

    public String getNote() {
        return note;
    }

    public void setNote(String note) {
        this.note = note;
    }

    public String getActor() {
        return actor;
    }

    public void setActor(String actor) {
        this.actor = actor;
    }

    public String getItemRatesJson() {
        return itemRatesJson;
    }

    public void setItemRatesJson(String itemRatesJson) {
        this.itemRatesJson = itemRatesJson;
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
}
