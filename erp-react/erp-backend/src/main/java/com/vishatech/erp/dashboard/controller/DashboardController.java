package com.vishatech.erp.dashboard.controller;

import com.vishatech.erp.dashboard.service.DashboardAggregationService;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Read-only ERP dashboard aggregation (counts, workflow stages, KPIs).
 *
 * <p>Thin HTTP layer: every number is assembled by
 * {@link DashboardAggregationService}, which reads the business modules through
 * their dashboard read ports. The controller only maps the request to the
 * aggregation call, so this class holds no repository, no production service and
 * no cross-module knowledge at all.
 *
 * <p>Authorization follows the module convention: reading the ERP dashboard
 * requires an authenticated user (the class-level check below), and
 * unauthenticated callers are rejected by the security chain before reaching
 * this point.
 */
@RestController
@RequestMapping("/dashboard")
@PreAuthorize("isAuthenticated()")
public class DashboardController {

    private final DashboardAggregationService dashboardAggregationService;

    public DashboardController(DashboardAggregationService dashboardAggregationService) {
        this.dashboardAggregationService = dashboardAggregationService;
    }

    /**
     * The whole dashboard document in one read. The response keeps the payload
     * shape the Dashboard page has always consumed — including its placeholder
     * values — because the page reads the keys by name.
     */
    @GetMapping("/stats")
    public ResponseEntity<Map<String, Object>> stats() {
        return ResponseEntity.ok(dashboardAggregationService.dashboardPayload());
    }
}
