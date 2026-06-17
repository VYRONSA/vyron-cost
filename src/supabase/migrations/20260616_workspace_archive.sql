-- Workspace archive support for Client Directory

alter table if exists public.vyron_workspaces
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by text;

alter table if exists public.vyron_workspaces
  drop constraint if exists vyron_workspaces_status_check;

alter table if exists public.vyron_workspaces
  add constraint vyron_workspaces_status_check
  check (status in ('Live', 'Demo', 'Setup', 'Suspended', 'Archived'));
