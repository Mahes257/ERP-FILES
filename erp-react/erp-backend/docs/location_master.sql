-- ============================================================
-- Location Master — Country → State → District → City
-- ============================================================
-- The CRM lead form (and central Location Master API, /locations) needs a
-- cascading Country → State → District → City master. It did not exist in the
-- target schema, so this script adds the four tables.
--
-- This script is additive and idempotent: it only CREATE-IF-NOT-EXISTS the
-- four tables, and no existing table or row is touched. Rows are seeded at
-- runtime by LocationSeeder (once, when the master is empty).
--
-- Apply with:
--   mysql -u <user> -p erp_db < docs/location_master.sql
--
-- The backend maps these tables with spring.jpa.hibernate.ddl-auto=validate,
-- so this script must run BEFORE the application is (re)started.
-- ============================================================

CREATE TABLE IF NOT EXISTS countries (
    id          BIGINT       NOT NULL AUTO_INCREMENT,
    name        VARCHAR(120) NOT NULL,
    code        VARCHAR(8)   NULL,
    iso_code    VARCHAR(16)  NULL,
    status      VARCHAR(20)  NOT NULL,
    created_by  VARCHAR(255) NULL,
    created_at  DATETIME(6)  NULL,
    updated_by  VARCHAR(255) NULL,
    updated_at  DATETIME(6)  NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_countries_name (name)
);

CREATE TABLE IF NOT EXISTS states (
    id          BIGINT       NOT NULL AUTO_INCREMENT,
    country_id  BIGINT       NOT NULL,
    name        VARCHAR(120) NOT NULL,
    code        VARCHAR(16)  NULL,
    status      VARCHAR(20)  NOT NULL,
    created_by  VARCHAR(255) NULL,
    created_at  DATETIME(6)  NULL,
    updated_by  VARCHAR(255) NULL,
    updated_at  DATETIME(6)  NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_states_country_name (country_id, name),
    KEY idx_states_country (country_id),
    CONSTRAINT fk_states_country FOREIGN KEY (country_id) REFERENCES countries (id)
);

CREATE TABLE IF NOT EXISTS districts (
    id          BIGINT       NOT NULL AUTO_INCREMENT,
    state_id    BIGINT       NOT NULL,
    name        VARCHAR(120) NOT NULL,
    code        VARCHAR(16)  NULL,
    aliases     VARCHAR(500) NULL,
    status      VARCHAR(20)  NOT NULL,
    created_by  VARCHAR(255) NULL,
    created_at  DATETIME(6)  NULL,
    updated_by  VARCHAR(255) NULL,
    updated_at  DATETIME(6)  NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_districts_state_name (state_id, name),
    KEY idx_districts_state (state_id),
    CONSTRAINT fk_districts_state FOREIGN KEY (state_id) REFERENCES states (id)
);

CREATE TABLE IF NOT EXISTS cities (
    id           BIGINT       NOT NULL AUTO_INCREMENT,
    district_id  BIGINT       NOT NULL,
    name         VARCHAR(120) NOT NULL,
    code         VARCHAR(16)  NULL,
    status       VARCHAR(20)  NOT NULL,
    created_by   VARCHAR(255) NULL,
    created_at   DATETIME(6)  NULL,
    updated_by   VARCHAR(255) NULL,
    updated_at   DATETIME(6)  NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_cities_district_name (district_id, name),
    KEY idx_cities_district (district_id),
    CONSTRAINT fk_cities_district FOREIGN KEY (district_id) REFERENCES districts (id)
);
