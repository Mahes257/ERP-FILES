-- ============================================================================
-- Shared attachment storage ledger — schema change + one-time seed
-- ============================================================================
-- The project-wide 4 GB attachment pool ("all attachment modules share one
-- capacity") used to be measured on every upload with eight
--     SELECT COALESCE(SUM(size), 0) FROM <attachment table>
-- statements — eight full-table aggregates per upload, on the request path.
--
-- The pool total is now MAINTAINED in the single-row table created here:
--   * the backend applies every attachment insert/delete to it with an atomic
--     UPDATE ... SET total_bytes = total_bytes + ? inside the same transaction
--     as the attachment row, so an upload checks the 4 GB limit with ONE
--     primary-key lookup and a rollback restores the total;
--   * AttachmentStorageReconciliationJob verifies it (one statement) at startup
--     and daily, and repairs it if a row was ever written straight into MySQL.
--
-- WHY THIS SCRIPT EXISTS
--   spring.jpa.hibernate.ddl-auto defaults to `validate` in production, so the
--   table below MUST exist before the new backend build starts — otherwise the
--   application fails fast at startup with a missing-table error. This project
--   has no migration framework (schema changes are applied as plain SQL, like
--   docs/mysql-app-user.sql and docs/backfill_route_colors.sql), so this script
--   IS the migration.
--
-- WHEN TO RUN
--   * once per environment, BEFORE starting the backend build that contains
--     AttachmentStorageUsage / AttachmentStorageService changes;
--   * again at any time to force a re-sync of the recorded total with the
--     attachment tables (the backend keeps working during the re-sync — an
--     upload in flight either uses the recomputed total or re-seeds the row).
--   Run with the backend stopped so the seed cannot race an upload; both
--   statements are safe to repeat.
--
-- HOW TO RUN (the application user has the required privileges; see
-- docs/mysql-app-user.sql — CREATE, ALTER, INSERT, DELETE, UPDATE):
--   mysql -u erp_app -p erp_db < attachment_storage_usage.sql
-- ============================================================================

-- 1) The ledger table: exactly one row (id = 1) holding the pool total.
--    Column types match the AttachmentStorageUsage entity so Hibernate's
--    schema validation passes.
CREATE TABLE IF NOT EXISTS attachment_storage_usage (
    id          BIGINT      NOT NULL,
    total_bytes BIGINT      NOT NULL,
    updated_at  DATETIME(6) NOT NULL,
    PRIMARY KEY (id)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4;

-- 2) Seed (or re-sync) the single row with the TRUE total across every
--    attachment table — the same set of tables the backend sums when it
--    reconciles. REPLACE keeps it to one statement, so the row is never
--    momentarily absent.
REPLACE INTO attachment_storage_usage (id, total_bytes, updated_at)
SELECT 1,
       COALESCE(SUM(total), 0),
       CURRENT_TIMESTAMP(6)
FROM (
           SELECT COALESCE(SUM(size), 0) AS total FROM sales_attachments
    UNION ALL SELECT COALESCE(SUM(size), 0) FROM lead_attachments
    UNION ALL SELECT COALESCE(SUM(size), 0) FROM cpr_attachments
    UNION ALL SELECT COALESCE(SUM(size), 0) FROM customer_attachments
    UNION ALL SELECT COALESCE(SUM(size), 0) FROM followup_attachments
    UNION ALL SELECT COALESCE(SUM(size), 0) FROM qform_attachments
    UNION ALL SELECT COALESCE(SUM(size), 0) FROM marketing_expense_attachments
    UNION ALL SELECT COALESCE(SUM(size), 0) FROM purchase_attachments
) pool_totals;

-- 3) Verify: `recorded` must equal `actual` (drift 0) right after running this.
-- SELECT u.total_bytes AS recorded,
--        (SELECT COALESCE(SUM(total), 0)
--           FROM (SELECT COALESCE(SUM(size), 0) AS total FROM sales_attachments
--                 UNION ALL SELECT COALESCE(SUM(size), 0) FROM lead_attachments
--                 UNION ALL SELECT COALESCE(SUM(size), 0) FROM cpr_attachments
--                 UNION ALL SELECT COALESCE(SUM(size), 0) FROM customer_attachments
--                 UNION ALL SELECT COALESCE(SUM(size), 0) FROM followup_attachments
--                 UNION ALL SELECT COALESCE(SUM(size), 0) FROM qform_attachments
--                 UNION ALL SELECT COALESCE(SUM(size), 0) FROM marketing_expense_attachments
--                 UNION ALL SELECT COALESCE(SUM(size), 0) FROM purchase_attachments) pool_totals) AS actual,
--        u.total_bytes - (SELECT COALESCE(SUM(total), 0)
--           FROM (SELECT COALESCE(SUM(size), 0) AS total FROM sales_attachments
--                 UNION ALL SELECT COALESCE(SUM(size), 0) FROM lead_attachments
--                 UNION ALL SELECT COALESCE(SUM(size), 0) FROM cpr_attachments
--                 UNION ALL SELECT COALESCE(SUM(size), 0) FROM customer_attachments
--                 UNION ALL SELECT COALESCE(SUM(size), 0) FROM followup_attachments
--                 UNION ALL SELECT COALESCE(SUM(size), 0) FROM qform_attachments
--                 UNION ALL SELECT COALESCE(SUM(size), 0) FROM marketing_expense_attachments
--                 UNION ALL SELECT COALESCE(SUM(size), 0) FROM purchase_attachments) pool_totals) AS drift
-- FROM attachment_storage_usage u WHERE u.id = 1;
