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
 * Marketing Travel Plan — a multi-day trip that groups multiple plant visits
 * into a sequenced route.  Completely independent from Sales modules.
 *
 * <p>Statuses:
 *   Draft / Submitted / Approved / Rejected / Revision Required /
 *   Active / Completed / Cancelled
 *
 * <p>Number format: TP-YYYY-NNNN (computed, not stored).
 */
@Entity
@Table(name = "marketing_travel_plans")
public class MarketingTravelPlan {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // ---- Basic information -------------------------------------------------

    /** Marketer who owns this plan. */
    @Column(nullable = false, length = 255)
    private String marketer;

    @Column(nullable = false)
    private Long marketerUserId;

    /** Foreign key to the central Marketing Visit */
    private Long visitId;

    /** Trip start date. */
    private LocalDate startDate;

    private String startTime;

    /** Trip end date. */
    private LocalDate endDate;

    private String endTime;

    /** Starting location name. */
    private String startingLocation;

    /** Starting location coordinates. */
    private BigDecimal startLatitude;
    private BigDecimal startLongitude;

    /** Ending location name. */
    private String endingLocation;

    /** Ending location coordinates. */
    private BigDecimal endLatitude;
    private BigDecimal endLongitude;

    /** Purpose of the trip. */
    private String purpose;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String remarks;

    // ---- Status ------------------------------------------------------------

    /**
     * Plan status: Draft / Submitted / Approved / Rejected / Revision Required /
     * Active / Completed / Cancelled
     */
    @Column(nullable = false, length = 40)
    private String status = "Draft";

    // ---- Route summary (computed from stops) --------------------------------

    /** Total distance in km. */
    @Column(precision = 10, scale = 2)
    private BigDecimal totalDistanceKm;

    /** Total estimated travel time in minutes. */
    private Integer totalTravelTimeMinutes;

    /** Number of active (non-cancelled) stops. */
    private Integer activeStopsCount;

    /** Persistent route color for map visualization (hex, e.g. #2563eb). */
    @Column(length = 20)
    private String routeColor;

    // ---- Approval ----------------------------------------------------------

    private String approvedBy;
    private LocalDateTime approvedAt;
    private String approvalStatus;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String rejectionReason;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String revisionComments;

    // ---- Trip execution ----------------------------------------------------

    private LocalDateTime tripActualStart;
    private LocalDateTime tripActualEnd;
    private BigDecimal tripStartLatitude;
    private BigDecimal tripStartLongitude;
    private BigDecimal tripEndLatitude;
    private BigDecimal tripEndLongitude;

    // ---- Audit -------------------------------------------------------------

    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    @Column(nullable = false)
    private boolean deleted = false;

    private LocalDateTime archivedAt;

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

    public String getMarketer() { return marketer; }
    public void setMarketer(String marketer) { this.marketer = marketer; }

    public Long getMarketerUserId() { return marketerUserId; }
    public void setMarketerUserId(Long marketerUserId) { this.marketerUserId = marketerUserId; }

    public Long getVisitId() { return visitId; }
    public void setVisitId(Long v) { this.visitId = v; }

    public LocalDate getStartDate() { return startDate; }
    public void setStartDate(LocalDate startDate) { this.startDate = startDate; }

    public String getStartTime() { return startTime; }
    public void setStartTime(String startTime) { this.startTime = startTime; }

    public LocalDate getEndDate() { return endDate; }
    public void setEndDate(LocalDate endDate) { this.endDate = endDate; }

    public String getEndTime() { return endTime; }
    public void setEndTime(String endTime) { this.endTime = endTime; }

    public String getStartingLocation() { return startingLocation; }
    public void setStartingLocation(String startingLocation) { this.startingLocation = startingLocation; }

    public BigDecimal getStartLatitude() { return startLatitude; }
    public void setStartLatitude(BigDecimal startLatitude) { this.startLatitude = startLatitude; }

