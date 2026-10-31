-- ============================================================================
-- Performance Indexes for ERP High-Traffic Queries
-- ============================================================================
-- Date: 2026-09-18
-- Purpose: Add indexes to support server-side pagination, filtering, and
--          statistics queries introduced by the Production, Purchase Receiving,
--          Technical Review, and Notification modules.
--
-- Every index below is justified by a specific query pattern found in the
-- repository layer. No speculative indexes are included.
-- ============================================================================

-- ============================================================================
-- 1. PRODUCTION ORDERS
-- ============================================================================
-- Table: production_orders
-- High-traffic queries:
--   - findFiltered: WHERE status, production_type, priority, due_date, start_date
--   - countByStatus: WHERE status = :status
--   - countOverdue: WHERE due_date < :date AND status NOT IN (completed, ...)
--   - countDueToday: WHERE due_date = :date AND status NOT IN (completed, ...)
--   - countByProductionTypeActive: WHERE production_type = :type AND status NOT IN (...)
--   - countUrgentAndHighPriority: WHERE priority IN ('Urgent', 'High')
-- ============================================================================

-- Composite index for the most common filtered list query (status + production_type + priority)
-- This covers the WHERE clause ordering used by findFiltered when multiple filters are active.
CREATE INDEX idx_prod_orders_status_type_priority
    ON production_orders (status, production_type, priority);

-- Index for overdue/due-today queries (due_date + status for the NOT IN exclusion)
-- MySQL can use this for range scans on due_date while filtering status.
CREATE INDEX idx_prod_orders_due_date_status
    ON production_orders (due_date, status);

-- Index for priority-based queries (urgent/high priority counts)
CREATE INDEX idx_prod_orders_priority
    ON production_orders (priority);

-- Index for start_date range filtering used in findFiltered
CREATE INDEX idx_prod_orders_start_date
    ON production_orders (start_date);

-- Index for sales_order_number lookups (used in Production → Sales Order linkage)
CREATE INDEX idx_prod_orders_sales_order_number
    ON production_orders (sales_order_number);


-- ============================================================================
-- 2. TECHNICAL VERIFICATIONS
-- ============================================================================
-- Table: technical_verifications
-- High-traffic queries:
--   - findFiltered: WHERE verification_status, production_type
--   - countByStatus: WHERE verification_status = :status
--   - countVerified/Rejected/Pending: WHERE verification_status = :status
--   - findByWorkOrderIdAndItemId: WHERE work_order_id, item_id (already unique)
-- ============================================================================

-- Composite index for filtered list and status counts
CREATE INDEX idx_tech_verif_status_type
    ON technical_verifications (verification_status, production_type);

-- Index for work_order_id lookups (used in findByWorkOrderId, deleteByWorkOrderId)
-- Note: (work_order_id, item_id) already has a unique constraint index,
-- but a standalone work_order_id index is needed for the one-column queries.
CREATE INDEX idx_tech_verif_work_order_id
    ON technical_verifications (work_order_id);


-- ============================================================================
-- 3. PURCHASE RECEIVING — GRN
-- ============================================================================
-- Table: purchase_grns
-- High-traffic queries:
--   - countByStatus: WHERE status = :status
--   - findByStatusOrderByIdDesc: WHERE status = :status ORDER BY id DESC
--   - findByGrnNo: WHERE grn_no = :grnNo (already has unique index)
--   - existsByGrnNo: WHERE grn_no = :grnNo (already has unique index)
-- ============================================================================

-- Index for status-based queries (work queue counts, filtered lists)
-- Covers countByStatus, findByStatusOrderByIdDesc
CREATE INDEX idx_grn_status
    ON purchase_grns (status);

-- Index for PO number lookups (already has idx_grn_po, but adding for clarity)
-- This is ALREADY covered by idx_grn_po — no action needed.


-- ============================================================================
-- 4. PURCHASE RECEIVING — INSPECTION
-- ============================================================================
-- Table: purchase_inspections
-- High-traffic queries:
--   - countByStatus: WHERE status = :status
--   - findByStatusOrderByIdDesc: WHERE status = :status ORDER BY id DESC
--   - findByInspectionNo: WHERE inspection_no = :no (already has unique index)
-- ============================================================================

-- Index for status-based queries (work queue counts, filtered lists)
CREATE INDEX idx_inspection_status
    ON purchase_inspections (status);

-- Index for GRN number lookups (used to link inspection → GRN)
CREATE INDEX idx_inspection_grn_no
    ON purchase_inspections (grn_no);


