-- Consolidated Sales Orders + Commercial Workflow schema sync
-- Purpose: Bring behind environments up to current app expectations in one safe migration.
-- Source migrations:
--   20260706_customer_sales_orders.sql
--   20260707_customer_sales_orders_commercial_workflow.sql

create extension if not exists pgcrypto;

create table if not exists public.vyron_customer_sales_orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  order_number text not null,
  customer_id uuid null,
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
  requires_approval boolean not null default false,
  approval_flags jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, order_number)
);

alter table if exists public.vyron_customer_sales_orders
  add column if not exists requires_approval boolean not null default false,
  add column if not exists approval_flags jsonb not null default '[]'::jsonb;

create index if not exists idx_vyron_customer_sales_orders_company_status
  on public.vyron_customer_sales_orders(company_id, status, created_at desc);

create table if not exists public.vyron_customer_sales_order_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  sales_order_id uuid not null references public.vyron_customer_sales_orders(id) on delete cascade,
  product_id uuid null,
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

alter table if exists public.vyron_customer_sales_order_lines
  add column if not exists sort_order integer not null default 0;

create index if not exists idx_vyron_customer_sales_order_lines_order
  on public.vyron_customer_sales_order_lines(sales_order_id, sort_order);

create table if not exists public.vyron_customer_sales_order_allocations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  sales_order_id uuid not null references public.vyron_customer_sales_orders(id) on delete cascade,
  sales_order_line_id uuid not null references public.vyron_customer_sales_order_lines(id) on delete cascade,
  product_id uuid null,
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
  invoice_id uuid not null,
  created_at timestamptz not null default now(),
  unique (sales_order_id, invoice_id)
);

create index if not exists idx_vyron_customer_sales_order_invoice_links_order
  on public.vyron_customer_sales_order_invoice_links(sales_order_id);

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
  production_run_id uuid not null,
  created_at timestamptz not null default now(),
  unique (sales_order_id, production_run_id)
);

create index if not exists idx_vyron_customer_sales_order_production_links_order
  on public.vyron_customer_sales_order_production_links(sales_order_id, created_at desc);

create table if not exists public.vyron_customer_sales_order_requisition_links (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  sales_order_id uuid not null references public.vyron_customer_sales_orders(id) on delete cascade,
  requisition_id uuid not null,
  created_at timestamptz not null default now(),
  unique (sales_order_id, requisition_id)
);

create index if not exists idx_vyron_customer_sales_order_requisition_links_order
  on public.vyron_customer_sales_order_requisition_links(sales_order_id, created_at desc);

alter table if exists public.vyron_customers
  add column if not exists credit_limit numeric(14,2) not null default 0,
  add column if not exists on_hold boolean not null default false,
  add column if not exists invoice_email text null,
  add column if not exists terms text null,
  add column if not exists vat_number text null,
  add column if not exists status text null,
  add column if not exists active boolean null;

-- Product edit/save compatibility for behind environments.
alter table if exists public.vyron_cost_products
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'vyron_cost_products'
  ) then
    update public.vyron_cost_products
    set updated_at = coalesce(updated_at, now())
    where updated_at is null;
  end if;
end $$;

-- Procurement requisitions baseline (safe/idempotent backfill).
create table if not exists public.vyron_cost_procurement_requisitions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  requisition_number text not null,
  status text not null default 'Draft',
  required_date date null,
  notes text null,
  created_by text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, requisition_number)
);

create index if not exists idx_vyron_cost_procurement_requisitions_company_status
  on public.vyron_cost_procurement_requisitions(company_id, status, created_at desc);

create table if not exists public.vyron_cost_procurement_requisition_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  requisition_id uuid not null references public.vyron_cost_procurement_requisitions(id) on delete cascade,
  ingredient_id uuid null,
  ingredient_name text not null,
  required_qty numeric(14,4) not null default 0,
  available_qty numeric(14,4) not null default 0,
  shortage_qty numeric(14,4) not null default 0,
  unit text not null default 'kg',
  estimated_cost numeric(14,2) not null default 0,
  preferred_supplier_id uuid null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.vyron_cost_procurement_requisition_lines
  add column if not exists sort_order integer not null default 0;

create index if not exists idx_vyron_cost_procurement_requisition_lines_req
  on public.vyron_cost_procurement_requisition_lines(requisition_id, sort_order);

create index if not exists idx_vyron_cost_procurement_requisition_lines_company
  on public.vyron_cost_procurement_requisition_lines(company_id, ingredient_id);

