-- Contact Intelligence Foundation: unified contact master

create table if not exists public.vyron_contacts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  contact_name text not null,
  email text null,
  phone text null,
  xero_contact_id text null,
  is_customer boolean not null default false,
  is_supplier boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists vyron_contacts_company_id_idx
  on public.vyron_contacts (company_id);

create unique index if not exists vyron_contacts_company_xero_contact_id_uidx
  on public.vyron_contacts (company_id, xero_contact_id)
  where xero_contact_id is not null;
