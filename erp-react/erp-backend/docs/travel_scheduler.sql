-- ============================================================
-- Marketing Travel Scheduler — schema
-- ============================================================
-- The Travel Scheduler is a new Marketing feature (navigation entry directly
-- before Travel Registry) with its own list page and scheduling form. It stores
-- one row per scheduled trip: assigned employee, purpose, priority, date/time,
-- route, optional client/meeting coordination and the approval state.
--
-- WHY A NEW TABLE
--   Scheduling fields (schedule title, assigned employee, priority, travel
--   mode, estimated distance, client/meeting coordination) do not exist on
--   `marketing_travel_plans`, and that table already backs the live Travel
--   Registry workflow. Adding the scheduler's columns there would mean nullable
--   columns on a running workflow and two record types in one list, so the
--   scheduler gets its own table and NO Travel Registry row is read, written or
--   migrated by this script.
--
-- REFERENCES
--   `assigned_user_id` (users) and `customer_id` (customers) are reference
--   columns validated in TravelScheduleService — the employee must exist and be
--   enabled, the client is resolved through CRM's own service and its business
--   name is snapshotted into `customer_name`. This is exactly how
--   `marketing_travel_plans.marketer_user_id` references a user today (id
--   column + display snapshot, no database-level FK), so the module keeps one
--   referencing convention instead of two.
--
-- This script is additive and idempotent: it only creates the table when it is
-- missing. No existing table, row or index is touched.
--
-- Apply with:
--   mysql -u <user> -p erp_db < docs/travel_scheduler.sql
--
-- The backend maps this table with spring.jpa.hibernate.ddl-auto=validate, so
-- this script must run BEFORE the application is (re)started.
-- ============================================================

CREATE TABLE IF NOT EXISTS marketing_travel_schedules (
    id                    BIGINT       NOT NULL AUTO_INCREMENT,
    schedule_title        VARCHAR(255) NOT NULL,
    assigned_user_id      BIGINT       NOT NULL,
    assigned_to           VARCHAR(255) NOT NULL,
    requested_by          VARCHAR(255) NULL,
    requested_by_user_id  BIGINT       NULL,
    purpose               VARCHAR(100) NULL,
    priority              VARCHAR(20)  NULL,
    start_date            DATE         NULL,
    start_time            VARCHAR(255) NULL,
    end_date              DATE         NULL,
    end_time              VARCHAR(255) NULL,
    starting_location     VARCHAR(255) NULL,
    ending_location       VARCHAR(255) NULL,
    travel_mode           VARCHAR(20)  NULL,
    estimated_distance_km DECIMAL(10,2) NULL,
    customer_id           BIGINT       NULL,
    customer_name         VARCHAR(255) NULL,
    meeting_details       TEXT         NULL,
    contact_person        VARCHAR(255) NULL,
    contact_phone         VARCHAR(255) NULL,
    remarks               TEXT         NULL,
    status                VARCHAR(40)  NOT NULL,
    approval_status       VARCHAR(40)  NULL,
    approved_by           VARCHAR(255) NULL,
    approved_at           DATETIME(6)  NULL,
    rejection_reason      TEXT         NULL,
    revision_comments     TEXT         NULL,
    cancelled_by          VARCHAR(255) NULL,
    cancelled_at          DATETIME(6)  NULL,
    cancellation_reason   TEXT         NULL,
    created_at            DATETIME(6)  NULL,
    updated_at            DATETIME(6)  NULL,
    deleted               BIT          NOT NULL,
    PRIMARY KEY (id)
) ENGINE=InnoDB;
