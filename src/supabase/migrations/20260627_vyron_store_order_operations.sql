-- Store Ordering Engine Sprint 1B: operations workflow extensions

alter table public.vyron_cost_store_orders
  add column if not exists rejection_reason text null,
  add column if not exists change_request_note text null,
  add column if not exists rejected_at timestamptz null,
  add column if not exists picking_completed_at timestamptz null,
  add column if not exists ready_to_dispatch_at timestamptz null;

create table if not exists public.vyron_cost_store_order_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  store_order_id uuid not null references public.vyron_cost_store_orders (id) on delete cascade,
  action text not null,
  from_status text not null,
  to_status text not null,
  note text null,
  actor text null,
  created_at timestamptz not null default now()
);

create index if not exists vyron_cost_store_order_events_order_id_idx
  on public.vyron_cost_store_order_events (store_order_id);

create index if not exists vyron_cost_store_order_events_company_id_idx
  on public.vyron_cost_store_order_events (company_id);
