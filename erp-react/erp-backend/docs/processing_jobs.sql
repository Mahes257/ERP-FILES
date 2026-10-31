-- ============================================================================
-- Background processing jobs — schema change (no data migration needed)
-- ============================================================================
-- Heavy, non-interactive work used to run on the HTTP request thread. The Sales
-- Contract bulk upload parsed every uploaded document with PDFBox / Apache POI
-- before it could answer, which held a request worker for the whole batch. That
-- workflow now returns 202 Accepted with a job id and runs on a bounded worker
-- pool; this table is the durable queue and the status the client polls.
--
--   POST /sales-contracts/bulk/extract        -> 202 + jobId  (row = QUEUED)
--   GET  /sales-contracts/bulk/extract/{id}   -> QUEUED | PROCESSING |
--                                                COMPLETED (+results) |
--                                                FAILED (+safe reason)
--
-- The row carries everything the pipeline needs:
--   * job_type        operation, e.g. SALES_CONTRACT_BULK_EXTRACT
--   * input_ref       job-scoped staging directory under app.upload.dir
--   * input_manifest  JSON [{storedName, originalName, size}] of the staged files
--   * fingerprint     SHA-256 of the batch, so an identical re-submission reuses
--                     the existing job instead of parsing the documents twice
--   * status/attempts/max_attempts
--                     QUEUED -> PROCESSING is an atomic conditional UPDATE, so
--                     two workers can never process the same job
--   * requested_by_user_id
--                     status reads are scoped to the submitter (404 otherwise)
--   * created_at / started_at / completed_at
--                     lifecycle timestamps kept by the application
--   * result_payload  JSON results, written on COMPLETED
--   * error_message   safe, single-line failure reason (never a stack trace)
--
-- WHY THIS SCRIPT EXISTS
--   spring.jpa.hibernate.ddl-auto defaults to `validate` in production, so the
--   table below MUST exist before the backend build that contains ProcessingJob
--   starts — otherwise the application fails fast at startup with a
--   missing-table error. This project has no migration framework (schema changes
--   are applied as plain SQL, like docs/attachment_storage_usage.sql and
--   docs/mysql-app-user.sql), so this script IS the migration.
--
-- WHEN TO RUN
--   * once per environment, BEFORE starting the backend build that introduces
--     the processing-job pipeline;
--   * the statement is idempotent (CREATE TABLE IF NOT EXISTS), so re-running it
--     is harmless.
--   Run with the backend stopped so no job can be writing to the table.
--
-- HOW TO RUN (the application user has the required privileges; see
-- docs/mysql-app-user.sql — CREATE, ALTER, INSERT, DELETE, UPDATE):
--   mysql -u erp_app -p erp_db < processing_jobs.sql
--
-- OPERATIONS NOTES
--   * No data backfill: the table starts empty. Jobs interrupted by the
--     deployment are recovered from their own rows; there are none at cutover.
--   * Rolling back the application build does NOT require dropping this table —
--     an unused table is inert, and dropping it would lose any in-flight job.
--   * Finished rows are deleted by the application after
--     app.processing-jobs.retention-hours (default 24), so the table stays small;
--     add `status` to a monitoring query if you want queue depth:
--       SELECT status, COUNT(*) FROM processing_jobs GROUP BY status;
-- ============================================================================

CREATE TABLE IF NOT EXISTS processing_jobs (
    id                   BIGINT       NOT NULL AUTO_INCREMENT,
    job_type             VARCHAR(60)  NOT NULL,
    status               VARCHAR(20)  NOT NULL,
    input_ref            VARCHAR(255) NOT NULL,
    fingerprint          VARCHAR(64)  NOT NULL,
    requested_by_user_id BIGINT       NULL,
    item_count           INT          NOT NULL,
    attempts             INT          NOT NULL,
    max_attempts         INT          NOT NULL,
    input_manifest       TEXT         NULL,
    result_payload       LONGTEXT     NULL,
    error_message        VARCHAR(500) NULL,
    created_at           DATETIME(6)  NULL,
    started_at           DATETIME(6)  NULL,
    completed_at         DATETIME(6)  NULL,
    PRIMARY KEY (id),
    -- Queue drain order and interruption recovery.
    KEY idx_pjob_status_created (status, created_at),
    -- "the same batch submitted again" lookup.
    KEY idx_pjob_type_fingerprint (job_type, fingerprint),
    -- "a PROCESSING row older than the stale timeout" lookup.
    KEY idx_pjob_started (started_at)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4;

-- Verify after running (queue should be empty on a fresh deployment):
-- SELECT status, COUNT(*) AS jobs FROM processing_jobs GROUP BY status;
