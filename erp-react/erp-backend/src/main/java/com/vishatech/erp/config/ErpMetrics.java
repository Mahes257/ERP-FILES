package com.vishatech.erp.config;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.DistributionSummary;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import java.util.concurrent.TimeUnit;
import org.springframework.stereotype.Component;

/**
 * Centralized ERP metrics using Micrometer.
 *
 * <p>All metric names follow the convention {@code erp_<operation>_<metric>} with
 * safe, low-cardinality tags only (status, type, module). No PII, document IDs,
 * user emails or arbitrary URL parameters are ever recorded.
 */
@Component
public class ErpMetrics {

    private final MeterRegistry registry;

    // ---- File upload metrics ----
    private final Counter uploadSuccess;
    private final Counter uploadFailure;
    private final DistributionSummary uploadSize;

    // ---- Processing job metrics ----
    private final Counter jobCompleted;
    private final Counter jobFailed;
    private final Timer jobDuration;
    private volatile long queueSize = 0;

    public ErpMetrics(MeterRegistry registry) {
        this.registry = registry;

        this.uploadSuccess = Counter.builder("erp_file_upload_total")
                .description("Total successful file uploads")
                .tag("status", "success")
                .register(registry);

        this.uploadFailure = Counter.builder("erp_file_upload_total")
                .description("Total failed file uploads")
                .tag("status", "failure")
                .register(registry);

        this.uploadSize = DistributionSummary.builder("erp_file_upload_bytes")
                .description("Size of uploaded files in bytes")
                .publishPercentiles(0.5, 0.95, 0.99)
                .register(registry);

        this.jobCompleted = Counter.builder("erp_processing_job_total")
                .description("Total completed processing jobs")
                .tag("status", "completed")
                .register(registry);

        this.jobFailed = Counter.builder("erp_processing_job_total")
                .description("Total failed processing jobs")
                .tag("status", "failed")
                .register(registry);

        this.jobDuration = Timer.builder("erp_processing_job_duration")
                .description("Processing job execution time")
                .publishPercentiles(0.5, 0.95, 0.99)
                .register(registry);

        // Gauge for queue size (updated by ProcessingJobService)
        registry.gauge("erp_processing_job_queue_size", this, ErpMetrics::getQueueSize);
    }

    // ---- File upload metrics ----

    public void recordUploadSuccess(long bytes) {
        uploadSuccess.increment();
        uploadSize.record(bytes);
    }

    public void recordUploadFailure() {
        uploadFailure.increment();
    }

    // ---- Processing job metrics ----

    public void recordJobCompleted(long durationMs) {
        jobCompleted.increment();
        jobDuration.record(durationMs, TimeUnit.MILLISECONDS);
    }

    public void recordJobFailed(long durationMs) {
        jobFailed.increment();
        jobDuration.record(durationMs, TimeUnit.MILLISECONDS);
    }

    public void updateQueueSize(long size) {
        this.queueSize = size;
    }

    private long getQueueSize() {
        return queueSize;
    }

    // ---- Custom counters with tags ----

    public Counter counter(String name, String... tags) {
        return registry.counter(name, tags);
    }

    public Timer.Sample startTimer() {
        return Timer.start(registry);
    }

    public void recordTimer(Timer.Sample sample, String name, String... tags) {
        sample.stop(Timer.builder(name).tags(tags).register(registry));
    }
}
