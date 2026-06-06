-- VYRON COST — Recovery Intelligence V3 (Tracking Engine)
-- Run after: recovery-intelligence-v2.sql and recovery-intelligence-v2-cfo-filter.sql

create table if not exists public.vyron_recovery_tracking (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.vyron_cost_companies(id) on delete cascade,
  opportunity_key text not null,
  status text not null default 'New',
  owner_name text,
  owner_email text,
  due_date date,
  action_taken boolean not null default false,
  action_taken_at timestamptz,
  notes text,
  potential_recovery numeric(14,2) not null default 0,
  actual_recovery numeric(14,2) not null default 0,
  recovery_date date,
  recovery_method text,
  recovery_evidence text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, opportunity_key)
);

create table if not exists public.vyron_recovery_evidence (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.vyron_cost_companies(id) on delete cascade,
  opportunity_key text not null,
  evidence_type text not null,
  title text not null,
  content text,
  document_url text,
  created_by text,
  created_at timestamptz not null default now()
);

create table if not exists public.vyron_recovery_audit_trail (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.vyron_cost_companies(id) on delete cascade,
  opportunity_key text not null,
  changed_by text,
  changed_at timestamptz not null default now(),
  field_name text not null,
  old_value text,
  new_value text
);

drop trigger if exists trg_vyron_recovery_tracking_updated_at on public.vyron_recovery_tracking;
create trigger trg_vyron_recovery_tracking_updated_at
  before update on public.vyron_recovery_tracking
  for each row execute function public.vyron_set_updated_at();

create index if not exists idx_vyron_recovery_tracking_status
  on public.vyron_recovery_tracking(tenant_id, status, updated_at desc);

create index if not exists idx_vyron_recovery_evidence_lookup
  on public.vyron_recovery_evidence(tenant_id, opportunity_key, created_at desc);

create index if not exists idx_vyron_recovery_audit_lookup
  on public.vyron_recovery_audit_trail(tenant_id, opportunity_key, changed_at desc);

alter table public.vyron_recovery_tracking enable row level security;
alter table public.vyron_recovery_evidence enable row level security;
alter table public.vyron_recovery_audit_trail enable row level security;

drop policy if exists "demo read vyron_recovery_tracking" on public.vyron_recovery_tracking;
drop policy if exists "demo write vyron_recovery_tracking" on public.vyron_recovery_tracking;
drop policy if exists "demo read vyron_recovery_evidence" on public.vyron_recovery_evidence;
drop policy if exists "demo write vyron_recovery_evidence" on public.vyron_recovery_evidence;
drop policy if exists "demo read vyron_recovery_audit_trail" on public.vyron_recovery_audit_trail;
drop policy if exists "demo write vyron_recovery_audit_trail" on public.vyron_recovery_audit_trail;

create policy "demo read vyron_recovery_tracking"
  on public.vyron_recovery_tracking for select using (true);
create policy "demo write vyron_recovery_tracking"
  on public.vyron_recovery_tracking for all using (true) with check (true);

create policy "demo read vyron_recovery_evidence"
  on public.vyron_recovery_evidence for select using (true);
create policy "demo write vyron_recovery_evidence"
  on public.vyron_recovery_evidence for all using (true) with check (true);

create policy "demo read vyron_recovery_audit_trail"
  on public.vyron_recovery_audit_trail for select using (true);
create policy "demo write vyron_recovery_audit_trail"
  on public.vyron_recovery_audit_trail for all using (true) with check (true);
