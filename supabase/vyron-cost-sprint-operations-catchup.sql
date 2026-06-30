-- VYRON COST - Sprint Operations Schema Catch-up
-- Safe to re-run. Run in Supabase SQL Editor, then reload API schema cache if needed.
-- Source: src/supabase/migrations/20260626 through 20260704

-- === 20260626_vyron_store_orders.sql ===
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


-- === 20260627_vyron_store_order_operations.sql ===
-- Store Ordering Engine Sprint 1B: operations workflow extensions

alter table public.vyron_cost_store_orders
  add column if not exists rejection_reason text null,
  add column if not exists change_request_note text null,
  add column if not exists rejected_at timestamptz null,
  add column if not exists picking_completed_at timestamptz null,
  add column if not exists ready_to_dispatch_at timestamptz null;

create table if not exists public.vyron_cost_store_order_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  store_order_id uuid not null references public.vyron_cost_store_orders (id) on delete cascade,
  action text not null,
  from_status text not null,
  to_status text not null,
  note text null,
  actor text null,
  created_at timestamptz not null default now()
);

create index if not exists vyron_cost_store_order_events_order_id_idx
  on public.vyron_cost_store_order_events (store_order_id);

create index if not exists vyron_cost_store_order_events_company_id_idx
  on public.vyron_cost_store_order_events (company_id);


-- === 20260628_vyron_store_order_commercial.sql ===
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


-- === 20260629_vyron_store_production_planning.sql ===
-- Sprint 2A: Store-order-driven production planning
-- Distinct from Batch D manufacturing execution (vyron_cost_production_runs).

create table if not exists public.vyron_cost_store_production_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  run_number text not null,
  production_date date not null default current_date,
  status text not null default 'Draft',
  notes text null,
  created_by text null,
  total_cost numeric(14, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists vyron_cost_store_production_runs_company_number_uidx
  on public.vyron_cost_store_production_runs (company_id, run_number);

create index if not exists vyron_cost_store_production_runs_company_status_idx
  on public.vyron_cost_store_production_runs (company_id, status);

create table if not exists public.vyron_cost_store_production_run_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  production_run_id uuid not null references public.vyron_cost_store_production_runs (id) on delete cascade,
  product_id uuid not null,
  product_name text not null,
  required_qty numeric(14, 4) not null default 0,
  planned_qty numeric(14, 4) not null default 0,
  produced_qty numeric(14, 4) not null default 0,
  unit_cost numeric(14, 4) not null default 0,
  total_cost numeric(14, 2) not null default 0,
  store_contributions jsonb not null default '[]'::jsonb,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists vyron_cost_store_production_run_lines_run_id_idx
  on public.vyron_cost_store_production_run_lines (production_run_id);

create index if not exists vyron_cost_store_production_run_lines_company_id_idx
  on public.vyron_cost_store_production_run_lines (company_id);


-- === 20260630_vyron_inventory_transactions.sql ===
-- Sprint 3A: Inventory transaction engine (single source of truth for stock movements)

create table if not exists public.vyron_cost_inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  transaction_number text not null,
  transaction_type text not null,
  entity_type text not null,
  entity_id uuid null,
  stock_item_id uuid null,
  quantity numeric(14, 4) not null default 0,
  unit_cost numeric(14, 4) not null default 0,
  total_cost numeric(14, 2) not null default 0,
  reference_type text null,
  reference_id uuid null,
  notes text null,
  created_by text null,
  created_at timestamptz not null default now()
);

create unique index if not exists vyron_cost_inventory_transactions_company_number_uidx
  on public.vyron_cost_inventory_transactions (company_id, transaction_number);

create index if not exists vyron_cost_inventory_transactions_company_created_idx
  on public.vyron_cost_inventory_transactions (company_id, created_at desc);

create index if not exists vyron_cost_inventory_transactions_company_entity_idx
  on public.vyron_cost_inventory_transactions (company_id, entity_type, entity_id);

