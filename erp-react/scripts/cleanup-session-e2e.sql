-- Cleanup of E2E test records created during the 2026-08-10 audit session.
-- ONLY removes records conclusively identified as this session's test data
-- (created via audit13_modules.mjs). Prior-session audit records are kept.

SET FOREIGN_KEY_CHECKS = 0;

-- CPR (this session: ids 132, 133)
DELETE FROM cpr_attachments   WHERE cpr_id IN (132, 133);
DELETE FROM cpr_comments      WHERE cpr_id IN (132, 133);
DELETE FROM cpr_timeline      WHERE cpr_id IN (132, 133);
DELETE FROM cpr_history       WHERE cpr_id IN (132, 133);
DELETE FROM cpr_items         WHERE cpr_id IN (132, 133);
DELETE FROM cprs              WHERE id IN (132, 133);

-- Cost Workout (this session: ids 15, 16)
DELETE FROM cost_workout_categories WHERE item_id IN (SELECT id FROM cost_workout_items WHERE cost_workout_id IN (15, 16));
DELETE FROM cost_workout_items      WHERE cost_workout_id IN (15, 16);
DELETE FROM cost_workout_timeline   WHERE cost_workout_id IN (15, 16);
DELETE FROM cost_workouts           WHERE id IN (15, 16);

-- Quotations (this session: ids 118, 119)
DELETE FROM sales_attachments WHERE module_id IN (118, 119) AND module_type = 'quotation';
DELETE FROM sales_history     WHERE module_id IN (118, 119) AND module_type = 'quotation';
DELETE FROM sales_timeline    WHERE module_id IN (118, 119) AND module_type = 'quotation';
DELETE FROM quotation_items   WHERE quotation_id IN (118, 119);
DELETE FROM quotations        WHERE id IN (118, 119);

-- Sales Contracts (this session: ids 13, 14)
DELETE FROM sales_attachments WHERE module_id IN (13, 14) AND module_type = 'sales-contract';
DELETE FROM sales_history     WHERE module_id IN (13, 14) AND module_type = 'sales-contract';
DELETE FROM sales_timeline    WHERE module_id IN (13, 14) AND module_type = 'sales-contract';
DELETE FROM sales_contract_items WHERE sales_contract_id IN (13, 14);
DELETE FROM sales_contracts   WHERE id IN (13, 14);

-- Sales Orders (this session: ids 33, 34)
DELETE FROM sales_attachments WHERE module_id IN (33, 34) AND module_type = 'sales-order';
DELETE FROM sales_history     WHERE module_id IN (33, 34) AND module_type = 'sales-order';
DELETE FROM sales_timeline    WHERE module_id IN (33, 34) AND module_type = 'sales-order';
DELETE FROM sales_order_items WHERE sales_order_id IN (33, 34);
DELETE FROM sales_orders      WHERE id IN (33, 34);

-- Delivery Challans (this session: ids 19, 20)
DELETE FROM sales_attachments WHERE module_id IN (19, 20) AND module_type = 'delivery-challan';
DELETE FROM sales_history     WHERE module_id IN (19, 20) AND module_type = 'delivery-challan';
DELETE FROM sales_timeline    WHERE module_id IN (19, 20) AND module_type = 'delivery-challan';
DELETE FROM delivery_challan_items WHERE delivery_challan_id IN (19, 20);
DELETE FROM delivery_challans WHERE id IN (19, 20);

-- Proforma Invoices (this session: ids 22, 23)
DELETE FROM sales_attachments WHERE module_id IN (22, 23) AND module_type = 'proforma-invoice';
DELETE FROM sales_history     WHERE module_id IN (22, 23) AND module_type = 'proforma-invoice';
DELETE FROM sales_timeline    WHERE module_id IN (22, 23) AND module_type = 'proforma-invoice';
DELETE FROM proforma_invoice_items WHERE proforma_invoice_id IN (22, 23);
DELETE FROM proforma_invoices WHERE id IN (22, 23);

-- Invoices (this session: ids 17, 18)
DELETE FROM sales_attachments WHERE module_id IN (17, 18) AND module_type = 'invoice';
DELETE FROM sales_history     WHERE module_id IN (17, 18) AND module_type = 'invoice';
DELETE FROM sales_timeline    WHERE module_id IN (17, 18) AND module_type = 'invoice';
DELETE FROM invoice_items     WHERE invoice_id IN (17, 18);
DELETE FROM invoices          WHERE id IN (17, 18);

-- Credit Notes (this session: ids 13, 14)
DELETE FROM sales_attachments WHERE module_id IN (13, 14) AND module_type = 'credit-note';
DELETE FROM sales_history     WHERE module_id IN (13, 14) AND module_type = 'credit-note';
DELETE FROM sales_timeline    WHERE module_id IN (13, 14) AND module_type = 'credit-note';
DELETE FROM credit_note_items WHERE credit_note_id IN (13, 14);
DELETE FROM credit_notes      WHERE id IN (13, 14);

-- Payment Receipts (this session: ids 13, 14)
DELETE FROM sales_attachments WHERE module_id IN (13, 14) AND module_type = 'payment-receipt';
DELETE FROM sales_history     WHERE module_id IN (13, 14) AND module_type = 'payment-receipt';
DELETE FROM sales_timeline    WHERE module_id IN (13, 14) AND module_type = 'payment-receipt';
DELETE FROM payment_receipts  WHERE id IN (13, 14);

SET FOREIGN_KEY_CHECKS = 1;
