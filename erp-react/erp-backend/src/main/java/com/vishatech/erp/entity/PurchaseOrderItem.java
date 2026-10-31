package com.vishatech.erp.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.math.BigDecimal;

/** Line item of a Purchase Order. */
@Entity
@Table(name = "purchase_order_items")
public class PurchaseOrderItem {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "order_id", nullable = false)
    private PurchaseOrder order;

    @Column(length = 60)
    private String itemCode;

    @Column(nullable = false, length = 255)
    private String product;

    @Column(length = 80)
    private String category;

    @Column(length = 20)
    private String hsn;

    @Column(length = 20)
    private String uom;

    @Column(nullable = false, precision = 14, scale = 3)
    private BigDecimal qty = BigDecimal.ZERO;

    @Column(nullable = false, precision = 14, scale = 2)
    private BigDecimal rate = BigDecimal.ZERO;

    @Column(precision = 6, scale = 2)
    private BigDecimal discount;

    @Column(nullable = false, precision = 6, scale = 2)
    private BigDecimal gstRate = BigDecimal.ZERO;

    @Column(length = 500)
    private String remarks;

    /** Received quantity so far (GRN roll-up). */
    @Column(precision = 14, scale = 3)
    private BigDecimal receivedQty = BigDecimal.ZERO;

    @Column(precision = 14, scale = 3)
    private BigDecimal cancelledQty = BigDecimal.ZERO;

    @Column(length = 10)
    private String expectedDate;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public PurchaseOrder getOrder() { return order; }
    public void setOrder(PurchaseOrder order) { this.order = order; }
    public String getItemCode() { return itemCode; }
    public void setItemCode(String itemCode) { this.itemCode = itemCode; }
    public String getProduct() { return product; }
    public void setProduct(String product) { this.product = product; }
    public String getCategory() { return category; }
    public void setCategory(String category) { this.category = category; }
    public String getHsn() { return hsn; }
    public void setHsn(String hsn) { this.hsn = hsn; }
    public String getUom() { return uom; }
    public void setUom(String uom) { this.uom = uom; }
    public BigDecimal getQty() { return qty; }
    public void setQty(BigDecimal qty) { this.qty = qty; }
    public BigDecimal getRate() { return rate; }
    public void setRate(BigDecimal rate) { this.rate = rate; }
    public BigDecimal getDiscount() { return discount; }
    public void setDiscount(BigDecimal discount) { this.discount = discount; }
    public BigDecimal getGstRate() { return gstRate; }
    public void setGstRate(BigDecimal gstRate) { this.gstRate = gstRate; }
    public String getRemarks() { return remarks; }
    public void setRemarks(String remarks) { this.remarks = remarks; }
    public BigDecimal getReceivedQty() { return receivedQty; }
    public void setReceivedQty(BigDecimal receivedQty) { this.receivedQty = receivedQty; }
    public BigDecimal getCancelledQty() { return cancelledQty; }
    public void setCancelledQty(BigDecimal cancelledQty) { this.cancelledQty = cancelledQty; }
    public String getExpectedDate() { return expectedDate; }
    public void setExpectedDate(String expectedDate) { this.expectedDate = expectedDate; }
}
