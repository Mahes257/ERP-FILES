package com.vishatech.erp.entity;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * Marketing Expense Trip — one complete journey from Trip ON to Trip OFF.
 * Every expense belongs to exactly one trip. Completely independent from Sales.
 *
 * Statuses: Planned / Active / Completed / Cancelled
 * Approval: Draft / Submitted / Pending Approval / Approved / Rejected / Correction Requested
 */
@Entity
@Table(name = "marketing_expense_trips")
public class MarketingExpenseTrip {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;

    @Column(nullable = false, length = 255) private String marketer;
    @Column(nullable = false) private Long marketerUserId;

    /** Optional link to Travel Planner trip number (e.g. TP-2026-001). */
    private String travelPlanRef;

    private String startLocation;
    private BigDecimal startLatitude;
    private BigDecimal startLongitude;
    private BigDecimal startLocationAccuracy;

    private String destination;
    private String purpose;

    private LocalDate startDate;
    private String startTime;

    private LocalDate expectedEndDate;
    private String expectedEndTime;

    /** Optional link to Marketing Visit ID. */
    private String visitRef;

    /** Foreign key to the central Marketing Visit */
    private Long visitId;

    /** Trip ON actuals */
    private LocalDateTime tripOnDateTime;
    private String tripOnLocation;
    private BigDecimal tripOnLatitude;
    private BigDecimal tripOnLongitude;

    /** Trip OFF actuals */
    private LocalDateTime tripOffDateTime;
    private String tripOffLocation;
    private BigDecimal tripOffLatitude;
    private BigDecimal tripOffLongitude;

    @Lob @Column(columnDefinition = "TEXT") private String remarks;

    @Column(nullable = false, length = 30) private String status = "Planned";
    @Column(nullable = false, length = 30) private String approvalStatus = "Draft";

    // Totals (computed from expenses)
    @Column(precision = 12, scale = 2) private BigDecimal totalAmount = BigDecimal.ZERO;
    @Column(precision = 12, scale = 2) private BigDecimal withBillTotal = BigDecimal.ZERO;
    @Column(precision = 12, scale = 2) private BigDecimal withoutBillTotal = BigDecimal.ZERO;
    @Column(precision = 12, scale = 2) private BigDecimal travelTotal = BigDecimal.ZERO;
    @Column(precision = 12, scale = 2) private BigDecimal stayTotal = BigDecimal.ZERO;
    @Column(precision = 12, scale = 2) private BigDecimal foodTotal = BigDecimal.ZERO;
    @Column(precision = 12, scale = 2) private BigDecimal localTravelTotal = BigDecimal.ZERO;
    @Column(precision = 12, scale = 2) private BigDecimal otherTotal = BigDecimal.ZERO;
    private Integer expenseCount = 0;

    // Approval
    private String approvedBy;
    private LocalDateTime approvedAt;
    @Lob @Column(columnDefinition = "TEXT") private String rejectionReason;
    @Lob @Column(columnDefinition = "TEXT") private String correctionComments;

    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    @Column(nullable = false) private boolean deleted = false;

    @PrePersist void onCreate() { createdAt = LocalDateTime.now(); updatedAt = createdAt; }
    @PreUpdate void onUpdate() { updatedAt = LocalDateTime.now(); }

