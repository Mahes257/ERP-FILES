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
 * Vendor (supplier) master of the Purchase module.
 *
 * Status lifecycle mirrors the frontend VENDOR_STATUS contract:
 * Pending Approval → Approved, with Rejected and Blocked side states,
 * plus a soft recordState (active / archived / deleted) for the list
 * tabs. Performance aggregates (spend / orders / rating) are derived
 * from live documents by the service layer.
 */
@Entity
@Table(name = "purchase_vendors", indexes = {
        @Index(name = "idx_vendor_status", columnList = "status"),
        @Index(name = "idx_vendor_record_state", columnList = "recordState")
})
public class PurchaseVendor {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Vendor code shown to users, e.g. V-001 (unique). */
    @Column(nullable = false, unique = true, length = 40)
    private String vendorCode;

    @Column(nullable = false, length = 160)
    private String name;

    @Column(length = 80)
    private String category;

    @Column(length = 60)
    private String city;

    @Column(length = 60)
    private String state;

    @Column(length = 160)
    private String email;

    @Column(length = 40)
    private String phone;

    @Column(length = 160)
    private String website;

    @Column(length = 20)
    private String gstin;

    @Column(length = 255)
    private String address;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String notes;

    private Double latitude;
    private Double longitude;
    @Column(length = 255)
    private String formattedAddress;
    @Column(length = 255)
    private String googleMapsUrl;

    /** Pending Approval / Approved / Rejected / Blocked. */
    @Column(nullable = false, length = 30)
    private String status = "Pending Approval";

    /** active / archived / deleted. */
    @Column(nullable = false, length = 20)
    private String recordState = "active";

    @Column(nullable = false, precision = 3, scale = 1)
    private BigDecimal rating = BigDecimal.ZERO;

    @Column(length = 30)
    private String paymentTerms;

    @Column(length = 10)
    private String currency;

    private Integer leadTimeDays;

    @Column(length = 120)
    private String legalName;
    @Column(length = 60)
    private String legalType;
    @Column(length = 40)
    private String cin;
    @Column(length = 20)
    private String incorporationDate;
    @Column(length = 60)
    private String msmeRegNo;
    @Column(length = 20)
    private String msmeType;
    private Boolean active;
    @Column(length = 20)
    private String tan;

    /** Credit limit as stored JSON ({amount, currency, days}). */
    @Lob
    @Column(columnDefinition = "TEXT")
    private String creditLimitJson;

    /** Additional addresses as JSON array. */
    @Lob
    @Column(columnDefinition = "TEXT")
    private String addressesJson;

    /** Additional contacts as JSON array. */
    @Lob
    @Column(columnDefinition = "TEXT")
    private String contactsJson;

    /** Categories beyond the primary one, JSON array. */
    @Lob
    @Column(columnDefinition = "TEXT")
    private String categoriesJson;

    private LocalDateTime registrationDate;
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
    public String getVendorCode() { return vendorCode; }
    public void setVendorCode(String vendorCode) { this.vendorCode = vendorCode; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getCategory() { return category; }
    public void setCategory(String category) { this.category = category; }
    public String getCity() { return city; }
    public void setCity(String city) { this.city = city; }
    public String getState() { return state; }
    public void setState(String state) { this.state = state; }
    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
    public String getPhone() { return phone; }
    public void setPhone(String phone) { this.phone = phone; }
    public String getWebsite() { return website; }
    public void setWebsite(String website) { this.website = website; }
    public String getGstin() { return gstin; }
    public void setGstin(String gstin) { this.gstin = gstin; }
    public String getAddress() { return address; }
    public void setAddress(String address) { this.address = address; }
    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }
    public Double getLatitude() { return latitude; }
    public void setLatitude(Double latitude) { this.latitude = latitude; }
    public Double getLongitude() { return longitude; }
    public void setLongitude(Double longitude) { this.longitude = longitude; }
    public String getFormattedAddress() { return formattedAddress; }
    public void setFormattedAddress(String formattedAddress) { this.formattedAddress = formattedAddress; }
    public String getGoogleMapsUrl() { return googleMapsUrl; }
    public void setGoogleMapsUrl(String googleMapsUrl) { this.googleMapsUrl = googleMapsUrl; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public String getRecordState() { return recordState; }
    public void setRecordState(String recordState) { this.recordState = recordState; }
    public BigDecimal getRating() { return rating; }
    public void setRating(BigDecimal rating) { this.rating = rating; }
    public String getPaymentTerms() { return paymentTerms; }
    public void setPaymentTerms(String paymentTerms) { this.paymentTerms = paymentTerms; }
    public String getCurrency() { return currency; }
    public void setCurrency(String currency) { this.currency = currency; }
    public Integer getLeadTimeDays() { return leadTimeDays; }
    public void setLeadTimeDays(Integer leadTimeDays) { this.leadTimeDays = leadTimeDays; }
    public String getLegalName() { return legalName; }
    public void setLegalName(String legalName) { this.legalName = legalName; }
    public String getLegalType() { return legalType; }
    public void setLegalType(String legalType) { this.legalType = legalType; }
    public String getCin() { return cin; }
    public void setCin(String cin) { this.cin = cin; }
    public String getIncorporationDate() { return incorporationDate; }
    public void setIncorporationDate(String incorporationDate) { this.incorporationDate = incorporationDate; }
    public String getMsmeRegNo() { return msmeRegNo; }
    public void setMsmeRegNo(String msmeRegNo) { this.msmeRegNo = msmeRegNo; }
    public String getMsmeType() { return msmeType; }
    public void setMsmeType(String msmeType) { this.msmeType = msmeType; }
    public Boolean getActive() { return active; }
    public void setActive(Boolean active) { this.active = active; }
    public String getTan() { return tan; }
    public void setTan(String tan) { this.tan = tan; }
    public String getCreditLimitJson() { return creditLimitJson; }
    public void setCreditLimitJson(String creditLimitJson) { this.creditLimitJson = creditLimitJson; }
    public String getAddressesJson() { return addressesJson; }
    public void setAddressesJson(String addressesJson) { this.addressesJson = addressesJson; }
    public String getContactsJson() { return contactsJson; }
    public void setContactsJson(String contactsJson) { this.contactsJson = contactsJson; }
    public String getCategoriesJson() { return categoriesJson; }
    public void setCategoriesJson(String categoriesJson) { this.categoriesJson = categoriesJson; }
    public LocalDateTime getRegistrationDate() { return registrationDate; }
    public void setRegistrationDate(LocalDateTime registrationDate) { this.registrationDate = registrationDate; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}
