package com.vishatech.erp.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/**
 * Full Travel Plan response — returned by GET endpoints.
 */
public record TravelPlanResponse(
        Long id,
        String planNo,
        String marketer,
        Long marketerUserId,

        // Basic information
        LocalDate startDate,
        String startTime,
        LocalDate endDate,
        String endTime,
        String startingLocation,
        BigDecimal startLatitude,
        BigDecimal startLongitude,
        String endingLocation,
        BigDecimal endLatitude,
        BigDecimal endLongitude,
        String purpose,
        String remarks,

        // Status
        String status,

        // Route summary
        BigDecimal totalDistanceKm,
        Integer totalTravelTimeMinutes,
        Integer activeStopsCount,
        String routeColor,

        // Approval
        String approvedBy,
        LocalDateTime approvedAt,
        String approvalStatus,
        String rejectionReason,
        String revisionComments,

        // Trip execution
        LocalDateTime tripActualStart,
        LocalDateTime tripActualEnd,

        // Stops
        List<StopDto> stops,

        // Change history
        List<HistoryDto> changeHistory,

        // Route snapshots
        List<RouteSnapshotDto> routeSnapshots,

        // Audit
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {
    public record StopDto(
            Long id,
            Integer sequence,
            String companyName,
            String customerName,
            Long visitId,
            String googlePlaceId,
            String address,
            String state,
            String district,
            String city,
            BigDecimal latitude,
            BigDecimal longitude,
            LocalDate plannedDate,
            String plannedArrivalTime,
            Integer expectedStayDurationMinutes,
            String appointmentStatus,
            String contactPerson,
            String contactDesignation,
            String contactPhone,
            String contactEmail,
            String plannedDepartureTime,
            String purposeOfVisit,
            String priority,
            String remarks,
            String status,
            LocalDateTime cancelledAt,
            String cancelledBy,
            String cancellationReason,
            LocalDate rescheduledDate,
            String rescheduledTime,
            String rescheduleNotes,
            BigDecimal distanceFromPreviousKm,
            Integer travelTimeFromPreviousMinutes,
            LocalDateTime actualCheckIn,
            LocalDateTime actualCheckOut,
            String checkInNotes,
            String checkOutNotes,
            LocalDateTime createdAt,
            LocalDateTime updatedAt
    ) {}

    public record HistoryDto(
            Long id,
            String action,
            String description,
            String performedBy,
            LocalDateTime performedAt
    ) {}

    public record RouteSnapshotDto(
            Long id,
            String triggerType,
            BigDecimal totalDistanceKm,
            Integer totalTravelTimeMinutes,
            BigDecimal previousTotalDistanceKm,
            Integer previousTotalTravelTimeMinutes,
            BigDecimal distanceDifferenceKm,
            String calculatedBy,
            LocalDateTime calculatedAt
    ) {}
}
