-- VYRON COST — Phase 6: Enterprise Platform Architecture
-- Run after: enterprise-phase5-finance-intelligence.sql

create table if not exists public.vyron_enterprise_groups (
  id uuid primary key default gen_random_uuid(),
  group_key text not null unique,
  group_name text not null,
  structure_type text not null default 'holding',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.vyron_enterprise_org_units (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.vyron_enterprise_groups(id) on delete cascade,
  company_id uuid references public.vyron_cost_companies(id) on delete set null,
  unit_type text not null,
  unit_key text not null,
  unit_label text not null,
  parent_unit_id uuid references public.vyron_enterprise_org_units(id) on delete set null,
  industry text default 'food_manufacturing',
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (group_id, unit_key)
);

create table if not exists public.vyron_enterprise_intercompany (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.vyron_enterprise_groups(id) on delete cascade,
  transaction_type text not null,
  from_unit_key text not null,
  to_unit_key text not null,
  reference text,
  amount numeric(14,2) not null default 0,
  status text not null default 'open',
  data_used jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.vyron_enterprise_benchmark_snapshots (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.vyron_enterprise_groups(id) on delete cascade,
  dimension text not null,
  unit_key text not null,
  unit_label text not null,
  metric_key text not null,
  metric_value numeric(14,4) not null default 0,
  rank_position int,
  created_at timestamptz not null default now()
);

create table if not exists public.vyron_enterprise_global_roles (
  role_key text primary key,
  role_name text not null,
  scope text not null default 'group',
  description text
);

insert into public.vyron_enterprise_global_roles (role_key, role_name, scope, description) values
  ('group_ceo', 'Group CEO', 'group', 'Full group visibility and strategic control'),
  ('group_cfo', 'Group CFO', 'group', 'Consolidated finance and recovery'),
  ('regional_director', 'Regional Director', 'region', 'Multi-company regional operations'),
  ('company_director', 'Company Director', 'company', 'Single company executive control'),
  ('branch_manager', 'Branch Manager', 'branch', 'Branch-level operations'),
  ('auditor', 'Auditor', 'group', 'Read-only audit across entities'),
  ('read_only', 'Read Only', 'group', 'View-only group access')
on conflict (role_key) do nothing;

create table if not exists public.vyron_enterprise_data_layers (
  id uuid primary key default gen_random_uuid(),
  layer_key text not null unique,
  layer_label text not null,
  description text not null,
  source_tables text[] not null default '{}',
  retention_policy text,
  refresh_interval text
);

insert into public.vyron_enterprise_data_layers (layer_key, layer_label, description, source_tables, retention_policy, refresh_interval) values
  ('operational', 'Operational Data', 'Live transactional PO, GRN, invoice, inventory, production', array['vyron_cost_purchase_orders','vyron_documents','vyron_cost_inventory_items','vyron_cost_production_runs'], '90 days hot', 'real-time'),
  ('historical', 'Historical Data', 'Archived movements, price history, audit trails', array['vyron_supplier_price_history','vyron_procurement_audit_log','vyron_recovery_audit_trail'], '7 years', 'daily'),
  ('analytical', 'Analytical Data', 'Aggregated KPIs, leakage, intelligence scores', array['vyron_finance_leakage_snapshots','vyron_intelligence_score_snapshots','vyron_finance_health_snapshots'], '3 years', 'hourly'),
  ('forecast', 'Forecast Data', 'Budget, scenario and cash forecasts', array['vyron_enterprise_budgets','vyron_finance_statement_snapshots'], '18 months', 'daily'),
  ('audit', 'Audit Data', 'Approvals, overrides, fraud alerts, compliance', array['vyron_fraud_alerts','vyron_document_approval_audit','vyron_finance_audit_findings'], '10 years', 'real-time'),
  ('recovery', 'Recovery Data', 'Opportunities, calculations, verified recovery', array['vyron_recovery_opportunities','vyron_recovery_calculations_v2'], '5 years', 'hourly')
on conflict (layer_key) do nothing;

create table if not exists public.vyron_platform_products (
  product_key text primary key,
  product_name text not null,
  status text not null default 'active',
  shared_entities text[] not null default '{}',
  description text
);

insert into public.vyron_platform_products (product_key, product_name, status, shared_entities, description) values
  ('vyron_cost', 'VYRON COST', 'active', array['suppliers','inventory','purchasing','costing','recoveries','audit'], 'Operational costing and recovery platform'),
  ('vyron_finance', 'VYRON FINANCE', 'active', array['companies','permissions','audit','financials'], 'Management accounts and finance intelligence'),
  ('vyron_pay', 'VYRON PAY', 'planned', array['users','companies','audit','notifications'], 'Payments and supplier settlements'),
  ('vyron_core', 'VYRON CORE', 'planned', array['users','permissions','companies','ai'], 'Shared identity and platform services'),
  ('vyron_maint', 'VYRON MAINT', 'planned', array['users','companies','notifications'], 'Maintenance and asset operations'),
  ('vyron_farm', 'VYRON FARM', 'planned', array['users','companies','inventory'], 'Agricultural production tracking')
on conflict (product_key) do nothing;

create table if not exists public.vyron_enterprise_performance_config (
  id uuid primary key default gen_random_uuid(),
  config_key text not null unique,
  target_invoices int not null default 100000,
  target_transactions bigint not null default 5000000,
  history_years int not null default 7,
  partitioning_enabled boolean not null default true,
  index_strategy jsonb not null default '{}'::jsonb,
  notes text
);

insert into public.vyron_enterprise_performance_config (config_key, target_invoices, target_transactions, history_years, partitioning_enabled, notes)
values ('default', 100000, 5000000, 7, true, 'Partition by company_id + created_at; BRIN on audit tables; materialized views for group rollups')
on conflict (config_key) do nothing;

alter table public.vyron_enterprise_groups enable row level security;
alter table public.vyron_enterprise_org_units enable row level security;
alter table public.vyron_enterprise_intercompany enable row level security;
alter table public.vyron_enterprise_benchmark_snapshots enable row level security;
alter table public.vyron_enterprise_global_roles enable row level security;
alter table public.vyron_enterprise_data_layers enable row level security;
alter table public.vyron_platform_products enable row level security;
alter table public.vyron_enterprise_performance_config enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'vyron_enterprise_groups','vyron_enterprise_org_units','vyron_enterprise_intercompany',
    'vyron_enterprise_benchmark_snapshots','vyron_enterprise_global_roles',
    'vyron_enterprise_data_layers','vyron_platform_products','vyron_enterprise_performance_config'
  ] loop
    execute format('drop policy if exists "demo read %s" on public.%I', t, t);
    execute format('drop policy if exists "demo write %s" on public.%I', t, t);
    execute format('create policy "demo read %s" on public.%I for select using (true)', t, t);
    execute format('create policy "demo write %s" on public.%I for all using (true) with check (true)', t, t);
  end loop;
end $$;

-- Seed demo group structure
insert into public.vyron_enterprise_groups (id, group_key, group_name, structure_type)
values ('a0000000-0000-4000-8000-000000000001', 'vyron_foods_group', 'Vyron Foods Group', 'holding')
on conflict (group_key) do nothing;
