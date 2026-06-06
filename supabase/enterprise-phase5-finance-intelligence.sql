-- VYRON COST — Phase 5: VYRON FINANCE Intelligence Layer
-- Run after: enterprise-phase4-ai-financial.sql

create table if not exists public.vyron_finance_import_batches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.vyron_cost_companies(id) on delete cascade,
  import_type text not null,
  file_name text not null,
  row_count int not null default 0,
  valid_rows int not null default 0,
  rejected_rows int not null default 0,
  status text not null default 'completed',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.vyron_finance_trial_balance_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.vyron_cost_companies(id) on delete cascade,
  account_code text not null,
  account_name text not null,
  account_type text not null,
  debit numeric(14,2) not null default 0,
  credit numeric(14,2) not null default 0,
  movement numeric(14,2) not null default 0,
  prior_balance numeric(14,2) not null default 0,
  period_label text not null default 'current',
  source text not null default 'computed',
  created_at timestamptz not null default now()
);

create index if not exists idx_vyron_finance_tb_company
  on public.vyron_finance_trial_balance_lines(company_id, period_label);

create table if not exists public.vyron_finance_statement_snapshots (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.vyron_cost_companies(id) on delete cascade,
  statement_type text not null,
  period_type text not null default 'monthly',
  period_label text not null,
  lines jsonb not null default '[]'::jsonb,
  comparatives jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.vyron_finance_health_snapshots (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.vyron_cost_companies(id) on delete cascade,
  liquidity_score numeric(5,2) not null default 0,
  profitability_score numeric(5,2) not null default 0,
  efficiency_score numeric(5,2) not null default 0,
  inventory_health_score numeric(5,2) not null default 0,
  recovery_health_score numeric(5,2) not null default 0,
  supplier_risk_score numeric(5,2) not null default 0,
  overall_score numeric(5,2) not null default 0,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.vyron_finance_audit_findings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.vyron_cost_companies(id) on delete cascade,
  finding_type text not null,
  severity text not null default 'medium',
  title text not null,
  detail text,
  exposure numeric(14,2) not null default 0,
  href text,
  data_used jsonb not null default '{}'::jsonb,
  formula text,
  confidence numeric(5,2) not null default 80,
  status text not null default 'open',
  created_at timestamptz not null default now()
);

create table if not exists public.vyron_finance_foundation_registry (
  id uuid primary key default gen_random_uuid(),
  entity_key text not null unique,
  entity_label text not null,
  source_table text,
  finance_ready boolean not null default true,
  sync_notes text,
  created_at timestamptz not null default now()
);

insert into public.vyron_finance_foundation_registry (entity_key, entity_label, source_table, sync_notes)
values
  ('suppliers', 'Suppliers', 'vyron_cost_suppliers', 'Shared supplier master for AP and costing'),
  ('inventory', 'Inventory', 'vyron_cost_inventory_items', 'Stock valuation feeds balance sheet'),
  ('purchase_orders', 'Purchasing', 'vyron_cost_purchase_orders', 'Commitments and GRN matching'),
  ('costing', 'Product Costing', 'vyron_cost_products', 'Revenue and COS for income statement'),
  ('recoveries', 'Recoveries', 'vyron_recovery_opportunities', 'Recovery benefit in P&L'),
  ('audit_trails', 'Audit Trails', 'vyron_procurement_audit_log', 'Audit intelligence and compliance')
on conflict (entity_key) do nothing;

alter table public.vyron_finance_import_batches enable row level security;
alter table public.vyron_finance_trial_balance_lines enable row level security;
alter table public.vyron_finance_statement_snapshots enable row level security;
alter table public.vyron_finance_health_snapshots enable row level security;
alter table public.vyron_finance_audit_findings enable row level security;
alter table public.vyron_finance_foundation_registry enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'vyron_finance_import_batches','vyron_finance_trial_balance_lines',
    'vyron_finance_statement_snapshots','vyron_finance_health_snapshots',
    'vyron_finance_audit_findings','vyron_finance_foundation_registry'
  ] loop
    execute format('drop policy if exists "demo read %s" on public.%I', t, t);
    execute format('drop policy if exists "demo write %s" on public.%I', t, t);
    execute format('create policy "demo read %s" on public.%I for select using (true)', t, t);
    execute format('create policy "demo write %s" on public.%I for all using (true) with check (true)', t, t);
  end loop;
end $$;
