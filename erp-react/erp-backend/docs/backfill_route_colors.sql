-- Backfill route_color for existing marketing_travel_plans that have no color set.
-- Uses a deterministic assignment based on ID so colors stay stable across restarts.

UPDATE marketing_travel_plans
SET route_color = CASE (id % 8)
    WHEN 0 THEN '#2563eb'
    WHEN 1 THEN '#dc2626'
    WHEN 2 THEN '#059669'
    WHEN 3 THEN '#7c3aed'
    WHEN 4 THEN '#d97706'
    WHEN 5 THEN '#0891b2'
    WHEN 6 THEN '#e11d48'
    WHEN 7 THEN '#4f46e5'
END
WHERE route_color IS NULL OR route_color = '';
