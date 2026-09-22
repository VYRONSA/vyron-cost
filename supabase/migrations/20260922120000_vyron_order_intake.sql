-- VYRON Order Engine: the intake layer in front of the sales-order engine.
--
-- WHY THESE TABLES ARE NEEDED
-- VYRON already has a complete sales-order engine (vyron_customer_sales_orders
-- and its lines, allocations, audit and links). What it has no place for is an
-- order *before* it is a sales order: received from a source (manual entry, a
-- CSV file, later e-mail or a web store), matched deterministically to a
-- customer and products, validated, held as an exception, and approved or
-- rejected by a person. These four tables are that place. An approved intake is
-- handed to the existing engine as a Draft sales order; nothing here posts
-- stock, invoices or accounting.
--
-- Design record: docs/order-engine/ORDER_ENGINE_ARCHITECTURE.md
--
-- IDEMPOTENCY
--   (company_id, source, source_key)            one intake per source order
--   (intake_id, source_line_reference)          one line per source line
--   (company_id, channel, message_id)           one message per inbound e-mail
--   sales_order_id unique                       one sales order per intake
-- Postgres treats NULLs as distinct, so manual entries without a key and lines
-- without a reference are unaffected.
--
-- SECURITY
-- Reached only by server code through the service role, which bypasses RLS.
-- RLS on with no policy denies anon and authenticated clients by default.
-- company_id is a logical tenant key (no foreign key), as for the VYRON ORDER
-- portal tables: not every live tenant has a vyron_cost_companies row.
--
-- Additive only: creates four tables, their indexes, and one trigger function.
-- Changes no existing table.
--
-- Rollback (only while the tables are empty or disposable):
--   drop table if exists public.vyron_order_intake_events;
--   drop table if exists public.vyron_order_intake_lines;
--   drop table if exists public.vyron_order_intakes;
--   drop table if exists public.vyron_order_source_messages;
--   drop function if exists public.vyron_order_intake_events_append_only();

create table if not exists public.vyron_order_source_messages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  channel text not null,
  provider text not null,
  message_id text not null,
  from_address text null,
  to_addresses jsonb not null default '[]'::jsonb,
  cc_addresses jsonb not null default '[]'::jsonb,
  subject text null,
  received_at timestamptz not null,
  body_text text null,
  attachments jsonb not null default '[]'::jsonb,
  processing_status text not null default 'RECEIVED',
  processing_error text null,
  intake_id uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vyron_order_source_messages_channel check (channel in ('email')),
  constraint vyron_order_source_messages_status
    check (processing_status in ('RECEIVED', 'PARSED', 'NO_ORDER_FOUND', 'FAILED')),
  constraint vyron_order_source_messages_message_id_not_blank check (btrim(message_id) <> ''),
  constraint vyron_order_source_messages_key unique (company_id, channel, message_id)
);

create table if not exists public.vyron_order_intakes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  intake_number text not null,

  -- Provenance.
  source text not null,
  source_key text null,
  source_reference text null,
  source_message_id uuid null references public.vyron_order_source_messages(id) on delete set null,
  source_status text null,
  content_hash text not null,

  -- Commercial header, as received.
  external_order_number text null,
  customer_po_number text null,
  customer_id uuid null,
  customer_name text null,
  customer_reference text null,
  customer_match_rule text null,
  order_date date null,
  requested_delivery_date date null,
  currency text null,
  delivery_address text null,
  contact_name text null,
  notes text null,

  -- Amounts exactly as the source stated them. VYRON's own expected totals live
  -- in `validation`; the difference is itself a validation signal.
  supplied_subtotal numeric(18,2) null,
  supplied_discount_total numeric(18,2) null,
  supplied_tax_total numeric(18,2) null,
  supplied_total numeric(18,2) null,

  status text not null default 'RECEIVED',
  validation jsonb not null default '{}'::jsonb,
  validation_hash text null,
  validated_at timestamptz null,
  blocking_issue_count integer not null default 0,
  warning_issue_count integer not null default 0,

  decision_by text null,
  decision_at timestamptz null,
  decision_note text null,

  -- Handoff to the existing sales-order engine. pending_ is claimed before the
  -- sales order is written so a retried confirm links the same order.
  pending_sales_order_id uuid null,
  sales_order_id uuid null,

  created_by text not null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint vyron_order_intakes_source check (
    source in ('manual', 'csv', 'xlsx', 'email', 'pdf', 'woocommerce', 'shopify', 'api', 'edi')
  ),
  constraint vyron_order_intakes_status check (
    status in ('RECEIVED', 'EXCEPTION', 'AWAITING_APPROVAL', 'ON_HOLD', 'APPROVED', 'CONFIRMED', 'REJECTED', 'CANCELLED')
  ),
  constraint vyron_order_intakes_source_key_not_blank check (source_key is null or btrim(source_key) <> ''),
  constraint vyron_order_intakes_confirmed_has_order check (status <> 'CONFIRMED' or sales_order_id is not null),
  constraint vyron_order_intakes_number unique (company_id, intake_number),
  constraint vyron_order_intakes_source_identity unique (company_id, source, source_key),
  constraint vyron_order_intakes_sales_order unique (sales_order_id)
);

