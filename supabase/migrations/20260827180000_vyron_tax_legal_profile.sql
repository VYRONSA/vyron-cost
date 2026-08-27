-- VYRON COST — company and customer tax / legal profile
--
-- WHY
-- A South African full tax invoice has to carry the supplier's name, address and
-- VAT registration number, and the recipient's name, address and — where the
-- recipient is a registered vendor — their VAT number (VAT Act s20(4)). Most of
-- that already exists: vyron_workspaces holds company_name, trading_name,
-- vat_number, registration_number, physical_address, postal_address,
-- contact_email, phone and default_vat_rate, and vyron_customers already holds
-- customer_name, vat_number, registration_number, billing_address, email, phone,
-- contact_person and terms. Nothing here duplicates those.
--
-- What is missing is the ability to say whether a party is actually a registered
-- VAT vendor, where to deliver, and how to be paid.
--
-- VAT STATUS IS EXPLICIT, NOT INFERRED
-- Holding a vat_number is not proof of registration — the field may be a stale
-- import, a typo, or a number captured for reference. Treating "has a number" as
-- "is a vendor" would put a recipient VAT number on an invoice for someone who
-- is not registered. Status is therefore recorded on its own, and defaults to
-- Unknown rather than guessing either way.
--
-- Everything added is nullable or defaulted, so all 3 workspaces and all 1,812
-- existing customers stay valid and saveable with none of it filled in.

-- ---------------------------------------------------------------------------
-- Supplier (the company issuing the invoice)
-- ---------------------------------------------------------------------------
alter table public.vyron_workspaces
  -- Legally relevant
  add column if not exists vat_status text not null default 'Unknown',
  -- Business identification, not a SARS tax-invoice requirement
  add column if not exists income_tax_number text,
  add column if not exists website text,
  add column if not exists remittance_email text,
  -- Payment instructions, not a SARS tax-invoice requirement
  add column if not exists bank_name text,
  add column if not exists bank_account_name text,
  add column if not exists bank_account_number text,
  add column if not exists bank_branch_code text,
  add column if not exists bank_account_type text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'vyron_workspaces_vat_status_check'
  ) then
    alter table public.vyron_workspaces
      add constraint vyron_workspaces_vat_status_check
      check (vat_status in ('Registered', 'Not Registered', 'Unknown'));
  end if;
end $$;

comment on column public.vyron_workspaces.vat_status is
  'Whether this company is a registered VAT vendor. Never inferred from vat_number.';

-- ---------------------------------------------------------------------------
-- Recipient (the customer being invoiced)
-- ---------------------------------------------------------------------------
alter table public.vyron_customers
  -- customer_name is the legal/registered name; a trading name is separate.
  add column if not exists trading_name text,
  add column if not exists vat_status text not null default 'Unknown',
  -- billing_address already exists; goods can go somewhere else.
  add column if not exists delivery_address text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'vyron_customers_vat_status_check'
  ) then
    alter table public.vyron_customers
      add constraint vyron_customers_vat_status_check
      check (vat_status in ('Registered', 'Not Registered', 'Unknown'));
  end if;
end $$;

comment on column public.vyron_customers.vat_status is
  'Whether this customer is a registered VAT vendor. Drives whether their VAT number belongs on a full tax invoice.';
comment on column public.vyron_customers.trading_name is
  'Trading name where it differs from customer_name, which is the legal/registered name.';
