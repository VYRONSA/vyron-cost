-- Restore managed migration coverage for inventory runtime audit table.
-- This table is written by writeInventoryAudit() in inventory and customer invoice flows.

begin;

create table if not exists public.vyron_inventory_audit_log (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.vyron_cost_companies(id) on delete cascade,
  stock_item_id uuid references public.vyron_cost_stock_items(id) on delete set null,
  event_type text not null,
  actor text,
  field_name text,
  old_value text,
  new_value text,
  detail text,
  reference_type text,
  reference_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table if exists public.vyron_inventory_audit_log
  add column if not exists company_id uuid,
  add column if not exists stock_item_id uuid,
  add column if not exists event_type text,
  add column if not exists actor text,
  add column if not exists field_name text,
  add column if not exists old_value text,
  add column if not exists new_value text,
  add column if not exists detail text,
  add column if not exists reference_type text,
  add column if not exists reference_id uuid,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where c.conname = 'vyron_inventory_audit_log_company_fkey'
      and n.nspname = 'public'
      and t.relname = 'vyron_inventory_audit_log'
  ) then
    alter table public.vyron_inventory_audit_log
      add constraint vyron_inventory_audit_log_company_fkey
      foreign key (company_id)
      references public.vyron_cost_companies(id)
      on delete cascade;
  end if;

  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where c.conname = 'vyron_inventory_audit_log_stock_item_fkey'
      and n.nspname = 'public'
      and t.relname = 'vyron_inventory_audit_log'
  ) then
    alter table public.vyron_inventory_audit_log
      add constraint vyron_inventory_audit_log_stock_item_fkey
      foreign key (stock_item_id)
      references public.vyron_cost_stock_items(id)
      on delete set null;
  end if;
end $$;

create index if not exists idx_vyron_inventory_audit_company
  on public.vyron_inventory_audit_log(company_id, created_at desc);

create index if not exists idx_vyron_inventory_audit_stock_item
  on public.vyron_inventory_audit_log(stock_item_id, created_at desc);

create index if not exists idx_vyron_inventory_audit_reference
  on public.vyron_inventory_audit_log(company_id, reference_type, reference_id, created_at desc);

alter table if exists public.vyron_cost_products
  add column if not exists sku text;

create index if not exists idx_vyron_cost_products_company_sku
  on public.vyron_cost_products(company_id, sku);

commit;
