-- BOM Completeness — manual reporting overrides.
--
-- WHY
-- The Finished Goods BOM Completeness report sometimes classifies a BOM as incomplete when an
-- authorised user has checked it and confirmed it is valid for operational purposes. This table
-- records that decision. An override changes the REPORT CLASSIFICATION ONLY:
--   * it never edits a BOM, BOM line, ingredient or product;
--   * it never changes costing or stock deduction;
--   * revenue at risk is never reduced by it (overridden exceptions are disclosed separately).
-- An override is applied only while the system still finds the classification and BOM it was
-- recorded against; otherwise the report shows it as stale.
--
-- Removing an override never deletes the row: removed_at / removed_by / removal_reason are set, so
-- the full history stays auditable. At most one ACTIVE override per product (partial unique index).
--
-- SECURITY: company scoped; RLS enabled with no policies, so only the service role (the API, after
-- its own permission and company checks) can reach it. Additive only: no existing object changes.
--
-- ROLLBACK:
--   drop table if exists public.vyron_bom_completeness_overrides;

create table if not exists public.vyron_bom_completeness_overrides (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  product_id uuid not null,
  bom_id uuid null,
  original_status text not null,
  original_severity text not null,
  original_reason text null,
  reason text not null,
  created_by text not null,
  created_by_user_id text not null,
  created_at timestamptz not null default now(),
  removed_at timestamptz null,
  removed_by text null,
  removed_by_user_id text null,
  removal_reason text null,
  constraint vyron_bom_completeness_overrides_reason check (char_length(btrim(reason)) >= 10),
  constraint vyron_bom_completeness_overrides_status check (original_status in
    ('NO BOM', 'EMPTY BOM', 'INCOMPLETE', 'MISSING COMPONENT', 'NO COST')),
  constraint vyron_bom_completeness_overrides_removal check (
    (removed_at is null and removed_by is null and removal_reason is null)
    or (removed_at is not null and removed_by is not null and removal_reason is not null))
);

create unique index if not exists uq_vyron_bom_completeness_overrides_active
  on public.vyron_bom_completeness_overrides (company_id, product_id)
  where removed_at is null;

create index if not exists idx_vyron_bom_completeness_overrides_company
  on public.vyron_bom_completeness_overrides (company_id, created_at desc);

alter table public.vyron_bom_completeness_overrides enable row level security;
revoke all on public.vyron_bom_completeness_overrides from anon, authenticated;
grant select, insert, update, delete on public.vyron_bom_completeness_overrides to service_role;
