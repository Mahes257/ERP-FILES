package com.vishatech.erp.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.vishatech.erp.dto.ApiResponse;
import com.vishatech.erp.service.PurchaseNotificationRulesService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Purchase Settings → Notifications rules.
 *
 *   GET /purchase/notifications/rules  → the stored rule array (authenticated)
 *   PUT /purchase/notifications/rules  → replace it (SETTINGS_MANAGE, i.e. ADMIN)
 *
 * <p>Reads are open to any authenticated user because the Purchase Settings
 * page loads the rules to show what the server is actually enforcing. Writes
 * use the same authority as every other ERP settings write
 * ({@code SETTINGS_MANAGE}), so a role that cannot change ERP configuration
 * cannot change which Purchase events notify whom either.
 *
 * <p>The path deliberately sits outside {@code /api/purchase/**}: it is
 * configuration, not Purchase business data, and the Purchase access policy
 * therefore does not map it to a Purchase area (exactly like the Marketing
 * settings blob).
 */
@RestController
@RequestMapping("/purchase/notifications/rules")
@PreAuthorize("isAuthenticated()")
public class PurchaseNotificationSettingsController {

    private final PurchaseNotificationRulesService rulesService;

    public PurchaseNotificationSettingsController(PurchaseNotificationRulesService rulesService) {
        this.rulesService = rulesService;
    }

    @GetMapping
    public ResponseEntity<ApiResponse<JsonNode>> get() {
        return ResponseEntity.ok(ApiResponse.ok(rulesService.getRules()));
    }

    @PutMapping
    @PreAuthorize("hasAuthority('SETTINGS_MANAGE')")
    public ResponseEntity<ApiResponse<JsonNode>> update(@RequestBody(required = false) JsonNode body) {
        return ResponseEntity.ok(ApiResponse.ok(rulesService.update(body)));
    }
}
