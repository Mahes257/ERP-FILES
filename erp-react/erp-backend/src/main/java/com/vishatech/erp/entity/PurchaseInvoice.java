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
 * Vendor invoice against a Purchase Order, with three-way matching
 * (PO ↔ GRN ↔ invoice) and the payment ledger.
 *
 * Statuses mirror the frontend INVOICE_STATUS contract: Draft →
 * Submitted → Approved → Partially Paid → Paid (Rejected / Overdue as
 * side states). Payment entries persist as JSON rows carrying their
 * own Active / Reversed lifecycle (PAYMENT_ENTRY_STATUS).
 */
@Entity
@Table(name = "purchase_invoices", indexes = {
        @Index(name = "idx_pinv_status", columnList = "status"),
        @Index(name = "idx_pinv_po_no", columnList = "poNo"),
        @Index(name = "idx_pinv_vendor", columnList = "vendor")
})
public class PurchaseInvoice {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Internal document number, e.g. VINV-2026-0001 (unique). */
    @Column(nullable = false, unique = true, length = 60)
    private String invoiceNo;

    /** The vendor's own invoice number (mandatory, unique per vendor). */
    @Column(nullable = false, length = 60)
    private String vendorInvoiceNo;

    @Column(nullable = false, length = 160)
    private String vendor;

    @Column(length = 120)
    private String vendorEmail;

    @Column(nullable = false, length = 60)
    private String poNo;

    @Column(length = 60)
    private String grnNo;

    @Column(length = 60)
    private String vendorReference;

    /** Standard / Supplementary / Debit Note / Credit Note. */
    @Column(length = 30)
    private String invoiceType = "Standard";

    @Column(length = 10)
    private String invoiceDate;

    @Column(length = 10)
    private String dueDate;

    @Column(nullable = false, precision = 16, scale = 2)
    private BigDecimal amount = BigDecimal.ZERO;

    @Column(nullable = false, precision = 14, scale = 2)
    private BigDecimal gst = BigDecimal.ZERO;

    @Column(length = 60)
    private String gstType;

    @Column(precision = 6, scale = 2)
    private BigDecimal discount;

    @Column(precision = 14, scale = 2)
    private BigDecimal charges;

    @Column(precision = 14, scale = 2)
    private BigDecimal freight;

    @Column(precision = 14, scale = 2)
    private BigDecimal tds;

    @Column(precision = 14, scale = 2)
    private BigDecimal retention;

    @Column(nullable = false, precision = 16, scale = 2)
    private BigDecimal total = BigDecimal.ZERO;

    @Column(nullable = false, precision = 16, scale = 2)
    private BigDecimal paidAmount = BigDecimal.ZERO;

    @Column(length = 10)
    private String currency;

    /** Draft / Submitted / Approved / Rejected / Partially Paid / Paid / Overdue. */
    @Column(nullable = false, length = 30)
    private String status = "Draft";

    /** Pending Match / Matched / Partially Matched / Mismatch / Exception. */
    @Column(nullable = false, length = 30)
    private String matchStatus = "Pending Match";

    /** Unpaid / Scheduled / Processing / Paid / Partially Paid / Failed. */
    @Column(length = 30)
    private String paymentStatus;

    @Column(length = 20)
    private String adviceStatus;

    /** Payment ledger entries as JSON array (method, amount, date, ...). */
    @Lob
    @Column(columnDefinition = "TEXT")
    private String paymentsJson;

    /** Invoice line items as JSON array. */
    @Lob
    @Column(columnDefinition = "TEXT")
    private String itemsJson;

