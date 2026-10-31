package com.vishatech.erp.calendar.controller;

import com.vishatech.erp.calendar.dto.CalendarEntriesResponse;
import com.vishatech.erp.calendar.service.CalendarAggregationService;
import java.time.LocalDate;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Read-only ERP-wide Calendar feed.
 *
 * <pre>
 * GET /calendar/entries?from=YYYY-MM-DD&amp;to=YYYY-MM-DD
 * </pre>
 *
 * <p>One endpoint for the whole calendar. Each module contributes its own
 * {@code CalendarSourcePort} implementation; this controller only maps the
 * request and delegates, and it exposes <b>no</b> create, update or delete
 * mapping - Calendar entries are projections of business records, and those
 * records keep being edited in their own modules.
 *
 * <p>The parameters are declared optional and validated by the aggregation
 * service so a missing or inverted range produces the project's standard 400
 * JSON error instead of a framework-level failure. A non-ISO value is rejected
 * by Spring's converter and mapped by {@code GlobalExceptionHandler} to 400.
 *
 * <p>Authentication is required; per-module view authorities are applied inside
 * the aggregation service so a module the caller cannot view is never read.
 */
@RestController
@RequestMapping("/calendar")
@PreAuthorize("isAuthenticated()")
public class CalendarController {

    private final CalendarAggregationService aggregationService;

    public CalendarController(CalendarAggregationService aggregationService) {
        this.aggregationService = aggregationService;
    }

    @GetMapping("/entries")
    public ResponseEntity<CalendarEntriesResponse> entries(
            @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return ResponseEntity.ok(aggregationService.entries(from, to));
    }
}
