package com.vishatech.erp.entity;

import java.util.Collection;
import java.util.List;

/**
 * Status values for the {@code cad_conversion_jobs} queue.
 *
 * <p>These are the states a CAD conversion JOB passes through. They are mapped
 * onto the pre-existing {@link ModelConversionStatus} projection that the model
 * API and the rest of the ERP already read:
 *
 * <pre>
 *   QUEUED     -> model.conversionStatus = QUEUED
 *   PROCESSING -> model.conversionStatus = PROCESSING
 *   COMPLETED  -> model.conversionStatus = READY      (+ converted_file_path)
 *   FAILED     -> model.conversionStatus = FAILED     (+ conversion_error)
 *   CANCELLED  -> model.conversionStatus = NOT_CONVERTED (user-aborted)
 * </pre>
 *
 * <p>A format with no conversion engine never becomes a job at all: submission
 * is refused with {@code UNSUPPORTED} and the model projection is set to
 * {@link ModelConversionStatus#UNSUPPORTED}. No job row is fabricated for work
 * that cannot run.
 */
public final class CadConversionJobStatus {

    public static final String QUEUED = "QUEUED";
    public static final String PROCESSING = "PROCESSING";
    public static final String COMPLETED = "COMPLETED";
    public static final String FAILED = "FAILED";
    public static final String CANCELLED = "CANCELLED";

    /** States a worker may still pick up (or hold). */
    public static final List<String> ACTIVE = List.of(QUEUED, PROCESSING);

    /** States that never change again. */
    public static final List<String> TERMINAL = List.of(COMPLETED, FAILED, CANCELLED);

    public static boolean isActive(String status) {
        return ACTIVE.contains(status);
    }

    public static boolean isTerminal(String status) {
        return TERMINAL.contains(status);
    }

    public static boolean isAnyActive(Collection<String> statuses) {
        return statuses != null && statuses.stream().anyMatch(ACTIVE::contains);
    }

    private CadConversionJobStatus() {
    }
}
