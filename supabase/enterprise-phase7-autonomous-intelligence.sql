-- VYRON COST — Phase 7: Autonomous Business Intelligence
-- Run after: enterprise-phase6-platform-architecture.sql

create table if not exists public.vyron_business_health_snapshots (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.vyron_cost_companies(id) on delete cascade,
  financial_health numeric(5,2) not null default 0,
  inventory_health numeric(5,2) not null default 0,
  procurement_health numeric(5,2) not null default 0,
  supplier_health numeric(5,2) not null default 0,
  production_health numeric(5,2) not null default 0,
  recovery_health numeric(5,2) not null default 0,
  compliance_health numeric(5,2) not null default 0,
  overall_score numeric(5,2) not null default 0,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.vyron_executive_early_warnings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.vyron_cost_companies(id) on delete cascade,
  risk_category text not null,
  horizon_days int not null,
  severity text not null default 'medium',
  title text not null,
  message text not null,
  projected_impact numeric(14,2) not null default 0,
  data_used jsonb not null default '{}'::jsonb,
  formula text,
  confidence numeric(5,2) not null default 80,
  href text,
  created_at timestamptz not null default now()
);

create index if not exists idx_vyron_early_warnings_company
  on public.vyron_executive_early_warnings(company_id, risk_category, horizon_days);

create table if not exists public.vyron_root_cause_analyses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.vyron_cost_companies(id) on delete cascade,
  kpi_key text not null,
  what_changed text not null,
  why_changed text not null,
  where_changed text not null,
  financial_impact numeric(14,2) not null default 0,
  recommended_action text not null,
  data_used jsonb not null default '{}'::jsonb,
  formula text,
  confidence numeric(5,2) not null default 80,
  href text,
  created_at timestamptz not null default now()
);

create table if not exists public.vyron_decision_recommendations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.vyron_cost_companies(id) on delete cascade,
  decision_type text not null,
  title text not null,
  rationale text not null,
  expected_benefit_annual numeric(14,2) not null default 0,
  data_used jsonb not null default '{}'::jsonb,
  formula text,
  confidence numeric(5,2) not null default 80,
  href text,
  status text not null default 'recommended',
  created_at timestamptz not null default now()
);

create table if not exists public.vyron_executive_actions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.vyron_cost_companies(id) on delete cascade,
  recommendation text not null,
  owner_role text not null default 'financial_manager',
  due_date date not null,
  status text not null default 'open',
  expected_benefit numeric(14,2) not null default 0,
  actual_benefit numeric(14,2) not null default 0,
  completion_pct numeric(5,2) not null default 0,
  decision_id uuid references public.vyron_decision_recommendations(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vyron_org_performance_snapshots (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.vyron_cost_companies(id) on delete cascade,
  role_area text not null,
  score numeric(5,2) not null default 0,
  metrics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.vyron_enterprise_knowledge_entries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.vyron_cost_companies(id) on delete cascade,
  behaviour_domain text not null,
  summary text not null,
  signals jsonb not null default '[]'::jsonb,
  data_used jsonb not null default '{}'::jsonb,
  formula text,
  confidence numeric(5,2) not null default 80,
  created_at timestamptz not null default now()
);

create table if not exists public.vyron_predictive_risk_models (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.vyron_cost_companies(id) on delete cascade,
  model_key text not null,
  title text not null,
  probability_pct numeric(5,2) not null default 0,
  horizon_days int not null default 90,
  projected_impact numeric(14,2) not null default 0,
  data_used jsonb not null default '{}'::jsonb,
  formula text,
  confidence numeric(5,2) not null default 80,
  href text,
  created_at timestamptz not null default now()
);

create table if not exists public.vyron_enterprise_scorecard_snapshots (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.vyron_cost_companies(id) on delete cascade,
  scorecard_type text not null,
  entity_label text not null,
  overall_score numeric(5,2) not null default 0,
  metrics jsonb not null default '{}'::jsonb,
  href text,
  created_at timestamptz not null default now()
);

alter table public.vyron_business_health_snapshots enable row level security;
alter table public.vyron_executive_early_warnings enable row level security;
alter table public.vyron_root_cause_analyses enable row level security;
alter table public.vyron_decision_recommendations enable row level security;
alter table public.vyron_executive_actions enable row level security;
alter table public.vyron_org_performance_snapshots enable row level security;
alter table public.vyron_enterprise_knowledge_entries enable row level security;
alter table public.vyron_predictive_risk_models enable row level security;
alter table public.vyron_enterprise_scorecard_snapshots enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'vyron_business_health_snapshots','vyron_executive_early_warnings','vyron_root_cause_analyses',
    'vyron_decision_recommendations','vyron_executive_actions','vyron_org_performance_snapshots',
    'vyron_enterprise_knowledge_entries','vyron_predictive_risk_models','vyron_enterprise_scorecard_snapshots'
  ] loop
    execute format('drop policy if exists "demo read %s" on public.%I', t, t);
    execute format('drop policy if exists "demo write %s" on public.%I', t, t);
    execute format('create policy "demo read %s" on public.%I for select using (true)', t, t);
    execute format('create policy "demo write %s" on public.%I for all using (true) with check (true)', t, t);
  end loop;
end $$;
