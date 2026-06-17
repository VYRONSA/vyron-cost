-- Customer invoice stock reversal tracking
alter table if exists public.vyron_customer_invoices
  add column if not exists stock_reversed boolean not null default false,
  add column if not exists stock_reversed_at timestamptz null;
