-- Cost Workout items: separate CPR Description
-- ============================================
--
-- Adds an item-level `cpr_description` to every Cost Workout item: a short,
-- brief description used by the Cost Workout list, kept INDEPENDENT of the
-- item's existing `description` (the full costing description). Nothing is
-- derived from the other field in either direction.
--
-- BACKWARD COMPATIBILITY
--   - Additive and NULLABLE: Cost Workouts created before this column simply
--     have no CPR description. They stay readable, listable and editable; the
--     list shows '—' for them instead of falling back to the full description.
--   - No existing `description` value is read, rewritten or defaulted by the
--     database — no destructive or data migration is involved.
--   - Re-runnable: the column is only added when it is missing.
--
-- ddl-auto stays on 'validate'; run this once per database before starting the
-- backend with the matching code.

SET @has_column := (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'cost_workout_items'
      AND COLUMN_NAME = 'cpr_description'
);

SET @ddl := IF(
    @has_column = 0,
    'ALTER TABLE cost_workout_items ADD COLUMN cpr_description TEXT NULL AFTER description',
    'DO 0'
);

PREPARE add_cpr_description FROM @ddl;
EXECUTE add_cpr_description;
DEALLOCATE PREPARE add_cpr_description;
