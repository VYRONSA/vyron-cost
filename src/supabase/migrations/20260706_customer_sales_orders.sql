-- Customer Sales Orders workflow before invoicing

create table if not exists public.vyron_customer_sales_orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  order_number text not null,
  customer_id uuid null references public.vyron_customers(id) on delete set null,
  customer_name text not null,
  delivery_address text null,
  contact_name text null,
  salesperson text null,
  warehouse text null,
  status text not null default 'Draft',
  requested_delivery_date date null,
  notes text null,
  subtotal numeric(14,2) not null default 0,
  vat_amount numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  cost_value numeric(14,2) not null default 0,
  gross_profit numeric(14,2) not null default 0,
  gp_percentage numeric(8,2) not null default 0,
  approved_at timestamptz null,
  approved_by text null,
  picked_at timestamptz null,
  packed_at timestamptz null,
  dispatched_at timestamptz null,
  cancelled_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, order_number)
);

create index if not exists idx_vyron_customer_sales_orders_company_status
  on public.vyron_customer_sales_orders(company_id, status, created_at desc);

create table if not exists public.vyron_customer_sales_order_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  sales_order_id uuid not null references public.vyron_customer_sales_orders(id) on delete cascade,
  product_id uuid null references public.vyron_cost_products(id) on delete set null,
  description text not null,
  quantity numeric(14,4) not null default 0,
  unit text not null default 'each',
  selling_price numeric(14,4) not null default 0,
  discount_pct numeric(8,4) not null default 0,
  tax_rate numeric(8,4) not null default 15,
  line_total numeric(14,2) not null default 0,
  cost_per_unit numeric(14,4) not null default 0,
  invoiced_qty numeric(14,4) not null default 0,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_vyron_customer_sales_order_lines_order
  on public.vyron_customer_sales_order_lines(sales_order_id, sort_order);

create table if not exists public.vyron_customer_sales_order_allocations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  sales_order_id uuid not null references public.vyron_customer_sales_orders(id) on delete cascade,
  sales_order_line_id uuid not null references public.vyron_customer_sales_order_lines(id) on delete cascade,
  product_id uuid null references public.vyron_cost_products(id) on delete set null,
  reserved_qty numeric(14,4) not null default 0,
  available_qty_snapshot numeric(14,4) not null default 0,
  status text not null default 'Reserved',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_vyron_customer_sales_order_allocations_order
  on public.vyron_customer_sales_order_allocations(sales_order_id, status);

create table if not exists public.vyron_customer_sales_order_invoice_links (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  sales_order_id uuid not null references public.vyron_customer_sales_orders(id) on delete cascade,
  invoice_id uuid not null references public.vyron_customer_invoices(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (sales_order_id, invoice_id)
);

create index if not exists idx_vyron_customer_sales_order_invoice_links_order
  on public.vyron_customer_sales_order_invoice_links(sales_order_id);
