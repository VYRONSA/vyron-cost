-- Sprint 2A: Store-order-driven production planning
-- Distinct from Batch D manufacturing execution (vyron_cost_production_runs).

create table if not exists public.vyron_cost_store_production_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  run_number text not null,
  production_date date not null default current_date,
  status text not null default 'Draft',
  notes text null,
  created_by text null,
  total_cost numeric(14, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists vyron_cost_store_production_runs_company_number_uidx
  on public.vyron_cost_store_production_runs (company_id, run_number);

create index if not exists vyron_cost_store_production_runs_company_status_idx
  on public.vyron_cost_store_production_runs (company_id, status);

create table if not exists public.vyron_cost_store_production_run_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  production_run_id uuid not null references public.vyron_cost_store_production_runs (id) on delete cascade,
  product_id uuid not null,
  product_name text not null,
  required_qty numeric(14, 4) not null default 0,
  planned_qty numeric(14, 4) not null default 0,
  produced_qty numeric(14, 4) not null default 0,
  unit_cost numeric(14, 4) not null default 0,
  total_cost numeric(14, 2) not null default 0,
  store_contributions jsonb not null default '[]'::jsonb,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists vyron_cost_store_production_run_lines_run_id_idx
  on public.vyron_cost_store_production_run_lines (production_run_id);

create index if not exists vyron_cost_store_production_run_lines_company_id_idx
  on public.vyron_cost_store_production_run_lines (company_id);
