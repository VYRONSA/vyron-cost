-- Go-live foundation: import audit, multi-company links

create table if not exists public.vyron_import_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.vyron_cost_companies(id) on delete cascade,
  entity_type text not null,
  file_name text not null,
  valid_rows int not null default 0,
  rejected_rows int not null default 0,
  status text not null default 'Completed',
  error_report jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_vyron_import_runs_company on public.vyron_import_runs(company_id);

alter table if exists public.vyron_cost_companies
  add column if not exists group_parent_id uuid references public.vyron_cost_companies(id);

create table if not exists public.vyron_company_group_links (
  id uuid primary key default gen_random_uuid(),
  parent_company_id uuid not null references public.vyron_cost_companies(id) on delete cascade,
  child_company_id uuid not null references public.vyron_cost_companies(id) on delete cascade,
  relationship_type text not null default 'subsidiary',
  created_at timestamptz not null default now(),
  unique (parent_company_id, child_company_id)
);

alter table if exists public.vyron_workspaces
  add column if not exists is_group_primary boolean not null default true;
