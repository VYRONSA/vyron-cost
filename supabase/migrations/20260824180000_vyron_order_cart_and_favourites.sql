-- VYRON ORDER — customer cart, submission idempotency and favourites.
--
-- These hold a customer's in-progress selections only. The order itself is
-- written through saveCustomerSalesOrder into vyron_customer_sales_orders, so
-- nothing here is a second order engine and no cart row ever becomes an order
-- record. Once an order is created the cart is emptied.
--
-- No price is stored. A cart holds product and quantity; the authoritative
-- price is re-resolved from the customer's price list every time the cart is
-- read, reviewed or submitted, so a cart left open overnight cannot submit at
-- yesterday's price.
--
-- Quantity is always in UNITS. Box entry is multiplied by the verified pack
-- size before it reaches the database, and entry_mode records only how the
-- customer typed it so the screen can be restored the way they left it.
--
-- company_id is a logical tenant key, not a foreign key, matching the rest of
-- VYRON ORDER: live tenants carry a company_id with no vyron_cost_companies row.
--
-- Rollback:
--   drop table if exists public.vyron_customer_order_favourites;
--   drop table if exists public.vyron_customer_order_submissions;
--   drop table if exists public.vyron_customer_order_cart_lines;
--   drop table if exists public.vyron_customer_order_carts;

create table if not exists public.vyron_customer_order_carts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  customer_id uuid not null references public.vyron_customers(id) on delete cascade,
  requested_delivery_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One open cart per customer. Everything else is an order.
  constraint vyron_customer_order_carts_customer_unique unique (customer_id)
);

create index if not exists idx_vyron_customer_order_carts_company
  on public.vyron_customer_order_carts (company_id, customer_id);

create table if not exists public.vyron_customer_order_cart_lines (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references public.vyron_customer_order_carts(id) on delete cascade,
  company_id uuid not null,
  product_id uuid not null references public.vyron_cost_products(id) on delete cascade,
  quantity_units numeric(14,4) not null,
  entry_mode text not null default 'units',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vyron_customer_order_cart_lines_qty_positive
    check (quantity_units > 0),
  constraint vyron_customer_order_cart_lines_entry_mode_check
    check (entry_mode in ('units', 'boxes')),
  -- One line per product; adding the same product again updates the quantity.
  constraint vyron_customer_order_cart_lines_unique unique (cart_id, product_id)
);

create index if not exists idx_vyron_customer_order_cart_lines_cart
  on public.vyron_customer_order_cart_lines (cart_id);

-- Double-tap protection. A submission is claimed by key before the order is
-- written, so a repeated tap returns the order that already exists instead of
-- creating a second one.
create table if not exists public.vyron_customer_order_submissions (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null,
  company_id uuid not null,
  customer_id uuid not null references public.vyron_customers(id) on delete cascade,
  sales_order_id uuid,
  order_number text,
  created_at timestamptz not null default now(),
  constraint vyron_customer_order_submissions_key_unique
    unique (company_id, customer_id, idempotency_key)
);

create index if not exists idx_vyron_customer_order_submissions_order
  on public.vyron_customer_order_submissions (sales_order_id);

create table if not exists public.vyron_customer_order_favourites (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  customer_id uuid not null references public.vyron_customers(id) on delete cascade,
  product_id uuid not null references public.vyron_cost_products(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint vyron_customer_order_favourites_unique unique (customer_id, product_id)
);

create index if not exists idx_vyron_customer_order_favourites_scope
  on public.vyron_customer_order_favourites (company_id, customer_id);

-- Reached only by server code through the service role, which bypasses RLS.
-- RLS on with no policy denies anon and authenticated clients by default.
alter table public.vyron_customer_order_carts        enable row level security;
alter table public.vyron_customer_order_cart_lines   enable row level security;
alter table public.vyron_customer_order_submissions  enable row level security;
alter table public.vyron_customer_order_favourites   enable row level security;
