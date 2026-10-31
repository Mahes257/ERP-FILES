package com.vishatech.erp.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

/**
 * One server-side CAD conversion job (SLDPRT / SLDASM / SAT -> GLB).
 *
 * <p>This table is the durable queue between the ERP and the ISOLATED CAD
 * worker process:
 *
 * <pre>
 *   POST /models/{modelId}/cad-conversion  -> 202 { jobId, status: QUEUED }
 *   GET  /cad-conversion/{jobId}           -> QUEUED | PROCESSING |
 *                                             COMPLETED (+ previewUrl) |
 *                                             FAILED (+ safe reason) |
 *                                             CANCELLED
 * </pre>
 *
 * <p>Design notes:
 * <ul>
 *   <li><b>Opaque job id.</b> The primary key is a client-generated UUID string,
 *       not an incrementing sequence, so job ids cannot be enumerated.</li>
 *   <li><b>Atomic claim.</b> QUEUED -> PROCESSING is a conditional UPDATE
 *       (see {@link com.vishatech.erp.repository.CadConversionJobRepository}),
 *       so two workers can never process the same job, not even when they read
 *       the same QUEUED row in the same instant.</li>
 *   <li><b>Content identity.</b> {@code sourceHash} is the SHA-256 of the source
 *       file (the model's {@code file_checksum}), so an identical file that is
 *       re-submitted after the preview was produced is served from the existing
 *       GLB instead of being converted again.</li>
 *   <li><b>Isolation.</b> The worker never receives a user file name: it stages
 *       the job under {@code /tmp/cad-jobs/{jobId}/input|output|metadata}.</li>
 *   <li><b>Honesty.</b> {@code errorMessage} is a single-line, user-safe reason —
 *       never a stack trace, command line, or server path.</li>
 * </ul>
 *
 * <p>Production runs with {@code ddl-auto=validate}, so
 * {@code docs/cad_conversion.sql} must be applied before a build containing this
 * entity starts.
 */
@Entity
@Table(name = "cad_conversion_jobs", indexes = {
        @Index(name = "idx_cjob_status_created", columnList = "status, createdAt"),
        @Index(name = "idx_cjob_model_created", columnList = "modelId, createdAt"),
        @Index(name = "idx_cjob_source_hash", columnList = "sourceHash"),
        @Index(name = "idx_cjob_started", columnList = "startedAt")
})
public class CadConversionJob {

    /** Opaque, non-enumerable job id (UUID string). */
    @Id
    @Column(name = "id", length = 36, nullable = false)
    private String id;

    @Column(name = "model_id", nullable = false)
    private Long modelId;

    /** One of the {@link CadConversionJobStatus} constants. */
    @Column(name = "status", length = 20, nullable = false)
    private String status = CadConversionJobStatus.QUEUED;

    /** Normalised source extension: sldprt | sldasm | sat. */
    @Column(name = "file_type", length = 20, nullable = false)
    private String fileType;

    /** SHA-256 of the source file (model.file_checksum) — the cache identity. */
    @Column(name = "source_hash", length = 64)
    private String sourceHash;

    /** Engine that ran (or will run) the job, e.g. {@code freecad}. */
    @Column(name = "engine", length = 40)
    private String engine;

    /** True when the job was answered from an existing valid GLB (no run). */
    @Column(name = "cache_hit", nullable = false)
    private boolean cacheHit;

    /** Who submitted the job (audit only; access is authorised by authority). */
    @Column(name = "requested_by", length = 255)
    private String requestedBy;

    /** How many times a worker has claimed this job. */
    @Column(name = "attempts", nullable = false)
    private int attempts;

    /**
     * Re-queue budget for jobs interrupted by a worker restart. A conversion
     * that genuinely FAILED is terminal and is never retried automatically.
     */
    @Column(name = "max_attempts", nullable = false)
    private int maxAttempts = 2;

    /** Safe, single-line failure reason. Never a stack trace or server path. */
    @Column(name = "error_message", length = 500)
    private String errorMessage;

    /** Where the validated GLB lives (server-side path; never sent to clients). */
    @Column(name = "output_path", length = 500)
    private String outputPath;

    @Column(name = "worker_id", length = 64)
    private String workerId;

    @Column(name = "created_at")
    private LocalDateTime createdAt;

    @Column(name = "started_at")
    private LocalDateTime startedAt;

    @Column(name = "completed_at")
    private LocalDateTime completedAt;

    @PrePersist
    void onCreate() {
        if (createdAt == null) {
            createdAt = LocalDateTime.now();
        }
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public Long getModelId() { return modelId; }
    public void setModelId(Long modelId) { this.modelId = modelId; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public String getFileType() { return fileType; }
    public void setFileType(String fileType) { this.fileType = fileType; }

    public String getSourceHash() { return sourceHash; }
    public void setSourceHash(String sourceHash) { this.sourceHash = sourceHash; }

    public String getEngine() { return engine; }
    public void setEngine(String engine) { this.engine = engine; }

    public boolean isCacheHit() { return cacheHit; }
    public void setCacheHit(boolean cacheHit) { this.cacheHit = cacheHit; }

    public String getRequestedBy() { return requestedBy; }
    public void setRequestedBy(String requestedBy) { this.requestedBy = requestedBy; }

    public int getAttempts() { return attempts; }
    public void setAttempts(int attempts) { this.attempts = attempts; }

    public int getMaxAttempts() { return maxAttempts; }
    public void setMaxAttempts(int maxAttempts) { this.maxAttempts = maxAttempts; }

    public String getErrorMessage() { return errorMessage; }
    public void setErrorMessage(String errorMessage) { this.errorMessage = errorMessage; }

    public String getOutputPath() { return outputPath; }
    public void setOutputPath(String outputPath) { this.outputPath = outputPath; }

    public String getWorkerId() { return workerId; }
    public void setWorkerId(String workerId) { this.workerId = workerId; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    public LocalDateTime getStartedAt() { return startedAt; }
    public void setStartedAt(LocalDateTime startedAt) { this.startedAt = startedAt; }

    public LocalDateTime getCompletedAt() { return completedAt; }
    public void setCompletedAt(LocalDateTime completedAt) { this.completedAt = completedAt; }
}