-- Purchase order + GRN engine baseline.
create table if not exists public.vyron_cost_purchase_orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  supplier_id uuid null,
  po_number text not null,
  supplier_name_snapshot text null,
  status text not null default 'Draft',
  order_date date null,
  expected_date date null,
  notes text null,
  subtotal numeric(14,2) not null default 0,
  vat_amount numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  expected_total numeric(14,2) not null default 0,
  invoice_total numeric(14,2) not null default 0,
  variance numeric(14,2) not null default 0,
  outstanding_amount numeric(14,2) not null default 0,
  approved_by text null,
  approved_at timestamptz null,
  approval_notes text null,
  match_status text null,
  procurement_requisition_id uuid null,
  created_by text null,
  submitted_at timestamptz null,
  sent_at timestamptz null,
  closed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, po_number)
);

alter table if exists public.vyron_cost_purchase_orders
  add column if not exists expected_date date null,
  add column if not exists procurement_requisition_id uuid null,
  add column if not exists created_by text null,
  add column if not exists submitted_at timestamptz null,
  add column if not exists sent_at timestamptz null,
  add column if not exists closed_at timestamptz null,
  add column if not exists subtotal numeric(14,2) not null default 0,
  add column if not exists vat_amount numeric(14,2) not null default 0,
  add column if not exists expected_total numeric(14,2) not null default 0,
  add column if not exists invoice_total numeric(14,2) not null default 0,
  add column if not exists variance numeric(14,2) not null default 0,
  add column if not exists outstanding_amount numeric(14,2) not null default 0,
  add column if not exists approved_by text null,
  add column if not exists approved_at timestamptz null,
  add column if not exists approval_notes text null,
  add column if not exists match_status text null,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_vyron_cost_purchase_orders_company_status
  on public.vyron_cost_purchase_orders(company_id, status, created_at desc);

create index if not exists idx_vyron_cost_purchase_orders_company_req
  on public.vyron_cost_purchase_orders(company_id, procurement_requisition_id);

create table if not exists public.vyron_cost_purchase_order_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  purchase_order_id uuid not null references public.vyron_cost_purchase_orders(id) on delete cascade,
  item_type text not null default 'ingredient',
  item_id uuid null,
  item_name text not null,
  quantity numeric(14,4) not null default 0,
  unit text not null default 'kg',
  unit_price numeric(14,4) not null default 0,
  vat_rate numeric(8,4) not null default 15,
  vat_amount numeric(14,2) not null default 0,
  line_total numeric(14,2) not null default 0,
  expected_delivery_date date null,
  ordered_qty numeric(14,4) not null default 0,
  received_qty numeric(14,4) not null default 0,
  damaged_qty numeric(14,4) not null default 0,
  rejected_qty numeric(14,4) not null default 0,
  outstanding_qty numeric(14,4) not null default 0,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.vyron_cost_purchase_order_lines
  add column if not exists expected_delivery_date date null,
  add column if not exists vat_rate numeric(8,4) not null default 15,
  add column if not exists vat_amount numeric(14,2) not null default 0,
  add column if not exists sort_order integer not null default 0,
  add column if not exists ordered_qty numeric(14,4) not null default 0,
  add column if not exists received_qty numeric(14,4) not null default 0,
  add column if not exists damaged_qty numeric(14,4) not null default 0,
  add column if not exists rejected_qty numeric(14,4) not null default 0,
  add column if not exists outstanding_qty numeric(14,4) not null default 0,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_vyron_cost_purchase_order_lines_po
  on public.vyron_cost_purchase_order_lines(purchase_order_id, sort_order);

create table if not exists public.vyron_cost_goods_receipts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  purchase_order_id uuid not null references public.vyron_cost_purchase_orders(id) on delete cascade,
  grn_number text not null,
  supplier_id uuid null,
  supplier_name_snapshot text null,
  receipt_type text not null default 'partial',
  status text not null default 'Posted',
  received_at timestamptz not null default now(),
  received_by text null,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, grn_number)
);

create index if not exists idx_vyron_cost_goods_receipts_po
  on public.vyron_cost_goods_receipts(company_id, purchase_order_id, received_at desc);

create table if not exists public.vyron_cost_goods_receipt_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  goods_receipt_id uuid not null references public.vyron_cost_goods_receipts(id) on delete cascade,
  purchase_order_line_id uuid null references public.vyron_cost_purchase_order_lines(id) on delete set null,
  item_name text not null,
  ordered_qty numeric(14,4) not null default 0,
  received_qty numeric(14,4) not null default 0,
  damaged_qty numeric(14,4) not null default 0,
  rejected_qty numeric(14,4) not null default 0,
  outstanding_qty numeric(14,4) not null default 0,
  unit text not null default 'kg',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.vyron_cost_goods_receipt_lines
  add column if not exists sort_order integer not null default 0;

