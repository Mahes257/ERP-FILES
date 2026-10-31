-- Credit Notes: Destination Reached Date
-- =====================================
--
-- Adds the date the credited consignment reached the destination to the credit
-- note.
--
-- WHY THIS COLUMN EXISTS
--   The Credit Notes list has to show where the credited goods actually got to
--   (Destination Reached Date), and the whole data model had no such fact:
--     * invoices / sales orders carry no destination-reached date at all,
--     * the Delivery Challan's `delivery_date` is the EXPECTED delivery date
--       (that is its label on the challan form and its meaning everywhere it is
--       read), so relabelling it a "reached" date would state something the
--       document never recorded,
--     * the sales order / DC / invoice conversions record no such date either.
--   A credit note raised for returned / damaged / short-supplied goods is the
--   document of record for that event, so the fact belongs to it.
--
-- WHY NOT DERIVE IT / COPY IT
--   Nothing is back-filled: every existing credit note simply has no value
--   (rendered as '—'), and the value is entered by the user on the credit note
--   itself — no historical value is invented.
--
-- BACKWARD COMPATIBILITY
--   - Additive and NULLABLE: existing rows keep working with no value.
--   - No index is added: the column is read with its own row and is never
--     filtered on by a query (the list's optional sort on it is a page-level
--     ORDER BY, which MySQL serves with a small filesort like the other
--     nullable date columns).
--   - Re-runnable: the column is only added when it is missing, so running this
--     on an already-migrated database is a no-op.
--
-- ddl-auto stays on 'validate'; run this once per database before starting the
-- backend with the matching code.

SET @has_column := (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'credit_notes'
      AND COLUMN_NAME = 'destination_reached_date'
);

SET @ddl := IF(
    @has_column = 0,
    'ALTER TABLE credit_notes ADD COLUMN destination_reached_date datetime(6) NULL AFTER source_date',
    'DO 0'
);

PREPARE add_destination_reached_date FROM @ddl;
EXECUTE add_destination_reached_date;
DEALLOCATE PREPARE add_destination_reached_date;
