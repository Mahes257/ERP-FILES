package com.vishatech.erp.marketing.access;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Registers the Marketing access interceptor on the Marketing module only —
 * no other module's routes are touched.
 */
@Configuration
public class MarketingAccessWebConfig implements WebMvcConfigurer {

    private final MarketingAccessInterceptor marketingAccessInterceptor;

    public MarketingAccessWebConfig(MarketingAccessInterceptor marketingAccessInterceptor) {
        this.marketingAccessInterceptor = marketingAccessInterceptor;
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(marketingAccessInterceptor).addPathPatterns("/marketing/**");
    }
}
