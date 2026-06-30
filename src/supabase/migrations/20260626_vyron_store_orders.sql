-- Store Ordering Engine Sprint 1: stores master, store orders, order lines

create table if not exists public.vyron_cost_stores (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  store_code text not null,
  store_name text not null,
  address text null,
  contact_name text null,
  contact_email text null,
  contact_phone text null,
  status text not null default 'Active',
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists vyron_cost_stores_company_id_idx
  on public.vyron_cost_stores (company_id);

create unique index if not exists vyron_cost_stores_company_code_uidx
  on public.vyron_cost_stores (company_id, store_code);

create table if not exists public.vyron_cost_store_orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  store_id uuid not null references public.vyron_cost_stores (id) on delete restrict,
  order_number text not null,
  status text not null default 'Draft',
  order_date date not null default current_date,
  required_date date null,
  notes text null,
  subtotal numeric(14, 2) not null default 0,
  vat_amount numeric(14, 2) not null default 0,
  total numeric(14, 2) not null default 0,
  submitted_at timestamptz null,
  approved_at timestamptz null,
  approved_by text null,
  picking_at timestamptz null,
  dispatched_at timestamptz null,
  delivered_at timestamptz null,
  cancelled_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists vyron_cost_store_orders_company_id_idx
  on public.vyron_cost_store_orders (company_id);

create index if not exists vyron_cost_store_orders_store_id_idx
  on public.vyron_cost_store_orders (store_id);

create index if not exists vyron_cost_store_orders_status_idx
  on public.vyron_cost_store_orders (company_id, status);

create unique index if not exists vyron_cost_store_orders_company_number_uidx
  on public.vyron_cost_store_orders (company_id, order_number);

create table if not exists public.vyron_cost_store_order_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  store_order_id uuid not null references public.vyron_cost_store_orders (id) on delete cascade,
  product_id uuid not null,
  product_name_snapshot text not null,
  quantity numeric(14, 4) not null default 0,
  unit text not null default 'each',
  unit_price numeric(14, 4) not null default 0,
  vat_rate numeric(6, 2) not null default 15,
  vat_amount numeric(14, 2) not null default 0,
  line_total numeric(14, 2) not null default 0,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists vyron_cost_store_order_lines_order_id_idx
  on public.vyron_cost_store_order_lines (store_order_id);

create index if not exists vyron_cost_store_order_lines_company_id_idx
  on public.vyron_cost_store_order_lines (company_id);
