-- VYRON COST — Batch B: Purchase Orders + GRN + 3-Way Matching
-- Run after days7-10-vyron-cost-core-saas.sql and document-ai-v2 migrations.

-- ---------------------------------------------------------------------------
-- Purchase orders (extend header)
-- ---------------------------------------------------------------------------
alter table public.vyron_cost_purchase_orders
  add column if not exists order_date date,
  add column if not exists notes text,
  add column if not exists subtotal numeric(14,2) not null default 0,
  add column if not exists vat_amount numeric(14,2) not null default 0,
  add column if not exists total numeric(14,2) not null default 0,
  add column if not exists outstanding_amount numeric(14,2) not null default 0,
  add column if not exists approved_by text,
  add column if not exists approved_at timestamptz,
  add column if not exists approval_notes text,
  add column if not exists sent_at timestamptz,
  add column if not exists closed_at timestamptz,
  add column if not exists submitted_at timestamptz,
  add column if not exists match_status text,
  add column if not exists updated_at timestamptz not null default now();

-- Sync legacy expected_total into total when empty
update public.vyron_cost_purchase_orders
set total = expected_total, subtotal = expected_total
where total = 0 and expected_total > 0;

-- ---------------------------------------------------------------------------
-- PO lines
-- ---------------------------------------------------------------------------
create table if not exists public.vyron_cost_purchase_order_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.vyron_cost_companies(id) on delete cascade,
  purchase_order_id uuid not null references public.vyron_cost_purchase_orders(id) on delete cascade,
  item_type text not null default 'ingredient',
  item_id uuid,
  item_name text not null,
  quantity numeric(14,4) not null default 0,
  unit text not null default 'kg',
  unit_price numeric(14,4) not null default 0,
  vat_rate numeric(8,2) not null default 15,
  vat_amount numeric(14,2) not null default 0,
  line_total numeric(14,2) not null default 0,
  expected_delivery_date date,
  ordered_qty numeric(14,4) not null default 0,
  received_qty numeric(14,4) not null default 0,
  damaged_qty numeric(14,4) not null default 0,
  rejected_qty numeric(14,4) not null default 0,
  outstanding_qty numeric(14,4) not null default 0,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_vyron_po_lines_po on public.vyron_cost_purchase_order_lines(purchase_order_id, sort_order);

-- ---------------------------------------------------------------------------
-- PO approval thresholds
-- ---------------------------------------------------------------------------
create table if not exists public.vyron_po_approval_rules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.vyron_cost_companies(id) on delete cascade unique,
  auto_approve_below numeric(14,2) not null default 5000,
  supervisor_approve_below numeric(14,2) not null default 25000,
  require_po_before_invoice_approval boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Goods received notes
-- ---------------------------------------------------------------------------
create table if not exists public.vyron_cost_goods_receipts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.vyron_cost_companies(id) on delete cascade,
  purchase_order_id uuid not null references public.vyron_cost_purchase_orders(id) on delete cascade,
  grn_number text not null,
  supplier_id uuid references public.vyron_cost_suppliers(id) on delete set null,
  supplier_name_snapshot text,
  receipt_type text not null default 'partial',
  status text not null default 'Posted',
  received_at timestamptz not null default now(),
  received_by text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vyron_cost_goods_receipt_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.vyron_cost_companies(id) on delete cascade,
  goods_receipt_id uuid not null references public.vyron_cost_goods_receipts(id) on delete cascade,
  purchase_order_line_id uuid references public.vyron_cost_purchase_order_lines(id) on delete set null,
  item_name text not null,
  ordered_qty numeric(14,4) not null default 0,
  received_qty numeric(14,4) not null default 0,
  damaged_qty numeric(14,4) not null default 0,
  rejected_qty numeric(14,4) not null default 0,
  outstanding_qty numeric(14,4) not null default 0,
  unit text not null default 'kg',
  created_at timestamptz not null default now()
);

create index if not exists idx_vyron_grn_po on public.vyron_cost_goods_receipts(purchase_order_id, received_at desc);

-- ---------------------------------------------------------------------------
-- Back orders
-- ---------------------------------------------------------------------------
create table if not exists public.vyron_cost_back_orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.vyron_cost_companies(id) on delete cascade,
  purchase_order_id uuid not null references public.vyron_cost_purchase_orders(id) on delete cascade,
  purchase_order_line_id uuid references public.vyron_cost_purchase_order_lines(id) on delete set null,
  supplier_id uuid references public.vyron_cost_suppliers(id) on delete set null,
  supplier_name_snapshot text,
  item_name text not null,
  outstanding_qty numeric(14,4) not null default 0,
  expected_date date,
  status text not null default 'Open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 3-way match + document PO link
-- ---------------------------------------------------------------------------
alter table public.vyron_documents
  add column if not exists purchase_order_id uuid references public.vyron_cost_purchase_orders(id) on delete set null;

