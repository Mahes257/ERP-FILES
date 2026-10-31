package com.vishatech.erp.service;

import com.vishatech.erp.dto.ExchangeRatesResponse;
import com.vishatech.erp.dto.FinancialSettingsResponse;
import com.vishatech.erp.entity.AppSetting;
import com.vishatech.erp.entity.ExchangeRate;
import com.vishatech.erp.exception.BadRequestException;
import com.vishatech.erp.repository.AppSettingRepository;
import com.vishatech.erp.repository.ExchangeRateRepository;
import java.math.BigDecimal;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestClient;

/**
 * Centralized exchange-rate service (single source of truth for every module).
 *
 * - Fetches daily from the configured public provider (open.er-api.com by
 *   default; free, keyless, INR base supported).
 * - Caches the latest rates in MySQL so quotations keep working when the
 *   provider is temporarily unavailable (stale cache is served instead).
 * - Refreshes automatically once every refreshHours (default 24) — lazily on
 *   first access of the day, so no scheduler is required.
 * - The base currency is configurable (Settings → Financial Settings, ADMIN
 *   only; default INR) and stored in app_settings.
 */
@Service
public class ExchangeRateService {

    private static final Logger log = LoggerFactory.getLogger(ExchangeRateService.class);

    private static final String BASE_CURRENCY_KEY = "base_currency";

    private final ExchangeRateRepository exchangeRateRepository;
    private final AppSettingRepository appSettingRepository;
    private final RestClient restClient;

    @Value("${exchange.api.url:https://open.er-api.com/v6/latest/{base}}")
    private String apiUrl;

    @Value("${exchange.refresh.hours:24}")
    private long refreshHours;

    @Value("${exchange.base.default:INR}")
    private String defaultBase;

    public ExchangeRateService(ExchangeRateRepository exchangeRateRepository,
                               AppSettingRepository appSettingRepository) {
        this.exchangeRateRepository = exchangeRateRepository;
        this.appSettingRepository = appSettingRepository;
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout((int) Duration.ofSeconds(10).toMillis());
        factory.setReadTimeout((int) Duration.ofSeconds(20).toMillis());
        this.restClient = RestClient.builder().requestFactory(factory).build();
    }

    // ======================= Public API =======================

    /** Latest rates for the configured base currency (cache-first, auto-refresh).
     *  Note: intentionally NOT read-only — the lazy refresh path inside this
     *  method writes to exchange_rates (delete + insert). A read-only outer
     *  transaction would reject those writes and mark the transaction
     *  rollback-only, turning the whole call into a 500 even when cached rates
     *  are available. */
    @Transactional
    public ExchangeRatesResponse getLatest() {
        String base = getBaseCurrency();
        List<ExchangeRate> cached = exchangeRateRepository.findByBaseCurrency(base);
        LocalDateTime lastUpdated = maxFetchedAt(cached);
        if (!cached.isEmpty() && isFresh(lastUpdated)) {
            return buildResponse(base, lastUpdated, cached, false, "cache");
        }
        // Stale or no cache -> try to refresh.
        try {
            return refresh();
        } catch (Exception e) {
            log.warn("Exchange rate fetch failed; serving cached rates: {}", e.getMessage());
            if (!cached.isEmpty()) {
                return buildResponse(base, lastUpdated, cached, true, "cache");
            }
            return new ExchangeRatesResponse(base, null, Map.of(), true, "unavailable");
        }
    }

    /** Force a refresh from the provider; falls back to cache on failure. */
    @Transactional
    public synchronized ExchangeRatesResponse refresh() {
        String base = getBaseCurrency();
        List<ExchangeRate> cached = exchangeRateRepository.findByBaseCurrency(base);
        LocalDateTime lastUpdated = maxFetchedAt(cached);
        try {
            Map<String, BigDecimal> rates = fetchFromProvider(base);
            LocalDateTime now = LocalDateTime.now();
            exchangeRateRepository.deleteByBaseCurrency(base);
            rates.forEach((code, rate) ->
                    exchangeRateRepository.save(new ExchangeRate(base, code, rate, now)));
            List<ExchangeRate> fresh = exchangeRateRepository.findByBaseCurrency(base);
            return buildResponse(base, maxFetchedAt(fresh), fresh, false, "provider");
        } catch (Exception e) {
            log.warn("Exchange rate refresh failed; serving cached rates: {}", e.getMessage());
            if (!cached.isEmpty()) {
                return buildResponse(base, lastUpdated, cached, true, "cache");
            }
            return new ExchangeRatesResponse(base, null, Map.of(), true, "unavailable");
        }
    }

