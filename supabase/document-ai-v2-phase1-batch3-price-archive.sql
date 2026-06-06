-- Phase 1 Batch 3: Price History Engine + Invoice Archive + Approval audit + Rollback

alter table public.vyron_supplier_price_history
  add column if not exists invoice_number text,
  add column if not exists approved_by text,
  add column if not exists approved_at timestamptz,
  add column if not exists price_movement text;

create index if not exists idx_vyron_supplier_price_history_invoice
  on public.vyron_supplier_price_history (tenant_id, invoice_number, created_at desc);

create index if not exists idx_vyron_supplier_price_history_approved_at
  on public.vyron_supplier_price_history (tenant_id, approved_at desc);

-- Full approval audit (who/when/notes + snapshots)
create table if not exists public.vyron_document_approval_audit (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.vyron_cost_companies(id) on delete cascade,
  document_id uuid not null references public.vyron_documents(id) on delete cascade,
  approved_by text not null,
  approved_at timestamptz not null default now(),
  approval_notes text,
  reconciliation_note text,
  previous_status text,
  new_status text not null default 'archived',
  header_snapshot jsonb not null default '{}'::jsonb,
  lines_snapshot jsonb not null default '[]'::jsonb,
  cost_updates_count int not null default 0,
  price_history_count int not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_vyron_document_approval_audit_document
  on public.vyron_document_approval_audit (document_id, approved_at desc);

-- Cost rollback audit (does not delete price history)
alter table public.vyron_document_cost_audit
  add column if not exists rolled_back_at timestamptz,
  add column if not exists rollback_audit_id uuid;

create table if not exists public.vyron_document_cost_rollback_audit (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.vyron_cost_companies(id) on delete cascade,
  document_id uuid not null references public.vyron_documents(id) on delete cascade,
  rolled_back_by text not null,
  rolled_back_at timestamptz not null default now(),
  reversal_count int not null default 0,
  approval_notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_vyron_document_cost_rollback_document
  on public.vyron_document_cost_rollback_audit (document_id, rolled_back_at desc);

alter table public.vyron_document_approval_audit enable row level security;
alter table public.vyron_document_cost_rollback_audit enable row level security;

drop policy if exists "demo read vyron_document_approval_audit" on public.vyron_document_approval_audit;
drop policy if exists "demo write vyron_document_approval_audit" on public.vyron_document_approval_audit;
create policy "demo read vyron_document_approval_audit" on public.vyron_document_approval_audit for select using (true);
create policy "demo write vyron_document_approval_audit" on public.vyron_document_approval_audit for all using (true) with check (true);

drop policy if exists "demo read vyron_document_cost_rollback_audit" on public.vyron_document_cost_rollback_audit;
drop policy if exists "demo write vyron_document_cost_rollback_audit" on public.vyron_document_cost_rollback_audit;
create policy "demo read vyron_document_cost_rollback_audit" on public.vyron_document_cost_rollback_audit for select using (true);
create policy "demo write vyron_document_cost_rollback_audit" on public.vyron_document_cost_rollback_audit for all using (true) with check (true);

create index if not exists idx_vyron_documents_needs_review
  on public.vyron_documents (tenant_id, created_at desc)
  where deleted_at is null and status in ('reviewed', 'extracted', 'extraction_failed', 'upload_failed');

create index if not exists idx_vyron_documents_archived
  on public.vyron_documents (tenant_id, archived_at desc)
  where deleted_at is null and status in ('archived', 'approved');
