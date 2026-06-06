-- Xero workspace settings per client/company workspace
create table if not exists public.vyron_xero_workspace_settings (
  workspace_id text primary key,
  connection jsonb not null default '{}'::jsonb,
  account_mapping jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table if exists public.vyron_xero_sync_queue
  add column if not exists last_attempt_at timestamptz null;

update public.vyron_xero_sync_queue
set last_attempt_at = coalesce(updated_at, created_at)
where last_attempt_at is null;
