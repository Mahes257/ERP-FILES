-- ============================================================
-- Migration: Move Production tables into the shared erp_db
-- ============================================================
-- Strategy:
--   1. CREATE TABLE ... LIKE to copy schema
--   2. INSERT INTO ... SELECT to copy data
--   3. Handle quality_inspections conflict by renaming erp_db's table
-- ============================================================

-- ============================================================
-- Step 0: Verify source data counts before migration
-- ============================================================
SELECT '=== SOURCE: erp_production ===' AS info;
USE erp_production;
SELECT table_name, table_rows FROM information_schema.tables 
WHERE table_schema = 'erp_production' ORDER BY table_name;

-- ============================================================
-- Step 1: Tables with NO name conflicts — move directly
-- ============================================================
USE erp_db;

-- production_order_items
CREATE TABLE IF NOT EXISTS erp_db.production_order_items LIKE erp_production.production_order_items;
INSERT IGNORE INTO erp_db.production_order_items SELECT * FROM erp_production.production_order_items;

-- technical_verifications
CREATE TABLE IF NOT EXISTS erp_db.technical_verifications LIKE erp_production.technical_verifications;
INSERT IGNORE INTO erp_db.technical_verifications SELECT * FROM erp_production.technical_verifications;

-- drawings
CREATE TABLE IF NOT EXISTS erp_db.drawings LIKE erp_production.drawings;
INSERT IGNORE INTO erp_db.drawings SELECT * FROM erp_production.drawings;

-- drawing_revisions
CREATE TABLE IF NOT EXISTS erp_db.drawing_revisions LIKE erp_production.drawing_revisions;
INSERT IGNORE INTO erp_db.drawing_revisions SELECT * FROM erp_production.drawing_revisions;

-- drawing_history
CREATE TABLE IF NOT EXISTS erp_db.drawing_history LIKE erp_production.drawing_history;
INSERT IGNORE INTO erp_db.drawing_history SELECT * FROM erp_production.drawing_history;

-- models
CREATE TABLE IF NOT EXISTS erp_db.models LIKE erp_production.models;
INSERT IGNORE INTO erp_db.models SELECT * FROM erp_production.models;

-- model_history
CREATE TABLE IF NOT EXISTS erp_db.model_history LIKE erp_production.model_history;
INSERT IGNORE INTO erp_db.model_history SELECT * FROM erp_production.model_history;

-- packing_lists
CREATE TABLE IF NOT EXISTS erp_db.packing_lists LIKE erp_production.packing_lists;
INSERT IGNORE INTO erp_db.packing_lists SELECT * FROM erp_production.packing_lists;

-- dispatches
CREATE TABLE IF NOT EXISTS erp_db.dispatches LIKE erp_production.dispatches;
INSERT IGNORE INTO erp_db.dispatches SELECT * FROM erp_production.dispatches;

-- production_entries
CREATE TABLE IF NOT EXISTS erp_db.production_entries LIKE erp_production.production_entries;
INSERT IGNORE INTO erp_db.production_entries SELECT * FROM erp_production.production_entries;

-- acknowledgements
CREATE TABLE IF NOT EXISTS erp_db.acknowledgements LIKE erp_production.acknowledgements;
INSERT IGNORE INTO erp_db.acknowledgements SELECT * FROM erp_production.acknowledgements;

-- approval_history
CREATE TABLE IF NOT EXISTS erp_db.approval_history LIKE erp_production.approval_history;
INSERT IGNORE INTO erp_db.approval_history SELECT * FROM erp_production.approval_history;

-- audit_logs (no conflict — erp_db doesn't have this table)
CREATE TABLE IF NOT EXISTS erp_db.audit_logs LIKE erp_production.audit_logs;
INSERT IGNORE INTO erp_db.audit_logs SELECT * FROM erp_production.audit_logs;

-- timeline_events
CREATE TABLE IF NOT EXISTS erp_db.timeline_events LIKE erp_production.timeline_events;
INSERT IGNORE INTO erp_db.timeline_events SELECT * FROM erp_production.timeline_events;

-- tv_history
CREATE TABLE IF NOT EXISTS erp_db.tv_history LIKE erp_production.tv_history;
INSERT IGNORE INTO erp_db.tv_history SELECT * FROM erp_production.tv_history;

-- ============================================================
-- Step 2: Handle quality_inspections conflict
-- ============================================================
-- erp_db already has a quality_inspections table (3 records)
-- erp_production has its own (11 records) with a different schema
--
-- Strategy: Rename erp_db's table, then move erp_production's table
-- ============================================================

-- Rename the existing erp_db quality_inspections to preserve it
RENAME TABLE erp_db.quality_inspections TO erp_db.quality_inspections_legacy_erp;

-- Move erp_production's quality_inspections into erp_db
CREATE TABLE IF NOT EXISTS erp_db.quality_inspections LIKE erp_production.quality_inspections;
INSERT IGNORE INTO erp_db.quality_inspections SELECT * FROM erp_production.quality_inspections;

-- ============================================================
-- Step 3: Create production_orders (the main table)
-- ============================================================
-- This must be done LAST because other tables may reference it
-- ============================================================

CREATE TABLE IF NOT EXISTS erp_db.production_orders LIKE erp_production.production_orders;
INSERT IGNORE INTO erp_db.production_orders SELECT * FROM erp_production.production_orders;

-- ============================================================
-- Step 4: Verify migration
-- ============================================================
SELECT '=== DESTINATION: erp_db ===' AS info;
USE erp_db;
SELECT table_name, table_rows FROM information_schema.tables 
WHERE table_schema = 'erp_db' 
AND table_name IN (
  'production_orders', 'production_order_items', 'technical_verifications',
  'drawings', 'drawing_revisions', 'drawing_history',
  'models', 'model_history', 'quality_inspections',
  'packing_lists', 'dispatches', 'production_entries',
  'acknowledgements', 'approval_history', 'audit_logs',
  'timeline_events', 'tv_history'
)
ORDER BY table_name;

-- Verify data counts
SELECT 'production_orders' AS tbl, COUNT(*) AS cnt FROM production_orders
UNION ALL SELECT 'production_order_items', COUNT(*) FROM production_order_items
UNION ALL SELECT 'technical_verifications', COUNT(*) FROM technical_verifications
UNION ALL SELECT 'drawings', COUNT(*) FROM drawings
UNION ALL SELECT 'drawing_revisions', COUNT(*) FROM drawing_revisions
UNION ALL SELECT 'drawing_history', COUNT(*) FROM drawing_history
UNION ALL SELECT 'models', COUNT(*) FROM models
UNION ALL SELECT 'model_history', COUNT(*) FROM model_history
UNION ALL SELECT 'quality_inspections', COUNT(*) FROM quality_inspections
UNION ALL SELECT 'packing_lists', COUNT(*) FROM packing_lists
UNION ALL SELECT 'dispatches', COUNT(*) FROM dispatches
UNION ALL SELECT 'production_entries', COUNT(*) FROM production_entries
UNION ALL SELECT 'acknowledgements', COUNT(*) FROM acknowledgements
UNION ALL SELECT 'approval_history', COUNT(*) FROM approval_history
UNION ALL SELECT 'audit_logs', COUNT(*) FROM audit_logs
UNION ALL SELECT 'timeline_events', COUNT(*) FROM timeline_events
UNION ALL SELECT 'tv_history', COUNT(*) FROM tv_history;
