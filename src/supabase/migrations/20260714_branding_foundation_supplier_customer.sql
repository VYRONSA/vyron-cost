-- Branding Foundation: complete the company/supplier/customer branding data model so the
-- shared Document Engine can render logo, website, VAT/registration numbers, and addresses
-- without any field being silently discarded by the branding update path.

begin;

-- Company: BrandingRepository already reads/writes these exact column names
-- (see mapBranding/updateByWorkspaceId in src/lib/platform/branding/BrandingRepository.ts) —
-- they were simply missing from the table, causing filterPayloadByKnownColumns to drop them.
alter table if exists public.vyron_cost_companies
  add column if not exists logo_url text,
  add column if not exists website text,
  add column if not exists vat_number text,
  add column if not exists registration_number text,
  add column if not exists physical_address text,
  add column if not exists postal_address text;

-- Supplier branding fields.
alter table if exists public.vyron_cost_suppliers
  add column if not exists vat_number text,
  add column if not exists registration_number text,
  add column if not exists physical_address text,
  add column if not exists postal_address text,
  add column if not exists website text;

-- Customer branding fields.
alter table if exists public.vyron_customers
  add column if not exists registration_number text,
  add column if not exists billing_address text,
  add column if not exists website text;

commit;
