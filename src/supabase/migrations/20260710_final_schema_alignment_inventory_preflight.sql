-- Final stabilization schema alignment before Inventory phase
-- Additive-only: align currently expected stock count + finished goods fields.

begin;

create table if not exists public.vyron_cost_inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  transaction_number text not null,
  transaction_type text not null,
  entity_type text not null,
  entity_id uuid null,
  stock_item_id uuid null,
  quantity numeric(14,4) not null default 0,
  unit_cost numeric(14,4) not null default 0,
  total_cost numeric(14,2) not null default 0,
  reference_type text null,
  reference_id uuid null,
  notes text null,
  created_by text null,
  created_at timestamptz not null default now()
);

create unique index if not exists vyron_cost_inventory_transactions_company_number_uidx
  on public.vyron_cost_inventory_transactions (company_id, transaction_number);

create index if not exists vyron_cost_inventory_transactions_company_created_idx
  on public.vyron_cost_inventory_transactions (company_id, created_at desc);

create index if not exists vyron_cost_inventory_transactions_company_entity_idx
  on public.vyron_cost_inventory_transactions (company_id, entity_type, entity_id);

create index if not exists vyron_cost_inventory_transactions_reference_idx
  on public.vyron_cost_inventory_transactions (company_id, reference_type, reference_id);

create index if not exists vyron_cost_inventory_transactions_type_idx
  on public.vyron_cost_inventory_transactions (company_id, transaction_type, created_at desc);

do $$
begin
  if to_regclass('public.vyron_cost_inventory_transactions') is not null
     and to_regclass('public.vyron_cost_stock_items') is not null
     and not exists (
       select 1
       from pg_constraint c
       join pg_class t on t.oid = c.conrelid
       join pg_namespace n on n.oid = t.relnamespace
       where c.conname = 'vyron_cost_inventory_transactions_stock_item_fkey'
         and n.nspname = 'public'
         and t.relname = 'vyron_cost_inventory_transactions'
     ) then
    alter table public.vyron_cost_inventory_transactions
      add constraint vyron_cost_inventory_transactions_stock_item_fkey
      foreign key (stock_item_id)
      references public.vyron_cost_stock_items(id)
      on delete set null;
  end if;
end $$;

do $$
begin
  if to_regclass('public.vyron_cost_inventory_transactions') is not null
     and to_regclass('public.vyron_cost_companies') is not null
     and not exists (
       select 1
       from pg_constraint c
       join pg_class t on t.oid = c.conrelid
       join pg_namespace n on n.oid = t.relnamespace
       where c.conname = 'vyron_cost_inventory_transactions_company_fkey'
         and n.nspname = 'public'
         and t.relname = 'vyron_cost_inventory_transactions'
     ) then
    alter table public.vyron_cost_inventory_transactions
      add constraint vyron_cost_inventory_transactions_company_fkey
      foreign key (company_id)
      references public.vyron_cost_companies(id)
      on delete cascade;
  end if;
end $$;

alter table if exists public.vyron_cost_stock_counts
  add column if not exists created_by text null,
  add column if not exists variance_value_total numeric(14,2) not null default 0;

alter table if exists public.vyron_cost_stock_count_lines
  add column if not exists variance_pct numeric(8,4) not null default 0,
  add column if not exists system_qty numeric(14,4) not null default 0;

-- If historical lines predate system_qty, initialize from counted_qty to preserve zero-variance intent.
update public.vyron_cost_stock_count_lines
set system_qty = counted_qty
where system_qty is null
  and counted_qty is not null;

-- Recompute header variance totals from detail lines where available.
update public.vyron_cost_stock_counts c
set variance_value_total = coalesce(s.total_variance, 0)
from (
  select stock_count_id, sum(coalesce(variance_value, 0)) as total_variance
  from public.vyron_cost_stock_count_lines
  group by stock_count_id
) s
where c.id = s.stock_count_id;

alter table if exists public.vyron_finished_goods
  add column if not exists selling_price numeric(18,4) not null default 0;

commit;
