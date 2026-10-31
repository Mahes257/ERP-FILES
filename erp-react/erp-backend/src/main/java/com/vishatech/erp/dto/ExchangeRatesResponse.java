package com.vishatech.erp.dto;

import java.math.BigDecimal;
import java.util.Map;

/**
 * Latest exchange rates for the configured base currency.
 * rates: currencyCode -> units per 1 base unit (base itself = 1).
 * stale: true when served from cache because the provider was unreachable.
 */
public record ExchangeRatesResponse(
        String base,
        String lastUpdated,
        Map<String, BigDecimal> rates,
        boolean stale,
        String source
) {
}
