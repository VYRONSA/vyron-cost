-- VYRON COST — carry recipe precision through production into the Stock Master
--
-- WHY
-- BOM lines already store quantity at numeric(18,6) and unit_cost at (18,8),
-- because the costing workbooks genuinely use 0.006250 kg of salmon. Everything
-- downstream of the BOM was still numeric(14,4), so the moment a recipe entered
-- production the quantity was rounded to 0.0063 — the production run consumed
-- the wrong amount and the Stock Master balance was wrong by the difference.
--
-- Widening a numeric is lossless: every existing value re-stores unchanged.
-- None of these columns is generated and no view depends on them, so this is a
-- type widening only — no drop/re-add, no data movement, no behaviour change
-- for values that already fit.
--
-- Quantities go to (18,6) to match vyron_cost_bom_lines.quantity.
-- Costs go to (18,8) to match vyron_cost_bom_lines.unit_cost.
-- Values stay money-scaled at (18,2)/(18,4) as they already were.

alter table public.vyron_cost_production_run_lines
  alter column planned_qty type numeric(18,6),
  alter column actual_qty  type numeric(18,6),
  alter column unit_cost   type numeric(18,8);

alter table public.vyron_cost_stock_items
  alter column qty_on_hand  type numeric(18,6),
  alter column average_cost type numeric(18,8),
  alter column current_cost type numeric(18,8);

alter table public.vyron_cost_stock_ledger
  alter column quantity_in   type numeric(18,6),
  alter column quantity_out  type numeric(18,6),
  alter column balance_after type numeric(18,6),
  alter column unit_cost     type numeric(18,8);

alter table public.vyron_cost_inventory_transactions
  alter column quantity  type numeric(18,6),
  alter column unit_cost type numeric(18,8);

comment on column public.vyron_cost_stock_items.qty_on_hand is
  'Stock Master balance. Six decimals so recipe quantities such as 0.006250 post exactly.';
