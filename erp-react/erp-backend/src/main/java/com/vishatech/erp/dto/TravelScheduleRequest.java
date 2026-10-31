package com.vishatech.erp.dto;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * Writable fields for a Marketing Travel Schedule.
 *
 * <p><b>Patch semantics.</b> The request carries only what the caller wants to
 * set; on create the required fields are validated, on update the merged result
 * is. The service applies non-null values only, exactly like
 * {@link TravelPlanRequest}.
 *
 * <p><b>Deliberately absent.</b> {@code status}, {@code approvalStatus},
 * {@code approvedBy}, {@code approvedAt}, {@code requestedBy} and
 * {@code scheduleNo} are NOT part of this request: a schedule's status moves
 * only through the workflow endpoints and the requester/number are derived
 * server-side, so a client can never approve a schedule or impersonate a
 * requester by editing a form field. {@code rejectionReason} and
 * {@code revisionComments} are the two approval remarks the existing registry
 * workflow records, and they are only applied by the reject/revision endpoints.
 */
public record TravelScheduleRequest(
        // Schedule details
        String scheduleTitle,
        Long assignedUserId,
        String purpose,
        String priority,

        // Date, time and route
        LocalDate startDate,
        String startTime,
        LocalDate endDate,
        String endTime,
        String startingLocation,
        String endingLocation,
        String travelMode,
        BigDecimal estimatedDistanceKm,

        // Coordination details
        Long customerId,
        String meetingDetails,
        String contactPerson,
        String contactPhone,
        String remarks,

        // Cancellation / approval remarks (workflow endpoints)
        String cancellationReason,
        String rejectionReason,
        String revisionComments
) {}
