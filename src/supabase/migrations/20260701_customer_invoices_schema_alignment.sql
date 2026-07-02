-- Ensure customer invoice tables/columns exist for API and schema cache stability.

create table if not exists public.vyron_customer_invoices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid null,
  customer_id uuid null,
  customer_name text not null,
  invoice_number text not null unique,
  invoice_date date not null default current_date,
  due_date date null,
  status text not null default 'Draft',
  sales_value numeric(18,2) not null default 0,
  cost_value numeric(18,2) not null default 0,
  gross_profit numeric(18,2) not null default 0,
  gp_percentage numeric(9,2) not null default 0,
  stock_posted boolean not null default false,
  posted_at timestamptz null,
  stock_reversed boolean not null default false,
  stock_reversed_at timestamptz null,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.vyron_customer_invoices
  add column if not exists stock_posted boolean not null default false,
  add column if not exists posted_at timestamptz null,
  add column if not exists stock_reversed boolean not null default false,
  add column if not exists stock_reversed_at timestamptz null,
  add column if not exists notes text null,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_vyron_customer_invoices_company
  on public.vyron_customer_invoices (company_id, invoice_date desc, created_at desc);

create table if not exists public.vyron_customer_invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.vyron_customer_invoices(id) on delete cascade,
  product_id uuid null,
  product_name text not null,
  quantity numeric(18,4) not null default 0,
  selling_price numeric(18,4) not null default 0,
  cost_per_unit numeric(18,4) not null default 0,
  line_total numeric(18,2) generated always as (quantity * selling_price) stored,
  line_cost numeric(18,2) generated always as (quantity * cost_per_unit) stored,
  line_gp numeric(18,2) generated always as ((quantity * selling_price) - (quantity * cost_per_unit)) stored,
  created_at timestamptz not null default now()
);

alter table if exists public.vyron_customer_invoice_lines
  add column if not exists created_at timestamptz not null default now();

create index if not exists idx_vyron_customer_invoice_lines_invoice
  on public.vyron_customer_invoice_lines (invoice_id, created_at);
