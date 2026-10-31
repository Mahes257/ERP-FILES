SELECT 'orphan lead_activities' chk, COUNT(*) FROM lead_activities a LEFT JOIN leads l ON a.lead_id = l.id WHERE l.id IS NULL
UNION ALL SELECT 'orphan lead_history', COUNT(*) FROM lead_history h LEFT JOIN leads l ON h.lead_id = l.id WHERE l.id IS NULL
UNION ALL SELECT 'orphan lead_notes', COUNT(*) FROM lead_notes n LEFT JOIN leads l ON n.lead_id = l.id WHERE l.id IS NULL
UNION ALL SELECT 'orphan lead_timeline', COUNT(*) FROM lead_timeline t LEFT JOIN leads l ON t.lead_id = l.id WHERE l.id IS NULL
UNION ALL SELECT 'orphan lead_attachments', COUNT(*) FROM lead_attachments a LEFT JOIN leads l ON a.lead_id = l.id WHERE l.id IS NULL
UNION ALL SELECT 'orphan quotation_items', COUNT(*) FROM quotation_items i LEFT JOIN quotations q ON i.quotation_id = q.id WHERE q.id IS NULL
UNION ALL SELECT 'orphan sales_order_items', COUNT(*) FROM sales_order_items i LEFT JOIN sales_orders s ON i.sales_order_id = s.id WHERE s.id IS NULL
UNION ALL SELECT 'orphan invoice_items', COUNT(*) FROM invoice_items i LEFT JOIN invoices v ON i.invoice_id = v.id WHERE v.id IS NULL
UNION ALL SELECT 'orphan cpr_items', COUNT(*) FROM cpr_items i LEFT JOIN cprs c ON i.cpr_id = c.id WHERE c.id IS NULL
UNION ALL SELECT 'orphan cpr_history', COUNT(*) FROM cpr_history i LEFT JOIN cprs c ON i.cpr_id = c.id WHERE c.id IS NULL
UNION ALL SELECT 'orphan cpr_timeline', COUNT(*) FROM cpr_timeline i LEFT JOIN cprs c ON i.cpr_id = c.id WHERE c.id IS NULL
UNION ALL SELECT 'orphan cost_workout_items', COUNT(*) FROM cost_workout_items i LEFT JOIN cost_workouts c ON i.cost_workout_id = c.id WHERE c.id IS NULL
UNION ALL SELECT 'dangling client_id=7 docs', COUNT(*) FROM (
  SELECT id FROM quotations WHERE client_id = 7
  UNION ALL SELECT id FROM sales_orders WHERE client_id = 7
  UNION ALL SELECT id FROM delivery_challans WHERE client_id = 7
  UNION ALL SELECT id FROM proforma_invoices WHERE client_id = 7
  UNION ALL SELECT id FROM invoices WHERE client_id = 7
  UNION ALL SELECT id FROM credit_notes WHERE client_id = 7
  UNION ALL SELECT id FROM payment_receipts WHERE client_id = 7
) x
UNION ALL SELECT 'leftover AUDIT refs (leads/customers)', COUNT(*) FROM (
  SELECT id FROM leads WHERE name LIKE '%AUDIT%' OR business_name LIKE '%AUDIT%' OR internal_notes LIKE '%AUDIT%'
  UNION ALL SELECT id FROM customers WHERE business_name LIKE '%AUDIT%'
) x
UNION ALL SELECT 'leftover AUDIT refs (docs)', COUNT(*) FROM (
  SELECT id FROM quotations WHERE quotation_no LIKE '%AUDIT%' OR client_name LIKE '%AUDIT%' OR lead_no LIKE '%AUDIT%'
  UNION ALL SELECT id FROM cprs WHERE pr_no LIKE '%AUDIT%' OR client_name LIKE '%AUDIT%' OR source_lead LIKE '%AUDIT%'
  UNION ALL SELECT id FROM cost_workouts WHERE cw_no LIKE '%AUDIT%' OR customer_name LIKE '%AUDIT%'
) x;
