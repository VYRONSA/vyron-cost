-- VYRON COST — Batch G: Supplier Intelligence Centre
-- Run after: ai-procurement-batch-f.sql, procurement-batch-b-po-grn-match.sql

alter table public.vyron_cost_suppliers
  add column if not exists contact_phone text,
  add column if not exists payment_terms text,
  add column if not exists vat_number text,
  add column if not exists account_number text,
  add column if not exists is_active boolean not null default true,
  add column if not exists notes text;

create table if not exists public.vyron_supplier_score_snapshots (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.vyron_cost_companies(id) on delete cascade,
  supplier_id uuid not null references public.vyron_cost_suppliers(id) on delete cascade,
  overall_score numeric(5,2) not null default 0,
  price_stability numeric(5,2) not null default 0,
  delivery_score numeric(5,2) not null default 0,
  invoice_accuracy numeric(5,2) not null default 0,
  po_compliance numeric(5,2) not null default 0,
  risk_score numeric(5,2) not null default 0,
  risk_level text not null default 'Low',
  created_at timestamptz not null default now()
);

create index if not exists idx_vyron_supplier_score_snapshots_supplier
  on public.vyron_supplier_score_snapshots(supplier_id, created_at desc);

create table if not exists public.vyron_supplier_intelligence_audit (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.vyron_cost_companies(id) on delete cascade,
  supplier_id uuid references public.vyron_cost_suppliers(id) on delete cascade,
  event_type text not null,
  actor text,
  field_name text,
  old_value text,
  new_value text,
  detail text,
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_vyron_supplier_intel_audit_supplier
  on public.vyron_supplier_intelligence_audit(supplier_id, created_at desc);

alter table public.vyron_supplier_score_snapshots enable row level security;
alter table public.vyron_supplier_intelligence_audit enable row level security;

drop policy if exists "demo read supplier score snapshots" on public.vyron_supplier_score_snapshots;
drop policy if exists "demo write supplier score snapshots" on public.vyron_supplier_score_snapshots;
drop policy if exists "demo read supplier intel audit" on public.vyron_supplier_intelligence_audit;
drop policy if exists "demo write supplier intel audit" on public.vyron_supplier_intelligence_audit;

create policy "demo read supplier score snapshots" on public.vyron_supplier_score_snapshots for select using (true);
create policy "demo write supplier score snapshots" on public.vyron_supplier_score_snapshots for all using (true) with check (true);
create policy "demo read supplier intel audit" on public.vyron_supplier_intelligence_audit for select using (true);
create policy "demo write supplier intel audit" on public.vyron_supplier_intelligence_audit for all using (true) with check (true);
