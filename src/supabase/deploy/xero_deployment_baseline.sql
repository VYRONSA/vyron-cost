-- VYRON COST — Xero deployment baseline
-- Run once in Supabase SQL Editor (https://ldnrmgafsquzfitcuvxq.supabase.co)
-- Safe to re-run: uses IF NOT EXISTS / IF EXISTS throughout.

-- ---------------------------------------------------------------------------
-- 1. Customer invoice extensions (if customer tables already exist)
-- ---------------------------------------------------------------------------
alter table if exists public.vyron_customer_invoices
  add column if not exists stock_posted boolean not null default false,
  add column if not exists posted_at timestamptz null,
  add column if not exists notes text null;

alter table if exists public.vyron_customer_invoices
  drop constraint if exists vyron_customer_invoices_status_check;

alter table if exists public.vyron_customer_invoices
  add constraint vyron_customer_invoices_status_check
  check (status in ('Draft','Approved','Posted','Sent','Paid','Cancelled'));

alter table if exists public.vyron_customers
  add column if not exists total_sales numeric(18,2) not null default 0,
  add column if not exists last_invoice_date date null,
  add column if not exists invoice_count integer not null default 0,
  add column if not exists average_invoice_value numeric(18,2) not null default 0;

alter table if exists public.vyron_finished_goods
  add column if not exists current_stock numeric(18,4) not null default 0,
  add column if not exists stock_value numeric(18,2) not null default 0;

-- ---------------------------------------------------------------------------
-- 2. Xero sync queue
-- ---------------------------------------------------------------------------
create table if not exists public.vyron_xero_sync_queue (
  id uuid primary key default gen_random_uuid(),
  company_id uuid null,
  entity_type text not null,
  entity_id uuid null,
  reference_number text not null,
  destination text not null,
  status text not null default 'Ready' check (status in ('Ready','Synced','Needs Review','Failed')),
  payload jsonb not null default '{}'::jsonb,
  xero_id text null,
  error_message text null,
  synced_at timestamptz null,
  last_attempt_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.vyron_xero_sync_queue
  add column if not exists last_attempt_at timestamptz null;

create index if not exists idx_vyron_xero_sync_queue_status on public.vyron_xero_sync_queue(status);
create index if not exists idx_vyron_xero_sync_queue_ref on public.vyron_xero_sync_queue(reference_number);

update public.vyron_xero_sync_queue
set last_attempt_at = coalesce(updated_at, created_at)
where last_attempt_at is null;

-- ---------------------------------------------------------------------------
-- 3. Xero workspace settings (per client workspace)
-- ---------------------------------------------------------------------------
create table if not exists public.vyron_xero_workspace_settings (
  workspace_id text primary key,
  connection jsonb not null default '{}'::jsonb,
  account_mapping jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Optional: allow service role full access (adjust RLS policies for your tenant model)
-- alter table public.vyron_xero_sync_queue enable row level security;
-- alter table public.vyron_xero_workspace_settings enable row level security;