    public BigDecimal getStartLongitude() { return startLongitude; }
    public void setStartLongitude(BigDecimal startLongitude) { this.startLongitude = startLongitude; }

    public String getEndingLocation() { return endingLocation; }
    public void setEndingLocation(String endingLocation) { this.endingLocation = endingLocation; }

    public BigDecimal getEndLatitude() { return endLatitude; }
    public void setEndLatitude(BigDecimal endLatitude) { this.endLatitude = endLatitude; }

    public BigDecimal getEndLongitude() { return endLongitude; }
    public void setEndLongitude(BigDecimal endLongitude) { this.endLongitude = endLongitude; }

    public String getPurpose() { return purpose; }
    public void setPurpose(String purpose) { this.purpose = purpose; }

    public String getRemarks() { return remarks; }
    public void setRemarks(String remarks) { this.remarks = remarks; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public BigDecimal getTotalDistanceKm() { return totalDistanceKm; }
    public void setTotalDistanceKm(BigDecimal totalDistanceKm) { this.totalDistanceKm = totalDistanceKm; }

    public Integer getTotalTravelTimeMinutes() { return totalTravelTimeMinutes; }
    public void setTotalTravelTimeMinutes(Integer totalTravelTimeMinutes) { this.totalTravelTimeMinutes = totalTravelTimeMinutes; }

    public Integer getActiveStopsCount() { return activeStopsCount; }
    public void setActiveStopsCount(Integer activeStopsCount) { this.activeStopsCount = activeStopsCount; }

    public String getRouteColor() { return routeColor; }
    public void setRouteColor(String routeColor) { this.routeColor = routeColor; }

    public String getApprovedBy() { return approvedBy; }
    public void setApprovedBy(String approvedBy) { this.approvedBy = approvedBy; }

    public LocalDateTime getApprovedAt() { return approvedAt; }
    public void setApprovedAt(LocalDateTime approvedAt) { this.approvedAt = approvedAt; }

    public String getApprovalStatus() { return approvalStatus; }
    public void setApprovalStatus(String approvalStatus) { this.approvalStatus = approvalStatus; }

    public String getRejectionReason() { return rejectionReason; }
    public void setRejectionReason(String rejectionReason) { this.rejectionReason = rejectionReason; }

    public String getRevisionComments() { return revisionComments; }
    public void setRevisionComments(String revisionComments) { this.revisionComments = revisionComments; }

    public LocalDateTime getTripActualStart() { return tripActualStart; }
    public void setTripActualStart(LocalDateTime tripActualStart) { this.tripActualStart = tripActualStart; }

    public LocalDateTime getTripActualEnd() { return tripActualEnd; }
    public void setTripActualEnd(LocalDateTime tripActualEnd) { this.tripActualEnd = tripActualEnd; }

    public BigDecimal getTripStartLatitude() { return tripStartLatitude; }
    public void setTripStartLatitude(BigDecimal tripStartLatitude) { this.tripStartLatitude = tripStartLatitude; }

    public BigDecimal getTripStartLongitude() { return tripStartLongitude; }
    public void setTripStartLongitude(BigDecimal tripStartLongitude) { this.tripStartLongitude = tripStartLongitude; }

    public BigDecimal getTripEndLatitude() { return tripEndLatitude; }
    public void setTripEndLatitude(BigDecimal tripEndLatitude) { this.tripEndLatitude = tripEndLatitude; }

    public BigDecimal getTripEndLongitude() { return tripEndLongitude; }
    public void setTripEndLongitude(BigDecimal tripEndLongitude) { this.tripEndLongitude = tripEndLongitude; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }

    public boolean isDeleted() { return deleted; }
    public void setDeleted(boolean deleted) { this.deleted = deleted; }

    public LocalDateTime getArchivedAt() { return archivedAt; }
    public void setArchivedAt(LocalDateTime archivedAt) { this.archivedAt = archivedAt; }
}
