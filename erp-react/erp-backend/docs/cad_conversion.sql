-- ============================================================================
-- CAD conversion job queue — schema change (no data migration needed)
-- ============================================================================
-- SLDPRT / SLDASM / SAT previews are produced by an ISOLATED CAD worker
-- process, not inside the Spring Boot request thread. This script creates the
-- durable queue between them plus the worker's liveness row:
--
--   POST /v1/models/{modelId}/cad-conversion   -> 202 { jobId, status: QUEUED }
--   GET  /v1/cad-conversion/{jobId}            -> QUEUED | PROCESSING |
--                                                  COMPLETED (+ previewUrl) |
--                                                  FAILED (+ safe message) |
--                                                  CANCELLED
--   GET  /v1/cad-conversion/health             -> worker availability
--
-- The row carries everything the worker needs:
--   * id             opaque UUID string (never an enumerable sequence)
--   * model_id       the ERP model the job belongs to
--   * status         QUEUED -> PROCESSING is an ATOMIC conditional UPDATE, so
--                    two workers can never process the same job
--   * source_hash    SHA-256 of the source file (models.file_checksum); the
--                    same content is never converted twice
--   * engine         which conversion engine ran/will run the job
--   * attempts / max_attempts
--                    re-queue budget for jobs interrupted by a worker restart
--   * output_path    server-side path of the validated GLB (never sent to
--                    clients — the preview is served through /models/{id}/3d)
--   * error_message  safe, single-line reason (never a stack trace or path)
--   * created_at / started_at / completed_at   lifecycle timestamps
--
-- The model's OWN conversion projection (models.conversion_status,
-- converted_file_path, conversion_error, conversion_started_at,
-- conversion_completed_at) is reused unchanged — no model columns are added.
--
-- WHY THIS SCRIPT EXISTS
--   spring.jpa.hibernate.ddl-auto defaults to `validate` in production, so both
--   tables MUST exist before the backend build that contains these entities
--   starts. This project has no migration framework (schema changes are plain
--   SQL, like docs/processing_jobs.sql), so this script IS the migration.
--
-- WHEN TO RUN
--   * once per environment, BEFORE starting a backend build that contains the
--     CAD job pipeline; the statements are idempotent (IF NOT EXISTS).
--   Run with the backend stopped so no job can be writing to the tables.
--
-- HOW TO RUN
--   mysql -u erp_app -p erp_db < cad_conversion.sql
--
-- OPERATIONS NOTES
--   * No backfill: both tables start empty; there is nothing to migrate.
--   * Finished job rows are deleted by the worker after
--     app.cad.worker.job-retention-days (default 30).
--   * Heartbeat rows are one per worker id (upserted every poll), so they do
--     not grow. A worker silent longer than app.cad.worker.heartbeat-stale-seconds
--     is reported offline by GET /v1/cad-conversion/health.
--   * Rolling back the application build does not require dropping these
--     tables — an unused table is inert.
--   * Queue depth at a glance:
--       SELECT status, COUNT(*) FROM cad_conversion_jobs GROUP BY status;
-- ============================================================================

CREATE TABLE IF NOT EXISTS cad_conversion_jobs (
    id             VARCHAR(36)  NOT NULL,
    model_id       BIGINT       NOT NULL,
    status         VARCHAR(20)  NOT NULL,
    file_type      VARCHAR(20)  NOT NULL,
    source_hash    VARCHAR(64)  NULL,
    engine         VARCHAR(40)  NULL,
    cache_hit      BOOLEAN      NOT NULL DEFAULT FALSE,
    requested_by   VARCHAR(255) NULL,
    attempts       INT          NOT NULL,
    max_attempts   INT          NOT NULL,
    error_message  VARCHAR(500) NULL,
    output_path    VARCHAR(500) NULL,
    worker_id      VARCHAR(64)  NULL,
    created_at     DATETIME(6)  NULL,
    started_at     DATETIME(6)  NULL,
    completed_at   DATETIME(6)  NULL,
    PRIMARY KEY (id),
    -- Queue drain order and interruption recovery.
    KEY idx_cjob_status_created (status, created_at),
    -- "what is the latest job for this model" (viewer resume / duplicate guard).
    KEY idx_cjob_model_created (model_id, created_at),
    -- "has this exact content already been converted" (cache reuse).
    KEY idx_cjob_source_hash (source_hash),
    -- "a PROCESSING row older than the stale timeout" lookup.
    KEY idx_cjob_started (started_at)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4;

CREATE TABLE IF NOT EXISTS cad_worker_heartbeat (
    id          VARCHAR(64) NOT NULL,          -- worker id (hostname by default)
    status      VARCHAR(20) NULL,              -- RUNNING | STOPPED
    active_jobs INT         NULL,
    max_jobs    INT         NULL,
    engine      VARCHAR(40) NULL,
    updated_at  DATETIME(6) NULL,
    PRIMARY KEY (id)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4;

-- Verify after running:
--   SELECT status, COUNT(*) AS jobs FROM cad_conversion_jobs GROUP BY status;
--   SELECT id, status, updated_at FROM cad_worker_heartbeat;
