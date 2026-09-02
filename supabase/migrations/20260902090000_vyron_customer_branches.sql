-- Customer branches / sites, and the branch identity an invoice keeps.
--
-- One customer, many places it trades from. A retail group is a single legal
-- customer with a single VAT number and a single account; the branch says which
-- of its stores a particular invoice belongs to. Splitting them into separate
-- customers would fragment the account, the credit limit and the sales history
-- of one business across four records, which is what this table exists to
-- prevent.
--
-- Branches are optional. A customer with none behaves exactly as it did before.
--
-- Schema only: no customer, invoice or branch rows are created, and no existing
-- address is copied anywhere. Nothing here infers a branch from existing data.

/* ------------------------------------------------------------ tenant anchors */

-- Composite keys, so a child row can be tied to its parent *and* its company in
-- one foreign key. The database then refuses a cross-tenant reference outright
-- rather than relying on every query remembering to filter.
create unique index if not exists vyron_customers_id_company_key
  on public.vyron_customers (id, company_id);

/* ---------------------------------------------------------------- the branch */

create table if not exists public.vyron_customer_branches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  customer_id uuid not null,

  branch_code text,
  branch_name text not null,
  description text,
  is_active boolean not null default true,

  contact_person text,
  phone text,
  mobile text,
  email text,

  address_line1 text,
  address_line2 text,
  suburb text,
  city text,
  province text,
  postal_code text,
  country text,

  delivery_instructions text,
  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'vyron_customer_branches_customer_fkey'
  ) then
    alter table public.vyron_customer_branches
      add constraint vyron_customer_branches_customer_fkey
      foreign key (customer_id, company_id)
      references public.vyron_customers (id, company_id)
      on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'vyron_customer_branches_name_not_blank'
  ) then
    alter table public.vyron_customer_branches
      add constraint vyron_customer_branches_name_not_blank
      check (length(btrim(branch_name)) > 0);
  end if;
end $$;

-- A branch code identifies a branch within its customer. Case and surrounding
-- space are not part of that identity, so "pta01" cannot be added alongside
-- "PTA01". Branches without a code are unconstrained here and are matched on
-- other evidence by the import.
create unique index if not exists vyron_customer_branches_code_key
  on public.vyron_customer_branches (company_id, customer_id, upper(btrim(branch_code)))
  where branch_code is not null and btrim(branch_code) <> '';

create index if not exists vyron_customer_branches_customer_idx
  on public.vyron_customer_branches (company_id, customer_id);

create unique index if not exists vyron_customer_branches_id_company_key
  on public.vyron_customer_branches (id, company_id);

/* -------------------------------------------------- what an invoice remembers */

-- The branch an invoice was raised for, and what that branch said at the time.
--
-- The id keeps the live link, so the branch can be opened from the invoice. The
-- snapshot is what the document renders from: a branch that later moves premises
-- must not silently rewrite the address on an invoice that was already issued.
-- This mirrors how the invoice already preserves the tax identity of both
-- parties.
alter table public.vyron_customer_invoices
  add column if not exists branch_id uuid,
  add column if not exists branch_snapshot jsonb,
  add column if not exists branch_snapshot_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'vyron_customer_invoices_branch_fkey'
  ) then
    alter table public.vyron_customer_invoices
      add constraint vyron_customer_invoices_branch_fkey
      foreign key (branch_id, company_id)
      references public.vyron_customer_branches (id, company_id)
      on delete restrict;
  end if;
end $$;

create index if not exists vyron_customer_invoices_branch_idx
  on public.vyron_customer_invoices (company_id, branch_id)
  where branch_id is not null;

/* ------------------------------------------------------------- keeping it true */

create or replace function public.vyron_customer_branches_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists vyron_customer_branches_touch on public.vyron_customer_branches;
create trigger vyron_customer_branches_touch
  before update on public.vyron_customer_branches
  for each row execute function public.vyron_customer_branches_touch();

-- A snapshot is written once, when the invoice leaves Draft. Rewriting it later
-- would be indistinguishable from editing history, so the database refuses.
create or replace function public.vyron_customer_invoice_branch_snapshot_is_immutable()
returns trigger
language plpgsql
as $$
begin
  if old.branch_snapshot is not null and new.branch_snapshot is distinct from old.branch_snapshot then
    raise exception 'branch_snapshot is written once and cannot be changed';
  end if;
  return new;
end $$;

drop trigger if exists vyron_customer_invoice_branch_snapshot_guard on public.vyron_customer_invoices;
create trigger vyron_customer_invoice_branch_snapshot_guard
  before update on public.vyron_customer_invoices
  for each row execute function public.vyron_customer_invoice_branch_snapshot_is_immutable();
