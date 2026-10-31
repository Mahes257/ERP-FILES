package com.vishatech.erp.entity;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "purchase_manufacturing_jobs", indexes = {
        @Index(name = "idx_mfr_no", columnList = "mfrNo"),
        @Index(name = "idx_mfr_po", columnList = "poNo"),
        @Index(name = "idx_mfr_job_status", columnList = "status")
})
public class PurchaseManufacturingJob {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(nullable=false, unique=true, length=30) private String mfrNo;
    @Column(nullable=false, length=60) private String poNo;
    @Column(nullable=false, length=160) private String vendor;
    @Column(length=255) private String product;
    private BigDecimal qty = BigDecimal.ZERO;
    private BigDecimal packedQty = BigDecimal.ZERO;
    @Column(length=40) private String status = "In Production";
    private Integer progress = 0;
    private LocalDate startDate;
    private LocalDate expectedDate;
    @Column(length=120) private String warehouse;
    @Column(columnDefinition = "TEXT") private String notes;
    @Column(columnDefinition = "TEXT") private String itemsJson;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    @PrePersist void create() { createdAt = LocalDateTime.now(); updatedAt = createdAt; }
    @PreUpdate void update() { updatedAt = LocalDateTime.now(); }

    public Long getId() { return id; }
    public String getMfrNo() { return mfrNo; }
    public void setMfrNo(String v) { mfrNo = v; }
    public String getPoNo() { return poNo; }
    public void setPoNo(String v) { poNo = v; }
    public String getVendor() { return vendor; }
    public void setVendor(String v) { vendor = v; }
    public String getProduct() { return product; }
    public void setProduct(String v) { product = v; }
    public BigDecimal getQty() { return qty; }
    public void setQty(BigDecimal v) { qty = v; }
    public BigDecimal getPackedQty() { return packedQty; }
    public void setPackedQty(BigDecimal v) { packedQty = v; }
    public String getStatus() { return status; }
    public void setStatus(String v) { status = v; }
    public Integer getProgress() { return progress; }
    public void setProgress(Integer v) { progress = v; }
    public LocalDate getStartDate() { return startDate; }
    public void setStartDate(LocalDate v) { startDate = v; }
    public LocalDate getExpectedDate() { return expectedDate; }
    public void setExpectedDate(LocalDate v) { expectedDate = v; }
    public String getWarehouse() { return warehouse; }
    public void setWarehouse(String v) { warehouse = v; }
    public String getNotes() { return notes; }
    public void setNotes(String v) { notes = v; }
    public String getItemsJson() { return itemsJson; }
    public void setItemsJson(String v) { itemsJson = v; }
    public LocalDateTime getCreatedAt() { return createdAt; }
}
