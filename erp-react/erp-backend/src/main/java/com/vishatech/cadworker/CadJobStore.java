package com.vishatech.cadworker;

import com.vishatech.erp.cad.CadModelProjection;
import com.vishatech.erp.cad.CadWorkerProperties;
import com.vishatech.erp.entity.CadConversionJob;
import com.vishatech.erp.entity.CadConversionJobStatus;
import com.vishatech.erp.entity.CadWorkerHeartbeat;
import com.vishatech.erp.entity.production.Model;
import com.vishatech.erp.entity.production.ModelHistory;
import com.vishatech.erp.repository.CadConversionJobRepository;
import com.vishatech.erp.repository.CadWorkerHeartbeatRepository;
import com.vishatech.erp.repository.production.ModelHistoryRepository;
import com.vishatech.erp.repository.production.ModelRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.nio.file.Path;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

/**
 * Every database mutation the CAD worker performs.
 *
 * <p>All state changes are isolated here so each one runs in its own
 * transaction and no long-running conversion ever holds a database
 * transaction open. The claim in particular uses {@code REQUIRES_NEW}: the
 * QUEUED -> PROCESSING transition must be durable <em>before</em> the engine
 * starts, otherwise a later COMPLETED write could be overwritten by a claim
 * that committed afterwards and the job would look stuck forever.
 */
@Component
public class CadJobStore {

    private static final Logger log = LoggerFactory.getLogger(CadJobStore.class);

    private final CadConversionJobRepository jobs;
    private final CadWorkerHeartbeatRepository heartbeats;
    private final ModelRepository models;
    private final ModelHistoryRepository history;
    private final CadWorkerProperties properties;

    public CadJobStore(CadConversionJobRepository jobs,
                       CadWorkerHeartbeatRepository heartbeats,
                       ModelRepository models,
                       ModelHistoryRepository history,
                       CadWorkerProperties properties) {
        this.jobs = jobs;
        this.heartbeats = heartbeats;
        this.models = models;
        this.history = history;
        this.properties = properties;
    }

    /**
     * Atomically claim the oldest QUEUED job for this worker.
     *
     * @return the claimed job, or empty when the queue is idle. Of any number
     *         of workers racing on the same row exactly one observes a job.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public Optional<CadConversionJob> claimNext(String workerId) {
        List<CadConversionJob> candidates = jobs.findClaimCandidates(
                org.springframework.data.domain.PageRequest.of(0, 5));
        for (CadConversionJob candidate : candidates) {
            int updated = jobs.claim(candidate.getId(),
                    CadConversionJobStatus.QUEUED,
                    CadConversionJobStatus.PROCESSING,
                    workerId,
                    LocalDateTime.now());
            if (updated == 1) {
                CadConversionJob claimed = jobs.findById(candidate.getId()).orElse(null);
                if (claimed != null) {
                    log.info("CAD job {} claimed by {} (attempt {}/{}, type={})",
                            claimed.getId(), workerId, claimed.getAttempts(),
                            claimed.getMaxAttempts(), claimed.getFileType());
                }
                return Optional.ofNullable(claimed);
            }
        }
        return Optional.empty();
    }

    /** Re-read a job the worker owns (its model may have changed meanwhile). */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public Optional<CadConversionJob> reload(String jobId) {
        return jobs.findById(jobId);
    }

