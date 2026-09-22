-- VYRON Order Engine: schema hardening and the tables for human-approved
-- mappings and customer order policies.
--
-- Follows 20260922120000_vyron_order_intake.sql (neither is applied to any
-- live database at the time of writing). Design record:
-- docs/order-engine/ORDER_ENGINE_ARCHITECTURE.md, VALIDATION_RULES.md.
--
-- 1. TENANT CONSISTENCY. A line, an event or a message link must belong to the
--    same company as its order. The first migration tied children to the
--    order's id only, so a defect elsewhere could attach one tenant's line to
--    another tenant's order without the database objecting. Composite foreign
--    keys on (id, company_id) make that impossible.
--
-- 2. APPROVED MAPPINGS. When a person resolves an exception they may choose to
--    remember the decision:
--      vyron_order_product_aliases     a customer's (or the company's) item
--                                      code → a VYRON product
--      vyron_order_customer_identities a source's customer reference (for
--                                      example a web-store customer id) → a
--                                      VYRON customer
--    Matching uses these only by exact normalised equality — they are recorded
--    human decisions, never inferred. A mapping is revoked, never edited or
--    deleted, so every past match stays explainable.
--
-- 3. CUSTOMER ORDER POLICIES. Optional per-customer (or company-default) rules:
--    required PO, required delivery date, minimum order value, minimum margin,
--    whole-case quantities, delivery weekdays, order cut-off and special
--    instructions. Every rule is off unless someone switches it on; nothing is
--    assumed for any client.
--
-- 4. SOURCE FACTS the adapters already see but could not store: shipping total,
--    whether the source's prices include tax, and extraction metadata (for a
--    future AI or document extractor: per-field value, confidence, location,
--    method — never an approval).
--
-- Additive: adds constraints to the (empty, unapplied) intake tables, three new
-- tables, and columns with defaults. Changes no pre-existing VYRON table.
-- Reached only by server code through the service role; RLS on, no policies.
--
-- Rollback (only while the tables are empty or disposable):
--   drop table if exists public.vyron_customer_order_policies;
--   drop table if exists public.vyron_order_customer_identities;
--   drop table if exists public.vyron_order_product_aliases;
--   drop function if exists public.vyron_order_mapping_revoke_only();
--   alter table public.vyron_order_intake_lines drop constraint if exists vyron_order_intake_lines_same_company;
--   alter table public.vyron_order_intake_events drop constraint if exists vyron_order_intake_events_same_company;
--   alter table public.vyron_order_intakes drop constraint if exists vyron_order_intakes_message_same_company;
--   alter table public.vyron_order_intakes drop constraint if exists vyron_order_intakes_id_company;
--   alter table public.vyron_order_source_messages drop constraint if exists vyron_order_source_messages_id_company;

-- ---------------------------------------------------------------------------
-- 1. Tenant consistency
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'vyron_order_intakes_id_company') then
    alter table public.vyron_order_intakes add constraint vyron_order_intakes_id_company unique (id, company_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'vyron_order_source_messages_id_company') then
    alter table public.vyron_order_source_messages add constraint vyron_order_source_messages_id_company unique (id, company_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'vyron_order_intake_lines_same_company') then
    alter table public.vyron_order_intake_lines
      add constraint vyron_order_intake_lines_same_company
      foreign key (intake_id, company_id) references public.vyron_order_intakes (id, company_id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'vyron_order_intake_events_same_company') then
    alter table public.vyron_order_intake_events
      add constraint vyron_order_intake_events_same_company
      foreign key (intake_id, company_id) references public.vyron_order_intakes (id, company_id) on delete cascade;
  end if;
  -- Messages are never deleted by the application; a message may not be
  -- removed while an order still points at it.
  if not exists (select 1 from pg_constraint where conname = 'vyron_order_intakes_message_same_company') then
    alter table public.vyron_order_intakes
      add constraint vyron_order_intakes_message_same_company
      foreign key (source_message_id, company_id) references public.vyron_order_source_messages (id, company_id);
  end if;
end $$;

