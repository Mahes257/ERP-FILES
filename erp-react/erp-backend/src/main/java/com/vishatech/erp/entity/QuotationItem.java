package com.vishatech.erp.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "quotation_items")
public class QuotationItem {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "quotation_id", nullable = false)
    private Quotation quotation;

    // Product identity from the shared product master — kept with the item so
    // the Product name survives save/reload and matches the Description that
    // was fetched from the same product record (Product ↔ Description data
    // consistency).
    private Long productId;

    private String productName;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String description;

    private String sku;

    private String drawingNo;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String material;

    @Column(name = "delivery")
    private String leadTime;

    /**
     * JSON array of additional description detail rows.
     * Each element: { "label": "Surface Finish", "value": "Powder Coated" }
     * Supports addable/editable/deletable custom description rows per item.
     */
    @Lob
    @Column(columnDefinition = "TEXT")
    private String descriptionRowsJson;

    private String hsn;

    private String uom;

    private String batchCode;

    private String expiryDate;

    @Column(precision = 18, scale = 3)
    private BigDecimal qty = BigDecimal.ONE;

    @Column(precision = 18, scale = 2)
    private BigDecimal rate = BigDecimal.ZERO;

    @Column(precision = 8, scale = 2)
    private BigDecimal discountPct = BigDecimal.ZERO;

    @Column(precision = 8, scale = 2)
    private BigDecimal gstRate = BigDecimal.ZERO;

    // User-defined grid column cell values for this row ({columnId: value}) as a
    // JSON object — the same shape the CPR item grid uses. Column DEFINITIONS
    // (id/label/type/order/width) live in the shared grid-config store, so no
    // dynamic ALTER TABLE is ever needed per custom column.
    @Lob
    @Column(columnDefinition = "TEXT")
    private String customFieldsJson;

    private LocalDateTime createdAt;

    @PrePersist
    void onCreate() {
        createdAt = LocalDateTime.now();
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Quotation getQuotation() {
        return quotation;
    }

    public void setQuotation(Quotation quotation) {
        this.quotation = quotation;
    }

    public Long getProductId() {
        return productId;
    }

    public void setProductId(Long productId) {
        this.productId = productId;
    }

    public String getProductName() {
        return productName;
    }

    public void setProductName(String productName) {
        this.productName = productName;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public String getSku() {
        return sku;
    }

    public void setSku(String sku) {
        this.sku = sku;
    }

    public String getDrawingNo() {
        return drawingNo;
    }

    public void setDrawingNo(String drawingNo) {
        this.drawingNo = drawingNo;
    }

    public String getMaterial() {
        return material;
    }

    public void setMaterial(String material) {
        this.material = material;
    }

    public String getLeadTime() {
        return leadTime;
    }

    public void setLeadTime(String leadTime) {
        this.leadTime = leadTime;
    }

    public String getDescriptionRowsJson() {
        return descriptionRowsJson;
    }

    public void setDescriptionRowsJson(String descriptionRowsJson) {
        this.descriptionRowsJson = descriptionRowsJson;
    }

    public String getHsn() {
        return hsn;
    }

    public void setHsn(String hsn) {
        this.hsn = hsn;
    }

    public String getUom() {
        return uom;
    }

    public void setUom(String uom) {
        this.uom = uom;
    }

    public String getBatchCode() {
        return batchCode;
    }

    public void setBatchCode(String batchCode) {
        this.batchCode = batchCode;
    }

    public String getExpiryDate() {
        return expiryDate;
    }

    public void setExpiryDate(String expiryDate) {
        this.expiryDate = expiryDate;
    }

    public BigDecimal getQty() {
        return qty;
    }

    public void setQty(BigDecimal qty) {
        this.qty = qty;
    }

    public BigDecimal getRate() {
        return rate;
    }

    public void setRate(BigDecimal rate) {
        this.rate = rate;
    }

    public BigDecimal getDiscountPct() {
        return discountPct;
    }

    public void setDiscountPct(BigDecimal discountPct) {
        this.discountPct = discountPct;
    }

    public BigDecimal getGstRate() {
        return gstRate;
    }

    public void setGstRate(BigDecimal gstRate) {
        this.gstRate = gstRate;
    }

    public String getCustomFieldsJson() {
        return customFieldsJson;
    }

    public void setCustomFieldsJson(String customFieldsJson) {
        this.customFieldsJson = customFieldsJson;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }
}
