package com.vishatech.erp.entity;

/**
 * Lifecycle states for a {@link ProcessingJob}.
 *
 * QUEUED     — accepted and persisted, waiting for a free worker slot.
 * PROCESSING — a worker has claimed the job and is running the operation.
 * COMPLETED  — the operation finished; the result payload is stored.
 * FAILED     — the operation threw, or the job could not be completed safely
 *              (see the job's safe error message).
 *
 * Mirrors {@link com.vishatech.erp.entity.production.ModelConversionStatus},
 * which is the same pattern already used by the asynchronous CAD conversion
 * pipeline. String constants (not an enum) keep the values stable for the
 * frontend polling contract and for existing rows.
 */
public final class ProcessingJobStatus {

    public static final String QUEUED = "QUEUED";
    public static final String PROCESSING = "PROCESSING";
    public static final String COMPLETED = "COMPLETED";
    public static final String FAILED = "FAILED";

    /** True for jobs that are waiting or running (never re-submitted as new work). */
    public static boolean isInFlight(String status) {
        return QUEUED.equals(status) || PROCESSING.equals(status);
    }

    /** True for jobs that will never change state again. */
    public static boolean isTerminal(String status) {
        return COMPLETED.equals(status) || FAILED.equals(status);
    }

    private ProcessingJobStatus() {
    }
}