create index if not exists vyron_cost_inventory_transactions_reference_idx
  on public.vyron_cost_inventory_transactions (company_id, reference_type, reference_id);

create index if not exists vyron_cost_inventory_transactions_type_idx
  on public.vyron_cost_inventory_transactions (company_id, transaction_type, created_at desc);


-- === 20260701_vyron_procurement_requisitions.sql ===
-- Sprint 4A: Procurement requisitions from shortages and planning demand

create table if not exists public.vyron_cost_procurement_requisitions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  requisition_number text not null,
  status text not null default 'Draft',
  required_date date null,
  notes text null,
  created_by text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists vyron_cost_procurement_requisitions_company_number_uidx
  on public.vyron_cost_procurement_requisitions (company_id, requisition_number);

create index if not exists vyron_cost_procurement_requisitions_company_status_idx
  on public.vyron_cost_procurement_requisitions (company_id, status);

create table if not exists public.vyron_cost_procurement_requisition_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  requisition_id uuid not null references public.vyron_cost_procurement_requisitions (id) on delete cascade,
  ingredient_id uuid null,
  ingredient_name text not null,
  required_qty numeric(14, 4) not null default 0,
  available_qty numeric(14, 4) not null default 0,
  shortage_qty numeric(14, 4) not null default 0,
  unit text not null default 'kg',
  estimated_cost numeric(14, 2) not null default 0,
  preferred_supplier_id uuid null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists vyron_cost_procurement_requisition_lines_req_idx
  on public.vyron_cost_procurement_requisition_lines (requisition_id);

create index if not exists vyron_cost_procurement_requisition_lines_company_idx
  on public.vyron_cost_procurement_requisition_lines (company_id);


-- === 20260702_vyron_purchase_order_engine.sql ===
-- Sprint 4B: Purchase order engine extensions (requisition linkage + expected dates)

alter table if exists public.vyron_cost_purchase_orders
  add column if not exists expected_date date,
  add column if not exists procurement_requisition_id uuid,
  add column if not exists created_by text;

create index if not exists vyron_cost_purchase_orders_company_requisition_idx
  on public.vyron_cost_purchase_orders (company_id, procurement_requisition_id);

-- ingredient lines: item_id already stores ingredient_id for item_type = ingredient


-- === 20260703_vyron_demand_forecasts.sql ===
-- Sprint 5A: Demand forecasting from store order behaviour

create table if not exists public.vyron_cost_demand_forecasts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  forecast_date date not null default current_date,
  product_id uuid null,
  product_name text not null,
  period_type text not null,
  forecast_qty numeric(14, 4) not null default 0,
  confidence_level numeric(5, 2) not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists vyron_cost_demand_forecasts_company_date_idx
  on public.vyron_cost_demand_forecasts (company_id, forecast_date desc);

create index if not exists vyron_cost_demand_forecasts_company_product_idx
  on public.vyron_cost_demand_forecasts (company_id, product_id, period_type);


-- === 20260704_vyron_cost_ai_insights.sql ===
-- Sprint 6A: Deterministic AI cost intelligence insights

create table if not exists public.vyron_cost_ai_insights (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  insight_key text not null,
  insight_type text not null,
  category text not null,
  priority text not null default 'Medium',
  title text not null,
  problem text not null,
  impact text not null,
  recommendation text not null,
  href text null,
  entity_type text null,
  entity_id uuid null,
  entity_label text null,
  data_used jsonb not null default '{}'::jsonb,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists vyron_cost_ai_insights_company_key_uidx
  on public.vyron_cost_ai_insights (company_id, insight_key);

create index if not exists vyron_cost_ai_insights_company_priority_idx
  on public.vyron_cost_ai_insights (company_id, priority, status, created_at desc);

create index if not exists vyron_cost_ai_insights_company_type_idx
  on public.vyron_cost_ai_insights (company_id, insight_type, created_at desc);

