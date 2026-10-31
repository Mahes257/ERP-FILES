-- erp_db cleanup: confirmed AUDIT/parity TEST records only
-- (created 2026-08-08 by the audit/parity test sessions)
START TRANSACTION;

-- 1. Customer 7 "sri" test chain: invoice 16, credit note 12, payment receipt 11 (all reference client_id 7)
DELETE FROM invoice_items WHERE invoice_id = 16;
DELETE FROM invoices WHERE id = 16;
DELETE FROM credit_note_items WHERE credit_note_id = 12;
DELETE FROM credit_notes WHERE id = 12;
DELETE FROM payment_receipts WHERE id = 11;
DELETE FROM customers WHERE id = 7;

-- 2. AUDIT lead cluster: ids 11-23 (all AUDIT_* test records) + children
DELETE FROM lead_activities WHERE lead_id BETWEEN 11 AND 23;
DELETE FROM lead_attachments WHERE lead_id BETWEEN 11 AND 23;
DELETE FROM lead_history WHERE lead_id BETWEEN 11 AND 23;
DELETE FROM lead_notes WHERE lead_id BETWEEN 11 AND 23;
DELETE FROM lead_timeline WHERE lead_id BETWEEN 11 AND 23;
DELETE FROM leads WHERE id BETWEEN 11 AND 23;

-- 3. CPR test cluster: 129-130 (AUDIT_LEAD_20260808_CO + blank) + children
DELETE FROM cpr_items WHERE cpr_id BETWEEN 129 AND 130;
DELETE FROM cpr_attachments WHERE cpr_id BETWEEN 129 AND 130;
DELETE FROM cpr_comments WHERE cpr_id BETWEEN 129 AND 130;
DELETE FROM cpr_history WHERE cpr_id BETWEEN 129 AND 130;
DELETE FROM cpr_timeline WHERE cpr_id BETWEEN 129 AND 130;
DELETE FROM cprs WHERE id BETWEEN 129 AND 130;

-- 4. Cost workout test cluster: 13-14 (AUDIT_LEAD_20260808_CO) + children
DELETE FROM cost_workout_categories WHERE item_id IN (SELECT id FROM cost_workout_items WHERE cost_workout_id IN (13, 14));
DELETE FROM cost_workout_items WHERE cost_workout_id IN (13, 14);
DELETE FROM cost_workout_timeline WHERE cost_workout_id IN (13, 14);
DELETE FROM cost_workouts WHERE id IN (13, 14);

COMMIT;

-- Verify post-cleanup counts
SELECT 'customers' t, COUNT(*) c FROM customers
UNION ALL SELECT 'leads', COUNT(*) FROM leads
UNION ALL SELECT 'invoices', COUNT(*) FROM invoices
UNION ALL SELECT 'credit_notes', COUNT(*) FROM credit_notes
UNION ALL SELECT 'payment_receipts', COUNT(*) FROM payment_receipts
UNION ALL SELECT 'cprs', COUNT(*) FROM cprs
UNION ALL SELECT 'cost_workouts', COUNT(*) FROM cost_workouts;
