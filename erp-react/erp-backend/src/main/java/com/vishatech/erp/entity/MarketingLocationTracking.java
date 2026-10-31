package com.vishatech.erp.entity;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * Stores GPS location updates from marketers during active Marketing trips.
 * Only recorded when the marketer explicitly enables tracking during an active trip.
 * Stops recording when the trip ends.
 */
@Entity
@Table(name = "marketing_location_tracking", indexes = {
    @Index(name = "idx_location_tracking_plan", columnList = "travelPlanId"),
    @Index(name = "idx_tracking_user_time", columnList = "userId, recordedAt")
})
public class MarketingLocationTracking {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** The active travel plan this location belongs to. */
    @Column(nullable = false)
    private Long travelPlanId;

    /** The marketer's user ID. */
    @Column(nullable = false)
    private Long userId;

    /** Marketer display name. */
    private String marketerName;

    // ---- GPS coordinates ----

    @Column(nullable = false, precision = 10, scale = 7)
    private BigDecimal latitude;

    @Column(nullable = false, precision = 10, scale = 7)
    private BigDecimal longitude;

    /** GPS accuracy in meters. */
    private BigDecimal accuracy;

    /** Speed in m/s if available. */
    private BigDecimal speed;

    /** Heading/bearing in degrees if available. */
    private BigDecimal heading;

    // ---- Context ----

    /** The stop/station the marketer is currently at or heading to. */
    private Long currentStopId;

    /** Human-readable label for the current position. */
    private String locationLabel;

    /** Battery level percentage if available. */
    private Integer batteryLevel;

    // ---- Timestamps ----

    /** When the GPS fix was recorded by the device. */
    @Column(nullable = false)
    private LocalDateTime recordedAt;

    /** When this record was received by the server. */
    @Column(nullable = false)
    private LocalDateTime receivedAt;

    @PrePersist
    void onCreate() {
        receivedAt = LocalDateTime.now();
        if (recordedAt == null) recordedAt = receivedAt;
    }

    // ---- Getters and Setters ----

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Long getTravelPlanId() { return travelPlanId; }
    public void setTravelPlanId(Long v) { this.travelPlanId = v; }

    public Long getUserId() { return userId; }
    public void setUserId(Long v) { this.userId = v; }

    public String getMarketerName() { return marketerName; }
    public void setMarketerName(String v) { this.marketerName = v; }

    public BigDecimal getLatitude() { return latitude; }
    public void setLatitude(BigDecimal v) { this.latitude = v; }

    public BigDecimal getLongitude() { return longitude; }
    public void setLongitude(BigDecimal v) { this.longitude = v; }

    public BigDecimal getAccuracy() { return accuracy; }
    public void setAccuracy(BigDecimal v) { this.accuracy = v; }

    public BigDecimal getSpeed() { return speed; }
    public void setSpeed(BigDecimal v) { this.speed = v; }

    public BigDecimal getHeading() { return heading; }
    public void setHeading(BigDecimal v) { this.heading = v; }

    public Long getCurrentStopId() { return currentStopId; }
    public void setCurrentStopId(Long v) { this.currentStopId = v; }

    public String getLocationLabel() { return locationLabel; }
    public void setLocationLabel(String v) { this.locationLabel = v; }

    public Integer getBatteryLevel() { return batteryLevel; }
    public void setBatteryLevel(Integer v) { this.batteryLevel = v; }

    public LocalDateTime getRecordedAt() { return recordedAt; }
    public void setRecordedAt(LocalDateTime v) { this.recordedAt = v; }

    public LocalDateTime getReceivedAt() { return receivedAt; }
    public void setReceivedAt(LocalDateTime v) { this.receivedAt = v; }
}
