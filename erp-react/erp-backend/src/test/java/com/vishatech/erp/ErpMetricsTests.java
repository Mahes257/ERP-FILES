package com.vishatech.erp;

import static org.assertj.core.api.Assertions.assertThat;

import com.vishatech.erp.config.ErpMetrics;
import com.vishatech.erp.security.AbstractSecurityTest;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

/**
 * Tests that custom ERP metrics are recorded correctly.
 */
@SpringBootTest
class ErpMetricsTests extends AbstractSecurityTest {

    @Autowired
    private ErpMetrics erpMetrics;

    @Autowired
    private MeterRegistry meterRegistry;

    @Test
    void uploadSuccessMetricsAreRecorded() {
        double initialCount = meterRegistry.counter("erp_file_upload_total", "status", "success").count();
        erpMetrics.recordUploadSuccess(1024L);
        assertThat(meterRegistry.counter("erp_file_upload_total", "status", "success").count())
                .isEqualTo(initialCount + 1);
    }

    @Test
    void uploadFailureMetricsAreRecorded() {
        double initialCount = meterRegistry.counter("erp_file_upload_total", "status", "failure").count();
        erpMetrics.recordUploadFailure();
        assertThat(meterRegistry.counter("erp_file_upload_total", "status", "failure").count())
                .isEqualTo(initialCount + 1);
    }

    @Test
    void uploadSizeMetricsAreRecorded() {
        long initialCount = (long) meterRegistry.summary("erp_file_upload_bytes").count();
        erpMetrics.recordUploadSuccess(2048L);
        assertThat((long) meterRegistry.summary("erp_file_upload_bytes").count())
                .isEqualTo(initialCount + 1);
    }

    @Test
    void jobCompletionMetricsAreRecorded() {
        double initialCount = meterRegistry.counter("erp_processing_job_total", "status", "completed").count();
        erpMetrics.recordJobCompleted(1500L);
        assertThat(meterRegistry.counter("erp_processing_job_total", "status", "completed").count())
                .isEqualTo(initialCount + 1);
    }

    @Test
    void jobFailureMetricsAreRecorded() {
        double initialCount = meterRegistry.counter("erp_processing_job_total", "status", "failed").count();
        erpMetrics.recordJobFailed(500L);
        assertThat(meterRegistry.counter("erp_processing_job_total", "status", "failed").count())
                .isEqualTo(initialCount + 1);
    }

    @Test
    void queueSizeGaugeIsRegistered() {
        erpMetrics.updateQueueSize(5L);
        assertThat(meterRegistry.get("erp_processing_job_queue_size").gauge())
                .isNotNull();
    }

    @Test
    void timerSampleCanBeStartedAndRecorded() {
        Timer.Sample sample = erpMetrics.startTimer();
        assertThat(sample).isNotNull();
        erpMetrics.recordTimer(sample, "erp_custom_operation", "type", "test");
        assertThat(meterRegistry.timer("erp_custom_operation", "type", "test").count())
                .isGreaterThan(0);
    }
}