    /**
     * COMPLETED: persist the validated GLB path, flip the model to READY and
     * record the timeline entry the ERP has always recorded for a conversion.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void markCompleted(String jobId, Path outputPath) {
        CadConversionJob job = jobs.findById(jobId).orElse(null);
        if (job == null) {
            log.warn("CAD job {} vanished before completion", jobId);
            return;
        }
        job.setStatus(CadConversionJobStatus.COMPLETED);
        job.setOutputPath(outputPath.toString());
        job.setErrorMessage(null);
        job.setCompletedAt(LocalDateTime.now());
        jobs.save(job);

        Model model = models.findById(job.getModelId()).orElse(null);
        if (model != null) {
            CadModelProjection.apply(model, CadConversionJobStatus.COMPLETED, null, outputPath);
            recordConvertedHistory(model);
            models.save(model);
        }
        log.info("CAD job {} COMPLETED model={} output={}", jobId, job.getModelId(), outputPath);
    }

    /** FAILED: one safe line for the user, the model projection updated too. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void markFailed(String jobId, String reason) {
        CadConversionJob job = jobs.findById(jobId).orElse(null);
        if (job == null) {
            return;
        }
        String safe = safeMessage(reason);
        job.setStatus(CadConversionJobStatus.FAILED);
        job.setErrorMessage(safe);
        job.setCompletedAt(LocalDateTime.now());
        jobs.save(job);

        Model model = models.findById(job.getModelId()).orElse(null);
        if (model != null) {
            CadModelProjection.apply(model, CadConversionJobStatus.FAILED, safe, null);
            models.save(model);
        }
        log.warn("CAD job {} FAILED model={} reason={}", jobId, job.getModelId(), safe);
    }

    /** Interrupted jobs (worker restarted mid-conversion) get a second chance. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public int requeueStale(LocalDateTime staleBefore) {
        return jobs.requeueStale(
                CadConversionJobStatus.QUEUED,
                CadConversionJobStatus.PROCESSING,
                staleBefore);
    }

    /**
     * Startup recovery: PROCESSING rows claimed by THIS worker id cannot be
     * live (the process running them is gone — this one just started), so they
     * are re-queued at once, or failed when the retry budget is exhausted.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public int requeueInterruptedOnStartup(String workerId) {
        int handled = 0;
        for (CadConversionJob job : jobs.findByStatusAndWorkerId(
                CadConversionJobStatus.PROCESSING, workerId)) {
            if (job.getAttempts() < job.getMaxAttempts()) {
                job.setStatus(CadConversionJobStatus.QUEUED);
                job.setWorkerId(null);
                job.setStartedAt(null);
            } else {
                job.setStatus(CadConversionJobStatus.FAILED);
                job.setErrorMessage("Conversion was interrupted and could not be retried.");
                job.setCompletedAt(LocalDateTime.now());
                models.findById(job.getModelId()).ifPresent(model -> {
                    CadModelProjection.apply(model, CadConversionJobStatus.FAILED,
                            "Conversion was interrupted and could not be retried.", null);
                    models.save(model);
                });
            }
            jobs.save(job);
            handled++;
        }
        return handled;
    }

    /** Jobs that exhausted their retries while stuck in PROCESSING. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public int failExhaustedStale(LocalDateTime staleBefore) {
        List<CadConversionJob> exhausted =
                jobs.findExhaustedStale(CadConversionJobStatus.PROCESSING, staleBefore);
        for (CadConversionJob job : exhausted) {
            String reason = "Conversion was interrupted and could not be retried.";
            job.setStatus(CadConversionJobStatus.FAILED);
            job.setErrorMessage(reason);
            job.setCompletedAt(LocalDateTime.now());
            jobs.save(job);
            models.findById(job.getModelId()).ifPresent(model -> {
                CadModelProjection.apply(model, CadConversionJobStatus.FAILED, reason, null);
                models.save(model);
            });
            log.warn("CAD job {} failed after {} interrupted attempt(s)",
                    job.getId(), job.getAttempts());
        }
        return exhausted.size();
    }

    /** Liveness row the ERP reads for /cad-conversion/health. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void heartbeat(String workerId, int activeJobs, int maxJobs, String engine) {
        CadWorkerHeartbeat row = heartbeats.findById(workerId).orElseGet(() -> {
            CadWorkerHeartbeat created = new CadWorkerHeartbeat();
            created.setId(workerId);
            return created;
        });
        row.setStatus("RUNNING");
        row.setActiveJobs(activeJobs);
        row.setMaxJobs(maxJobs);
        row.setEngine(engine);
        row.setUpdatedAt(LocalDateTime.now());
        heartbeats.save(row);
    }

    /** Called once on graceful shutdown so health reports STOPPED immediately. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void markStopped(String workerId) {
        heartbeats.findById(workerId).ifPresent(row -> {
            row.setStatus("STOPPED");
            row.setUpdatedAt(LocalDateTime.now());
            heartbeats.save(row);
        });
    }

    /** Retention: finished job rows and long-dead heartbeat rows. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public int housekeepJobs(LocalDateTime finishedBefore, LocalDateTime heartbeatCutoff) {
        int removed = 0;
        removed += (int) jobs.deleteByStatusInAndCompletedAtBefore(
                CadConversionJobStatus.TERMINAL, finishedBefore);
        try {
            heartbeats.deleteByUpdatedAtBeforeAndIdNotIn(heartbeatCutoff,
                    java.util.Set.of(properties.getWorkerId()));
        } catch (Exception e) {
            log.debug("Heartbeat housekeeping skipped: {}", e.getMessage());
        }
        return removed;
    }

    /** True when some model still points at this preview file. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public boolean isPreviewReferenced(String path) {
        return models.countByConvertedFilePath(path) > 0;
    }

    /** One timeline entry per successful conversion (matches prior behaviour). */
    private void recordConvertedHistory(Model model) {
        try {
            ModelHistory entry = ModelHistory.builder()
                    .model(model)
                    .action("Converted")
                    .performedBy("CAD Worker")
                    .performedAt(Instant.now())
                    .remarks("CAD to GLB conversion completed.")
                    .build();
            model.addHistory(entry);
        } catch (Exception e) {
            // History must never turn a successful conversion into a failure.
            log.debug("Conversion history not recorded: {}", e.getMessage());
        }
    }

    /**
     * A safe, single-line reason: no stack traces, no absolute paths, no
     * command lines. Anything longer than the column is truncated.
     */
    static String safeMessage(String reason) {
        if (reason == null || reason.isBlank()) {
            return "CAD conversion failed.";
        }
        String oneLine = reason.replace('\n', ' ').replace('\r', ' ').trim();
        // Never leak server paths to the client.
        oneLine = oneLine.replaceAll("(?i)([A-Za-z]:\\\\|/)[\\w./\\\\-]+", "<path>");
        if (oneLine.length() > 480) {
            oneLine = oneLine.substring(0, 480);
        }
        return oneLine;
    }
}
