-- Category register for master data imports and CategoriesManager

create table if not exists public.vyron_cost_categories (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  category_name text not null,
  category_type text not null default 'Product',
  description text null,
  status text not null default 'Active',
  created_at timestamptz not null default now()
);

create unique index if not exists vyron_cost_categories_company_name_type_uidx
  on public.vyron_cost_categories (company_id, category_name, category_type);

create index if not exists vyron_cost_categories_company_id_idx
  on public.vyron_cost_categories (company_id);
