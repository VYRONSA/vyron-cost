-- STABILISATION #7: safe schema repair — idempotent, safe to re-run
-- Fixes reported errors:
--   vyron_supplier_line_item_mappings.disabled
--   vyron_supplier_price_history.invoice_number
--   vyron_document_approval_rules.allow_ignored_lines
-- Plus audited columns used by Document Intelligence, supplier learning, PO/GRN.
--
-- Run order:
--   1. supabase/vyron-cost-demo-schema-catchup.sql
--   2. supabase/stabilisation-schema-repair.sql   <-- this file
--   3. supabase/vyron-cost-demo-full-business-cycle.sql

-- ---------------------------------------------------------------------------
-- Supplier line item mappings
-- ---------------------------------------------------------------------------
create table if not exists public.vyron_supplier_line_item_mappings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.vyron_cost_companies(id) on delete cascade,
  supplier_name text not null,
  source_description text not null,
  source_description_normalized text,
  entity_type text,
  entity_id uuid,
  entity_name text,
  confidence_score numeric(5,2) default 0,
  usage_count int not null default 0,
  last_seen_at timestamptz default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.vyron_supplier_line_item_mappings
  add column if not exists disabled boolean not null default false,
  add column if not exists supplier_vat_number text,
  add column if not exists source_sku text,
  add column if not exists source_sku_normalized text,
  add column if not exists unit text,
  add column if not exists last_approved_price numeric(14,4),
  add column if not exists approved_by text,
  add column if not exists approved_at timestamptz,
  add column if not exists last_document_id uuid references public.vyron_documents(id) on delete set null,
  add column if not exists match_source text;

create index if not exists idx_vyron_supplier_line_mappings_disabled
  on public.vyron_supplier_line_item_mappings (tenant_id, supplier_name, disabled);

create index if not exists idx_vyron_supplier_line_mappings_lookup
  on public.vyron_supplier_line_item_mappings (tenant_id, supplier_name, source_description_normalized);

