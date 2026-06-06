-- VYRON COST — Schema Repair June 2026
-- Safe to re-run. Adds missing columns reported during demo stabilisation.

alter table if exists public.vyron_supplier_line_item_mappings
  add column if not exists disabled boolean not null default false;

alter table if exists public.vyron_supplier_line_item_mappings
  add column if not exists disabled_at timestamptz;

alter table if exists public.vyron_supplier_line_item_mappings
  add column if not exists disabled_by text;

alter table if exists public.vyron_supplier_price_history
  add column if not exists invoice_number text;

alter table if exists public.vyron_supplier_price_history
  add column if not exists invoice_date date;

alter table if exists public.vyron_supplier_price_history
  add column if not exists document_id uuid;

alter table if exists public.vyron_document_approval_rules
  add column if not exists allow_ignored_lines boolean not null default true;

alter table if exists public.vyron_document_approval_rules
  add column if not exists require_matched_lines boolean not null default false;

alter table if exists public.vyron_document_approval_rules
  add column if not exists allow_rounding_difference boolean not null default true;

alter table if exists public.vyron_document_approval_rules
  add column if not exists maximum_allowed_variance_percent numeric not null default 1;

alter table if exists public.vyron_cost_goods_receipts
  add column if not exists updated_at timestamptz;

alter table if exists public.vyron_cost_goods_receipt_lines
  add column if not exists updated_at timestamptz;

alter table if exists public.vyron_cost_purchase_order_lines
  add column if not exists damaged_qty numeric not null default 0;

alter table if exists public.vyron_cost_purchase_order_lines
  add column if not exists rejected_qty numeric not null default 0;

alter table if exists public.vyron_cost_purchase_orders
  add column if not exists updated_at timestamptz;

alter table if exists public.vyron_cost_back_orders
  add column if not exists unit text;

alter table if exists public.vyron_cost_back_orders
  add column if not exists updated_at timestamptz;
