package com.vishatech.erp.dto;

import com.vishatech.erp.entity.CprStatus;
import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * One current CPR revision reduced to the columns the reports summary actually
 * aggregates.
 *
 * <p>The summary used to load every full CPR entity (items, comments, history,
 * attachments, timeline) and every Cost Workout aggregate just to add up a few
 * numbers. This projection keeps the same values but transfers only seven
 * scalar columns and never touches a lazy collection.
 */
public record CprReportRow(
        Long id,
        CprStatus status,
        BigDecimal grandTotal,
        String department,
        String vendor,
        LocalDateTime createdAt,
        String convertedToQtn
) {
}
