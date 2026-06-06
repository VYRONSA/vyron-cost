-- Phase 1 Batch 2: Supplier Learning Engine — rich mappings + audit history

alter table public.vyron_supplier_line_item_mappings
  add column if not exists supplier_vat_number text,
  add column if not exists source_sku text,
  add column if not exists source_sku_normalized text,
  add column if not exists unit text,
  add column if not exists last_approved_price numeric(14,4),
  add column if not exists approved_by text,
  add column if not exists approved_at timestamptz,
  add column if not exists last_document_id uuid references public.vyron_documents(id) on delete set null,
  add column if not exists disabled boolean not null default false,
  add column if not exists match_source text;

create index if not exists idx_vyron_supplier_line_mappings_supplier_active
  on public.vyron_supplier_line_item_mappings (tenant_id, supplier_name)
  where disabled = false;

create index if not exists idx_vyron_supplier_line_mappings_sku
  on public.vyron_supplier_line_item_mappings (tenant_id, supplier_name, source_sku_normalized)
  where source_sku_normalized is not null and disabled = false;

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

create index if not exists idx_vyron_supplier_mapping_history_mapping
  on public.vyron_supplier_line_item_mapping_history (mapping_id, created_at desc);

create index if not exists idx_vyron_supplier_mapping_history_tenant
  on public.vyron_supplier_line_item_mapping_history (tenant_id, supplier_name, created_at desc);