    /** Match computation detail as JSON (per-line PO/GRN/invoice qty+rate). */
    @Lob
    @Column(columnDefinition = "TEXT")
    private String matchDetailJson;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String notes;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String approvalHistoryJson;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String attachmentsJson;

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
    public String getInvoiceNo() { return invoiceNo; }
    public void setInvoiceNo(String invoiceNo) { this.invoiceNo = invoiceNo; }
    public String getVendorInvoiceNo() { return vendorInvoiceNo; }
    public void setVendorInvoiceNo(String vendorInvoiceNo) { this.vendorInvoiceNo = vendorInvoiceNo; }
    public String getVendor() { return vendor; }
    public void setVendor(String vendor) { this.vendor = vendor; }
    public String getVendorEmail() { return vendorEmail; }
    public void setVendorEmail(String vendorEmail) { this.vendorEmail = vendorEmail; }
    public String getPoNo() { return poNo; }
    public void setPoNo(String poNo) { this.poNo = poNo; }
    public String getGrnNo() { return grnNo; }
    public void setGrnNo(String grnNo) { this.grnNo = grnNo; }
    public String getVendorReference() { return vendorReference; }
    public void setVendorReference(String vendorReference) { this.vendorReference = vendorReference; }
    public String getInvoiceType() { return invoiceType; }
    public void setInvoiceType(String invoiceType) { this.invoiceType = invoiceType; }
    public String getInvoiceDate() { return invoiceDate; }
    public void setInvoiceDate(String invoiceDate) { this.invoiceDate = invoiceDate; }
    public String getDueDate() { return dueDate; }
    public void setDueDate(String dueDate) { this.dueDate = dueDate; }
    public BigDecimal getAmount() { return amount; }
    public void setAmount(BigDecimal amount) { this.amount = amount; }
    public BigDecimal getGst() { return gst; }
    public void setGst(BigDecimal gst) { this.gst = gst; }
    public String getGstType() { return gstType; }
    public void setGstType(String gstType) { this.gstType = gstType; }
    public BigDecimal getDiscount() { return discount; }
    public void setDiscount(BigDecimal discount) { this.discount = discount; }
    public BigDecimal getCharges() { return charges; }
    public void setCharges(BigDecimal charges) { this.charges = charges; }
    public BigDecimal getFreight() { return freight; }
    public void setFreight(BigDecimal freight) { this.freight = freight; }
    public BigDecimal getTds() { return tds; }
    public void setTds(BigDecimal tds) { this.tds = tds; }
    public BigDecimal getRetention() { return retention; }
    public void setRetention(BigDecimal retention) { this.retention = retention; }
    public BigDecimal getTotal() { return total; }
    public void setTotal(BigDecimal total) { this.total = total; }
    public BigDecimal getPaidAmount() { return paidAmount; }
    public void setPaidAmount(BigDecimal paidAmount) { this.paidAmount = paidAmount; }
    public String getCurrency() { return currency; }
    public void setCurrency(String currency) { this.currency = currency; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public String getMatchStatus() { return matchStatus; }
    public void setMatchStatus(String matchStatus) { this.matchStatus = matchStatus; }
    public String getPaymentStatus() { return paymentStatus; }
    public void setPaymentStatus(String paymentStatus) { this.paymentStatus = paymentStatus; }
    public String getAdviceStatus() { return adviceStatus; }
    public void setAdviceStatus(String adviceStatus) { this.adviceStatus = adviceStatus; }
    public String getPaymentsJson() { return paymentsJson; }
    public void setPaymentsJson(String paymentsJson) { this.paymentsJson = paymentsJson; }
    public String getItemsJson() { return itemsJson; }
    public void setItemsJson(String itemsJson) { this.itemsJson = itemsJson; }
    public String getMatchDetailJson() { return matchDetailJson; }
    public void setMatchDetailJson(String matchDetailJson) { this.matchDetailJson = matchDetailJson; }
    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }
    public String getApprovalHistoryJson() { return approvalHistoryJson; }
    public void setApprovalHistoryJson(String approvalHistoryJson) { this.approvalHistoryJson = approvalHistoryJson; }
    public String getAttachmentsJson() { return attachmentsJson; }
    public void setAttachmentsJson(String attachmentsJson) { this.attachmentsJson = attachmentsJson; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}
