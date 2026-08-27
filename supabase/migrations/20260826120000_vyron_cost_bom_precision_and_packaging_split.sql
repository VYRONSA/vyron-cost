-- VYRON COST — BOM line precision widening + additive packaging cost split
--
-- WHY
-- The production costing workbooks carry quantities such as 0.006250 and unit
-- costs such as 1.7414892. vyron_cost_bom_lines stored quantity and unit_cost as
-- numeric(14,4), which silently rounded 0.006250 to 0.0063 and inflated the
-- affected line by R0.019. 73 quantities across the 2026 range need more than
-- four decimal places, so the column — not the workbook — was the defect.
--
-- line_cost is a generated column. Postgres cannot retype a column that a
-- generated column depends on, so line_cost is dropped and re-added. The
-- expression below is copied verbatim from the production schema dump
-- (COALESCE wrappers included) so the semantics are preserved exactly; it is
-- not reconstructed from application code.
--
-- Widening a numeric is lossless: every existing value re-stores identically.
-- line_cost is recomputed from unchanged inputs by the same expression and
-- gains precision (0.7323 -> 0.73225100) rather than changing value.
--
-- ingredient_cost / packaging_cost are ADDITIVE. total_cost keeps its current
-- meaning (ingredient_cost + packaging_cost), so no existing recipe total moves.

alter table public.vyron_cost_bom_lines drop column line_cost;

alter table public.vyron_cost_bom_lines
  alter column quantity  type numeric(18,6),
  alter column unit_cost type numeric(18,8);

alter table public.vyron_cost_bom_lines
  add column line_cost numeric(18,8) generated always as (
    ((COALESCE(quantity, (0)::numeric) * COALESCE(unit_cost, (0)::numeric)) * ((1)::numeric + (COALESCE(wastage_percent, (0)::numeric) / (100)::numeric)))
  ) stored;

alter table public.vyron_cost_boms
  add column if not exists ingredient_cost numeric(18,8),
  add column if not exists packaging_cost  numeric(18,8);

comment on column public.vyron_cost_boms.ingredient_cost is
  'Sum of non-packaging BOM lines. Partitioned case-insensitively on line_type.';
comment on column public.vyron_cost_boms.packaging_cost is
  'Sum of BOM lines whose line_type is packaging in any casing. total_cost = ingredient_cost + packaging_cost.';
