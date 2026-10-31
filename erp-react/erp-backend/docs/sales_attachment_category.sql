-- Sales Contract attachments: E-Sign / Scanned Copy category
-- ==========================================================
--
-- Adds the category a Sales Contract attachment is filed under.
--
-- WHY THIS COLUMN EXISTS
--   The Upload Documents panel on Create/Edit Sales Contract offers two kinds of
--   signed paperwork: an E-Sign file (digitally signed) and a Scanned Copy (a
--   scan of the signed/physical contract). `sales_attachments` had no column
--   that could hold that distinction — every attachment was only
--   module/name/type/size/url/uploader — so the chosen category could not be
--   persisted and the attachment list could not show it.
--
-- WHY NOT A NEW TABLE / A SECOND STORE
--   Attachments already live in one shared store (`sales_attachments`, keyed by
--   module_type + module_id) that every sales module uploads into. The category
--   is one optional attribute of an existing row, so it is stored on that row
--   instead of duplicating the file reference — nothing about file storage,
--   existing rows or the other modules changes.
--
-- BACKWARD COMPATIBILITY
--   - Additive and NULLABLE: every existing attachment keeps working and simply
--     has no category, which the UI renders as '—'. Only the Sales Contract
--     upload sets it; the other sales modules never send one.
--   - No index is added: the column is read with its own row (the module/record
--     index already selects the rows) and is never filtered or sorted on.
--   - Re-runnable: the column is only added when it is missing, so running this
--     on an already-migrated database is a no-op.
--
-- ddl-auto stays on 'validate'; run this once per database before starting the
-- backend with the matching code.

SET @has_column := (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'sales_attachments'
      AND COLUMN_NAME = 'attachment_category'
);

SET @ddl := IF(
    @has_column = 0,
    'ALTER TABLE sales_attachments ADD COLUMN attachment_category VARCHAR(40) NULL AFTER uploaded_by',
    'DO 0'
);

PREPARE add_attachment_category FROM @ddl;
EXECUTE add_attachment_category;
DEALLOCATE PREPARE add_attachment_category;
