package com.vishatech.erp.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * One Sales Reports row, read straight from the database as a projection.
 *
 * <p>This is a read model, not an entity: the report only needs a handful of
 * columns per module, so each module repository selects exactly these values
 * with a JPQL constructor expression instead of loading (and hydrating) every
 * entity. The date/amount fallbacks the report applies on top of these raw
 * values live in {@link com.vishatech.erp.service.SalesReportService}.
 *
 * @param moduleKey   report module key (e.g. {@code quotations})
 * @param moduleLabel display label (e.g. {@code Quotations})
 * @param id          source record id
 * @param docNo       document number of the source record
 * @param date        the record's own business date (may be null)
 * @param createdAt   creation timestamp, used when {@code date} is null
 * @param amount      document value (may be null)
 * @param status      record status as stored (may be null)
 * @param clientName  client/customer name as stored (may be null)
 */
public record SalesReportRow(
        String moduleKey,
        String moduleLabel,
        Long id,
        String docNo,
        LocalDateTime date,
        LocalDateTime createdAt,
        BigDecimal amount,
        String status,
        String clientName) {
}
