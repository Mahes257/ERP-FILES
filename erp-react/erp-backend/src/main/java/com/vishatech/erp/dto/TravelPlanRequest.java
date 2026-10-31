package com.vishatech.erp.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/**
 * Writable fields for a Marketing Travel Plan.  Every field is optional (patch
 * semantics).  The service applies only non-null values.
 */
public record TravelPlanRequest(
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

        // Stops
        List<StopDto> stops,

        // Approval
        String rejectionReason,
        String revisionComments,

        // Trip execution
        BigDecimal checkInLatitude,
        BigDecimal checkInLongitude,
        String checkInNotes,
        BigDecimal checkOutLatitude,
        BigDecimal checkOutLongitude,
        String checkOutNotes,

        // Cancellation / reschedule
        String cancellationReason,
        LocalDate rescheduledDate,
        String rescheduledTime,
        String rescheduleNotes
) {
    /** One stop within the travel plan. */
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
            String remarks
    ) {}
}