    /** Financial settings summary (base currency + when rates were last updated). */
    @Transactional(readOnly = true)
    public FinancialSettingsResponse getFinancial() {
        String base = getBaseCurrency();
        List<ExchangeRate> cached = exchangeRateRepository.findByBaseCurrency(base);
        LocalDateTime lastUpdated = maxFetchedAt(cached);
        boolean stale = !cached.isEmpty() && !isFresh(lastUpdated);
        return new FinancialSettingsResponse(base,
                lastUpdated == null ? null : lastUpdated.toString(), stale);
    }

    /** Change the base currency (ADMIN only). Future calculations use the latest rates. */
    @Transactional
    public FinancialSettingsResponse setBaseCurrency(String code) {
        String normalized = code == null ? null : code.trim().toUpperCase(Locale.ROOT);
        if (normalized == null || !normalized.matches("[A-Z]{3}")) {
            throw new BadRequestException("Base currency must be a 3-letter ISO code");
        }
        appSettingRepository.findBySettingKey(BASE_CURRENCY_KEY)
                .ifPresentOrElse(s -> s.setSettingValue(normalized),
                        () -> appSettingRepository.save(new AppSetting(BASE_CURRENCY_KEY, normalized)));
        // Fetch rates for the new base immediately (future calculations use them).
        refresh();
        return getFinancial();
    }

    public String getBaseCurrency() {
        return appSettingRepository.findBySettingKey(BASE_CURRENCY_KEY)
                .map(AppSetting::getSettingValue)
                .filter(v -> v != null && !v.isBlank())
                .orElse(defaultBase == null || defaultBase.isBlank() ? "INR" : defaultBase.trim().toUpperCase(Locale.ROOT));
    }

    /** True when the current authenticated user holds the ADMIN role. */
    public boolean isAdmin() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null) {
            return false;
        }
        return auth.getAuthorities().stream()
                .anyMatch(a -> "ROLE_ADMIN".equals(a.getAuthority()));
    }

    // ======================= Internals =======================

    private Map<String, BigDecimal> fetchFromProvider(String base) {
        String url = apiUrl.replace("{base}", base);
        @SuppressWarnings("unchecked")
        Map<String, Object> body = restClient.get().uri(url).retrieve().body(Map.class);
        if (body == null || !"success".equals(body.get("result"))) {
            throw new IllegalStateException("Provider returned no rates for base " + base);
        }
        Object ratesObj = body.get("rates");
        if (!(ratesObj instanceof Map)) {
            throw new IllegalStateException("Provider response missing rates");
        }
        Map<String, BigDecimal> rates = new HashMap<>();
        ((Map<?, ?>) ratesObj).forEach((code, value) -> {
            if (code != null && value instanceof Number n && n.doubleValue() > 0) {
                rates.put(String.valueOf(code).toUpperCase(Locale.ROOT),
                        BigDecimal.valueOf(n.doubleValue()).setScale(10, java.math.RoundingMode.HALF_UP));
            }
        });
        rates.put(base, BigDecimal.ONE);
        return rates;
    }

    private boolean isFresh(LocalDateTime fetchedAt) {
        return fetchedAt != null && Duration.between(fetchedAt, LocalDateTime.now()).toHours() < refreshHours;
    }

    private LocalDateTime maxFetchedAt(List<ExchangeRate> rates) {
        return rates.stream()
                .map(ExchangeRate::getFetchedAt)
                .filter(java.util.Objects::nonNull)
                .max(LocalDateTime::compareTo)
                .orElse(null);
    }

    private ExchangeRatesResponse buildResponse(String base, LocalDateTime lastUpdated,
                                                List<ExchangeRate> rates, boolean stale, String source) {
        Map<String, BigDecimal> map = new HashMap<>();
        for (ExchangeRate r : rates) {
            map.put(r.getCurrencyCode(), r.getRate());
        }
        map.put(base, BigDecimal.ONE);
        return new ExchangeRatesResponse(base,
                lastUpdated == null ? null : lastUpdated.toString(),
                map, stale, source);
    }
}
