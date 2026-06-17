-- BOM / recipe tables: workspace company scoping + product link

alter table if exists public.vyron_cost_boms
  add column if not exists company_id uuid references public.vyron_cost_companies(id) on delete cascade,
  add column if not exists product_id uuid references public.vyron_cost_products(id) on delete set null,
  add column if not exists bom_name text,
  add column if not exists category text,
  add column if not exists yield_qty numeric(12,3) default 1,
  add column if not exists yield_unit text default 'unit',
  add column if not exists target_gp numeric(8,2),
  add column if not exists selling_price numeric(12,2),
  add column if not exists total_cost numeric(12,2) default 0,
  add column if not exists cost_per_unit numeric(12,4) default 0,
  add column if not exists calculated_gp numeric(8,2),
  add column if not exists suggested_selling_price numeric(12,2),
  add column if not exists status text default 'Draft',
  add column if not exists notes text,
  add column if not exists updated_at timestamptz default now();

alter table if exists public.vyron_cost_bom_lines
  add column if not exists company_id uuid references public.vyron_cost_companies(id) on delete cascade,
  add column if not exists line_type text default 'Ingredient',
  add column if not exists ingredient_id uuid references public.vyron_cost_ingredients(id) on delete set null,
  add column if not exists line_name text,
  add column if not exists quantity numeric(14,4) default 0,
  add column if not exists unit text default 'kg',
  add column if not exists unit_cost numeric(14,4) default 0,
  add column if not exists wastage_percent numeric(8,2) default 0,
  add column if not exists line_cost numeric(14,2) default 0,
  add column if not exists sort_order int default 0;

create index if not exists idx_vyron_boms_company on public.vyron_cost_boms(company_id, bom_name);
create index if not exists idx_vyron_bom_lines_bom on public.vyron_cost_bom_lines(bom_id);
create index if not exists idx_vyron_bom_lines_company on public.vyron_cost_bom_lines(company_id, bom_id);
