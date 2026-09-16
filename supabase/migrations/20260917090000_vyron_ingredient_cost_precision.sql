-- Ingredient master cost precision: numeric(12,2) -> numeric(18,8).
--
-- WHY
-- vyron_cost_ingredients.purchase_cost and true_unit_cost were created as
-- numeric(12,2) in production, while every other cost the ingredient feeds is
-- already numeric(18,8): vyron_cost_bom_lines.unit_cost / line_cost and
-- vyron_cost_stock_items.current_cost / average_cost. The application writes
-- these two columns unrounded, so the column itself silently rounded any cost
-- below a cent (a R0.05064 label was stored as R0.05).
--
-- WHAT
-- Widens exactly these two columns to the scale the rest of the costing chain
-- uses. numeric(18,8) keeps the same 10 integer digits as numeric(12,2), so
-- every existing value (all carry 2 decimals) is stored unchanged. Nothing in
-- the database depends on either column (no view, rule, function, trigger,
-- index, generated column or policy); only their DEFAULT 0 refers to them.
--
-- Changes no other column (previous_cost stays numeric(12,2)), no data, no
-- other table. Re-running it is a no-op: the columns already have this type.
--
-- EFFECT FOR EVERY TENANT: from now on an ingredient cost saved with more than
-- two decimals keeps up to eight, as BOM lines and stock items already do.

alter table public.vyron_cost_ingredients
  alter column purchase_cost type numeric(18,8),
  alter column true_unit_cost type numeric(18,8);
