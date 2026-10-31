package com.vishatech.erp.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public record ExpenseTripRequest(
        String travelPlanRef,
        String startLocation,
        BigDecimal startLatitude,
        BigDecimal startLongitude,
        BigDecimal startLocationAccuracy,
        String destination,
        String purpose,
        LocalDate startDate,
        String startTime,
        LocalDate expectedEndDate,
        String expectedEndTime,
        String visitRef,
        Long visitId,
        String remarks,
        // Trip ON
        String tripOnLocation,
        BigDecimal tripOnLatitude,
        BigDecimal tripOnLongitude,
        // Trip OFF
        String tripOffLocation,
        BigDecimal tripOffLatitude,
        BigDecimal tripOffLongitude,
        // Expenses
        List<ExpenseDto> expenses,
        // Approval
        String rejectionReason,
        String correctionComments
) {
    public record ExpenseDto(
            Long id,
            String expenseType,
            String expenseSubType,
            LocalDate expenseDate,
            String expenseTime,
            String location,
            // Travel Ticket
            String travelMode,
            String travelFrom,
            String travelTo,
            String ticketNumber,
            String operatorProvider,
            String passengerName,
            // Stay
            String hotelName,
            LocalDate checkInDate,
            String checkInTime,
            LocalDate checkOutDate,
            String checkOutTime,
            Integer numberOfNights,
            // Food
            String restaurantVendor,
            Integer numberOfPersons,
            String mealType,
            // Local Travel
            String localTravelMode,
            String localFrom,
            String localTo,
            String travelPurpose,
            // Common
            BigDecimal amount,
            String paymentMethod,
            String remarks,
            String billStatus,
            String withoutBillReason,
            String description
    ) {}
}
