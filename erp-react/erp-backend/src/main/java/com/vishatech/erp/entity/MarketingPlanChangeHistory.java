package com.vishatech.erp.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import java.time.LocalDateTime;

/**
 * Audit history for a Marketing Travel Plan.  Every significant change
 * (approval, cancellation, reorder, reschedule, status change) is recorded as
 * an append-only row.  History is never overwritten or deleted.
 *
 * <p>Action types:
 *   CREATED / DRAFT_SAVED / SUBMITTED / APPROVED / REJECTED / REVISION_REQUESTED /
 *   STOP_ADDED / STOP_CANCELLED / STOP_RESCHEDULED / STOP_REORDERED /
 *   STOP_CHECKED_IN / STOP_CHECKED_OUT / TRIP_STARTED / TRIP_ENDED /
 *   ROUTE_RECALCULATED / PLAN_UPDATED
 */
@Entity
@Table(name = "marketing_plan_change_history")
public class MarketingPlanChangeHistory {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long travelPlanId;

    /** Optional: which stop this change relates to (null for plan-level changes). */
    private Long stopId;

    /** Action type from the vocabulary above. */
    @Column(nullable = false, length = 40)
    private String action;

    /** Human-readable description of what changed. */
    @Lob
    @Column(columnDefinition = "TEXT")
    private String description;

    /** Who performed the action. */
    private String performedBy;

    private Long performedByUserId;

    private LocalDateTime performedAt;

    @PrePersist
    void onCreate() {
        performedAt = LocalDateTime.now();
    }

    // ---- Getters and Setters -----------------------------------------------

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Long getTravelPlanId() { return travelPlanId; }
    public void setTravelPlanId(Long travelPlanId) { this.travelPlanId = travelPlanId; }

    public Long getStopId() { return stopId; }
    public void setStopId(Long stopId) { this.stopId = stopId; }

    public String getAction() { return action; }
    public void setAction(String action) { this.action = action; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public String getPerformedBy() { return performedBy; }
    public void setPerformedBy(String performedBy) { this.performedBy = performedBy; }

    public Long getPerformedByUserId() { return performedByUserId; }
    public void setPerformedByUserId(Long performedByUserId) { this.performedByUserId = performedByUserId; }

    public LocalDateTime getPerformedAt() { return performedAt; }
    public void setPerformedAt(LocalDateTime performedAt) { this.performedAt = performedAt; }
}
