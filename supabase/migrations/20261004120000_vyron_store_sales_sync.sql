-- VOLORA online-store sales sync: Shopify and WooCommerce are sales channels.
--
-- WHAT THIS IS
-- Every online-store order becomes a VOLORA customer invoice through the
-- existing invoice pipeline (createCustomerInvoice, issued as Posted), and
-- every refund becomes a credit note in the same invoice tables. Sales and
-- credits only: no stock movement, no Xero queue, no store-specific rules. There is
-- ONE sales truth: revenue, VAT, cost, GP, customer and product history keep
-- reading vyron_customer_invoices / _lines, whatever channel the sale came from.
--
-- These tables hold only integration state, shared by both channels (a
-- `channel` column, never a second set of tables per channel): which store
-- belongs to which company, which external order became which invoice, what
-- needs a person, which webhook deliveries were seen, where a historical import
-- is, and the audit trail.
--
-- Design record: docs/integrations/ONLINE_STORE_SALES_SYNC.md
--
-- IDEMPOTENCY
--   (company_id, connection_id, external_order_id)   one sync row per store order
--   (company_id, connection_id, external_refund_id)  one row per store refund
--   (connection_id, delivery_id)                     a webhook delivery is seen once
--   invoice numbers derived from the external ids; vyron_customer_invoices
--     already has a GLOBAL unique index on invoice_number, so the database
--     itself refuses a second invoice for the same order or refund.
--
-- SECURITY
-- Reached only by server code through the service role. RLS on, no policy,
-- grants revoked. Store credentials are NOT stored here: they live only in the
-- server environment, each entry bound to the company that owns the store.
--
-- CHANGES TO AN EXISTING TABLE
-- vyron_customer_invoices gains three NULLABLE columns (source_channel,
-- source_reference, credited_invoice_id). Existing rows keep NULL; no existing
-- code reads or writes them; no existing constraint changes.
--
-- Rollback (only while the store tables are empty or disposable):
--   drop table if exists public.vyron_store_sync_events;
--   drop table if exists public.vyron_store_backfills;
--   drop table if exists public.vyron_store_webhook_deliveries;
--   drop table if exists public.vyron_store_refunds;
--   drop table if exists public.vyron_store_orders;
--   drop table if exists public.vyron_store_connections;
--   alter table public.vyron_customer_invoices
--     drop column if exists credited_invoice_id,
--     drop column if exists source_reference,
--     drop column if exists source_channel;

-- ---------------------------------------------------------------------------
-- Invoice provenance (existing table, additive, nullable)
-- ---------------------------------------------------------------------------
alter table public.vyron_customer_invoices
  add column if not exists source_channel text null,
  add column if not exists source_reference text null,
  add column if not exists credited_invoice_id uuid null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'vyron_customer_invoices_credited_invoice_fk') then
    alter table public.vyron_customer_invoices
      add constraint vyron_customer_invoices_credited_invoice_fk
      foreign key (credited_invoice_id) references public.vyron_customer_invoices(id) on delete restrict;
  end if;
end $$;

create index if not exists idx_vyron_customer_invoices_source
  on public.vyron_customer_invoices (company_id, source_channel, source_reference)
  where source_channel is not null;

comment on column public.vyron_customer_invoices.source_channel is
  'Where the sale came from when not entered in VOLORA (SHOPIFY, WOOCOMMERCE). NULL = entered in VOLORA.';
comment on column public.vyron_customer_invoices.source_reference is
  'The source''s own reference, e.g. shopify:<store>:order:<id> or woocommerce:<store>:refund:<id>.';
comment on column public.vyron_customer_invoices.credited_invoice_id is
  'For a credit note: the invoice it credits.';

-- ---------------------------------------------------------------------------
-- Store connections (no credentials)
-- ---------------------------------------------------------------------------
create table if not exists public.vyron_store_connections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  channel text not null,
  -- Canonical store address: https://<shop>.myshopify.com, or the WooCommerce site URL.
  store_url text not null,
  store_key text not null,
  display_name text null,
  status text not null default 'DISABLED',
  -- The store's own "online sales" customer, created with the connection:
  -- shoppers not matched to a VOLORA customer are booked to it.
  default_customer_id uuid null,
  expected_currency text not null default 'ZAR',
  webhook_subscriptions jsonb not null default '[]'::jsonb,
  last_webhook_at timestamptz null,
  last_sync_at timestamptz null,
  last_reconciled_at timestamptz null,
  last_success_at timestamptz null,
  last_failure_at timestamptz null,
  last_failure_reason text null,
  created_by text null,
  updated_by text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vyron_store_connections_store unique (channel, store_url),
  constraint vyron_store_connections_store_key unique (company_id, channel, store_key),
  constraint vyron_store_connections_channel check (channel in ('SHOPIFY', 'WOOCOMMERCE')),
  constraint vyron_store_connections_store_url check (store_url ~ '^https://[a-z0-9.-]+(:[0-9]+)?(/[A-Za-z0-9._~/-]*)?$'),
  constraint vyron_store_connections_store_key_format check (store_key ~ '^[a-z0-9][a-z0-9-]{1,40}$'),
  constraint vyron_store_connections_status check (status in ('DISABLED', 'ACTIVE', 'SUSPENDED'))
);

