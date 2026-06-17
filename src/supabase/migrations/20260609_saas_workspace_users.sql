-- VYRON COST SaaS — workspaces, user profiles, memberships

alter table if exists public.vyron_cost_companies
  add column if not exists trading_name text,
  add column if not exists contact_email text,
  add column if not exists phone text,
  add column if not exists subscription_plan text default 'Professional',
  add column if not exists subscription_status text default 'Setup';

create table if not exists public.vyron_workspaces (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.vyron_cost_companies(id) on delete cascade,
  company_name text not null,
  trading_name text not null,
  package_name text not null default 'Professional',
  status text not null default 'Setup' check (status in ('Live', 'Demo', 'Setup', 'Suspended')),
  user_limit int not null default 5,
  contact_email text,
  phone text,
  owner_user_id uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vyron_user_profiles (
  id uuid primary key,
  email text not null unique,
  first_name text not null,
  surname text not null,
  mobile text,
  status text not null default 'Active' check (status in ('Active', 'Disabled', 'Invited')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vyron_workspace_memberships (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.vyron_workspaces(id) on delete cascade,
  user_id uuid not null references public.vyron_user_profiles(id) on delete cascade,
  role text not null check (role in ('OWNER', 'ADMIN', 'MANAGER', 'USER')),
  status text not null default 'Active' check (status in ('Active', 'Disabled', 'Invited')),
  invited_at timestamptz null,
  joined_at timestamptz null,
  created_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);

create index if not exists idx_vyron_workspaces_company on public.vyron_workspaces(company_id);
create index if not exists idx_vyron_workspaces_status on public.vyron_workspaces(status);
create index if not exists idx_vyron_workspace_memberships_workspace on public.vyron_workspace_memberships(workspace_id);
create index if not exists idx_vyron_workspace_memberships_user on public.vyron_workspace_memberships(user_id);
