-- ============================================================================
-- Scalability hardening — 100-concurrent-user preparation
-- ============================================================================
-- Date: 2026-10-31
--
-- WHAT THIS ADDS
--   1. Optimistic-lock version columns for four document HEADERS that are
--      edited concurrently: purchase orders, quotations, sales contracts,
--      invoices. Every new column is NOT NULL DEFAULT 0, so all existing rows
--      are valid without a backfill and old application versions keep working.
--   2. Indexes for the notification inbox pagination and for the sweep/report
--      candidate queries that replaced full-table scans.
--
-- SAFETY
--   - Additive only. No DROP, TRUNCATE, DELETE or UPDATE of business data.
--   - Applying it to a populated database does not change any stored value.
--   - The default (0) is the correct version for every pre-existing row; the
--     first update increments it.
--   - Run ONCE on an existing database, before deploying the matching build
--     (spring.jpa.hibernate.ddl-auto=validate fails fast if a version column is
--     missing).
--
-- ORDER
--   Apply to staging, start the new build, run the smoke + load test, then
--   apply to production in the same maintenance window as the deployment.
--
-- ROLLBACK
--   The application can be rolled back first; these columns and indexes are
--   simply unused by the older build. Drop them only if you also remove the
--   corresponding feature:
--     ALTER TABLE quotations DROP COLUMN version;
--     ALTER TABLE sales_contracts DROP COLUMN version;
--     ALTER TABLE invoices DROP COLUMN version;
--     ALTER TABLE purchase_orders DROP COLUMN version;
--     DROP INDEX idx_notif_recipient_created ON notifications;
--     ... (one per index below)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Optimistic-lock headers
-- ----------------------------------------------------------------------------
ALTER TABLE quotations       ADD COLUMN version BIGINT NOT NULL DEFAULT 0;
ALTER TABLE sales_contracts   ADD COLUMN version BIGINT NOT NULL DEFAULT 0;
ALTER TABLE invoices          ADD COLUMN version BIGINT NOT NULL DEFAULT 0;
ALTER TABLE purchase_orders   ADD COLUMN version BIGINT NOT NULL DEFAULT 0;

-- ----------------------------------------------------------------------------
-- 2. Notification inbox: one user's newest-first page
-- ----------------------------------------------------------------------------
-- GET /notifications?page=&size= filters by recipient_user_id and orders by
-- created_at. The existing idx_notif_recipient_status cannot serve the sort.
CREATE INDEX idx_notif_recipient_created
    ON notifications (recipient_user_id, created_at);

-- ----------------------------------------------------------------------------
-- 3. Sales notification sweep candidates
-- ----------------------------------------------------------------------------
-- Each sweep now filters CURRENT revisions by workflow status in SQL instead of
-- loading the whole table.
CREATE INDEX idx_quotation_sweep
    ON quotations (latest_revision, status, id);

CREATE INDEX idx_contract_sweep
    ON sales_contracts (latest_revision, status, id);

-- Overdue sweep: CURRENT + due date range + settled-status exclusion.
CREATE INDEX idx_invoice_sweep
    ON invoices (latest_revision, due_date, status);

-- ----------------------------------------------------------------------------
-- 4. Purchase notification sweep candidates
-- ----------------------------------------------------------------------------
-- PO delivery sweep: open statuses with a promised/expected delivery date.
CREATE INDEX idx_po_delivery_sweep
    ON purchase_orders (status, delivery_date, expected_date);

-- RFQ deadline sweep: open statuses with a due date.
CREATE INDEX idx_rfq_due_sweep
    ON purchase_rfqs (status, due_date);

-- ----------------------------------------------------------------------------
-- 5. CPR reports
-- ----------------------------------------------------------------------------
-- Report projection filters status (archived/deleted excluded) and orders by
-- created_at; the correlated "no newer revision" check reads revision_of/id.
CREATE INDEX idx_cpr_report_status_created
    ON cprs (status, created_at);

-- ----------------------------------------------------------------------------
-- VERIFY
-- ----------------------------------------------------------------------------
-- SHOW COLUMNS FROM quotations LIKE 'version';
-- SHOW INDEX FROM notifications WHERE Key_name = 'idx_notif_recipient_created';
-- EXPLAIN SELECT * FROM notifications
--   WHERE recipient_user_id = 1 ORDER BY created_at DESC LIMIT 100;
-- EXPLAIN SELECT id FROM quotations
--   WHERE latest_revision = 1 AND status IN ('submitted') ORDER BY id LIMIT 200;