    // Getters and setters
    public Long getId() { return id; } public void setId(Long id) { this.id = id; }
    public String getMarketer() { return marketer; } public void setMarketer(String marketer) { this.marketer = marketer; }
    public Long getMarketerUserId() { return marketerUserId; } public void setMarketerUserId(Long v) { this.marketerUserId = v; }
    public String getTravelPlanRef() { return travelPlanRef; } public void setTravelPlanRef(String v) { this.travelPlanRef = v; }
    public String getStartLocation() { return startLocation; } public void setStartLocation(String v) { this.startLocation = v; }
    public BigDecimal getStartLatitude() { return startLatitude; } public void setStartLatitude(BigDecimal v) { this.startLatitude = v; }
    public BigDecimal getStartLongitude() { return startLongitude; } public void setStartLongitude(BigDecimal v) { this.startLongitude = v; }
    public BigDecimal getStartLocationAccuracy() { return startLocationAccuracy; } public void setStartLocationAccuracy(BigDecimal v) { this.startLocationAccuracy = v; }
    public String getDestination() { return destination; } public void setDestination(String v) { this.destination = v; }
    public String getPurpose() { return purpose; } public void setPurpose(String v) { this.purpose = v; }
    public LocalDate getStartDate() { return startDate; } public void setStartDate(LocalDate v) { this.startDate = v; }
    public String getStartTime() { return startTime; } public void setStartTime(String v) { this.startTime = v; }
    public LocalDate getExpectedEndDate() { return expectedEndDate; } public void setExpectedEndDate(LocalDate v) { this.expectedEndDate = v; }
    public String getExpectedEndTime() { return expectedEndTime; } public void setExpectedEndTime(String v) { this.expectedEndTime = v; }
    public String getVisitRef() { return visitRef; } public void setVisitRef(String v) { this.visitRef = v; }
    public Long getVisitId() { return visitId; } public void setVisitId(Long v) { this.visitId = v; }
    public LocalDateTime getTripOnDateTime() { return tripOnDateTime; } public void setTripOnDateTime(LocalDateTime v) { this.tripOnDateTime = v; }
    public String getTripOnLocation() { return tripOnLocation; } public void setTripOnLocation(String v) { this.tripOnLocation = v; }
    public BigDecimal getTripOnLatitude() { return tripOnLatitude; } public void setTripOnLatitude(BigDecimal v) { this.tripOnLatitude = v; }
    public BigDecimal getTripOnLongitude() { return tripOnLongitude; } public void setTripOnLongitude(BigDecimal v) { this.tripOnLongitude = v; }
    public LocalDateTime getTripOffDateTime() { return tripOffDateTime; } public void setTripOffDateTime(LocalDateTime v) { this.tripOffDateTime = v; }
    public String getTripOffLocation() { return tripOffLocation; } public void setTripOffLocation(String v) { this.tripOffLocation = v; }
    public BigDecimal getTripOffLatitude() { return tripOffLatitude; } public void setTripOffLatitude(BigDecimal v) { this.tripOffLatitude = v; }
    public BigDecimal getTripOffLongitude() { return tripOffLongitude; } public void setTripOffLongitude(BigDecimal v) { this.tripOffLongitude = v; }
    public String getRemarks() { return remarks; } public void setRemarks(String v) { this.remarks = v; }
    public String getStatus() { return status; } public void setStatus(String v) { this.status = v; }
    public String getApprovalStatus() { return approvalStatus; } public void setApprovalStatus(String v) { this.approvalStatus = v; }
    public BigDecimal getTotalAmount() { return totalAmount; } public void setTotalAmount(BigDecimal v) { this.totalAmount = v; }
    public BigDecimal getWithBillTotal() { return withBillTotal; } public void setWithBillTotal(BigDecimal v) { this.withBillTotal = v; }
    public BigDecimal getWithoutBillTotal() { return withoutBillTotal; } public void setWithoutBillTotal(BigDecimal v) { this.withoutBillTotal = v; }
    public BigDecimal getTravelTotal() { return travelTotal; } public void setTravelTotal(BigDecimal v) { this.travelTotal = v; }
    public BigDecimal getStayTotal() { return stayTotal; } public void setStayTotal(BigDecimal v) { this.stayTotal = v; }
    public BigDecimal getFoodTotal() { return foodTotal; } public void setFoodTotal(BigDecimal v) { this.foodTotal = v; }
    public BigDecimal getLocalTravelTotal() { return localTravelTotal; } public void setLocalTravelTotal(BigDecimal v) { this.localTravelTotal = v; }
    public BigDecimal getOtherTotal() { return otherTotal; } public void setOtherTotal(BigDecimal v) { this.otherTotal = v; }
    public Integer getExpenseCount() { return expenseCount; } public void setExpenseCount(Integer v) { this.expenseCount = v; }
    public String getApprovedBy() { return approvedBy; } public void setApprovedBy(String v) { this.approvedBy = v; }
    public LocalDateTime getApprovedAt() { return approvedAt; } public void setApprovedAt(LocalDateTime v) { this.approvedAt = v; }
    public String getRejectionReason() { return rejectionReason; } public void setRejectionReason(String v) { this.rejectionReason = v; }
    public String getCorrectionComments() { return correctionComments; } public void setCorrectionComments(String v) { this.correctionComments = v; }
    public LocalDateTime getCreatedAt() { return createdAt; } public void setCreatedAt(LocalDateTime v) { this.createdAt = v; }
    public LocalDateTime getUpdatedAt() { return updatedAt; } public void setUpdatedAt(LocalDateTime v) { this.updatedAt = v; }
    public boolean isDeleted() { return deleted; } public void setDeleted(boolean v) { this.deleted = v; }
}
