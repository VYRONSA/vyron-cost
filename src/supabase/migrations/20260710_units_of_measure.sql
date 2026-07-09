-- Units of Measure master data for tenant-scoped normalization.

create table if not exists public.vyron_cost_units_of_measure (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.vyron_cost_companies(id) on delete cascade,
  code text not null,
  name text not null,
  symbol text null,
  category text not null default 'General',
  decimal_precision integer not null default 2 check (decimal_precision between 0 and 6),
  is_active boolean not null default true,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.vyron_cost_units_of_measure
  add column if not exists company_id uuid,
  add column if not exists code text,
  add column if not exists name text,
  add column if not exists symbol text,
  add column if not exists category text,
  add column if not exists decimal_precision integer,
  add column if not exists is_active boolean,
  add column if not exists notes text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update public.vyron_cost_units_of_measure
set
  category = coalesce(category, 'General'),
  decimal_precision = coalesce(decimal_precision, 2),
  is_active = coalesce(is_active, true),
  updated_at = coalesce(updated_at, now())
where
  category is null
  or decimal_precision is null
  or is_active is null
  or updated_at is null;

alter table if exists public.vyron_cost_units_of_measure
  alter column company_id set not null,
  alter column code set not null,
  alter column name set not null,
  alter column category set not null,
  alter column decimal_precision set not null,
  alter column is_active set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where c.conname = 'vyron_cost_units_decimal_precision_check'
      and n.nspname = 'public'
      and t.relname = 'vyron_cost_units_of_measure'
  ) then
    alter table public.vyron_cost_units_of_measure
      add constraint vyron_cost_units_decimal_precision_check
      check (decimal_precision between 0 and 6);
  end if;
end $$;

create unique index if not exists idx_vyron_cost_uom_company_code_unique
  on public.vyron_cost_units_of_measure(company_id, lower(code));

create index if not exists idx_vyron_cost_uom_company_name
  on public.vyron_cost_units_of_measure(company_id, name);
