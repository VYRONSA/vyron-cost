-- Phase 1 Batch 4: Bulk processing queue support + extended approval rules + supervisor overrides

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

create table if not exists public.vyron_document_approval_override_audit (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.vyron_cost_companies(id) on delete cascade,
  document_id uuid not null references public.vyron_documents(id) on delete cascade,
  overridden_by text not null,
  overridden_at timestamptz not null default now(),
  override_reason text not null,
  rules_bypassed jsonb not null default '[]'::jsonb,
  violations_snapshot jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_vyron_document_approval_override_document
  on public.vyron_document_approval_override_audit (document_id, overridden_at desc);

alter table public.vyron_document_approval_override_audit enable row level security;

drop policy if exists "demo read vyron_document_approval_override_audit" on public.vyron_document_approval_override_audit;
drop policy if exists "demo write vyron_document_approval_override_audit" on public.vyron_document_approval_override_audit;
create policy "demo read vyron_document_approval_override_audit" on public.vyron_document_approval_override_audit for select using (true);
create policy "demo write vyron_document_approval_override_audit" on public.vyron_document_approval_override_audit for all using (true) with check (true);
