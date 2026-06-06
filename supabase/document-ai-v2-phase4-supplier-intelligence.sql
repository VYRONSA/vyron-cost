-- VYRON COST — DOCUMENT AI V2 (PHASE 4)
-- Supplier intelligence, price movement, procurement risk, and product impact support.
-- Run after: supabase/document-ai-v2-phase3-review-override.sql

alter table public.vyron_supplier_price_history
  add column if not exists supplier_id uuid references public.vyron_cost_suppliers(id) on delete set null,
  add column if not exists invoice_date date,
  add column if not exists quantity numeric(14,4),
  add column if not exists unit text,
  add column if not exists price_difference numeric(14,4),
  add column if not exists percentage_change numeric(10,4),
  add column if not exists movement_type text not null default 'first_purchase',
  add column if not exists movement_reason text,
  add column if not exists item_kind text;

create table if not exists public.vyron_procurement_risk_alerts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.vyron_cost_companies(id) on delete cascade,
  supplier_id uuid references public.vyron_cost_suppliers(id) on delete set null,
  supplier_name text,
  document_id uuid references public.vyron_documents(id) on delete set null,
  line_item_id uuid references public.vyron_document_line_items(id) on delete set null,
  risk_type text not null,
  severity text not null default 'medium',
  title text not null,
  description text,
  previous_price numeric(14,4),
  new_price numeric(14,4),
  percentage_change numeric(10,4),
  status text not null default 'open',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_vyron_procurement_risk_alerts_updated_at on public.vyron_procurement_risk_alerts;
create trigger trg_vyron_procurement_risk_alerts_updated_at
  before update on public.vyron_procurement_risk_alerts
  for each row execute function public.vyron_set_updated_at();

create index if not exists idx_vyron_supplier_price_history_supplier_month
  on public.vyron_supplier_price_history(tenant_id, supplier_name, created_at desc);

create index if not exists idx_vyron_supplier_price_history_entity
  on public.vyron_supplier_price_history(tenant_id, entity_type, entity_id, created_at desc);

create index if not exists idx_vyron_procurement_risk_alerts_open
  on public.vyron_procurement_risk_alerts(tenant_id, status, created_at desc);

alter table public.vyron_procurement_risk_alerts enable row level security;

drop policy if exists "demo read vyron_procurement_risk_alerts" on public.vyron_procurement_risk_alerts;
drop policy if exists "demo write vyron_procurement_risk_alerts" on public.vyron_procurement_risk_alerts;

create policy "demo read vyron_procurement_risk_alerts"
  on public.vyron_procurement_risk_alerts for select using (true);

create policy "demo write vyron_procurement_risk_alerts"
  on public.vyron_procurement_risk_alerts for all using (true) with check (true);
