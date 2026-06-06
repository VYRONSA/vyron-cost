-- VYRON COST — Batch 6 Document Intelligence schema repair
-- Safe to re-run. Adds missing columns used by supplier learning, price history and approval rules.

alter table if exists public.vyron_supplier_line_item_mappings
  add column if not exists disabled boolean not null default false;

alter table if exists public.vyron_supplier_line_item_mappings
  add column if not exists match_source text default 'manual';

alter table if exists public.vyron_supplier_line_item_mappings
  add column if not exists last_seen_at timestamptz default now();

alter table if exists public.vyron_supplier_price_history
  add column if not exists invoice_number text;

alter table if exists public.vyron_supplier_price_history
  add column if not exists invoice_date date;

alter table if exists public.vyron_supplier_price_history
  add column if not exists document_id uuid;

alter table if exists public.vyron_document_approval_rules
  add column if not exists allow_ignored_lines boolean not null default true;

alter table if exists public.vyron_document_approval_rules
  add column if not exists require_purchase_order boolean not null default false;

alter table if exists public.vyron_document_approval_rules
  add column if not exists require_supplier_mapping boolean not null default false;

alter table if exists public.vyron_documents
  add column if not exists purchase_order_id uuid,
  add column if not exists purchase_order_number text,
  add column if not exists reconciliation_note text;

alter table if exists public.vyron_document_line_items
  add column if not exists matched_entity_type text,
  add column if not exists matched_entity_id uuid,
  add column if not exists matched_entity_name text,
  add column if not exists ignored boolean not null default false;
