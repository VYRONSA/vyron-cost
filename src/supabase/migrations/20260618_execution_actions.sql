-- Execution Centre: persisted intelligence actions with human approval workflow

create table if not exists public.execution_actions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.vyron_cost_companies(id) on delete cascade,
  workspace_id text not null,
  source_module text not null check (
    source_module in ('actions-centre', 'decisions-centre', 'root-cause-centre')
  ),
  source_key text not null,
  title text not null,
  category text not null,
  priority text not null,
  owner text not null,
  status text not null default 'Recommended' check (
    status in ('Recommended', 'Approved', 'In Progress', 'Completed', 'Cancelled')
  ),
  due_date date,
  expected_outcome text not null default '',
  expected_benefit numeric(14, 2),
  actual_benefit numeric(14, 2),
  completion_notes text,
  notes text,
  href text,
  source_trace jsonb not null default '[]'::jsonb,
  approved_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, source_module, source_key)
);

create index if not exists idx_execution_actions_company_status
  on public.execution_actions(company_id, status);

create index if not exists idx_execution_actions_company_due
  on public.execution_actions(company_id, due_date);

create index if not exists idx_execution_actions_workspace
  on public.execution_actions(workspace_id);

alter table public.execution_actions enable row level security;

drop policy if exists "demo read execution_actions" on public.execution_actions;
drop policy if exists "demo write execution_actions" on public.execution_actions;

create policy "demo read execution_actions"
  on public.execution_actions for select using (true);

create policy "demo write execution_actions"
  on public.execution_actions for all using (true) with check (true);
