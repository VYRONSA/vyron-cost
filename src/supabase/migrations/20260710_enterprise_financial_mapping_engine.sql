-- Enterprise Financial Mapping Engine

create table if not exists public.vyron_financial_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null,
  company_id uuid not null,
  integration_type text not null default 'XERO' check (integration_type in ('XERO','SAGE','BUSINESS_CENTRAL','SAP','NETSUITE','QUICKBOOKS')),
  external_account_id text not null,
  account_code text not null,
  account_name text not null,
  account_type text not null,
  tax_type text null,
  status text not null default 'ACTIVE',
  enable_payments boolean not null default false,
  show_in_expense_claims boolean not null default false,
  updated_date timestamptz not null default now(),
  last_synced timestamptz not null default now()
);

create unique index if not exists vyron_financial_accounts_unique_external
  on public.vyron_financial_accounts (workspace_id, company_id, integration_type, external_account_id);

create index if not exists vyron_financial_accounts_company_lookup
  on public.vyron_financial_accounts (company_id, integration_type, account_code);

create table if not exists public.vyron_company_financial_settings (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null,
  company_id uuid not null unique,
  integration_type text not null default 'XERO' check (integration_type in ('XERO','SAGE','BUSINESS_CENTRAL','SAP','NETSUITE','QUICKBOOKS')),
  default_sales_account_id uuid null references public.vyron_financial_accounts(id) on delete set null,
  default_cost_of_sales_account_id uuid null references public.vyron_financial_accounts(id) on delete set null,
  default_inventory_asset_account_id uuid null references public.vyron_financial_accounts(id) on delete set null,
  default_wip_account_id uuid null references public.vyron_financial_accounts(id) on delete set null,
  default_manufacturing_variance_account_id uuid null references public.vyron_financial_accounts(id) on delete set null,
  default_stock_adjustment_account_id uuid null references public.vyron_financial_accounts(id) on delete set null,
  default_freight_income_account_id uuid null references public.vyron_financial_accounts(id) on delete set null,
  default_freight_expense_account_id uuid null references public.vyron_financial_accounts(id) on delete set null,
  default_vat_tax_type text null,
  tracking_categories jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  last_synced timestamptz null
);

alter table if exists public.vyron_cost_categories
  add column if not exists financial_sales_account_id uuid null references public.vyron_financial_accounts(id) on delete set null,
  add column if not exists financial_cost_of_sales_account_id uuid null references public.vyron_financial_accounts(id) on delete set null,
  add column if not exists financial_inventory_asset_account_id uuid null references public.vyron_financial_accounts(id) on delete set null,
  add column if not exists financial_wip_account_id uuid null references public.vyron_financial_accounts(id) on delete set null,
  add column if not exists financial_manufacturing_variance_account_id uuid null references public.vyron_financial_accounts(id) on delete set null,
  add column if not exists financial_stock_adjustment_account_id uuid null references public.vyron_financial_accounts(id) on delete set null,
  add column if not exists financial_freight_income_account_id uuid null references public.vyron_financial_accounts(id) on delete set null,
  add column if not exists financial_freight_expense_account_id uuid null references public.vyron_financial_accounts(id) on delete set null,
  add column if not exists financial_vat_tax_type text null,
  add column if not exists financial_tracking_categories jsonb not null default '{}'::jsonb;

alter table if exists public.vyron_cost_products
  add column if not exists financial_sales_account_id uuid null references public.vyron_financial_accounts(id) on delete set null,
  add column if not exists financial_cost_of_sales_account_id uuid null references public.vyron_financial_accounts(id) on delete set null,
  add column if not exists financial_inventory_asset_account_id uuid null references public.vyron_financial_accounts(id) on delete set null,
  add column if not exists financial_wip_account_id uuid null references public.vyron_financial_accounts(id) on delete set null,
  add column if not exists financial_manufacturing_variance_account_id uuid null references public.vyron_financial_accounts(id) on delete set null,
  add column if not exists financial_stock_adjustment_account_id uuid null references public.vyron_financial_accounts(id) on delete set null,
  add column if not exists financial_freight_income_account_id uuid null references public.vyron_financial_accounts(id) on delete set null,
  add column if not exists financial_freight_expense_account_id uuid null references public.vyron_financial_accounts(id) on delete set null,
  add column if not exists financial_vat_tax_type text null;

create index if not exists vyron_cost_categories_financial_lookup
  on public.vyron_cost_categories (company_id, category_name, category_type);

create index if not exists vyron_cost_products_financial_lookup
  on public.vyron_cost_products (company_id, id, product_category, category);
