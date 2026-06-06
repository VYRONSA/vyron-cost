-- VYRON COST — Batch D: Manufacturing & Production Intelligence
-- Run after inventory-batch-c-intelligence.sql

-- ---------------------------------------------------------------------------
-- BOM tables (if not already created via Supabase UI)
-- ---------------------------------------------------------------------------
create table if not exists public.vyron_cost_boms (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.vyron_cost_companies(id) on delete cascade,
  bom_name text not null,
  category text,
  yield_qty numeric(12,3) not null default 1,
  yield_unit text default 'unit',
  target_gp numeric(8,2),
  selling_price numeric(12,2),
  total_cost numeric(12,2) not null default 0,
  cost_per_unit numeric(12,4) not null default 0,
  calculated_gp numeric(8,2),
  suggested_selling_price numeric(12,2),
  status text default 'Draft',
  notes text,
  product_id uuid references public.vyron_cost_products(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vyron_cost_bom_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.vyron_cost_companies(id) on delete cascade,
  bom_id uuid not null references public.vyron_cost_boms(id) on delete cascade,
  line_type text not null default 'Ingredient',
  ingredient_id uuid references public.vyron_cost_ingredients(id) on delete set null,
  line_name text not null,
  quantity numeric(14,4) not null default 0,
  unit text not null default 'kg',
  unit_cost numeric(14,4) not null default 0,
  wastage_percent numeric(8,2) not null default 0,
  line_cost numeric(14,2) not null default 0,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_vyron_boms_company on public.vyron_cost_boms(company_id, bom_name);
create index if not exists idx_vyron_bom_lines_bom on public.vyron_cost_bom_lines(bom_id);

-- ---------------------------------------------------------------------------
-- Production runs
-- ---------------------------------------------------------------------------
create table if not exists public.vyron_cost_production_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.vyron_cost_companies(id) on delete cascade,
  run_number text not null,
  bom_id uuid references public.vyron_cost_boms(id) on delete set null,
  recipe_id uuid references public.vyron_cost_recipes(id) on delete set null,
  product_id uuid references public.vyron_cost_products(id) on delete set null,
  bom_name_snapshot text not null,
  product_name_snapshot text,
  status text not null default 'Planned',
  batch_multiplier numeric(12,4) not null default 1,
  planned_qty numeric(14,4) not null default 0,
  actual_qty numeric(14,4) not null default 0,
  yield_pct numeric(8,2) not null default 0,
  yield_status text,
  wastage_pct numeric(8,2) not null default 0,
  ingredient_cost numeric(14,2) not null default 0,
  packaging_cost numeric(14,2) not null default 0,
  labour_cost numeric(14,2) not null default 0,
  overhead_cost numeric(14,2) not null default 0,
  ingredient_waste_value numeric(14,2) not null default 0,
  packaging_waste_value numeric(14,2) not null default 0,
  total_production_cost numeric(14,2) not null default 0,
  cost_per_unit numeric(14,4) not null default 0,
  planned_cost numeric(14,2) not null default 0,
  actual_cost numeric(14,2) not null default 0,
  cost_variance_pct numeric(8,2) not null default 0,
  planned_usage_value numeric(14,2) not null default 0,
  actual_usage_value numeric(14,2) not null default 0,
  usage_variance_pct numeric(8,2) not null default 0,
  production_efficiency_pct numeric(8,2) not null default 0,
  stock_override boolean not null default false,
  stock_override_by text,
  stock_override_reason text,
  notes text,
  created_by text,
  approved_by text,
  started_by text,
  completed_by text,
  approved_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, run_number)
);

create index if not exists idx_vyron_prod_runs_company on public.vyron_cost_production_runs(company_id, status, created_at desc);

create table if not exists public.vyron_cost_production_run_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.vyron_cost_companies(id) on delete cascade,
  production_run_id uuid not null references public.vyron_cost_production_runs(id) on delete cascade,
  line_type text not null,
  ingredient_id uuid references public.vyron_cost_ingredients(id) on delete set null,
  stock_item_id uuid references public.vyron_cost_stock_items(id) on delete set null,
  line_name text not null,
  unit text not null default 'kg',
  planned_qty numeric(14,4) not null default 0,
  actual_qty numeric(14,4) not null default 0,
  unit_cost numeric(14,4) not null default 0,
  planned_value numeric(14,2) not null default 0,
  actual_value numeric(14,2) not null default 0,
  sort_order int not null default 0
);

create table if not exists public.vyron_cost_production_labour (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.vyron_cost_companies(id) on delete cascade,
  production_run_id uuid not null references public.vyron_cost_production_runs(id) on delete cascade,
  description text not null default 'Direct Labour',
  hours numeric(10,2) not null default 0,
  rate numeric(14,2) not null default 0,
  labour_cost numeric(14,2) not null default 0
);

