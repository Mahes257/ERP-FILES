-- ============================================================
-- Production Settings — master data schema
-- ============================================================
-- Production → Settings (Machines, Work Centers, Status Masters) previously
-- lived only in the browser (localStorage / seed arrays), so every record was
-- lost on a new device and Production Reports could not read real master data.
--
-- This script adds the three tables those screens need. It is additive and
-- idempotent: existing tables are left untouched, and no Production record is
-- modified. A separate index of Settings data is NOT introduced — the existing
-- production_orders / production_order_items / production_entries tables remain
-- the source of truth for everything reports calculate.
--
-- Production Parameters reuse the existing generic `app_settings` key/value
-- table (keys prefixed `production.param.`), so no extra table is created.
--
-- Apply with:
--   mysql -u <user> -p erp_db < docs/production_settings.sql
--
-- The backend maps these tables with spring.jpa.hibernate.ddl-auto=validate,
-- so this script must run BEFORE the application is (re)started.
-- ============================================================

CREATE TABLE IF NOT EXISTS production_machines (
    id                BIGINT       NOT NULL AUTO_INCREMENT,
    machine_code      VARCHAR(50)  NOT NULL,
    name              VARCHAR(150) NOT NULL,
    machine_type      VARCHAR(60)  NOT NULL,
    department        VARCHAR(50)  NOT NULL,
    work_center       VARCHAR(50)  NULL,
    status            VARCHAR(30)  NOT NULL,
    available_hours   INT          NULL,
    running_hours     INT          NULL,
    idle_hours        INT          NULL,
    maintenance_hours INT          NULL,
    description       TEXT         NULL,
    created_at        DATETIME(6)  NOT NULL,
    updated_at        DATETIME(6)  NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_production_machines_code (machine_code)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

CREATE TABLE IF NOT EXISTS production_work_centers (
    id               BIGINT       NOT NULL AUTO_INCREMENT,
    work_center_code VARCHAR(50)  NOT NULL,
    name             VARCHAR(150) NOT NULL,
    department       VARCHAR(50)  NOT NULL,
    location         VARCHAR(60)  NOT NULL,
    supervisor       VARCHAR(120) NULL,
    status           VARCHAR(30)  NOT NULL,
    description      TEXT         NULL,
    created_at       DATETIME(6)  NOT NULL,
    updated_at       DATETIME(6)  NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_production_work_centers_code (work_center_code)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

CREATE TABLE IF NOT EXISTS production_status_masters (
    id            BIGINT      NOT NULL AUTO_INCREMENT,
    status_name   VARCHAR(80) NOT NULL,
    category      VARCHAR(60) NOT NULL,
    description   TEXT        NULL,
    active        BIT(1)      NOT NULL DEFAULT b'1',
    display_order INT         NULL,
    created_at    DATETIME(6) NOT NULL,
    updated_at    DATETIME(6) NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_production_status_name_category (status_name, category)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;
