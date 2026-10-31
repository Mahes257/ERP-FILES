package com.vishatech.erp.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.vishatech.erp.dto.ApiResponse;
import com.vishatech.erp.service.SalesSettingsService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Sales Settings — read/write the entire sales configuration blob.
 *
 *   GET /settings/sales             → full JSON blob
 *   GET /settings/sales/{section}   → one top-level section
 *   PUT /settings/sales             → replace full blob (ADMIN only)
 *
 * Mirrors {@link MarketingSettingsController}: thin HTTP layer, business rules,
 * transactions and the {@link com.vishatech.erp.entity.SettingsAuditLog} trail
 * live in {@link SalesSettingsService}, failures flow through the shared
 * GlobalExceptionHandler. Reads are open to authenticated users (every Sales
 * module loads its configurable defaults); writes require SETTINGS_MANAGE
 * (currently ADMIN-only) and are re-checked in the controller exactly like
 * SettingsController does for Financial/Document settings.
 */
@RestController
@RequestMapping("/settings/sales")
@PreAuthorize("isAuthenticated()")
public class SalesSettingsController {

    private final SalesSettingsService salesSettingsService;

    public SalesSettingsController(SalesSettingsService salesSettingsService) {
        this.salesSettingsService = salesSettingsService;
    }

    @GetMapping
    public ResponseEntity<ApiResponse<JsonNode>> get() {
        return ResponseEntity.ok(ApiResponse.ok(salesSettingsService.getSettings()));
    }

    @GetMapping("/{section}")
    public ResponseEntity<ApiResponse<JsonNode>> getSection(@PathVariable String section) {
        return ResponseEntity.ok(ApiResponse.ok(salesSettingsService.getSection(section)));
    }

    @PutMapping
    // Two independent gates, exactly as Marketing Settings does it: the
    // pre-existing ADMIN-only settings authority, and the Sales Access
    // Management permission — so "may view Sales Settings" can never imply
    // "may change the Sales configuration".
    @PreAuthorize("hasAuthority('SETTINGS_MANAGE') and @salesAccess.can('settings','edit')")
    public ResponseEntity<ApiResponse<JsonNode>> update(@RequestBody JsonNode settings) {
        if (!salesSettingsService.isAdmin()) {
            throw new AccessDeniedException("Only an ADMIN can change Sales Settings");
        }
        return ResponseEntity.ok(ApiResponse.ok(salesSettingsService.update(settings)));
    }
}
