begin;

-- Repoint legacy invoice-line product_id values from finished_goods.id to canonical products.id.
do $$
begin
  if to_regclass('public.vyron_finished_goods') is not null
     and exists (
       select 1
       from information_schema.columns
       where table_schema = 'public'
         and table_name = 'vyron_finished_goods'
         and column_name = 'product_id'
     ) then
    update public.vyron_customer_invoice_lines l
    set product_id = fg.product_id
    from public.vyron_finished_goods fg
    where l.product_id = fg.id
      and fg.product_id is not null;
  end if;
end $$;

-- Repoint legacy stock items used by invoice product picker to canonical products.id.
do $$
begin
  if to_regclass('public.vyron_finished_goods') is not null
     and to_regclass('public.vyron_cost_stock_items') is not null
     and exists (
       select 1
       from information_schema.columns
       where table_schema = 'public'
         and table_name = 'vyron_finished_goods'
         and column_name = 'product_id'
     ) then
    update public.vyron_cost_stock_items s
    set entity_id = fg.product_id,
        updated_at = now()
    from public.vyron_finished_goods fg
    where s.entity_type = 'finished_goods'
      and s.entity_id = fg.id
      and fg.product_id is not null;
  end if;
end $$;

-- Fail fast if non-canonical invoice product ids still exist.
do $$
declare
  invalid_count bigint;
begin
  select count(*)
  into invalid_count
  from public.vyron_customer_invoice_lines l
  where l.product_id is not null
    and not exists (
      select 1
      from public.vyron_cost_products p
      where p.id = l.product_id
    );

  if invalid_count > 0 then
    raise exception 'Cannot enforce invoice product FK: % invoice line(s) still reference non-canonical product_id values.', invalid_count;
  end if;
end $$;

-- Ensure product_id FK references canonical products table.
do $$
declare
  fk_row record;
begin
  for fk_row in
    select c.conname
    from pg_constraint c
    join pg_class rel on rel.oid = c.conrelid
    join pg_namespace ns on ns.oid = rel.relnamespace
    join pg_class ref on ref.oid = c.confrelid
    join pg_namespace ns_ref on ns_ref.oid = ref.relnamespace
    join unnest(c.conkey) with ordinality as cols(attnum, ord) on true
    join pg_attribute a on a.attrelid = rel.oid and a.attnum = cols.attnum
    where ns.nspname = 'public'
      and rel.relname = 'vyron_customer_invoice_lines'
      and c.contype = 'f'
      and a.attname = 'product_id'
      and (ns_ref.nspname <> 'public' or ref.relname <> 'vyron_cost_products')
  loop
    execute format('alter table public.vyron_customer_invoice_lines drop constraint %I', fk_row.conname);
  end loop;

  if not exists (
    select 1
    from pg_constraint c
    join pg_class rel on rel.oid = c.conrelid
    join pg_namespace ns on ns.oid = rel.relnamespace
    where ns.nspname = 'public'
      and rel.relname = 'vyron_customer_invoice_lines'
      and c.conname = 'vyron_customer_invoice_lines_product_id_fkey'
  ) then
    alter table public.vyron_customer_invoice_lines
      add constraint vyron_customer_invoice_lines_product_id_fkey
      foreign key (product_id)
      references public.vyron_cost_products(id)
      on delete set null;
  end if;
end $$;

create index if not exists idx_vyron_customer_invoice_lines_product_id
  on public.vyron_customer_invoice_lines(product_id);

commit;
