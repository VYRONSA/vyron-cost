-- Workspace primary administrator / owner login details

alter table if exists public.vyron_workspaces
  add column if not exists owner_first_name text,
  add column if not exists owner_surname text,
  add column if not exists owner_email text,
  add column if not exists owner_mobile text,
  add column if not exists owner_login_method text check (owner_login_method in ('invite', 'password')),
  add column if not exists owner_login_status text not null default 'pending_activation'
    check (owner_login_status in ('active', 'invited', 'pending_activation'));
