-- Intelligent Item Lookup: search fields for the shared platform item picker.
-- Adds the fields requested by the VYRON COST item-lookup spec (barcode, supplier/customer
-- item codes, aliases, active flag, default warehouse) to the unifying stock master table,
-- and indexes them for fast partial-text search from /api/item-lookup/search.

begin;

alter table if exists public.vyron_cost_stock_items
  add column if not exists barcode text,
  add column if not exists supplier_item_code text,
  add column if not exists customer_item_code text,
  add column if not exists aliases text[] not null default '{}'::text[],
  add column if not exists is_active boolean not null default true,
  add column if not exists default_warehouse text;

create index if not exists idx_vyron_stock_items_barcode
  on public.vyron_cost_stock_items(company_id, barcode);

create index if not exists idx_vyron_stock_items_supplier_item_code
  on public.vyron_cost_stock_items(company_id, supplier_item_code);

create index if not exists idx_vyron_stock_items_customer_item_code
  on public.vyron_cost_stock_items(company_id, customer_item_code);

create index if not exists idx_vyron_stock_items_active
  on public.vyron_cost_stock_items(company_id, is_active);

-- Trigram search across code/description/barcode/aliases requires pg_trgm; enable if available,
-- fall back to plain btree indexes (already added above) when the extension can't be created.
do $$
begin
  create extension if not exists pg_trgm;
exception when insufficient_privilege then
  raise notice 'pg_trgm extension could not be created (insufficient privilege) - skipping trigram indexes.';
end $$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_trgm') then
    create index if not exists idx_vyron_stock_items_item_code_trgm
      on public.vyron_cost_stock_items using gin (item_code gin_trgm_ops);
    create index if not exists idx_vyron_stock_items_description_trgm
      on public.vyron_cost_stock_items using gin (description gin_trgm_ops);
  end if;
end $$;

commit;
