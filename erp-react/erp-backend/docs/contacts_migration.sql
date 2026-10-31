-- ============================================================================
-- CRM Contacts — schema change (additive, no data rewrite)
-- ============================================================================
-- The CRM Contacts submodule lists the real people captured by the Lead form.
-- A lead already stores its two contacts as COLUMNS on the lead row
-- (name/title/email/phone + secondary_name/secondary_phone/secondary_email) and
-- a converted client stores its linked contacts in `customer_contacts`. Neither
-- shape can answer the questions the Contacts list asks:
--
--   * "which contact belongs to which lead, and is it the PRIMARY or SECONDARY
--     contact?"  — the lead row only stores columns, never contact rows, so a
--     contact cannot be linked, listed, opened or edited on its own;
--   * "which client did this contact end up with after the lead converted?" —
--     there is no persisted lead → client relationship anywhere (the UI used to
--     guess it from a follow-up's clientId);
--   * "show the same person once, not once per save" — column edits cannot
--     express identity, so a sync needs an explicit (lead, contact_type) key.
--
-- This table therefore holds one row per real contact PERSON:
--   * contact_type     PRIMARY | SECONDARY  (never two people merged into one row)
--   * lead_id          FK → leads.id, the lead the contact was captured from
--   * client_id        FK → customers.id, set when the lead converts (or when
--                      the contact is linked to an existing client)
--   * name/designation/phone/email  the captured contact details (the original
--                      filename… only display values, always copied from the
--                      lead/client record — never re-typed by the module)
--   * business_name    the business the contact belongs to, as captured
--   * status           Active | Inactive | Archived | Deleted (trash parity with
--                      the other CRM lists: archive/restore/delete are status
--                      changes, nothing is dropped implicitly)
--   * source           Lead | Manual — how the contact entered the module
--
-- RELATIONSHIP RULES
--   * A contact may exist with only a lead (lead-associated, not yet a client),
--     with only a client (linked manually), or with BOTH after conversion —
--     exactly the distinction the module must preserve.
--   * ON DELETE SET NULL: removing a lead or client NEVER deletes the contact
--     rows that referenced it (the contact survives as a standalone record);
--     nothing in this feature deletes leads or clients.
--   * uq_contacts_lead_type (lead_id, contact_type) is the idempotency key of
--     the lead sync: a lead has at most one Primary and one Secondary contact,
--     so re-saving a lead can only ever update those two rows. MySQL treats
--     NULLs as distinct, so standalone contacts (lead_id NULL) are unaffected.
--
-- WHY THIS SCRIPT EXISTS
--   spring.jpa.hibernate.ddl-auto defaults to `validate` in production, so the
--   table below MUST exist before the backend build that contains Contact
--   starts — otherwise the application fails fast with a missing-table error.
--   This project has no migration framework (schema changes are plain SQL, like
--   docs/processing_jobs.sql), so this script IS the migration.
--
-- WHEN TO RUN
--   * once per environment, BEFORE starting the backend build that introduces
--     the contacts table;
--   * every statement is idempotent (CREATE TABLE IF NOT EXISTS), so re-running
--     is harmless. The script contains no DROP / TRUNCATE / DELETE / UPDATE and
--     never touches leads, customers or customer_contacts.
--
-- HOW TO RUN (the application user has the required privileges):
--   mysql -u erp_app -p erp_db < contacts_migration.sql
--
-- BACKFILL
--   None here — deliberately. Contacts for the leads that already exist are
--   created by the application itself (ContactBackfillService), which reads the
--   real lead rows, is idempotent, and can be re-run at any time. SQL cannot
--   decide whether a lead's blank secondary columns mean "no second contact" or
--   "cleared", so that decision stays in the service.
-- ============================================================================

CREATE TABLE IF NOT EXISTS contacts (
    id            BIGINT       NOT NULL AUTO_INCREMENT,
    name          VARCHAR(190) NOT NULL,
    designation   VARCHAR(255) NULL,
    phone         VARCHAR(255) NULL,
    email         VARCHAR(255) NULL,
    contact_type  VARCHAR(40)  NOT NULL,
    business_name VARCHAR(255) NULL,
    lead_id       BIGINT       NULL,
    client_id     BIGINT       NULL,
    status        VARCHAR(40)  NOT NULL,
    source        VARCHAR(60)  NULL,
    created_at    DATETIME(6)  NULL,
    updated_at    DATETIME(6)  NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_contacts_lead_type (lead_id, contact_type),
    KEY idx_contacts_client (client_id),
    KEY idx_contacts_status (status),
    KEY idx_contacts_name (name),
    CONSTRAINT fk_contacts_lead FOREIGN KEY (lead_id) REFERENCES leads (id) ON DELETE SET NULL,
    CONSTRAINT fk_contacts_client FOREIGN KEY (client_id) REFERENCES customers (id) ON DELETE SET NULL
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

-- Existing contact information (the 58 leads already in the database) is made
-- visible by the application's idempotent backfill, not by an INSERT here:
--   SELECT COUNT(*) FROM contacts;                       -- rows after backfill
--   SELECT contact_type, COUNT(*) FROM contacts GROUP BY contact_type;
