package com.vishatech.erp.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.vishatech.erp.config.ErpMetrics;
import com.vishatech.erp.dto.ProcessingJobResponse;
import com.vishatech.erp.entity.ProcessingJob;
import com.vishatech.erp.entity.ProcessingJobStatus;
import com.vishatech.erp.exception.BadRequestException;
import com.vishatech.erp.repository.ProcessingJobRepository;
import com.vishatech.erp.util.AuditContext;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.Executor;
import java.util.concurrent.Semaphore;
import java.util.logging.Level;
import java.util.logging.Logger;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * Durable background-job pipeline: validate → store input → create job → 202 →
 * worker → result.
 *
 * <p>The request thread only creates the QUEUED row and returns; everything
 * heavy happens on the bounded {@code processingJobExecutor} pool. The pipeline
 * is generic — an operation supplies a {@link ProcessingJobHandler} and a job
 * type — and provides for all of them:
 *
 * <ul>
 *   <li><b>No duplicate processing.</b> A job is started only by an atomic
 *       QUEUED → PROCESSING claim ({@link ProcessingJobClaimer}), so racing
 *       workers cannot both run it, and a re-queued job keeps its attempt count.</li>
 *   <li><b>Restart safety.</b> The QUEUED/PROCESSING rows are the queue. A job
 *       left PROCESSING by a killed process is re-queued (or failed once its
 *       retries are spent) by {@code ProcessingJobRecoveryJob}.</li>
 *   <li><b>Bounded concurrency.</b> Dispatch requires a worker permit, so the
 *       pool never queues more work than it can run; surplus submissions stay
 *       QUEUED and drain oldest-first.</li>
 *   <li><b>Bounded memory.</b> Inputs are staged on disk by
 *       {@link ProcessingJobInputStore} and deleted when the job ends; nothing
 *       large is held in heap while a job waits.</li>
 *   <li><b>Safe errors.</b> Only controlled exception types (BadRequest /
 *       IllegalState / NoSuchElement) surface their message to the client, always
 *       truncated and single-line; anything else becomes a generic message with
 *       the detail kept in the server log.</li>
 * </ul>
 */
@Service
public class ProcessingJobService {

    private static final Logger log = Logger.getLogger(ProcessingJobService.class.getName());

    /** Safe error messages fit the {@code error_message} column with room to spare. */
    private static final int MAX_ERROR_CHARS = 480;

    private final ProcessingJobRepository jobs;
    private final ProcessingJobClaimer claimer;
    private final ProcessingJobInputStore inputStore;
    private final AuditContext auditContext;
    private final ObjectMapper mapper;
    private final Executor executor;
    private final Map<String, ProcessingJobHandler> handlers;
    private final ErpMetrics metrics;

    /** One permit per worker thread: dispatch never outruns the pool. */
    private final Semaphore permits;

    private final int dispatchBatchSize;
    private final int maxAttempts;
    private final long staleTimeoutMs;
    private final int retentionHours;

