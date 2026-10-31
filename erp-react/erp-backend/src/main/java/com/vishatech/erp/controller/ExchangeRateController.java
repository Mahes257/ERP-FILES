package com.vishatech.erp.controller;

import com.vishatech.erp.dto.ApiResponse;
import com.vishatech.erp.dto.ExchangeRatesResponse;
import com.vishatech.erp.service.ExchangeRateService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.security.access.prepost.PreAuthorize;

/**
 * Centralized exchange rates for the configured base currency:
 *   GET  /exchange-rates/latest   -> cached-or-fresh rates + last updated
 *   POST /exchange-rates/refresh  -> force a provider refresh
 */
@RestController
@RequestMapping("/exchange-rates")
@PreAuthorize("isAuthenticated()")
public class ExchangeRateController {

    private final ExchangeRateService exchangeRateService;

    public ExchangeRateController(ExchangeRateService exchangeRateService) {
        this.exchangeRateService = exchangeRateService;
    }

    @GetMapping("/latest")
    public ResponseEntity<ApiResponse<ExchangeRatesResponse>> latest() {
        return ResponseEntity.ok(ApiResponse.ok(exchangeRateService.getLatest()));
    }

    @PostMapping("/refresh")
    public ResponseEntity<ApiResponse<ExchangeRatesResponse>> refresh() {
        return ResponseEntity.ok(ApiResponse.ok(exchangeRateService.refresh()));
    }
}
