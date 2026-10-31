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
 * Marketing Travel Schedule — a single scheduled trip for one employee
 * (employee, purpose, date/time, route, coordination details).
 *
 * <p><b>Why its own table.</b> The Travel Registry
 * ({@link MarketingTravelPlan}) models a multi-day route built from sequenced
 * plant stops and is already in use; a schedule has scheduling-specific fields
 * it does not have (schedule title, assigned employee, priority, travel mode,
 * estimated distance, client/meeting coordination). Reusing the registry table
 * would mean nullable columns on a live workflow and mixing two record types in
 * one list, so the scheduler gets its own table instead. No Travel Registry row
 * is read, written or migrated by this feature.
 *
 * <p><b>Statuses</b> are the registry's own vocabulary minus the trip-execution
 * states that only a route with stops can reach:
 * Draft / Submitted / Approved / Rejected / Revision Required / Completed /
 * Cancelled. A new schedule always starts as {@code Draft} — approval is only
 * ever reached through the workflow endpoints, never by editing a field.
 *
 * <p><b>Number format:</b> TS-YYYY-NNNN (derived from the id and creation year,
 * like the registry's TP-YYYY-NNNN — nothing is stored, so no counter can
 * drift).
 *
 * <p><b>Travel date.</b> There is deliberately no separate {@code travelDate}
 * column: the schedule's travel date IS {@link #startDate}, and the API exposes
 * it under both names so the list can label it "Travel Date" without a second,
 * independently editable date that could disagree with the route.
 *
 * <p><b>Requester.</b> {@link #requestedBy}/{@link #requestedByUserId} are
 * populated server-side from the authenticated principal; the client cannot set
 * them.
 *
 * <p><b>Employee.</b> {@link #assignedUserId} is the relationship to the user
 * master; {@link #assignedTo} keeps the name as a display snapshot, the same
 * pattern the registry uses for its marketer.
 */
@Entity
@Table(name = "marketing_travel_schedules")
public class MarketingTravelSchedule {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // ---- Schedule details --------------------------------------------------

    /** Short title of the schedule (required). */
    @Column(nullable = false, length = 255)
    private String scheduleTitle;

    /** Employee the schedule is assigned to (relationship to the user master). */
    @Column(nullable = false)
    private Long assignedUserId;

    /** Assigned employee's name, snapshotted for display. */
    @Column(nullable = false, length = 255)
    private String assignedTo;

    /** Who raised the schedule (authenticated user, server-derived). */
    private String requestedBy;

    /** Requester's user id (authenticated user, server-derived). */
    private Long requestedByUserId;

    /** Purpose of travel — the registry's own purpose list. */
    @Column(length = 100)
    private String purpose;

    /** Normal / High / Urgent. */
    @Column(length = 20)
    private String priority = "Normal";

    // ---- Date, time and route ---------------------------------------------

    /** Start date — also the schedule's travel date. */
    private LocalDate startDate;

    private String startTime;

    private LocalDate endDate;

    private String endTime;

    private String startingLocation;

    /** Destination of the trip. */
    private String endingLocation;

    /** Car / Train / Flight / Other. */
    @Column(length = 20)
    private String travelMode;

    /** Optional estimated one-way distance in km. */
    @Column(precision = 10, scale = 2)
    private BigDecimal estimatedDistanceKm;

    // ---- Coordination details ---------------------------------------------

    /** Optional client/customer master relationship. */
    private Long customerId;

    /** Client business name snapshot (from the customer master). */
    @Column(length = 255)
    private String customerName;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String meetingDetails;

    private String contactPerson;

    private String contactPhone;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String remarks;

    // ---- Status and approval ----------------------------------------------

    @Column(nullable = false, length = 40)
    private String status = "Draft";

    @Column(length = 40)
    private String approvalStatus;

    private String approvedBy;

    private LocalDateTime approvedAt;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String rejectionReason;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String revisionComments;

    // ---- Cancellation ------------------------------------------------------

    private String cancelledBy;

    private LocalDateTime cancelledAt;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String cancellationReason;

    // ---- Audit -------------------------------------------------------------

    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    @Column(nullable = false)
    private boolean deleted = false;

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

    public String getScheduleTitle() { return scheduleTitle; }
    public void setScheduleTitle(String scheduleTitle) { this.scheduleTitle = scheduleTitle; }

    public Long getAssignedUserId() { return assignedUserId; }
    public void setAssignedUserId(Long assignedUserId) { this.assignedUserId = assignedUserId; }

    public String getAssignedTo() { return assignedTo; }
    public void setAssignedTo(String assignedTo) { this.assignedTo = assignedTo; }

    public String getRequestedBy() { return requestedBy; }
    public void setRequestedBy(String requestedBy) { this.requestedBy = requestedBy; }

    public Long getRequestedByUserId() { return requestedByUserId; }
    public void setRequestedByUserId(Long requestedByUserId) { this.requestedByUserId = requestedByUserId; }

    public String getPurpose() { return purpose; }
    public void setPurpose(String purpose) { this.purpose = purpose; }

    public String getPriority() { return priority; }
    public void setPriority(String priority) { this.priority = priority; }

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

    public String getEndingLocation() { return endingLocation; }
    public void setEndingLocation(String endingLocation) { this.endingLocation = endingLocation; }

    public String getTravelMode() { return travelMode; }
    public void setTravelMode(String travelMode) { this.travelMode = travelMode; }

    public BigDecimal getEstimatedDistanceKm() { return estimatedDistanceKm; }
    public void setEstimatedDistanceKm(BigDecimal estimatedDistanceKm) { this.estimatedDistanceKm = estimatedDistanceKm; }

    public Long getCustomerId() { return customerId; }
    public void setCustomerId(Long customerId) { this.customerId = customerId; }

    public String getCustomerName() { return customerName; }
    public void setCustomerName(String customerName) { this.customerName = customerName; }

    public String getMeetingDetails() { return meetingDetails; }
    public void setMeetingDetails(String meetingDetails) { this.meetingDetails = meetingDetails; }

    public String getContactPerson() { return contactPerson; }
    public void setContactPerson(String contactPerson) { this.contactPerson = contactPerson; }

    public String getContactPhone() { return contactPhone; }
    public void setContactPhone(String contactPhone) { this.contactPhone = contactPhone; }

    public String getRemarks() { return remarks; }
    public void setRemarks(String remarks) { this.remarks = remarks; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public String getApprovalStatus() { return approvalStatus; }
    public void setApprovalStatus(String approvalStatus) { this.approvalStatus = approvalStatus; }

    public String getApprovedBy() { return approvedBy; }
    public void setApprovedBy(String approvedBy) { this.approvedBy = approvedBy; }

    public LocalDateTime getApprovedAt() { return approvedAt; }
    public void setApprovedAt(LocalDateTime approvedAt) { this.approvedAt = approvedAt; }

    public String getRejectionReason() { return rejectionReason; }
    public void setRejectionReason(String rejectionReason) { this.rejectionReason = rejectionReason; }

    public String getRevisionComments() { return revisionComments; }
    public void setRevisionComments(String revisionComments) { this.revisionComments = revisionComments; }

    public String getCancelledBy() { return cancelledBy; }
    public void setCancelledBy(String cancelledBy) { this.cancelledBy = cancelledBy; }

    public LocalDateTime getCancelledAt() { return cancelledAt; }
    public void setCancelledAt(LocalDateTime cancelledAt) { this.cancelledAt = cancelledAt; }

    public String getCancellationReason() { return cancellationReason; }
    public void setCancellationReason(String cancellationReason) { this.cancellationReason = cancellationReason; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }

    public boolean isDeleted() { return deleted; }
    public void setDeleted(boolean deleted) { this.deleted = deleted; }
}
