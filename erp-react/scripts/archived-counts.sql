SELECT 'quotations' tbl, COUNT(*) total, SUM(archived_at IS NOT NULL) archived FROM quotations
UNION ALL SELECT 'sales_contracts', COUNT(*), SUM(archived_at IS NOT NULL) FROM sales_contracts
UNION ALL SELECT 'sales_orders', COUNT(*), SUM(archived_at IS NOT NULL) FROM sales_orders
UNION ALL SELECT 'delivery_challans', COUNT(*), SUM(archived_at IS NOT NULL) FROM delivery_challans
UNION ALL SELECT 'proforma_invoices', COUNT(*), SUM(archived_at IS NOT NULL) FROM proforma_invoices
UNION ALL SELECT 'invoices', COUNT(*), SUM(archived_at IS NOT NULL) FROM invoices
UNION ALL SELECT 'credit_notes', COUNT(*), SUM(archived_at IS NOT NULL) FROM credit_notes
UNION ALL SELECT 'payment_receipts', COUNT(*), SUM(archived_at IS NOT NULL) FROM payment_receipts
UNION ALL SELECT 'cprs', COUNT(*), SUM(archived_at IS NOT NULL) FROM cprs
UNION ALL SELECT 'cost_workouts', COUNT(*), SUM(archived_at IS NOT NULL) FROM cost_workouts;
