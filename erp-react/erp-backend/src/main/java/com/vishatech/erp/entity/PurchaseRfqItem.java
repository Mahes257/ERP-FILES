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

/** Line item of an RFQ. */
@Entity
@Table(name = "purchase_rfq_items")
public class PurchaseRfqItem {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "rfq_id", nullable = false)
    private PurchaseRfq rfq;

    @Column(length = 60)
    private String itemCode;

    @Column(nullable = false, length = 255)
    private String product;

    @Column(length = 80)
    private String category;

    @Column(length = 500)
    private String specification;

    @Column(length = 10)
    private String requiredDate;

    @Column(length = 20)
    private String hsn;

    @Column(length = 20)
    private String uom;

    @Column(nullable = false, precision = 14, scale = 3)
    private BigDecimal qty = BigDecimal.ZERO;

    /** Expected / estimated rate carried from the PR line. */
    @Column(nullable = false, precision = 14, scale = 2)
    private BigDecimal rate = BigDecimal.ZERO;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public PurchaseRfq getRfq() { return rfq; }
    public void setRfq(PurchaseRfq rfq) { this.rfq = rfq; }
    public String getItemCode() { return itemCode; }
    public void setItemCode(String itemCode) { this.itemCode = itemCode; }
    public String getProduct() { return product; }
    public void setProduct(String product) { this.product = product; }
    public String getCategory() { return category; }
    public void setCategory(String category) { this.category = category; }
    public String getSpecification() { return specification; }
    public void setSpecification(String specification) { this.specification = specification; }
    public String getRequiredDate() { return requiredDate; }
    public void setRequiredDate(String requiredDate) { this.requiredDate = requiredDate; }
    public String getHsn() { return hsn; }
    public void setHsn(String hsn) { this.hsn = hsn; }
    public String getUom() { return uom; }
    public void setUom(String uom) { this.uom = uom; }
    public BigDecimal getQty() { return qty; }
    public void setQty(BigDecimal qty) { this.qty = qty; }
    public BigDecimal getRate() { return rate; }
    public void setRate(BigDecimal rate) { this.rate = rate; }
}
