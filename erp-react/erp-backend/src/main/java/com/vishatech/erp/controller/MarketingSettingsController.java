package com.vishatech.erp.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.vishatech.erp.dto.ApiResponse;
import com.vishatech.erp.service.MarketingSettingsService;
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
 * Marketing Settings — read/write the entire marketing configuration blob.
 *
 *   GET /settings/marketing             → full JSON blob
 *   GET /settings/marketing/{section}   → one top-level section
 *   PUT /settings/marketing             → replace full blob (ADMIN only)
 *
 * Thin HTTP layer: business rules, transactions and the
 * {@link com.vishatech.erp.entity.SettingsAuditLog} trail live in
 * {@link MarketingSettingsService}; failures flow through the shared
 * GlobalExceptionHandler. Reads are open to authenticated users (every
 * Marketing module loads its defaults); writes require SETTINGS_MANAGE
 * (currently ADMIN-only) and are re-checked in the controller exactly like
 * SettingsController does for Financial/Document settings.
 */
@RestController
@RequestMapping("/settings/marketing")
@PreAuthorize("isAuthenticated()")
public class MarketingSettingsController {

    private final MarketingSettingsService marketingSettingsService;

    public MarketingSettingsController(MarketingSettingsService marketingSettingsService) {
        this.marketingSettingsService = marketingSettingsService;
    }

    @GetMapping
    public ResponseEntity<ApiResponse<JsonNode>> get() {
        // Reads stay open to authenticated users exactly as before: this blob is
        // the shared configuration every Marketing form (and the CRM lead form)
        // reads to build its option lists, not Marketing page data. Access
        // Management configures pages/actions and lives in its own store
        // (/marketing/access), never in this blob.
        return ResponseEntity.ok(ApiResponse.ok(marketingSettingsService.getSettings()));
    }

    @GetMapping("/{section}")
    public ResponseEntity<ApiResponse<JsonNode>> getSection(@PathVariable String section) {
        return ResponseEntity.ok(ApiResponse.ok(marketingSettingsService.getSection(section)));
    }

    @PutMapping
    @PreAuthorize("hasAuthority('SETTINGS_MANAGE') and @marketingAccess.can('settings','edit')")
    public ResponseEntity<ApiResponse<JsonNode>> update(@RequestBody JsonNode settings) {
        if (!marketingSettingsService.isAdmin()) {
            throw new AccessDeniedException("Only an ADMIN can change Marketing Settings");
        }
        return ResponseEntity.ok(ApiResponse.ok(marketingSettingsService.update(settings)));
    }
}
