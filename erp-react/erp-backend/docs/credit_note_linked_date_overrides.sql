-- Credit Notes: manual overrides of the linked-document dates
-- ===========================================================
--
-- Adds two nullable date columns to `credit_notes`, letting a credit note carry
-- its OWN dispatch date and due date when the linked documents cannot supply one
-- (or supply one the user must correct).
--
--   dispatch_date_override  overrides the linked Delivery Challan's dispatch date
--   due_date_override       overrides the resolved due date (the linked invoice's
--                           due date, else the linked CPO's delivery date)
--
-- WHY THESE COLUMNS EXIST
--   Both dates are FACTS THE LINKED DOCUMENTS OWN, so they are resolved at read
--   time and never copied onto the note (see CreditNoteService#resolveLinks).
--   That is still exactly how they work — the columns add an OVERRIDE on top:
--     * a NULL override keeps the previous behaviour byte for byte (resolve from
--       the link), so no existing row changes and no value is back-filled,
--     * a non-NULL override is the note's own statement and wins over the link,
--     * the linked documents are NEVER written to — correcting a date on the
--       credit note cannot silently rewrite the Delivery Challan, the invoice or
--       the CPO that other documents and reports also read.
--
--   Storing the override explicitly (rather than overwriting the resolved value)
--   is what keeps the two distinguishable: changing the source document later
--   re-resolves the automatic value but cannot destroy a user's saved override.
--
-- WHAT IS *NOT* OVERRIDABLE, ON PURPOSE
--   * `cpo_no` is not a column at all: it IS the document relationship (the CPO
--     the note traces back to), so a hand-typed number could only invent a link
--     that does not exist.
--   * "Due Date Exceeded" stays a calculation. It is derived from the
--     authoritative due date (the override when one is set, otherwise the
--     resolved one) plus the note's settlement state, so overriding the date
--     moves the flag with it instead of letting the two disagree.
--
-- BACKWARD COMPATIBILITY
--   - Additive and NULLABLE: existing rows keep working with no value, and
--     nothing is back-filled.
--   - No index is added: each column is read with its own row (the resolved
--     dates are ordered in the service's derived-sort path, not by SQL).
--   - Re-runnable: each column is only added when it is missing, so running this
--     on an already-migrated database is a no-op.
--
-- ddl-auto stays on 'validate'; run this once per existing database before
-- starting the backend with the matching code. A FRESH database needs nothing:
-- docs/database_setup.sql already carries both columns.

SET @has_dispatch_override := (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'credit_notes'
      AND COLUMN_NAME = 'dispatch_date_override'
);

SET @ddl := IF(
    @has_dispatch_override = 0,
    'ALTER TABLE credit_notes ADD COLUMN dispatch_date_override datetime(6) NULL AFTER destination_reached_date',
    'DO 0'
);

PREPARE add_dispatch_date_override FROM @ddl;
EXECUTE add_dispatch_date_override;
DEALLOCATE PREPARE add_dispatch_date_override;

SET @has_due_override := (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'credit_notes'
      AND COLUMN_NAME = 'due_date_override'
);

SET @ddl := IF(
    @has_due_override = 0,
    'ALTER TABLE credit_notes ADD COLUMN due_date_override datetime(6) NULL AFTER dispatch_date_override',
    'DO 0'
);

PREPARE add_due_date_override FROM @ddl;
EXECUTE add_due_date_override;
DEALLOCATE PREPARE add_due_date_override;
