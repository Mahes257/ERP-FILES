-- ============================================================
-- Marketing Settings — backend persistence schema
-- ============================================================
-- Marketing → Settings previously lived only in the browser
-- (localStorage key `erp-marketing-settings-v1`), so every change was lost
-- on a new device/browser and no audit trail existed.
--
-- Marketing Settings are now persisted server-side through the existing
-- generic key/value table `app_settings` under the key
-- `marketing_settings`, with every write recorded in a new
-- `settings_audit_log` table.
--
-- This script is additive and idempotent:
--   * widens `app_settings.setting_value` to LONGTEXT (the full marketing
--     configuration blob is far larger than the previous VARCHAR(120));
--   * creates `settings_audit_log` if it does not exist.
-- No existing row is deleted and no unrelated table is touched.
--
-- Apply with:
--   mysql -u <user> -p erp_db < docs/marketing_settings.sql
--
-- The backend maps these tables with spring.jpa.hibernate.ddl-auto=validate,
-- so this script must run BEFORE the application is (re)started.
-- ============================================================

-- 1. Allow the (large) marketing settings JSON blob to be stored.
ALTER TABLE app_settings
    MODIFY setting_value LONGTEXT NULL;

-- 2. Audit trail for application settings changes.
CREATE TABLE IF NOT EXISTS settings_audit_log (
    id             BIGINT       NOT NULL AUTO_INCREMENT,
    setting_key    VARCHAR(60)  NOT NULL,
    section        VARCHAR(60)  NULL,
    field_path     VARCHAR(255) NULL,
    previous_value LONGTEXT     NULL,
    new_value      LONGTEXT     NULL,
    changed_by     VARCHAR(120) NOT NULL,
    changed_at     DATETIME(6)  NOT NULL,
    PRIMARY KEY (id),
    KEY idx_settings_audit_log_key_changed (setting_key, changed_at)
);
