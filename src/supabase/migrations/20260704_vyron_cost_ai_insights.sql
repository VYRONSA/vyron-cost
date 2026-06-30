-- Sprint 6A: Deterministic AI cost intelligence insights

create table if not exists public.vyron_cost_ai_insights (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  insight_key text not null,
  insight_type text not null,
  category text not null,
  priority text not null default 'Medium',
  title text not null,
  problem text not null,
  impact text not null,
  recommendation text not null,
  href text null,
  entity_type text null,
  entity_id uuid null,
  entity_label text null,
  data_used jsonb not null default '{}'::jsonb,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists vyron_cost_ai_insights_company_key_uidx
  on public.vyron_cost_ai_insights (company_id, insight_key);

create index if not exists vyron_cost_ai_insights_company_priority_idx
  on public.vyron_cost_ai_insights (company_id, priority, status, created_at desc);

create index if not exists vyron_cost_ai_insights_company_type_idx
  on public.vyron_cost_ai_insights (company_id, insight_type, created_at desc);
