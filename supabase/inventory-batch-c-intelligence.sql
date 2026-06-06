-- VYRON COST — Batch C: Inventory Intelligence
-- Run after procurement-batch-b-po-grn-match.sql

-- ---------------------------------------------------------------------------
-- Stock master
-- ---------------------------------------------------------------------------
create table if not exists public.vyron_cost_stock_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.vyron_cost_companies(id) on delete cascade,
  item_code text not null,
  description text not null,
  category text not null default 'Uncategorised',
  entity_type text not null,
  entity_id uuid,
  unit text not null default 'kg',
  supplier_id uuid references public.vyron_cost_suppliers(id) on delete set null,
  supplier_name_snapshot text,
  current_cost numeric(14,4) not null default 0,
  average_cost numeric(14,4) not null default 0,
  qty_on_hand numeric(14,4) not null default 0,
  inventory_value numeric(14,2) not null default 0,
  reorder_level numeric(14,4) not null default 0,
  min_level numeric(14,4) not null default 0,
  max_level numeric(14,4) not null default 0,
  valuation_method text not null default 'weighted_average',
  stock_status text not null default 'In Stock',
  last_movement_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, item_code)
);

create index if not exists idx_vyron_stock_items_company on public.vyron_cost_stock_items(company_id, entity_type);
create index if not exists idx_vyron_stock_items_entity on public.vyron_cost_stock_items(company_id, entity_type, entity_id);

