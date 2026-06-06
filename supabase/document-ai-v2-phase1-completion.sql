-- VYRON COST — DOCUMENT INTELLIGENCE PHASE 1 COMPLETION
-- Run after: phase1, phase1b, soft-delete, field-regions, workbench, phase3, phase4

-- Approved invoices leave active inbox (archived_at set on approve)
alter table public.vyron_documents
  add column if not exists archived_at timestamptz;

create index if not exists idx_vyron_documents_inbox
  on public.vyron_documents(tenant_id, created_at desc)
  where deleted_at is null and archived_at is null and status <> 'approved';

create index if not exists idx_vyron_documents_archive
  on public.vyron_documents(tenant_id, archived_at desc)
  where deleted_at is null and status = 'approved';

-- Cost update audit trail (every approve cost change)
create table if not exists public.vyron_document_cost_audit (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.vyron_cost_companies(id) on delete cascade,
  document_id uuid not null references public.vyron_documents(id) on delete cascade,
  line_item_id uuid references public.vyron_document_line_items(id) on delete set null,
  supplier_name text,
  invoice_number text,
  entity_type text not null,
  entity_id uuid,
  entity_name text,
  previous_cost numeric(14,4),
  new_cost numeric(14,4),
  change_amount numeric(14,4),
  change_percent numeric(10,4),
  currency text not null default 'ZAR',
  approved_by text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_vyron_document_cost_audit_document
  on public.vyron_document_cost_audit(document_id, created_at desc);

create index if not exists idx_vyron_document_cost_audit_tenant
  on public.vyron_document_cost_audit(tenant_id, created_at desc);

-- Configurable approval rules per tenant
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

alter table public.vyron_document_approval_rules enable row level security;
drop policy if exists "demo read vyron_document_approval_rules" on public.vyron_document_approval_rules;
drop policy if exists "demo write vyron_document_approval_rules" on public.vyron_document_approval_rules;
create policy "demo read vyron_document_approval_rules" on public.vyron_document_approval_rules for select using (true);
create policy "demo write vyron_document_approval_rules" on public.vyron_document_approval_rules for all using (true) with check (true);

alter table public.vyron_document_cost_audit enable row level security;
drop policy if exists "demo read vyron_document_cost_audit" on public.vyron_document_cost_audit;
drop policy if exists "demo write vyron_document_cost_audit" on public.vyron_document_cost_audit;
create policy "demo read vyron_document_cost_audit" on public.vyron_document_cost_audit for select using (true);
create policy "demo write vyron_document_cost_audit" on public.vyron_document_cost_audit for all using (true) with check (true);

-- Default Handcrafted tenant rules (adjust tenant_id if needed)
insert into public.vyron_document_approval_rules (
  tenant_id,
  min_header_confidence,
  block_unmapped_lines,
  rounding_tolerance,
  major_mismatch_threshold,
  max_manual_overrides_before_alert,
  require_reconciliation_note_above
)
select
  id,
  70,
  true,
  0.05,
  1.00,
  5,
  1.00
from public.vyron_cost_companies
where id = '48002864-8800-4000-9000-000000000001'::uuid
on conflict (tenant_id) do nothing;
