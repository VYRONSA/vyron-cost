-- VYRON COST — Recipe Components
--
-- WHY
-- A finished pack is one BOM, but the costing workbooks build it from several
-- named parts: Salmon & Avo Cali, Salmon maki, Salmon Roses, Condiments,
-- Packaging. Until now those parts survived only as sort_order blocks with the
-- names buried in a notes string, so the screen showed one flat list of lines
-- and the structure the business actually costs against was invisible.
--
-- Components are LOCAL to their parent BOM. The same name legitimately appears
-- in many packs with different ingredients: "Salmon Roses" exists in seven
-- Northwood BOMs at five different costs, because a pack decides its own
-- quantities. There is deliberately no global component master and no shared
-- component id — linking them would corrupt costing the moment one pack changed.
--
-- This is grouping metadata only. line_cost stays generated, computeRecipeCosts
-- stays the single costing engine, and a component subtotal is just the sum of
-- its lines. No cost value moves.

create table if not exists public.vyron_cost_bom_components (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.vyron_cost_companies(id) on delete cascade,
  bom_id uuid not null references public.vyron_cost_boms(id) on delete cascade,
  name text not null,
  component_type text not null default 'Product Component',
  sort_order integer not null default 0,
  yield_qty numeric(18,6),
  yield_unit text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- company_id is carried on the row so a component is scoped exactly the way
-- lines already are, rather than only through a join to its parent.
create index if not exists idx_vyron_cost_bom_components_bom
  on public.vyron_cost_bom_components (company_id, bom_id, sort_order);

/*
 * Nullable, and ON DELETE SET NULL: removing a component must never take
 * costing lines with it. An unassigned line still costs correctly — it simply
 * shows outside any component.
 *
 * line_cost is GENERATED from quantity, unit_cost and wastage_percent only, so
 * adding a column does not touch it. No drop/re-add, no table rewrite, and no
 * risk to the existing rows in any tenant.
 */
alter table public.vyron_cost_bom_lines
  add column if not exists component_id uuid
    references public.vyron_cost_bom_components(id) on delete set null;

create index if not exists idx_vyron_cost_bom_lines_component
  on public.vyron_cost_bom_lines (component_id);

comment on table public.vyron_cost_bom_components is
  'Named parts of one BOM (pack). Local to the parent BOM — never shared between BOMs.';
comment on column public.vyron_cost_bom_lines.component_id is
  'Owning component within the same BOM. Null means the line is not grouped.';

-- Access mirrors vyron_cost_bom_lines exactly: tenant scoping is enforced in the
-- API through the verified workspace, not by widening what this table allows.
alter table public.vyron_cost_bom_components enable row level security;

drop policy if exists "allow all bom components" on public.vyron_cost_bom_components;
create policy "allow all bom components" on public.vyron_cost_bom_components using (true) with check (true);

grant all on table public.vyron_cost_bom_components to anon;
grant all on table public.vyron_cost_bom_components to authenticated;
grant all on table public.vyron_cost_bom_components to service_role;
