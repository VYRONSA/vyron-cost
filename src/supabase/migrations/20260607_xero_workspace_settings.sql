-- Xero workspace settings + sync queue (safe if 20260606 was not run yet)

create table if not exists public.vyron_xero_workspace_settings (
  workspace_id text primary key,
  connection jsonb not null default '{}'::jsonb,
  account_mapping jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

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
