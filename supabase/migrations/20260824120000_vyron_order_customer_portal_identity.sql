-- VYRON ORDER — customer portal identity, sessions and authentication audit.
--
-- Stage 1 of VYRON ORDER. This adds ONLY the customer-authentication layer.
-- It does not touch products, customers, pricing, sales orders, BOMs, stock or
-- invoices, and it creates no parallel ordering engine: customer orders will be
-- written through the existing vyron_customer_sales_orders architecture.
--
-- company_id is deliberately NOT a foreign key. Across VYRON COST it is a
-- logical tenant key — live Handcrafted rows carry a company_id that has no
-- matching row in vyron_cost_companies — so an FK here would reject real
-- tenants. customer_id IS a foreign key, because vyron_customers is the
-- authoritative customer master and a portal identity is meaningless without it.
--
-- Rollback:
--   drop table if exists public.vyron_customer_portal_auth_events;
--   drop table if exists public.vyron_customer_portal_sessions;
--   drop table if exists public.vyron_customer_portal_identities;

-- ---------------------------------------------------------------- identities
create table if not exists public.vyron_customer_portal_identities (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  customer_id uuid not null references public.vyron_customers(id) on delete cascade,
  display_name text not null,
  -- Only a derived hash is ever stored. The PIN itself is never persisted and
  -- never returned by any API.
  pin_hash text not null,
  pin_salt text not null,
  pin_algorithm text not null default 'scrypt$N=16384,r=8,p=1,len=64',
  status text not null default 'Active',
  -- Brute-force controls live on the identity so a lockout survives restarts
  -- and cannot be bypassed by rotating client state.
  failed_attempts integer not null default 0,
  locked_until timestamptz,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vyron_customer_portal_identities_status_check
    check (status in ('Active', 'Suspended')),
  constraint vyron_customer_portal_identities_customer_unique
    unique (customer_id)
);

create index if not exists idx_vyron_customer_portal_identities_company
  on public.vyron_customer_portal_identities (company_id, status);

-- ----------------------------------------------------------------- sessions
create table if not exists public.vyron_customer_portal_sessions (
  id uuid primary key default gen_random_uuid(),
  -- The session token is returned to the browser once, in an httpOnly cookie.
  -- Only its hash is stored, so a database read cannot impersonate a customer.
  token_hash text not null unique,
  identity_id uuid not null
    references public.vyron_customer_portal_identities(id) on delete cascade,
  -- Denormalised tenant scope so every authorisation check is a single read and
  -- can never be widened by a client-supplied value.
  company_id uuid not null,
  customer_id uuid not null references public.vyron_customers(id) on delete cascade,
  created_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  user_agent text
);

create index if not exists idx_vyron_customer_portal_sessions_lookup
  on public.vyron_customer_portal_sessions (token_hash) where revoked_at is null;
create index if not exists idx_vyron_customer_portal_sessions_identity
  on public.vyron_customer_portal_sessions (identity_id, expires_at desc);
create index if not exists idx_vyron_customer_portal_sessions_company
  on public.vyron_customer_portal_sessions (company_id, customer_id);

-- -------------------------------------------------------------- auth events
create table if not exists public.vyron_customer_portal_auth_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid,
  customer_id uuid,
  identity_id uuid,
  event text not null,
  detail text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists idx_vyron_customer_portal_auth_events_scope
  on public.vyron_customer_portal_auth_events (company_id, customer_id, created_at desc);
create index if not exists idx_vyron_customer_portal_auth_events_event
  on public.vyron_customer_portal_auth_events (event, created_at desc);

-- ------------------------------------------------------------------- access
-- These tables hold authentication material and are reached only by server
-- code using the service role, which bypasses RLS. Enabling RLS with no policy
-- therefore denies every anon and authenticated client by default.
alter table public.vyron_customer_portal_identities enable row level security;
alter table public.vyron_customer_portal_sessions   enable row level security;
alter table public.vyron_customer_portal_auth_events enable row level security;
