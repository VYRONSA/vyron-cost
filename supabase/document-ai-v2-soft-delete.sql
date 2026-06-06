-- VYRON COST — DOCUMENT AI V2 soft delete support
-- Safe to run multiple times.

alter table if exists public.vyron_documents
  add column if not exists deleted_at timestamptz;

create index if not exists idx_vyron_documents_tenant_not_deleted
  on public.vyron_documents(tenant_id, created_at desc)
  where deleted_at is null;

