package com.vishatech.erp.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * Unified map location response used by the Marketing Map.
 * Aggregates customers, Q Forms, travel plan stops, and marketer positions
 * into a single consistent structure for the frontend map.
 */
public record MapLocationResponse(
        Long id,
        String type,            // customer, qform, travel_planner, travel_stop, marketer
        String name,
        BigDecimal latitude,
        BigDecimal longitude,
        String address,
        String city,
        String state,
        String status,
        Long referenceId,       // FK to the source entity
        String referenceNumber, // human-readable ID (e.g. TP-2026-0001, QF-2026-0001)
        LocalDateTime lastUpdated,
        // Extra context fields
        String customerName,
        String plantName,
        String marketerName,
        String contactPerson,
        String phone,
        String email,
        Integer stopSequence,
        String visitDate
) {}
