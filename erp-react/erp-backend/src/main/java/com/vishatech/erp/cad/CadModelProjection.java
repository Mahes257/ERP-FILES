package com.vishatech.erp.cad;

import com.vishatech.erp.entity.CadConversionJobStatus;
import com.vishatech.erp.production.api.ModelConversionProjectionPort;
import com.vishatech.erp.production.api.ModelConversionProjectionPort.ConversionOutcome;

import java.nio.file.Path;
import java.time.Instant;

/**
 * Translates a CAD conversion job state into the neutral
 * {@link ConversionOutcome} that the model projection understands, and applies it
 * through {@link ModelConversionProjectionPort}.
 *
 * <p>Shared by both processes — the ERP (when it queues, refuses or cancels a
 * job) and the isolated CAD worker (when a job completes or fails) — so the
 * mapping from job state to reported outcome can never drift between them. What
 * an outcome then means for the {@code models} columns (which status value,
 * which timestamps, how a failure reason is bounded) belongs to Production and
 * lives in the projection itself.
 *
 * <p>Nothing here depends on Production persistence: the target is the published
 * port, so the shared CAD engine no longer reaches into the model entity, its
 * repositories or the conversion-status vocabulary.
 */
public final class CadModelProjection {

    private CadModelProjection() {
    }

    /**
     * Maps a job state onto the projection contract.
     *
     * <p>The five job states are the ones this pipeline produces. Any other
     * state is an admission refusal — the caller found no engine that can convert
     * the format here — and is reported as {@code UNSUPPORTED}, the state the
     * ERP's refusal path has always written.
     *
     * @param jobStatus one of {@code CadConversionJobStatus} (or an admission
     *                  refusal state such as UNSUPPORTED)
     * @param message   safe, single-line reason (may be null)
     * @param outputPath generated GLB path for COMPLETED (may be null)
     */
    public static ConversionOutcome outcomeFor(String jobStatus, String message, Path outputPath) {
        Instant at = Instant.now();
        return switch (jobStatus) {
            case CadConversionJobStatus.QUEUED -> ConversionOutcome.queued(at);
            case CadConversionJobStatus.PROCESSING -> ConversionOutcome.processing(at);
            case CadConversionJobStatus.COMPLETED ->
                    ConversionOutcome.ready(at, outputPath == null ? null : outputPath.toString());
            case CadConversionJobStatus.FAILED -> ConversionOutcome.failed(at, message);
            case CadConversionJobStatus.CANCELLED -> ConversionOutcome.cancelled(at, message);
            default -> ConversionOutcome.unsupported(at, message);
        };
    }

    /**
     * Reports a job state to the projection. The caller owns the transaction (the
     * ERP service or the worker's own JPA transaction).
     *
     * @param target    the projection to update (never null)
     * @param jobStatus one of {@code CadConversionJobStatus} (or an admission
     *                  refusal state such as UNSUPPORTED)
     * @param message   safe, single-line reason (may be null)
     * @param outputPath generated GLB path for COMPLETED (may be null)
     */
    public static void apply(ModelConversionProjectionPort target, String jobStatus,
                             String message, Path outputPath) {
        target.recordConversionOutcome(outcomeFor(jobStatus, message, outputPath));
    }
}