create table if not exists public.vyron_procurement_three_way_matches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.vyron_cost_companies(id) on delete cascade,
  document_id uuid not null references public.vyron_documents(id) on delete cascade,
  purchase_order_id uuid not null references public.vyron_cost_purchase_orders(id) on delete cascade,
  goods_receipt_id uuid references public.vyron_cost_goods_receipts(id) on delete set null,
  match_status text not null default 'Partial Match',
  po_qty numeric(14,4),
  invoice_qty numeric(14,4),
  grn_qty numeric(14,4),
  qty_variance numeric(14,4),
  po_unit_price numeric(14,4),
  invoice_unit_price numeric(14,4),
  price_variance numeric(14,4),
  po_total numeric(14,2),
  invoice_total numeric(14,2),
  grn_total numeric(14,2),
  total_variance numeric(14,2),
  missing_po boolean not null default false,
  missing_grn boolean not null default false,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (document_id)
);

create table if not exists public.vyron_document_po_link_override_audit (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.vyron_cost_companies(id) on delete cascade,
  document_id uuid not null references public.vyron_documents(id) on delete cascade,
  overridden_by text not null,
  override_reason text not null,
  overridden_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

-- ---------------------------------------------------------------------------
-- Procurement audit trail
-- ---------------------------------------------------------------------------
create table if not exists public.vyron_procurement_audit_log (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.vyron_cost_companies(id) on delete cascade,
  event_type text not null,
  entity_type text not null,
  entity_id uuid,
  entity_label text,
  detail text,
  actor text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_vyron_procurement_audit_company on public.vyron_procurement_audit_log(company_id, created_at desc);

-- ---------------------------------------------------------------------------
-- RLS (demo)
-- ---------------------------------------------------------------------------
alter table public.vyron_cost_purchase_order_lines enable row level security;
alter table public.vyron_po_approval_rules enable row level security;
alter table public.vyron_cost_goods_receipts enable row level security;
alter table public.vyron_cost_goods_receipt_lines enable row level security;
alter table public.vyron_cost_back_orders enable row level security;
alter table public.vyron_procurement_three_way_matches enable row level security;
alter table public.vyron_document_po_link_override_audit enable row level security;
alter table public.vyron_procurement_audit_log enable row level security;

drop policy if exists "demo read po lines" on public.vyron_cost_purchase_order_lines;
drop policy if exists "demo write po lines" on public.vyron_cost_purchase_order_lines;
create policy "demo read po lines" on public.vyron_cost_purchase_order_lines for select using (true);
create policy "demo write po lines" on public.vyron_cost_purchase_order_lines for all using (true) with check (true);

drop policy if exists "demo read po approval rules" on public.vyron_po_approval_rules;
drop policy if exists "demo write po approval rules" on public.vyron_po_approval_rules;
create policy "demo read po approval rules" on public.vyron_po_approval_rules for select using (true);
create policy "demo write po approval rules" on public.vyron_po_approval_rules for all using (true) with check (true);

drop policy if exists "demo read grn" on public.vyron_cost_goods_receipts;
drop policy if exists "demo write grn" on public.vyron_cost_goods_receipts;
create policy "demo read grn" on public.vyron_cost_goods_receipts for select using (true);
create policy "demo write grn" on public.vyron_cost_goods_receipts for all using (true) with check (true);

drop policy if exists "demo read grn lines" on public.vyron_cost_goods_receipt_lines;
drop policy if exists "demo write grn lines" on public.vyron_cost_goods_receipt_lines;
create policy "demo read grn lines" on public.vyron_cost_goods_receipt_lines for select using (true);
create policy "demo write grn lines" on public.vyron_cost_goods_receipt_lines for all using (true) with check (true);

drop policy if exists "demo read back orders" on public.vyron_cost_back_orders;
drop policy if exists "demo write back orders" on public.vyron_cost_back_orders;
create policy "demo read back orders" on public.vyron_cost_back_orders for select using (true);
create policy "demo write back orders" on public.vyron_cost_back_orders for all using (true) with check (true);

drop policy if exists "demo read three way" on public.vyron_procurement_three_way_matches;
drop policy if exists "demo write three way" on public.vyron_procurement_three_way_matches;
create policy "demo read three way" on public.vyron_procurement_three_way_matches for select using (true);
create policy "demo write three way" on public.vyron_procurement_three_way_matches for all using (true) with check (true);

drop policy if exists "demo read po link override" on public.vyron_document_po_link_override_audit;
drop policy if exists "demo write po link override" on public.vyron_document_po_link_override_audit;
create policy "demo read po link override" on public.vyron_document_po_link_override_audit for select using (true);
create policy "demo write po link override" on public.vyron_document_po_link_override_audit for all using (true) with check (true);

drop policy if exists "demo read procurement audit" on public.vyron_procurement_audit_log;
drop policy if exists "demo write procurement audit" on public.vyron_procurement_audit_log;
create policy "demo read procurement audit" on public.vyron_procurement_audit_log for select using (true);
create policy "demo write procurement audit" on public.vyron_procurement_audit_log for all using (true) with check (true);

-- Default PO approval rules for demo company
insert into public.vyron_po_approval_rules (company_id, auto_approve_below, supervisor_approve_below, require_po_before_invoice_approval)
select c.id, 5000, 25000, true
from public.vyron_cost_companies c
where c.name = 'Demo Company'
on conflict (company_id) do nothing;

alter table public.vyron_document_approval_rules
  add column if not exists require_po_linked boolean not null default false;
