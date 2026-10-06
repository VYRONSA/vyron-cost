-- VOLORA business controls: supplier reconciliation, minimum stock levels, production cadence,
-- stock-take uploads and price-list enforcement.
--
-- WHY
-- 1. Supplier invoice reconciliation: an uploaded supplier statement / invoice list is compared with
--    the supplier invoices VOLORA holds. Each run is kept (who, when, which file, every line and
--    its verdict) — a control record, never an accounting transaction.
-- 2. Minimum stock levels: explicit, company-configured thresholds per stock item. The existing
--    reorder_level / min_level on stock items are defaulted at creation (10 / 5) and never edited,
--    so they are not a business decision; these rows are. Stock has no location dimension today, so
--    a threshold is company-wide ('' location); the column exists for when stock gains locations.
-- 3. Production cadence: an optional expected interval between production runs. NULL = not
--    configured = no "no production" warning (nothing is assumed).
-- 4. Stock-take uploads become ordinary stock counts (existing approve/post workflow); the source
--    file is recorded and the same file cannot be loaded twice.
-- 5. Price-list enforcement: one optional company default price list; each invoice line records
--    the price source and list it was priced from.
--
-- SECURITY: every new table is company-scoped and has row level security enabled with no
-- policies, so only the service role (the API, after its own permission and company checks) can
-- reach it. Additive only: no existing row or column is changed.
--
-- ROLLBACK (reverse order):
--   drop table if exists public.vyron_supplier_reconciliation_lines;
--   drop table if exists public.vyron_supplier_reconciliations;
--   drop table if exists public.vyron_stock_minimum_levels;
--   alter table public.vyron_inventory_settings drop column if exists expected_production_interval_hours;
--   drop index if exists public.idx_vyron_cost_stock_counts_source;
--   alter table public.vyron_cost_stock_counts drop column if exists source_file_name, drop column if exists source_sha256;
--   drop index if exists public.idx_vyron_customer_price_lists_company_default;
--   alter table public.vyron_customer_price_lists drop column if exists is_company_default;
--   alter table public.vyron_customer_invoice_lines drop column if exists price_source, drop column if exists price_list_id;

-- 1. Supplier reconciliation --------------------------------------------------------------------
create table if not exists public.vyron_supplier_reconciliations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  supplier_name text null,
  source_file_name text not null,
  source_sha256 text not null,
  period_from date null,
  period_to date null,
  summary jsonb not null default '{}'::jsonb,
  created_by text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_vyron_supplier_reconciliations_company
  on public.vyron_supplier_reconciliations (company_id, created_at desc);

create table if not exists public.vyron_supplier_reconciliation_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  reconciliation_id uuid not null references public.vyron_supplier_reconciliations(id) on delete cascade,
  status text not null,
  supplier_name text null,
  invoice_number text null,
  document_type text not null default 'INVOICE',
  supplier_date date null,
  due_date date null,
  supplier_total numeric(14,2) null,
  supplier_vat numeric(14,2) null,
  amount_paid numeric(14,2) null,
  volora_total numeric(14,2) null,
  volora_vat numeric(14,2) null,
  difference numeric(14,2) null,
  vat_difference numeric(14,2) null,
  volora_ref text null,
  source_row integer null,
  notes text null,
  constraint vyron_supplier_reconciliation_lines_status check (status in
    ('MATCHED', 'MISSING_IN_VOLORA', 'TOTAL_DIFFERENCE', 'VAT_DIFFERENCE', 'DUPLICATE', 'CREDIT_NOTE', 'NOT_ON_SUPPLIER_DOCUMENT')),
  constraint vyron_supplier_reconciliation_lines_type check (document_type in ('INVOICE', 'CREDIT_NOTE'))
);
create index if not exists idx_vyron_supplier_reconciliation_lines_rec
  on public.vyron_supplier_reconciliation_lines (reconciliation_id);

alter table public.vyron_supplier_reconciliations enable row level security;
alter table public.vyron_supplier_reconciliation_lines enable row level security;

-- 2. Minimum stock levels -----------------------------------------------------------------------
create table if not exists public.vyron_stock_minimum_levels (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  stock_item_id uuid not null references public.vyron_cost_stock_items(id) on delete cascade,
  location text not null default '',
  minimum_qty numeric(18,6) not null,
  warning_qty numeric(18,6) null,
  critical_qty numeric(18,6) null,
  block_production boolean not null default false,
  created_by text not null,
  updated_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vyron_stock_minimum_levels_key unique (company_id, stock_item_id, location),
  constraint vyron_stock_minimum_levels_minimum check (minimum_qty >= 0),
  constraint vyron_stock_minimum_levels_warning check (warning_qty is null or warning_qty >= minimum_qty),
  constraint vyron_stock_minimum_levels_critical check (critical_qty is null or (critical_qty >= 0 and critical_qty <= minimum_qty))
);
alter table public.vyron_stock_minimum_levels enable row level security;

-- 3. Production cadence (optional) --------------------------------------------------------------
alter table public.vyron_inventory_settings
  add column if not exists expected_production_interval_hours numeric(10,2) null;

-- 4. Stock-take upload provenance ---------------------------------------------------------------
alter table public.vyron_cost_stock_counts
  add column if not exists source_file_name text null,
  add column if not exists source_sha256 text null;
create unique index if not exists idx_vyron_cost_stock_counts_source
  on public.vyron_cost_stock_counts (company_id, source_sha256)
  where source_sha256 is not null;

-- 5. Price-list enforcement ---------------------------------------------------------------------
alter table public.vyron_customer_price_lists
  add column if not exists is_company_default boolean not null default false;
create unique index if not exists idx_vyron_customer_price_lists_company_default
  on public.vyron_customer_price_lists (company_id)
  where is_company_default;

alter table public.vyron_customer_invoice_lines
  add column if not exists price_source text null,
  add column if not exists price_list_id uuid null;

select pg_notify('pgrst', 'reload schema');
