package com.vishatech.erp.sales.access;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Registers the Sales access interceptor on the Sales module's own paths — no
 * other module's routes are touched, and the shared ERP services
 * ({@code /masters}, {@code /locations}, {@code /files}, {@code /history},
 * {@code /record-revisions}, {@code /notifications}, …) stay exactly as they
 * were.
 *
 * <p>The list is explicit rather than a single {@code /sales/**} pattern
 * because most Sales controllers are mounted on their own document root
 * ({@code /quotations}, {@code /invoices}, …). {@code /documents} is included in
 * its bare form only: the policy owns the Sales-scoped listing and deliberately
 * leaves the shared repository's other operations to the existing
 * {@code DOCUMENT_*} checks (see {@link SalesAccessPolicy#areaOf}).
 */
@Configuration
public class SalesAccessWebConfig implements WebMvcConfigurer {

    /** Every path family the Sales access policy owns. */
    static final String[] SALES_PATHS = {
        "/sales/dashboard", "/sales/dashboard/**",
        "/sales/reports", "/sales/reports/**",
        "/settings/sales", "/settings/sales/**",
        "/sales-orders/**",
        "/delivery-challans/**",
        "/proforma-invoices/**",
        "/invoices/**",
        "/payment-receipts/**",
        "/credit-notes/**",
        "/sales-contracts/**",
        "/quotations/**",
        "/cprs/**",
        "/cpr-technical-verifications/**",
        "/cost-workouts/**",
        "/profit-workouts/**",
        "/leads/**",
        "/customers/**",
        "/contacts/**",
        "/followups/**",
        "/documents"
    };

    private final SalesAccessInterceptor salesAccessInterceptor;

    public SalesAccessWebConfig(SalesAccessInterceptor salesAccessInterceptor) {
        this.salesAccessInterceptor = salesAccessInterceptor;
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(salesAccessInterceptor).addPathPatterns(SALES_PATHS);
    }
}
