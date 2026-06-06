-- VYRON COST — DOCUMENT AI V2 (PHASE 1)
-- Run after vyron_cost_companies exists (days7-10 + handcrafted seed).
-- Creates document tables, extraction logs, supplier profiles, and storage bucket.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.vyron_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.vyron_cost_companies(id) on delete cascade,
  document_type text not null default 'pending_classification',
  supplier_name text,
  supplier_vat_number text,
  customer_name text,
  customer_vat_number text,
  invoice_number text,
  invoice_date date,
  purchase_order_number text,
  account_number text,
  customer_reference text,
  sales_representative text,
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

create table if not exists public.vyron_document_line_items (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.vyron_documents(id) on delete cascade,
  description text not null default '',
  quantity numeric(14,4),
  unit text,
  unit_price numeric(14,4),
  vat numeric(14,2),
  line_total numeric(14,2),
  sku_product_code text,
  confidence_score numeric(5,2),
  field_confidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.vyron_supplier_profiles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.vyron_cost_companies(id) on delete cascade,
  supplier_name text not null,
  supplier_vat_number text,
  invoice_format_notes text,
  common_products jsonb not null default '[]'::jsonb,
  confidence_score numeric(5,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, supplier_name)
);

create table if not exists public.vyron_document_extraction_logs (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.vyron_documents(id) on delete cascade,
  stage text not null,
  status text not null,
  model text,
  message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_vyron_documents_tenant_created
  on public.vyron_documents(tenant_id, created_at desc);

create index if not exists idx_vyron_documents_invoice_lookup
  on public.vyron_documents(tenant_id, supplier_name, invoice_number, invoice_date);

create index if not exists idx_vyron_document_line_items_document
  on public.vyron_document_line_items(document_id);

create index if not exists idx_vyron_document_extraction_logs_document
  on public.vyron_document_extraction_logs(document_id, created_at desc);

-- ---------------------------------------------------------------------------
-- updated_at trigger
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

drop trigger if exists trg_vyron_documents_updated_at on public.vyron_documents;
create trigger trg_vyron_documents_updated_at
  before update on public.vyron_documents
  for each row execute function public.vyron_set_updated_at();

drop trigger if exists trg_vyron_supplier_profiles_updated_at on public.vyron_supplier_profiles;
create trigger trg_vyron_supplier_profiles_updated_at
  before update on public.vyron_supplier_profiles
  for each row execute function public.vyron_set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS (demo-open; tighten for production)
-- ---------------------------------------------------------------------------

alter table public.vyron_documents enable row level security;
alter table public.vyron_document_line_items enable row level security;
alter table public.vyron_supplier_profiles enable row level security;
alter table public.vyron_document_extraction_logs enable row level security;

drop policy if exists "demo read vyron_documents" on public.vyron_documents;
drop policy if exists "demo write vyron_documents" on public.vyron_documents;
drop policy if exists "demo read vyron_document_line_items" on public.vyron_document_line_items;
drop policy if exists "demo write vyron_document_line_items" on public.vyron_document_line_items;
drop policy if exists "demo read vyron_supplier_profiles" on public.vyron_supplier_profiles;
drop policy if exists "demo write vyron_supplier_profiles" on public.vyron_supplier_profiles;
drop policy if exists "demo read vyron_document_extraction_logs" on public.vyron_document_extraction_logs;
drop policy if exists "demo write vyron_document_extraction_logs" on public.vyron_document_extraction_logs;

create policy "demo read vyron_documents" on public.vyron_documents for select using (true);
create policy "demo write vyron_documents" on public.vyron_documents for all using (true) with check (true);
create policy "demo read vyron_document_line_items" on public.vyron_document_line_items for select using (true);
create policy "demo write vyron_document_line_items" on public.vyron_document_line_items for all using (true) with check (true);
create policy "demo read vyron_supplier_profiles" on public.vyron_supplier_profiles for select using (true);
create policy "demo write vyron_supplier_profiles" on public.vyron_supplier_profiles for all using (true) with check (true);
create policy "demo read vyron_document_extraction_logs" on public.vyron_document_extraction_logs for select using (true);
create policy "demo write vyron_document_extraction_logs" on public.vyron_document_extraction_logs for all using (true) with check (true);

-- ---------------------------------------------------------------------------
-- Storage bucket
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'vyron-documents',
  'vyron-documents',
  false,
  52428800,
  array[
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/webp'
  ]::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "demo read vyron documents storage" on storage.objects;
drop policy if exists "demo insert vyron documents storage" on storage.objects;
drop policy if exists "demo update vyron documents storage" on storage.objects;
drop policy if exists "demo delete vyron documents storage" on storage.objects;

create policy "demo read vyron documents storage"
  on storage.objects for select
  using (bucket_id = 'vyron-documents');

create policy "demo insert vyron documents storage"
  on storage.objects for insert
  with check (bucket_id = 'vyron-documents');

create policy "demo update vyron documents storage"
  on storage.objects for update
  using (bucket_id = 'vyron-documents')
  with check (bucket_id = 'vyron-documents');

create policy "demo delete vyron documents storage"
  on storage.objects for delete
  using (bucket_id = 'vyron-documents');

-- Default Handcrafted tenant (required for VYRON_DEFAULT_TENANT_ID uploads)
insert into public.vyron_cost_companies (id, name)
values ('48002864-8800-4000-9000-000000000001', 'Handcrafted Food Products')
on conflict (id) do update set name = excluded.name;
