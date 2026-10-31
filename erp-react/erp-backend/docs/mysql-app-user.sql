-- ============================================================================
-- Dedicated MySQL application user for the ERP backend
-- ============================================================================
-- The application must NEVER connect as MySQL root. This script creates a
-- least-privilege user (erp_app) with only the permissions the application
-- actually needs.
--
-- Run as a MySQL administrator (e.g. `mysql -u root -p < mysql-app-user.sql`).
--
-- IMPORTANT:
--   * Choose a strong password and do NOT commit it anywhere.
--   * The password below is a PLACEHOLDER — replace it before running.
--   * If you keep spring.jpa.hibernate.ddl-auto=update in production,
--     Hibernate needs DDL privileges (CREATE, ALTER, INDEX, REFERENCES) and
--     the user needs them on the schema. The recommended production setup is
--     controlled migrations (Flyway) run by a separate migration user, which
--     lets the application user drop to pure DML (SELECT/INSERT/UPDATE/
--     DELETE/INDEX). Both variants are provided below.

-- 1) Create the application database (run once, as root/admin).
CREATE DATABASE IF NOT EXISTS erp_db
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

-- 2) Create the application user (REPLACE THE PASSWORD).
CREATE USER IF NOT EXISTS 'erp_app'@'%' IDENTIFIED BY 'REPLACE_WITH_A_STRONG_PASSWORD';
-- Tighten the host if the app always connects from one host, e.g. 'erp_app'@'app-server-host'.

-- 3a) DML + INDEX privileges for the application user.
--     Use this when schema migrations are managed separately (Flyway).
GRANT SELECT, INSERT, UPDATE, DELETE, INDEX ON erp_db.* TO 'erp_app'@'%';

-- 3b) If (and only if) you keep Hibernate ddl-auto=update in this environment,
--     add DDL privileges as well. Remove these once migrations are in place.
GRANT CREATE, ALTER, REFERENCES ON erp_db.* TO 'erp_app'@'%';
-- (DROP is deliberately NOT granted — the application must never drop tables.)

-- 4) Never grant global/administrative privileges:
--     ✗ GRANT ALL ON *.*
--     ✗ CREATE USER / DROP USER
--     ✗ GRANT OPTION
--     ✗ SUPER / PROCESS / FILE / RELOAD

FLUSH PRIVILEGES;

-- Verify (as root):
--   SHOW GRANTS FOR 'erp_app'@'%';
-- Expected (with ddl-auto=update):
--   GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES ON `erp_db`.* TO `erp_app`@`%`
-- Expected (migrations managed by Flyway):
--   GRANT SELECT, INSERT, UPDATE, DELETE, INDEX ON `erp_db`.* TO `erp_app`@`%`