-- ---------------------------------------------------------------------------
-- Permanent stock ledger
-- ---------------------------------------------------------------------------
create table if not exists public.vyron_cost_stock_ledger (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.vyron_cost_companies(id) on delete cascade,
  stock_item_id uuid not null references public.vyron_cost_stock_items(id) on delete cascade,
  movement_date timestamptz not null default now(),
  movement_type text not null,
  quantity_in numeric(14,4) not null default 0,
  quantity_out numeric(14,4) not null default 0,
  balance_after numeric(14,4) not null default 0,
  unit_cost numeric(14,4) not null default 0,
  value numeric(14,2) not null default 0,
  reference_type text,
  reference_id uuid,
  reference_label text,
  actor text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_vyron_stock_ledger_item on public.vyron_cost_stock_ledger(stock_item_id, movement_date desc);

-- ---------------------------------------------------------------------------
-- Stock counts
-- ---------------------------------------------------------------------------
create table if not exists public.vyron_cost_stock_counts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.vyron_cost_companies(id) on delete cascade,
  count_number text not null,
  count_type text not null,
  status text not null default 'Draft',
  notes text,
  variance_value_total numeric(14,2) not null default 0,
  created_by text,
  approved_by text,
  submitted_at timestamptz,
  approved_at timestamptz,
  posted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vyron_cost_stock_count_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.vyron_cost_companies(id) on delete cascade,
  stock_count_id uuid not null references public.vyron_cost_stock_counts(id) on delete cascade,
  stock_item_id uuid not null references public.vyron_cost_stock_items(id) on delete cascade,
  system_qty numeric(14,4) not null default 0,
  counted_qty numeric(14,4) not null default 0,
  variance_qty numeric(14,4) not null default 0,
  variance_pct numeric(10,4) not null default 0,
  variance_value numeric(14,2) not null default 0,
  variance_class text not null default 'minor',
  unit_cost numeric(14,4) not null default 0,
  approved boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Low stock alerts
-- ---------------------------------------------------------------------------
create table if not exists public.vyron_cost_low_stock_alerts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.vyron_cost_companies(id) on delete cascade,
  stock_item_id uuid not null references public.vyron_cost_stock_items(id) on delete cascade,
  required_qty numeric(14,4) not null default 0,
  estimated_cost numeric(14,2) not null default 0,
  preferred_supplier_id uuid references public.vyron_cost_suppliers(id) on delete set null,
  preferred_supplier_name text,
  status text not null default 'Open',
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

-- ---------------------------------------------------------------------------
-- Inventory audit
-- ---------------------------------------------------------------------------
create table if not exists public.vyron_inventory_audit_log (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.vyron_cost_companies(id) on delete cascade,
  stock_item_id uuid references public.vyron_cost_stock_items(id) on delete set null,
  event_type text not null,
  actor text,
  field_name text,
  old_value text,
  new_value text,
  detail text,
  reference_type text,
  reference_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists idx_vyron_inventory_audit_company on public.vyron_inventory_audit_log(company_id, created_at desc);

-- Settings
create table if not exists public.vyron_inventory_settings (
  company_id uuid primary key references public.vyron_cost_companies(id) on delete cascade,
  minor_variance_pct numeric(8,2) not null default 2,
  major_variance_pct numeric(8,2) not null default 10,
  slow_moving_days_30 int not null default 30,
  slow_moving_days_60 int not null default 60,
  slow_moving_days_90 int not null default 90,
  updated_at timestamptz not null default now()
);

insert into public.vyron_inventory_settings (company_id)
select id from public.vyron_cost_companies c
where c.name = 'Demo Company'
on conflict (company_id) do nothing;

-- RLS demo
alter table public.vyron_cost_stock_items enable row level security;
alter table public.vyron_cost_stock_ledger enable row level security;
alter table public.vyron_cost_stock_counts enable row level security;
alter table public.vyron_cost_stock_count_lines enable row level security;
alter table public.vyron_cost_low_stock_alerts enable row level security;
alter table public.vyron_inventory_audit_log enable row level security;
alter table public.vyron_inventory_settings enable row level security;

drop policy if exists "demo read stock items" on public.vyron_cost_stock_items;
drop policy if exists "demo write stock items" on public.vyron_cost_stock_items;
create policy "demo read stock items" on public.vyron_cost_stock_items for select using (true);
create policy "demo write stock items" on public.vyron_cost_stock_items for all using (true) with check (true);

drop policy if exists "demo read stock ledger" on public.vyron_cost_stock_ledger;
drop policy if exists "demo write stock ledger" on public.vyron_cost_stock_ledger;
create policy "demo read stock ledger" on public.vyron_cost_stock_ledger for select using (true);
create policy "demo write stock ledger" on public.vyron_cost_stock_ledger for all using (true) with check (true);

drop policy if exists "demo read stock counts" on public.vyron_cost_stock_counts;
drop policy if exists "demo write stock counts" on public.vyron_cost_stock_counts;
create policy "demo read stock counts" on public.vyron_cost_stock_counts for select using (true);
create policy "demo write stock counts" on public.vyron_cost_stock_counts for all using (true) with check (true);

drop policy if exists "demo read stock count lines" on public.vyron_cost_stock_count_lines;
drop policy if exists "demo write stock count lines" on public.vyron_cost_stock_count_lines;
create policy "demo read stock count lines" on public.vyron_cost_stock_count_lines for select using (true);
create policy "demo write stock count lines" on public.vyron_cost_stock_count_lines for all using (true) with check (true);

drop policy if exists "demo read low stock" on public.vyron_cost_low_stock_alerts;
drop policy if exists "demo write low stock" on public.vyron_cost_low_stock_alerts;
create policy "demo read low stock" on public.vyron_cost_low_stock_alerts for select using (true);
create policy "demo write low stock" on public.vyron_cost_low_stock_alerts for all using (true) with check (true);

drop policy if exists "demo read inventory audit" on public.vyron_inventory_audit_log;
drop policy if exists "demo write inventory audit" on public.vyron_inventory_audit_log;
create policy "demo read inventory audit" on public.vyron_inventory_audit_log for select using (true);
create policy "demo write inventory audit" on public.vyron_inventory_audit_log for all using (true) with check (true);

drop policy if exists "demo read inventory settings" on public.vyron_inventory_settings;
drop policy if exists "demo write inventory settings" on public.vyron_inventory_settings;
create policy "demo read inventory settings" on public.vyron_inventory_settings for select using (true);
create policy "demo write inventory settings" on public.vyron_inventory_settings for all using (true) with check (true);
