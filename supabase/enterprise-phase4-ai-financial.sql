-- VYRON COST — Phase 4: AI Financial Intelligence & Executive Decision Platform
-- Run after: enterprise-phase3-controls.sql

create table if not exists public.vyron_intelligence_score_snapshots (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.vyron_cost_companies(id) on delete cascade,
  financial_health numeric(5,2) not null default 0,
  procurement_health numeric(5,2) not null default 0,
  inventory_health numeric(5,2) not null default 0,
  production_health numeric(5,2) not null default 0,
  recovery_health numeric(5,2) not null default 0,
  risk_score numeric(5,2) not null default 0,
  overall_score numeric(5,2) not null default 0,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.vyron_executive_alerts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.vyron_cost_companies(id) on delete cascade,
  alert_type text not null,
  severity text not null default 'medium',
  title text not null,
  message text not null,
  href text,
  data_used jsonb not null default '{}'::jsonb,
  formula text,
  confidence numeric(5,2) not null default 75,
  status text not null default 'open',
  created_at timestamptz not null default now()
);

create index if not exists idx_vyron_executive_alerts_company
  on public.vyron_executive_alerts(company_id, status, created_at desc);

create table if not exists public.vyron_ai_financial_narratives (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.vyron_cost_companies(id) on delete cascade,
  narrative_key text not null,
  title text not null,
  body text not null,
  data_used jsonb not null default '{}'::jsonb,
  formula text,
  confidence numeric(5,2) not null default 80,
  created_at timestamptz not null default now()
);

create table if not exists public.vyron_group_company_registry (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null,
  company_id uuid not null references public.vyron_cost_companies(id) on delete cascade,
  company_label text not null,
  industry text not null default 'food_manufacturing',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (group_id, company_id)
);

alter table public.vyron_intelligence_score_snapshots enable row level security;
alter table public.vyron_executive_alerts enable row level security;
alter table public.vyron_ai_financial_narratives enable row level security;
alter table public.vyron_group_company_registry enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'vyron_intelligence_score_snapshots','vyron_executive_alerts',
    'vyron_ai_financial_narratives','vyron_group_company_registry'
  ] loop
    execute format('drop policy if exists "demo read %s" on public.%I', t, t);
    execute format('drop policy if exists "demo write %s" on public.%I', t, t);
    execute format('create policy "demo read %s" on public.%I for select using (true)', t, t);
    execute format('create policy "demo write %s" on public.%I for all using (true) with check (true)', t, t);
  end loop;
end $$;
