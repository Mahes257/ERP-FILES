package com.vishatech.erp.controller;

import com.vishatech.erp.service.SalesDashboardService;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Read-only Sales Dashboard aggregation (counts, values, pipeline, monthly
 * trend, recent records, top customers, follow-up alerts). No writes.
 *
 * <p>Thin HTTP layer: every number is computed by
 * {@link SalesDashboardService} in the database; the controller only maps the
 * request to the service call. Authorization follows the module convention —
 * reading the Sales dashboard requires {@code SALES_VIEW} (the class-level
 * check below), and unauthenticated callers are rejected by the security chain
 * before reaching this point.
 */
@RestController
@RequestMapping("/sales/dashboard")
@PreAuthorize("hasAuthority('SALES_VIEW')")
public class SalesDashboardController {

    private final SalesDashboardService salesDashboardService;

    public SalesDashboardController(SalesDashboardService salesDashboardService) {
        this.salesDashboardService = salesDashboardService;
    }

    /**
     * The whole dashboard document in one read. The response is the dashboard's
     * own payload shape (counts / values / pipeline / trend / recent / alerts),
     * which is what the Sales Dashboard page and its contract test expect.
     */
    @GetMapping
    public ResponseEntity<Map<String, Object>> summary() {
        return ResponseEntity.ok(salesDashboardService.getSummary());
    }
}