-- ============================================================================
-- 5. PURCHASE RECEIVING — SHIPMENT
-- ============================================================================
-- Table: purchase_shipments
-- High-traffic queries:
--   - countByStatus: WHERE status = :status
--   - findByShipmentNo: WHERE shipment_no = :shipmentNo (already has unique index)
-- ============================================================================

-- Index for status-based queries
CREATE INDEX idx_shipment_status
    ON purchase_shipments (status);


-- ============================================================================
-- 6. PURCHASE RECEIVING — MANUFACTURING/PACKING
-- ============================================================================
-- Table: purchase_manufacturing_jobs
-- High-traffic queries:
--   - countByStatus: WHERE status = :status
--   - findByMfrNo: WHERE mfr_no = :mfrNo (already has unique index)
--   - existsByPoNo: WHERE po_no = :poNo
-- ============================================================================

-- Index for status-based queries
CREATE INDEX idx_mfr_job_status
    ON purchase_manufacturing_jobs (status);

-- Index for PO number lookups (used to check if PO has packing jobs)
CREATE INDEX idx_mfr_job_po_no
    ON purchase_manufacturing_jobs (po_no);


-- ============================================================================
-- 7. SALES ORDERS (used by Production module)
-- ============================================================================
-- Table: sales_orders
-- High-traffic queries:
--   - countByStatus: WHERE status = :status
--   - countCurrentByStatus: WHERE status = :status AND NOT EXISTS (revision check)
--   - sumGrandTotalExcluding: WHERE status NOT IN :excluded
--   - findBySoNo: WHERE so_no = :soNo (already has unique index)
-- ============================================================================

-- Index for status-based queries (used by Production dashboard stats)
CREATE INDEX idx_so_status
    ON sales_orders (status);

-- Composite index for the current-revision status count query
-- The subquery checks for newer revisions, so status + revision is useful
CREATE INDEX idx_so_status_revision
    ON sales_orders (status, revision);

-- Index for revision_of lookups (used in revision chain queries)
CREATE INDEX idx_so_revision_of
    ON sales_orders (revision_of);


-- ============================================================================
-- 8. NOTIFICATION SCHEDULER (already has indexes — verify only)
-- ============================================================================
-- Table: notifications
-- Existing indexes:
--   - idx_notif_recipient (recipientUserId)
--   - idx_notif_status (status)
--   - idx_notif_reminder (nextReminderAt)
--   - idx_notif_recipient_status (recipientUserId, status)
--
-- The findDueReminderIds query uses:
--   WHERE nextReminderAt IS NOT NULL AND nextReminderAt <= :now
--     AND status <> 'RESOLVED' AND reminderCount < maxReminders
--   ORDER BY nextReminderAt ASC
--
-- The existing idx_notif_reminder on nextReminderAt covers this.
-- No additional indexes needed for notifications.
-- ============================================================================


-- ============================================================================
-- 9. PURCHASE GRN ITEMS (for batch loading)
-- ============================================================================
-- Table: purchase_grn_items
-- High-traffic query:
--   - findAllWithItemsByIds: WHERE grn_id IN :ids (via join)
-- ============================================================================

-- Index for GRN ID lookups (foreign key, should already exist, but verify)
CREATE INDEX idx_grn_items_grn_id
    ON purchase_grn_items (grn_id);


-- ============================================================================
-- VERIFICATION QUERIES (run these after applying indexes)
-- ============================================================================
-- These queries should now use the new indexes instead of full table scans.
--
-- Production Orders:
--   EXPLAIN SELECT * FROM production_orders WHERE status = 'IN_PROGRESS';
--   EXPLAIN SELECT * FROM production_orders WHERE due_date < CURDATE() AND status NOT IN ('COMPLETED','CANCELLED');
--   EXPLAIN SELECT * FROM production_orders WHERE priority IN ('Urgent','High');
--
-- Technical Verifications:
--   EXPLAIN SELECT * FROM technical_verifications WHERE verification_status = 'PENDING';
--   EXPLAIN SELECT * FROM technical_verifications WHERE work_order_id = 'WO-0001';
--
-- Purchase Receiving:
--   EXPLAIN SELECT COUNT(*) FROM purchase_grns WHERE status = 'Expected';
--   EXPLAIN SELECT COUNT(*) FROM purchase_inspections WHERE status = 'Pending';
--   EXPLAIN SELECT COUNT(*) FROM purchase_shipments WHERE status = 'In Transit';
--   EXPLAIN SELECT COUNT(*) FROM purchase_manufacturing_jobs WHERE status = 'Queued';
--
-- Sales Orders:
--   EXPLAIN SELECT COUNT(*) FROM sales_orders WHERE status = 'confirmed';
-- ============================================================================
