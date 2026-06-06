-- VYRON COST — Demo schema catch-up (tables + columns)
-- Safe to re-run. Run BEFORE: vyron-cost-demo-full-business-cycle.sql
-- Supersedes procurement-missing-demo-tables.sql for meeting demo installs.
-- Creates missing tables AND adds columns on legacy/partial schemas (CREATE TABLE IF NOT EXISTS alone is insufficient).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Shared trigger helper
-- ---------------------------------------------------------------------------
create or replace function public.vyron_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tenant / company (required FK targets)
-- ---------------------------------------------------------------------------
create table if not exists public.vyron_cost_companies (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Demo Company',
  created_at timestamptz not null default now()
);

create table if not exists public.vyron_companies (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  trading_name text,
  subscription_plan text default 'Demo',
  subscription_status text default 'Demo',
  currency_code text default 'ZAR',
  vat_percent numeric(6,2) default 15,
  logo_url text,
  primary_color text default '#A6CE39',
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- Master data (costing / BOM — required by demo seed)
-- ---------------------------------------------------------------------------
create table if not exists public.vyron_cost_suppliers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.vyron_cost_companies(id) on delete cascade,
  supplier_name text not null,
  category text default 'Uncategorised',
  contact_email text,
  invoice_email text,
  risk_status text default 'Stable',
  last_price_movement numeric(8,2) default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.vyron_cost_ingredients (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.vyron_cost_companies(id) on delete cascade,
  supplier_id uuid references public.vyron_cost_suppliers(id) on delete set null,
  ingredient_name text not null,
  category text default 'Uncategorised',
  purchase_unit text default 'unit',
  recipe_unit text default 'unit',
  purchase_cost numeric(14,4) default 0,
  previous_cost numeric(14,4) default 0,
  yield_type text default 'standard',
  yield_percent numeric(8,2) default 100,
  true_unit_cost numeric(14,4) default 0,
  current_alert text,
  created_at timestamptz not null default now()
);

create table if not exists public.vyron_cost_products (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.vyron_cost_companies(id) on delete cascade,
  product_name text not null,
  category text default 'Uncategorised',
  status text default 'Imported',
  selling_price numeric(14,4) default 0,
  total_cost numeric(14,4) default 0,
  target_gp numeric(8,2) default 40,
  salary_cost numeric(14,4) default 0,
  packaging_cost numeric(14,4) default 0,
  overhead_cost numeric(14,4) default 0,
  wastage_percent numeric(8,2) default 0,
  extracted_line_count int default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.vyron_cost_product_cost_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.vyron_cost_companies(id) on delete cascade,
  product_id uuid references public.vyron_cost_products(id) on delete set null,
  product_name text,
  line_type text default 'Ingredient',
  line_name text not null,
  quantity numeric(14,4) default 0,
  unit text default 'unit',
  unit_cost numeric(14,4) default 0,
  wastage_percent numeric(8,2) default 0,
  line_cost_imported numeric(14,4) default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.vyron_cost_recipes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.vyron_cost_companies(id) on delete cascade,
  recipe_name text,
  recipe_type text default 'Production Recipe',
  category text default 'Production Recipe',
  yield_qty numeric(12,4) default 1,
  total_cost numeric(12,4) default 0,
  selling_price numeric(12,4) default 0,
  target_gp numeric(8,2) default 40,
  status text default 'Imported',
  version_note text,
  created_at timestamptz not null default now()
);

create table if not exists public.vyron_cost_recipe_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.vyron_cost_companies(id) on delete cascade,
  recipe_id uuid references public.vyron_cost_recipes(id) on delete cascade,
  ingredient_id uuid references public.vyron_cost_ingredients(id) on delete set null,
  ingredient_name_snapshot text not null,
  quantity numeric(12,3) not null default 0,
  unit text not null default 'kg',
  true_unit_cost numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.vyron_cost_product_recipe_links (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.vyron_cost_companies(id) on delete cascade,
  product_id uuid references public.vyron_cost_products(id) on delete cascade,
  recipe_id uuid references public.vyron_cost_recipes(id) on delete cascade,
  recipe_name_snapshot text not null,
  portion_qty numeric(12,3) not null default 1,
  portion_cost numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.vyron_cost_reports (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.vyron_cost_companies(id) on delete cascade,
  report_name text not null,
  report_type text not null,
  status text not null default 'Ready',
  estimated_value numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Purchase orders (base + batch B extensions)
-- ---------------------------------------------------------------------------
create table if not exists public.vyron_cost_purchase_orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.vyron_cost_companies(id) on delete cascade,
  supplier_id uuid references public.vyron_cost_suppliers(id) on delete set null,
  po_number text not null,
  supplier_name_snapshot text,
  status text not null default 'Draft',
  expected_total numeric(12,2) not null default 0,
  invoice_total numeric(12,2) not null default 0,
  variance numeric(12,2) generated always as (invoice_total - expected_total) stored,
  created_at timestamptz not null default now()
);

alter table public.vyron_cost_purchase_orders
  add column if not exists order_date date,
  add column if not exists notes text,
  add column if not exists subtotal numeric(14,2) not null default 0,
  add column if not exists vat_amount numeric(14,2) not null default 0,
  add column if not exists total numeric(14,2) not null default 0,
  add column if not exists outstanding_amount numeric(14,2) not null default 0,
  add column if not exists approved_by text,
  add column if not exists approved_at timestamptz,
  add column if not exists approval_notes text,
  add column if not exists sent_at timestamptz,
  add column if not exists closed_at timestamptz,
  add column if not exists submitted_at timestamptz,
  add column if not exists match_status text,
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.vyron_cost_purchase_order_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.vyron_cost_companies(id) on delete cascade,
  purchase_order_id uuid not null references public.vyron_cost_purchase_orders(id) on delete cascade,
  item_type text not null default 'ingredient',
  item_id uuid,
  item_name text not null,
  quantity numeric(14,4) not null default 0,
  unit text not null default 'kg',
  unit_price numeric(14,4) not null default 0,
  vat_rate numeric(8,2) not null default 15,
  vat_amount numeric(14,2) not null default 0,
  line_total numeric(14,2) not null default 0,
  expected_delivery_date date,
  ordered_qty numeric(14,4) not null default 0,
  received_qty numeric(14,4) not null default 0,
  damaged_qty numeric(14,4) not null default 0,
  rejected_qty numeric(14,4) not null default 0,
  outstanding_qty numeric(14,4) not null default 0,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_vyron_po_lines_po on public.vyron_cost_purchase_order_lines(purchase_order_id, sort_order);

create table if not exists public.vyron_po_approval_rules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.vyron_cost_companies(id) on delete cascade unique,
  auto_approve_below numeric(14,2) not null default 5000,
  supervisor_approve_below numeric(14,2) not null default 25000,
  require_po_before_invoice_approval boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vyron_cost_goods_receipts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.vyron_cost_companies(id) on delete cascade,
  purchase_order_id uuid not null references public.vyron_cost_purchase_orders(id) on delete cascade,
  grn_number text not null,
  supplier_id uuid references public.vyron_cost_suppliers(id) on delete set null,
  supplier_name_snapshot text,
  receipt_type text not null default 'partial',
  status text not null default 'Posted',
  received_at timestamptz not null default now(),
  received_by text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vyron_cost_goods_receipt_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.vyron_cost_companies(id) on delete cascade,
  goods_receipt_id uuid not null references public.vyron_cost_goods_receipts(id) on delete cascade,
  purchase_order_line_id uuid references public.vyron_cost_purchase_order_lines(id) on delete set null,
  item_name text not null,
  ordered_qty numeric(14,4) not null default 0,
  received_qty numeric(14,4) not null default 0,
  damaged_qty numeric(14,4) not null default 0,
  rejected_qty numeric(14,4) not null default 0,
  outstanding_qty numeric(14,4) not null default 0,
  unit text not null default 'kg',
  created_at timestamptz not null default now()
);

create index if not exists idx_vyron_grn_po on public.vyron_cost_goods_receipts(purchase_order_id, received_at desc);

create table if not exists public.vyron_cost_back_orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.vyron_cost_companies(id) on delete cascade,
  purchase_order_id uuid not null references public.vyron_cost_purchase_orders(id) on delete cascade,
  purchase_order_line_id uuid references public.vyron_cost_purchase_order_lines(id) on delete set null,
  supplier_id uuid references public.vyron_cost_suppliers(id) on delete set null,
  supplier_name_snapshot text,
  item_name text not null,
  outstanding_qty numeric(14,4) not null default 0,
  expected_date date,
  status text not null default 'Open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Document intelligence (required for invoices + 3-way match)
-- ---------------------------------------------------------------------------
create table if not exists public.vyron_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.vyron_cost_companies(id) on delete cascade,
  document_type text not null default 'pending_classification',
  supplier_name text,
  supplier_vat_number text,
  invoice_number text,
  invoice_date date,
  purchase_order_number text,
  subtotal numeric(14,2),
  vat numeric(14,2),
  total numeric(14,2),
  currency text not null default 'ZAR',
  confidence numeric(5,2),
  status text not null default 'uploaded',
  storage_bucket text not null default 'vyron-documents',
  storage_path text,
  original_filename text,
  file_mime text,
  file_size_bytes bigint,
  field_confidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.vyron_documents
  add column if not exists purchase_order_id uuid references public.vyron_cost_purchase_orders(id) on delete set null,
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by text,
  add column if not exists archived_at timestamptz,
  add column if not exists deleted_at timestamptz;

create table if not exists public.vyron_document_line_items (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.vyron_documents(id) on delete cascade,
  description text not null default '',
  quantity numeric(14,4),
  unit text,
  unit_price numeric(14,4),
  vat numeric(14,2),
  line_total numeric(14,2),
  confidence_score numeric(5,2),
  field_confidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.vyron_document_line_items
  add column if not exists matched_entity_type text,
  add column if not exists matched_entity_id uuid,
  add column if not exists matched_entity_name text;

create table if not exists public.vyron_supplier_price_history (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.vyron_cost_companies(id) on delete cascade,
  supplier_name text,
  document_id uuid references public.vyron_documents(id) on delete set null,
  entity_type text not null,
  entity_id uuid,
  entity_name text,
  item_description text,
  previous_price numeric(14,4),
  new_price numeric(14,4),
  change_percent numeric(10,4),
  currency text not null default 'ZAR',
  potential_costing_impact numeric(14,4),
  created_at timestamptz not null default now()
);

alter table public.vyron_supplier_price_history
  add column if not exists supplier_id uuid references public.vyron_cost_suppliers(id) on delete set null,
  add column if not exists invoice_date date,
  add column if not exists price_difference numeric(14,4),
  add column if not exists percentage_change numeric(10,4),
  add column if not exists movement_type text not null default 'first_purchase',
  add column if not exists movement_reason text,
  add column if not exists item_kind text,
  add column if not exists price_movement text,
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by text;

-- ---------------------------------------------------------------------------
-- Procurement: 3-way match, audit, risk alerts (FAILED without batch B)
-- ---------------------------------------------------------------------------
create table if not exists public.vyron_procurement_three_way_matches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.vyron_cost_companies(id) on delete cascade,
  document_id uuid not null references public.vyron_documents(id) on delete cascade,
  purchase_order_id uuid not null references public.vyron_cost_purchase_orders(id) on delete cascade,
  goods_receipt_id uuid references public.vyron_cost_goods_receipts(id) on delete set null,
  match_status text not null default 'Partial Match',
  po_qty numeric(14,4),
  invoice_qty numeric(14,4),
  grn_qty numeric(14,4),
  qty_variance numeric(14,4),
  po_unit_price numeric(14,4),
  invoice_unit_price numeric(14,4),
  price_variance numeric(14,4),
  po_total numeric(14,2),
  invoice_total numeric(14,2),
  grn_total numeric(14,2),
  total_variance numeric(14,2),
  missing_po boolean not null default false,
  missing_grn boolean not null default false,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (document_id)
);

create table if not exists public.vyron_procurement_audit_log (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.vyron_cost_companies(id) on delete cascade,
  event_type text not null,
  entity_type text not null,
  entity_id uuid,
  entity_label text,
  detail text,
  actor text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_vyron_procurement_audit_company on public.vyron_procurement_audit_log(company_id, created_at desc);

create table if not exists public.vyron_procurement_risk_alerts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.vyron_cost_companies(id) on delete cascade,
  supplier_id uuid references public.vyron_cost_suppliers(id) on delete set null,
  supplier_name text,
  document_id uuid references public.vyron_documents(id) on delete set null,
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

-- ---------------------------------------------------------------------------
-- Inventory (demo stock movements)
-- ---------------------------------------------------------------------------
create table if not exists public.vyron_cost_stock_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.vyron_cost_companies(id) on delete cascade,
  item_code text not null,
  description text not null,
  category text not null default 'Uncategorised',
  entity_type text not null,
  entity_id uuid,
  unit text not null default 'kg',
  supplier_id uuid references public.vyron_cost_suppliers(id) on delete set null,
  supplier_name_snapshot text,
  current_cost numeric(14,4) not null default 0,
  average_cost numeric(14,4) not null default 0,
  qty_on_hand numeric(14,4) not null default 0,
  inventory_value numeric(14,2) not null default 0,
  reorder_level numeric(14,4) not null default 0,
  min_level numeric(14,4) not null default 0,
  max_level numeric(14,4) not null default 0,
  valuation_method text not null default 'weighted_average',
  stock_status text not null default 'In Stock',
  last_movement_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, item_code)
);

