-- VYRON COST — Recovery Intelligence V2
-- Explainable and auditable recovery calculations with stored inputs/formulas.

create table if not exists public.vyron_recovery_calculations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.vyron_cost_companies(id) on delete cascade,
  opportunity_key text not null,
  category text not null,
  title text not null,
  confidence_level text not null default 'Medium Confidence',
  confidence_score numeric(5,2) not null default 0,
  is_estimated boolean not null default true,
  formula_expression text not null,
  formula_inputs jsonb not null default '{}'::jsonb,
  products_affected jsonb not null default '[]'::jsonb,
  recommended_action text,
  monthly_recovery numeric(14,2) not null default 0,
  annual_recovery numeric(14,2) not null default 0,
  estimated_recovery numeric(14,2) not null default 0,
  verified_recovery numeric(14,2) not null default 0,
  potential_recovery numeric(14,2) not null default 0,
  recovered_to_date numeric(14,2) not null default 0,
  status text not null default 'Identified',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, opportunity_key)
);

drop trigger if exists trg_vyron_recovery_calculations_updated_at on public.vyron_recovery_calculations;
create trigger trg_vyron_recovery_calculations_updated_at
  before update on public.vyron_recovery_calculations
  for each row execute function public.vyron_set_updated_at();

create index if not exists idx_vyron_recovery_calculations_tenant_category
  on public.vyron_recovery_calculations(tenant_id, category, monthly_recovery desc);

alter table public.vyron_recovery_calculations enable row level security;

drop policy if exists "demo read vyron_recovery_calculations" on public.vyron_recovery_calculations;
drop policy if exists "demo write vyron_recovery_calculations" on public.vyron_recovery_calculations;

create policy "demo read vyron_recovery_calculations"
  on public.vyron_recovery_calculations for select using (true);

create policy "demo write vyron_recovery_calculations"
  on public.vyron_recovery_calculations for all using (true) with check (true);
