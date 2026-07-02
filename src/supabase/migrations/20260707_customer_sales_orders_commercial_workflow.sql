-- Customer Sales Orders commercial workflow extensions

alter table if exists public.vyron_customer_sales_orders
  add column if not exists requires_approval boolean not null default false,
  add column if not exists approval_flags jsonb not null default '[]'::jsonb;

create table if not exists public.vyron_customer_sales_order_audit (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  sales_order_id uuid not null references public.vyron_customer_sales_orders(id) on delete cascade,
  event_type text not null,
  actor text null,
  from_status text null,
  to_status text null,
  detail text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_vyron_customer_sales_order_audit_order
  on public.vyron_customer_sales_order_audit(sales_order_id, created_at desc);

create table if not exists public.vyron_customer_sales_order_production_links (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  sales_order_id uuid not null references public.vyron_customer_sales_orders(id) on delete cascade,
  production_run_id uuid not null references public.vyron_cost_production_runs(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (sales_order_id, production_run_id)
);

create index if not exists idx_vyron_customer_sales_order_production_links_order
  on public.vyron_customer_sales_order_production_links(sales_order_id, created_at desc);

create table if not exists public.vyron_customer_sales_order_requisition_links (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  sales_order_id uuid not null references public.vyron_customer_sales_orders(id) on delete cascade,
  requisition_id uuid not null references public.vyron_cost_procurement_requisitions(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (sales_order_id, requisition_id)
);

create index if not exists idx_vyron_customer_sales_order_requisition_links_order
  on public.vyron_customer_sales_order_requisition_links(sales_order_id, created_at desc);

alter table if exists public.vyron_customers
  add column if not exists credit_limit numeric(14,2) not null default 0,
  add column if not exists on_hold boolean not null default false;
