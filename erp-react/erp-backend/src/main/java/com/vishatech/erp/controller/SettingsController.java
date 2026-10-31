package com.vishatech.erp.controller;

import com.vishatech.erp.dto.ApiResponse;
import com.vishatech.erp.dto.DocumentSettingsRequest;
import com.vishatech.erp.dto.DocumentSettingsResponse;
import com.vishatech.erp.dto.FinancialSettingsRequest;
import com.vishatech.erp.dto.FinancialSettingsResponse;
import com.vishatech.erp.service.DocumentSettingsService;
import com.vishatech.erp.service.ExchangeRateService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.security.access.prepost.PreAuthorize;

/**
 * Settings → Financial Settings (base currency etc.) and Document Settings
 * (default visibility for new general documents).
 *   GET /settings/financial        -> current base currency + last-updated
 *   PUT /settings/financial        -> change base currency (ADMIN only)
 *   GET /settings/documents        -> default document visibility + last-updated
 *   PUT /settings/documents        -> change default visibility (ADMIN only)
 */
@RestController
@RequestMapping("/settings")
@PreAuthorize("hasAuthority('SETTINGS_MANAGE')")
public class SettingsController {

    private final ExchangeRateService exchangeRateService;
    private final DocumentSettingsService documentSettingsService;

    public SettingsController(ExchangeRateService exchangeRateService,
                              DocumentSettingsService documentSettingsService) {
        this.exchangeRateService = exchangeRateService;
        this.documentSettingsService = documentSettingsService;
    }

    @GetMapping("/financial")
    public ResponseEntity<ApiResponse<FinancialSettingsResponse>> getFinancial() {
        return ResponseEntity.ok(ApiResponse.ok(exchangeRateService.getFinancial()));
    }

    @PutMapping("/financial")
    public ResponseEntity<ApiResponse<FinancialSettingsResponse>> updateFinancial(
            @Valid @RequestBody FinancialSettingsRequest request) {
        if (!exchangeRateService.isAdmin()) {
            throw new AccessDeniedException("Only an ADMIN can change the base currency");
        }
        return ResponseEntity.ok(ApiResponse.ok(exchangeRateService.setBaseCurrency(request.baseCurrency())));
    }

    @GetMapping("/documents")
    public ResponseEntity<ApiResponse<DocumentSettingsResponse>> getDocuments() {
        return ResponseEntity.ok(ApiResponse.ok(documentSettingsService.get()));
    }

    @PutMapping("/documents")
    public ResponseEntity<ApiResponse<DocumentSettingsResponse>> updateDocuments(
            @Valid @RequestBody DocumentSettingsRequest request) {
        if (!documentSettingsService.isAdmin()) {
            throw new AccessDeniedException("Only an ADMIN can change document settings");
        }
        return ResponseEntity.ok(ApiResponse.ok(documentSettingsService.set(request.defaultVisibility())));
    }
}
