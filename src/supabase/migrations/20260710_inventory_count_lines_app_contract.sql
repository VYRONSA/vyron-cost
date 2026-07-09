begin;

alter table if exists public.vyron_cost_stock_count_lines
  add column if not exists company_id uuid,
  add column if not exists system_qty numeric(14,4) not null default 0,
  add column if not exists variance_pct numeric(10,4) not null default 0,
  add column if not exists variance_class text not null default 'minor',
  add column if not exists unit_cost numeric(14,4) not null default 0,
  add column if not exists approved boolean not null default false,
  add column if not exists created_at timestamptz not null default now();

update public.vyron_cost_stock_count_lines line
set company_id = count_header.company_id
from public.vyron_cost_stock_counts count_header
where line.stock_count_id = count_header.id
  and line.company_id is null;

do $$
begin
  if to_regclass('public.vyron_cost_stock_count_lines') is not null
     and to_regclass('public.vyron_cost_companies') is not null
     and not exists (
       select 1
       from pg_constraint c
       join pg_class t on t.oid = c.conrelid
       join pg_namespace n on n.oid = t.relnamespace
       where c.conname = 'vyron_cost_stock_count_lines_company_fkey'
         and n.nspname = 'public'
         and t.relname = 'vyron_cost_stock_count_lines'
     ) then
    alter table public.vyron_cost_stock_count_lines
      add constraint vyron_cost_stock_count_lines_company_fkey
      foreign key (company_id)
      references public.vyron_cost_companies(id)
      on delete cascade;
  end if;

  if to_regclass('public.vyron_cost_stock_count_lines') is not null
     and to_regclass('public.vyron_cost_stock_items') is not null
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
      on delete cascade;
  end if;
end $$;

create index if not exists idx_vyron_cost_stock_count_lines_company_count
  on public.vyron_cost_stock_count_lines(company_id, stock_count_id);

create index if not exists idx_vyron_cost_stock_count_lines_stock_item_id
  on public.vyron_cost_stock_count_lines(stock_item_id);

commit;