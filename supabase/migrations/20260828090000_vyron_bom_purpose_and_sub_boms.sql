-- VYRON COST — BOM purpose, and BOMs inside BOMs
--
-- WHAT THE SCHEMA ALREADY HAD
-- vyron_cost_boms carries product_id (the finished product) but nothing that
-- says what a BOM is *for*. "Has a product" is not the same statement: a
-- finished-good BOM exists before anyone assigns its product, and a sub-assembly
-- may never have one. So the purpose is recorded explicitly rather than inferred
-- from a nullable link.
--
-- vyron_cost_bom_lines carries ingredient_id and component_id. component_id
-- groups a line inside its own BOM; it is not a reference to another BOM, and
-- neither is ingredient_id. A line that stands for another BOM therefore needs
-- its own column — overloading ingredient_id would make "is this an ingredient
-- or an assembly?" unanswerable from the row.
--
-- CROSS-TENANT REFERENCES ARE IMPOSSIBLE, NOT MERELY CHECKED
-- child_bom_id is enforced by a composite foreign key on (child_bom_id,
-- company_id), so a line can only ever point at a BOM in its own company. That
-- is a database guarantee; no application path, migration or manual query can
-- create a cross-tenant reference. The unique key it needs on
-- (id, company_id) is redundant against the primary key but is what lets the
-- composite reference exist.

-- ---------------------------------------------------------------------------
-- BOM purpose
-- ---------------------------------------------------------------------------
alter table public.vyron_cost_boms
  add column if not exists bom_purpose text not null default 'Finished Good';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'vyron_cost_boms_purpose_check') then
    alter table public.vyron_cost_boms
      add constraint vyron_cost_boms_purpose_check
      check (bom_purpose in ('Finished Good', 'Sub-BOM'));
  end if;
end $$;

comment on column public.vyron_cost_boms.bom_purpose is
  'What this BOM is for: a sellable Finished Good, or a Sub-BOM used inside another BOM. Not inferred from product_id.';

-- Every existing BOM keeps the meaning it already had. The default above leaves
-- all of them as Finished Good, which is what they are: nothing is reclassified.

-- ---------------------------------------------------------------------------
-- A BOM line that stands for another BOM
-- ---------------------------------------------------------------------------
alter table public.vyron_cost_bom_lines
  add column if not exists child_bom_id uuid;

do $$
begin
  -- Needed for the composite reference below.
  if not exists (select 1 from pg_constraint where conname = 'vyron_cost_boms_id_company_key') then
    alter table public.vyron_cost_boms
      add constraint vyron_cost_boms_id_company_key unique (id, company_id);
  end if;

  -- The tenant guarantee: a child BOM must live in the same company as the line.
  if not exists (select 1 from pg_constraint where conname = 'vyron_bom_lines_child_bom_same_company_fk') then
    alter table public.vyron_cost_bom_lines
      add constraint vyron_bom_lines_child_bom_same_company_fk
      foreign key (child_bom_id, company_id)
      references public.vyron_cost_boms (id, company_id)
      on delete restrict;
  end if;

  -- The composite key above is only enforced when both columns are present, so a
  -- child reference without a company would slip past it.
  if not exists (select 1 from pg_constraint where conname = 'vyron_bom_lines_child_requires_company_check') then
    alter table public.vyron_cost_bom_lines
      add constraint vyron_bom_lines_child_requires_company_check
      check (child_bom_id is null or company_id is not null);
  end if;

  -- A line is an ingredient or an assembly, never both.
  if not exists (select 1 from pg_constraint where conname = 'vyron_bom_lines_ingredient_xor_child_check') then
    alter table public.vyron_cost_bom_lines
      add constraint vyron_bom_lines_ingredient_xor_child_check
      check (child_bom_id is null or ingredient_id is null);
  end if;

  -- The shallowest cycle, refused by the database. Deeper cycles need a graph
  -- traversal and are refused in the application before the insert is attempted.
  if not exists (select 1 from pg_constraint where conname = 'vyron_bom_lines_no_self_reference_check') then
    alter table public.vyron_cost_bom_lines
      add constraint vyron_bom_lines_no_self_reference_check
      check (child_bom_id is null or child_bom_id <> bom_id);
  end if;
end $$;

create index if not exists idx_vyron_bom_lines_child_bom
  on public.vyron_cost_bom_lines (company_id, child_bom_id)
  where child_bom_id is not null;

comment on column public.vyron_cost_bom_lines.child_bom_id is
  'The BOM this line stands for. Mutually exclusive with ingredient_id, and constrained to the same company.';
