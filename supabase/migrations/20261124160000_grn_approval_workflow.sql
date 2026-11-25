-- Goods Received Note approval (opt-in per company).
--
-- WHY
-- Saving a GRN posts stock immediately; there is no approval step. Companies that want one can switch
-- on "GRN approval required". A GRN is then saved as 'Pending Approval' WITHOUT posting stock or
-- changing the purchase order; an authorised approver (goods_receipts.approve, not the person who
-- submitted it) approves it, and only then is stock posted — once, under a status claim
-- (Pending Approval -> Posting -> Posted) so concurrent approvals cannot post twice.
--
-- DEFAULT OFF: with no settings row (or approval_required = false) receiving works exactly as before.
--
-- SECURITY: settings table company scoped, RLS on, no policies (service role only). Additive only:
-- nullable columns on the GRN header; no existing GRN, stock or PO row changes.
--
-- ROLLBACK:
--   drop table if exists public.vyron_grn_approval_settings;
--   alter table public.vyron_cost_goods_receipts
--     drop column if exists submitted_by, drop column if exists submitted_by_user_id, drop column if exists submitted_at,
--     drop column if exists approved_by, drop column if exists approved_by_user_id, drop column if exists approved_at,
--     drop column if exists rejected_by, drop column if exists rejected_by_user_id, drop column if exists rejected_at,
--     drop column if exists rejection_reason, drop column if exists approval_exceptions;

create table if not exists public.vyron_grn_approval_settings (
  company_id uuid primary key,
  approval_required boolean not null default false,
  updated_by text null,
  updated_at timestamptz not null default now()
);
alter table public.vyron_grn_approval_settings enable row level security;
revoke all on public.vyron_grn_approval_settings from anon, authenticated;
grant select, insert, update, delete on public.vyron_grn_approval_settings to service_role;

alter table public.vyron_cost_goods_receipts
  add column if not exists submitted_by text null,
  add column if not exists submitted_by_user_id text null,
  add column if not exists submitted_at timestamptz null,
  add column if not exists approved_by text null,
  add column if not exists approved_by_user_id text null,
  add column if not exists approved_at timestamptz null,
  add column if not exists rejected_by text null,
  add column if not exists rejected_by_user_id text null,
  add column if not exists rejected_at timestamptz null,
  add column if not exists rejection_reason text null,
  add column if not exists approval_exceptions jsonb null;

create index if not exists idx_vyron_cost_goods_receipts_pending
  on public.vyron_cost_goods_receipts (company_id, status)
  where status in ('Pending Approval', 'Posting');
