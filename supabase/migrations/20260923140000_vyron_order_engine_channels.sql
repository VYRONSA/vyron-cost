-- VOLORA Order Engine — channel configuration, mailboxes and document extraction.
--
-- NOT APPLIED to production. Requires 20260922120000, 20260922130000 and
-- 20260923120000. Additive only.
--
-- Every outstanding business decision becomes a tenant setting that is NULL
-- until the business decides. NULL means "not decided": the engine stops the
-- order instead of inventing a rule. Nothing here is Food Sock specific.
--
--   1. Company ordering decisions (web orders, VAT, shipping, SKU alignment,
--      approval separation, PDF extractor).
--   2. Per-channel settings (a web store's own VAT basis and the statuses that
--      mean "ready to fulfil").
--   3. Receiving mailboxes: the tenant of an inbound e-mail comes from the
--      receiving address, never from the message content.
--   4. Document extraction runs: one row per attempt, with provider, status,
--      confidence and the raw values, so a PDF's provenance is answerable.
--
-- Rollback (reverse order):
--   drop table if exists public.vyron_order_document_extractions;
--   drop table if exists public.vyron_order_mailboxes;
--   drop table if exists public.vyron_order_channel_settings;
--   alter table public.vyron_order_engine_settings
--     drop column if exists web_orders_mode, drop column if exists web_order_statuses,
--     drop column if exists web_prices_include_tax, drop column if exists shipping_treatment,
--     drop column if exists sku_alignment, drop column if exists creator_can_approve,
--     drop column if exists pdf_extractor;
--   (and restore the vyron_order_source_messages_status check without 'QUARANTINED')

-- ---------------------------------------------------------------------------
-- 1. Company ordering decisions
-- ---------------------------------------------------------------------------

alter table public.vyron_order_engine_settings add column if not exists web_orders_mode text null;
alter table public.vyron_order_engine_settings add column if not exists web_order_statuses text[] null;
alter table public.vyron_order_engine_settings add column if not exists web_prices_include_tax boolean null;
alter table public.vyron_order_engine_settings add column if not exists shipping_treatment text null;
alter table public.vyron_order_engine_settings add column if not exists sku_alignment text null;
alter table public.vyron_order_engine_settings add column if not exists creator_can_approve boolean null;
alter table public.vyron_order_engine_settings add column if not exists pdf_extractor text null;

alter table public.vyron_order_engine_settings drop constraint if exists vyron_order_engine_settings_web_mode;
alter table public.vyron_order_engine_settings add constraint vyron_order_engine_settings_web_mode
  check (web_orders_mode is null or web_orders_mode in ('history_only', 'fulfil'));
alter table public.vyron_order_engine_settings drop constraint if exists vyron_order_engine_settings_shipping;
alter table public.vyron_order_engine_settings add constraint vyron_order_engine_settings_shipping
  check (shipping_treatment is null or shipping_treatment in ('not_carried', 'separate_line', 'absorbed'));
alter table public.vyron_order_engine_settings drop constraint if exists vyron_order_engine_settings_sku_alignment;
alter table public.vyron_order_engine_settings add constraint vyron_order_engine_settings_sku_alignment
  check (sku_alignment is null or sku_alignment in ('source_equals_vyron', 'mapping_required'));
alter table public.vyron_order_engine_settings drop constraint if exists vyron_order_engine_settings_pdf_extractor;
alter table public.vyron_order_engine_settings add constraint vyron_order_engine_settings_pdf_extractor
  check (pdf_extractor is null or btrim(pdf_extractor) <> '');
alter table public.vyron_order_engine_settings drop constraint if exists vyron_order_engine_settings_web_statuses;
alter table public.vyron_order_engine_settings add constraint vyron_order_engine_settings_web_statuses
  check (web_order_statuses is null or cardinality(web_order_statuses) between 1 and 40);

-- ---------------------------------------------------------------------------
-- 2. Per-channel settings (one row per web store / channel key)
-- ---------------------------------------------------------------------------

create table if not exists public.vyron_order_channel_settings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  -- e.g. "woocommerce:foodsock-main", "shopify:foodsock-retail".
  channel_key text not null,
  label text null,
  enabled boolean not null default false,
  -- NULL: the store has not said / it has not been decided.
  prices_include_tax boolean null,
  eligible_statuses text[] null,
  updated_by text not null,
  updated_by_name text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vyron_order_channel_settings_key_not_blank check (btrim(channel_key) <> ''),
  constraint vyron_order_channel_settings_statuses check (eligible_statuses is null or cardinality(eligible_statuses) between 1 and 40),
  constraint vyron_order_channel_settings_updated_by_not_blank check (btrim(updated_by) <> '')
);

create unique index if not exists uq_vyron_order_channel_settings
  on public.vyron_order_channel_settings (company_id, lower(channel_key));

