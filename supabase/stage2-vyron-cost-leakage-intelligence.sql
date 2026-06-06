-- VYRON COST STAGE 2 — FINANCIAL LEAKAGE INTELLIGENCE PACK
-- Run after previous VYRON COST SQL packs (companies table must exist).

create table if not exists public.vyron_cost_leakage_findings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.vyron_cost_companies(id) on delete cascade,
  finding_type text not null,
  title text not null,
  description text,
  estimated_monthly_loss numeric(14,2) not null default 0,
  severity text not null default 'Medium',
  status text not null default 'Open',
  branch_name text,
  category_name text,
  supplier_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.vyron_cost_invoice_risk_findings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.vyron_cost_companies(id) on delete cascade,
  invoice_number text not null,
  supplier_name text not null,
  invoice_amount numeric(14,2) not null default 0,
  risk_type text not null,
  risk_score numeric(6,2) not null default 0,
  ai_confidence numeric(6,2) not null default 0,
  duplicate_of text,
  review_status text not null default 'Pending Review',
  detected_at timestamptz not null default now()
);

create table if not exists public.vyron_cost_procurement_risk_findings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.vyron_cost_companies(id) on delete cascade,
  supplier_name text not null,
  category_name text,
  risk_type text not null,
  risk_score numeric(6,2) not null default 0,
  price_change_percent numeric(8,2) not null default 0,
  spend_amount numeric(14,2) not null default 0,
  action_required text,
  detected_at timestamptz not null default now()
);

create table if not exists public.vyron_cost_branch_risk_findings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.vyron_cost_companies(id) on delete cascade,
  branch_name text not null,
  spend_total numeric(14,2) not null default 0,
  wastage_estimate numeric(14,2) not null default 0,
  invoice_volume integer not null default 0,
  gp_erosion_percent numeric(8,2) not null default 0,
  procurement_efficiency numeric(6,2) not null default 0,
  leakage_score numeric(6,2) not null default 0,
  risk_level text not null default 'Medium',
  created_at timestamptz not null default now()
);

