-- VYRON COST — AI Procurement Manager (Phase 6)
-- Run after: recovery-intelligence-v3-tracking.sql, document-ai-v2-phase4-supplier-intelligence.sql

create table if not exists public.vyron_procurement_recommendations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.vyron_cost_companies(id) on delete cascade,
  recommendation_key text not null,
  category text not null,
  title text not null,
  summary text,
  recommended_action text not null,
  why_exists text not null,
  data_used jsonb not null default '{}'::jsonb,
  formula_expression text not null,
  confidence_score numeric(5,2) not null default 0,
  confidence_level text not null default 'Medium Confidence',
  is_estimated boolean not null default false,
  missing_inputs jsonb not null default '[]'::jsonb,
  affected_products jsonb not null default '[]'::jsonb,
  affected_suppliers jsonb not null default '[]'::jsonb,
  expected_result text,
  potential_benefit_monthly numeric(14,2) not null default 0,
  potential_benefit_annual numeric(14,2) not null default 0,
  expected_gp_improvement_pct numeric(8,4),
  selling_price_adjustment numeric(14,4),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, recommendation_key)
);

create table if not exists public.vyron_procurement_recommendation_tracking (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.vyron_cost_companies(id) on delete cascade,
  recommendation_key text not null,
  status text not null default 'New',
  owner_name text,
  owner_email text,
  due_date date,
  scheduled_review_date date,
  expected_benefit numeric(14,2) not null default 0,
  actual_benefit numeric(14,2) not null default 0,
  implementation_date date,
  evidence text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, recommendation_key)
);

create table if not exists public.vyron_procurement_recommendation_evidence (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.vyron_cost_companies(id) on delete cascade,
  recommendation_key text not null,
  evidence_type text not null,
  title text not null,
  content text,
  document_url text,
  created_by text,
  created_at timestamptz not null default now()
);

create table if not exists public.vyron_procurement_recommendation_audit (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.vyron_cost_companies(id) on delete cascade,
  recommendation_key text not null,
  changed_by text,
  changed_at timestamptz not null default now(),
  field_name text not null,
  old_value text,
  new_value text
);

drop trigger if exists trg_vyron_procurement_recommendations_updated_at on public.vyron_procurement_recommendations;
create trigger trg_vyron_procurement_recommendations_updated_at
  before update on public.vyron_procurement_recommendations
  for each row execute function public.vyron_set_updated_at();

drop trigger if exists trg_vyron_procurement_recommendation_tracking_updated_at on public.vyron_procurement_recommendation_tracking;
create trigger trg_vyron_procurement_recommendation_tracking_updated_at
  before update on public.vyron_procurement_recommendation_tracking
  for each row execute function public.vyron_set_updated_at();

create index if not exists idx_vyron_procurement_recommendations_category
  on public.vyron_procurement_recommendations(tenant_id, category, potential_benefit_annual desc);

create index if not exists idx_vyron_procurement_recommendation_tracking_status
  on public.vyron_procurement_recommendation_tracking(tenant_id, status, updated_at desc);

alter table public.vyron_procurement_recommendations enable row level security;
alter table public.vyron_procurement_recommendation_tracking enable row level security;
alter table public.vyron_procurement_recommendation_evidence enable row level security;
alter table public.vyron_procurement_recommendation_audit enable row level security;

drop policy if exists "demo read vyron_procurement_recommendations" on public.vyron_procurement_recommendations;
drop policy if exists "demo write vyron_procurement_recommendations" on public.vyron_procurement_recommendations;
drop policy if exists "demo read vyron_procurement_recommendation_tracking" on public.vyron_procurement_recommendation_tracking;
drop policy if exists "demo write vyron_procurement_recommendation_tracking" on public.vyron_procurement_recommendation_tracking;
drop policy if exists "demo read vyron_procurement_recommendation_evidence" on public.vyron_procurement_recommendation_evidence;
drop policy if exists "demo write vyron_procurement_recommendation_evidence" on public.vyron_procurement_recommendation_evidence;
drop policy if exists "demo read vyron_procurement_recommendation_audit" on public.vyron_procurement_recommendation_audit;
drop policy if exists "demo write vyron_procurement_recommendation_audit" on public.vyron_procurement_recommendation_audit;

create policy "demo read vyron_procurement_recommendations" on public.vyron_procurement_recommendations for select using (true);
create policy "demo write vyron_procurement_recommendations" on public.vyron_procurement_recommendations for all using (true) with check (true);
create policy "demo read vyron_procurement_recommendation_tracking" on public.vyron_procurement_recommendation_tracking for select using (true);
create policy "demo write vyron_procurement_recommendation_tracking" on public.vyron_procurement_recommendation_tracking for all using (true) with check (true);
create policy "demo read vyron_procurement_recommendation_evidence" on public.vyron_procurement_recommendation_evidence for select using (true);
create policy "demo write vyron_procurement_recommendation_evidence" on public.vyron_procurement_recommendation_evidence for all using (true) with check (true);
create policy "demo read vyron_procurement_recommendation_audit" on public.vyron_procurement_recommendation_audit for select using (true);
create policy "demo write vyron_procurement_recommendation_audit" on public.vyron_procurement_recommendation_audit for all using (true) with check (true);