create table if not exists public.vyron_cost_stock_ledger (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.vyron_cost_companies(id) on delete cascade,
  stock_item_id uuid not null references public.vyron_cost_stock_items(id) on delete cascade,
  movement_date timestamptz not null default now(),
  movement_type text not null,
  quantity_in numeric(14,4) not null default 0,
  quantity_out numeric(14,4) not null default 0,
  balance_after numeric(14,4) not null default 0,
  unit_cost numeric(14,4) not null default 0,
  value numeric(14,2) not null default 0,
  reference_type text,
  reference_id uuid,
  reference_label text,
  actor text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Leakage / invoice risk (stage 2)
-- ---------------------------------------------------------------------------
create table if not exists public.vyron_cost_leakage_findings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.vyron_cost_companies(id) on delete cascade,
  finding_type text not null,
  title text not null,
  description text,
  estimated_monthly_loss numeric(14,2) not null default 0,
  severity text not null default 'Medium',
  status text not null default 'Open',
  branch_name text,
  category_name text,
  supplier_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.vyron_cost_invoice_risk_findings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.vyron_cost_companies(id) on delete cascade,
  invoice_number text not null,
  supplier_name text not null,
  invoice_amount numeric(14,2) not null default 0,
  risk_type text not null,
  risk_score numeric(6,2) not null default 0,
  ai_confidence numeric(6,2) not null default 0,
  duplicate_of text,
  review_status text not null default 'Pending Review',
  detected_at timestamptz not null default now()
);

