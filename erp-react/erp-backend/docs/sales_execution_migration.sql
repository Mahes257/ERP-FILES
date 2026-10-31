-- ============================================================
-- Sales Execution module — schema additions
-- ============================================================
-- The migrated Sales Execution implementation (from the SOURCE project) adds:
--   * sales_order_e_actions — one row per E-Action / Participation of a
--                             Customer Purchase Order (CPO), plus its per-row
--                             user-defined column values;
--   * quotation_remarks     — one row per Quotation Overview remark, so each
--                             remark keeps its own author and timestamp;
--   * quotations            — Reference PR No link (Direct PR Reference or
--                             CPR-carried) used by the Quotation form;
--   * quotation_items       — per-row custom grid column values and additional
--                             description detail rows, and TEXT widening for
--                             the long free-text item columns;
--   * followups             — nullable quotation link for quotation-scoped
--                             follow-ups shown in the Quotation list;
--   * sales_attachments     — the uploader of each attachment;
--   * sales_orders          — the E-Action free-text columns;
--   * sales_order_items     — per-row custom grid column values plus TEXT
--                             widening of the long free-text item columns.
--
-- pr_references and grid_configs are created by docs/cpr_migration.sql.
--
-- This script is additive and idempotent in intent. No existing table or row is
-- dropped, reset or truncated, and no other module's table is modified.
--
-- Apply with:
--   mysql -u <user> -p erp_db < docs/sales_execution_migration.sql
--
-- The backend maps these tables with spring.jpa.hibernate.ddl-auto=validate,
-- so this script must run BEFORE the application is (re)started. On MySQL 8
-- "ADD COLUMN"/"MODIFY COLUMN" have no IF NOT EXISTS — re-running after a
-- successful apply may report "Duplicate column name", which is safe to ignore.
-- ============================================================

-- 1. Customer Purchase Order E-Actions / Participation rows.
CREATE TABLE IF NOT EXISTS sales_order_e_actions (
    id                     BIGINT       NOT NULL AUTO_INCREMENT,
    sales_order_id         BIGINT       NOT NULL,
    participant_team       VARCHAR(255) NULL,
    assigned_action        VARCHAR(500) NULL,
    assigned_to            VARCHAR(255) NULL,
    status                 VARCHAR(255) NULL,
    requested_on           DATETIME(6)  NULL,
    started_on             DATETIME(6)  NULL,
    completed_on           DATETIME(6)  NULL,
    result                 TEXT         NULL,
    remarks                TEXT         NULL,
    custom_fields_json     TEXT         NULL,
    created_at             DATETIME(6)  NULL,
    PRIMARY KEY (id),
    KEY idx_so_e_actions_sales_order (sales_order_id),
    CONSTRAINT fk_so_e_actions_sales_order
        FOREIGN KEY (sales_order_id) REFERENCES sales_orders (id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

-- 2. Quotation Overview remarks (own table; the quotation's free-text
--    `remarks` column keeps its existing meaning and is untouched).
CREATE TABLE IF NOT EXISTS quotation_remarks (
    id            BIGINT       NOT NULL AUTO_INCREMENT,
    quotation_id  BIGINT       NOT NULL,
    text          TEXT         NOT NULL,
    added_by      VARCHAR(255) NULL,
    created_at    DATETIME(6)  NULL,
    PRIMARY KEY (id),
    KEY idx_quotation_remarks_quotation (quotation_id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

-- 3. quotations — Reference PR No link (optional; blank clears the link).
ALTER TABLE quotations
    ADD COLUMN reference_pr_no     VARCHAR(255) NULL,
    ADD COLUMN cpr_id              BIGINT       NULL,
    ADD COLUMN pr_reference_id     BIGINT       NULL,
    ADD COLUMN reference_pr_source VARCHAR(20)  NULL;

-- 4. quotation_items — custom grid column values, extra description rows and
--    TEXT widening for the long free-text item columns.
ALTER TABLE quotation_items
    ADD COLUMN description_rows_json TEXT NULL,
    ADD COLUMN custom_fields_json    TEXT NULL,
    MODIFY COLUMN description        TEXT NULL,
    MODIFY COLUMN material           TEXT NULL;

-- 5. followups — nullable quotation link for quotation-scoped follow-ups.
ALTER TABLE followups
    ADD COLUMN quotation_id BIGINT NULL;

-- 6. sales_attachments — who uploaded the file.
ALTER TABLE sales_attachments
    ADD COLUMN uploaded_by VARCHAR(120) NULL;

-- 7. sales_order_items — the CPO item grid keeps long free-text columns and
--    per-row custom grid values. They shipped as VARCHAR(255) with no custom
--    value column, but SalesOrderItem maps all three as TEXT.
ALTER TABLE sales_order_items
    ADD COLUMN custom_fields_json TEXT NULL,
    MODIFY COLUMN description     TEXT NULL,
    MODIFY COLUMN material        TEXT NULL;

-- 8. sales_orders — CPO release / E-Action header fields. SalesOrder maps the
--    two free-text columns as TEXT and the rest follow the entity's declared
--    lengths (they shipped as VARCHAR with no columns at all here).
ALTER TABLE sales_orders
    ADD COLUMN release_method         VARCHAR(60)  NULL,
    ADD COLUMN release_required       VARCHAR(10)  NULL,
    ADD COLUMN action_type            VARCHAR(60)  NULL,
    ADD COLUMN release_date           DATETIME(6)  NULL,
    ADD COLUMN release_to_department  VARCHAR(160) NULL,
    ADD COLUMN participation_required VARCHAR(10)  NULL,
    ADD COLUMN assigned_to            VARCHAR(160) NULL,
    ADD COLUMN department_team        VARCHAR(160) NULL,
    ADD COLUMN action_deadline        DATETIME(6)  NULL,
    ADD COLUMN action_instructions    TEXT         NULL,
    ADD COLUMN action_remarks         TEXT         NULL;

-- 9. sales_order_e_actions — the CPO an E-Action belongs to is now OPTIONAL.
--    An E-Action may be raised against a CPO reference the user typed when the
--    order is not one of the CPO records stored here:
--      * sales_order_id becomes nullable, so a row can exist without a CPO
--        row behind it (the FK stays exactly as it is and still guards every
--        row that DOES have one — MySQL FKs accept NULL by design);
--      * cpo_reference holds the typed reference as free text. It is display
--        data only: nothing is created and no CPO row/relation is invented, so
--        an E-Action can be stored, listed, searched and edited for an order
--        the system has no CPO record for.
--    Exactly one of the two is set on any given row. No existing row is
--    touched: every CPO-linked E-Action keeps its sales_order_id (and gets a
--    NULL reference), so existing records and their CPO pages are unchanged.
ALTER TABLE sales_order_e_actions
    MODIFY COLUMN sales_order_id BIGINT NULL,
    ADD COLUMN cpo_reference VARCHAR(255) NULL AFTER sales_order_id;
