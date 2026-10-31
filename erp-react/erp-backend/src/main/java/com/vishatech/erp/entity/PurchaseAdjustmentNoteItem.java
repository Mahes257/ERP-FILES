package com.vishatech.erp.entity;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import java.math.BigDecimal;

@Entity
@Table(name = "purchase_adjustment_note_items")
public class PurchaseAdjustmentNoteItem {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "adjustment_note_id", nullable = false)
    @JsonIgnore
    private PurchaseAdjustmentNote adjustmentNote;
    @Column(length = 255)
    private String product;
    @Column(length = 100)
    private String hsn;
    @Column(length = 50)
    private String uom;
    @Column(precision = 15, scale = 3)
    private BigDecimal qty = BigDecimal.ZERO;
    @Column(precision = 15, scale = 3)
    private BigDecimal rate = BigDecimal.ZERO;
    @Column(precision = 10, scale = 3)
    private BigDecimal gstRate = BigDecimal.ZERO;
    @Column(precision = 15, scale = 3)
    private BigDecimal discount = BigDecimal.ZERO;

    public Long getId() { return id; }
    public PurchaseAdjustmentNote getAdjustmentNote() { return adjustmentNote; }
    public void setAdjustmentNote(PurchaseAdjustmentNote v) { adjustmentNote = v; }
    public String getProduct() { return product; }
    public void setProduct(String v) { product = v; }
    public String getHsn() { return hsn; }
    public void setHsn(String v) { hsn = v; }
    public String getUom() { return uom; }
    public void setUom(String v) { uom = v; }
    public BigDecimal getQty() { return qty; }
    public void setQty(BigDecimal v) { qty = v; }
    public BigDecimal getRate() { return rate; }
    public void setRate(BigDecimal v) { rate = v; }
    public BigDecimal getGstRate() { return gstRate; }
    public void setGstRate(BigDecimal v) { gstRate = v; }
    public BigDecimal getDiscount() { return discount; }
    public void setDiscount(BigDecimal v) { discount = v; }
}
