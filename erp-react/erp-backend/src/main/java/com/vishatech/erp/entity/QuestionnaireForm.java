package com.vishatech.erp.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * Offline Marketing Questionnaire Form — one Q Form belongs to exactly one
 * Marketing Visit.  The form carries structured plant / OEM / contact data
 * across child tables and narrative sections as TEXT columns on this entity.
 *
 * <p>Number format: QF-YYYY-NNNN (computed, not stored — same convention as
 * VST- and L- numbers).
 *
 * <p>Statuses:
 *   Not Prepared / Draft / Filled & Submitted
 */
@Entity
@Table(name = "questionnaire_forms")
public class QuestionnaireForm {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Owning marketing visit (optional — Q Forms can be standalone). */
    @Column
    private Long visitId;

    /** Optional reference to a related Marketing Travel Planner. */
    private Long travelPlanId;

    /** The marketer who owns this Q Form (snapshot for access control). */
    @Column(nullable = false)
    private Long marketerUserId;

    /** Display name of the marketer. */
    private String marketer;

    /** Q Form status — Not Prepared / Draft / Filled & Submitted */
    @Column(nullable = false)
    private String status = "Not Prepared";

    // ---- Section 2: Basic Plant Information ---------------------------------

    /** Date of visit (pre-populated from MarketingVisit). */
    private LocalDate dateOfVisit;

    /** Plant name + group name. */
    private String plantName;

    /** Location and address of the plant. */
    private String plantLocation;

    /** Number of active lines in the plant. */
    private Integer activeLines;

    /** Shutdown period per year. */
    private String shutdownPeriod;

    /** Production in tones per day. */
    private String productionPerDay;

    /** Approximate PR date. */
    private String approximatePrDate;

    /** Any other remarks (basic plant info). */
    @Lob
    @Column(columnDefinition = "TEXT")
    private String basicRemarks;

    // ---- Section 7: Limestone Crusher --------------------------------------

    @Lob
    @Column(columnDefinition = "TEXT")
    private String limestoneCrusherDetails;

    // ---- Section 11: Boss Command ------------------------------------------

    @Lob
    @Column(columnDefinition = "TEXT")
    private String bossCommand;

    // ---- Section 10 & 12: Signatures (stored as base64 image data) ---------

    @Lob
    @Column(columnDefinition = "MEDIUMBLOB")
    private byte[] marketingLeadSignature;

    @Lob
    @Column(columnDefinition = "MEDIUMBLOB")
    private byte[] authoritySignature;

    // ---- Location fields for Marketing Map --------------------------------
    private BigDecimal latitude;

    private BigDecimal longitude;

    /** Full address string used for geocoding. */
    private String locationAddress;

    /** When the coordinates were last geocoded. */
    private LocalDateTime geocodedAt;

    // ---- Audit -------------------------------------------------------------

    /** Soft-delete flag (project convention for marketing records). */
    private boolean deleted = false;

    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    private LocalDateTime submittedAt;

    @PrePersist
    void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = createdAt;
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = LocalDateTime.now();
    }

    // ---- Getters and Setters -----------------------------------------------

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Long getVisitId() { return visitId; }
    public void setVisitId(Long visitId) { this.visitId = visitId; }

    public Long getTravelPlanId() { return travelPlanId; }
    public void setTravelPlanId(Long travelPlanId) { this.travelPlanId = travelPlanId; }

    public Long getMarketerUserId() { return marketerUserId; }
    public void setMarketerUserId(Long marketerUserId) { this.marketerUserId = marketerUserId; }

    public String getMarketer() { return marketer; }
    public void setMarketer(String marketer) { this.marketer = marketer; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public LocalDate getDateOfVisit() { return dateOfVisit; }
    public void setDateOfVisit(LocalDate dateOfVisit) { this.dateOfVisit = dateOfVisit; }

    public String getPlantName() { return plantName; }
    public void setPlantName(String plantName) { this.plantName = plantName; }

    public String getPlantLocation() { return plantLocation; }
    public void setPlantLocation(String plantLocation) { this.plantLocation = plantLocation; }

    public Integer getActiveLines() { return activeLines; }
    public void setActiveLines(Integer activeLines) { this.activeLines = activeLines; }

    public String getShutdownPeriod() { return shutdownPeriod; }
    public void setShutdownPeriod(String shutdownPeriod) { this.shutdownPeriod = shutdownPeriod; }

    public String getProductionPerDay() { return productionPerDay; }
    public void setProductionPerDay(String productionPerDay) { this.productionPerDay = productionPerDay; }

    public String getApproximatePrDate() { return approximatePrDate; }
    public void setApproximatePrDate(String approximatePrDate) { this.approximatePrDate = approximatePrDate; }

    public String getBasicRemarks() { return basicRemarks; }
    public void setBasicRemarks(String basicRemarks) { this.basicRemarks = basicRemarks; }

    public String getLimestoneCrusherDetails() { return limestoneCrusherDetails; }
    public void setLimestoneCrusherDetails(String limestoneCrusherDetails) { this.limestoneCrusherDetails = limestoneCrusherDetails; }

    public String getBossCommand() { return bossCommand; }
    public void setBossCommand(String bossCommand) { this.bossCommand = bossCommand; }

    public byte[] getMarketingLeadSignature() { return marketingLeadSignature; }
    public void setMarketingLeadSignature(byte[] marketingLeadSignature) { this.marketingLeadSignature = marketingLeadSignature; }

    public byte[] getAuthoritySignature() { return authoritySignature; }
    public void setAuthoritySignature(byte[] authoritySignature) { this.authoritySignature = authoritySignature; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }

    public LocalDateTime getSubmittedAt() { return submittedAt; }
    public void setSubmittedAt(LocalDateTime submittedAt) { this.submittedAt = submittedAt; }

    public BigDecimal getLatitude() { return latitude; }
    public void setLatitude(BigDecimal latitude) { this.latitude = latitude; }

    public BigDecimal getLongitude() { return longitude; }
    public void setLongitude(BigDecimal longitude) { this.longitude = longitude; }

    public String getLocationAddress() { return locationAddress; }
    public void setLocationAddress(String locationAddress) { this.locationAddress = locationAddress; }

    public LocalDateTime getGeocodedAt() { return geocodedAt; }
    public void setGeocodedAt(LocalDateTime geocodedAt) { this.geocodedAt = geocodedAt; }

    public boolean isDeleted() { return deleted; }
    public void setDeleted(boolean deleted) { this.deleted = deleted; }
}