-- ---------------------------------------------------------------------------
-- 3. Receiving mailboxes (the tenant of an inbound message)
-- ---------------------------------------------------------------------------

create table if not exists public.vyron_order_mailboxes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  -- The address customers send orders to. Globally unique: it is what decides
  -- the tenant, so two companies can never claim the same address.
  receiving_address text not null,
  label text null,
  provider text null,
  status text not null default 'DISABLED',
  -- Accepted senders. NULL: nothing is accepted automatically — every message
  -- is held for a person (no sender policy has been decided).
  allowed_sender_domains text[] null,
  allowed_senders text[] null,
  -- Attachment limits. NULL: the engine's own conservative defaults apply.
  max_attachment_bytes bigint null,
  allowed_mime_types text[] null,
  -- Only accept messages the provider reports as authenticated (SPF/DKIM/DMARC).
  -- Nothing is assumed when the provider supplies no verification results.
  require_verified_sender boolean not null default false,
  updated_by text not null,
  updated_by_name text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vyron_order_mailboxes_address_not_blank check (btrim(receiving_address) <> ''),
  constraint vyron_order_mailboxes_address_shape check (position('@' in receiving_address) > 1),
  constraint vyron_order_mailboxes_status check (status in ('ACTIVE', 'DISABLED')),
  constraint vyron_order_mailboxes_size check (max_attachment_bytes is null or max_attachment_bytes between 1024 and 52428800),
  constraint vyron_order_mailboxes_updated_by_not_blank check (btrim(updated_by) <> '')
);

create unique index if not exists uq_vyron_order_mailboxes_address on public.vyron_order_mailboxes (lower(receiving_address));
create index if not exists idx_vyron_order_mailboxes_company on public.vyron_order_mailboxes (company_id, status);

-- ---------------------------------------------------------------------------
-- 4. Document extraction runs (PDF and other documents)
-- ---------------------------------------------------------------------------

create table if not exists public.vyron_order_document_extractions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  source_message_id uuid null,
  attachment_name text not null,
  attachment_sha256 text null,
  attachment_bytes bigint null,
  -- The provider that read (or would read) the document; NULL when none is configured.
  provider text null,
  status text not null,
  confidence text null,
  page_count integer null,
  -- What the provider returned, and what it became. Both kept: a normalised
  -- value never replaces the raw one.
  raw jsonb not null default '{}'::jsonb,
  normalized jsonb not null default '{}'::jsonb,
  error text null,
  intake_id uuid null,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vyron_order_document_extractions_status
    check (status in ('NOT_CONFIGURED', 'PENDING', 'SUCCEEDED', 'FAILED')),
  constraint vyron_order_document_extractions_confidence
    check (confidence is null or confidence in ('HIGH', 'MEDIUM', 'LOW')),
  constraint vyron_order_document_extractions_name_not_blank check (btrim(attachment_name) <> ''),
  constraint vyron_order_document_extractions_created_by_not_blank check (btrim(created_by) <> '')
);

create index if not exists idx_vyron_order_document_extractions_company
  on public.vyron_order_document_extractions (company_id, status, created_at desc);
-- One live extraction row per attachment of a message.
create unique index if not exists uq_vyron_order_document_extractions_attachment
  on public.vyron_order_document_extractions (company_id, source_message_id, attachment_name)
  where source_message_id is not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'vyron_order_document_extractions_message_same_company') then
    alter table public.vyron_order_document_extractions
      add constraint vyron_order_document_extractions_message_same_company
      foreign key (source_message_id, company_id) references public.vyron_order_source_messages (id, company_id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'vyron_order_document_extractions_intake_same_company') then
    alter table public.vyron_order_document_extractions
      add constraint vyron_order_document_extractions_intake_same_company
      foreign key (intake_id, company_id) references public.vyron_order_intakes (id, company_id) on delete set null;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Messages held for a person
-- ---------------------------------------------------------------------------

alter table public.vyron_order_source_messages drop constraint if exists vyron_order_source_messages_status;
alter table public.vyron_order_source_messages add constraint vyron_order_source_messages_status
  check (processing_status in ('RECEIVED', 'PARSED', 'NO_ORDER_FOUND', 'NEEDS_EXTRACTION', 'QUARANTINED', 'FAILED'));

alter table public.vyron_order_source_messages add column if not exists mailbox_id uuid null;
alter table public.vyron_order_source_messages add column if not exists sender_verification jsonb not null default '{}'::jsonb;

-- ---------------------------------------------------------------------------
-- 6. Server-only access
-- ---------------------------------------------------------------------------

alter table public.vyron_order_channel_settings enable row level security;
alter table public.vyron_order_mailboxes enable row level security;
alter table public.vyron_order_document_extractions enable row level security;

revoke all on public.vyron_order_channel_settings from anon, authenticated;
revoke all on public.vyron_order_mailboxes from anon, authenticated;
revoke all on public.vyron_order_document_extractions from anon, authenticated;
