package com.vishatech.erp.entity;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * Purchase -> Logistics -> Inventory Update ledger row.
 *
 * One row per stock movement (Receipt / Issue / Adjustment / Transfer leg).
 * A transfer is stored as a PAIR of rows sharing a transferRef — a negative
 * row out of the source warehouse and a positive row into the destination —
 * so the ledger can never unbalance.
 */
@Entity
@Table(name = "purchase_inventory_movements", indexes = {
        @Index(name = "idx_inv_no", columnList = "movementNo"),
        @Index(name = "idx_inv_item", columnList = "sku,product,warehouse")
})
public class PurchaseInventoryMovement {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(nullable=false, unique=true, length=30) private String movementNo;
    @Column(length=80) private String sku;
    @Column(length=255) private String product;
    @Column(length=20) private String uom;
    @Column(length=120) private String warehouse;
    @Column(length=120) private String location;
    @Column(length=120) private String fromWarehouse;
    @Column(length=120) private String toWarehouse;
    @Column(length=120) private String fromLocation;
    @Column(length=120) private String toLocation;
    @Column(length=10) private String direction;
    @Column(precision=14, scale=3) private BigDecimal beforeQty = BigDecimal.ZERO;
    @Column(precision=14, scale=3) private BigDecimal delta = BigDecimal.ZERO;
    @Column(precision=14, scale=3) private BigDecimal afterQty = BigDecimal.ZERO;
    @Column(length=40) private String type = "Adjustment";
    @Column(length=255) private String reference;
    @Column(columnDefinition = "TEXT") private String notes;
    @Column(length=30) private String transferRef;
    @Column(length=30) private String counterpartNo;
    @Column(length=30) private String reversalOf;
    @Column(length=30) private String reversalNo;
    private LocalDate reversalOn;
    @Column(length=60) private String inspectionNo;
    @Column(length=60) private String poNo;
    @Column(length=60) private String grnNo;
    private LocalDate updatedOn;
    @Column(length=120) private String updatedBy;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    @PrePersist void create() { createdAt = LocalDateTime.now(); updatedAt = createdAt; }
    @PreUpdate void update() { updatedAt = LocalDateTime.now(); }

    public Long getId() { return id; }
    public String getMovementNo() { return movementNo; }
    public void setMovementNo(String v) { movementNo = v; }
    public String getSku() { return sku; }
    public void setSku(String v) { sku = v; }
    public String getProduct() { return product; }
    public void setProduct(String v) { product = v; }
    public String getUom() { return uom; }
    public void setUom(String v) { uom = v; }
    public String getWarehouse() { return warehouse; }
    public void setWarehouse(String v) { warehouse = v; }
    public String getLocation() { return location; }
    public void setLocation(String v) { location = v; }
    public String getFromWarehouse() { return fromWarehouse; }
    public void setFromWarehouse(String v) { fromWarehouse = v; }
    public String getToWarehouse() { return toWarehouse; }
    public void setToWarehouse(String v) { toWarehouse = v; }
    public String getFromLocation() { return fromLocation; }
    public void setFromLocation(String v) { fromLocation = v; }
    public String getToLocation() { return toLocation; }
    public void setToLocation(String v) { toLocation = v; }
    public String getDirection() { return direction; }
    public void setDirection(String v) { direction = v; }
    public BigDecimal getBeforeQty() { return beforeQty; }
    public void setBeforeQty(BigDecimal v) { beforeQty = v; }
    public BigDecimal getDelta() { return delta; }
    public void setDelta(BigDecimal v) { delta = v; }
    public BigDecimal getAfterQty() { return afterQty; }
    public void setAfterQty(BigDecimal v) { afterQty = v; }
    public String getType() { return type; }
    public void setType(String v) { type = v; }
    public String getReference() { return reference; }
    public void setReference(String v) { reference = v; }
    public String getNotes() { return notes; }
    public void setNotes(String v) { notes = v; }
    public String getTransferRef() { return transferRef; }
    public void setTransferRef(String v) { transferRef = v; }
    public String getCounterpartNo() { return counterpartNo; }
    public void setCounterpartNo(String v) { counterpartNo = v; }
    public String getReversalOf() { return reversalOf; }
    public void setReversalOf(String v) { reversalOf = v; }
    public String getReversalNo() { return reversalNo; }
    public void setReversalNo(String v) { reversalNo = v; }
    public LocalDate getReversalOn() { return reversalOn; }
    public void setReversalOn(LocalDate v) { reversalOn = v; }
    public String getInspectionNo() { return inspectionNo; }
    public void setInspectionNo(String v) { inspectionNo = v; }
    public String getPoNo() { return poNo; }
    public void setPoNo(String v) { poNo = v; }
    public String getGrnNo() { return grnNo; }
    public void setGrnNo(String v) { grnNo = v; }
    public LocalDate getUpdatedOn() { return updatedOn; }
    public void setUpdatedOn(LocalDate v) { updatedOn = v; }
    public String getUpdatedBy() { return updatedBy; }
    public void setUpdatedBy(String v) { updatedBy = v; }
    public LocalDateTime getCreatedAt() { return createdAt; }
}
