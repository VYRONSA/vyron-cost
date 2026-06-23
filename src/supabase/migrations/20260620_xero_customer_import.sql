-- Xero customer import: link vyron_customers to Xero Contacts

alter table if exists public.vyron_customers
  add column if not exists xero_contact_id text null,
  add column if not exists xero_contact_status text null,
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists vyron_customers_company_xero_contact_id_uidx
  on public.vyron_customers (company_id, xero_contact_id)
  where xero_contact_id is not null;