create table if not exists public.vyron_cost_supplier_intelligence (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.vyron_cost_companies(id) on delete cascade,
  supplier_name text not null,
  category text,
  invoice_count integer not null default 0,
  invoice_value numeric(14,2) not null default 0,
  avg_price_movement numeric(8,2) not null default 0,
  high_risk_movements integer not null default 0,
  unmatched_invoice_lines integer not null default 0,
  ai_confidence_avg numeric(6,2) not null default 0,
  risk_score numeric(6,2) not null default 0,
  risk_level text not null default 'Low',
  action_required text,
  inflation_trend text,
  dependency_risk text,
  invoice_irregularities integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.vyron_cost_leakage_findings enable row level security;
alter table public.vyron_cost_invoice_risk_findings enable row level security;
alter table public.vyron_cost_procurement_risk_findings enable row level security;
alter table public.vyron_cost_branch_risk_findings enable row level security;
alter table public.vyron_cost_supplier_intelligence enable row level security;

drop policy if exists "demo read leakage findings" on public.vyron_cost_leakage_findings;
drop policy if exists "demo write leakage findings" on public.vyron_cost_leakage_findings;
drop policy if exists "demo read invoice risk" on public.vyron_cost_invoice_risk_findings;
drop policy if exists "demo write invoice risk" on public.vyron_cost_invoice_risk_findings;
drop policy if exists "demo read procurement risk" on public.vyron_cost_procurement_risk_findings;
drop policy if exists "demo write procurement risk" on public.vyron_cost_procurement_risk_findings;
drop policy if exists "demo read branch risk" on public.vyron_cost_branch_risk_findings;
drop policy if exists "demo write branch risk" on public.vyron_cost_branch_risk_findings;
drop policy if exists "demo read supplier intelligence" on public.vyron_cost_supplier_intelligence;
drop policy if exists "demo write supplier intelligence" on public.vyron_cost_supplier_intelligence;

create policy "demo read leakage findings" on public.vyron_cost_leakage_findings for select using (true);
create policy "demo write leakage findings" on public.vyron_cost_leakage_findings for all using (true) with check (true);
create policy "demo read invoice risk" on public.vyron_cost_invoice_risk_findings for select using (true);
create policy "demo write invoice risk" on public.vyron_cost_invoice_risk_findings for all using (true) with check (true);
create policy "demo read procurement risk" on public.vyron_cost_procurement_risk_findings for select using (true);
create policy "demo write procurement risk" on public.vyron_cost_procurement_risk_findings for all using (true) with check (true);
create policy "demo read branch risk" on public.vyron_cost_branch_risk_findings for select using (true);
create policy "demo write branch risk" on public.vyron_cost_branch_risk_findings for all using (true) with check (true);
create policy "demo read supplier intelligence" on public.vyron_cost_supplier_intelligence for select using (true);
create policy "demo write supplier intelligence" on public.vyron_cost_supplier_intelligence for all using (true) with check (true);

insert into public.vyron_cost_leakage_findings (
  company_id, finding_type, title, description, estimated_monthly_loss, severity, status, branch_name, category_name, supplier_name
)
select c.id, v.finding_type, v.title, v.description, v.estimated_monthly_loss, v.severity, v.status, v.branch_name, v.category_name, v.supplier_name
from public.vyron_cost_companies c
cross join (
  values
  ('Duplicate Invoice','INV-8841 duplicate payment risk','Same supplier and amount posted twice',18420.00,'Critical','Investigate',null,null,'Protein Direct'),
  ('Supplier Inflation','Chicken fillet inflation spike','Unit price up 14.8% in 30 days',24680.00,'High','Open',null,'Protein','Protein Direct'),
  ('Branch Overspend','Sandton branch spend anomaly','Spend 22% above branch benchmark',32100.00,'High','Open','Sandton',null,null),
  ('Wastage Loss','Prep wastage trend breach','Wastage above target for 3 weeks',12840.00,'Medium','Open','Rosebank',null,null),
  ('Procurement Anomaly','Unauthorized category purchase','Non-approved supplier used for packaging',9650.00,'High','Investigate',null,'Packaging','Quick Pack Co'),
  ('Margin Erosion','Burger combo GP collapse','Selling price unchanged, cost up 9.2%',14220.00,'Medium','Open',null,'Meals',null),
  ('Invoice Splitting','Split invoice pattern detected','Multiple invoices just below approval limit',11200.00,'Critical','Investigate',null,null,'Metro Foods'),
  ('Stock Leakage','Inventory shrinkage variance','Theoretical vs actual stock gap widening',18750.00,'High','Open','Centurion',null,null)
) as v(finding_type, title, description, estimated_monthly_loss, severity, status, branch_name, category_name, supplier_name)
where c.name = 'Demo Company'
on conflict do nothing;

insert into public.vyron_cost_invoice_risk_findings (
  company_id, invoice_number, supplier_name, invoice_amount, risk_type, risk_score, ai_confidence, duplicate_of, review_status
)
select c.id, v.invoice_number, v.supplier_name, v.invoice_amount, v.risk_type, v.risk_score, v.ai_confidence, v.duplicate_of, v.review_status
from public.vyron_cost_companies c
cross join (
  values
  ('INV-8841','Protein Direct',24850.00,'Duplicate Invoice',92.4,94.0,'INV-8720','Pending Review'),
  ('INV-8720','Protein Direct',24850.00,'Duplicate Match',91.8,93.5,'INV-8841','Pending Review'),
  ('PF-22018','Packaging World',9840.00,'Same Amount Pattern',78.2,88.0,null,'Pending Review'),
  ('MF-9912','Metro Foods',4999.00,'Invoice Splitting',85.6,90.2,null,'Investigate'),
  ('MF-9913','Metro Foods',4995.00,'Invoice Splitting',84.9,89.8,null,'Investigate'),
  ('DF-4410','Demo Fresh Supplier',184200.00,'Unusual Value',72.4,86.5,null,'Pending Review'),
  ('PD-11882','Protein Direct',12400.00,'High Frequency',68.5,82.0,null,'Monitor'),
  ('PW-3301','Packaging World',9840.00,'Duplicate Number',88.1,91.4,'PW-3298','Pending Review')
) as v(invoice_number, supplier_name, invoice_amount, risk_type, risk_score, ai_confidence, duplicate_of, review_status)
where c.name = 'Demo Company'
on conflict do nothing;

insert into public.vyron_cost_procurement_risk_findings (
  company_id, supplier_name, category_name, risk_type, risk_score, price_change_percent, spend_amount, action_required
)
select c.id, v.supplier_name, v.category_name, v.risk_type, v.risk_score, v.price_change_percent, v.spend_amount, v.action_required
from public.vyron_cost_companies c
cross join (
  values
  ('Protein Direct','Protein','Supplier Inflation',86.4,14.8,184520.00,'Approve Price Increase'),
  ('Quick Pack Co','Packaging','Unauthorized Purchase',79.2,0.0,42800.00,'Block Supplier'),
  ('Metro Foods','Dry Goods','Invoice Splitting',84.1,0.0,62400.00,'Investigate'),
  ('Packaging World','Packaging','Unmatched Lines',62.5,5.4,62400.00,'Map Invoice Lines'),
  ('Fresh Valley','Fresh Produce','Concentration Risk',71.0,8.2,142800.00,'Diversify Suppliers'),
  ('Protein Direct','Protein','Collusion Indicator',58.4,12.1,184520.00,'Audit Buying'),
  ('City Dairy','Dairy','Category Overspend',74.8,11.6,98400.00,'Review Budget'),
  ('Demo Fresh Supplier','Fresh Produce','Unusual Buying',44.2,3.2,98500.00,'Monitor')
) as v(supplier_name, category_name, risk_type, risk_score, price_change_percent, spend_amount, action_required)
where c.name = 'Demo Company'
on conflict do nothing;

insert into public.vyron_cost_branch_risk_findings (
  company_id, branch_name, spend_total, wastage_estimate, invoice_volume, gp_erosion_percent, procurement_efficiency, leakage_score, risk_level
)
select c.id, v.branch_name, v.spend_total, v.wastage_estimate, v.invoice_volume, v.gp_erosion_percent, v.procurement_efficiency, v.leakage_score, v.risk_level
from public.vyron_cost_companies c
cross join (
  values
  ('Sandton',842000.00,42800.00,186,4.8,72.0,78.4,'Critical'),
  ('Rosebank',624500.00,28400.00,142,3.2,81.0,54.2,'High'),
  ('Centurion',512800.00,31200.00,128,5.6,68.0,62.8,'High'),
  ('Durban North',398200.00,18600.00,98,2.1,88.0,28.4,'Medium'),
  ('Cape Town CBD',445600.00,22100.00,112,3.8,79.0,41.6,'Medium'),
  ('Pretoria East',286400.00,14200.00,76,1.9,91.0,22.1,'Low')
) as v(branch_name, spend_total, wastage_estimate, invoice_volume, gp_erosion_percent, procurement_efficiency, leakage_score, risk_level)
where c.name = 'Demo Company'
on conflict do nothing;

insert into public.vyron_cost_supplier_intelligence (
  company_id, supplier_name, category, invoice_count, invoice_value, avg_price_movement, high_risk_movements, unmatched_invoice_lines, ai_confidence_avg, risk_score, risk_level, action_required, inflation_trend, dependency_risk, invoice_irregularities
)
select c.id, v.supplier_name, v.category, v.invoice_count, v.invoice_value, v.avg_price_movement, v.high_risk_movements, v.unmatched_invoice_lines, v.ai_confidence_avg, v.risk_score, v.risk_level, v.action_required, v.inflation_trend, v.dependency_risk, v.invoice_irregularities
from public.vyron_cost_companies c
cross join (
  values
  ('Protein Direct','Protein',12,184520.00,14.8,4,3,87.0,74.6,'Critical','Review Pricing','Rising','High',5),
  ('Packaging World','Packaging',8,62400.00,5.4,1,6,72.0,55.8,'High','Map Invoice Lines','Stable','Medium',3),
  ('Demo Fresh Supplier','Fresh Produce',18,98500.00,3.2,0,1,94.0,11.4,'Low','Monitor','Stable','Low',0),
  ('Metro Foods','Dry Goods',6,62400.00,0.0,2,0,81.0,68.2,'High','Investigate','Unknown','Medium',4),
  ('Quick Pack Co','Packaging',4,42800.00,0.0,1,2,65.0,72.4,'High','Block Supplier','Unknown','Low',2)
) as v(supplier_name, category, invoice_count, invoice_value, avg_price_movement, high_risk_movements, unmatched_invoice_lines, ai_confidence_avg, risk_score, risk_level, action_required, inflation_trend, dependency_risk, invoice_irregularities)
where c.name = 'Demo Company'
on conflict do nothing;