alter table public.vyron_cost_invoice_risk_findings
  add column if not exists document_id uuid references public.vyron_documents(id) on delete set null;

create table if not exists public.vyron_cost_procurement_risk_findings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.vyron_cost_companies(id) on delete cascade,
  supplier_name text not null,
  category_name text,
  risk_type text not null,
  risk_score numeric(6,2) not null default 0,
  price_change_percent numeric(8,2) not null default 0,
  spend_amount numeric(14,2) not null default 0,
  action_required text,
  detected_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Recovery + AI procurement (optional modules — created for full demo)
-- ---------------------------------------------------------------------------
create table if not exists public.vyron_recovery_calculations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.vyron_cost_companies(id) on delete cascade,
  opportunity_key text not null,
  category text not null,
  title text not null,
  confidence_level text not null default 'Medium Confidence',
  confidence_score numeric(5,2) not null default 0,
  is_estimated boolean not null default true,
  formula_expression text not null,
  formula_inputs jsonb not null default '{}'::jsonb,
  products_affected jsonb not null default '[]'::jsonb,
  recommended_action text,
  monthly_recovery numeric(14,2) not null default 0,
  annual_recovery numeric(14,2) not null default 0,
  estimated_recovery numeric(14,2) not null default 0,
  verified_recovery numeric(14,2) not null default 0,
  potential_recovery numeric(14,2) not null default 0,
  recovered_to_date numeric(14,2) not null default 0,
  status text not null default 'Identified',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, opportunity_key)
);

create table if not exists public.vyron_procurement_recommendations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.vyron_cost_companies(id) on delete cascade,
  recommendation_key text not null,
  category text not null,
  title text not null,
  summary text,
  recommended_action text not null,
  why_exists text not null,
  data_used jsonb not null default '{}'::jsonb,
  formula_expression text not null,
  confidence_score numeric(5,2) not null default 0,
  confidence_level text not null default 'Medium Confidence',
  is_estimated boolean not null default false,
  missing_inputs jsonb not null default '[]'::jsonb,
  affected_products jsonb not null default '[]'::jsonb,
  affected_suppliers jsonb not null default '[]'::jsonb,
  expected_result text,
  potential_benefit_monthly numeric(14,2) not null default 0,
  potential_benefit_annual numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, recommendation_key)
);

alter table public.vyron_procurement_recommendations
  add column if not exists source_type text,
  add column if not exists source_recovery_key text,
  add column if not exists problem_statement text,
  add column if not exists cause_statement text;

