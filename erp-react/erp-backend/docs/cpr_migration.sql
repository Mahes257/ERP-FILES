-- ============================================================
-- CPR module — schema additions
-- ============================================================
-- The migrated CPR implementation (from the SOURCE project) adds:
--   * cprs               — CRM client link, Admin float destination + audit,
--                          Save-Draft flag, custom item-column config;
--   * cpr_items          — per-row custom column values;
--   * cpr_technical_verifications — Purchase-Requisition forwarding state;
--   * cost_workouts / cost_workout_items / profit_workouts — Save-Draft flag
--                          and custom column config;
--   * pr_references      — the directly-created Reference PR No catalog used
--                          by CPR floating and the Quotation form;
--   * cpr_items           — TEXT widening of the free-text item columns.
--
-- This script is additive and idempotent in intent. No existing table or row
-- is dropped, reset or truncated, and no Purchase table is modified.
--
-- Apply with:
--   mysql -u <user> -p erp_db < docs/cpr_migration.sql
--
-- The backend maps these tables with spring.jpa.hibernate.ddl-auto=validate,
-- so this script must run BEFORE the application is (re)started. On MySQL 8
-- "ADD COLUMN" has no IF NOT EXISTS — re-running after a successful apply will
-- report "Duplicate column name", which is safe to ignore.
-- ============================================================

-- 1. cprs — client link, float destination, save-draft, item columns.
ALTER TABLE cprs
    ADD COLUMN client_id          BIGINT       NULL,
    ADD COLUMN float_destination  VARCHAR(20)  NULL,
    ADD COLUMN floated_at         DATETIME(6)  NULL,
    ADD COLUMN floated_by         VARCHAR(255) NULL,
    ADD COLUMN floated_pr_no      VARCHAR(60)  NULL,
    ADD COLUMN draft_only         BIT          NOT NULL DEFAULT b'0',
    ADD COLUMN item_columns_json  TEXT         NULL;

-- 2. cpr_items — per-row custom column values (JSON object).
ALTER TABLE cpr_items
    ADD COLUMN custom_fields_json TEXT NULL;

-- 2b. cpr_items — the long free-text item columns must be TEXT. They shipped
--     as VARCHAR(255) in the base schema, but CprItem maps specification and
--     remarks as TEXT, which fails spring.jpa.hibernate.ddl-auto=validate.
ALTER TABLE cpr_items
    MODIFY COLUMN specification TEXT NULL,
    MODIFY COLUMN remarks      TEXT NULL;

-- 3. cpr_technical_verifications — Purchase-Requisition forwarding state.
ALTER TABLE cpr_technical_verifications
    ADD COLUMN forwarded_to_purchase_requisition BIT          NOT NULL DEFAULT b'0',
    ADD COLUMN forwarded_to_pr_at                DATETIME(6)  NULL,
    ADD COLUMN forwarded_to_pr_by                VARCHAR(255) NULL,
    ADD COLUMN purchase_requisition_id           BIGINT       NULL,
    ADD COLUMN purchase_requisition_pr_no        VARCHAR(255) NULL;

-- 3b. cpr_technical_verifications — the status column must also accept the
--     Purchase-Requisition forwarding state. The base schema shipped
--     status as ENUM('APPROVED','DRAFT','FORWARDED_TO_COST_WORKOUT',
--     'PENDING_FILE','REJECTED','UNDER_VERIFICATION','VERIFICATION_COMPLETED')
--     while TechnicalVerificationStatus (and the TV page's status badge) also
--     define FORWARDED_TO_PURCHASE_REQUISITION. Converting a CPR item to a
--     Purchase Requisition therefore failed with
--     "Data truncated for column 'status'" (HTTP 500) after the PR had already
--     been created. The new member is APPENDED so every stored value keeps its
--     index — the widening is additive, nothing is dropped or rewritten.
ALTER TABLE cpr_technical_verifications
    MODIFY COLUMN status ENUM('APPROVED','DRAFT','FORWARDED_TO_COST_WORKOUT',
                              'PENDING_FILE','REJECTED','UNDER_VERIFICATION',
                              'VERIFICATION_COMPLETED',
                              'FORWARDED_TO_PURCHASE_REQUISITION')
                   NOT NULL;

-- 4. Cost / Profit Workout — save-draft flag and custom column config.
ALTER TABLE cost_workouts
    ADD COLUMN draft_only        BIT  NOT NULL DEFAULT b'0',
    ADD COLUMN item_columns_json TEXT NULL;

ALTER TABLE cost_workout_items
    ADD COLUMN custom_fields_json TEXT NULL;

ALTER TABLE profit_workouts
    ADD COLUMN draft_only BIT NOT NULL DEFAULT b'0';

-- 5. pr_references — directly-created Reference PR No catalog.
CREATE TABLE IF NOT EXISTS pr_references (
    id              BIGINT       NOT NULL AUTO_INCREMENT,
    reference_pr_no VARCHAR(60)  NOT NULL,
    source          VARCHAR(20)  NOT NULL,
    cpr_id          BIGINT       NULL,
    cpr_no          VARCHAR(40)  NULL,
    client_id       BIGINT       NULL,
    client_name     VARCHAR(255) NULL,
    project         VARCHAR(255) NULL,
    description     TEXT         NULL,
    requested_by    VARCHAR(255) NULL,
    pr_date         DATE         NULL,
    remarks         TEXT         NULL,
    created_by      VARCHAR(255) NULL,
    created_at      DATETIME(6)  NULL,
    updated_at      DATETIME(6)  NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_pr_references_reference_pr_no (reference_pr_no),
    KEY idx_pr_references_cpr (cpr_id)
);

-- 6. grid_configs — persisted "Manage Columns" configuration for the CPR /
-- Cost Workout / Profit Workout item and list grids (shared grid-config API,
-- GET/PUT/DELETE /settings/grid-configs/{key}).
CREATE TABLE IF NOT EXISTS grid_configs (
    id          BIGINT       NOT NULL AUTO_INCREMENT,
    grid_key    VARCHAR(150) NOT NULL,
    config_json LONGTEXT     NULL,
    created_at  DATETIME(6)  NULL,
    updated_at  DATETIME(6)  NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_grid_configs_grid_key (grid_key)
);
