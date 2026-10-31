-- Cost Workout items: per-item documents
-- ============================================
--
-- Adds an item-level `attachments_json` to every Cost Workout item. Each item
-- stores its own documents in the same embedded JSON shape the Cost Workout
-- already uses for its document-level attachments
-- ([{name, size, type, data(base64)}]), so an item's files are scoped to that
-- item row and can never move to another item when items are added, removed or
-- reordered.
--
-- BACKWARD COMPATIBILITY
--   - Additive and NULLABLE: items created before this column simply have no
--     documents. They stay readable, listable and editable, and the existing
--     document-level `cost_workouts.attachments_json` is untouched.
--   - No existing data is read, rewritten or migrated.
--   - Re-runnable: the column is only added when it is missing.
--
-- ddl-auto stays on 'validate'; run this once per database before starting the
-- backend with the matching code.

SET @has_column := (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'cost_workout_items'
      AND COLUMN_NAME = 'attachments_json'
);

SET @ddl := IF(
    @has_column = 0,
    'ALTER TABLE cost_workout_items ADD COLUMN attachments_json TEXT NULL AFTER custom_fields_json',
    'DO 0'
);

PREPARE add_attachments_json FROM @ddl;
EXECUTE add_attachments_json;
DEALLOCATE PREPARE add_attachments_json;
