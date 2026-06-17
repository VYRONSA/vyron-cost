-- Customer master extended fields for go-live
alter table if exists public.vyron_customers
  add column if not exists category text null,
  add column if not exists invoice_email text null,
  add column if not exists terms text null default '30 Days',
  add column if not exists vat_number text null,
  add column if not exists status text null default 'Active';
