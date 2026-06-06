-- VYRON COST DEMO SPRINT — RECOVERY OPPORTUNITIES (OPTIONAL)
-- Run after stage2-vyron-cost-leakage-intelligence.sql

create table if not exists public.vyron_cost_recovery_opportunities (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.vyron_cost_companies(id) on delete cascade,
  opportunity text not null,
  category text not null,
  monthly_saving numeric(14,2) not null default 0,
  annual_saving numeric(14,2) not null default 0,
  difficulty text not null default 'Medium',
  status text not null default 'Open',
  action text not null,
  created_at timestamptz not null default now()
);

alter table public.vyron_cost_recovery_opportunities enable row level security;

drop policy if exists "demo read recovery" on public.vyron_cost_recovery_opportunities;
drop policy if exists "demo write recovery" on public.vyron_cost_recovery_opportunities;

create policy "demo read recovery" on public.vyron_cost_recovery_opportunities for select using (true);
create policy "demo write recovery" on public.vyron_cost_recovery_opportunities for all using (true) with check (true);
