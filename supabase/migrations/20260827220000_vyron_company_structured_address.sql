-- VYRON COST — structured company address and payment instructions
--
-- WHY THESE COLUMNS DO NOT ALREADY EXIST
-- vyron_workspaces holds physical_address and postal_address as single free-text
-- columns, and those are what the Stage 4 invoice validation and the Stage 5 PDF
-- read. CompanyBranding exposes city / province / country / postalCode, which
-- looks like structured address already exists — it does not. BrandingRepository
-- writes those to vyron_cost_companies through filterPayloadByKnownColumns,
-- which drops any key the target row does not have, and vyron_cost_companies has
-- no such columns. Those branding inputs currently persist nowhere. So nothing
-- here duplicates a working field.
--
-- WHAT STAYS AUTHORITATIVE
-- physical_address and postal_address remain the canonical values. Invoices keep
-- reading them and nothing downstream changes. The parts below are the capture
-- format: the application composes them into the canonical column on save. A
-- workspace that only ever had free text keeps it, editable, with empty parts —
-- the structure is not guessed at from a string nobody wrote in that shape.

alter table public.vyron_workspaces
  -- Physical (street) address
  add column if not exists physical_line1 text,
  add column if not exists physical_line2 text,
  add column if not exists physical_suburb text,
  add column if not exists physical_city text,
  add column if not exists physical_province text,
  add column if not exists physical_postal_code text,
  add column if not exists physical_country text,
  -- Postal address
  add column if not exists postal_line1 text,
  add column if not exists postal_line2 text,
  add column if not exists postal_suburb text,
  add column if not exists postal_city text,
  add column if not exists postal_province text,
  add column if not exists postal_postal_code text,
  add column if not exists postal_country text,
  -- Free-text instruction printed with the banking block, e.g. how the customer
  -- should reference a payment. Distinct from the account fields themselves.
  add column if not exists bank_payment_reference text;

comment on column public.vyron_workspaces.physical_address is
  'Canonical physical address used on invoices. Composed from the physical_* parts on save; free text is preserved where no parts were captured.';
comment on column public.vyron_workspaces.physical_line1 is
  'Capture format for physical_address. The composed physical_address column is what documents read.';
comment on column public.vyron_workspaces.bank_payment_reference is
  'Payment instruction shown with the banking details, e.g. what reference to quote.';
