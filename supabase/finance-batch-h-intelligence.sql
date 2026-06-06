-- VYRON COST — Batch H: Finance Intelligence, Executive Reporting & Board Packs
-- Run after: supplier-batch-g-intelligence.sql

create table if not exists public.vyron_finance_leakage_snapshots (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.vyron_cost_companies(id) on delete cascade,
  leakage_risk_score numeric(5,2) not null default 0,
  risk_level text not null default 'Low',
  category_scores jsonb not null default '{}'::jsonb,
  total_monthly_exposure numeric(14,2) not null default 0,
  projected_annual_impact numeric(14,2) not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_vyron_finance_leakage_snapshots_company
  on public.vyron_finance_leakage_snapshots(company_id, created_at desc);

create table if not exists public.vyron_board_pack_audit (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.vyron_cost_companies(id) on delete cascade,
  format text not null,
  date_range_label text,
  generated_by text,
  detail text,
  created_at timestamptz not null default now()
);

create index if not exists idx_vyron_board_pack_audit_company
  on public.vyron_board_pack_audit(company_id, created_at desc);

alter table public.vyron_finance_leakage_snapshots enable row level security;
alter table public.vyron_board_pack_audit enable row level security;

drop policy if exists "demo read finance leakage snapshots" on public.vyron_finance_leakage_snapshots;
drop policy if exists "demo write finance leakage snapshots" on public.vyron_finance_leakage_snapshots;
drop policy if exists "demo read board pack audit" on public.vyron_board_pack_audit;
drop policy if exists "demo write board pack audit" on public.vyron_board_pack_audit;

create policy "demo read finance leakage snapshots" on public.vyron_finance_leakage_snapshots for select using (true);
create policy "demo write finance leakage snapshots" on public.vyron_finance_leakage_snapshots for all using (true) with check (true);
create policy "demo read board pack audit" on public.vyron_board_pack_audit for select using (true);
create policy "demo write board pack audit" on public.vyron_board_pack_audit for all using (true) with check (true);
