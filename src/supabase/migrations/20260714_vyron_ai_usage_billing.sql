-- AI Usage & Billing Service: usage events, per-company allowance overrides, company currency.
begin;

create table if not exists public.vyron_ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  workspace_id text null,
  user_id text null,
  product_id text not null,
  feature_id text not null,
  provider text not null,
  model text not null,
  prompt_tokens integer not null default 0,
  completion_tokens integer not null default 0,
  total_tokens integer not null default 0,
  estimated_cost_usd numeric(14,6) not null default 0,
  estimated_cost_company_currency numeric(14,2) not null default 0,
  company_currency text not null default 'ZAR',
  execution_time_ms integer not null default 0,
  success boolean not null default true,
  error_message text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists vyron_ai_usage_events_company_created_idx
  on public.vyron_ai_usage_events (company_id, created_at desc);

create index if not exists vyron_ai_usage_events_company_feature_idx
  on public.vyron_ai_usage_events (company_id, feature_id, created_at desc);

create index if not exists vyron_ai_usage_events_company_user_idx
  on public.vyron_ai_usage_events (company_id, user_id, created_at desc);

do $$
begin
  if to_regclass('public.vyron_ai_usage_events') is not null
     and to_regclass('public.vyron_cost_companies') is not null
     and not exists (
       select 1
       from pg_constraint c
       join pg_class t on t.oid = c.conrelid
       join pg_namespace n on n.oid = t.relnamespace
       where c.conname = 'vyron_ai_usage_events_company_fkey'
         and n.nspname = 'public'
         and t.relname = 'vyron_ai_usage_events'
     ) then
    alter table public.vyron_ai_usage_events
      add constraint vyron_ai_usage_events_company_fkey
      foreign key (company_id)
      references public.vyron_cost_companies(id)
      on delete cascade;
  end if;
end $$;

create table if not exists public.vyron_ai_company_allowances (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  package_id_override text null,
  monthly_credits_override numeric(14,2) null,
  monthly_spend_usd_override numeric(14,2) null,
  monthly_requests_override integer null,
  reset_anchor_day integer not null default 1,
  last_notified_80_period text null,
  last_notified_80_at timestamptz null,
  last_notified_95_period text null,
  last_notified_95_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists vyron_ai_company_allowances_company_uidx
  on public.vyron_ai_company_allowances (company_id);

do $$
begin
  if to_regclass('public.vyron_ai_company_allowances') is not null
     and to_regclass('public.vyron_cost_companies') is not null
     and not exists (
       select 1
       from pg_constraint c
       join pg_class t on t.oid = c.conrelid
       join pg_namespace n on n.oid = t.relnamespace
       where c.conname = 'vyron_ai_company_allowances_company_fkey'
         and n.nspname = 'public'
         and t.relname = 'vyron_ai_company_allowances'
     ) then
    alter table public.vyron_ai_company_allowances
      add constraint vyron_ai_company_allowances_company_fkey
      foreign key (company_id)
      references public.vyron_cost_companies(id)
      on delete cascade;
  end if;
end $$;

alter table if exists public.vyron_cost_companies
  add column if not exists currency_code text not null default 'ZAR';

commit;
