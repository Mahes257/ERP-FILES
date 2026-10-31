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
 * One stop within a Marketing Travel Plan.  Each stop represents a plant or
 * customer location the marketer will visit.  Stops are ordered by
 * {@code sequence} and can be cancelled, rescheduled, or reordered.
 *
 * <p>Statuses:
 *   Planned / Active / Completed / Cancelled / Rescheduled / Skipped
 *
 * <p>When a stop is cancelled the record is preserved (history) and the
 * travel plan's route is automatically recalculated using only the remaining
 * active stops.
 */
@Entity
@Table(name = "marketing_travel_plan_stops")
public class MarketingTravelPlanStop {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long travelPlanId;

    /** Ordering within the plan (1-based). */
    @Column(nullable = false)
    private Integer sequence;

    // ---- Plant / location information --------------------------------------

    /** Plant or company name. */
    private String companyName;

    /** Customer or prospect name. */
    private String customerName;

    /** Link to an existing Marketing Visit (nullable). */
    private Long visitId;

    /** Google Place ID for location reference. */
    private String googlePlaceId;

    /** Full address text. */
    private String address;

    private String state;
    private String district;
    private String city;

    @Column(precision = 10, scale = 7)
    private BigDecimal latitude;

    @Column(precision = 10, scale = 7)
    private BigDecimal longitude;

    // ---- Scheduling --------------------------------------------------------

    private LocalDate plannedDate;

    /** Planned arrival time (HH:mm). */
    private String plannedArrivalTime;

    private String plannedDepartureTime;

    /** Expected stay duration in minutes. */
    private Integer expectedStayDurationMinutes;

    /** Appointment status: Fixed / Direct Visit / Pending Confirmation / Cancelled */
    private String appointmentStatus;

    // ---- Contact -----------------------------------------------------------

    private String contactPerson;
    private String contactDesignation;
    private String contactPhone;
    private String contactEmail;

    // ---- Visit details -----------------------------------------------------

    private String purposeOfVisit;
    private String priority;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String remarks;

    // ---- Status ------------------------------------------------------------

    /**
     * Stop status: Planned / Active / Completed / Cancelled / Rescheduled / Skipped
     */
    @Column(nullable = false, length = 30)
    private String status = "Planned";

    // ---- Cancellation ------------------------------------------------------

    private LocalDateTime cancelledAt;
    private String cancelledBy;
    private String cancellationReason;

    // ---- Reschedule --------------------------------------------------------

    private LocalDate rescheduledDate;
    private String rescheduledTime;
    private String rescheduleNotes;

    // ---- Route segment (computed from this stop to the next) ----------------

    /** Distance from the PREVIOUS stop to this stop (km). */
    @Column(precision = 10, scale = 2)
    private BigDecimal distanceFromPreviousKm;

    /** Estimated travel time from the previous stop (minutes). */
    private Integer travelTimeFromPreviousMinutes;

    // ---- Check-in / Check-out (during active trip) -------------------------

    private LocalDateTime actualCheckIn;
    private LocalDateTime actualCheckOut;
    private String checkInNotes;
    private String checkOutNotes;

    // ---- Audit -------------------------------------------------------------

    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

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

    public Long getTravelPlanId() { return travelPlanId; }
    public void setTravelPlanId(Long travelPlanId) { this.travelPlanId = travelPlanId; }

    public Integer getSequence() { return sequence; }
    public void setSequence(Integer sequence) { this.sequence = sequence; }

    public String getCompanyName() { return companyName; }
    public void setCompanyName(String companyName) { this.companyName = companyName; }

    public String getCustomerName() { return customerName; }
    public void setCustomerName(String customerName) { this.customerName = customerName; }

    public Long getVisitId() { return visitId; }
    public void setVisitId(Long visitId) { this.visitId = visitId; }

    public String getGooglePlaceId() { return googlePlaceId; }
    public void setGooglePlaceId(String googlePlaceId) { this.googlePlaceId = googlePlaceId; }

    public String getAddress() { return address; }
    public void setAddress(String address) { this.address = address; }

    public String getState() { return state; }
    public void setState(String state) { this.state = state; }

    public String getDistrict() { return district; }
    public void setDistrict(String district) { this.district = district; }

    public String getCity() { return city; }
    public void setCity(String city) { this.city = city; }

    public BigDecimal getLatitude() { return latitude; }
    public void setLatitude(BigDecimal latitude) { this.latitude = latitude; }

