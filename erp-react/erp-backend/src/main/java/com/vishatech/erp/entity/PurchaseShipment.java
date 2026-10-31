package com.vishatech.erp.entity;

import jakarta.persistence.*;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "purchase_shipments", indexes = {
        @Index(name = "idx_ship_no", columnList = "shipmentNo"),
        @Index(name = "idx_ship_po", columnList = "poNo"),
        @Index(name = "idx_shipment_status", columnList = "status")
})
public class PurchaseShipment {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(nullable=false, unique=true, length=30) private String shipmentNo;
    @Column(nullable=false, length=60) private String poNo;
    @Column(length=30) private String packingNo;
    @Column(nullable=false, length=160) private String vendor;
    @Column(length=120) private String carrier;
    @Column(length=40) private String mode = "Road";
    private LocalDate dispatchDate;
    private LocalDate eta;
    @Column(length=120) private String destination;
    @Column(length=40) private String status = "Pending Dispatch";
    @Column(length=120) private String trackingNo;
    private LocalDate receivedOn;
    @Column(columnDefinition = "TEXT") private String notes;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    @PrePersist void create() { createdAt = LocalDateTime.now(); updatedAt = createdAt; }
    @PreUpdate void update() { updatedAt = LocalDateTime.now(); }

    public Long getId() { return id; }
    public String getShipmentNo() { return shipmentNo; }
    public void setShipmentNo(String v) { shipmentNo = v; }
    public String getPoNo() { return poNo; }
    public void setPoNo(String v) { poNo = v; }
    public String getPackingNo() { return packingNo; }
    public void setPackingNo(String v) { packingNo = v; }
    public String getVendor() { return vendor; }
    public void setVendor(String v) { vendor = v; }
    public String getCarrier() { return carrier; }
    public void setCarrier(String v) { carrier = v; }
    public String getMode() { return mode; }
    public void setMode(String v) { mode = v; }
    public LocalDate getDispatchDate() { return dispatchDate; }
    public void setDispatchDate(LocalDate v) { dispatchDate = v; }
    public LocalDate getEta() { return eta; }
    public void setEta(LocalDate v) { eta = v; }
    public String getDestination() { return destination; }
    public void setDestination(String v) { destination = v; }
    public String getStatus() { return status; }
    public void setStatus(String v) { status = v; }
    public String getTrackingNo() { return trackingNo; }
    public void setTrackingNo(String v) { trackingNo = v; }
    public LocalDate getReceivedOn() { return receivedOn; }
    public void setReceivedOn(LocalDate v) { receivedOn = v; }
    public String getNotes() { return notes; }
    public void setNotes(String v) { notes = v; }
    public LocalDateTime getCreatedAt() { return createdAt; }
}
