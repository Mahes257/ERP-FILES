-- Production order items: item-wise due date
-- ==========================================
--
-- Adds an independent due date to each Production Item of a Work Order.
-- The Work Order level due date (production_orders.due_date) stays unchanged:
-- an item's own date is never derived from it after creation.
--
-- BACKWARD COMPATIBILITY
--   - Additive and NULLABLE: Work Orders created before this column simply have
--     no item due date. They stay readable and editable; the edit form seeds a
--     missing item date from the Work Order due date so an old record can be
--     saved without extra work.
--   - No data is rewritten and no default is applied by the database.
--   - Re-runnable: the column is only added when it is missing.
--
-- Item-wise attachments need NO schema change: they are stored in the existing
-- shared attachment table under the new module type 'PRODUCTION_ORDER_ITEM'
-- with the item's own primary key as module_id.
--
-- ddl-auto stays on 'validate'; run this once per database before starting the
-- backend with the matching code.

SET @has_column := (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'production_order_items'
      AND COLUMN_NAME = 'due_date'
);

SET @ddl := IF(
    @has_column = 0,
    'ALTER TABLE production_order_items ADD COLUMN due_date DATE NULL AFTER quantity',
    'DO 0'
);

PREPARE add_due_date FROM @ddl;
EXECUTE add_due_date;
DEALLOCATE PREPARE add_due_date;
