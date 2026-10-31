package com.vishatech.erp.entity;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "purchase_adjustment_notes", indexes = {
    @Index(name = "idx_note_no", columnList = "noteNo"),
    @Index(name = "idx_note_invoice", columnList = "invoiceId"),
    @Index(name = "idx_note_status", columnList = "status")
})
public class PurchaseAdjustmentNote {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(nullable = false, unique = true, length = 100)
    private String noteNo;
    @Column(nullable = false, length = 20)
    private String noteType;
    @Column(nullable = false, length = 50)
    private String status = "Draft";
    private Boolean allowExcess = false;
    @Column(nullable = false)
    private Long invoiceId;
    @Column(length = 100)
    private String invoiceNo;
    @Column(length = 100)
    private String poNo;
    @Column(length = 255)
    private String vendor;
    @Column(length = 255)
    private String vendorEmail;
    @Column(length = 20)
    private String currency = "INR";
    private LocalDate noteDate;
    @Column(columnDefinition = "TEXT")
    private String reason;
    @Column(length = 255)
    private String reference;
    @Column(columnDefinition = "TEXT")
    private String notes;
    @Column(length = 50)
    private String gstType;
    @Column(precision = 15, scale = 3)
    private BigDecimal discount = BigDecimal.ZERO;
    @Column(precision = 15, scale = 3)
    private BigDecimal charges = BigDecimal.ZERO;
    @Column(precision = 15, scale = 3)
    private BigDecimal freight = BigDecimal.ZERO;
    @Column(nullable = false, precision = 15, scale = 3)
    private BigDecimal amount = BigDecimal.ZERO;
    @Column(nullable = false, precision = 15, scale = 3)
    private BigDecimal gst = BigDecimal.ZERO;
    @Column(nullable = false, precision = 15, scale = 3)
    private BigDecimal total = BigDecimal.ZERO;
    @Column(columnDefinition = "TEXT")
    private String approvalHistoryJson;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    @OneToMany(mappedBy = "adjustmentNote", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.EAGER)
    private List<PurchaseAdjustmentNoteItem> items = new ArrayList<>();

    @PrePersist void create() { createdAt = LocalDateTime.now(); updatedAt = createdAt; }
    @PreUpdate void update() { updatedAt = LocalDateTime.now(); }

    public Long getId() { return id; }
    public String getNoteNo() { return noteNo; }
    public void setNoteNo(String v) { noteNo = v; }
    public String getNoteType() { return noteType; }
    public void setNoteType(String v) { noteType = v; }
    public String getStatus() { return status; }
    public void setStatus(String v) { status = v; }
    public Boolean getAllowExcess() { return allowExcess; }
    public void setAllowExcess(Boolean v) { allowExcess = v; }
    public Long getInvoiceId() { return invoiceId; }
    public void setInvoiceId(Long v) { invoiceId = v; }
    public String getInvoiceNo() { return invoiceNo; }
    public void setInvoiceNo(String v) { invoiceNo = v; }
    public String getPoNo() { return poNo; }
    public void setPoNo(String v) { poNo = v; }
    public String getVendor() { return vendor; }
    public void setVendor(String v) { vendor = v; }
    public String getVendorEmail() { return vendorEmail; }
    public void setVendorEmail(String v) { vendorEmail = v; }
    public String getCurrency() { return currency; }
    public void setCurrency(String v) { currency = v; }
    public LocalDate getNoteDate() { return noteDate; }
    public void setNoteDate(LocalDate v) { noteDate = v; }
    public String getReason() { return reason; }
    public void setReason(String v) { reason = v; }
    public String getReference() { return reference; }
    public void setReference(String v) { reference = v; }
    public String getNotes() { return notes; }
    public void setNotes(String v) { notes = v; }
    public String getGstType() { return gstType; }
    public void setGstType(String v) { gstType = v; }
    public BigDecimal getDiscount() { return discount; }
    public void setDiscount(BigDecimal v) { discount = v; }
    public BigDecimal getCharges() { return charges; }
    public void setCharges(BigDecimal v) { charges = v; }
    public BigDecimal getFreight() { return freight; }
    public void setFreight(BigDecimal v) { freight = v; }
    public BigDecimal getAmount() { return amount; }
    public void setAmount(BigDecimal v) { amount = v; }
    public BigDecimal getGst() { return gst; }
    public void setGst(BigDecimal v) { gst = v; }
    public BigDecimal getTotal() { return total; }
    public void setTotal(BigDecimal v) { total = v; }
    public String getApprovalHistoryJson() { return approvalHistoryJson; }
    public void setApprovalHistoryJson(String v) { approvalHistoryJson = v; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public List<PurchaseAdjustmentNoteItem> getItems() { return items; }
    public void setItems(List<PurchaseAdjustmentNoteItem> v) { items = v; }
}
