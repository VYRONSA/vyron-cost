begin;

create table if not exists public.vyron_report_audit_log (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.vyron_cost_companies(id) on delete cascade,
  report_key text not null,
  event_type text not null,
  actor text null,
  detail text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_vyron_report_audit_log_company_report_created
  on public.vyron_report_audit_log(company_id, report_key, created_at desc);

select pg_notify('pgrst', 'reload schema');

commit;
