-- Phase 8.5 targeted schema alignment
-- Additive-only migration for known drifted columns.

begin;

alter table if exists public.vyron_cost_stock_counts
  add column if not exists count_type text not null default 'Full';

alter table if exists public.vyron_cost_stock_count_lines
  add column if not exists stock_item_id uuid;

-- Backfill from legacy column when available.
update public.vyron_cost_stock_count_lines
set stock_item_id = item_id::uuid
where stock_item_id is null
  and item_id is not null
  and item_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';

do $$
begin
  if to_regclass('public.vyron_cost_stock_count_lines') is not null
     and not exists (
       select 1
       from pg_constraint c
       join pg_class t on t.oid = c.conrelid
       join pg_namespace n on n.oid = t.relnamespace
       where c.conname = 'vyron_cost_stock_count_lines_stock_item_id_fkey'
         and n.nspname = 'public'
         and t.relname = 'vyron_cost_stock_count_lines'
     ) then
    alter table public.vyron_cost_stock_count_lines
      add constraint vyron_cost_stock_count_lines_stock_item_id_fkey
      foreign key (stock_item_id)
      references public.vyron_cost_stock_items(id)
      on delete set null;
  end if;
end $$;

create index if not exists idx_vyron_cost_stock_count_lines_stock_item_id
  on public.vyron_cost_stock_count_lines(stock_item_id);

alter table if exists public.vyron_finished_goods
  add column if not exists product_code text;

commit;
