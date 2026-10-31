package com.vishatech.erp.config;

import com.vishatech.erp.service.ProcessingJobService;
import java.util.logging.Logger;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Keeps the processing-job queue moving and honest — the safety net that makes
 * the durable job rows a real queue.
 *
 * <p>Jobs are normally started the moment their submitting transaction commits.
 * This component covers everything that hand-off cannot:
 *
 * <ul>
 *   <li><b>Interrupted runs.</b> A job left PROCESSING by a killed process is
 *       re-queued (or failed once its retries are spent). Runs at startup with
 *       the same staleness rule as the periodic sweep, so a job still held by a
 *       live instance is never stolen.</li>
 *   <li><b>Backlog drain.</b> Jobs that could not start because every worker was
 *       busy stay QUEUED; the sweep starts them oldest-first as workers free up.</li>
 *   <li><b>Restart hand-off.</b> The startup pass starts whatever was queued when
 *       the process stopped, so nothing needs an operator to resubmit it.</li>
 *   <li><b>Housekeeping.</b> Retention for finished jobs and removal of staging
 *       directories no queued/running job owns.</li>
 * </ul>
 *
 * <p>A job submitted normally starts immediately (the submitting transaction
 * dispatches it on commit), so the sweep only bounds two things: how long a job
 * waits when every worker is busy, and how quickly an interrupted job resumes.
 * That is what the interval is a knob for — it is two indexed lookups on an
 * empty queue (queued ids by status, stuck rows by started time), while
 * housekeeping runs on a minutes-scale interval. Nothing here ever fails startup
 * or a request: every pass is guarded and logs.
 */
@Component
public class ProcessingJobRecoveryJob implements ApplicationRunner {

    private static final Logger log = Logger.getLogger(ProcessingJobRecoveryJob.class.getName());

    private final ProcessingJobService processingJobs;

    @Value("${app.processing-jobs.dispatch-batch-size:10}")
    private int dispatchBatchSize;

    public ProcessingJobRecoveryJob(ProcessingJobService processingJobs) {
        this.processingJobs = processingJobs;
    }

    /** Periodic safety net: recover interrupted jobs, then start what is waiting. */
    @Scheduled(fixedDelayString = "${app.processing-jobs.dispatch-interval-ms:5000}")
    public void sweep() {
        guard("sweep", () -> {
            int recovered = processingJobs.recoverInterrupted();
            int started = processingJobs.dispatchPending();
            if (recovered > 0 || started > 0) {
                log.info("Processing job sweep: " + started + " started, " + recovered + " recovered.");
            }
        });
    }

    /** Retention + orphaned staging directories. */
    @Scheduled(fixedDelayString = "${app.processing-jobs.housekeep-interval-ms:900000}")
    public void housekeep() {
        guard("housekeeping", () -> {
            int removed = processingJobs.housekeep();
            if (removed > 0) {
                log.info("Processing job housekeeping removed " + removed + " finished job(s) or stale input folder(s).");
            }
        });
    }

    /**
     * Startup: recover anything a previous process left interrupted and start the
     * jobs that were queued when it stopped. The application is already accepting
     * requests by the time this runs, so a failure here only logs.
     */
    @Override
    public void run(ApplicationArguments args) {
        guard("startup recovery", () -> {
            int recovered = processingJobs.recoverInterrupted();
            int started = processingJobs.dispatchPending();
            if (recovered > 0 || started > 0) {
                log.info("Processing job startup recovery: " + started + " started, " + recovered + " re-queued.");
            }
        });
    }

    private void guard(String what, Runnable action) {
        try {
            action.run();
        } catch (Exception e) {
            // Never let queue maintenance break startup, request handling or the
            // scheduler thread: the next pass simply tries again.
            log.warning("Processing job " + what + " failed: " + e.getMessage());
        }
    }
}
