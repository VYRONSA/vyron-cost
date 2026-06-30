-- Sprint 3A: Inventory transaction engine (single source of truth for stock movements)

create table if not exists public.vyron_cost_inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  transaction_number text not null,
  transaction_type text not null,
  entity_type text not null,
  entity_id uuid null,
  stock_item_id uuid null,
  quantity numeric(14, 4) not null default 0,
  unit_cost numeric(14, 4) not null default 0,
  total_cost numeric(14, 2) not null default 0,
  reference_type text null,
  reference_id uuid null,
  notes text null,
  created_by text null,
  created_at timestamptz not null default now()
);

create unique index if not exists vyron_cost_inventory_transactions_company_number_uidx
  on public.vyron_cost_inventory_transactions (company_id, transaction_number);

create index if not exists vyron_cost_inventory_transactions_company_created_idx
  on public.vyron_cost_inventory_transactions (company_id, created_at desc);

create index if not exists vyron_cost_inventory_transactions_company_entity_idx
  on public.vyron_cost_inventory_transactions (company_id, entity_type, entity_id);

create index if not exists vyron_cost_inventory_transactions_reference_idx
  on public.vyron_cost_inventory_transactions (company_id, reference_type, reference_id);

create index if not exists vyron_cost_inventory_transactions_type_idx
  on public.vyron_cost_inventory_transactions (company_id, transaction_type, created_at desc);
