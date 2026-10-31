package com.vishatech.erp.service;

import com.vishatech.erp.entity.ProcessingJob;

/**
 * One implementation per heavy operation type.
 *
 * <p>The worker infrastructure (claiming, retries, restart recovery, bounded
 * concurrency, input cleanup) lives in {@link ProcessingJobService}; a handler
 * only contains the operation itself, so converting another workflow later means
 * adding a handler — not touching the pipeline.
 *
 * <p>{@link #process} runs on a background worker thread with no HTTP request and
 * no surrounding transaction. It may throw: the pipeline turns any exception
 * into a FAILED job with a safe, truncated message.
 */
public interface ProcessingJobHandler {

    /** Operation type this handler serves (stored in {@code ProcessingJob.jobType}). */
    String jobType();

    /**
     * Run the operation and return the JSON result payload.
     *
     * @param job the claimed job (its {@code inputRef} points at the stored inputs)
     * @return JSON string persisted as the job result
     * @throws Exception when the operation fails
     */
    String process(ProcessingJob job) throws Exception;
}
