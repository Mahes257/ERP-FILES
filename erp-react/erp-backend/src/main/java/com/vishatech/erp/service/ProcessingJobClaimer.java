package com.vishatech.erp.service;

import com.vishatech.erp.repository.ProcessingJobRepository;
import java.time.LocalDateTime;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Commits the QUEUED -> PROCESSING claim in its OWN transaction.
 *
 * <p>This is a correctness requirement, not a style choice. The claim must be
 * durable <em>before</em> the job is handed to a worker: if the claim were still
 * open when the worker started and finished, the worker's COMPLETED write could
 * be overwritten by the claim's later commit, leaving a finished job stuck in
 * PROCESSING. {@code REQUIRES_NEW} suspends any surrounding transaction (the
 * submitting HTTP request, or the sweeper) so the claim is committed on return,
 * and the worker only ever sees a row nobody else can claim.
 *
 * <p>The conditional UPDATE itself is the duplicate-processing guard: of any
 * number of racing claimers exactly one updates a row.
 */
@Service
public class ProcessingJobClaimer {

    private final ProcessingJobRepository jobs;

    public ProcessingJobClaimer(ProcessingJobRepository jobs) {
        this.jobs = jobs;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public boolean claim(Long jobId) {
        return jobs.claim(jobId, LocalDateTime.now()) == 1;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public boolean requeue(Long jobId) {
        return jobs.requeue(jobId) == 1;
    }
}
