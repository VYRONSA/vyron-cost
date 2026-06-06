-- VYRON COST DAYS 7-10 CORE SAAS PACK
-- Run after Day 4, Day 5 and Day 6 SQL.

create table if not exists public.vyron_cost_users (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.vyron_cost_companies(id) on delete cascade,
  full_name text not null,
  email text not null,
  role text not null default 'Viewer',
  status text not null default 'Active',
  created_at timestamptz not null default now()
);

create table if not exists public.vyron_cost_audit_log (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.vyron_cost_companies(id) on delete cascade,
  event_type text not null,
  entity_name text not null,
  event_detail text not null,
  risk_level text not null default 'Low',
  created_at timestamptz not null default now()
);

create table if not exists public.vyron_cost_purchase_orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.vyron_cost_companies(id) on delete cascade,
  supplier_id uuid references public.vyron_cost_suppliers(id) on delete set null,
  po_number text not null,
  supplier_name_snapshot text,
  status text not null default 'Draft',
  expected_total numeric(12,2) not null default 0,
  invoice_total numeric(12,2) not null default 0,
  variance numeric(12,2) generated always as (invoice_total - expected_total) stored,
  created_at timestamptz not null default now()
);

create table if not exists public.vyron_cost_reports (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.vyron_cost_companies(id) on delete cascade,
  report_name text not null,
  report_type text not null,
  status text not null default 'Ready',
  estimated_value numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

alter table public.vyron_cost_users enable row level security;
alter table public.vyron_cost_audit_log enable row level security;
alter table public.vyron_cost_purchase_orders enable row level security;
alter table public.vyron_cost_reports enable row level security;

drop policy if exists "demo read users" on public.vyron_cost_users;
drop policy if exists "demo write users" on public.vyron_cost_users;
drop policy if exists "demo read audit" on public.vyron_cost_audit_log;
drop policy if exists "demo write audit" on public.vyron_cost_audit_log;
drop policy if exists "demo read purchase orders" on public.vyron_cost_purchase_orders;
drop policy if exists "demo write purchase orders" on public.vyron_cost_purchase_orders;
drop policy if exists "demo read reports" on public.vyron_cost_reports;
drop policy if exists "demo write reports" on public.vyron_cost_reports;

create policy "demo read users" on public.vyron_cost_users for select using (true);
create policy "demo write users" on public.vyron_cost_users for all using (true) with check (true);
create policy "demo read audit" on public.vyron_cost_audit_log for select using (true);
create policy "demo write audit" on public.vyron_cost_audit_log for all using (true) with check (true);
create policy "demo read purchase orders" on public.vyron_cost_purchase_orders for select using (true);
create policy "demo write purchase orders" on public.vyron_cost_purchase_orders for all using (true) with check (true);
create policy "demo read reports" on public.vyron_cost_reports for select using (true);
create policy "demo write reports" on public.vyron_cost_reports for all using (true) with check (true);

insert into public.vyron_cost_users (company_id, full_name, email, role, status)
select c.id, u.full_name, u.email, u.role, u.status
from public.vyron_cost_companies c
cross join (
  values
  ('Erki Admin','admin@vyroncost.com','Owner','Active'),
  ('Costing Manager','costing@demo.co.za','Costing Manager','Active'),
  ('Procurement Lead','buyer@demo.co.za','Procurement','Active'),
  ('Finance Viewer','finance@demo.co.za','Viewer','Active')
) as u(full_name, email, role, status)
where c.name = 'Demo Company'
and not exists (select 1 from public.vyron_cost_users x where x.email = u.email);

insert into public.vyron_cost_audit_log (company_id, event_type, entity_name, event_detail, risk_level)
select c.id, a.event_type, a.entity_name, a.event_detail, a.risk_level
from public.vyron_cost_companies c
cross join (
  values
  ('Supplier Price Change','Chicken Fillet','Price changed from R82/kg to R95/kg after invoice review.','High'),
  ('Yield Rule Update','Avocado','Usable yield set to 65% after prep loss review.','Medium'),
  ('Recipe Review','Salmon Poke Mix','Recipe flagged as GP Risk because current GP is below target.','High'),
  ('Invoice Approval','INV-AI-1002','Invoice extracted lines approved and stored.','Low')
) as a(event_type, entity_name, event_detail, risk_level)
where c.name = 'Demo Company'
and not exists (
  select 1 from public.vyron_cost_audit_log x
  where x.entity_name = a.entity_name and x.event_type = a.event_type
);

insert into public.vyron_cost_purchase_orders (company_id, supplier_id, po_number, supplier_name_snapshot, status, expected_total, invoice_total)
with seed_purchase_orders(po_number, supplier_name, status, expected_total, invoice_total) as (
  values
  ('PO-1001','Protein Direct','Invoice Variance',8200.00,9500.00),
  ('PO-1002','Cape Dry Goods','Matched',6300.00,6300.00),
  ('PO-1003','Demo Fresh Supplier','Review',4200.00,4620.00)
)
select c.id, s.id, po.po_number, po.supplier_name, po.status, po.expected_total, po.invoice_total
from public.vyron_cost_companies c
inner join seed_purchase_orders po on true
inner join public.vyron_cost_suppliers s
  on s.company_id = c.id and s.supplier_name = po.supplier_name
where c.name = 'Demo Company'
and not exists (select 1 from public.vyron_cost_purchase_orders x where x.po_number = po.po_number);

insert into public.vyron_cost_reports (company_id, report_name, report_type, status, estimated_value)
select c.id, r.report_name, r.report_type, r.status, r.estimated_value
from public.vyron_cost_companies c
cross join (
  values
  ('Monthly GP Risk Summary','Executive','Ready',127840.00),
  ('Supplier Price Movement','Procurement','Ready',60400.00),
  ('Recipe Margin Review','Costing','Ready',42180.00),
  ('Invoice AI Exceptions','Finance','Review',38900.00)
) as r(report_name, report_type, status, estimated_value)
where c.name = 'Demo Company'
and not exists (select 1 from public.vyron_cost_reports x where x.report_name = r.report_name);
