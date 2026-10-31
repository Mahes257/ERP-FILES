package com.vishatech.erp.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

/**
 * Bounded worker pool for background processing jobs.
 *
 * <p>The pool is deliberately small and fixed: these operations (PDF/Office
 * parsing, conversions) are CPU- and IO-heavy, and running twenty of them at
 * once would starve the request threads they exist to protect. The service layer
 * additionally gates dispatch on a permit per worker, so the pool never queues
 * work it cannot start — extra submissions simply stay QUEUED in the database
 * until a worker frees up (which is also what makes the queue survive a restart).
 *
 * <p>Same shape as {@code ConversionAsyncConfig} (the CAD conversion pool), with
 * its own thread prefix so the two kinds of work are distinguishable in a thread
 * dump. {@code @EnableAsync} is already declared once for the application.
 */
@Configuration
public class ProcessingJobAsyncConfig {

    @Value("${app.processing-jobs.concurrency:2}")
    private int concurrency;

    @Value("${app.processing-jobs.queue-capacity:25}")
    private int queueCapacity;

    @Bean(name = "processingJobExecutor")
    public ThreadPoolTaskExecutor processingJobExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(concurrency);
        executor.setMaxPoolSize(concurrency);
        executor.setQueueCapacity(queueCapacity);
        executor.setThreadNamePrefix("processing-job-");
        // A job already running is allowed to finish on shutdown, but a stuck one
        // must not hold the JVM open indefinitely; unfinished jobs are recovered
        // from the database on the next start.
        executor.setWaitForTasksToCompleteOnShutdown(true);
        executor.setAwaitTerminationSeconds(60);
        executor.initialize();
        return executor;
    }
}
