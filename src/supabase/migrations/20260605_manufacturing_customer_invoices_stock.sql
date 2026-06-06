-- VYRON COST Manufacturing + Customer Invoices + Stock Movement Layer
-- Safe additive migration. Does not remove or alter existing Document Intelligence tables.

create table if not exists public.vyron_stock_movements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid null,
  movement_date date not null default current_date,
  item_type text not null check (item_type in ('raw_material','packaging','finished_good')),
  item_id text not null,
  item_name text not null,
  movement_type text not null,
  reference_number text not null,
  quantity_in numeric(18,4) not null default 0,
  quantity_out numeric(18,4) not null default 0,
  unit_cost numeric(18,4) not null default 0,
  total_value numeric(18,2) generated always as ((case when quantity_in > 0 then quantity_in else quantity_out end) * unit_cost) stored,
  related_document_id uuid null,
  notes text null,
  created_at timestamptz not null default now()
);

create table if not exists public.vyron_finished_goods (
  id uuid primary key default gen_random_uuid(),
  company_id uuid null,
  product_code text not null,
  product_name text not null,
  category text null,
  standard_cost numeric(18,4) not null default 0,
  latest_actual_cost numeric(18,4) not null default 0,
  selling_price numeric(18,4) not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vyron_manufacturing_batches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid null,
  batch_number text not null unique,
  product_id uuid null references public.vyron_finished_goods(id),
  product_name text not null,
  bom_name text null,
  batch_date date not null default current_date,
  status text not null default 'Draft' check (status in ('Draft','In Production','Completed','Cancelled')),
  planned_quantity numeric(18,4) not null default 0,
  actual_quantity_produced numeric(18,4) not null default 0,
  wastage_quantity numeric(18,4) not null default 0,
  labour_cost numeric(18,2) not null default 0,
  overhead_cost numeric(18,2) not null default 0,
  material_cost numeric(18,2) not null default 0,
  total_batch_cost numeric(18,2) not null default 0,
  actual_cost_per_unit numeric(18,4) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vyron_manufacturing_batch_lines (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.vyron_manufacturing_batches(id) on delete cascade,
  item_type text not null check (item_type in ('raw_material','packaging')),
  item_id text not null,
  item_name text not null,
  expected_quantity numeric(18,4) not null default 0,
  actual_quantity numeric(18,4) not null default 0,
  unit text null,
  unit_cost numeric(18,4) not null default 0,
  line_value numeric(18,2) generated always as (actual_quantity * unit_cost) stored
);

create table if not exists public.vyron_customers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid null,
  customer_name text not null,
  contact_person text null,
  email text null,
  phone text null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.vyron_customer_invoices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid null,
  customer_id uuid null references public.vyron_customers(id),
  customer_name text not null,
  invoice_number text not null unique,
  invoice_date date not null default current_date,
  due_date date null,
  status text not null default 'Draft' check (status in ('Draft','Approved','Sent','Paid','Cancelled')),
  sales_value numeric(18,2) not null default 0,
  cost_value numeric(18,2) not null default 0,
  gross_profit numeric(18,2) not null default 0,
  gp_percentage numeric(9,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vyron_customer_invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.vyron_customer_invoices(id) on delete cascade,
  product_id uuid null references public.vyron_finished_goods(id),
  product_name text not null,
  quantity numeric(18,4) not null default 0,
  selling_price numeric(18,4) not null default 0,
  cost_per_unit numeric(18,4) not null default 0,
  line_total numeric(18,2) generated always as (quantity * selling_price) stored,
  line_cost numeric(18,2) generated always as (quantity * cost_per_unit) stored,
  line_gp numeric(18,2) generated always as ((quantity * selling_price) - (quantity * cost_per_unit)) stored
);

create index if not exists idx_vyron_stock_movements_item on public.vyron_stock_movements(item_type, item_id);
create index if not exists idx_vyron_stock_movements_ref on public.vyron_stock_movements(reference_number);
create index if not exists idx_vyron_manufacturing_batches_status on public.vyron_manufacturing_batches(status);
create index if not exists idx_vyron_customer_invoices_status on public.vyron_customer_invoices(status);
