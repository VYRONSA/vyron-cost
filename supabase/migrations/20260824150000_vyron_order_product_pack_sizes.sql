-- VYRON ORDER — structured product pack sizes.
--
-- VYRON COST has no pack-size field: packaging_cost is a cost, and
-- vyron_cost_units_of_measure is empty. Customers order pies by the box, so the
-- conversion has to live somewhere real rather than being inferred from a
-- product name or weight at render time.
--
-- A row here means "this product is sold in boxes of N units, and here is the
-- evidence". Absence of a row means the product is ordered in units — that is a
-- valid, permanent state, not a gap to be filled with a guess.
--
-- company_id is a logical tenant key, not a foreign key, for the same reason as
-- the portal identity tables: live tenants carry a company_id with no matching
-- vyron_cost_companies row.
--
-- Rollback:
--   drop table if exists public.vyron_cost_product_pack_sizes;

create table if not exists public.vyron_cost_product_pack_sizes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  product_id uuid not null references public.vyron_cost_products(id) on delete cascade,
  units_per_box integer not null,
  /** Where the figure came from, so a wrong conversion can be traced. */
  evidence_source text not null,
  evidence_detail text,
  confidence text not null default 'Confirmed',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vyron_cost_product_pack_sizes_units_positive
    check (units_per_box > 0),
  constraint vyron_cost_product_pack_sizes_confidence_check
    check (confidence in ('Confirmed', 'Provisional')),
  constraint vyron_cost_product_pack_sizes_product_unique
    unique (product_id)
);

create index if not exists idx_vyron_cost_product_pack_sizes_company
  on public.vyron_cost_product_pack_sizes (company_id);

-- Read by server code through the service role, which bypasses RLS. Enabling
-- RLS with no policy denies anon and authenticated clients by default.
alter table public.vyron_cost_product_pack_sizes enable row level security;
