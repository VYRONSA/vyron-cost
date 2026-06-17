-- Allow disabled owner login status

alter table if exists public.vyron_workspaces
  drop constraint if exists vyron_workspaces_owner_login_status_check;

alter table if exists public.vyron_workspaces
  add constraint vyron_workspaces_owner_login_status_check
  check (owner_login_status in ('active', 'invited', 'pending_activation', 'disabled'));
