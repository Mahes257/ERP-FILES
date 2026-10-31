package com.vishatech.erp.controller;

import com.vishatech.erp.dto.ApiResponse;
import com.vishatech.erp.service.PurchaseDashboardStatsService;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Purchase Dashboard statistics endpoint — real, database-driven KPI
 * counts for the Purchase dashboard (no hardcoded numbers).
 */
@RestController
@RequestMapping("/api/purchase/dashboard")
public class PurchaseDashboardController {

    private final PurchaseDashboardStatsService service;

    public PurchaseDashboardController(PurchaseDashboardStatsService service) {
        this.service = service;
    }

    @GetMapping("/stats")
    @PreAuthorize("hasAuthority('PURCHASE_VIEW')")
    public ResponseEntity<ApiResponse<Map<String, Object>>> stats() {
        return ResponseEntity.ok(ApiResponse.ok(service.stats()));
    }
}