    public ProcessingJobService(ProcessingJobRepository jobs,
                                ProcessingJobClaimer claimer,
                                ProcessingJobInputStore inputStore,
                                AuditContext auditContext,
                                ObjectMapper mapper,
                                @Qualifier("processingJobExecutor") Executor executor,
                                List<ProcessingJobHandler> jobHandlers,
                                ErpMetrics metrics,
                                @Value("${app.processing-jobs.concurrency:2}") int concurrency,
                                @Value("${app.processing-jobs.dispatch-batch-size:10}") int dispatchBatchSize,
                                @Value("${app.processing-jobs.max-attempts:2}") int maxAttempts,
                                @Value("${app.processing-jobs.stale-timeout-ms:600000}") long staleTimeoutMs,
                                @Value("${app.processing-jobs.retention-hours:24}") int retentionHours) {
        this.jobs = jobs;
        this.claimer = claimer;
        this.inputStore = inputStore;
        this.auditContext = auditContext;
        this.mapper = mapper;
        this.executor = executor;
        this.metrics = metrics;
        this.permits = new Semaphore(Math.max(1, concurrency), true);
        this.dispatchBatchSize = Math.max(1, dispatchBatchSize);
        this.maxAttempts = Math.max(1, maxAttempts);
        this.staleTimeoutMs = Math.max(1_000L, staleTimeoutMs);
        this.retentionHours = Math.max(1, retentionHours);

        Map<String, ProcessingJobHandler> byType = new HashMap<>();
        for (ProcessingJobHandler handler : jobHandlers == null ? List.<ProcessingJobHandler>of() : jobHandlers) {
            ProcessingJobHandler previous = byType.put(handler.jobType(), handler);
            if (previous != null) {
                throw new IllegalStateException("Two handlers registered for job type " + handler.jobType()
                        + ": " + previous.getClass().getName() + " and " + handler.getClass().getName());
            }
        }
        this.handlers = Map.copyOf(byType);
    }

    // ------------------------------------------------------------------
    // Submission
    // ------------------------------------------------------------------

    /**
     * Creates the durable QUEUED job for the current user. Called on the request
     * thread, after the inputs have been staged, so the response can carry the
     * job id straight away.
     */
    public ProcessingJob create(String jobType, String inputRef, String fingerprint, String inputManifest,
                                int itemCount) {
        if (!handlers.containsKey(jobType)) {
            throw new IllegalStateException("No handler registered for job type " + jobType);
        }
        ProcessingJob job = new ProcessingJob();
        job.setJobType(jobType);
        job.setStatus(ProcessingJobStatus.QUEUED);
        job.setInputRef(inputRef);
        job.setFingerprint(fingerprint);
        job.setInputManifest(inputManifest);
        job.setItemCount(itemCount);
        job.setMaxAttempts(maxAttempts);
        job.setRequestedByUserId(auditContext.currentUserId());
        return jobs.save(job);
    }

    /**
     * An existing job for the same operation, input fingerprint and owner that
     * still represents that work (queued, running, or already completed).
     * Submit-time dedupe, so a double click or a retried request parses the
     * documents once.
     */
    public Optional<ProcessingJob> findReusable(String jobType, String fingerprint, Long ownerId) {
        List<String> reusable = List.of(ProcessingJobStatus.QUEUED, ProcessingJobStatus.PROCESSING,
                ProcessingJobStatus.COMPLETED);
        if (ownerId == null) {
            // A caller with no resolved user still must not double-parse its batch.
            return jobs.findFirstByJobTypeAndFingerprintAndRequestedByUserIdIsNullAndStatusInOrderByCreatedAtDesc(
                    jobType, fingerprint, reusable);
        }
        return jobs.findFirstByJobTypeAndFingerprintAndRequestedByUserIdAndStatusInOrderByCreatedAtDesc(
                jobType, fingerprint, ownerId, reusable);
    }

