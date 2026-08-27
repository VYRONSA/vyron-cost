-- VYRON COST — customer invoice VAT engine and tax snapshot
--
-- WHAT WAS WRONG
-- vyron_customer_invoices already carried sales_value (the subtotal excluding
-- VAT), tax_total and amount_due, but only the Xero/CSV importer ever wrote
-- tax_total. Invoices the application itself created went in with tax_total = 0
-- regardless of what the screen displayed, because the invoice form worked VAT
-- out in the browser from a hard-coded 15 and then left it out of the request
-- body. There was nowhere on a line to record what VAT treatment applied, so a
-- zero-rated supply and a standard-rated one were indistinguishable.
--
-- WHAT IS ADDED
-- Per-line tax fields, so the treatment and rate are a property of the supply and
-- not an assumption about the supplier; and an immutable tax snapshot on the
-- header, so a reprinted invoice shows the parties as they were when it was
-- issued rather than as they are today.
--
-- WHAT IS NOT TOUCHED
-- line_total, line_cost and line_gp stay exactly as they are — generated from
-- quantity x selling_price and quantity x cost_per_unit. They are the gross
-- amounts before discount, all 812 existing rows depend on them, and redefining
-- them would rewrite history. taxable_amount below is the post-discount base and
-- is stored separately.
--
-- EXISTING DATA
-- Every column added is nullable or defaulted. Nothing is backfilled with an
-- assumed VAT treatment: the 133 imported invoices carry a header tax_total but
-- no per-line breakdown, and that breakdown cannot be reconstructed from what was
-- imported. Their lines therefore keep tax_treatment NULL, which reads as "never
-- calculated by the engine" rather than as a measured zero.

-- ---------------------------------------------------------------------------
-- Invoice lines
-- ---------------------------------------------------------------------------
alter table public.vyron_customer_invoice_lines
  -- NULL means this line predates the VAT engine. New lines always set it.
  add column if not exists tax_treatment text,
  add column if not exists tax_rate numeric(9,4),
  add column if not exists discount_percent numeric(9,4) not null default 0,
  add column if not exists discount_amount numeric(18,2) not null default 0,
  -- The post-discount base the rate is applied to, always excluding VAT.
  add column if not exists taxable_amount numeric(18,2),
  add column if not exists tax_amount numeric(18,2),
  add column if not exists line_total_incl_tax numeric(18,2);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'vyron_invoice_lines_tax_treatment_check') then
    alter table public.vyron_customer_invoice_lines
      add constraint vyron_invoice_lines_tax_treatment_check
      check (tax_treatment is null or tax_treatment in ('Standard', 'Zero Rated', 'Exempt', 'No VAT'));
  end if;

  -- Only a standard-rated line may carry a non-zero rate. A zero-rated, exempt or
  -- out-of-scope supply charging VAT is not a data entry mistake to be tolerated.
  if not exists (select 1 from pg_constraint where conname = 'vyron_invoice_lines_tax_rate_check') then
    alter table public.vyron_customer_invoice_lines
      add constraint vyron_invoice_lines_tax_rate_check
      check (
        tax_rate is null
        or tax_rate >= 0
      );
  end if;

  if not exists (select 1 from pg_constraint where conname = 'vyron_invoice_lines_nonstandard_zero_rate_check') then
    alter table public.vyron_customer_invoice_lines
      add constraint vyron_invoice_lines_nonstandard_zero_rate_check
      check (
        tax_treatment is null
        or tax_treatment = 'Standard'
        or coalesce(tax_rate, 0) = 0
      );
  end if;

  if not exists (select 1 from pg_constraint where conname = 'vyron_invoice_lines_discount_check') then
    alter table public.vyron_customer_invoice_lines
      add constraint vyron_invoice_lines_discount_check
      check (discount_amount >= 0 and discount_percent >= 0);
  end if;
end $$;

comment on column public.vyron_customer_invoice_lines.tax_treatment is
  'VAT treatment of this supply. NULL means the line predates the VAT engine and its treatment was never determined.';
comment on column public.vyron_customer_invoice_lines.taxable_amount is
  'Post-discount base excluding VAT, which the rate is applied to. line_total remains the pre-discount gross.';

-- ---------------------------------------------------------------------------
-- Invoice header
-- ---------------------------------------------------------------------------
alter table public.vyron_customer_invoices
  -- Whether selling_price on this invoice's lines already contains VAT. The
  -- application has always treated prices as exclusive; recording it makes that
  -- an explicit property of the invoice rather than an assumption in the code.
  add column if not exists prices_include_tax boolean not null default false,
  -- Frozen tax identity of both parties, written once when the invoice stops
  -- being a draft. Never rewritten by later master-data edits.
  add column if not exists tax_snapshot jsonb,
  add column if not exists tax_snapshot_at timestamptz;

-- sales_value is the subtotal excluding VAT and tax_total is the VAT, so the
-- consideration is their sum. Generated rather than written, so it can never
-- drift from its parts and needs no backfill.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'vyron_customer_invoices'
      and column_name = 'total_incl_tax'
  ) then
    alter table public.vyron_customer_invoices
      add column total_incl_tax numeric(18,2)
      generated always as (coalesce(sales_value, 0) + coalesce(tax_total, 0)) stored;
  end if;
end $$;

comment on column public.vyron_customer_invoices.tax_snapshot is
  'Immutable tax identity of supplier and customer, captured when the invoice left Draft. Reprints read this, never live master data.';
comment on column public.vyron_customer_invoices.total_incl_tax is
  'Consideration: sales_value (excl VAT) + tax_total. Generated, so it cannot disagree with its parts.';

create index if not exists idx_vyron_customer_invoices_snapshot
  on public.vyron_customer_invoices (company_id)
  where tax_snapshot is not null;

-- ---------------------------------------------------------------------------
-- The snapshot is write-once
-- ---------------------------------------------------------------------------
-- Enforced in the database, not only in the application: an invoice reissued or
-- patched through any other path must not be able to restate what was on the
-- document when it was issued. Clearing it is refused for the same reason.
create or replace function public.vyron_customer_invoice_snapshot_is_immutable()
returns trigger
language plpgsql
as $$
begin
  if old.tax_snapshot is not null and new.tax_snapshot is distinct from old.tax_snapshot then
    raise exception
      'The tax snapshot on invoice % was captured at % and cannot be changed. Issue a credit note instead.',
      old.invoice_number, old.tax_snapshot_at;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_vyron_customer_invoice_snapshot_immutable on public.vyron_customer_invoices;
create trigger trg_vyron_customer_invoice_snapshot_immutable
  before update on public.vyron_customer_invoices
  for each row
  execute function public.vyron_customer_invoice_snapshot_is_immutable();
