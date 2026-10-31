package com.vishatech.erp.purchase.access;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Registers the Purchase access interceptor on the Purchase module's own API
 * only — {@code /api/purchase/**}. Every other module keeps its routes and
 * authorities untouched, including the shared endpoints the Purchase screens also
 * read ({@code /documents}, {@code /files}, {@code /masters},
 * {@code /exchange-rates}, {@code /notifications}, …).
 *
 * <p>{@code /api/purchase/access/**} is covered by the same interceptor but the
 * policy returns {@code null} for it, so Access Management itself stays
 * ADMIN-only (the controller's own {@code ROLE_ADMIN} checks) instead of being
 * gated by a Purchase permission.
 */
@Configuration
public class PurchaseAccessWebConfig implements WebMvcConfigurer {

    /** Every path family the Purchase access policy owns. */
    static final String[] PURCHASE_PATHS = {
        "/api/purchase", "/api/purchase/**"
    };

    private final PurchaseAccessInterceptor purchaseAccessInterceptor;

    public PurchaseAccessWebConfig(PurchaseAccessInterceptor purchaseAccessInterceptor) {
        this.purchaseAccessInterceptor = purchaseAccessInterceptor;
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(purchaseAccessInterceptor).addPathPatterns(PURCHASE_PATHS);
    }
}