create index if not exists idx_vyron_cost_goods_receipt_lines_grn
  on public.vyron_cost_goods_receipt_lines(goods_receipt_id, sort_order);

create table if not exists public.vyron_cost_back_orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  purchase_order_id uuid not null references public.vyron_cost_purchase_orders(id) on delete cascade,
  purchase_order_line_id uuid null references public.vyron_cost_purchase_order_lines(id) on delete set null,
  supplier_id uuid null,
  supplier_name_snapshot text null,
  item_name text not null,
  outstanding_qty numeric(14,4) not null default 0,
  expected_date date null,
  status text not null default 'Open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_vyron_cost_back_orders_company_status
  on public.vyron_cost_back_orders(company_id, status, created_at desc);

create table if not exists public.vyron_procurement_audit_log (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  event_type text not null,
  entity_type text not null,
  entity_id uuid null,
  entity_label text null,
  detail text not null,
  actor text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_vyron_procurement_audit_log_company_created
  on public.vyron_procurement_audit_log(company_id, created_at desc);

create table if not exists public.vyron_po_approval_rules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null unique,
  auto_approve_below numeric(14,2) not null default 5000,
  supervisor_approve_below numeric(14,2) not null default 25000,
  require_po_before_invoice_approval boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'vyron_cost_procurement_requisitions'
  ) and not exists (
    select 1 from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'vyron_cost_purchase_orders'
      and constraint_name = 'fk_vyron_po_requisition'
  ) then
    alter table public.vyron_cost_purchase_orders
      add constraint fk_vyron_po_requisition
      foreign key (procurement_requisition_id) references public.vyron_cost_procurement_requisitions(id) on delete set null;
  end if;
end $$;

-- Add cross-module foreign keys only when referenced tables are present.
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'vyron_customers'
  ) and not exists (
    select 1 from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'vyron_customer_sales_orders'
      and constraint_name = 'fk_vyron_cso_customer'
  ) then
    alter table public.vyron_customer_sales_orders
      add constraint fk_vyron_cso_customer
      foreign key (customer_id) references public.vyron_customers(id) on delete set null;
  end if;

  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'vyron_cost_products'
  ) and not exists (
    select 1 from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'vyron_customer_sales_order_lines'
      and constraint_name = 'fk_vyron_csol_product'
  ) then
    alter table public.vyron_customer_sales_order_lines
      add constraint fk_vyron_csol_product
      foreign key (product_id) references public.vyron_cost_products(id) on delete set null;
  end if;

  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'vyron_cost_products'
  ) and not exists (
    select 1 from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'vyron_customer_sales_order_allocations'
      and constraint_name = 'fk_vyron_csoa_product'
  ) then
    alter table public.vyron_customer_sales_order_allocations
      add constraint fk_vyron_csoa_product
      foreign key (product_id) references public.vyron_cost_products(id) on delete set null;
  end if;

  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'vyron_customer_invoices'
  ) and not exists (
    select 1 from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'vyron_customer_sales_order_invoice_links'
      and constraint_name = 'fk_vyron_cso_invoice_link_invoice'
  ) then
    alter table public.vyron_customer_sales_order_invoice_links
      add constraint fk_vyron_cso_invoice_link_invoice
      foreign key (invoice_id) references public.vyron_customer_invoices(id) on delete cascade;
  end if;

  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'vyron_cost_production_runs'
  ) and not exists (
    select 1 from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'vyron_customer_sales_order_production_links'
      and constraint_name = 'fk_vyron_cso_prod_link_run'
  ) then
    alter table public.vyron_customer_sales_order_production_links
      add constraint fk_vyron_cso_prod_link_run
      foreign key (production_run_id) references public.vyron_cost_production_runs(id) on delete cascade;
  end if;

  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'vyron_cost_procurement_requisitions'
  ) and not exists (
    select 1 from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'vyron_customer_sales_order_requisition_links'
      and constraint_name = 'fk_vyron_cso_req_link_req'
  ) then
    alter table public.vyron_customer_sales_order_requisition_links
      add constraint fk_vyron_cso_req_link_req
      foreign key (requisition_id) references public.vyron_cost_procurement_requisitions(id) on delete cascade;
  end if;
end $$;

-- Compatibility view for legacy naming if external SQL expects ..._items.
do $$
begin
  if not exists (
    select 1
    from pg_views
    where schemaname = 'public'
      and viewname = 'vyron_customer_sales_order_items'
  ) then
    execute 'create view public.vyron_customer_sales_order_items as select * from public.vyron_customer_sales_order_lines';
  end if;
end $$;

-- Ensure PostgREST schema cache refreshes after migration.
select pg_notify('pgrst', 'reload schema');