create table if not exists public.vyron_cost_recovery_opportunities (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.vyron_cost_companies(id) on delete cascade,
  opportunity text not null,
  category text not null,
  monthly_saving numeric(14,2) not null default 0,
  annual_saving numeric(14,2) not null default 0,
  difficulty text not null default 'Medium',
  status text not null default 'Open',
  action text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- COLUMN CATCH-UP — every column referenced by vyron-cost-demo-full-business-cycle.sql
-- ---------------------------------------------------------------------------

-- Tenant
alter table if exists public.vyron_cost_companies add column if not exists name text;
alter table if exists public.vyron_companies add column if not exists company_name text;
alter table if exists public.vyron_companies add column if not exists trading_name text;
alter table if exists public.vyron_companies add column if not exists subscription_plan text default 'Demo';
alter table if exists public.vyron_companies add column if not exists subscription_status text default 'Demo';
alter table if exists public.vyron_companies add column if not exists currency_code text default 'ZAR';
alter table if exists public.vyron_companies add column if not exists vat_percent numeric(6,2) default 15;

-- Master data
alter table if exists public.vyron_cost_suppliers add column if not exists company_id uuid references public.vyron_cost_companies(id) on delete cascade;
alter table if exists public.vyron_cost_suppliers add column if not exists supplier_name text;
alter table if exists public.vyron_cost_suppliers add column if not exists category text default 'Uncategorised';
alter table if exists public.vyron_cost_suppliers add column if not exists contact_email text;
alter table if exists public.vyron_cost_suppliers add column if not exists invoice_email text;
alter table if exists public.vyron_cost_suppliers add column if not exists risk_status text default 'Stable';
alter table if exists public.vyron_cost_suppliers add column if not exists last_price_movement numeric(8,2) default 0;
alter table if exists public.vyron_cost_suppliers add column if not exists demo_seed_key text;
alter table if exists public.vyron_cost_suppliers add column if not exists is_demo boolean not null default false;

alter table if exists public.vyron_cost_ingredients add column if not exists company_id uuid references public.vyron_cost_companies(id) on delete cascade;
alter table if exists public.vyron_cost_ingredients add column if not exists supplier_id uuid references public.vyron_cost_suppliers(id) on delete set null;
alter table if exists public.vyron_cost_ingredients add column if not exists ingredient_name text;
alter table if exists public.vyron_cost_ingredients add column if not exists category text default 'Uncategorised';
alter table if exists public.vyron_cost_ingredients add column if not exists purchase_unit text default 'unit';
alter table if exists public.vyron_cost_ingredients add column if not exists recipe_unit text default 'unit';
alter table if exists public.vyron_cost_ingredients add column if not exists purchase_cost numeric(14,4) default 0;
alter table if exists public.vyron_cost_ingredients add column if not exists previous_cost numeric(14,4) default 0;
alter table if exists public.vyron_cost_ingredients add column if not exists yield_percent numeric(8,2) default 100;
alter table if exists public.vyron_cost_ingredients add column if not exists true_unit_cost numeric(14,4) default 0;
alter table if exists public.vyron_cost_ingredients add column if not exists current_alert text;
alter table if exists public.vyron_cost_ingredients add column if not exists demo_seed_key text;
alter table if exists public.vyron_cost_ingredients add column if not exists is_demo boolean not null default false;

alter table if exists public.vyron_cost_products add column if not exists company_id uuid references public.vyron_cost_companies(id) on delete cascade;
alter table if exists public.vyron_cost_products add column if not exists product_name text;
alter table if exists public.vyron_cost_products add column if not exists category text default 'Uncategorised';
alter table if exists public.vyron_cost_products add column if not exists status text default 'Imported';
alter table if exists public.vyron_cost_products add column if not exists selling_price numeric(14,4) default 0;
alter table if exists public.vyron_cost_products add column if not exists total_cost numeric(14,4) default 0;
alter table if exists public.vyron_cost_products add column if not exists target_gp numeric(8,2) default 40;
alter table if exists public.vyron_cost_products add column if not exists salary_cost numeric(14,4) default 0;
alter table if exists public.vyron_cost_products add column if not exists packaging_cost numeric(14,4) default 0;
alter table if exists public.vyron_cost_products add column if not exists overhead_cost numeric(14,4) default 0;
alter table if exists public.vyron_cost_products add column if not exists wastage_percent numeric(8,2) default 0;
alter table if exists public.vyron_cost_products add column if not exists demo_seed_key text;
alter table if exists public.vyron_cost_products add column if not exists is_demo boolean not null default false;

alter table if exists public.vyron_cost_recipes add column if not exists company_id uuid references public.vyron_cost_companies(id) on delete cascade;
alter table if exists public.vyron_cost_recipes add column if not exists recipe_name text;
alter table if exists public.vyron_cost_recipes add column if not exists recipe_type text default 'Production Recipe';
alter table if exists public.vyron_cost_recipes add column if not exists category text default 'Production Recipe';
alter table if exists public.vyron_cost_recipes add column if not exists yield_qty numeric(12,4) default 1;
alter table if exists public.vyron_cost_recipes add column if not exists total_cost numeric(12,4) default 0;
alter table if exists public.vyron_cost_recipes add column if not exists selling_price numeric(12,4) default 0;
alter table if exists public.vyron_cost_recipes add column if not exists target_gp numeric(8,2) default 40;
alter table if exists public.vyron_cost_recipes add column if not exists status text default 'Imported';
alter table if exists public.vyron_cost_recipes add column if not exists version_note text;
alter table if exists public.vyron_cost_recipes add column if not exists demo_seed_key text;
alter table if exists public.vyron_cost_recipes add column if not exists is_demo boolean not null default false;

alter table if exists public.vyron_cost_product_recipe_links add column if not exists company_id uuid references public.vyron_cost_companies(id) on delete cascade;
alter table if exists public.vyron_cost_product_recipe_links add column if not exists product_id uuid references public.vyron_cost_products(id) on delete cascade;
alter table if exists public.vyron_cost_product_recipe_links add column if not exists recipe_id uuid references public.vyron_cost_recipes(id) on delete cascade;
alter table if exists public.vyron_cost_product_recipe_links add column if not exists recipe_name_snapshot text;
alter table if exists public.vyron_cost_product_recipe_links add column if not exists portion_qty numeric(12,3) default 1;
alter table if exists public.vyron_cost_product_recipe_links add column if not exists portion_cost numeric(12,2) default 0;
alter table if exists public.vyron_cost_product_recipe_links add column if not exists demo_seed_key text;
alter table if exists public.vyron_cost_product_recipe_links add column if not exists is_demo boolean not null default false;

alter table if exists public.vyron_cost_product_cost_lines add column if not exists company_id uuid references public.vyron_cost_companies(id) on delete cascade;
alter table if exists public.vyron_cost_product_cost_lines add column if not exists product_id uuid references public.vyron_cost_products(id) on delete set null;
alter table if exists public.vyron_cost_product_cost_lines add column if not exists product_name text;
alter table if exists public.vyron_cost_product_cost_lines add column if not exists line_type text default 'Ingredient';
alter table if exists public.vyron_cost_product_cost_lines add column if not exists line_name text;
alter table if exists public.vyron_cost_product_cost_lines add column if not exists quantity numeric(14,4) default 0;
alter table if exists public.vyron_cost_product_cost_lines add column if not exists unit text default 'unit';
alter table if exists public.vyron_cost_product_cost_lines add column if not exists unit_cost numeric(14,4) default 0;
alter table if exists public.vyron_cost_product_cost_lines add column if not exists wastage_percent numeric(8,2) default 0;
alter table if exists public.vyron_cost_product_cost_lines add column if not exists line_cost_imported numeric(14,4) default 0;
alter table if exists public.vyron_cost_product_cost_lines add column if not exists demo_seed_key text;
alter table if exists public.vyron_cost_product_cost_lines add column if not exists is_demo boolean not null default false;

alter table if exists public.vyron_cost_recipe_items add column if not exists company_id uuid references public.vyron_cost_companies(id) on delete cascade;
alter table if exists public.vyron_cost_recipe_items add column if not exists recipe_id uuid references public.vyron_cost_recipes(id) on delete cascade;
alter table if exists public.vyron_cost_recipe_items add column if not exists ingredient_id uuid references public.vyron_cost_ingredients(id) on delete set null;
alter table if exists public.vyron_cost_recipe_items add column if not exists ingredient_name_snapshot text;
alter table if exists public.vyron_cost_recipe_items add column if not exists quantity numeric(12,3) default 0;
alter table if exists public.vyron_cost_recipe_items add column if not exists unit text default 'kg';
alter table if exists public.vyron_cost_recipe_items add column if not exists true_unit_cost numeric(12,2) default 0;
alter table if exists public.vyron_cost_recipe_items add column if not exists demo_seed_key text;
alter table if exists public.vyron_cost_recipe_items add column if not exists is_demo boolean not null default false;

-- Purchase orders
alter table if exists public.vyron_cost_purchase_orders add column if not exists company_id uuid references public.vyron_cost_companies(id) on delete cascade;
alter table if exists public.vyron_cost_purchase_orders add column if not exists supplier_id uuid references public.vyron_cost_suppliers(id) on delete set null;
alter table if exists public.vyron_cost_purchase_orders add column if not exists po_number text;
alter table if exists public.vyron_cost_purchase_orders add column if not exists supplier_name_snapshot text;
alter table if exists public.vyron_cost_purchase_orders add column if not exists status text default 'Draft';
alter table if exists public.vyron_cost_purchase_orders add column if not exists order_date date;
alter table if exists public.vyron_cost_purchase_orders add column if not exists subtotal numeric(14,2) default 0;
alter table if exists public.vyron_cost_purchase_orders add column if not exists vat_amount numeric(14,2) default 0;
alter table if exists public.vyron_cost_purchase_orders add column if not exists total numeric(14,2) default 0;
alter table if exists public.vyron_cost_purchase_orders add column if not exists expected_total numeric(12,2) default 0;
alter table if exists public.vyron_cost_purchase_orders add column if not exists invoice_total numeric(12,2) default 0;
alter table if exists public.vyron_cost_purchase_orders add column if not exists outstanding_amount numeric(14,2) default 0;
alter table if exists public.vyron_cost_purchase_orders add column if not exists match_status text;
alter table if exists public.vyron_cost_purchase_orders add column if not exists notes text;
alter table if exists public.vyron_cost_purchase_orders add column if not exists demo_seed_key text;
alter table if exists public.vyron_cost_purchase_orders add column if not exists is_demo boolean not null default false;

-- PO lines (legacy tables often lack company_id and qty columns)
alter table if exists public.vyron_cost_purchase_order_lines add column if not exists company_id uuid references public.vyron_cost_companies(id) on delete cascade;
alter table if exists public.vyron_cost_purchase_order_lines add column if not exists purchase_order_id uuid references public.vyron_cost_purchase_orders(id) on delete cascade;
alter table if exists public.vyron_cost_purchase_order_lines add column if not exists item_type text default 'ingredient';
alter table if exists public.vyron_cost_purchase_order_lines add column if not exists item_id uuid;
alter table if exists public.vyron_cost_purchase_order_lines add column if not exists item_name text;
alter table if exists public.vyron_cost_purchase_order_lines add column if not exists quantity numeric(14,4) default 0;
alter table if exists public.vyron_cost_purchase_order_lines add column if not exists unit text default 'kg';
alter table if exists public.vyron_cost_purchase_order_lines add column if not exists unit_price numeric(14,4) default 0;
alter table if exists public.vyron_cost_purchase_order_lines add column if not exists vat_rate numeric(8,2) default 15;
alter table if exists public.vyron_cost_purchase_order_lines add column if not exists vat_amount numeric(14,2) default 0;
alter table if exists public.vyron_cost_purchase_order_lines add column if not exists line_total numeric(14,2) default 0;
alter table if exists public.vyron_cost_purchase_order_lines add column if not exists ordered_qty numeric(14,4) default 0;
alter table if exists public.vyron_cost_purchase_order_lines add column if not exists received_qty numeric(14,4) default 0;
alter table if exists public.vyron_cost_purchase_order_lines add column if not exists damaged_qty numeric(14,4) default 0;
alter table if exists public.vyron_cost_purchase_order_lines add column if not exists rejected_qty numeric(14,4) default 0;
alter table if exists public.vyron_cost_purchase_order_lines add column if not exists outstanding_qty numeric(14,4) default 0;
alter table if exists public.vyron_cost_purchase_order_lines add column if not exists sort_order integer default 0;
alter table if exists public.vyron_cost_purchase_order_lines add column if not exists demo_seed_key text;
alter table if exists public.vyron_cost_purchase_order_lines add column if not exists is_demo boolean not null default false;

update public.vyron_cost_purchase_order_lines l
set company_id = po.company_id
from public.vyron_cost_purchase_orders po
where l.purchase_order_id = po.id
  and l.company_id is null
  and po.company_id is not null;

-- GRNs + back orders
alter table if exists public.vyron_cost_goods_receipts add column if not exists company_id uuid references public.vyron_cost_companies(id) on delete cascade;
alter table if exists public.vyron_cost_goods_receipts add column if not exists purchase_order_id uuid references public.vyron_cost_purchase_orders(id) on delete cascade;
alter table if exists public.vyron_cost_goods_receipts add column if not exists grn_number text;
alter table if exists public.vyron_cost_goods_receipts add column if not exists supplier_id uuid references public.vyron_cost_suppliers(id) on delete set null;
alter table if exists public.vyron_cost_goods_receipts add column if not exists supplier_name_snapshot text;
alter table if exists public.vyron_cost_goods_receipts add column if not exists receipt_type text default 'partial';
alter table if exists public.vyron_cost_goods_receipts add column if not exists status text default 'Posted';
alter table if exists public.vyron_cost_goods_receipts add column if not exists received_by text;
alter table if exists public.vyron_cost_goods_receipts add column if not exists notes text;
alter table if exists public.vyron_cost_goods_receipts add column if not exists demo_seed_key text;
alter table if exists public.vyron_cost_goods_receipts add column if not exists is_demo boolean not null default false;

alter table if exists public.vyron_cost_goods_receipt_lines add column if not exists company_id uuid references public.vyron_cost_companies(id) on delete cascade;
alter table if exists public.vyron_cost_goods_receipt_lines add column if not exists goods_receipt_id uuid references public.vyron_cost_goods_receipts(id) on delete cascade;
alter table if exists public.vyron_cost_goods_receipt_lines add column if not exists purchase_order_line_id uuid references public.vyron_cost_purchase_order_lines(id) on delete set null;
alter table if exists public.vyron_cost_goods_receipt_lines add column if not exists item_name text;
alter table if exists public.vyron_cost_goods_receipt_lines add column if not exists ordered_qty numeric(14,4) default 0;
alter table if exists public.vyron_cost_goods_receipt_lines add column if not exists received_qty numeric(14,4) default 0;
alter table if exists public.vyron_cost_goods_receipt_lines add column if not exists damaged_qty numeric(14,4) default 0;
alter table if exists public.vyron_cost_goods_receipt_lines add column if not exists rejected_qty numeric(14,4) default 0;
alter table if exists public.vyron_cost_goods_receipt_lines add column if not exists outstanding_qty numeric(14,4) default 0;
alter table if exists public.vyron_cost_goods_receipt_lines add column if not exists unit text default 'kg';
alter table if exists public.vyron_cost_goods_receipt_lines add column if not exists demo_seed_key text;
alter table if exists public.vyron_cost_goods_receipt_lines add column if not exists is_demo boolean not null default false;

alter table if exists public.vyron_cost_back_orders add column if not exists company_id uuid references public.vyron_cost_companies(id) on delete cascade;
alter table if exists public.vyron_cost_back_orders add column if not exists purchase_order_id uuid references public.vyron_cost_purchase_orders(id) on delete cascade;
alter table if exists public.vyron_cost_back_orders add column if not exists purchase_order_line_id uuid references public.vyron_cost_purchase_order_lines(id) on delete set null;
alter table if exists public.vyron_cost_back_orders add column if not exists supplier_id uuid references public.vyron_cost_suppliers(id) on delete set null;
alter table if exists public.vyron_cost_back_orders add column if not exists supplier_name_snapshot text;
alter table if exists public.vyron_cost_back_orders add column if not exists item_name text;
alter table if exists public.vyron_cost_back_orders add column if not exists outstanding_qty numeric(14,4) default 0;
alter table if exists public.vyron_cost_back_orders add column if not exists expected_date date;
alter table if exists public.vyron_cost_back_orders add column if not exists status text default 'Open';
alter table if exists public.vyron_cost_back_orders add column if not exists demo_seed_key text;
alter table if exists public.vyron_cost_back_orders add column if not exists is_demo boolean not null default false;

-- Documents
alter table if exists public.vyron_documents add column if not exists tenant_id uuid references public.vyron_cost_companies(id) on delete cascade;
alter table if exists public.vyron_documents add column if not exists document_type text default 'pending_classification';
alter table if exists public.vyron_documents add column if not exists supplier_name text;
alter table if exists public.vyron_documents add column if not exists invoice_number text;
alter table if exists public.vyron_documents add column if not exists invoice_date date;
alter table if exists public.vyron_documents add column if not exists purchase_order_number text;
alter table if exists public.vyron_documents add column if not exists purchase_order_id uuid references public.vyron_cost_purchase_orders(id) on delete set null;
alter table if exists public.vyron_documents add column if not exists subtotal numeric(14,2);
alter table if exists public.vyron_documents add column if not exists vat numeric(14,2);
alter table if exists public.vyron_documents add column if not exists total numeric(14,2);
alter table if exists public.vyron_documents add column if not exists currency text default 'ZAR';
alter table if exists public.vyron_documents add column if not exists confidence numeric(5,2);
alter table if exists public.vyron_documents add column if not exists status text default 'uploaded';
alter table if exists public.vyron_documents add column if not exists storage_bucket text default 'vyron-documents';
alter table if exists public.vyron_documents add column if not exists storage_path text;
alter table if exists public.vyron_documents add column if not exists original_filename text;
alter table if exists public.vyron_documents add column if not exists file_mime text;
alter table if exists public.vyron_documents add column if not exists approved_at timestamptz;
alter table if exists public.vyron_documents add column if not exists approved_by text;
alter table if exists public.vyron_documents add column if not exists archived_at timestamptz;
alter table if exists public.vyron_documents add column if not exists demo_seed_key text;
alter table if exists public.vyron_documents add column if not exists is_demo boolean not null default false;

alter table if exists public.vyron_document_line_items add column if not exists document_id uuid references public.vyron_documents(id) on delete cascade;
alter table if exists public.vyron_document_line_items add column if not exists description text default '';
alter table if exists public.vyron_document_line_items add column if not exists quantity numeric(14,4);
alter table if exists public.vyron_document_line_items add column if not exists unit text;
alter table if exists public.vyron_document_line_items add column if not exists unit_price numeric(14,4);
alter table if exists public.vyron_document_line_items add column if not exists vat numeric(14,2);
alter table if exists public.vyron_document_line_items add column if not exists line_total numeric(14,2);
alter table if exists public.vyron_document_line_items add column if not exists matched_entity_type text;
alter table if exists public.vyron_document_line_items add column if not exists matched_entity_id uuid;
alter table if exists public.vyron_document_line_items add column if not exists matched_entity_name text;
alter table if exists public.vyron_document_line_items add column if not exists confidence_score numeric(5,2);
alter table if exists public.vyron_document_line_items add column if not exists demo_seed_key text;
alter table if exists public.vyron_document_line_items add column if not exists is_demo boolean not null default false;

alter table if exists public.vyron_supplier_price_history add column if not exists tenant_id uuid references public.vyron_cost_companies(id) on delete cascade;
alter table if exists public.vyron_supplier_price_history add column if not exists supplier_id uuid references public.vyron_cost_suppliers(id) on delete set null;
alter table if exists public.vyron_supplier_price_history add column if not exists supplier_name text;
alter table if exists public.vyron_supplier_price_history add column if not exists document_id uuid references public.vyron_documents(id) on delete set null;
alter table if exists public.vyron_supplier_price_history add column if not exists entity_type text;
alter table if exists public.vyron_supplier_price_history add column if not exists entity_id uuid;
alter table if exists public.vyron_supplier_price_history add column if not exists entity_name text;
alter table if exists public.vyron_supplier_price_history add column if not exists item_description text;
alter table if exists public.vyron_supplier_price_history add column if not exists previous_price numeric(14,4);
alter table if exists public.vyron_supplier_price_history add column if not exists new_price numeric(14,4);
alter table if exists public.vyron_supplier_price_history add column if not exists price_difference numeric(14,4);
alter table if exists public.vyron_supplier_price_history add column if not exists percentage_change numeric(10,4);
alter table if exists public.vyron_supplier_price_history add column if not exists change_percent numeric(10,4);
alter table if exists public.vyron_supplier_price_history add column if not exists movement_type text default 'first_purchase';
alter table if exists public.vyron_supplier_price_history add column if not exists movement_reason text;
alter table if exists public.vyron_supplier_price_history add column if not exists price_movement text;
alter table if exists public.vyron_supplier_price_history add column if not exists item_kind text;
alter table if exists public.vyron_supplier_price_history add column if not exists invoice_date date;
alter table if exists public.vyron_supplier_price_history add column if not exists approved_at timestamptz;
alter table if exists public.vyron_supplier_price_history add column if not exists approved_by text;
alter table if exists public.vyron_supplier_price_history add column if not exists demo_seed_key text;
alter table if exists public.vyron_supplier_price_history add column if not exists is_demo boolean not null default false;

-- Procurement intelligence
alter table if exists public.vyron_procurement_three_way_matches add column if not exists company_id uuid references public.vyron_cost_companies(id) on delete cascade;
alter table if exists public.vyron_procurement_three_way_matches add column if not exists document_id uuid references public.vyron_documents(id) on delete cascade;
alter table if exists public.vyron_procurement_three_way_matches add column if not exists purchase_order_id uuid references public.vyron_cost_purchase_orders(id) on delete cascade;
alter table if exists public.vyron_procurement_three_way_matches add column if not exists goods_receipt_id uuid references public.vyron_cost_goods_receipts(id) on delete set null;
alter table if exists public.vyron_procurement_three_way_matches add column if not exists match_status text default 'Partial Match';
alter table if exists public.vyron_procurement_three_way_matches add column if not exists po_qty numeric(14,4);
alter table if exists public.vyron_procurement_three_way_matches add column if not exists invoice_qty numeric(14,4);
alter table if exists public.vyron_procurement_three_way_matches add column if not exists grn_qty numeric(14,4);
alter table if exists public.vyron_procurement_three_way_matches add column if not exists qty_variance numeric(14,4);
alter table if exists public.vyron_procurement_three_way_matches add column if not exists po_unit_price numeric(14,4);
alter table if exists public.vyron_procurement_three_way_matches add column if not exists invoice_unit_price numeric(14,4);
alter table if exists public.vyron_procurement_three_way_matches add column if not exists price_variance numeric(14,4);
alter table if exists public.vyron_procurement_three_way_matches add column if not exists po_total numeric(14,2);
alter table if exists public.vyron_procurement_three_way_matches add column if not exists invoice_total numeric(14,2);
alter table if exists public.vyron_procurement_three_way_matches add column if not exists grn_total numeric(14,2);
alter table if exists public.vyron_procurement_three_way_matches add column if not exists total_variance numeric(14,2);
alter table if exists public.vyron_procurement_three_way_matches add column if not exists demo_seed_key text;
alter table if exists public.vyron_procurement_three_way_matches add column if not exists is_demo boolean not null default false;

alter table if exists public.vyron_procurement_audit_log add column if not exists company_id uuid references public.vyron_cost_companies(id) on delete cascade;
alter table if exists public.vyron_procurement_audit_log add column if not exists event_type text;
alter table if exists public.vyron_procurement_audit_log add column if not exists entity_type text;
alter table if exists public.vyron_procurement_audit_log add column if not exists entity_id uuid;
alter table if exists public.vyron_procurement_audit_log add column if not exists entity_label text;
alter table if exists public.vyron_procurement_audit_log add column if not exists detail text;
alter table if exists public.vyron_procurement_audit_log add column if not exists actor text;
alter table if exists public.vyron_procurement_audit_log add column if not exists demo_seed_key text;
alter table if exists public.vyron_procurement_audit_log add column if not exists is_demo boolean not null default false;

alter table if exists public.vyron_procurement_risk_alerts add column if not exists tenant_id uuid references public.vyron_cost_companies(id) on delete cascade;
alter table if exists public.vyron_procurement_risk_alerts add column if not exists supplier_id uuid references public.vyron_cost_suppliers(id) on delete set null;
alter table if exists public.vyron_procurement_risk_alerts add column if not exists supplier_name text;
alter table if exists public.vyron_procurement_risk_alerts add column if not exists document_id uuid references public.vyron_documents(id) on delete set null;
alter table if exists public.vyron_procurement_risk_alerts add column if not exists risk_type text;
alter table if exists public.vyron_procurement_risk_alerts add column if not exists severity text default 'medium';
alter table if exists public.vyron_procurement_risk_alerts add column if not exists title text;
alter table if exists public.vyron_procurement_risk_alerts add column if not exists description text;
alter table if exists public.vyron_procurement_risk_alerts add column if not exists status text default 'open';
alter table if exists public.vyron_procurement_risk_alerts add column if not exists metadata jsonb default '{}'::jsonb;
alter table if exists public.vyron_procurement_risk_alerts add column if not exists demo_seed_key text;
alter table if exists public.vyron_procurement_risk_alerts add column if not exists is_demo boolean not null default false;

-- Inventory
alter table if exists public.vyron_cost_stock_items add column if not exists company_id uuid references public.vyron_cost_companies(id) on delete cascade;
alter table if exists public.vyron_cost_stock_items add column if not exists item_code text;
alter table if exists public.vyron_cost_stock_items add column if not exists description text;
alter table if exists public.vyron_cost_stock_items add column if not exists category text default 'Uncategorised';
alter table if exists public.vyron_cost_stock_items add column if not exists entity_type text;
alter table if exists public.vyron_cost_stock_items add column if not exists entity_id uuid;
alter table if exists public.vyron_cost_stock_items add column if not exists unit text default 'kg';
alter table if exists public.vyron_cost_stock_items add column if not exists supplier_id uuid references public.vyron_cost_suppliers(id) on delete set null;
alter table if exists public.vyron_cost_stock_items add column if not exists supplier_name_snapshot text;
alter table if exists public.vyron_cost_stock_items add column if not exists current_cost numeric(14,4) default 0;
alter table if exists public.vyron_cost_stock_items add column if not exists average_cost numeric(14,4) default 0;
alter table if exists public.vyron_cost_stock_items add column if not exists qty_on_hand numeric(14,4) default 0;
alter table if exists public.vyron_cost_stock_items add column if not exists inventory_value numeric(14,2) default 0;
alter table if exists public.vyron_cost_stock_items add column if not exists reorder_level numeric(14,4) default 0;
alter table if exists public.vyron_cost_stock_items add column if not exists stock_status text default 'In Stock';
alter table if exists public.vyron_cost_stock_items add column if not exists demo_seed_key text;
alter table if exists public.vyron_cost_stock_items add column if not exists is_demo boolean not null default false;

alter table if exists public.vyron_cost_stock_ledger add column if not exists company_id uuid references public.vyron_cost_companies(id) on delete cascade;
alter table if exists public.vyron_cost_stock_ledger add column if not exists stock_item_id uuid references public.vyron_cost_stock_items(id) on delete cascade;
alter table if exists public.vyron_cost_stock_ledger add column if not exists movement_type text;
alter table if exists public.vyron_cost_stock_ledger add column if not exists quantity_in numeric(14,4) default 0;
alter table if exists public.vyron_cost_stock_ledger add column if not exists quantity_out numeric(14,4) default 0;
alter table if exists public.vyron_cost_stock_ledger add column if not exists balance_after numeric(14,4) default 0;
alter table if exists public.vyron_cost_stock_ledger add column if not exists unit_cost numeric(14,4) default 0;
alter table if exists public.vyron_cost_stock_ledger add column if not exists value numeric(14,2) default 0;
alter table if exists public.vyron_cost_stock_ledger add column if not exists reference_type text;
alter table if exists public.vyron_cost_stock_ledger add column if not exists reference_id uuid;
alter table if exists public.vyron_cost_stock_ledger add column if not exists reference_label text;
alter table if exists public.vyron_cost_stock_ledger add column if not exists actor text;
alter table if exists public.vyron_cost_stock_ledger add column if not exists demo_seed_key text;
alter table if exists public.vyron_cost_stock_ledger add column if not exists is_demo boolean not null default false;

-- Reports + risk + recovery
alter table if exists public.vyron_cost_reports add column if not exists company_id uuid references public.vyron_cost_companies(id) on delete cascade;
alter table if exists public.vyron_cost_reports add column if not exists report_name text;
alter table if exists public.vyron_cost_reports add column if not exists report_type text;
alter table if exists public.vyron_cost_reports add column if not exists status text default 'Ready';
alter table if exists public.vyron_cost_reports add column if not exists estimated_value numeric(12,2) default 0;
alter table if exists public.vyron_cost_reports add column if not exists demo_seed_key text;
alter table if exists public.vyron_cost_reports add column if not exists is_demo boolean not null default false;

alter table if exists public.vyron_cost_leakage_findings add column if not exists company_id uuid references public.vyron_cost_companies(id) on delete cascade;
alter table if exists public.vyron_cost_leakage_findings add column if not exists finding_type text;
alter table if exists public.vyron_cost_leakage_findings add column if not exists title text;
alter table if exists public.vyron_cost_leakage_findings add column if not exists description text;
alter table if exists public.vyron_cost_leakage_findings add column if not exists estimated_monthly_loss numeric(14,2) default 0;
alter table if exists public.vyron_cost_leakage_findings add column if not exists severity text default 'Medium';
alter table if exists public.vyron_cost_leakage_findings add column if not exists status text default 'Open';
alter table if exists public.vyron_cost_leakage_findings add column if not exists supplier_name text;
alter table if exists public.vyron_cost_leakage_findings add column if not exists demo_seed_key text;
alter table if exists public.vyron_cost_leakage_findings add column if not exists is_demo boolean not null default false;

alter table if exists public.vyron_cost_invoice_risk_findings add column if not exists company_id uuid references public.vyron_cost_companies(id) on delete cascade;
alter table if exists public.vyron_cost_invoice_risk_findings add column if not exists invoice_number text;
alter table if exists public.vyron_cost_invoice_risk_findings add column if not exists supplier_name text;
alter table if exists public.vyron_cost_invoice_risk_findings add column if not exists invoice_amount numeric(14,2) default 0;
alter table if exists public.vyron_cost_invoice_risk_findings add column if not exists risk_type text;
alter table if exists public.vyron_cost_invoice_risk_findings add column if not exists risk_score numeric(6,2) default 0;
alter table if exists public.vyron_cost_invoice_risk_findings add column if not exists ai_confidence numeric(6,2) default 0;
alter table if exists public.vyron_cost_invoice_risk_findings add column if not exists duplicate_of text;
alter table if exists public.vyron_cost_invoice_risk_findings add column if not exists review_status text default 'Pending Review';
alter table if exists public.vyron_cost_invoice_risk_findings add column if not exists document_id uuid references public.vyron_documents(id) on delete set null;
alter table if exists public.vyron_cost_invoice_risk_findings add column if not exists demo_seed_key text;
alter table if exists public.vyron_cost_invoice_risk_findings add column if not exists is_demo boolean not null default false;

alter table if exists public.vyron_cost_procurement_risk_findings add column if not exists company_id uuid references public.vyron_cost_companies(id) on delete cascade;
alter table if exists public.vyron_cost_procurement_risk_findings add column if not exists supplier_name text;
alter table if exists public.vyron_cost_procurement_risk_findings add column if not exists category_name text;
alter table if exists public.vyron_cost_procurement_risk_findings add column if not exists risk_type text;
alter table if exists public.vyron_cost_procurement_risk_findings add column if not exists risk_score numeric(6,2) default 0;
alter table if exists public.vyron_cost_procurement_risk_findings add column if not exists price_change_percent numeric(8,2) default 0;
alter table if exists public.vyron_cost_procurement_risk_findings add column if not exists spend_amount numeric(14,2) default 0;
alter table if exists public.vyron_cost_procurement_risk_findings add column if not exists action_required text;
alter table if exists public.vyron_cost_procurement_risk_findings add column if not exists demo_seed_key text;
alter table if exists public.vyron_cost_procurement_risk_findings add column if not exists is_demo boolean not null default false;

alter table if exists public.vyron_recovery_calculations add column if not exists tenant_id uuid references public.vyron_cost_companies(id) on delete cascade;
alter table if exists public.vyron_recovery_calculations add column if not exists opportunity_key text;
alter table if exists public.vyron_recovery_calculations add column if not exists category text;
alter table if exists public.vyron_recovery_calculations add column if not exists title text;
alter table if exists public.vyron_recovery_calculations add column if not exists confidence_level text default 'Medium Confidence';
alter table if exists public.vyron_recovery_calculations add column if not exists confidence_score numeric(5,2) default 0;
alter table if exists public.vyron_recovery_calculations add column if not exists is_estimated boolean default true;
alter table if exists public.vyron_recovery_calculations add column if not exists formula_expression text;
alter table if exists public.vyron_recovery_calculations add column if not exists formula_inputs jsonb default '{}'::jsonb;
alter table if exists public.vyron_recovery_calculations add column if not exists products_affected jsonb default '[]'::jsonb;
alter table if exists public.vyron_recovery_calculations add column if not exists recommended_action text;
alter table if exists public.vyron_recovery_calculations add column if not exists monthly_recovery numeric(14,2) default 0;
alter table if exists public.vyron_recovery_calculations add column if not exists annual_recovery numeric(14,2) default 0;
alter table if exists public.vyron_recovery_calculations add column if not exists estimated_recovery numeric(14,2) default 0;
alter table if exists public.vyron_recovery_calculations add column if not exists status text default 'Identified';

alter table if exists public.vyron_procurement_recommendations add column if not exists tenant_id uuid references public.vyron_cost_companies(id) on delete cascade;
alter table if exists public.vyron_procurement_recommendations add column if not exists recommendation_key text;
alter table if exists public.vyron_procurement_recommendations add column if not exists category text;
alter table if exists public.vyron_procurement_recommendations add column if not exists title text;
alter table if exists public.vyron_procurement_recommendations add column if not exists summary text;
alter table if exists public.vyron_procurement_recommendations add column if not exists recommended_action text;
alter table if exists public.vyron_procurement_recommendations add column if not exists why_exists text;
alter table if exists public.vyron_procurement_recommendations add column if not exists data_used jsonb default '{}'::jsonb;
alter table if exists public.vyron_procurement_recommendations add column if not exists formula_expression text;
alter table if exists public.vyron_procurement_recommendations add column if not exists confidence_score numeric(5,2) default 0;
alter table if exists public.vyron_procurement_recommendations add column if not exists confidence_level text default 'Medium Confidence';
alter table if exists public.vyron_procurement_recommendations add column if not exists affected_products jsonb default '[]'::jsonb;
alter table if exists public.vyron_procurement_recommendations add column if not exists affected_suppliers jsonb default '[]'::jsonb;
alter table if exists public.vyron_procurement_recommendations add column if not exists potential_benefit_monthly numeric(14,2) default 0;
alter table if exists public.vyron_procurement_recommendations add column if not exists potential_benefit_annual numeric(14,2) default 0;
alter table if exists public.vyron_procurement_recommendations add column if not exists source_type text;
alter table if exists public.vyron_procurement_recommendations add column if not exists problem_statement text;
alter table if exists public.vyron_procurement_recommendations add column if not exists cause_statement text;

alter table if exists public.vyron_cost_recovery_opportunities add column if not exists company_id uuid references public.vyron_cost_companies(id) on delete cascade;
alter table if exists public.vyron_cost_recovery_opportunities add column if not exists title text;
alter table if exists public.vyron_cost_recovery_opportunities add column if not exists opportunity_type text;
alter table if exists public.vyron_cost_recovery_opportunities add column if not exists description text;
alter table if exists public.vyron_cost_recovery_opportunities add column if not exists formula text;
alter table if exists public.vyron_cost_recovery_opportunities add column if not exists monthly_value numeric(14,2) default 0;
alter table if exists public.vyron_cost_recovery_opportunities add column if not exists annual_value numeric(14,2) default 0;
alter table if exists public.vyron_cost_recovery_opportunities add column if not exists confidence numeric(6,2) default 0;
alter table if exists public.vyron_cost_recovery_opportunities add column if not exists recommended_action text;
alter table if exists public.vyron_cost_recovery_opportunities add column if not exists data_source text default 'System Calculation';
alter table if exists public.vyron_cost_recovery_opportunities add column if not exists opportunity text;
alter table if exists public.vyron_cost_recovery_opportunities add column if not exists category text;
alter table if exists public.vyron_cost_recovery_opportunities add column if not exists monthly_saving numeric(14,2) default 0;
alter table if exists public.vyron_cost_recovery_opportunities add column if not exists annual_saving numeric(14,2) default 0;
alter table if exists public.vyron_cost_recovery_opportunities add column if not exists difficulty text default 'Medium';
alter table if exists public.vyron_cost_recovery_opportunities add column if not exists status text default 'Open';
alter table if exists public.vyron_cost_recovery_opportunities add column if not exists action text;
alter table if exists public.vyron_cost_recovery_opportunities add column if not exists demo_seed_key text;
alter table if exists public.vyron_cost_recovery_opportunities add column if not exists is_demo boolean not null default false;

update public.vyron_cost_recovery_opportunities
set title = coalesce(title, opportunity, 'Recovery opportunity')
where title is null and opportunity is not null;

-- ---------------------------------------------------------------------------
-- Demo RLS (permissive — matches other VYRON demo packs)
-- ---------------------------------------------------------------------------
alter table public.vyron_cost_purchase_order_lines enable row level security;
alter table public.vyron_po_approval_rules enable row level security;
alter table public.vyron_cost_goods_receipts enable row level security;
alter table public.vyron_cost_goods_receipt_lines enable row level security;
alter table public.vyron_cost_back_orders enable row level security;
alter table public.vyron_procurement_three_way_matches enable row level security;
alter table public.vyron_procurement_audit_log enable row level security;
alter table public.vyron_procurement_risk_alerts enable row level security;
alter table public.vyron_documents enable row level security;
alter table public.vyron_document_line_items enable row level security;
alter table public.vyron_supplier_price_history enable row level security;
alter table public.vyron_cost_stock_items enable row level security;
alter table public.vyron_cost_stock_ledger enable row level security;
alter table public.vyron_recovery_calculations enable row level security;
alter table public.vyron_procurement_recommendations enable row level security;
alter table public.vyron_cost_recovery_opportunities enable row level security;

drop policy if exists "demo read three way" on public.vyron_procurement_three_way_matches;
drop policy if exists "demo write three way" on public.vyron_procurement_three_way_matches;
create policy "demo read three way" on public.vyron_procurement_three_way_matches for select using (true);
create policy "demo write three way" on public.vyron_procurement_three_way_matches for all using (true) with check (true);

drop policy if exists "demo read procurement audit" on public.vyron_procurement_audit_log;
drop policy if exists "demo write procurement audit" on public.vyron_procurement_audit_log;
create policy "demo read procurement audit" on public.vyron_procurement_audit_log for select using (true);
create policy "demo write procurement audit" on public.vyron_procurement_audit_log for all using (true) with check (true);

drop policy if exists "demo read vyron_procurement_risk_alerts" on public.vyron_procurement_risk_alerts;
drop policy if exists "demo write vyron_procurement_risk_alerts" on public.vyron_procurement_risk_alerts;
create policy "demo read vyron_procurement_risk_alerts" on public.vyron_procurement_risk_alerts for select using (true);
create policy "demo write vyron_procurement_risk_alerts" on public.vyron_procurement_risk_alerts for all using (true) with check (true);
