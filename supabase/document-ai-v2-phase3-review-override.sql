-- VYRON COST — DOCUMENT AI V2 (PHASE 3)
-- Review override workflow, approval-gated cost updates, supplier learning memory.
-- Run after: supabase/document-ai-v2-phase1.sql

alter table public.vyron_documents
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by text,
  add column if not exists processed_at timestamptz,
  add column if not exists processing_notes text,
  add column if not exists account_number text,
  add column if not exists customer_reference text,
  add column if not exists sales_representative text,
  add column if not exists field_confidence jsonb not null default '{}'::jsonb;

alter table public.vyron_document_line_items
  add column if not exists matched_entity_type text,
  add column if not exists matched_entity_id uuid,
  add column if not exists matched_entity_name text,
  add column if not exists ignored boolean not null default false,
  add column if not exists mapping_confidence numeric(5,2) default 0,
  add column if not exists unit text,
  add column if not exists sku_product_code text,
  add column if not exists confidence_score numeric(5,2),
  add column if not exists field_confidence jsonb not null default '{}'::jsonb;

create table if not exists public.vyron_document_field_corrections (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.vyron_documents(id) on delete cascade,
  field_name text not null,
  original_value text,
  corrected_value text,
  corrected_at timestamptz not null default now()
);

create table if not exists public.vyron_supplier_invoice_learning (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.vyron_cost_companies(id) on delete cascade,
  supplier_name text not null,
  supplier_name_variations jsonb not null default '[]'::jsonb,
  invoice_number_pattern text,
  date_format_hint text,
  common_line_item_descriptions jsonb not null default '[]'::jsonb,
  default_currency text default 'ZAR',
  confidence_score numeric(5,2) not null default 0,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, supplier_name)
);

create table if not exists public.vyron_supplier_line_item_mappings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.vyron_cost_companies(id) on delete cascade,
  supplier_name text not null,
  source_description text not null,
  source_description_normalized text not null,
  entity_type text not null,
  entity_id uuid,
  entity_name text,
  usage_count int not null default 1,
  confidence_score numeric(5,2) not null default 0,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, supplier_name, source_description_normalized)
);

create table if not exists public.vyron_supplier_price_history (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.vyron_cost_companies(id) on delete cascade,
  supplier_name text,
  document_id uuid references public.vyron_documents(id) on delete set null,
  line_item_id uuid references public.vyron_document_line_items(id) on delete set null,
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

drop trigger if exists trg_vyron_supplier_invoice_learning_updated_at on public.vyron_supplier_invoice_learning;
create trigger trg_vyron_supplier_invoice_learning_updated_at
  before update on public.vyron_supplier_invoice_learning
  for each row execute function public.vyron_set_updated_at();

drop trigger if exists trg_vyron_supplier_line_item_mappings_updated_at on public.vyron_supplier_line_item_mappings;
create trigger trg_vyron_supplier_line_item_mappings_updated_at
  before update on public.vyron_supplier_line_item_mappings
  for each row execute function public.vyron_set_updated_at();

create index if not exists idx_vyron_document_field_corrections_document
  on public.vyron_document_field_corrections(document_id, corrected_at desc);

create index if not exists idx_vyron_supplier_invoice_learning_lookup
  on public.vyron_supplier_invoice_learning(tenant_id, supplier_name);

create index if not exists idx_vyron_supplier_line_item_mappings_lookup
  on public.vyron_supplier_line_item_mappings(tenant_id, supplier_name, source_description_normalized);

create index if not exists idx_vyron_supplier_price_history_lookup
  on public.vyron_supplier_price_history(tenant_id, entity_type, entity_id, created_at desc);

alter table public.vyron_document_field_corrections enable row level security;
alter table public.vyron_supplier_invoice_learning enable row level security;
alter table public.vyron_supplier_line_item_mappings enable row level security;
alter table public.vyron_supplier_price_history enable row level security;

drop policy if exists "demo read vyron_document_field_corrections" on public.vyron_document_field_corrections;
drop policy if exists "demo write vyron_document_field_corrections" on public.vyron_document_field_corrections;
drop policy if exists "demo read vyron_supplier_invoice_learning" on public.vyron_supplier_invoice_learning;
drop policy if exists "demo write vyron_supplier_invoice_learning" on public.vyron_supplier_invoice_learning;
drop policy if exists "demo read vyron_supplier_line_item_mappings" on public.vyron_supplier_line_item_mappings;
drop policy if exists "demo write vyron_supplier_line_item_mappings" on public.vyron_supplier_line_item_mappings;
drop policy if exists "demo read vyron_supplier_price_history" on public.vyron_supplier_price_history;
drop policy if exists "demo write vyron_supplier_price_history" on public.vyron_supplier_price_history;

create policy "demo read vyron_document_field_corrections"
  on public.vyron_document_field_corrections for select using (true);
create policy "demo write vyron_document_field_corrections"
  on public.vyron_document_field_corrections for all using (true) with check (true);

create policy "demo read vyron_supplier_invoice_learning"
  on public.vyron_supplier_invoice_learning for select using (true);
create policy "demo write vyron_supplier_invoice_learning"
  on public.vyron_supplier_invoice_learning for all using (true) with check (true);

create policy "demo read vyron_supplier_line_item_mappings"
  on public.vyron_supplier_line_item_mappings for select using (true);
create policy "demo write vyron_supplier_line_item_mappings"
  on public.vyron_supplier_line_item_mappings for all using (true) with check (true);

create policy "demo read vyron_supplier_price_history"
  on public.vyron_supplier_price_history for select using (true);
create policy "demo write vyron_supplier_price_history"
  on public.vyron_supplier_price_history for all using (true) with check (true);
