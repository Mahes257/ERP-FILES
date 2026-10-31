package com.vishatech.erp.controller;

import com.vishatech.erp.dto.ApiResponse;
import com.vishatech.erp.dto.SalesReportResponse;
import com.vishatech.erp.service.SalesReportService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Read-only Sales Reports aggregation endpoint (GET /sales/reports).
 * Accepts optional date-range, status, module, and client filters;
 * returns pre-computed KPIs, monthly trend, status distribution,
 * module breakdown, and the filtered flat record list.
 */
@RestController
@RequestMapping("/sales/reports")
@PreAuthorize("hasAuthority('SALES_VIEW')")
public class SalesReportController {

    private final SalesReportService salesReportService;

    public SalesReportController(SalesReportService salesReportService) {
        this.salesReportService = salesReportService;
    }

    @GetMapping
    public ResponseEntity<ApiResponse<SalesReportResponse>> report(
            @RequestParam(required = false) String dateFrom,
            @RequestParam(required = false) String dateTo,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String module,
            @RequestParam(required = false) String client) {
        return ResponseEntity.ok(ApiResponse.ok(
                salesReportService.getReport(dateFrom, dateTo, status, module, client)));
    }
}
