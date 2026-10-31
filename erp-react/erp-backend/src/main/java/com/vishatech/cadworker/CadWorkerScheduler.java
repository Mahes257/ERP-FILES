package com.vishatech.cadworker;

import com.vishatech.erp.cad.CadWorkerProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;

/**
 * Poll loop, crash recovery and housekeeping for the isolated CAD worker.
 *
 * <p>This is the ONLY thing that moves work out of the queue. Everything it
 * does is idempotent and cheap, so a misconfigured interval can never turn
 * into a load problem:
 *
 * <ul>
 *   <li><b>Poll</b> (default every 2 s): claim up to the concurrency limit,
 *       then upsert the heartbeat row the ERP reads for
 *       {@code GET /cad-conversion/health}. The worker has no HTTP port — this
 *       row is its entire liveness signal.</li>
 *   <li><b>Startup recovery</b>: PROCESSING rows this worker id had claimed
 *       before a restart are provably dead and are re-queued immediately
 *       (instead of waiting out the stale timeout).</li>
 *   <li><b>Stale recovery</b> (every 30 s): PROCESSING rows older than the
 *       stale timeout belong to some worker that died without a heartbeat —
 *       re-queued while retry budget remains, FAILED when it is exhausted.</li>
 *   <li><b>Housekeeping</b> (every 15 min): orphaned staging directories,
 *       unreferenced preview GLBs past retention, finished job rows past
 *       retention, and long-dead heartbeat rows.</li>
 * </ul>
 */
@Component
public class CadWorkerScheduler implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(CadWorkerScheduler.class);

    private final CadJobWorker worker;
    private final CadJobStore store;
    private final CadWorkerProperties properties;

    public CadWorkerScheduler(CadJobWorker worker,
                              CadJobStore store,
                              CadWorkerProperties properties) {
        this.worker = worker;
        this.store = store;
        this.properties = properties;
    }

    /** Recover what this worker was running the last time it was alive. */
    @Override
    public void run(ApplicationArguments args) {
        if (!properties.isEnabled()) {
            log.warn("CAD conversion worker is DISABLED (app.cad.worker.enabled=false)");
            return;
        }
        try {
            int recovered = store.requeueInterruptedOnStartup(properties.getWorkerId());
            log.info("CAD worker {} started (maxConcurrentJobs={}, timeout={}s, staging={}){}",
                    properties.getWorkerId(),
                    properties.getMaxConcurrentJobs(),
                    properties.getTimeoutSeconds(),
                    properties.getTempRoot(),
                    recovered > 0 ? " — recovered " + recovered + " interrupted job(s)" : "");
        } catch (Exception e) {
            log.error("CAD worker startup recovery failed", e);
        }
    }

    /**
     * Write the liveness row, tolerating the one race the upsert can hit: the
     * worker's startup runner and its immediately-following first poll both
     * want to create the row for a brand-new worker id, so one INSERT can lose
     * to the other. The loser retries once and finds the row, turning the write
     * into an UPDATE — the heartbeat must never fail on a technicality.
     */
    private void heartbeatSafely() {
        try {
            store.heartbeat(properties.getWorkerId(), worker.getInFlight(),
                    properties.getMaxConcurrentJobs(), worker.primaryEngineName());
        } catch (org.springframework.dao.DataIntegrityViolationException race) {
            try {
                Thread.sleep(150);
                store.heartbeat(properties.getWorkerId(), worker.getInFlight(),
                        properties.getMaxConcurrentJobs(), worker.primaryEngineName());
            } catch (InterruptedException ie) {
                Thread.currentThread().interrupt();
            } catch (Exception retryFailure) {
                log.debug("Heartbeat retry failed: {}", retryFailure.getMessage());
            }
        } catch (Exception e) {
            log.debug("Heartbeat write skipped: {}", e.getMessage());
        }
    }

    /**
     * Claim work and refresh the heartbeat. Failures are logged, never fatal:
     * the next tick retries, and the stale-recovery sweep keeps the queue honest.
     */
    @Scheduled(fixedDelayString = "${app.cad.worker.poll-interval-ms:2000}")
    public void poll() {
        if (!properties.isEnabled()) {
            return;
        }
        try {
            int started = worker.dispatch();
            heartbeatSafely();
            if (started > 0) {
                log.info("CAD worker {} started {} job(s) (in flight {}/{})",
                        properties.getWorkerId(), started, worker.getInFlight(),
                        properties.getMaxConcurrentJobs());
            }
        } catch (Exception e) {
            log.error("CAD worker poll failed", e);
        }
    }

    /**
     * Jobs stuck in PROCESSING whose worker never came back: re-queue them
     * while they have retry budget, otherwise fail them with a safe reason so
     * clients polling them get an answer instead of polling forever.
     */
    @Scheduled(fixedDelayString = "${app.cad.worker.recovery-interval-ms:30000}")
    public void recoverStuckJobs() {
        if (!properties.isEnabled()) {
            return;
        }
        try {
            LocalDateTime staleBefore =
                    LocalDateTime.now().minusSeconds(properties.getStaleTimeoutSeconds());
            int requeued = store.requeueStale(staleBefore);
            int failed = store.failExhaustedStale(staleBefore);
            if (requeued > 0 || failed > 0) {
                log.warn("CAD stale-job recovery: re-queued {}, failed {}", requeued, failed);
            }
        } catch (Exception e) {
            log.error("CAD stale-job recovery failed", e);
        }
    }

    /** Retention: staging, previews, job rows, heartbeat rows. */
    @Scheduled(fixedDelayString = "${app.cad.worker.housekeep-interval-ms:900000}")
    public void housekeep() {
        if (!properties.isEnabled()) {
            return;
        }
        try {
            int staging = worker.cleanOrphanedStaging();
            int previews = worker.cleanUnreferencedPreviews();
            LocalDateTime finishedBefore =
                    LocalDateTime.now().minusDays(properties.getJobRetentionDays());
            int jobs = store.housekeepJobs(finishedBefore, LocalDateTime.now().minusDays(7));
            if (staging > 0 || previews > 0 || jobs > 0) {
                log.info("CAD housekeeping: {} staging dir(s), {} preview(s), {} job row(s) removed",
                        staging, previews, jobs);
            }
        } catch (Exception e) {
            log.error("CAD housekeeping failed", e);
        }
    }
}