    public BigDecimal getLongitude() { return longitude; }
    public void setLongitude(BigDecimal longitude) { this.longitude = longitude; }

    public LocalDate getPlannedDate() { return plannedDate; }
    public void setPlannedDate(LocalDate plannedDate) { this.plannedDate = plannedDate; }

    public String getPlannedArrivalTime() { return plannedArrivalTime; }
    public void setPlannedArrivalTime(String plannedArrivalTime) { this.plannedArrivalTime = plannedArrivalTime; }

    public String getPlannedDepartureTime() { return plannedDepartureTime; }
    public void setPlannedDepartureTime(String plannedDepartureTime) { this.plannedDepartureTime = plannedDepartureTime; }

    public Integer getExpectedStayDurationMinutes() { return expectedStayDurationMinutes; }
    public void setExpectedStayDurationMinutes(Integer expectedStayDurationMinutes) { this.expectedStayDurationMinutes = expectedStayDurationMinutes; }

    public String getAppointmentStatus() { return appointmentStatus; }
    public void setAppointmentStatus(String appointmentStatus) { this.appointmentStatus = appointmentStatus; }

    public String getContactPerson() { return contactPerson; }
    public void setContactPerson(String contactPerson) { this.contactPerson = contactPerson; }

    public String getContactDesignation() { return contactDesignation; }
    public void setContactDesignation(String contactDesignation) { this.contactDesignation = contactDesignation; }

    public String getContactPhone() { return contactPhone; }
    public void setContactPhone(String contactPhone) { this.contactPhone = contactPhone; }

    public String getContactEmail() { return contactEmail; }
    public void setContactEmail(String contactEmail) { this.contactEmail = contactEmail; }

    public String getPurposeOfVisit() { return purposeOfVisit; }
    public void setPurposeOfVisit(String purposeOfVisit) { this.purposeOfVisit = purposeOfVisit; }

    public String getPriority() { return priority; }
    public void setPriority(String priority) { this.priority = priority; }

    public String getRemarks() { return remarks; }
    public void setRemarks(String remarks) { this.remarks = remarks; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public LocalDateTime getCancelledAt() { return cancelledAt; }
    public void setCancelledAt(LocalDateTime cancelledAt) { this.cancelledAt = cancelledAt; }

    public String getCancelledBy() { return cancelledBy; }
    public void setCancelledBy(String cancelledBy) { this.cancelledBy = cancelledBy; }

    public String getCancellationReason() { return cancellationReason; }
    public void setCancellationReason(String cancellationReason) { this.cancellationReason = cancellationReason; }

    public LocalDate getRescheduledDate() { return rescheduledDate; }
    public void setRescheduledDate(LocalDate rescheduledDate) { this.rescheduledDate = rescheduledDate; }

    public String getRescheduledTime() { return rescheduledTime; }
    public void setRescheduledTime(String rescheduledTime) { this.rescheduledTime = rescheduledTime; }

    public String getRescheduleNotes() { return rescheduleNotes; }
    public void setRescheduleNotes(String rescheduleNotes) { this.rescheduleNotes = rescheduleNotes; }

    public BigDecimal getDistanceFromPreviousKm() { return distanceFromPreviousKm; }
    public void setDistanceFromPreviousKm(BigDecimal distanceFromPreviousKm) { this.distanceFromPreviousKm = distanceFromPreviousKm; }

    public Integer getTravelTimeFromPreviousMinutes() { return travelTimeFromPreviousMinutes; }
    public void setTravelTimeFromPreviousMinutes(Integer travelTimeFromPreviousMinutes) { this.travelTimeFromPreviousMinutes = travelTimeFromPreviousMinutes; }

    public LocalDateTime getActualCheckIn() { return actualCheckIn; }
    public void setActualCheckIn(LocalDateTime actualCheckIn) { this.actualCheckIn = actualCheckIn; }

    public LocalDateTime getActualCheckOut() { return actualCheckOut; }
    public void setActualCheckOut(LocalDateTime actualCheckOut) { this.actualCheckOut = actualCheckOut; }

    public String getCheckInNotes() { return checkInNotes; }
    public void setCheckInNotes(String checkInNotes) { this.checkInNotes = checkInNotes; }

    public String getCheckOutNotes() { return checkOutNotes; }
    public void setCheckOutNotes(String checkOutNotes) { this.checkOutNotes = checkOutNotes; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}
