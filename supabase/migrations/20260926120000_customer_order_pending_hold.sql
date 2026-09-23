-- Customer ordering: how long an unapproved order may hold stock.
--
-- NOT APPLIED to production. Additive only, and NULL by default, so applying
-- it changes nothing until somebody decides the value.
--
-- A customer's order holds the stock it commits from the moment it is placed —
-- otherwise the quantity shown to the next customer is a guess. But an order
-- nobody approves must not hold that stock for ever. How long it may is a
-- business decision, not a number for engineering to choose:
--
--   NULL  not configured — the hold does not expire (what happens today)
--   N     minutes an unapproved order may hold stock before it expires,
--         is cancelled through the ordinary order lifecycle, and the stock
--         becomes available again
--
-- The company row is the policy; the identity row overrides it for one
-- customer where that customer has been given different terms.
--
-- Rollback:
--   alter table public.vyron_customer_portal_tenants drop column if exists pending_hold_minutes;
--   alter table public.vyron_customer_portal_identities drop column if exists pending_hold_minutes;

alter table public.vyron_customer_portal_tenants
  add column if not exists pending_hold_minutes integer null;

alter table public.vyron_customer_portal_tenants
  drop constraint if exists vyron_customer_portal_tenants_pending_hold_minutes;
alter table public.vyron_customer_portal_tenants
  add constraint vyron_customer_portal_tenants_pending_hold_minutes
  check (pending_hold_minutes is null or (pending_hold_minutes >= 5 and pending_hold_minutes <= 43200));

alter table public.vyron_customer_portal_identities
  add column if not exists pending_hold_minutes integer null;

alter table public.vyron_customer_portal_identities
  drop constraint if exists vyron_customer_portal_identities_pending_hold_minutes;
alter table public.vyron_customer_portal_identities
  add constraint vyron_customer_portal_identities_pending_hold_minutes
  check (pending_hold_minutes is null or (pending_hold_minutes >= 5 and pending_hold_minutes <= 43200));

comment on column public.vyron_customer_portal_tenants.pending_hold_minutes is
  'Minutes an unapproved customer order may hold stock before it expires and the stock is released. NULL means not configured: the hold does not expire. Lower bound 5 minutes (a hold shorter than that would expire while the customer is still ordering); upper bound 30 days.';
comment on column public.vyron_customer_portal_identities.pending_hold_minutes is
  'Overrides the company policy for this one customer. NULL means use the company policy.';
