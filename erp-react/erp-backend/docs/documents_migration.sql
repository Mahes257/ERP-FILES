-- ============================================================================
-- Documents module migration
-- ============================================================================
-- Adds the persistent document lifecycle audit trail. Everything else the
-- migrated Sources implementation needs already exists in the target schema
-- (document_repository, document_versions, cpr_technical_verification_documents,
-- app_settings, settings_audit_log), so no other table is created or altered.
--
-- Safety: idempotent, additive only. No DROP / TRUNCATE / DELETE anywhere.
-- Apply once before restarting the backend (spring.jpa.hibernate.ddl-auto=validate).
-- ============================================================================

CREATE TABLE IF NOT EXISTS document_audit (
    id              BIGINT       NOT NULL AUTO_INCREMENT,
    document_id     BIGINT       NOT NULL,
    version_id      BIGINT       NULL,
    action          VARCHAR(40)  NOT NULL,
    user_id         BIGINT       NULL,
    user_name       VARCHAR(255) NULL,
    source_module   VARCHAR(100) NULL,
    source_record_id BIGINT      NULL,
    record_number   VARCHAR(100) NULL,
    previous_state  TEXT         NULL,
    new_state       TEXT         NULL,
    ip_address      VARCHAR(64)  NULL,
    device_info     TEXT         NULL,
    timestamp       DATETIME(6)  NULL,
    PRIMARY KEY (id),
    KEY idx_doc_audit_document  (document_id),
    KEY idx_doc_audit_action    (action),
    KEY idx_doc_audit_timestamp (timestamp)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

-- ----------------------------------------------------------------------------
-- Visibility values
-- ----------------------------------------------------------------------------
-- document_repository.visibility / cpr_technical_verification_documents.visibility
-- are VARCHAR(20) and the new values (ADMIN_ONLY, SALES_TEAM_ONLY,
-- ACCOUNTS_TEAM_ONLY, PURCHASE_TEAM_ONLY) all fit, so no column change is needed.
--
-- NOTE: SOURCE resolves SALES_TEAM_ONLY / ACCOUNTS_TEAM_ONLY /
-- PURCHASE_TEAM_ONLY against a `users.team` attribute which does not exist in
-- this schema yet; those three values are therefore ADMIN-only until the team
-- concept is added (see DocumentPermissionService).
--
-- ----------------------------------------------------------------------------
-- Default document visibility setting
-- ----------------------------------------------------------------------------
-- Persisted as an app_settings row (key 'document_default_visibility',
-- default ADMIN_ONLY). No DDL is required — SettingsController upserts it on
-- first write. To seed it explicitly:
--
--   INSERT INTO app_settings (setting_key, setting_value, updated_at)
--   SELECT 'document_default_visibility', 'TEAM_ONLY', NOW()
--   WHERE NOT EXISTS (SELECT 1 FROM app_settings WHERE setting_key = 'document_default_visibility');
