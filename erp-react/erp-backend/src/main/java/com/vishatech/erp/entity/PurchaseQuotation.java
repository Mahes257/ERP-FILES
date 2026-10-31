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
 * Supplier quotation recorded against an RFQ.
 *
 * Quotations are scored on six weighted criteria (price, delivery,
 * lead time, warranty, payment terms, vendor quality) — the score is
 * derived server-side and the shape mirrors the frontend quotation
 * contract exactly.
 */
@Entity
@Table(name = "purchase_quotations", indexes = {
        @Index(name = "idx_quote_rfq_no", columnList = "rfqNo"),
        @Index(name = "idx_quote_status", columnList = "status")
})
public class PurchaseQuotation {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 60)
    private String quotationNo;

    @Column(nullable = false, length = 60)
    private String rfqNo;

    @Column(nullable = false, length = 160)
    private String vendor;

    @Column(length = 10)
    private String submittedOn;

    @Column(nullable = false, precision = 16, scale = 2)
    private BigDecimal total = BigDecimal.ZERO;

    @Column(precision = 16, scale = 2)
    private BigDecimal discount = BigDecimal.ZERO;

    @Column(precision = 16, scale = 2)
    private BigDecimal tax = BigDecimal.ZERO;

    @Column(precision = 16, scale = 2)
    private BigDecimal charges = BigDecimal.ZERO;

    @Column(precision = 16, scale = 2)
    private BigDecimal freight = BigDecimal.ZERO;

    @Column(precision = 16, scale = 2)
    private BigDecimal insurance = BigDecimal.ZERO;

    @Column(length = 10)
    private String currency;

    /** Delivery in days. */
    private Integer delivery;

    @Column(length = 20)
    private String validUntil;

    private Integer leadTime;

    @Column(length = 40)
    private String paymentTerms;

    @Column(length = 30)
    private String warranty;

    @Column(nullable = false, precision = 5, scale = 2)
    private BigDecimal score = BigDecimal.ZERO;

    /** Pending / Received / Accepted / Rejected (QUOTATION_STATUS). */
    @Column(nullable = false, length = 20)
    private String status = "Pending";

    @Lob
    @Column(columnDefinition = "TEXT")
    private String itemsJson;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String notes;

    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

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
    public String getQuotationNo() { return quotationNo; }
    public void setQuotationNo(String quotationNo) { this.quotationNo = quotationNo; }
    public String getRfqNo() { return rfqNo; }
    public void setRfqNo(String rfqNo) { this.rfqNo = rfqNo; }
    public String getVendor() { return vendor; }
    public void setVendor(String vendor) { this.vendor = vendor; }
    public String getSubmittedOn() { return submittedOn; }
    public void setSubmittedOn(String submittedOn) { this.submittedOn = submittedOn; }
    public BigDecimal getTotal() { return total; }
    public void setTotal(BigDecimal total) { this.total = total; }
    public BigDecimal getDiscount() { return discount; }
    public void setDiscount(BigDecimal discount) { this.discount = discount; }
    public BigDecimal getTax() { return tax; }
    public void setTax(BigDecimal tax) { this.tax = tax; }
    public BigDecimal getCharges() { return charges; }
    public void setCharges(BigDecimal charges) { this.charges = charges; }
    public BigDecimal getFreight() { return freight; }
    public void setFreight(BigDecimal freight) { this.freight = freight; }
    public BigDecimal getInsurance() { return insurance; }
    public void setInsurance(BigDecimal insurance) { this.insurance = insurance; }
    public String getCurrency() { return currency; }
    public void setCurrency(String currency) { this.currency = currency; }
    public Integer getDelivery() { return delivery; }
    public void setDelivery(Integer delivery) { this.delivery = delivery; }
    public String getValidUntil() { return validUntil; }
    public void setValidUntil(String validUntil) { this.validUntil = validUntil; }
    public Integer getLeadTime() { return leadTime; }
    public void setLeadTime(Integer leadTime) { this.leadTime = leadTime; }
    public String getPaymentTerms() { return paymentTerms; }
    public void setPaymentTerms(String paymentTerms) { this.paymentTerms = paymentTerms; }
    public String getWarranty() { return warranty; }
    public void setWarranty(String warranty) { this.warranty = warranty; }
    public BigDecimal getScore() { return score; }
    public void setScore(BigDecimal score) { this.score = score; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public String getItemsJson() { return itemsJson; }
    public void setItemsJson(String itemsJson) { this.itemsJson = itemsJson; }
    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}
