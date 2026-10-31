package com.vishatech.erp.config;

import org.springframework.beans.BeansException;
import org.springframework.context.ApplicationContext;
import org.springframework.context.ApplicationContextAware;
import org.springframework.stereotype.Component;

/**
 * Static accessor for the Spring {@link ApplicationContext}.
 *
 * Used by non-Spring-managed classes and as a convenience for injecting a
 * single dependency into many services without modifying every constructor.
 */
@Component
public class SpringContext implements ApplicationContextAware {

    private static ApplicationContext context;

    @Override
    public void setApplicationContext(ApplicationContext applicationContext) throws BeansException {
        context = applicationContext;
    }

    public static <T> T getBean(Class<T> beanClass) {
        if (context == null) {
            throw new IllegalStateException("Spring context not yet available");
        }
        return context.getBean(beanClass);
    }
}