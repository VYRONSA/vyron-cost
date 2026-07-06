-- Manufacturing platform foundation sync.
-- Purpose: ensure Batch D manufacturing execution schema is present in managed migration flow,
-- and align dependent stock/finished-goods/customer-invoice surfaces used by production workflows.

-- ---------------------------------------------------------------------------
-- Manufacturing execution (Batch D parity)
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

create index if not exists idx_vyron_prod_runs_company
  on public.vyron_cost_production_runs(company_id, status, created_at desc);

create index if not exists idx_vyron_prod_runs_completed
  on public.vyron_cost_production_runs(company_id, completed_at desc)
  where status = 'Completed';

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

create index if not exists idx_vyron_prod_audit_run
  on public.vyron_cost_production_audit_log(production_run_id, created_at desc);

alter table public.vyron_cost_production_runs enable row level security;
alter table public.vyron_cost_production_run_lines enable row level security;
alter table public.vyron_cost_production_labour enable row level security;
alter table public.vyron_cost_production_overhead enable row level security;
alter table public.vyron_cost_production_wastage enable row level security;
alter table public.vyron_cost_production_audit_log enable row level security;

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

-- ---------------------------------------------------------------------------
-- Stock + finished goods + customer invoice alignment used by manufacturing flow
-- ---------------------------------------------------------------------------
create table if not exists public.vyron_stock_movements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid null,
  movement_date date not null default current_date,
  item_type text not null check (item_type in ('raw_material','packaging','finished_good')),
  item_id text not null,
  item_name text not null,
  movement_type text not null,
  reference_number text not null,
  quantity_in numeric(18,4) not null default 0,
  quantity_out numeric(18,4) not null default 0,
  unit_cost numeric(18,4) not null default 0,
  total_value numeric(18,2) generated always as ((case when quantity_in > 0 then quantity_in else quantity_out end) * unit_cost) stored,
  related_document_id uuid null,
  notes text null,
  created_at timestamptz not null default now()
);

create index if not exists idx_vyron_stock_movements_item
  on public.vyron_stock_movements(item_type, item_id);

create index if not exists idx_vyron_stock_movements_ref
  on public.vyron_stock_movements(reference_number);

create table if not exists public.vyron_finished_goods (
  id uuid primary key default gen_random_uuid(),
  company_id uuid null,
  product_code text not null,
  product_name text not null,
  category text null,
  current_stock numeric(18,4) not null default 0,
  stock_value numeric(18,2) not null default 0,
  standard_cost numeric(18,4) not null default 0,
  latest_actual_cost numeric(18,4) not null default 0,
  selling_price numeric(18,4) not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.vyron_finished_goods
  add column if not exists company_id uuid null,
  add column if not exists category text null,
  add column if not exists current_stock numeric(18,4) not null default 0,
  add column if not exists stock_value numeric(18,2) not null default 0,
  add column if not exists standard_cost numeric(18,4) not null default 0,
  add column if not exists latest_actual_cost numeric(18,4) not null default 0,
  add column if not exists active boolean not null default true,
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.vyron_customer_invoices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid null,
  customer_id uuid null,
  customer_name text not null,
  invoice_number text not null unique,
  invoice_date date not null default current_date,
  due_date date null,
  status text not null default 'Draft',
  sales_value numeric(18,2) not null default 0,
  cost_value numeric(18,2) not null default 0,
  gross_profit numeric(18,2) not null default 0,
  gp_percentage numeric(9,2) not null default 0,
  stock_posted boolean not null default false,
  posted_at timestamptz null,
  stock_reversed boolean not null default false,
  stock_reversed_at timestamptz null,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.vyron_customer_invoices
  add column if not exists stock_posted boolean not null default false,
  add column if not exists posted_at timestamptz null,
  add column if not exists stock_reversed boolean not null default false,
  add column if not exists stock_reversed_at timestamptz null,
  add column if not exists notes text null,
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.vyron_customer_invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.vyron_customer_invoices(id) on delete cascade,
  product_id uuid null,
  product_name text not null,
  quantity numeric(18,4) not null default 0,
  selling_price numeric(18,4) not null default 0,
  cost_per_unit numeric(18,4) not null default 0,
  line_total numeric(18,2) generated always as (quantity * selling_price) stored,
  line_cost numeric(18,2) generated always as (quantity * cost_per_unit) stored,
  line_gp numeric(18,2) generated always as ((quantity * selling_price) - (quantity * cost_per_unit)) stored,
  created_at timestamptz not null default now()
);

create index if not exists idx_vyron_customer_invoices_company
  on public.vyron_customer_invoices (company_id, invoice_date desc, created_at desc);

create index if not exists idx_vyron_customer_invoice_lines_invoice
  on public.vyron_customer_invoice_lines (invoice_id, created_at);

-- ---------------------------------------------------------------------------
-- Procurement/GRN alignment surfaced by schema validation
-- ---------------------------------------------------------------------------
alter table if exists public.vyron_cost_goods_receipt_lines
  add column if not exists updated_at timestamptz not null default now();
