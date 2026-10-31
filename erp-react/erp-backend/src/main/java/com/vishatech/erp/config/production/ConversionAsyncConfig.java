package com.vishatech.erp.config.production;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import java.util.concurrent.Executor;

/**
 * Async task infrastructure for CAD conversion jobs.
 *
 * CAD conversion (SLDPRT/SLDASM -> GLB) can take tens of seconds, so it is
 * executed on a dedicated bounded thread pool rather than blocking the HTTP
 * request thread. Conversion status is persisted to the database and polled
 * by the frontend viewer.
 */
@Configuration
@EnableAsync
public class ConversionAsyncConfig {

    @Value("${app.cad-conversion.concurrency:2}")
    private int concurrency;

    @Value("${app.cad-conversion.queue-capacity:50}")
    private int queueCapacity;

    @Bean(name = "cadConversionExecutor")
    public Executor cadConversionExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(concurrency);
        executor.setMaxPoolSize(concurrency);
        executor.setQueueCapacity(queueCapacity);
        executor.setThreadNamePrefix("cad-conversion-");
        executor.setWaitForTasksToCompleteOnShutdown(true);
        executor.initialize();
        return executor;
    }
}
