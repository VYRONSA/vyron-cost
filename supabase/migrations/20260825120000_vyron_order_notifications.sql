-- VYRON ORDER — notification recipients and delivery log.
--
-- Two tables only. Everything else this feature needs already exists:
-- vyron_customer_sales_orders holds the order, vyron_customer_sales_order_audit
-- holds the event history, transitionCustomerSalesOrder owns the state machine,
-- and sendDocumentEmail is the platform email transport. None of that is
-- duplicated here.
--
-- The delivery log is deliberately NOT part of the order transaction. An order
-- is committed first and notifications are generated afterwards, so a provider
-- being offline can never cost a customer their order.
--
-- company_id is a logical tenant key with no foreign key, consistent with every
-- other VYRON ORDER table.
--
-- Rollback:
--   drop table if exists public.vyron_order_notification_deliveries;
--   drop table if exists public.vyron_order_notification_recipients;

-- --------------------------------------------------------------- recipients
create table if not exists public.vyron_order_notification_recipients (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  name text not null,
  -- Purpose, not an HR role. Decides which events reach this person.
  role text not null default 'Commercial',
  email text,
  mobile text,
  email_enabled boolean not null default true,
  sms_enabled boolean not null default false,
  whatsapp_enabled boolean not null default false,
  status text not null default 'Active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vyron_order_notification_recipients_role_check
    check (role in ('Commercial', 'Production', 'Delivery', 'Management')),
  constraint vyron_order_notification_recipients_status_check
    check (status in ('Active', 'Inactive')),
  -- A recipient with no reachable channel is a configuration mistake, not a
  -- silent no-op.
  constraint vyron_order_notification_recipients_contactable
    check (email is not null or mobile is not null)
);

create index if not exists idx_vyron_order_notification_recipients_company
  on public.vyron_order_notification_recipients (company_id, status);

-- --------------------------------------------------------------- deliveries
create table if not exists public.vyron_order_notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  event_type text not null,
  -- Null for a test notification, which deliberately has no order behind it.
  sales_order_id uuid references public.vyron_customer_sales_orders(id) on delete set null,
  order_number text,
  -- Kept on delete so the audit trail survives a recipient being removed, with
  -- the name and target snapshotted at send time.
  recipient_id uuid references public.vyron_order_notification_recipients(id) on delete set null,
  recipient_name text,
  channel text not null,
  -- The address or number actually used. Staff configuration, never a secret,
  -- and never a credential.
  target text,
  status text not null default 'Pending',
  provider text,
  provider_reference text,
  error text,
  attempts integer not null default 0,
  -- In-app notifications are rows in this same table with channel = 'in_app'.
  -- A separate table would have been a second notification system.
  read_at timestamptz,
  /*
   * One successful delivery per event, per recipient, per channel. A retry
   * reuses the same key and updates the existing row rather than sending twice.
   */
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vyron_order_notification_deliveries_channel_check
    check (channel in ('email', 'sms', 'whatsapp', 'in_app')),
  constraint vyron_order_notification_deliveries_status_check
    check (status in ('Pending', 'Sent', 'Failed', 'Not Configured')),
  constraint vyron_order_notification_deliveries_key_unique unique (idempotency_key)
);

create index if not exists idx_vyron_order_notification_deliveries_company
  on public.vyron_order_notification_deliveries (company_id, created_at desc);

-- Drives the staff notification bell: unread in-app items, newest first.
create index if not exists idx_vyron_order_notification_deliveries_inapp
  on public.vyron_order_notification_deliveries (company_id, created_at desc)
  where channel = 'in_app' and read_at is null;

create index if not exists idx_vyron_order_notification_deliveries_order
  on public.vyron_order_notification_deliveries (company_id, sales_order_id);

-- Reads go through the service role only, exactly like the rest of the portal.
alter table public.vyron_order_notification_recipients enable row level security;
alter table public.vyron_order_notification_deliveries enable row level security;
