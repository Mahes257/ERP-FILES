-- ============================================================================
-- Lead Description — schema addition (additive, nullable, no data rewrite)
-- ============================================================================
-- The Lead create/edit form needs one free-text business description that is
-- persisted for the whole lead lifecycle. None of the existing lead columns can
-- hold it without colliding with another field: internal_notes already backs
-- "Internal Notes" (and its legacy metadata envelope), project backs "Project",
-- and notes is a child note table.
--
-- This script therefore adds one nullable TEXT column to `leads`. Existing rows
-- keep working with no description, and no data is read, rewritten or deleted.
--
-- The backend maps this column with spring.jpa.hibernate.ddl-auto=validate, so
-- this script must run BEFORE the backend build that contains the mapped field
-- is started.
--
-- Apply with:
--   mysql -u <user> -p erp_db < docs/lead_description.sql
--
-- This script is additive and re-runnable: the column is only added when it is
-- missing. It contains no DROP / TRUNCATE / DELETE / UPDATE.
-- ============================================================================

SET @has_lead_description := (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'leads'
      AND COLUMN_NAME = 'description'
);

SET @ddl := IF(
    @has_lead_description = 0,
    'ALTER TABLE leads ADD COLUMN description TEXT NULL AFTER created_at',
    'DO 0'
);

PREPARE add_lead_description FROM @ddl;
EXECUTE add_lead_description;
DEALLOCATE PREPARE add_lead_description;
