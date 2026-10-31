package com.vishatech.erp.production.access;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Registers the Production access interceptor on the Production module's own
 * paths — no other module's routes are touched, and the shared ERP services
 * ({@code /production-trackers} for the Sales tracker, {@code /masters},
 * {@code /locations}, {@code /files}, {@code /history}, {@code /notifications},
 * the document repository's writes, …) stay exactly as they were.
 *
 * <p>The list is explicit rather than a single {@code /production/**} pattern
 * because most Production controllers are mounted on their own document root
 * ({@code /production-orders}, {@code /castings}, {@code /quality-inspections},
 * …), and several of those roots are shared with other modules' tooling — the
 * tracker above, and {@code /documents} which is included in its bare form only
 * (the policy owns the Production-scoped listing and leaves the shared
 * repository's other operations to the existing {@code DOCUMENT_*} checks).
 */
@Configuration
public class ProductionAccessWebConfig implements WebMvcConfigurer {

    /** Every path family the Production access policy owns. */
    static final String[] PRODUCTION_PATHS = {
        "/production-kpi", "/production-kpi/**",
        "/integration", "/integration/**",
        "/production-orders", "/production-orders/**",
        "/technical-verifications", "/technical-verifications/**",
        "/drawings", "/drawings/**",
        "/models", "/models/**",
        "/cad-conversion", "/cad-conversion/**",
        "/castings", "/castings/**",
        "/fabrications", "/fabrications/**",
        "/machine-shop", "/machine-shop/**",
        "/assemblies", "/assemblies/**",
        "/quality-inspections", "/quality-inspections/**",
        "/packing", "/packing/**",
        "/dispatch", "/dispatch/**",
        "/acknowledgements", "/acknowledgements/**",
        "/production-entries", "/production-entries/**",
        "/production/reports", "/production/reports/**",
        "/production/settings", "/production/settings/**",
        "/audit", "/audit/**",
        "/documents"
    };

    private final ProductionAccessInterceptor productionAccessInterceptor;

    public ProductionAccessWebConfig(ProductionAccessInterceptor productionAccessInterceptor) {
        this.productionAccessInterceptor = productionAccessInterceptor;
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(productionAccessInterceptor).addPathPatterns(PRODUCTION_PATHS);
    }
}
