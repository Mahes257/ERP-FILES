package com.vishatech.erp.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * Snapshot of a route calculation for a Marketing Travel Plan.  Every time the
 * route is calculated or recalculated (due to stop reordering, cancellation,
 * etc.), a new snapshot is created to preserve the historical route data for
 * audit and comparison purposes.
 */
@Entity
@Table(name = "marketing_route_snapshots")
public class MarketingRouteSnapshot {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long travelPlanId;

    /** Trigger: INITIAL / RECALCULATED / CANCELLED_STOP / REORDERED / APPROVED */
    @Column(nullable = false, length = 30)
    private String triggerType;

    /** Ordered comma-separated stop IDs that were active in this route. */
    @Lob
    @Column(columnDefinition = "TEXT")
    private String activeStopSequence;

    /** Total distance in km. */
    @Column(precision = 10, scale = 2)
    private BigDecimal totalDistanceKm;

    /** Total travel time in minutes. */
    private Integer totalTravelTimeMinutes;

    /** The full JSON of the Google Routes API response (for debugging). */
    @Lob
    @Column(columnDefinition = "LONGTEXT")
    private String routeApiResponse;

    /** Previous total distance before this recalculation. */
    @Column(precision = 10, scale = 2)
    private BigDecimal previousTotalDistanceKm;

    /** Previous total travel time before this recalculation. */
    private Integer previousTotalTravelTimeMinutes;

    /** Distance difference (+/- km). */
    @Column(precision = 10, scale = 2)
    private BigDecimal distanceDifferenceKm;

    /** Calculated by (system or user). */
    private String calculatedBy;

    private LocalDateTime calculatedAt;

    @PrePersist
    void onCreate() {
        calculatedAt = LocalDateTime.now();
    }

    // ---- Getters and Setters -----------------------------------------------

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Long getTravelPlanId() { return travelPlanId; }
    public void setTravelPlanId(Long travelPlanId) { this.travelPlanId = travelPlanId; }

    public String getTriggerType() { return triggerType; }
    public void setTriggerType(String triggerType) { this.triggerType = triggerType; }

    public String getActiveStopSequence() { return activeStopSequence; }
    public void setActiveStopSequence(String activeStopSequence) { this.activeStopSequence = activeStopSequence; }

    public BigDecimal getTotalDistanceKm() { return totalDistanceKm; }
    public void setTotalDistanceKm(BigDecimal totalDistanceKm) { this.totalDistanceKm = totalDistanceKm; }

    public Integer getTotalTravelTimeMinutes() { return totalTravelTimeMinutes; }
    public void setTotalTravelTimeMinutes(Integer totalTravelTimeMinutes) { this.totalTravelTimeMinutes = totalTravelTimeMinutes; }

    public String getRouteApiResponse() { return routeApiResponse; }
    public void setRouteApiResponse(String routeApiResponse) { this.routeApiResponse = routeApiResponse; }

    public BigDecimal getPreviousTotalDistanceKm() { return previousTotalDistanceKm; }
    public void setPreviousTotalDistanceKm(BigDecimal previousTotalDistanceKm) { this.previousTotalDistanceKm = previousTotalDistanceKm; }

    public Integer getPreviousTotalTravelTimeMinutes() { return previousTotalTravelTimeMinutes; }
    public void setPreviousTotalTravelTimeMinutes(Integer previousTotalTravelTimeMinutes) { this.previousTotalTravelTimeMinutes = previousTotalTravelTimeMinutes; }

    public BigDecimal getDistanceDifferenceKm() { return distanceDifferenceKm; }
    public void setDistanceDifferenceKm(BigDecimal distanceDifferenceKm) { this.distanceDifferenceKm = distanceDifferenceKm; }

    public String getCalculatedBy() { return calculatedBy; }
    public void setCalculatedBy(String calculatedBy) { this.calculatedBy = calculatedBy; }

    public LocalDateTime getCalculatedAt() { return calculatedAt; }
    public void setCalculatedAt(LocalDateTime calculatedAt) { this.calculatedAt = calculatedAt; }
}
