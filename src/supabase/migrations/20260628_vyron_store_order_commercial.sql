-- Store Ordering Engine Sprint 1C: commercial controls

alter table public.vyron_cost_store_orders
  add column if not exists order_value numeric(14, 2) not null default 0,
  add column if not exists estimated_cost numeric(14, 2) not null default 0,
  add column if not exists gross_margin numeric(14, 2) not null default 0,
  add column if not exists margin_pct numeric(8, 2) not null default 0;

alter table public.vyron_cost_store_order_lines
  add column if not exists unit_cost numeric(14, 4) not null default 0,
  add column if not exists line_estimated_cost numeric(14, 2) not null default 0,
  add column if not exists line_gross_margin numeric(14, 2) not null default 0,
  add column if not exists line_margin_pct numeric(8, 2) not null default 0;

create table if not exists public.vyron_store_order_approval_rules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  max_order_value numeric(14, 2) not null default 50000,
  min_margin_pct numeric(8, 2) not null default 25,
  max_qty_variance_pct numeric(8, 2) not null default 50,
  warn_inactive_products boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists vyron_store_order_approval_rules_company_uidx
  on public.vyron_store_order_approval_rules (company_id);