-- The "All orders" view pages by date without a status filter.
create index if not exists idx_vyron_order_intakes_company_created
  on public.vyron_order_intakes (company_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 4. Source facts on the order and its lines
-- ---------------------------------------------------------------------------

alter table public.vyron_order_intakes add column if not exists supplied_shipping_total numeric(18,2) null;
alter table public.vyron_order_intakes add column if not exists prices_include_tax boolean null;
alter table public.vyron_order_intakes add column if not exists extraction jsonb not null default '{}'::jsonb;
alter table public.vyron_order_intake_lines add column if not exists extraction jsonb not null default '{}'::jsonb;

-- A remembered customer alias is a match rule of its own.
alter table public.vyron_order_intake_lines drop constraint if exists vyron_order_intake_lines_match_rule;
alter table public.vyron_order_intake_lines add constraint vyron_order_intake_lines_match_rule check (
  match_rule is null or match_rule in ('manual', 'sku_exact', 'sku_normalized', 'customer_alias', 'alias', 'name_exact')
);

-- ---------------------------------------------------------------------------
-- 2. Approved mappings (revoke-only)
-- ---------------------------------------------------------------------------

create table if not exists public.vyron_order_product_aliases (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  -- NULL: applies to every customer of the company.
  customer_id uuid null,
  source_code text not null,
  source_code_normalized text not null,
  product_id uuid not null,
  created_by text not null,
  created_at timestamptz not null default now(),
  source_intake_id uuid null,
  revoked_at timestamptz null,
  revoked_by text null,
  constraint vyron_order_product_aliases_code_not_blank check (btrim(source_code_normalized) <> ''),
  constraint vyron_order_product_aliases_revoked_pair check ((revoked_at is null) = (revoked_by is null))
);

-- One live alias per code per customer (and one company-wide).
create unique index if not exists uq_vyron_order_product_aliases_customer
  on public.vyron_order_product_aliases (company_id, customer_id, source_code_normalized)
  where revoked_at is null and customer_id is not null;
create unique index if not exists uq_vyron_order_product_aliases_company
  on public.vyron_order_product_aliases (company_id, source_code_normalized)
  where revoked_at is null and customer_id is null;

create table if not exists public.vyron_order_customer_identities (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  source text not null,
  external_reference text not null,
  external_reference_normalized text not null,
  customer_id uuid not null,
  created_by text not null,
  created_at timestamptz not null default now(),
  source_intake_id uuid null,
  revoked_at timestamptz null,
  revoked_by text null,
  constraint vyron_order_customer_identities_ref_not_blank check (btrim(external_reference_normalized) <> ''),
  constraint vyron_order_customer_identities_revoked_pair check ((revoked_at is null) = (revoked_by is null))
);

create unique index if not exists uq_vyron_order_customer_identities_live
  on public.vyron_order_customer_identities (company_id, source, external_reference_normalized)
  where revoked_at is null;

-- A mapping is a recorded decision: it may be revoked once, never rewritten or deleted.
create or replace function public.vyron_order_mapping_revoke_only()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception '% rows are never deleted; revoke the mapping instead.', tg_table_name;
  end if;
  if old.revoked_at is not null then
    raise exception '% row % is already revoked.', tg_table_name, old.id;
  end if;
  if (to_jsonb(new) - 'revoked_at' - 'revoked_by') is distinct from (to_jsonb(old) - 'revoked_at' - 'revoked_by') then
    raise exception '% rows may only be revoked, never edited.', tg_table_name;
  end if;
  return new;
end;
$$;

drop trigger if exists vyron_order_product_aliases_revoke_only on public.vyron_order_product_aliases;
create trigger vyron_order_product_aliases_revoke_only
  before update or delete on public.vyron_order_product_aliases
  for each row execute function public.vyron_order_mapping_revoke_only();

drop trigger if exists vyron_order_customer_identities_revoke_only on public.vyron_order_customer_identities;
create trigger vyron_order_customer_identities_revoke_only
  before update or delete on public.vyron_order_customer_identities
  for each row execute function public.vyron_order_mapping_revoke_only();

-- ---------------------------------------------------------------------------
-- 3. Customer order policies (every rule off by default)
-- ---------------------------------------------------------------------------

create table if not exists public.vyron_customer_order_policies (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  -- NULL: the company default, applied when a customer has no policy of its own.
  customer_id uuid null,
  require_po boolean not null default false,
  require_delivery_date boolean not null default false,
  min_order_value numeric(18,2) null,
  min_gp_pct numeric(9,2) null,
  enforce_case_quantity boolean not null default false,
  -- ISO weekdays, 1 = Monday … 7 = Sunday.
  delivery_weekdays smallint[] null,
  order_cutoff_time time null,
  special_instructions text null,
  updated_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vyron_customer_order_policies_min_value check (min_order_value is null or min_order_value >= 0),
  constraint vyron_customer_order_policies_min_gp check (min_gp_pct is null or (min_gp_pct >= -100 and min_gp_pct <= 100)),
  constraint vyron_customer_order_policies_weekdays check (
    delivery_weekdays is null or (cardinality(delivery_weekdays) between 1 and 7 and delivery_weekdays <@ array[1,2,3,4,5,6,7]::smallint[])
  )
);

create unique index if not exists uq_vyron_customer_order_policies_customer
  on public.vyron_customer_order_policies (company_id, customer_id) where customer_id is not null;
create unique index if not exists uq_vyron_customer_order_policies_default
  on public.vyron_customer_order_policies (company_id) where customer_id is null;

alter table public.vyron_order_product_aliases enable row level security;
alter table public.vyron_order_customer_identities enable row level security;
alter table public.vyron_customer_order_policies enable row level security;

revoke all on public.vyron_order_product_aliases from anon, authenticated;
revoke all on public.vyron_order_customer_identities from anon, authenticated;
revoke all on public.vyron_customer_order_policies from anon, authenticated;
revoke all on function public.vyron_order_mapping_revoke_only() from public, anon, authenticated;