-- ---------------------------------------------------------------------------
-- One row per store order: the sync state and the invoice it became
-- ---------------------------------------------------------------------------
create table if not exists public.vyron_store_orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  connection_id uuid not null references public.vyron_store_connections(id) on delete restrict,
  channel text not null,
  external_order_id text not null,
  order_number text null,
  order_created_at timestamptz null,
  financial_status text null,
  cancelled_at timestamptz null,
  currency text null,
  total_price numeric(18,2) null,
  customer_display text null,
  status text not null default 'PENDING',
  issues jsonb not null default '[]'::jsonb,
  issue_codes text[] not null default '{}',
  customer_id uuid null,
  invoice_id uuid null,
  invoice_number text null,
  -- External line id -> VOLORA product and the cost the invoice carried, fixed
  -- at import, so a later refund credits exactly what was invoiced.
  line_map jsonb not null default '[]'::jsonb,
  sale_fingerprint text null,
  attempts integer not null default 0,
  -- Due for (re)processing when set and in the past: a webhook, a retry, an import.
  next_attempt_at timestamptz null,
  -- Processing lease: two deliveries for one order never process it at once.
  locked_until timestamptz null,
  last_error text null,
  last_event_at timestamptz null,
  imported_at timestamptz null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vyron_store_orders_key unique (company_id, connection_id, external_order_id),
  constraint vyron_store_orders_invoice unique (invoice_id),
  constraint vyron_store_orders_channel check (channel in ('SHOPIFY', 'WOOCOMMERCE')),
  constraint vyron_store_orders_status
    check (status in ('PENDING', 'WAITING', 'IMPORTED', 'NEEDS_ATTENTION', 'FAILED', 'SKIPPED')),
  constraint vyron_store_orders_id_not_blank check (btrim(external_order_id) <> '')
);

create index if not exists idx_vyron_store_orders_status
  on public.vyron_store_orders (company_id, connection_id, status, updated_at desc);
create index if not exists idx_vyron_store_orders_due
  on public.vyron_store_orders (connection_id, next_attempt_at)
  where next_attempt_at is not null;

-- ---------------------------------------------------------------------------
-- One row per store refund: the credit note it became
-- ---------------------------------------------------------------------------
create table if not exists public.vyron_store_refunds (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  connection_id uuid not null references public.vyron_store_connections(id) on delete restrict,
  store_order_row_id uuid not null references public.vyron_store_orders(id) on delete restrict,
  external_refund_id text not null,
  refunded_at timestamptz null,
  amount numeric(18,2) null,
  credit_invoice_id uuid null,
  credit_invoice_number text null,
  created_at timestamptz not null default now(),
  constraint vyron_store_refunds_key unique (company_id, connection_id, external_refund_id),
  constraint vyron_store_refunds_credit unique (credit_invoice_id)
);

-- ---------------------------------------------------------------------------
-- Webhook deliveries already seen (stores retry and may deliver twice)
-- ---------------------------------------------------------------------------
create table if not exists public.vyron_store_webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  connection_id uuid not null references public.vyron_store_connections(id) on delete cascade,
  delivery_id text not null,
  topic text not null,
  external_order_id text null,
  received_at timestamptz not null default now(),
  constraint vyron_store_webhook_deliveries_key unique (connection_id, delivery_id)
);

create index if not exists idx_vyron_store_webhook_deliveries_received
  on public.vyron_store_webhook_deliveries (company_id, received_at desc);

-- ---------------------------------------------------------------------------
-- Historical import (resumable: the cursor is the resume point)
-- ---------------------------------------------------------------------------
create table if not exists public.vyron_store_backfills (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  connection_id uuid not null references public.vyron_store_connections(id) on delete restrict,
  status text not null default 'RUNNING',
  created_from date not null,
  created_to date null,
  -- Resume point: Shopify's page cursor, or WooCommerce's next page number
  -- (WooCommerce is listed by ascending id, so new orders never shift a page).
  cursor text null,
  pages integer not null default 0,
  orders_seen integer not null default 0,
  attempts integer not null default 0,
  last_error text null,
  started_by text null,
  started_at timestamptz not null default now(),
  completed_at timestamptz null,
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  constraint vyron_store_backfills_status check (status in ('RUNNING', 'PAUSED', 'COMPLETED', 'FAILED'))
);

-- At most one historical import runs per store.
create unique index if not exists idx_vyron_store_backfills_one_running
  on public.vyron_store_backfills (connection_id)
  where status = 'RUNNING';

-- ---------------------------------------------------------------------------
-- Audit trail / sync log (append-only by convention: the service never updates or deletes)
-- ---------------------------------------------------------------------------
create table if not exists public.vyron_store_sync_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  connection_id uuid null,
  store_order_row_id uuid null,
  event_type text not null,
  actor text not null,
  detail text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_vyron_store_sync_events_connection
  on public.vyron_store_sync_events (company_id, connection_id, created_at desc);
create index if not exists idx_vyron_store_sync_events_order
  on public.vyron_store_sync_events (company_id, store_order_row_id, created_at);

-- ---------------------------------------------------------------------------
-- Security
-- ---------------------------------------------------------------------------
alter table public.vyron_store_connections enable row level security;
alter table public.vyron_store_orders enable row level security;
alter table public.vyron_store_refunds enable row level security;
alter table public.vyron_store_webhook_deliveries enable row level security;
alter table public.vyron_store_backfills enable row level security;
alter table public.vyron_store_sync_events enable row level security;

revoke all on public.vyron_store_connections from anon, authenticated;
revoke all on public.vyron_store_orders from anon, authenticated;
revoke all on public.vyron_store_refunds from anon, authenticated;
revoke all on public.vyron_store_webhook_deliveries from anon, authenticated;
revoke all on public.vyron_store_backfills from anon, authenticated;
revoke all on public.vyron_store_sync_events from anon, authenticated;
