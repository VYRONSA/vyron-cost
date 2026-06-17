-- Client admin: extended roles, member permissions, company setup fields

alter table if exists public.vyron_workspaces
  add column if not exists vat_number text,
  add column if not exists registration_number text,
  add column if not exists physical_address text,
  add column if not exists postal_address text,
  add column if not exists default_vat_rate numeric default 15,
  add column if not exists xero_status text default 'Not Connected',
  add column if not exists enabled_modules jsonb;

alter table if exists public.vyron_workspace_memberships
  add column if not exists permissions jsonb not null default '{}'::jsonb;

alter table if exists public.vyron_workspace_memberships
  drop constraint if exists vyron_workspace_memberships_role_check;

alter table if exists public.vyron_workspace_memberships
  add constraint vyron_workspace_memberships_role_check
  check (role in (
    'OWNER', 'ADMIN', 'SUPERVISOR', 'MANAGER',
    'PROCUREMENT', 'PRODUCTION', 'INVENTORY', 'SALES', 'VIEW_ONLY', 'USER'
  ));
