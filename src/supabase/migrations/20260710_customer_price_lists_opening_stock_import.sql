begin;

create table if not exists public.vyron_customer_price_lists (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.vyron_cost_companies(id) on delete cascade,
  list_name text not null,
  list_type text not null default 'Standard' check (list_type in ('Standard', 'Contract')),
  status text not null default 'Active' check (status in ('Active', 'Inactive')),
  effective_from date null,
  effective_to date null,
  version integer not null default 1,
  notes text null,
  created_by text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, list_name, version)
);

create index if not exists idx_vyron_customer_price_lists_company_status
  on public.vyron_customer_price_lists(company_id, status, list_type, created_at desc);

create table if not exists public.vyron_customer_price_list_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.vyron_cost_companies(id) on delete cascade,
  price_list_id uuid not null references public.vyron_customer_price_lists(id) on delete cascade,
  product_id uuid not null references public.vyron_cost_products(id) on delete cascade,
  base_price numeric(14,4) not null default 0,
  markup_pct numeric(8,4) not null default 0,
  discount_pct numeric(8,4) not null default 0,
  gp_pct numeric(8,4) not null default 0,
  override_price numeric(14,4) null,
  final_price numeric(14,4) not null default 0,
  status text not null default 'Active' check (status in ('Active', 'Inactive')),
  effective_from date null,
  effective_to date null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (base_price >= 0),
  check (markup_pct >= 0 and markup_pct <= 1000),
  check (discount_pct >= 0 and discount_pct <= 100),
  check (gp_pct >= 0 and gp_pct < 100),
  check (override_price is null or override_price >= 0),
  check (final_price >= 0),
  unique (price_list_id, product_id)
);

create index if not exists idx_vyron_customer_price_list_items_list_product
  on public.vyron_customer_price_list_items(price_list_id, product_id, status);

create index if not exists idx_vyron_customer_price_list_items_company_product
  on public.vyron_customer_price_list_items(company_id, product_id, status);

create table if not exists public.vyron_customer_price_list_assignments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.vyron_cost_companies(id) on delete cascade,
  customer_id uuid not null references public.vyron_customers(id) on delete cascade,
  default_price_list_id uuid null references public.vyron_customer_price_lists(id) on delete set null,
  contract_price_list_id uuid null references public.vyron_customer_price_lists(id) on delete set null,
  status text not null default 'Active' check (status in ('Active', 'Inactive')),
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, customer_id)
);

create index if not exists idx_vyron_customer_price_list_assignments_company_customer
  on public.vyron_customer_price_list_assignments(company_id, customer_id, status);

create table if not exists public.vyron_customer_price_list_versions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.vyron_cost_companies(id) on delete cascade,
  price_list_id uuid not null references public.vyron_customer_price_lists(id) on delete cascade,
  version integer not null,
  change_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_by text null,
  created_at timestamptz not null default now()
);

create index if not exists idx_vyron_customer_price_list_versions_list
  on public.vyron_customer_price_list_versions(price_list_id, version desc, created_at desc);

create table if not exists public.vyron_customer_price_list_audit_log (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.vyron_cost_companies(id) on delete cascade,
  price_list_id uuid null references public.vyron_customer_price_lists(id) on delete set null,
  price_list_item_id uuid null references public.vyron_customer_price_list_items(id) on delete set null,
  event_type text not null,
  actor text null,
  detail text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_vyron_customer_price_list_audit_company_created
  on public.vyron_customer_price_list_audit_log(company_id, created_at desc);

create table if not exists public.vyron_customer_price_list_import_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.vyron_cost_companies(id) on delete cascade,
  file_name text not null,
  status text not null default 'Completed' check (status in ('Completed', 'Partial', 'Failed')),
  total_rows integer not null default 0,
  imported_rows integer not null default 0,
  rejected_rows integer not null default 0,
  create_missing_products boolean not null default false,
  error_report jsonb not null default '[]'::jsonb,
  created_by text null,
  created_at timestamptz not null default now()
);

create index if not exists idx_vyron_customer_price_list_import_runs_company_created
  on public.vyron_customer_price_list_import_runs(company_id, created_at desc);

create table if not exists public.vyron_opening_stock_import_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.vyron_cost_companies(id) on delete cascade,
  file_name text not null,
  status text not null default 'Completed' check (status in ('Completed', 'Partial', 'Failed')),
  total_rows integer not null default 0,
  imported_rows integer not null default 0,
  rejected_rows integer not null default 0,
  error_report jsonb not null default '[]'::jsonb,
  created_by text null,
  created_at timestamptz not null default now()
);

create index if not exists idx_vyron_opening_stock_import_runs_company_created
  on public.vyron_opening_stock_import_runs(company_id, created_at desc);

select pg_notify('pgrst', 'reload schema');

commit;
