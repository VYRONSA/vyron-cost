-- Production Job Cards.
--
-- WHY
-- A job card is the production instruction printed for a received order. It is LINKED to its original
-- order (source_type + source_id) and never creates or changes an order: one job card per order, so a
-- reprint shows the same Job Card number. The number comes from the controlled 'job_card' series
-- (vyron_next_document_number, migration 20261124130000). The card carries its own production status
-- (Awaiting Production / In Production / Completed / On Hold), changed only by an authorised user and
-- audited in vyron_inventory_audit_log.
--
-- SECURITY: company scoped; RLS on with no policies (service role only). Additive only.
--
-- ROLLBACK:
--   drop table if exists public.vyron_production_job_cards;

create table if not exists public.vyron_production_job_cards (
  id uuid primary key,
  company_id uuid not null,
  job_card_number text not null,
  source_type text not null,
  source_id uuid not null,
  source_number text null,
  status text not null default 'Awaiting Production',
  status_changed_at timestamptz null,
  status_changed_by text null,
  print_count integer not null default 0,
  last_printed_at timestamptz null,
  last_printed_by text null,
  created_by text not null,
  created_at timestamptz not null default now(),
  constraint vyron_production_job_cards_source check (source_type in ('customer_sales_order', 'store_order')),
  constraint vyron_production_job_cards_status check (status in ('Awaiting Production', 'In Production', 'Completed', 'On Hold')),
  constraint uq_vyron_production_job_cards_source unique (company_id, source_type, source_id),
  constraint uq_vyron_production_job_cards_number unique (company_id, job_card_number)
);
create index if not exists idx_vyron_production_job_cards_company
  on public.vyron_production_job_cards (company_id, created_at desc);

alter table public.vyron_production_job_cards enable row level security;
revoke all on public.vyron_production_job_cards from anon, authenticated;
grant select, insert, update, delete on public.vyron_production_job_cards to service_role;