create index if not exists idx_vyron_order_intakes_company_status
  on public.vyron_order_intakes (company_id, status, created_at desc);

create index if not exists idx_vyron_order_intakes_company_po
  on public.vyron_order_intakes (company_id, customer_id, customer_po_number)
  where customer_po_number is not null;

create table if not exists public.vyron_order_intake_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  intake_id uuid not null references public.vyron_order_intakes(id) on delete cascade,
  line_no integer not null,
  source_line_reference text null,

  raw_sku text null,
  raw_description text null,
  raw_unit text null,
  quantity numeric(14,4) not null,
  unit_price numeric(18,4) null,
  discount_amount numeric(18,2) null,
  tax_amount numeric(18,2) null,
  line_total numeric(18,2) null,

  product_id uuid null,
  match_status text not null default 'PENDING',
  match_rule text null,
  match_candidates jsonb not null default '[]'::jsonb,
  matched_by text null,
  matched_at timestamptz null,
  validation_status text not null default 'PENDING',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint vyron_order_intake_lines_match_status
    check (match_status in ('PENDING', 'MATCHED', 'UNMATCHED', 'AMBIGUOUS')),
  constraint vyron_order_intake_lines_match_rule check (
    match_rule is null or match_rule in ('manual', 'sku_exact', 'sku_normalized', 'alias', 'name_exact')
  ),
  constraint vyron_order_intake_lines_matched_has_product
    check (match_status <> 'MATCHED' or product_id is not null),
  constraint vyron_order_intake_lines_validation_status
    check (validation_status in ('PENDING', 'OK', 'WARNING', 'ERROR')),
  constraint vyron_order_intake_lines_line_no unique (intake_id, line_no),
  constraint vyron_order_intake_lines_source_ref unique (intake_id, source_line_reference)
);

create index if not exists idx_vyron_order_intake_lines_intake
  on public.vyron_order_intake_lines (company_id, intake_id, line_no);

create table if not exists public.vyron_order_intake_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  intake_id uuid not null references public.vyron_order_intakes(id) on delete cascade,
  event_type text not null,
  actor text not null,
  actor_name text null,
  from_status text null,
  to_status text null,
  detail text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint vyron_order_intake_events_actor_not_blank check (btrim(actor) <> '')
);

create index if not exists idx_vyron_order_intake_events_intake
  on public.vyron_order_intake_events (company_id, intake_id, created_at);

-- The audit trail is append-only: an event is never edited, and never deleted
-- except by its intake's own cascade.
create or replace function public.vyron_order_intake_events_append_only()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'vyron_order_intake_events is append-only; an audit event cannot be changed.';
  end if;
  if pg_trigger_depth() <= 1 then
    raise exception 'vyron_order_intake_events is append-only; an audit event is removed only with its intake.';
  end if;
  return old;
end;
$$;

drop trigger if exists vyron_order_intake_events_append_only on public.vyron_order_intake_events;
create trigger vyron_order_intake_events_append_only
  before update or delete on public.vyron_order_intake_events
  for each row execute function public.vyron_order_intake_events_append_only();

alter table public.vyron_order_source_messages enable row level security;
alter table public.vyron_order_intakes enable row level security;
alter table public.vyron_order_intake_lines enable row level security;
alter table public.vyron_order_intake_events enable row level security;

revoke all on public.vyron_order_source_messages from anon, authenticated;
revoke all on public.vyron_order_intakes from anon, authenticated;
revoke all on public.vyron_order_intake_lines from anon, authenticated;
revoke all on public.vyron_order_intake_events from anon, authenticated;
revoke all on function public.vyron_order_intake_events_append_only() from public, anon, authenticated;