    /**
     * Starts the job as soon as the submitting transaction is committed.
     *
     * <p>Dispatching inline would race the commit: the worker could read a row the
     * database has not published yet and leave the job stuck. When no transaction
     * is active (tests, direct calls) the job is dispatched immediately.
     */
    public void dispatchAfterCommit(Long jobId) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    tryDispatch(jobId);
                }
            });
        } else {
            tryDispatch(jobId);
        }
    }

    /** Claim and start one job if a worker is free. False leaves it QUEUED. */
    public boolean tryDispatch(Long jobId) {
        if (!permits.tryAcquire()) {
            return false;
        }
        if (!claimer.claim(jobId)) {
            permits.release();
            return false;
        }
        return submitClaimed(jobId);
    }

    /** Drains the queue while worker permits last. Oldest job first. */
    @Transactional(readOnly = true)
    public int dispatchPending() {
        int started = 0;
        for (Long jobId : jobs.findQueuedIds(PageRequest.of(0, dispatchBatchSize))) {
            if (!permits.tryAcquire()) {
                break;
            }
            if (claimer.claim(jobId)) {
                if (submitClaimed(jobId)) {
                    started++;
                }
            } else {
                permits.release();
            }
        }
        return started;
    }

    private boolean submitClaimed(Long jobId) {
        try {
            executor.execute(() -> runClaimedJob(jobId));
            return true;
        } catch (RuntimeException e) {
            // The pool refused the task (shutdown or saturated). Put the job back in
            // the queue instead of failing it — the next sweep will start it.
            permits.release();
            claimer.requeue(jobId);
            log.warning("Processing job " + jobId + " could not be scheduled (" + e.getClass().getSimpleName()
                    + ") — returned to the queue.");
            return false;
        }
    }

    // ------------------------------------------------------------------
    // Worker
    // ------------------------------------------------------------------

    /** Runs on a worker thread. Never throws: the job row carries the outcome. */
    void runClaimedJob(Long jobId) {
        long startTime = System.currentTimeMillis();
        try {
            ProcessingJob job = jobs.findById(jobId).orElse(null);
            if (job == null) {
                return;
            }
            ProcessingJobHandler handler = handlers.get(job.getJobType());
            if (handler == null) {
                throw new IllegalStateException("No handler registered for job type " + job.getJobType());
            }
            complete(job, handler.process(job));
            metrics.recordJobCompleted(System.currentTimeMillis() - startTime);
        } catch (Exception e) {
            metrics.recordJobFailed(System.currentTimeMillis() - startTime);
            fail(jobId, e);
        } finally {
            permits.release();
            releaseStagedInputs(jobId);
            metrics.updateQueueSize(inFlightJobs());
        }
    }

    private void complete(ProcessingJob job, String payload) {
        job.setStatus(ProcessingJobStatus.COMPLETED);
        job.setResultPayload(payload);
        job.setErrorMessage(null);
        job.setCompletedAt(LocalDateTime.now());
        jobs.save(job);
    }

    private void fail(Long jobId, Throwable error) {
        String message = safeErrorMessage(error);
        if (error instanceof BadRequestException || error instanceof IllegalStateException
                || error instanceof NoSuchElementException) {
            log.warning("Processing job " + jobId + " failed: " + message);
        } else {
            log.log(Level.WARNING, "Processing job " + jobId + " failed: " + message, error);
        }
        jobs.findById(jobId).ifPresent(job -> {
            job.setStatus(ProcessingJobStatus.FAILED);
            job.setErrorMessage(message);
            job.setResultPayload(null);
            job.setCompletedAt(LocalDateTime.now());
            jobs.save(job);
        });
    }

    /** Removes the staged inputs once the job can no longer be processed. */
    private void releaseStagedInputs(Long jobId) {
        try {
            jobs.findById(jobId).ifPresent(job -> {
                if (ProcessingJobStatus.isTerminal(job.getStatus())) {
                    inputStore.deleteInputs(job.getInputRef());
                }
            });
        } catch (RuntimeException e) {
            log.warning("Could not release staged inputs for job " + jobId + ": " + e.getMessage());
        }
    }

    /**
     * Client-facing failure text. Only messages this application wrote itself are
     * passed through (single line, bounded length); anything unexpected becomes a
     * generic message so no internal detail, path or SQL fragment is exposed.
     */
    static String safeErrorMessage(Throwable error) {
        String fallback = "Processing failed unexpectedly — see the server logs for details.";
        if (error == null) {
            return fallback;
        }
        boolean controlled = error instanceof BadRequestException
                || error instanceof IllegalStateException
                || error instanceof NoSuchElementException;
        String message = error.getMessage();
        if (!controlled || message == null || message.isBlank()) {
            return fallback;
        }
        String single = message.replaceAll("\\s+", " ").trim();
        return single.length() > MAX_ERROR_CHARS ? single.substring(0, MAX_ERROR_CHARS) : single;
    }

    // ------------------------------------------------------------------
    // Restart recovery / housekeeping
    // ------------------------------------------------------------------

    /**
     * Re-queues jobs left PROCESSING by a process that died, and fails those that
     * have spent their retries. Called once at startup and on every sweep, so a
     * job interrupted by a restart is picked up without operator action.
     */
    public int recoverInterrupted() {
        LocalDateTime cutoff = LocalDateTime.now().minus(Duration.ofMillis(staleTimeoutMs));
        List<ProcessingJob> stuck = jobs.findByStatusAndStartedAtBefore(ProcessingJobStatus.PROCESSING, cutoff);
        int recovered = 0;
        for (ProcessingJob job : stuck) {
            int allowed = Math.max(1, job.getMaxAttempts());
            if (job.getAttempts() < allowed) {
                if (claimer.requeue(job.getId())) {
                    recovered++;
                    log.info("Re-queued processing job " + job.getId() + " (" + job.getJobType()
                            + ") after an interrupted run.");
                }
            } else {
                fail(job.getId(), new IllegalStateException(
                        "Interrupted by a server restart and out of retries — submit it again."));
            }
        }
        return recovered;
    }

    /**
     * Deletes finished jobs past their retention window and staging directories
     * that no queued/running job owns (a crash between staging inputs and writing
     * the job row, or a job lost to a wiped database).
     */
    public int housekeep() {
        LocalDateTime retentionCutoff = LocalDateTime.now().minusHours(retentionHours);
        List<ProcessingJob> expired = jobs.findByStatusInAndCompletedAtBefore(
                List.of(ProcessingJobStatus.COMPLETED, ProcessingJobStatus.FAILED), retentionCutoff);
        if (!expired.isEmpty()) {
            jobs.deleteAll(expired);
        }
        Set<String> liveRefs = new HashSet<>(jobs
                .findByStatusIn(List.of(ProcessingJobStatus.QUEUED, ProcessingJobStatus.PROCESSING))
                .stream().map(ProcessingJob::getInputRef).collect(Collectors.toSet()));
        int swept = inputStore.sweepOrphans(liveRefs, LocalDateTime.now().minusHours(1));
        return expired.size() + swept;
    }

    // ------------------------------------------------------------------
    // Status
    // ------------------------------------------------------------------

    /**
     * Job status for polling. A job belonging to another user is reported as not
     * found (admins may read any job), so job ids cannot be walked to read
     * somebody else's extracted document contents.
     */
    public ProcessingJobResponse status(Long jobId) {
        ProcessingJob job = jobs.findById(jobId)
                .orElseThrow(() -> new NoSuchElementException("Processing job not found: " + jobId));
        assertVisible(job);

        JsonNode results = null;
        if (ProcessingJobStatus.COMPLETED.equals(job.getStatus()) && job.getResultPayload() != null) {
            try {
                results = mapper.readTree(job.getResultPayload());
            } catch (Exception e) {
                throw new IllegalStateException("The stored result of this job could not be read.");
            }
        }
        return ProcessingJobResponse.of(job, results);
    }

    private void assertVisible(ProcessingJob job) {
        Long owner = job.getRequestedByUserId();
        String role = auditContext.currentUserRole();
        boolean admin = role != null && "ADMIN".equalsIgnoreCase(role);
        if (owner != null && !admin && !owner.equals(auditContext.currentUserId())) {
            throw new NoSuchElementException("Processing job not found: " + job.getId());
        }
    }

    // ------------------------------------------------------------------
    // Observability (used by tests and diagnostics)
    // ------------------------------------------------------------------

    /** Worker permits not currently held — 0 means every worker is busy. */
    public int availableWorkers() {
        return permits.availablePermits();
    }

    /** Queued + running jobs. */
    public long inFlightJobs() {
        return jobs.countByStatus(ProcessingJobStatus.QUEUED)
                + jobs.countByStatus(ProcessingJobStatus.PROCESSING);
    }
}
