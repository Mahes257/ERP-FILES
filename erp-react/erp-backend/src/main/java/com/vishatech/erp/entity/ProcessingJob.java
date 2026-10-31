package com.vishatech.erp.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import java.time.LocalDateTime;

/**
 * Durable record of one background processing job.
 *
 * <p>Heavy, non-interactive work (document parsing, conversions) is never run on
 * the HTTP request thread: the request validates its input, stores it, creates a
 * row here and returns {@code 202 Accepted} with the job id. A bounded worker
 * pool picks the job up, and the client polls the job for its status and result.
 * The row is the single source of truth for that hand-off, which is what makes
 * the hand-off survive an application restart.
 *
 * <p>States are the {@link ProcessingJobStatus} constants. Every state change is
 * an atomic conditional UPDATE (see
 * {@link com.vishatech.erp.repository.ProcessingJobRepository#claim}), so a job
 * can never be processed twice, not even when two workers read the same QUEUED
 * row at the same moment.
 *
 * <p>Inputs live on disk (never in this table and never held in JVM heap while
 * queued): {@code inputRef} is the job-scoped directory under the configured
 * upload root and {@code inputManifest} lists the stored files. Both are deleted
 * once the job reaches a terminal state.
 *
 * <p>Hibernate owns this schema; production runs with
 * {@code ddl-auto=validate}, so {@code docs/processing_jobs.sql} must be applied
 * before a build containing this entity starts.
 */
@Entity
@Table(name = "processing_jobs", indexes = {
        @Index(name = "idx_pjob_status_created", columnList = "status, createdAt"),
        @Index(name = "idx_pjob_type_fingerprint", columnList = "jobType, fingerprint"),
        @Index(name = "idx_pjob_started", columnList = "startedAt")
})
public class ProcessingJob {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Operation type, e.g. {@code SALES_CONTRACT_BULK_EXTRACT}. */
    @Column(name = "job_type", nullable = false, length = 60)
    private String jobType;

    /** One of the {@link ProcessingJobStatus} constants. */
    @Column(name = "status", nullable = false, length = 20)
    private String status = ProcessingJobStatus.QUEUED;

    /** Job-scoped input directory, relative to the configured upload root. */
    @Column(name = "input_ref", nullable = false, length = 255)
    private String inputRef;

    /**
     * Content fingerprint of the submitted inputs (see
     * {@code SalesContractBulkExtractionService}). Same operation + same
     * fingerprint while one is in flight means "the same submission" — the
     * existing job is reused instead of parsing the documents twice.
     */
    @Column(name = "fingerprint", nullable = false, length = 64)
    private String fingerprint;

    /** User who submitted the job (used to scope status reads). */
    @Column(name = "requested_by_user_id")
    private Long requestedByUserId;

    /** Number of input items (uploaded documents) in this job. */
    @Column(name = "item_count", nullable = false)
    private int itemCount;

    /** How many times a worker has claimed this job. */
    @Column(name = "attempts", nullable = false)
    private int attempts;

    /** Retries allowed before the job is failed instead of re-queued. */
    @Column(name = "max_attempts", nullable = false)
    private int maxAttempts = 2;

    /** JSON manifest of the stored input files: {@code [{storedName, originalName, size}]}. */
    @Column(name = "input_manifest", columnDefinition = "TEXT")
    private String inputManifest;

    /** JSON result payload, written when the job completes. */
    @Column(name = "result_payload", columnDefinition = "LONGTEXT")
    private String resultPayload;

    /** Safe, user-facing failure reason (never a stack trace). */
    @Column(name = "error_message", length = 500)
    private String errorMessage;

    private LocalDateTime createdAt;
    private LocalDateTime startedAt;
    private LocalDateTime completedAt;

    @PrePersist
    void onCreate() {
        if (createdAt == null) {
            createdAt = LocalDateTime.now();
        }
    }

    // --- Getters & Setters ---

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getJobType() { return jobType; }
    public void setJobType(String jobType) { this.jobType = jobType; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public String getInputRef() { return inputRef; }
    public void setInputRef(String inputRef) { this.inputRef = inputRef; }

    public String getFingerprint() { return fingerprint; }
    public void setFingerprint(String fingerprint) { this.fingerprint = fingerprint; }

    public Long getRequestedByUserId() { return requestedByUserId; }
    public void setRequestedByUserId(Long requestedByUserId) { this.requestedByUserId = requestedByUserId; }

    public int getItemCount() { return itemCount; }
    public void setItemCount(int itemCount) { this.itemCount = itemCount; }

    public int getAttempts() { return attempts; }
    public void setAttempts(int attempts) { this.attempts = attempts; }

    public int getMaxAttempts() { return maxAttempts; }
    public void setMaxAttempts(int maxAttempts) { this.maxAttempts = maxAttempts; }

    public String getInputManifest() { return inputManifest; }
    public void setInputManifest(String inputManifest) { this.inputManifest = inputManifest; }

    public String getResultPayload() { return resultPayload; }
    public void setResultPayload(String resultPayload) { this.resultPayload = resultPayload; }

    public String getErrorMessage() { return errorMessage; }
    public void setErrorMessage(String errorMessage) { this.errorMessage = errorMessage; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    public LocalDateTime getStartedAt() { return startedAt; }
    public void setStartedAt(LocalDateTime startedAt) { this.startedAt = startedAt; }

    public LocalDateTime getCompletedAt() { return completedAt; }
    public void setCompletedAt(LocalDateTime completedAt) { this.completedAt = completedAt; }
}
