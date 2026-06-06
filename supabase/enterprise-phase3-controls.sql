-- VYRON COST — Phase 3: Enterprise Controls, Compliance, Forecasting & Budget Intelligence
-- Run after: finance-batch-h-intelligence.sql

-- ---------------------------------------------------------------------------
-- Roles & permissions
-- ---------------------------------------------------------------------------
create table if not exists public.vyron_enterprise_roles (
  role_key text primary key,
  role_name text not null,
  description text,
  is_system boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.vyron_enterprise_role_permissions (
  id uuid primary key default gen_random_uuid(),
  role_key text not null references public.vyron_enterprise_roles(role_key) on delete cascade,
  module_key text not null,
  can_view boolean not null default false,
  can_create boolean not null default false,
  can_edit boolean not null default false,
  can_approve boolean not null default false,
  can_delete boolean not null default false,
  can_export boolean not null default false,
  can_override boolean not null default false,
  unique (role_key, module_key)
);

-- ---------------------------------------------------------------------------
-- Approval matrix
-- ---------------------------------------------------------------------------
create table if not exists public.vyron_enterprise_approval_rules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.vyron_cost_companies(id) on delete cascade,
  entity_type text not null,
  rule_name text not null,
  threshold_type text not null default 'amount',
  threshold_value numeric(14,4) not null default 0,
  approval_level int not null default 1,
  approver_role text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_vyron_enterprise_approval_rules_company
  on public.vyron_enterprise_approval_rules(company_id, entity_type);

-- ---------------------------------------------------------------------------
-- Budgets
-- ---------------------------------------------------------------------------
create table if not exists public.vyron_enterprise_budgets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.vyron_cost_companies(id) on delete cascade,
  budget_category text not null,
  period_type text not null default 'monthly',
  period_start date not null,
  period_end date not null,
  budget_amount numeric(14,2) not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_vyron_enterprise_budgets_company_period
  on public.vyron_enterprise_budgets(company_id, budget_category, period_start);

-- ---------------------------------------------------------------------------
-- Supplier contracts
-- ---------------------------------------------------------------------------
create table if not exists public.vyron_supplier_contracts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.vyron_cost_companies(id) on delete cascade,
  supplier_id uuid references public.vyron_cost_suppliers(id) on delete set null,
  supplier_name text not null,
  contract_type text not null default 'pricing',
  title text not null,
  start_date date,
  end_date date,
  discount_pct numeric(8,4),
  terms_summary text,
  document_id uuid references public.vyron_documents(id) on delete set null,
  status text not null default 'Active',
  renewal_alert_days int not null default 30,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_vyron_supplier_contracts_expiry
  on public.vyron_supplier_contracts(company_id, end_date);

-- ---------------------------------------------------------------------------
-- Fraud / anomaly alerts
-- ---------------------------------------------------------------------------
create table if not exists public.vyron_fraud_alerts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.vyron_cost_companies(id) on delete cascade,
  alert_type text not null,
  severity text not null default 'medium',
  title text not null,
  description text,
  entity_type text,
  entity_id text,
  estimated_exposure numeric(14,2) not null default 0,
  status text not null default 'open',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_vyron_fraud_alerts_company_open
  on public.vyron_fraud_alerts(company_id, status, created_at desc);

-- ---------------------------------------------------------------------------
-- Compliance snapshots
-- ---------------------------------------------------------------------------
create table if not exists public.vyron_compliance_snapshots (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.vyron_cost_companies(id) on delete cascade,
  domain text not null,
  compliance_pct numeric(5,2) not null default 0,
  open_issues int not null default 0,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- RLS demo policies
alter table public.vyron_enterprise_roles enable row level security;
alter table public.vyron_enterprise_role_permissions enable row level security;
alter table public.vyron_enterprise_approval_rules enable row level security;
alter table public.vyron_enterprise_budgets enable row level security;
alter table public.vyron_supplier_contracts enable row level security;
alter table public.vyron_fraud_alerts enable row level security;
alter table public.vyron_compliance_snapshots enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'vyron_enterprise_roles','vyron_enterprise_role_permissions','vyron_enterprise_approval_rules',
    'vyron_enterprise_budgets','vyron_supplier_contracts','vyron_fraud_alerts','vyron_compliance_snapshots'
  ] loop
    execute format('drop policy if exists "demo read %s" on public.%I', t, t);
    execute format('drop policy if exists "demo write %s" on public.%I', t, t);
    execute format('create policy "demo read %s" on public.%I for select using (true)', t, t);
    execute format('create policy "demo write %s" on public.%I for all using (true) with check (true)', t, t);
  end loop;
end $$;

-- Seed roles
insert into public.vyron_enterprise_roles (role_key, role_name, description) values
  ('owner', 'Owner', 'Full platform control'),
  ('cfo', 'CFO', 'Finance, recovery, exports and executive reporting'),
  ('financial_manager', 'Financial Manager', 'Finance, budgets, invoices and compliance'),
  ('procurement_manager', 'Procurement Manager', 'PO, suppliers, GRN and invoices'),
  ('warehouse_manager', 'Warehouse Manager', 'Inventory, stock counts and GRN'),
  ('production_manager', 'Production Manager', 'Manufacturing and BOM consumption'),
  ('supervisor', 'Supervisor', 'Approvals and operational edits'),
  ('user', 'User', 'Standard operational access'),
  ('read_only', 'Read Only', 'View-only access'),
  ('auditor', 'Auditor', 'Read-only audit workspace')
on conflict (role_key) do nothing;

-- Demo approval rules (Handcrafted tenant)
insert into public.vyron_enterprise_approval_rules (
  company_id, entity_type, rule_name, threshold_type, threshold_value, approval_level, approver_role
)
select
  '48002864-8800-4000-9000-000000000001'::uuid,
  v.entity_type,
  v.rule_name,
  v.threshold_type,
  v.threshold_value,
  v.approval_level,
  v.approver_role
from (values
  ('purchase_order', 'Auto approve below threshold', 'amount', 5000, 1, 'supervisor'),
  ('purchase_order', 'Manager approval high value', 'amount', 25000, 2, 'procurement_manager'),
  ('supplier_invoice', 'Supervisor invoice review', 'amount', 10000, 1, 'financial_manager'),
  ('supplier_invoice', 'High risk invoice', 'risk', 75, 2, 'cfo'),
  ('inventory_adjustment', 'Adjustment value review', 'amount', 2500, 1, 'warehouse_manager'),
  ('production_run', 'Production cost overrun', 'variance', 8, 1, 'production_manager'),
  ('recovery_action', 'Large recovery claim', 'amount', 25000, 2, 'cfo')
) as v(entity_type, rule_name, threshold_type, threshold_value, approval_level, approver_role)
where not exists (
  select 1 from public.vyron_enterprise_approval_rules
  where company_id = '48002864-8800-4000-9000-000000000001'::uuid
  limit 1
);
