-- VYRON ORDER — public tenant discovery for the customer login screen.
--
-- The problem this solves: a customer opening VYRON ORDER on their phone has
-- no VYRON COST staff session, so the server had no way to know which tenant
-- they were trying to order from. The account list was resolved from the staff
-- workspace cookie, which a customer never has, so it always came back empty.
--
-- The fix is a public, non-secret slug per tenant that can appear in a URL:
--   /order/handcrafted
-- The slug identifies the TENANT only. It is not a credential, it grants no
-- access, and it is not customer-specific. Everything behind it still requires
-- the customer's own PIN, and the authoritative tenant for a signed-in session
-- is still read from the portal identity, never from the URL.
--
-- Why a separate table rather than a column on vyron_cost_companies: the portal
-- is additive to VYRON COST by design, this carries portal-only settings
-- (whether ordering is open at all, and the name shown to customers), and it
-- avoids changing a core table that other parts of the product read.
--
-- company_id is a logical tenant key with no foreign key, consistent with every
-- other VYRON ORDER table.
--
-- Rollback:
--   drop table if exists public.vyron_customer_portal_tenants;

create table if not exists public.vyron_customer_portal_tenants (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  -- Lowercase, URL-safe, and deliberately not a UUID: a customer has to be able
  -- to read it off a card or a WhatsApp message without transcribing it wrong.
  slug text not null,
  -- The name shown on the customer's sign-in screen. Their supplier's trading
  -- name, not an internal company record.
  display_name text not null,
  status text not null default 'Active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vyron_customer_portal_tenants_company_unique unique (company_id),
  constraint vyron_customer_portal_tenants_slug_unique unique (slug),
  constraint vyron_customer_portal_tenants_slug_format
    check (slug ~ '^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$'),
  constraint vyron_customer_portal_tenants_status_check
    check (status in ('Active', 'Disabled'))
);

create index if not exists idx_vyron_customer_portal_tenants_slug
  on public.vyron_customer_portal_tenants (slug)
  where status = 'Active';

-- Reads go through the service role only, exactly like the rest of the portal.
alter table public.vyron_customer_portal_tenants enable row level security;
