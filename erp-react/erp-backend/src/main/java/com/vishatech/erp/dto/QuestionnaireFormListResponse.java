package com.vishatech.erp.dto;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * Compact list-row projection for the Q Forms table.  Only the fields needed
 * to render the list are included — the full record is fetched by id when the
 * user opens a Q Form.
 */
public record QuestionnaireFormListResponse(
        Long id,
        String formNo,
        Long visitId,
        String visitNo,
        LocalDate dateOfVisit,
        String plantName,
        String companyName,
        String customerName,
        String marketer,
        String location,
        String status,
        Long travelPlanId,
        String travelPlanNo,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {}
