-- Performance: RPC to count low-stock inventory items in DB instead of JS
-- Applied: 2026-05-21
-- Replaces fetching all inventory_items rows and filtering in JavaScript.

CREATE OR REPLACE FUNCTION get_branch_low_stock_count(p_branch_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
AS $$
  SELECT COUNT(*)::integer
  FROM inventory_items
  WHERE branch_id = p_branch_id
    AND quantity IS NOT NULL
    AND reorder_level IS NOT NULL
    AND quantity <= reorder_level;
$$;
