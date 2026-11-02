-- =============================================================================
-- Product cost lines: link each line to the ingredient it costs.
--
-- vyron_cost_product_cost_lines stored the ingredient only as free text
-- (line_name), so renaming a raw material left the old name on every product
-- cost breakdown (Kingdom Foods, 2026-11). This adds an optional ingredient_id:
-- the application links new and edited lines, and renames linked lines when the
-- ingredient is renamed.
--
-- Safe to run more than once. No line is deleted or re-costed:
--   * the column is nullable, and deleting an ingredient only clears the link
--     (on delete set null), never the cost line;
--   * existing lines are linked only when EXACTLY ONE ingredient of the SAME
--     company has the same name (ignoring case and surrounding/double spaces)
--     and the line is a material line (not labour, overhead or wastage).
--     Ambiguous and unmatched lines stay unlinked and keep their text.
--
-- Rollback:
--   drop index if exists public.vyron_cost_product_cost_lines_ingredient_idx;
--   alter table public.vyron_cost_product_cost_lines drop column if exists ingredient_id;
-- =============================================================================

alter table public.vyron_cost_product_cost_lines
  add column if not exists ingredient_id uuid
    references public.vyron_cost_ingredients (id) on delete set null;

create index if not exists vyron_cost_product_cost_lines_ingredient_idx
  on public.vyron_cost_product_cost_lines (company_id, ingredient_id)
  where ingredient_id is not null;

with matches as (
  select l.id as line_id, min(i.id::text)::uuid as ingredient_id, count(*) as n
  from public.vyron_cost_product_cost_lines l
  join public.vyron_cost_ingredients i
    on i.company_id = l.company_id
   and lower(regexp_replace(btrim(i.ingredient_name), '\s+', ' ', 'g')) = lower(regexp_replace(btrim(l.line_name), '\s+', ' ', 'g'))
  where l.ingredient_id is null
    and lower(coalesce(l.line_type, 'Ingredient')) in ('ingredient', 'packaging', 'raw material', 'material')
    and coalesce(btrim(l.line_name), '') <> ''
  group by l.id
)
update public.vyron_cost_product_cost_lines l
set ingredient_id = m.ingredient_id
from matches m
where l.id = m.line_id
  and m.n = 1;
