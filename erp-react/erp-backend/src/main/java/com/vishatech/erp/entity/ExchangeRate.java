package com.vishatech.erp.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * Cached exchange rate: how many units of {@code currencyCode} equal one unit
 * of {@code baseCurrency}. Rows are refreshed daily by ExchangeRateService from
 * the configured public provider (open.er-api.com by default) and are served
 * from this table when the provider is temporarily unreachable.
 */
@Entity
@Table(name = "exchange_rates",
        uniqueConstraints = @UniqueConstraint(columnNames = { "base_currency", "currency_code" }))
public class ExchangeRate {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 10)
    private String baseCurrency;

    @Column(nullable = false, length = 10)
    private String currencyCode;

    @Column(nullable = false, precision = 24, scale = 10)
    private BigDecimal rate;

    @Column(nullable = false)
    private LocalDateTime fetchedAt;

    public ExchangeRate() {
    }

    public ExchangeRate(String baseCurrency, String currencyCode, BigDecimal rate, LocalDateTime fetchedAt) {
        this.baseCurrency = baseCurrency;
        this.currencyCode = currencyCode;
        this.rate = rate;
        this.fetchedAt = fetchedAt;
    }

    public Long getId() {
        return id;
    }

    public String getBaseCurrency() {
        return baseCurrency;
    }

    public void setBaseCurrency(String baseCurrency) {
        this.baseCurrency = baseCurrency;
    }

    public String getCurrencyCode() {
        return currencyCode;
    }

    public void setCurrencyCode(String currencyCode) {
        this.currencyCode = currencyCode;
    }

    public BigDecimal getRate() {
        return rate;
    }

    public void setRate(BigDecimal rate) {
        this.rate = rate;
    }

    public LocalDateTime getFetchedAt() {
        return fetchedAt;
    }

    public void setFetchedAt(LocalDateTime fetchedAt) {
        this.fetchedAt = fetchedAt;
    }
}
