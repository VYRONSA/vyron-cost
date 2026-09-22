-- VOLORA Order Engine — ordering foundation for multi-channel tenants (Food Sock first).
--
-- NOT APPLIED to production. Requires 20260922120000_vyron_order_intake.sql and
-- 20260922130000_vyron_order_intake_hardening.sql. Additive only: no existing
-- column, row or constraint loses meaning.
--
--   1. Order context (B2B / B2C), source channel and extraction confidence on
--      the intake.
--   2. Immutable source snapshots: what the source said, frozen at receipt.
--      Working values (quantity, price, customer) may be corrected by a person;
--      the snapshot never is.
--   3. Matching by external id (vyron_import_source_links) and the configured
--      B2C account are recorded match rules.
--   4. Documents that need extraction (PDF) are a recorded message state.
--   5. Tenant-scoped ordering settings. Every setting is off / conservative
--      until the tenant sets it; nothing is inferred for a tenant.
--
-- Rollback (reverse order):
--   drop table if exists public.vyron_order_engine_settings;
--   drop trigger if exists vyron_order_intakes_snapshot_frozen on public.vyron_order_intakes;
--   drop trigger if exists vyron_order_intake_lines_snapshot_frozen on public.vyron_order_intake_lines;
--   drop function if exists public.vyron_order_source_snapshot_frozen();
--   alter table public.vyron_order_intakes drop column if exists order_context,
--     drop column if exists source_channel, drop column if exists extraction_confidence,
--     drop column if exists source_snapshot;
--   alter table public.vyron_order_intake_lines drop column if exists source_snapshot;
--   (and restore the previous check constraints shown below)

-- ---------------------------------------------------------------------------
-- 1. Context, channel, confidence
-- ---------------------------------------------------------------------------

alter table public.vyron_order_intakes add column if not exists order_context text not null default 'UNSPECIFIED';
alter table public.vyron_order_intakes add column if not exists source_channel text null;
alter table public.vyron_order_intakes add column if not exists extraction_confidence text null;

alter table public.vyron_order_intakes drop constraint if exists vyron_order_intakes_order_context;
alter table public.vyron_order_intakes add constraint vyron_order_intakes_order_context
  check (order_context in ('B2B', 'B2C', 'UNSPECIFIED'));
alter table public.vyron_order_intakes drop constraint if exists vyron_order_intakes_extraction_confidence;
alter table public.vyron_order_intakes add constraint vyron_order_intakes_extraction_confidence
  check (extraction_confidence is null or extraction_confidence in ('HIGH', 'MEDIUM', 'LOW'));
alter table public.vyron_order_intakes drop constraint if exists vyron_order_intakes_source_channel_not_blank;
alter table public.vyron_order_intakes add constraint vyron_order_intakes_source_channel_not_blank
  check (source_channel is null or btrim(source_channel) <> '');

create index if not exists idx_vyron_order_intakes_company_context
  on public.vyron_order_intakes (company_id, order_context, status);
-- Duplicate detection by the customer's own references.
create index if not exists idx_vyron_order_intakes_company_external_number
  on public.vyron_order_intakes (company_id, external_order_number) where external_order_number is not null;

-- ---------------------------------------------------------------------------
-- 2. Immutable source snapshots
-- ---------------------------------------------------------------------------

alter table public.vyron_order_intakes add column if not exists source_snapshot jsonb not null default '{}'::jsonb;
alter table public.vyron_order_intake_lines add column if not exists source_snapshot jsonb not null default '{}'::jsonb;

-- Once written, a source snapshot is never changed.
create or replace function public.vyron_order_source_snapshot_frozen()
returns trigger
language plpgsql
as $$
begin
  if old.source_snapshot <> '{}'::jsonb and new.source_snapshot is distinct from old.source_snapshot then
    raise exception '% row %: the source snapshot is frozen at receipt and cannot be changed.', tg_table_name, old.id;
  end if;
  return new;
end;
$$;

drop trigger if exists vyron_order_intakes_snapshot_frozen on public.vyron_order_intakes;
create trigger vyron_order_intakes_snapshot_frozen
  before update on public.vyron_order_intakes
  for each row execute function public.vyron_order_source_snapshot_frozen();

drop trigger if exists vyron_order_intake_lines_snapshot_frozen on public.vyron_order_intake_lines;
create trigger vyron_order_intake_lines_snapshot_frozen
  before update on public.vyron_order_intake_lines
  for each row execute function public.vyron_order_source_snapshot_frozen();

-- ---------------------------------------------------------------------------
-- 3. Match rules: external id (import source links) and the B2C account
-- ---------------------------------------------------------------------------

alter table public.vyron_order_intake_lines drop constraint if exists vyron_order_intake_lines_match_rule;
alter table public.vyron_order_intake_lines add constraint vyron_order_intake_lines_match_rule check (
  match_rule is null or match_rule in ('manual', 'external_id', 'sku_exact', 'sku_normalized', 'customer_alias', 'alias', 'name_exact')
);

alter table public.vyron_order_intakes drop constraint if exists vyron_order_intakes_customer_match_rule;
alter table public.vyron_order_intakes add constraint vyron_order_intakes_customer_match_rule check (
  customer_match_rule is null
  or customer_match_rule in ('customer_id', 'external_id', 'identity_map', 'name_exact', 'sender_email', 'b2c_account')
);

-- ---------------------------------------------------------------------------
-- 4. Documents awaiting extraction
-- ---------------------------------------------------------------------------

alter table public.vyron_order_source_messages drop constraint if exists vyron_order_source_messages_status;
alter table public.vyron_order_source_messages add constraint vyron_order_source_messages_status
  check (processing_status in ('RECEIVED', 'PARSED', 'NO_ORDER_FOUND', 'NEEDS_EXTRACTION', 'FAILED'));

-- ---------------------------------------------------------------------------
-- 5. Tenant-scoped ordering settings
-- ---------------------------------------------------------------------------

create table if not exists public.vyron_order_engine_settings (
  -- No foreign key to vyron_cost_companies, as for every Order Engine table:
  -- not every live tenant has a row there (see 20260922120000).
  company_id uuid primary key,
  -- The account web-store (B2C) orders are booked against when the web
  -- customer is not a known customer. NULL: not decided — such orders stop in
  -- Exceptions rather than being booked anywhere.
  b2c_customer_id uuid null,
  -- 'review': an exact product-name match is allowed for SKU-less lines and is
  -- raised for review. 'off': name matching is never used.
  product_name_matching text not null default 'review',
  -- 'warn': a repeated customer PO must be acknowledged. 'block': it stops in
  -- Exceptions.
  duplicate_po_action text not null default 'warn',
  -- Minimum days between receipt and requested delivery. NULL: not checked.
  min_lead_time_days integer null,
  updated_by text not null,
  updated_by_name text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vyron_order_engine_settings_name_matching check (product_name_matching in ('review', 'off')),
  constraint vyron_order_engine_settings_duplicate_po check (duplicate_po_action in ('warn', 'block')),
  constraint vyron_order_engine_settings_lead_time check (min_lead_time_days is null or min_lead_time_days between 0 and 90),
  constraint vyron_order_engine_settings_updated_by_not_blank check (btrim(updated_by) <> '')
);

alter table public.vyron_order_engine_settings enable row level security;
revoke all on public.vyron_order_engine_settings from anon, authenticated;
revoke all on function public.vyron_order_source_snapshot_frozen() from public, anon, authenticated;
