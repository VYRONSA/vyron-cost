-- VYRON COST — user registry identity: one vyron_cost_users row per (company, email).
--
-- Owner provisioning (src/lib/vyron-saas-workspace.ts) upserts the company's
-- owner into vyron_cost_users. It asked PostgREST for ON CONFLICT (email), but
-- the table had no unique constraint at all, so every upsert was rejected and
-- the error was discarded: no tenant ever received its registry row.
--
-- The registry is per company (company_id foreign key, per-company role, and
-- the only reader filters by company_id), so the key is (company_id, email),
-- not email alone: a person who owns two companies has one row in each, and
-- provisioning one company can never move or overwrite another company's row.
-- Emails are stored trimmed and lower-case (the application already normalises
-- them), which makes the key case-insensitive in effect.
--
-- Additive. Adds two constraints; alters no column and changes no row. Refuses
-- to run if existing rows would violate either constraint, instead of
-- rewriting them. Safe to re-run.

do $$
begin
  if exists (select 1 from public.vyron_cost_users where email <> lower(btrim(email))) then
    raise exception 'vyron_cost_users has emails that are not trimmed lower-case; normalise them before applying this migration';
  end if;
  if exists (select 1 from public.vyron_cost_users group by company_id, email having count(*) > 1) then
    raise exception 'vyron_cost_users has duplicate (company_id, email) rows; resolve them before applying this migration';
  end if;

  if not exists (select 1 from pg_constraint where conrelid = 'public.vyron_cost_users'::regclass and conname = 'vyron_cost_users_email_normalised') then
    alter table public.vyron_cost_users
      add constraint vyron_cost_users_email_normalised check (email = lower(btrim(email)));
  end if;

  if not exists (select 1 from pg_constraint where conrelid = 'public.vyron_cost_users'::regclass and conname = 'vyron_cost_users_company_email_key') then
    alter table public.vyron_cost_users
      add constraint vyron_cost_users_company_email_key unique (company_id, email);
  end if;
end $$;