-- Mapping audit history (supplier learning disable/edit)
create table if not exists public.vyron_supplier_line_item_mapping_history (
  id uuid primary key default gen_random_uuid(),
  mapping_id uuid references public.vyron_supplier_line_item_mappings(id) on delete set null,
  tenant_id uuid not null references public.vyron_cost_companies(id) on delete cascade,
  supplier_name text not null,
  supplier_vat_number text,
  source_description text,
  source_sku text,
  unit text,
  change_type text not null,
  previous_entity_type text,
  previous_entity_id uuid,
  previous_entity_name text,
  previous_last_approved_price numeric(14,4),
  new_entity_type text,
  new_entity_id uuid,
  new_entity_name text,
  new_last_approved_price numeric(14,4),
  confidence_score numeric(5,2),
  approved_by text,
  document_id uuid references public.vyron_documents(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Supplier price history
-- ---------------------------------------------------------------------------
create table if not exists public.vyron_supplier_price_history (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.vyron_cost_companies(id) on delete cascade,
  supplier_name text,
  document_id uuid references public.vyron_documents(id) on delete set null,
  entity_type text,
  entity_id uuid,
  entity_name text,
  new_price numeric(14,4),
  created_at timestamptz not null default now()
);

alter table public.vyron_supplier_price_history
  add column if not exists invoice_number text,
  add column if not exists invoice_date date,
  add column if not exists line_item_id uuid,
  add column if not exists item_description text,
  add column if not exists item_kind text,
  add column if not exists quantity numeric(14,4),
  add column if not exists unit text,
  add column if not exists previous_price numeric(14,4),
  add column if not exists price_difference numeric(14,4),
  add column if not exists percentage_change numeric(10,4),
  add column if not exists change_percent numeric(10,4),
  add column if not exists price_movement text,
  add column if not exists movement_type text,
  add column if not exists currency text default 'ZAR',
  add column if not exists potential_costing_impact numeric(14,4),
  add column if not exists approved_by text,
  add column if not exists approved_at timestamptz,
  add column if not exists supplier_id uuid references public.vyron_cost_suppliers(id) on delete set null;

create index if not exists idx_vyron_supplier_price_history_invoice
  on public.vyron_supplier_price_history (tenant_id, invoice_number, created_at desc);

create index if not exists idx_vyron_supplier_price_history_entity
  on public.vyron_supplier_price_history (tenant_id, entity_type, entity_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Document approval rules (supervisor settings)
-- ---------------------------------------------------------------------------
create table if not exists public.vyron_document_approval_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.vyron_cost_companies(id) on delete cascade,
  min_header_confidence numeric(5,2) not null default 70,
  block_unmapped_lines boolean not null default true,
  rounding_tolerance numeric(14,2) not null default 0.05,
  major_mismatch_threshold numeric(14,2) not null default 1.00,
  max_manual_overrides_before_alert int not null default 5,
  require_reconciliation_note_above numeric(14,2) not null default 1.00,
  updated_at timestamptz not null default now(),
  unique (tenant_id)
);

alter table public.vyron_document_approval_rules
  add column if not exists require_purchase_order boolean not null default false,
  add column if not exists require_supplier boolean not null default true,
  add column if not exists require_invoice_number boolean not null default true,
  add column if not exists require_invoice_date boolean not null default true,
  add column if not exists require_vat boolean not null default false,
  add column if not exists require_matched_line_items boolean not null default true,
  add column if not exists allow_ignored_lines boolean not null default true,
  add column if not exists allow_rounding_difference boolean not null default true,
  add column if not exists max_allowed_variance_percent numeric(8,2) not null default 5.00,
  add column if not exists supervisor_override_required_above_variance boolean not null default true;

-- Default tenant rules (Handcrafted demo)
insert into public.vyron_document_approval_rules (
  tenant_id,
  min_header_confidence,
  block_unmapped_lines,
  rounding_tolerance,
  major_mismatch_threshold,
  max_manual_overrides_before_alert,
  require_reconciliation_note_above,
  allow_ignored_lines
)
select
  '48002864-8800-4000-9000-000000000001'::uuid,
  70, true, 0.05, 1.00, 5, 1.00, true
where exists (select 1 from public.vyron_cost_companies where id = '48002864-8800-4000-9000-000000000001'::uuid)
  and not exists (
    select 1 from public.vyron_document_approval_rules
    where tenant_id = '48002864-8800-4000-9000-000000000001'::uuid
  );

-- ---------------------------------------------------------------------------
-- PO / GRN / stock count (demo stabilisation)
-- ---------------------------------------------------------------------------
alter table if exists public.vyron_cost_purchase_order_lines
  add column if not exists received_qty numeric not null default 0,
  add column if not exists damaged_qty numeric not null default 0,
  add column if not exists rejected_qty numeric not null default 0,
  add column if not exists outstanding_qty numeric,
  add column if not exists ordered_qty numeric;

update public.vyron_cost_purchase_order_lines
set outstanding_qty = greatest(
  0,
  coalesce(nullif(ordered_qty, 0), quantity, 0)
  - coalesce(received_qty, 0)
  - coalesce(damaged_qty, 0)
  - coalesce(rejected_qty, 0)
)
where outstanding_qty is null;

alter table if exists public.vyron_cost_goods_receipts
  add column if not exists status text not null default 'Posted',
  add column if not exists notes text,
  add column if not exists received_by text,
  add column if not exists updated_at timestamptz default now();

alter table if exists public.vyron_cost_goods_receipt_lines
  add column if not exists damaged_qty numeric not null default 0,
  add column if not exists rejected_qty numeric not null default 0,
  add column if not exists outstanding_qty numeric not null default 0,
  add column if not exists updated_at timestamptz default now();

alter table if exists public.vyron_cost_stock_count_lines
  add column if not exists unit_cost numeric(14,4) default 0;

alter table if exists public.vyron_cost_back_orders
  add column if not exists goods_receipt_id uuid references public.vyron_cost_goods_receipts(id) on delete set null;

-- ---------------------------------------------------------------------------
-- RLS (demo permissive)
-- ---------------------------------------------------------------------------
alter table public.vyron_supplier_line_item_mappings enable row level security;
alter table public.vyron_supplier_price_history enable row level security;
alter table public.vyron_document_approval_rules enable row level security;
alter table public.vyron_supplier_line_item_mapping_history enable row level security;

drop policy if exists "demo read vyron_supplier_line_item_mappings" on public.vyron_supplier_line_item_mappings;
drop policy if exists "demo write vyron_supplier_line_item_mappings" on public.vyron_supplier_line_item_mappings;
create policy "demo read vyron_supplier_line_item_mappings" on public.vyron_supplier_line_item_mappings for select using (true);
create policy "demo write vyron_supplier_line_item_mappings" on public.vyron_supplier_line_item_mappings for all using (true) with check (true);

drop policy if exists "demo read vyron_supplier_price_history" on public.vyron_supplier_price_history;
drop policy if exists "demo write vyron_supplier_price_history" on public.vyron_supplier_price_history;
create policy "demo read vyron_supplier_price_history" on public.vyron_supplier_price_history for select using (true);
create policy "demo write vyron_supplier_price_history" on public.vyron_supplier_price_history for all using (true) with check (true);

drop policy if exists "demo read vyron_document_approval_rules" on public.vyron_document_approval_rules;
drop policy if exists "demo write vyron_document_approval_rules" on public.vyron_document_approval_rules;
create policy "demo read vyron_document_approval_rules" on public.vyron_document_approval_rules for select using (true);
create policy "demo write vyron_document_approval_rules" on public.vyron_document_approval_rules for all using (true) with check (true);

drop policy if exists "demo read vyron_supplier_line_item_mapping_history" on public.vyron_supplier_line_item_mapping_history;
drop policy if exists "demo write vyron_supplier_line_item_mapping_history" on public.vyron_supplier_line_item_mapping_history;
create policy "demo read vyron_supplier_line_item_mapping_history" on public.vyron_supplier_line_item_mapping_history for select using (true);
create policy "demo write vyron_supplier_line_item_mapping_history" on public.vyron_supplier_line_item_mapping_history for all using (true) with check (true);
