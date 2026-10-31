-- Production entries: machine assignment
-- ======================================
--
-- Adds the machine a production stage entry (shop floor job) is run on.
--
-- WHY THIS COLUMN EXISTS
--   The Machine Shop board has always had a 'Machine' column, filter and form
--   field, but `production_entries` had no column for it, so the value an
--   operator typed was silently dropped on save and the board showed '—' on
--   every reload. The machine master (Settings → Machines) was also unrelated
--   to the job: a job could not reference a configured machine at all.
--
-- BACKWARD COMPATIBILITY
--   - Additive and NULLABLE: existing entries are untouched and simply have no
--     machine, which the UI renders as '—' exactly as before.
--   - No foreign key is declared, matching the rest of this schema: machines
--     are addressed by their stable business id (production_machines.machine_code)
--     and the application validates the reference, so retiring a machine never
--     rewrites or blocks historical jobs.
--   - Re-runnable: the column is only added when it is missing, so running this
--     on an already-migrated database is a no-op.
--
-- ddl-auto stays on 'validate'; run this once per database before starting the
-- backend with the matching code.

SET @has_column := (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'production_entries'
      AND COLUMN_NAME = 'machine_code'
);

SET @ddl := IF(
    @has_column = 0,
    'ALTER TABLE production_entries ADD COLUMN machine_code VARCHAR(50) NULL AFTER operator',
    'DO 0'
);

PREPARE add_machine_code FROM @ddl;
EXECUTE add_machine_code;
DEALLOCATE PREPARE add_machine_code;