create table if not exists public.vyron_cost_production_overhead (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.vyron_cost_companies(id) on delete cascade,
  production_run_id uuid not null references public.vyron_cost_production_runs(id) on delete cascade,
  overhead_type text not null,
  allocation_method text not null,
  amount numeric(14,2) not null default 0,
  percent_value numeric(8,2),
  allocated_cost numeric(14,2) not null default 0
);

create table if not exists public.vyron_cost_production_wastage (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.vyron_cost_companies(id) on delete cascade,
  production_run_id uuid not null references public.vyron_cost_production_runs(id) on delete cascade,
  waste_category text not null,
  line_name text not null,
  ingredient_id uuid references public.vyron_cost_ingredients(id) on delete set null,
  waste_qty numeric(14,4) not null default 0,
  waste_value numeric(14,2) not null default 0,
  waste_reason text not null default 'Other'
);

create table if not exists public.vyron_cost_production_audit_log (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.vyron_cost_companies(id) on delete cascade,
  production_run_id uuid references public.vyron_cost_production_runs(id) on delete cascade,
  event_type text not null,
  actor text,
  field_name text,
  old_value text,
  new_value text,
  detail text,
  created_at timestamptz not null default now()
);

create index if not exists idx_vyron_prod_audit_run on public.vyron_cost_production_audit_log(production_run_id, created_at desc);

alter table public.vyron_cost_boms enable row level security;
alter table public.vyron_cost_bom_lines enable row level security;
alter table public.vyron_cost_production_runs enable row level security;
alter table public.vyron_cost_production_run_lines enable row level security;
alter table public.vyron_cost_production_labour enable row level security;
alter table public.vyron_cost_production_overhead enable row level security;
alter table public.vyron_cost_production_wastage enable row level security;
alter table public.vyron_cost_production_audit_log enable row level security;

drop policy if exists "demo read boms" on public.vyron_cost_boms;
drop policy if exists "demo write boms" on public.vyron_cost_boms;
drop policy if exists "demo read bom lines" on public.vyron_cost_bom_lines;
drop policy if exists "demo write bom lines" on public.vyron_cost_bom_lines;
drop policy if exists "demo read production runs" on public.vyron_cost_production_runs;
drop policy if exists "demo write production runs" on public.vyron_cost_production_runs;
drop policy if exists "demo read production run lines" on public.vyron_cost_production_run_lines;
drop policy if exists "demo write production run lines" on public.vyron_cost_production_run_lines;
drop policy if exists "demo read production labour" on public.vyron_cost_production_labour;
drop policy if exists "demo write production labour" on public.vyron_cost_production_labour;
drop policy if exists "demo read production overhead" on public.vyron_cost_production_overhead;
drop policy if exists "demo write production overhead" on public.vyron_cost_production_overhead;
drop policy if exists "demo read production wastage" on public.vyron_cost_production_wastage;
drop policy if exists "demo write production wastage" on public.vyron_cost_production_wastage;
drop policy if exists "demo read production audit" on public.vyron_cost_production_audit_log;
drop policy if exists "demo write production audit" on public.vyron_cost_production_audit_log;

create policy "demo read boms" on public.vyron_cost_boms for select using (true);
create policy "demo write boms" on public.vyron_cost_boms for all using (true) with check (true);
create policy "demo read bom lines" on public.vyron_cost_bom_lines for select using (true);
create policy "demo write bom lines" on public.vyron_cost_bom_lines for all using (true) with check (true);
create policy "demo read production runs" on public.vyron_cost_production_runs for select using (true);
create policy "demo write production runs" on public.vyron_cost_production_runs for all using (true) with check (true);
create policy "demo read production run lines" on public.vyron_cost_production_run_lines for select using (true);
create policy "demo write production run lines" on public.vyron_cost_production_run_lines for all using (true) with check (true);
create policy "demo read production labour" on public.vyron_cost_production_labour for select using (true);
create policy "demo write production labour" on public.vyron_cost_production_labour for all using (true) with check (true);
create policy "demo read production overhead" on public.vyron_cost_production_overhead for select using (true);
create policy "demo write production overhead" on public.vyron_cost_production_overhead for all using (true) with check (true);
create policy "demo read production wastage" on public.vyron_cost_production_wastage for select using (true);
create policy "demo write production wastage" on public.vyron_cost_production_wastage for all using (true) with check (true);
create policy "demo read production audit" on public.vyron_cost_production_audit_log for select using (true);
create policy "demo write production audit" on public.vyron_cost_production_audit_log for all using (true) with check (true);
