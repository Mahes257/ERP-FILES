package com.vishatech.erp.entity;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * User-created marketing location on the map.
 * Stores manually added locations such as customer sites, prospects,
 * dealers, and other marketing-relevant places.
 */
@Entity
@Table(name = "marketing_locations")
public class MarketingLocation {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String locationName;

    @Column(nullable = false)
    private String address;

    private String city;
    private String state;
    private String pin;

    private String contactPerson;
    private String phone;
    private String marketingVisitReference;
    private String remarks;

    /** Type: customer, lead, dealer, prospect, visit, other */
    private String locationType;

    /** ERP Customer ID when linked */
    private Long customerId;
    private String customerName;

    /** OSM ID/type when sourced from OpenStreetMap */
    private String osmId;
    private String osmType;

    @Column(precision = 10, scale = 7)
    private BigDecimal latitude;

    @Column(precision = 10, scale = 7)
    private BigDecimal longitude;

    /** When the coordinates were last geocoded/resolved */
    private LocalDateTime geocodedAt;

    /** Active, Inactive, Archived */
    private String status;

    /** Created by user ID */
    private Long createdBy;

    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    @PrePersist
    void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = LocalDateTime.now();
        if (status == null) status = "Active";
        if (locationType == null) locationType = "other";
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = LocalDateTime.now();
    }

    // ---- Getters and Setters ----

    public Long getId() { return id; }
    public void setId(Long v) { this.id = v; }

    public String getLocationName() { return locationName; }
    public void setLocationName(String v) { this.locationName = v; }

    public String getAddress() { return address; }
    public void setAddress(String v) { this.address = v; }

    public String getCity() { return city; }
    public void setCity(String v) { this.city = v; }

    public String getState() { return state; }
    public void setState(String v) { this.state = v; }

    public String getPin() { return pin; }
    public void setPin(String v) { this.pin = v; }

    public String getContactPerson() { return contactPerson; }
    public void setContactPerson(String v) { this.contactPerson = v; }

    public String getPhone() { return phone; }
    public void setPhone(String v) { this.phone = v; }

    public String getMarketingVisitReference() { return marketingVisitReference; }
    public void setMarketingVisitReference(String v) { this.marketingVisitReference = v; }

    public String getRemarks() { return remarks; }
    public void setRemarks(String v) { this.remarks = v; }

    public String getLocationType() { return locationType; }
    public void setLocationType(String v) { this.locationType = v; }

    public Long getCustomerId() { return customerId; }
    public void setCustomerId(Long v) { this.customerId = v; }

    public String getCustomerName() { return customerName; }
    public void setCustomerName(String v) { this.customerName = v; }

    public String getOsmId() { return osmId; }
    public void setOsmId(String v) { this.osmId = v; }

    public String getOsmType() { return osmType; }
    public void setOsmType(String v) { this.osmType = v; }

    public BigDecimal getLatitude() { return latitude; }
    public void setLatitude(BigDecimal v) { this.latitude = v; }

    public BigDecimal getLongitude() { return longitude; }
    public void setLongitude(BigDecimal v) { this.longitude = v; }

    public LocalDateTime getGeocodedAt() { return geocodedAt; }
    public void setGeocodedAt(LocalDateTime v) { this.geocodedAt = v; }

    public String getStatus() { return status; }
    public void setStatus(String v) { this.status = v; }

    public Long getCreatedBy() { return createdBy; }
    public void setCreatedBy(Long v) { this.createdBy = v; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime v) { this.createdAt = v; }

    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime v) { this.updatedAt = v; }
}
