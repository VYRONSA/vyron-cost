-- VYRON COST — Full Business Cycle Demo Seed (Handcrafted Food Products / Pie Company)
-- Safe to re-run. Only removes rows tagged demo_seed_key = 'vyron_cost_meeting_2026' or fixed demo UUIDs.
--
-- PREREQUISITE (run first — required):
--   supabase/vyron-cost-demo-schema-catchup.sql
--
-- Then run this file. Compatible with full runbook steps 1–25 when already applied.
-- Tenant: 48002864-8800-4000-9000-000000000001

create extension if not exists pgcrypto;

-- Schema readiness helpers (seed skips sections when tables/columns missing)
create or replace function public.vyron_demo_table_exists(p_table text)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = p_table
  );
$$;

create or replace function public.vyron_demo_has_columns(p_table text, p_columns text[])
returns boolean
language sql
stable
as $$
  select (
    select count(distinct column_name)::int
    from information_schema.columns
    where table_schema = 'public' and table_name = p_table
      and column_name = any(p_columns)
  ) = coalesce(array_length(p_columns, 1), 0);
$$;

create or replace function public.vyron_demo_is_generated_column(p_table text, p_column text)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = p_table
      and column_name = p_column
      and is_generated = 'ALWAYS'
  );
$$;

-- Log generated columns on demo tables (never insert into these)
do $$
declare
  r record;
begin
  for r in
    select c.table_name, c.column_name, c.generation_expression
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.is_generated = 'ALWAYS'
      and c.table_name in (
        'vyron_cost_suppliers','vyron_cost_ingredients','vyron_cost_products',
        'vyron_cost_product_cost_lines','vyron_cost_recipes','vyron_cost_recipe_items',
        'vyron_cost_product_recipe_links','vyron_cost_purchase_orders','vyron_cost_purchase_order_lines',
        'vyron_cost_goods_receipts','vyron_cost_goods_receipt_lines','vyron_cost_back_orders',
        'vyron_documents','vyron_document_line_items','vyron_supplier_price_history',
        'vyron_procurement_three_way_matches','vyron_procurement_risk_alerts',
        'vyron_cost_stock_items','vyron_cost_stock_ledger','vyron_cost_reports'
      )
    order by c.table_name, c.column_name
  loop
    raise notice 'Demo seed skips generated column: %.% (%)', r.table_name, r.column_name, r.generation_expression;
  end loop;
end $$;

-- Safe cleanup helper (no-op if table or demo_seed_key column missing)
create or replace function public.vyron_demo_delete_by_seed_key(p_table text, p_seed text default 'vyron_cost_meeting_2026')
returns void
language plpgsql
as $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = p_table
  ) and exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = p_table and column_name = 'demo_seed_key'
  ) then
    execute format('delete from public.%I where demo_seed_key = $1', p_table) using p_seed;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Demo tagging columns
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'vyron_cost_suppliers','vyron_cost_ingredients','vyron_cost_products',
    'vyron_cost_product_cost_lines','vyron_cost_recipes','vyron_cost_recipe_items',
    'vyron_cost_product_recipe_links','vyron_cost_purchase_orders','vyron_cost_purchase_order_lines',
    'vyron_cost_goods_receipts','vyron_cost_goods_receipt_lines','vyron_cost_back_orders',
    'vyron_documents','vyron_document_line_items','vyron_supplier_price_history',
    'vyron_procurement_three_way_matches','vyron_procurement_risk_alerts',
    'vyron_procurement_recommendations','vyron_recovery_calculations','vyron_recovery_tracking',
    'vyron_cost_stock_items','vyron_cost_stock_ledger','vyron_cost_invoice_risk_findings',
    'vyron_cost_procurement_risk_findings','vyron_cost_leakage_findings','vyron_cost_reports','vyron_procurement_audit_log',
    'vyron_cost_recovery_opportunities'
  ]
  loop
    execute format(
      'alter table if exists public.%I add column if not exists demo_seed_key text',
      t
    );
    execute format(
      'alter table if exists public.%I add column if not exists is_demo boolean not null default false',
      t
    );
  end loop;
end $$;

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'vyron_documents')
     and exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'vyron_cost_invoice_risk_findings') then
    alter table public.vyron_cost_invoice_risk_findings
      add column if not exists document_id uuid references public.vyron_documents(id) on delete set null;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Constants
-- ---------------------------------------------------------------------------
-- Company: Handcrafted Food Products
-- Demo UUID namespace: d26f1xxx

-- ---------------------------------------------------------------------------
-- Re-run cleanup (demo-tagged rows only; skips missing tables)
-- ---------------------------------------------------------------------------
select public.vyron_demo_delete_by_seed_key('vyron_procurement_three_way_matches');
select public.vyron_demo_delete_by_seed_key('vyron_procurement_risk_alerts');
select public.vyron_demo_delete_by_seed_key('vyron_supplier_price_history');
select public.vyron_demo_delete_by_seed_key('vyron_document_line_items');
select public.vyron_demo_delete_by_seed_key('vyron_documents');
select public.vyron_demo_delete_by_seed_key('vyron_cost_stock_ledger');
select public.vyron_demo_delete_by_seed_key('vyron_cost_goods_receipt_lines');
select public.vyron_demo_delete_by_seed_key('vyron_cost_goods_receipts');
select public.vyron_demo_delete_by_seed_key('vyron_cost_back_orders');
select public.vyron_demo_delete_by_seed_key('vyron_cost_purchase_order_lines');
select public.vyron_demo_delete_by_seed_key('vyron_cost_purchase_orders');
select public.vyron_demo_delete_by_seed_key('vyron_cost_recipe_items');
select public.vyron_demo_delete_by_seed_key('vyron_cost_product_recipe_links');
select public.vyron_demo_delete_by_seed_key('vyron_cost_product_cost_lines');
select public.vyron_demo_delete_by_seed_key('vyron_cost_recipes');
select public.vyron_demo_delete_by_seed_key('vyron_cost_products');
select public.vyron_demo_delete_by_seed_key('vyron_cost_ingredients');
select public.vyron_demo_delete_by_seed_key('vyron_cost_stock_items');
select public.vyron_demo_delete_by_seed_key('vyron_cost_invoice_risk_findings');
select public.vyron_demo_delete_by_seed_key('vyron_cost_procurement_risk_findings');
select public.vyron_demo_delete_by_seed_key('vyron_cost_leakage_findings');
select public.vyron_demo_delete_by_seed_key('vyron_cost_reports');
select public.vyron_demo_delete_by_seed_key('vyron_procurement_audit_log');
select public.vyron_demo_delete_by_seed_key('vyron_cost_recovery_opportunities');

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'vyron_procurement_recommendations') then
    delete from public.vyron_procurement_recommendations
    where tenant_id = '48002864-8800-4000-9000-000000000001'::uuid
      and recommendation_key like 'demo-meeting-%';
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'vyron_recovery_calculations') then
    delete from public.vyron_recovery_calculations
    where tenant_id = '48002864-8800-4000-9000-000000000001'::uuid
      and opportunity_key like 'demo-meeting-%';
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'vyron_recovery_tracking') then
    delete from public.vyron_recovery_tracking
    where tenant_id = '48002864-8800-4000-9000-000000000001'::uuid
      and opportunity_key like 'demo-meeting-%';
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'vyron_cost_suppliers') then
    delete from public.vyron_cost_suppliers
    where id in (
      'd26f1001-0001-4000-8000-000000000001','d26f1001-0002-4000-8000-000000000002',
      'd26f1001-0003-4000-8000-000000000003','d26f1001-0004-4000-8000-000000000004',
      'd26f1001-0005-4000-8000-000000000005','d26f1001-0006-4000-8000-000000000006'
    );
  end if;
end $$;

-- Ensure tenant exists
insert into public.vyron_cost_companies (id, name)
values ('48002864-8800-4000-9000-000000000001', 'Handcrafted Food Products')
on conflict (id) do update set name = excluded.name;

do $$
begin
  if public.vyron_demo_table_exists('vyron_companies')
     and public.vyron_demo_has_columns('vyron_companies', array['id','company_name','trading_name','currency_code','vat_percent']) then
    insert into public.vyron_companies (
      id, company_name, trading_name, subscription_plan, subscription_status, currency_code, vat_percent
    )
    values (
      '48002864-8800-4000-9000-000000000001',
      'Metanoia Hospitality (Pty) Ltd',
      'Handcrafted Food Products',
      'Demo', 'Client Demo', 'ZAR', 15
    )
    on conflict (id) do update set
      trading_name = excluded.trading_name,
      currency_code = excluded.currency_code,
      vat_percent = excluded.vat_percent;
  else
    raise notice 'Skipping vyron_companies branding: table or columns missing';
  end if;
end $$;

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'vyron_po_approval_rules') then
    insert into public.vyron_po_approval_rules (company_id, auto_approve_below, supervisor_approve_below, require_po_before_invoice_approval)
    values ('48002864-8800-4000-9000-000000000001', 5000, 25000, true)
    on conflict (company_id) do nothing;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Suppliers (6)
-- ---------------------------------------------------------------------------
insert into public.vyron_cost_suppliers (
  id, company_id, supplier_name, category, contact_email, invoice_email, risk_status, last_price_movement,
  demo_seed_key, is_demo
) values
('d26f1001-0001-4000-8000-000000000001','48002864-8800-4000-9000-000000000001','N1 Restaurant Suppliers','Protein','orders@n1suppliers.co.za','accounts@n1suppliers.co.za','Watch',12.0,'vyron_cost_meeting_2026',true),
('d26f1001-0002-4000-8000-000000000002','48002864-8800-4000-9000-000000000001','Bidfood','Protein','cpt@bidfood.co.za','invoices@bidfood.co.za','Stable',4.2,'vyron_cost_meeting_2026',true),
('d26f1001-0003-4000-8000-000000000003','48002864-8800-4000-9000-000000000001','Freddy Hirsch','Spice & Processed','sales@freddyhirsch.co.za','accounts@freddyhirsch.co.za','Stable',2.1,'vyron_cost_meeting_2026',true),
('d26f1001-0004-4000-8000-000000000004','48002864-8800-4000-9000-000000000001','Crown National','Protein','orders@crowncorp.co.za','ap@crowncorp.co.za','Watch',9.0,'vyron_cost_meeting_2026',true),
('d26f1001-0005-4000-8000-000000000005','48002864-8800-4000-9000-000000000001','Packaging World','Packaging','sales@packagingworld.co.za','invoices@packagingworld.co.za','High Risk',15.0,'vyron_cost_meeting_2026',true),
('d26f1001-0006-4000-8000-000000000006','48002864-8800-4000-9000-000000000001','Cape Flour Mills','Dry Goods','orders@capeflour.co.za','accounts@capeflour.co.za','Stable',3.5,'vyron_cost_meeting_2026',true)
on conflict (id) do update set
  supplier_name = excluded.supplier_name,
  category = excluded.category,
  risk_status = excluded.risk_status,
  last_price_movement = excluded.last_price_movement,
  demo_seed_key = excluded.demo_seed_key,
  is_demo = excluded.is_demo;

-- ---------------------------------------------------------------------------
-- 2–3. Ingredients + Packaging (16 items)
-- ---------------------------------------------------------------------------
insert into public.vyron_cost_ingredients (
  id, company_id, supplier_id, ingredient_name, category, purchase_unit, recipe_unit,
  purchase_cost, previous_cost, yield_percent, true_unit_cost, current_alert, demo_seed_key, is_demo
) values
('d26f2001-0001-4000-8000-000000000001','48002864-8800-4000-9000-000000000001','d26f1001-0001-4000-8000-000000000001','Beef Mince','Protein','kg','kg',99.68,89.00,100,99.68,'Price +12% May 2026','vyron_cost_meeting_2026',true),
('d26f2001-0002-4000-8000-000000000002','48002864-8800-4000-9000-000000000001','d26f1001-0002-4000-8000-000000000002','Chicken Fillets','Protein','kg','kg',77.76,72.00,100,77.76,'Price +8% May 2026','vyron_cost_meeting_2026',true),
('d26f2001-0003-4000-8000-000000000003','48002864-8800-4000-9000-000000000001','d26f1001-0004-4000-8000-000000000004','Mutton Legs Deboned','Protein','kg','kg',103.55,95.00,92,112.55,'Yield 92% — price +9%','vyron_cost_meeting_2026',true),
('d26f2001-0004-4000-8000-000000000004','48002864-8800-4000-9000-000000000001','d26f1001-0001-4000-8000-000000000001','Ostrich Mince','Protein','kg','kg',145.00,145.00,100,145.00,null,'vyron_cost_meeting_2026',true),
('d26f2001-0005-4000-8000-000000000005','48002864-8800-4000-9000-000000000001','d26f1001-0006-4000-8000-000000000006','Pastry Flour','Dry Goods','kg','kg',18.50,18.50,100,18.50,null,'vyron_cost_meeting_2026',true),
('d26f2001-0006-4000-8000-000000000006','48002864-8800-4000-9000-000000000001','d26f1001-0002-4000-8000-000000000002','Cheese','Dairy','kg','kg',125.08,118.00,100,125.08,'Price +6% May 2026','vyron_cost_meeting_2026',true),
('d26f2001-0007-4000-8000-000000000007','48002864-8800-4000-9000-000000000001','d26f1001-0003-4000-8000-000000000003','Tomato Paste','Dry Goods','kg','kg',42.00,42.00,100,42.00,null,'vyron_cost_meeting_2026',true),
('d26f2001-0008-4000-8000-000000000008','48002864-8800-4000-9000-000000000001','d26f1001-0002-4000-8000-000000000002','Onions','Fresh','kg','kg',12.50,12.50,85,14.71,null,'vyron_cost_meeting_2026',true),
('d26f2001-0009-4000-8000-000000000009','48002864-8800-4000-9000-000000000001','d26f1001-0003-4000-8000-000000000003','Gravy Mix','Dry Goods','kg','kg',28.00,28.00,100,28.00,null,'vyron_cost_meeting_2026',true),
('d26f2001-0010-4000-8000-000000000010','48002864-8800-4000-9000-000000000001','d26f1001-0003-4000-8000-000000000003','Spices','Spice','kg','kg',185.00,185.00,100,185.00,null,'vyron_cost_meeting_2026',true),
('d26f2002-0001-4000-8000-000000000001','48002864-8800-4000-9000-000000000001','d26f1001-0005-4000-8000-000000000005','Pie Box','Packaging','each','each',3.28,2.85,100,3.28,'Price +15% May 2026','vyron_cost_meeting_2026',true),
('d26f2002-0002-4000-8000-000000000002','48002864-8800-4000-9000-000000000001','d26f1001-0005-4000-8000-000000000005','Pie Sleeve','Packaging','each','each',0.45,0.45,100,0.45,null,'vyron_cost_meeting_2026',true),
('d26f2002-0003-4000-8000-000000000003','48002864-8800-4000-9000-000000000001','d26f1001-0005-4000-8000-000000000005','Product Label','Packaging','each','each',0.22,0.22,100,0.22,null,'vyron_cost_meeting_2026',true),
('d26f2002-0004-4000-8000-000000000004','48002864-8800-4000-9000-000000000001','d26f1001-0005-4000-8000-000000000005','Carton','Packaging','each','each',8.50,8.50,100,8.50,null,'vyron_cost_meeting_2026',true),
('d26f2002-0005-4000-8000-000000000005','48002864-8800-4000-9000-000000000001','d26f1001-0005-4000-8000-000000000005','Foil Tray','Packaging','each','each',1.15,1.15,100,1.15,null,'vyron_cost_meeting_2026',true),
('d26f2002-0006-4000-8000-000000000006','48002864-8800-4000-9000-000000000001','d26f1001-0005-4000-8000-000000000005','Plastic Bag','Packaging','each','each',0.18,0.18,100,0.18,null,'vyron_cost_meeting_2026',true)
on conflict (id) do update set
  purchase_cost = excluded.purchase_cost,
  previous_cost = excluded.previous_cost,
  true_unit_cost = excluded.true_unit_cost,
  current_alert = excluded.current_alert,
  demo_seed_key = excluded.demo_seed_key,
  is_demo = excluded.is_demo;

-- ---------------------------------------------------------------------------
-- 4. Finished products (5 pies)
-- ---------------------------------------------------------------------------
insert into public.vyron_cost_products (
  id, company_id, product_name, category, status, selling_price, total_cost, target_gp,
  salary_cost, packaging_cost, overhead_cost, wastage_percent, demo_seed_key, is_demo
) values
('d26f3001-0001-4000-8000-000000000001','48002864-8800-4000-9000-000000000001','Steak Pie','Retail Pie','Active',22.00,8.42,62,1.20,3.90,0.45,4,'vyron_cost_meeting_2026',true),
('d26f3001-0002-4000-8000-000000000002','48002864-8800-4000-9000-000000000001','Chicken Pie','Retail Pie','Active',20.00,7.65,62,1.20,3.90,0.45,4,'vyron_cost_meeting_2026',true),
('d26f3001-0003-4000-8000-000000000003','48002864-8800-4000-9000-000000000001','Pepper Steak Pie','Retail Pie','GP Risk',21.50,8.18,62,1.20,3.90,0.45,4,'vyron_cost_meeting_2026',true),
('d26f3001-0004-4000-8000-000000000004','48002864-8800-4000-9000-000000000001','Mutton Pie','Retail Pie','Active',23.00,8.95,61,1.20,3.90,0.45,4,'vyron_cost_meeting_2026',true),
('d26f3001-0005-4000-8000-000000000005','48002864-8800-4000-9000-000000000001','Cheese & Onion Pie','Retail Pie','Active',19.00,6.88,64,1.20,3.90,0.45,3,'vyron_cost_meeting_2026',true)
on conflict (id) do update set
  selling_price = excluded.selling_price,
  total_cost = excluded.total_cost,
  target_gp = excluded.target_gp,
  demo_seed_key = excluded.demo_seed_key,
  is_demo = excluded.is_demo;

-- ---------------------------------------------------------------------------
-- 5. BOMs / Recipes (5)
-- ---------------------------------------------------------------------------
insert into public.vyron_cost_recipes (
  id, company_id, recipe_name, recipe_type, category, yield_qty, total_cost, selling_price, target_gp, status, version_note,
  demo_seed_key, is_demo
) values
('d26f4001-0001-4000-8000-000000000001','48002864-8800-4000-9000-000000000001','Steak Pie BOM','Production Recipe','Retail Pie',1,8.42,22.00,62,'Approved','180g unit — labour R1.20, wastage 4%','vyron_cost_meeting_2026',true),
('d26f4001-0002-4000-8000-000000000002','48002864-8800-4000-9000-000000000001','Chicken Pie BOM','Production Recipe','Retail Pie',1,7.65,20.00,62,'Approved','180g unit','vyron_cost_meeting_2026',true),
('d26f4001-0003-4000-8000-000000000003','48002864-8800-4000-9000-000000000001','Pepper Steak Pie BOM','Production Recipe','Retail Pie',1,8.18,21.50,62,'Review','Pepper spice blend from Freddy Hirsch','vyron_cost_meeting_2026',true),
('d26f4001-0004-4000-8000-000000000004','48002864-8800-4000-9000-000000000001','Mutton Pie BOM','Production Recipe','Retail Pie',1,8.95,23.00,61,'Approved','Mutton yield 92%','vyron_cost_meeting_2026',true),
('d26f4001-0005-4000-8000-000000000005','48002864-8800-4000-9000-000000000001','Cheese & Onion Pie BOM','Production Recipe','Retail Pie',1,6.88,19.00,64,'Approved','Vegetarian line','vyron_cost_meeting_2026',true)
on conflict (id) do update set total_cost = excluded.total_cost, selling_price = excluded.selling_price, demo_seed_key = excluded.demo_seed_key;

insert into public.vyron_cost_product_recipe_links (
  id, company_id, product_id, recipe_id, recipe_name_snapshot, portion_qty, portion_cost, demo_seed_key, is_demo
) values
('d26f4101-0001-4000-8000-000000000001','48002864-8800-4000-9000-000000000001','d26f3001-0001-4000-8000-000000000001','d26f4001-0001-4000-8000-000000000001','Steak Pie BOM',1,8.42,'vyron_cost_meeting_2026',true),
('d26f4101-0002-4000-8000-000000000002','48002864-8800-4000-9000-000000000001','d26f3001-0002-4000-8000-000000000002','d26f4001-0002-4000-8000-000000000002','Chicken Pie BOM',1,7.65,'vyron_cost_meeting_2026',true),
('d26f4101-0003-4000-8000-000000000003','48002864-8800-4000-9000-000000000001','d26f3001-0003-4000-8000-000000000003','d26f4001-0003-4000-8000-000000000003','Pepper Steak Pie BOM',1,8.18,'vyron_cost_meeting_2026',true),
('d26f4101-0004-4000-8000-000000000004','48002864-8800-4000-9000-000000000001','d26f3001-0004-4000-8000-000000000004','d26f4001-0004-4000-8000-000000000004','Mutton Pie BOM',1,8.95,'vyron_cost_meeting_2026',true),
('d26f4101-0005-4000-8000-000000000005','48002864-8800-4000-9000-000000000001','d26f3001-0005-4000-8000-000000000005','d26f4001-0005-4000-8000-000000000005','Cheese & Onion Pie BOM',1,6.88,'vyron_cost_meeting_2026',true)
on conflict (id) do nothing;

insert into public.vyron_cost_product_cost_lines (
  id, company_id, product_id, product_name, line_type, line_name, quantity, unit, unit_cost, wastage_percent, line_cost_imported, demo_seed_key, is_demo
) values
('d26f4201-0001-4000-8000-000000000001','48002864-8800-4000-9000-000000000001','d26f3001-0001-4000-8000-000000000001','Steak Pie','Ingredient','Beef Mince',0.085,'kg',99.68,4,8.47,'vyron_cost_meeting_2026',true),
('d26f4201-0002-4000-8000-000000000002','48002864-8800-4000-9000-000000000001','d26f3001-0001-4000-8000-000000000001','Steak Pie','Ingredient','Pastry Flour',0.055,'kg',18.50,2,1.02,'vyron_cost_meeting_2026',true),
('d26f4201-0003-4000-8000-000000000003','48002864-8800-4000-9000-000000000001','d26f3001-0001-4000-8000-000000000001','Steak Pie','Packaging','Pie Box',1,'each',3.28,0,3.28,'vyron_cost_meeting_2026',true),
('d26f4201-0004-4000-8000-000000000004','48002864-8800-4000-9000-000000000001','d26f3001-0002-4000-8000-000000000002','Chicken Pie','Ingredient','Chicken Fillets',0.080,'kg',77.76,4,6.22,'vyron_cost_meeting_2026',true),
('d26f4201-0005-4000-8000-000000000005','48002864-8800-4000-9000-000000000001','d26f3001-0004-4000-8000-000000000004','Mutton Pie','Ingredient','Mutton Legs Deboned',0.090,'kg',112.55,8,10.13,'vyron_cost_meeting_2026',true),
('d26f4201-0006-4000-8000-000000000006','48002864-8800-4000-9000-000000000001','d26f3001-0005-4000-8000-000000000005','Cheese & Onion Pie','Ingredient','Cheese',0.040,'kg',125.08,2,5.00,'vyron_cost_meeting_2026',true)
on conflict (id) do update set unit_cost = excluded.unit_cost;

insert into public.vyron_cost_recipe_items (
  id, company_id, recipe_id, ingredient_id, ingredient_name_snapshot, quantity, unit, true_unit_cost, demo_seed_key, is_demo
) values
('d26f4301-0001-4000-8000-000000000001','48002864-8800-4000-9000-000000000001','d26f4001-0001-4000-8000-000000000001','d26f2001-0001-4000-8000-000000000001','Beef Mince',0.085,'kg',99.68,'vyron_cost_meeting_2026',true),
('d26f4301-0002-4000-8000-000000000002','48002864-8800-4000-9000-000000000001','d26f4001-0002-4000-8000-000000000002','d26f2001-0002-4000-8000-000000000002','Chicken Fillets',0.080,'kg',77.76,'vyron_cost_meeting_2026',true)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 6. Purchase Orders (16) — line_total is generated when present; seed sets qty/price/VAT only
-- ---------------------------------------------------------------------------
do $$
begin
  if not public.vyron_demo_table_exists('vyron_cost_purchase_orders')
     or not public.vyron_demo_has_columns('vyron_cost_purchase_orders', array[
       'id','company_id','supplier_id','po_number','status','subtotal','vat_amount','total','demo_seed_key'
     ]) then
    raise notice 'Skipping PO/GRN/back-order seed: vyron_cost_purchase_orders incomplete. Run vyron-cost-demo-schema-catchup.sql';
    return;
  end if;

  if public.vyron_demo_is_generated_column('vyron_cost_purchase_orders', 'subtotal')
     or public.vyron_demo_is_generated_column('vyron_cost_purchase_orders', 'vat_amount')
     or public.vyron_demo_is_generated_column('vyron_cost_purchase_orders', 'total') then
    insert into public.vyron_cost_purchase_orders (
      id, company_id, supplier_id, po_number, supplier_name_snapshot, status, order_date,
      expected_total, invoice_total, outstanding_amount, match_status,
      notes, demo_seed_key, is_demo
    ) values
    ('d26f5001-0001-4000-8000-000000000001','48002864-8800-4000-9000-000000000001','d26f1001-0001-4000-8000-000000000001','HFP-PO-2026-001','N1 Restaurant Suppliers','Fully Received','2026-05-02',49220,49220,0,'Matched','Beef mince weekly — fully received','vyron_cost_meeting_2026',true),
    ('d26f5001-0002-4000-8000-000000000002','48002864-8800-4000-9000-000000000001','d26f1001-0002-4000-8000-000000000002','HFP-PO-2026-002','Bidfood','Fully Received','2026-05-05',21390,21390,0,'Matched','Chicken fillets','vyron_cost_meeting_2026',true),
    ('d26f5001-0003-4000-8000-000000000003','48002864-8800-4000-9000-000000000001','d26f1001-0005-4000-8000-000000000005','HFP-PO-2026-003','Packaging World','Fully Received','2026-05-06',10062.50,10062.50,0,'Matched','Pie boxes May run','vyron_cost_meeting_2026',true),
    ('d26f5001-0004-4000-8000-000000000004','48002864-8800-4000-9000-000000000001','d26f1001-0004-4000-8000-000000000004','HFP-PO-2026-004','Crown National','Partially Received','2026-05-08',17480,0,8740,'Partial Match','Mutton legs — back order 50kg','vyron_cost_meeting_2026',true),
    ('d26f5001-0005-4000-8000-000000000005','48002864-8800-4000-9000-000000000001','d26f1001-0006-4000-8000-000000000006','HFP-PO-2026-005','Cape Flour Mills','Fully Received','2026-05-10',4830,4830,0,'Matched','Pastry flour','vyron_cost_meeting_2026',true),
    ('d26f5001-0006-4000-8000-000000000006','48002864-8800-4000-9000-000000000001','d26f1001-0002-4000-8000-000000000002','HFP-PO-2026-006','Bidfood','Invoice Variance','2026-05-12',11270,12450,0,'Price Variance','Cheese — invoice R1,180 above PO','vyron_cost_meeting_2026',true),
    ('d26f5001-0007-4000-8000-000000000007','48002864-8800-4000-9000-000000000001','d26f1001-0003-4000-8000-000000000003','HFP-PO-2026-007','Freddy Hirsch','Fully Received','2026-05-14',4197.50,4197.50,0,'Matched','Spices & gravy','vyron_cost_meeting_2026',true),
    ('d26f5001-0008-4000-8000-000000000008','48002864-8800-4000-9000-000000000001','d26f1001-0001-4000-8000-000000000001','HFP-PO-2026-008','N1 Restaurant Suppliers','Approved','2026-05-18',44275,0,44275,'Awaiting GRN','Open beef order','vyron_cost_meeting_2026',true),
    ('d26f5001-0009-4000-8000-000000000009','48002864-8800-4000-9000-000000000001','d26f1001-0002-4000-8000-000000000002','HFP-PO-2026-009','Bidfood','Sent','2026-05-20',14260,0,14260,null,'Chicken — delivery due 28 May','vyron_cost_meeting_2026',true),
    ('d26f5001-0010-4000-8000-000000000010','48002864-8800-4000-9000-000000000001','d26f1001-0005-4000-8000-000000000005','HFP-PO-2026-010','Packaging World','Approved','2026-05-22',7130,0,7130,null,'Sleeves & labels','vyron_cost_meeting_2026',true),
    ('d26f5001-0011-4000-8000-000000000011','48002864-8800-4000-9000-000000000001','d26f1001-0004-4000-8000-000000000004','HFP-PO-2026-011','Crown National','Partially Received','2026-05-24',10235,0,5117.50,'Qty Variance','Ostrich mince — short delivered 25kg','vyron_cost_meeting_2026',true),
    ('d26f5001-0012-4000-8000-000000000012','48002864-8800-4000-9000-000000000001','d26f1001-0001-4000-8000-000000000001','HFP-PO-2026-012','N1 Restaurant Suppliers','Cancelled','2026-05-15',25300,0,0,null,'Cancelled — duplicate PO raised','vyron_cost_meeting_2026',true),
    ('d26f5001-0013-4000-8000-000000000013','48002864-8800-4000-9000-000000000001','d26f1001-0002-4000-8000-000000000002','HFP-PO-2026-013','Bidfood','Draft','2026-05-26',6210,0,6210,null,'Onions & tomato paste draft','vyron_cost_meeting_2026',true),
    ('d26f5001-0014-4000-8000-000000000014','48002864-8800-4000-9000-000000000001','d26f1001-0005-4000-8000-000000000005','HFP-PO-2026-014','Packaging World','Partially Received','2026-05-27',5175,0,2587.50,'Partial Match','Cartons — 50% received','vyron_cost_meeting_2026',true),
    ('d26f5001-0015-4000-8000-000000000015','48002864-8800-4000-9000-000000000001','d26f1001-0006-4000-8000-000000000006','HFP-PO-2026-015','Cape Flour Mills','Sent','2026-05-28',3220,0,3220,null,'Flour top-up','vyron_cost_meeting_2026',true),
    ('d26f5001-0016-4000-8000-000000000016','48002864-8800-4000-9000-000000000001','d26f1001-0003-4000-8000-000000000003','HFP-PO-2026-016','Freddy Hirsch','Approved','2026-05-29',2242.50,0,2242.50,null,'Spice reorder','vyron_cost_meeting_2026',true)
    on conflict (id) do update set status = excluded.status, invoice_total = excluded.invoice_total, match_status = excluded.match_status;
  else
    insert into public.vyron_cost_purchase_orders (
      id, company_id, supplier_id, po_number, supplier_name_snapshot, status, order_date,
      subtotal, vat_amount, total, expected_total, invoice_total, outstanding_amount, match_status,
      notes, demo_seed_key, is_demo
    ) values
    ('d26f5001-0001-4000-8000-000000000001','48002864-8800-4000-9000-000000000001','d26f1001-0001-4000-8000-000000000001','HFP-PO-2026-001','N1 Restaurant Suppliers','Fully Received','2026-05-02',42800,6420,49220,49220,49220,0,'Matched','Beef mince weekly — fully received','vyron_cost_meeting_2026',true),
('d26f5001-0002-4000-8000-000000000002','48002864-8800-4000-9000-000000000001','d26f1001-0002-4000-8000-000000000002','HFP-PO-2026-002','Bidfood','Fully Received','2026-05-05',18600,2790,21390,21390,21390,0,'Matched','Chicken fillets','vyron_cost_meeting_2026',true),
('d26f5001-0003-4000-8000-000000000003','48002864-8800-4000-9000-000000000001','d26f1001-0005-4000-8000-000000000005','HFP-PO-2026-003','Packaging World','Fully Received','2026-05-06',8750,1312.50,10062.50,10062.50,10062.50,0,'Matched','Pie boxes May run','vyron_cost_meeting_2026',true),
('d26f5001-0004-4000-8000-000000000004','48002864-8800-4000-9000-000000000001','d26f1001-0004-4000-8000-000000000004','HFP-PO-2026-004','Crown National','Partially Received','2026-05-08',15200,2280,17480,17480,0,8740,'Partial Match','Mutton legs — back order 50kg','vyron_cost_meeting_2026',true),
('d26f5001-0005-4000-8000-000000000005','48002864-8800-4000-9000-000000000001','d26f1001-0006-4000-8000-000000000006','HFP-PO-2026-005','Cape Flour Mills','Fully Received','2026-05-10',4200,630,4830,4830,4830,0,'Matched','Pastry flour','vyron_cost_meeting_2026',true),
('d26f5001-0006-4000-8000-000000000006','48002864-8800-4000-9000-000000000001','d26f1001-0002-4000-8000-000000000002','HFP-PO-2026-006','Bidfood','Invoice Variance','2026-05-12',9800,1470,11270,11270,12450,0,'Price Variance','Cheese — invoice R1,180 above PO','vyron_cost_meeting_2026',true),
('d26f5001-0007-4000-8000-000000000007','48002864-8800-4000-9000-000000000001','d26f1001-0003-4000-8000-000000000003','HFP-PO-2026-007','Freddy Hirsch','Fully Received','2026-05-14',3650,547.50,4197.50,4197.50,4197.50,0,'Matched','Spices & gravy','vyron_cost_meeting_2026',true),
('d26f5001-0008-4000-8000-000000000008','48002864-8800-4000-9000-000000000001','d26f1001-0001-4000-8000-000000000001','HFP-PO-2026-008','N1 Restaurant Suppliers','Approved','2026-05-18',38500,5775,44275,44275,0,44275,'Awaiting GRN','Open beef order','vyron_cost_meeting_2026',true),
('d26f5001-0009-4000-8000-000000000009','48002864-8800-4000-9000-000000000001','d26f1001-0002-4000-8000-000000000002','HFP-PO-2026-009','Bidfood','Sent','2026-05-20',12400,1860,14260,14260,0,14260,null,'Chicken — delivery due 28 May','vyron_cost_meeting_2026',true),
('d26f5001-0010-4000-8000-000000000010','48002864-8800-4000-9000-000000000001','d26f1001-0005-4000-8000-000000000005','HFP-PO-2026-010','Packaging World','Approved','2026-05-22',6200,930,7130,7130,0,7130,null,'Sleeves & labels','vyron_cost_meeting_2026',true),
('d26f5001-0011-4000-8000-000000000011','48002864-8800-4000-9000-000000000001','d26f1001-0004-4000-8000-000000000004','HFP-PO-2026-011','Crown National','Partially Received','2026-05-24',8900,1335,10235,10235,0,5117.50,'Qty Variance','Ostrich mince — short delivered 25kg','vyron_cost_meeting_2026',true),
('d26f5001-0012-4000-8000-000000000012','48002864-8800-4000-9000-000000000001','d26f1001-0001-4000-8000-000000000001','HFP-PO-2026-012','N1 Restaurant Suppliers','Cancelled','2026-05-15',22000,3300,25300,25300,0,0,null,'Cancelled — duplicate PO raised','vyron_cost_meeting_2026',true),
('d26f5001-0013-4000-8000-000000000013','48002864-8800-4000-9000-000000000001','d26f1001-0002-4000-8000-000000000002','HFP-PO-2026-013','Bidfood','Draft','2026-05-26',5400,810,6210,6210,0,6210,null,'Onions & tomato paste draft','vyron_cost_meeting_2026',true),
('d26f5001-0014-4000-8000-000000000014','48002864-8800-4000-9000-000000000001','d26f1001-0005-4000-8000-000000000005','HFP-PO-2026-014','Packaging World','Partially Received','2026-05-27',4500,675,5175,5175,0,2587.50,'Partial Match','Cartons — 50% received','vyron_cost_meeting_2026',true),
('d26f5001-0015-4000-8000-000000000015','48002864-8800-4000-9000-000000000001','d26f1001-0006-4000-8000-000000000006','HFP-PO-2026-015','Cape Flour Mills','Sent','2026-05-28',2800,420,3220,3220,0,3220,null,'Flour top-up','vyron_cost_meeting_2026',true),
('d26f5001-0016-4000-8000-000000000016','48002864-8800-4000-9000-000000000001','d26f1001-0003-4000-8000-000000000003','HFP-PO-2026-016','Freddy Hirsch','Approved','2026-05-29',1950,292.50,2242.50,2242.50,0,2242.50,null,'Spice reorder','vyron_cost_meeting_2026',true)
    on conflict (id) do update set status = excluded.status, invoice_total = excluded.invoice_total, match_status = excluded.match_status;
  end if;

  if public.vyron_demo_table_exists('vyron_cost_purchase_order_lines')
     and public.vyron_demo_has_columns('vyron_cost_purchase_order_lines', array[
       'id','company_id','purchase_order_id','item_type','item_id','item_name','quantity','unit',
       'unit_price','vat_rate','vat_amount','ordered_qty','received_qty','outstanding_qty','sort_order','demo_seed_key'
     ]) then
    insert into public.vyron_cost_purchase_order_lines (
      id, company_id, purchase_order_id, item_type, item_id, item_name, quantity, unit, unit_price,
      vat_rate, vat_amount, ordered_qty, received_qty, outstanding_qty, sort_order, demo_seed_key, is_demo
    ) values
    ('d26f5101-0001-4000-8000-000000000001','48002864-8800-4000-9000-000000000001','d26f5001-0001-4000-8000-000000000001','ingredient','d26f2001-0001-4000-8000-000000000001','Beef Mince',400,'kg',89.00,15,5340,400,400,0,1,'vyron_cost_meeting_2026',true),
    ('d26f5101-0002-4000-8000-000000000002','48002864-8800-4000-9000-000000000001','d26f5001-0002-4000-8000-000000000002','ingredient','d26f2001-0002-4000-8000-000000000002','Chicken Fillets',240,'kg',72.00,15,2592,240,240,0,1,'vyron_cost_meeting_2026',true),
    ('d26f5101-0003-4000-8000-000000000003','48002864-8800-4000-9000-000000000001','d26f5001-0003-4000-8000-000000000003','packaging','d26f2002-0001-4000-8000-000000000001','Pie Box',2500,'each',2.85,15,1068.75,2500,2500,0,1,'vyron_cost_meeting_2026',true),
    ('d26f5101-0004-4000-8000-000000000004','48002864-8800-4000-9000-000000000001','d26f5001-0004-4000-8000-000000000004','ingredient','d26f2001-0003-4000-8000-000000000003','Mutton Legs Deboned',160,'kg',95.00,15,2280,160,80,80,1,'vyron_cost_meeting_2026',true),
    ('d26f5101-0005-4000-8000-000000000005','48002864-8800-4000-9000-000000000001','d26f5001-0006-4000-8000-000000000006','ingredient','d26f2001-0006-4000-8000-000000000006','Cheese',80,'kg',118.00,15,1416,80,80,0,1,'vyron_cost_meeting_2026',true),
    ('d26f5101-0006-4000-8000-000000000006','48002864-8800-4000-9000-000000000001','d26f5001-0011-4000-8000-000000000011','ingredient','d26f2001-0004-4000-8000-000000000004','Ostrich Mince',50,'kg',145.00,15,1087.50,50,25,25,1,'vyron_cost_meeting_2026',true)
    on conflict (id) do update set received_qty = excluded.received_qty, outstanding_qty = excluded.outstanding_qty;
  else
    raise notice 'Skipping PO lines: vyron_cost_purchase_order_lines schema incomplete. Run vyron-cost-demo-schema-catchup.sql';
  end if;

-- 7. GRNs + back orders
  if public.vyron_demo_table_exists('vyron_cost_goods_receipts')
     and public.vyron_demo_has_columns('vyron_cost_goods_receipts', array[
       'id','company_id','purchase_order_id','grn_number','receipt_type','status','demo_seed_key'
     ]) then
insert into public.vyron_cost_goods_receipts (
  id, company_id, purchase_order_id, grn_number, supplier_id, supplier_name_snapshot, receipt_type, status, received_by, notes, demo_seed_key, is_demo
) values
('d26f6001-0001-4000-8000-000000000001','48002864-8800-4000-9000-000000000001','d26f5001-0001-4000-8000-000000000001','GRN-HFP-001','d26f1001-0001-4000-8000-000000000001','N1 Restaurant Suppliers','full','Posted','Warehouse A','Full beef receipt','vyron_cost_meeting_2026',true),
('d26f6001-0002-4000-8000-000000000002','48002864-8800-4000-9000-000000000001','d26f5001-0004-4000-8000-000000000004','GRN-HFP-002','d26f1001-0004-4000-8000-000000000004','Crown National','partial','Posted','Warehouse A','Partial mutton — 80kg received','vyron_cost_meeting_2026',true),
('d26f6001-0003-4000-8000-000000000003','48002864-8800-4000-9000-000000000001','d26f5001-0004-4000-8000-000000000004','GRN-HFP-003','d26f1001-0004-4000-8000-000000000004','Crown National','damaged','Posted','QA Team','2kg damaged — credit note expected','vyron_cost_meeting_2026',true),
('d26f6001-0004-4000-8000-000000000004','48002864-8800-4000-9000-000000000001','d26f5001-0011-4000-8000-000000000011','GRN-HFP-004','d26f1001-0004-4000-8000-000000000004','Crown National','partial','Posted','Warehouse B','Ostrich short delivery','vyron_cost_meeting_2026',true)
on conflict (id) do nothing;
  end if;

  if public.vyron_demo_table_exists('vyron_cost_goods_receipt_lines')
     and public.vyron_demo_has_columns('vyron_cost_goods_receipt_lines', array[
       'id','company_id','goods_receipt_id','purchase_order_line_id','item_name','received_qty','demo_seed_key'
     ]) then
insert into public.vyron_cost_goods_receipt_lines (
  id, company_id, goods_receipt_id, purchase_order_line_id, item_name, ordered_qty, received_qty, damaged_qty, rejected_qty, outstanding_qty, unit, demo_seed_key, is_demo
) values
('d26f6101-0001-4000-8000-000000000001','48002864-8800-4000-9000-000000000001','d26f6001-0001-4000-8000-000000000001','d26f5101-0001-4000-8000-000000000001','Beef Mince',400,400,0,0,0,'kg','vyron_cost_meeting_2026',true),
('d26f6101-0002-4000-8000-000000000002','48002864-8800-4000-9000-000000000001','d26f6001-0002-4000-8000-000000000002','d26f5101-0004-4000-8000-000000000004','Mutton Legs Deboned',160,78,2,0,80,'kg','vyron_cost_meeting_2026',true),
('d26f6101-0003-4000-8000-000000000003','48002864-8800-4000-9000-000000000001','d26f6001-0004-4000-8000-000000000004','d26f5101-0006-4000-8000-000000000006','Ostrich Mince',50,25,0,0,25,'kg','vyron_cost_meeting_2026',true)
on conflict (id) do nothing;
  end if;

  if public.vyron_demo_table_exists('vyron_cost_back_orders')
     and public.vyron_demo_has_columns('vyron_cost_back_orders', array[
       'id','company_id','purchase_order_id','item_name','outstanding_qty','status','demo_seed_key'
     ]) then
insert into public.vyron_cost_back_orders (
  id, company_id, purchase_order_id, purchase_order_line_id, supplier_id, supplier_name_snapshot, item_name, outstanding_qty, expected_date, status, demo_seed_key, is_demo
) values
('d26f6201-0001-4000-8000-000000000001','48002864-8800-4000-9000-000000000001','d26f5001-0004-4000-8000-000000000004','d26f5101-0004-4000-8000-000000000004','d26f1001-0004-4000-8000-000000000004','Crown National','Mutton Legs Deboned',80,'2026-06-05','Open','vyron_cost_meeting_2026',true),
('d26f6201-0002-4000-8000-000000000002','48002864-8800-4000-9000-000000000001','d26f5001-0011-4000-8000-000000000011','d26f5101-0006-4000-8000-000000000006','d26f1001-0004-4000-8000-000000000004','Crown National','Ostrich Mince',25,'2026-06-08','Open','vyron_cost_meeting_2026',true)
on conflict (id) do nothing;
  end if;

end $$;

-- 8–9. Supplier invoices (vyron_documents) — 22 documents, VAT 15%
do $$
begin
  if not public.vyron_demo_table_exists('vyron_documents')
     or not public.vyron_demo_has_columns('vyron_documents', array[
       'id','tenant_id','document_type','supplier_name','invoice_number','total','status','demo_seed_key'
     ]) then
    raise notice 'Skipping document seed: vyron_documents incomplete. Run vyron-cost-demo-schema-catchup.sql';
    return;
  end if;

insert into public.vyron_documents (
  id, tenant_id, document_type, supplier_name, invoice_number, invoice_date, purchase_order_number,
  purchase_order_id, subtotal, vat, total, currency, confidence, status,
  storage_bucket, storage_path, original_filename, file_mime,
  approved_at, approved_by, archived_at, demo_seed_key, is_demo
) values
('d26f7001-0001-4000-8000-000000000001','48002864-8800-4000-9000-000000000001','supplier_invoice','N1 Restaurant Suppliers','N1-INV-4401','2026-05-03','HFP-PO-2026-001','d26f5001-0001-4000-8000-000000000001',42800,6420,49220,'ZAR',92,'approved','vyron-documents','demo/meeting/n1-inv-4401.pdf','N1-INV-4401.pdf','application/pdf',now()-interval '20 days','finance@handcraftedfoods.co.za',now()-interval '19 days','vyron_cost_meeting_2026',true),
('d26f7001-0002-4000-8000-000000000002','48002864-8800-4000-9000-000000000001','supplier_invoice','Bidfood','BDF-99281','2026-05-06','HFP-PO-2026-002','d26f5001-0002-4000-8000-000000000002',18600,2790,21390,'ZAR',88,'approved','vyron-documents','demo/meeting/bdf-99281.pdf','BDF-99281.pdf','application/pdf',now()-interval '18 days','finance@handcraftedfoods.co.za',now()-interval '17 days','vyron_cost_meeting_2026',true),
('d26f7001-0003-4000-8000-000000000003','48002864-8800-4000-9000-000000000001','supplier_invoice','Packaging World','PW-77821','2026-05-07','HFP-PO-2026-003','d26f5001-0003-4000-8000-000000000003',8750,1312.50,10062.50,'ZAR',81,'extracted','vyron-documents','demo/meeting/pw-77821.pdf','PW-77821.pdf','application/pdf',null,null,null,'vyron_cost_meeting_2026',true),
('d26f7001-0004-4000-8000-000000000004','48002864-8800-4000-9000-000000000001','supplier_invoice','Crown National','CN-55201','2026-05-09','HFP-PO-2026-004','d26f5001-0004-4000-8000-000000000004',7600,1140,8740,'ZAR',79,'reviewed','vyron-documents','demo/meeting/cn-55201.pdf','CN-55201.pdf','application/pdf',null,null,null,'vyron_cost_meeting_2026',true),
('d26f7001-0005-4000-8000-000000000005','48002864-8800-4000-9000-000000000001','supplier_invoice','Bidfood','BDF-99410','2026-05-13','HFP-PO-2026-006','d26f5001-0006-4000-8000-000000000006',10800,1620,12420,'ZAR',76,'reviewed','vyron-documents','demo/meeting/bdf-99410.pdf','BDF-99410.pdf','application/pdf',null,null,null,'vyron_cost_meeting_2026',true),
('d26f7001-0006-4000-8000-000000000006','48002864-8800-4000-9000-000000000001','supplier_invoice','Freddy Hirsch','FH-33102','2026-05-15','HFP-PO-2026-007','d26f5001-0007-4000-8000-000000000007',3650,547.50,4197.50,'ZAR',90,'approved','vyron-documents','demo/meeting/fh-33102.pdf','FH-33102.pdf','application/pdf',now()-interval '14 days','buyer@demo.co.za',now()-interval '13 days','vyron_cost_meeting_2026',true),
('d26f7001-0007-4000-8000-000000000007','48002864-8800-4000-9000-000000000001','supplier_invoice','Cape Flour Mills','CFM-22018','2026-05-11',null,null,4200,630,4830,'ZAR',84,'extracted','vyron-documents','demo/meeting/cfm-22018.pdf','CFM-22018.pdf','application/pdf',null,null,null,'vyron_cost_meeting_2026',true),
('d26f7001-0008-4000-8000-000000000008','48002864-8800-4000-9000-000000000001','supplier_invoice','Bidfood','BDF-99555','2026-05-21',null,null,3200,480,3680,'ZAR',72,'extracted','vyron-documents','demo/meeting/bdf-99555.pdf','BDF-99555.pdf','application/pdf',null,null,null,'vyron_cost_meeting_2026',true),
('d26f7001-0009-4000-8000-000000000009','48002864-8800-4000-9000-000000000001','supplier_invoice','Packaging World','PW-77990','2026-05-23',null,null,5400,810,6210,'ZAR',68,'reviewed','vyron-documents','demo/meeting/pw-77990.pdf','PW-77990.pdf','application/pdf',null,null,null,'vyron_cost_meeting_2026',true),
('d26f7001-0010-4000-8000-000000000010','48002864-8800-4000-9000-000000000001','supplier_invoice','N1 Restaurant Suppliers','N1-INV-8842','2026-05-25',null,null,25000,3750,28750,'ZAR',91,'reviewed','vyron-documents','demo/meeting/n1-inv-8842-a.pdf','N1-INV-8842.pdf','application/pdf',null,null,null,'vyron_cost_meeting_2026',true),
('d26f7001-0011-4000-8000-000000000011','48002864-8800-4000-9000-000000000001','supplier_invoice','N1 Restaurant Suppliers','N1-INV-8842','2026-05-26',null,null,25000,3750,28750,'ZAR',89,'extracted','vyron-documents','demo/meeting/n1-inv-8842-b.pdf','N1-INV-8842-copy.pdf','application/pdf',null,null,null,'vyron_cost_meeting_2026',true),
('d26f7001-0012-4000-8000-000000000012','48002864-8800-4000-9000-000000000001','supplier_invoice','Packaging World','PW-77821','2026-04-28',null,null,8750,1312.50,10062.50,'ZAR',87,'archived','vyron-documents','demo/meeting/pw-77821-old.pdf','PW-77821-old.pdf','application/pdf',now()-interval '30 days','finance@handcraftedfoods.co.za',now()-interval '29 days','vyron_cost_meeting_2026',true),
('d26f7001-0013-4000-8000-000000000013','48002864-8800-4000-9000-000000000001','supplier_invoice','N1 Restaurant Suppliers','N1-INV-4502','2026-05-28','HFP-PO-2026-008',null,38500,5775,44275,'ZAR',86,'reviewed','vyron-documents','demo/meeting/n1-inv-4502.pdf','N1-INV-4502.pdf','application/pdf',null,null,null,'vyron_cost_meeting_2026',true),
('d26f7001-0014-4000-8000-000000000014','48002864-8800-4000-9000-000000000001','supplier_invoice','Crown National','CN-55330','2026-05-18',null,null,3625,543.75,4168.75,'ZAR',74,'extracted','vyron-documents','demo/meeting/cn-55330.pdf','CN-55330.pdf','application/pdf',null,null,null,'vyron_cost_meeting_2026',true),
('d26f7001-0015-4000-8000-000000000015','48002864-8800-4000-9000-000000000001','supplier_invoice','Bidfood','BDF-99601','2026-05-19',null,null,18600,2790,21390,'ZAR',83,'approved','vyron-documents','demo/meeting/bdf-99601.pdf','BDF-99601.pdf','application/pdf',now()-interval '10 days','finance@handcraftedfoods.co.za',now()-interval '9 days','vyron_cost_meeting_2026',true),
('d26f7001-0016-4000-8000-000000000016','48002864-8800-4000-9000-000000000001','supplier_invoice','Packaging World','PW-78001','2026-05-24','HFP-PO-2026-014','d26f5001-0014-4000-8000-000000000014',2250,337.50,2587.50,'ZAR',77,'reviewed','vyron-documents','demo/meeting/pw-78001.pdf','PW-78001.pdf','application/pdf',null,null,null,'vyron_cost_meeting_2026',true),
('d26f7001-0017-4000-8000-000000000017','48002864-8800-4000-9000-000000000001','supplier_invoice','Cape Flour Mills','CFM-22055','2026-05-29',null,null,2800,420,3220,'ZAR',70,'uploaded','vyron-documents','demo/meeting/cfm-22055.pdf','CFM-22055.pdf','application/pdf',null,null,null,'vyron_cost_meeting_2026',true),
('d26f7001-0018-4000-8000-000000000018','48002864-8800-4000-9000-000000000001','supplier_invoice','Freddy Hirsch','FH-33188','2026-05-30',null,null,1950,292.50,2242.50,'ZAR',65,'extracted','vyron-documents','demo/meeting/fh-33188.pdf','FH-33188.pdf','application/pdf',null,null,null,'vyron_cost_meeting_2026',true),
('d26f7001-0019-4000-8000-000000000019','48002864-8800-4000-9000-000000000001','supplier_invoice','N1 Restaurant Suppliers','N1-INV-4510','2026-05-04',null,null,42800,6420,49220,'ZAR',94,'approved','vyron-documents','demo/meeting/n1-inv-4510.pdf','N1-INV-4510.pdf','application/pdf',now()-interval '25 days','finance@handcraftedfoods.co.za',now()-interval '24 days','vyron_cost_meeting_2026',true),
('d26f7001-0020-4000-8000-000000000020','48002864-8800-4000-9000-000000000001','supplier_invoice','Packaging World','PW-VAT-01','2026-05-08',null,null,8750,1400,10150,'ZAR',71,'reviewed','vyron-documents','demo/meeting/pw-vat-01.pdf','PW-VAT-01.pdf','application/pdf',null,null,null,'vyron_cost_meeting_2026',true),
('d26f7001-0021-4000-8000-000000000021','48002864-8800-4000-9000-000000000001','supplier_invoice','Bidfood','BDF-QTY-01','2026-05-27','HFP-PO-2026-009',null,12400,1860,14260,'ZAR',78,'extracted','vyron-documents','demo/meeting/bdf-qty-01.pdf','BDF-QTY-01.pdf','application/pdf',null,null,null,'vyron_cost_meeting_2026',true),
('d26f7001-0022-4000-8000-000000000022','48002864-8800-4000-9000-000000000001','supplier_invoice','Crown National','CN-55400','2026-05-31',null,null,8900,1335,10235,'ZAR',80,'reviewed','vyron-documents','demo/meeting/cn-55400.pdf','CN-55400.pdf','application/pdf',null,null,null,'vyron_cost_meeting_2026',true)
on conflict (id) do update set status = excluded.status, purchase_order_id = excluded.purchase_order_id;

  if not public.vyron_demo_is_generated_column('vyron_document_line_items', 'line_total') then
    insert into public.vyron_document_line_items (
      id, document_id, description, quantity, unit, unit_price, vat, line_total,
      matched_entity_type, matched_entity_id, matched_entity_name, confidence_score, demo_seed_key, is_demo
    ) values
    ('d26f7101-0001-4000-8000-000000000001','d26f7001-0001-4000-8000-000000000001','Beef Mince 400kg',400,'kg',89.00,5340,42800,'ingredient','d26f2001-0001-4000-8000-000000000001','Beef Mince',94,'vyron_cost_meeting_2026',true),
    ('d26f7101-0002-4000-8000-000000000002','d26f7001-0005-4000-8000-000000000005','Cheddar Block 80kg',80,'kg',125.08,1500.96,10800,'ingredient','d26f2001-0006-4000-8000-000000000006','Cheese',88,'vyron_cost_meeting_2026',true),
    ('d26f7101-0003-4000-8000-000000000003','d26f7001-0010-4000-8000-000000000010','Beef Mince Bulk 280kg',280,'kg',89.29,3750,28750,'ingredient','d26f2001-0001-4000-8000-000000000001','Beef Mince',90,'vyron_cost_meeting_2026',true),
    ('d26f7101-0004-4000-8000-000000000004','d26f7001-0011-4000-8000-000000000011','Beef Mince Bulk 280kg',280,'kg',89.29,3750,28750,'ingredient','d26f2001-0001-4000-8000-000000000001','Beef Mince',88,'vyron_cost_meeting_2026',true),
    ('d26f7101-0005-4000-8000-000000000005','d26f7001-0003-4000-8000-000000000003','Pie Box 2500',2500,'each',2.85,1068.75,8750,'packaging','d26f2002-0001-4000-8000-000000000001','Pie Box',82,'vyron_cost_meeting_2026',true)
    on conflict (id) do nothing;
  else
    insert into public.vyron_document_line_items (
      id, document_id, description, quantity, unit, unit_price, vat,
      matched_entity_type, matched_entity_id, matched_entity_name, confidence_score, demo_seed_key, is_demo
    ) values
    ('d26f7101-0001-4000-8000-000000000001','d26f7001-0001-4000-8000-000000000001','Beef Mince 400kg',400,'kg',89.00,5340,'ingredient','d26f2001-0001-4000-8000-000000000001','Beef Mince',94,'vyron_cost_meeting_2026',true),
    ('d26f7101-0002-4000-8000-000000000002','d26f7001-0005-4000-8000-000000000005','Cheddar Block 80kg',80,'kg',125.08,1500.96,'ingredient','d26f2001-0006-4000-8000-000000000006','Cheese',88,'vyron_cost_meeting_2026',true),
    ('d26f7101-0003-4000-8000-000000000003','d26f7001-0010-4000-8000-000000000010','Beef Mince Bulk 280kg',280,'kg',89.29,3750,'ingredient','d26f2001-0001-4000-8000-000000000001','Beef Mince',90,'vyron_cost_meeting_2026',true),
    ('d26f7101-0004-4000-8000-000000000004','d26f7001-0011-4000-8000-000000000011','Beef Mince Bulk 280kg',280,'kg',89.29,3750,'ingredient','d26f2001-0001-4000-8000-000000000001','Beef Mince',88,'vyron_cost_meeting_2026',true),
    ('d26f7101-0005-4000-8000-000000000005','d26f7001-0003-4000-8000-000000000003','Pie Box 2500',2500,'each',2.85,1068.75,'packaging','d26f2002-0001-4000-8000-000000000001','Pie Box',82,'vyron_cost_meeting_2026',true)
    on conflict (id) do nothing;
  end if;

end $$;

-- 10. Price history (5 increases + product impact)
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'vyron_supplier_price_history') then

insert into public.vyron_supplier_price_history (
  id, tenant_id, supplier_id, supplier_name, document_id, entity_type, entity_id, entity_name, item_description,
  previous_price, new_price, price_difference, percentage_change, change_percent, movement_type, movement_reason,
  price_movement, item_kind, invoice_date, approved_at, approved_by, demo_seed_key, is_demo
) values
('d26f8001-0001-4000-8000-000000000001','48002864-8800-4000-9000-000000000001','d26f1001-0001-4000-8000-000000000001','N1 Restaurant Suppliers','d26f7001-0001-4000-8000-000000000001','ingredient','d26f2001-0001-4000-8000-000000000001','Beef Mince','Beef Mince 400kg',89.00,99.68,10.68,12.0000,12.0000,'increase','Supplier invoice May 2026','increase','ingredient','2026-05-03',now()-interval '19 days','finance@handcraftedfoods.co.za','vyron_cost_meeting_2026',true),
('d26f8001-0002-4000-8000-000000000002','48002864-8800-4000-9000-000000000001','d26f1001-0002-4000-8000-000000000002','Bidfood','d26f7001-0002-4000-8000-000000000002','ingredient','d26f2001-0002-4000-8000-000000000002','Chicken Fillets','Chicken Fillets 240kg',72.00,77.76,5.76,8.0000,8.0000,'increase','Poultry market uplift','increase','ingredient','2026-05-06',now()-interval '17 days','finance@handcraftedfoods.co.za','vyron_cost_meeting_2026',true),
('d26f8001-0003-4000-8000-000000000003','48002864-8800-4000-9000-000000000001','d26f1001-0005-4000-8000-000000000005','Packaging World','d26f7001-0003-4000-8000-000000000003','packaging','d26f2002-0001-4000-8000-000000000001','Pie Box','Pie Box 2500',2.85,3.28,0.43,15.0877,15.0877,'increase','Board grade upgrade','increase','packaging','2026-05-07',null,null,'vyron_cost_meeting_2026',true),
('d26f8001-0004-4000-8000-000000000004','48002864-8800-4000-9000-000000000001','d26f1001-0004-4000-8000-000000000004','Crown National',null,'ingredient','d26f2001-0003-4000-8000-000000000003','Mutton Legs Deboned','Mutton Legs 160kg',95.00,103.55,8.55,9.0000,9.0000,'increase','Lamb shortage','increase','ingredient','2026-05-09',null,null,'vyron_cost_meeting_2026',true),
('d26f8001-0005-4000-8000-000000000005','48002864-8800-4000-9000-000000000001','d26f1001-0002-4000-8000-000000000002','Bidfood','d26f7001-0005-4000-8000-000000000005','ingredient','d26f2001-0006-4000-8000-000000000006','Cheese','Cheese 80kg',118.00,125.08,7.08,6.0000,6.0000,'increase','Dairy supplier increase','increase','ingredient','2026-05-13',null,null,'vyron_cost_meeting_2026',true)
on conflict (id) do update set new_price = excluded.new_price, percentage_change = excluded.percentage_change;

  end if;
end $$;

-- 11. Duplicate invoice risks
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'vyron_procurement_risk_alerts') then

insert into public.vyron_procurement_risk_alerts (
  id, tenant_id, supplier_id, supplier_name, document_id, risk_type, severity, title, description, status, metadata, demo_seed_key, is_demo
) values
('d26f8101-0001-4000-8000-000000000001','48002864-8800-4000-9000-000000000001','d26f1001-0001-4000-8000-000000000001','N1 Restaurant Suppliers','d26f7001-0011-4000-8000-000000000011','duplicate_invoice','high','Duplicate invoice N1-INV-8842','Same supplier, invoice number and total R28,750 as d26f7001-0010','open','{"duplicate_of":"d26f7001-0010-4000-8000-000000000010","invoice_number":"N1-INV-8842","total":28750}'::jsonb,'vyron_cost_meeting_2026',true),
('d26f8101-0002-4000-8000-000000000002','48002864-8800-4000-9000-000000000001','d26f1001-0001-4000-8000-000000000001','N1 Restaurant Suppliers','d26f7001-0010-4000-8000-000000000010','duplicate_invoice','high','Possible duplicate payment','Matched to second upload with identical header','open','{"duplicate_of":"d26f7001-0011-4000-8000-000000000011"}'::jsonb,'vyron_cost_meeting_2026',true)
on conflict (id) do nothing;

  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'vyron_cost_invoice_risk_findings') then

insert into public.vyron_cost_invoice_risk_findings (
  id, company_id, invoice_number, supplier_name, invoice_amount, risk_type, risk_score, ai_confidence, duplicate_of, review_status, document_id, demo_seed_key, is_demo
) values
('d26f8201-0001-4000-8000-000000000001','48002864-8800-4000-9000-000000000001','N1-INV-8842','N1 Restaurant Suppliers',28750,'duplicate_invoice',94.5,96.0,'N1-INV-8842 (prior upload)','Pending Review','d26f7001-0011-4000-8000-000000000011','vyron_cost_meeting_2026',true),
('d26f8201-0002-4000-8000-000000000002','48002864-8800-4000-9000-000000000001','PW-VAT-01','Packaging World',10150,'vat_variance',78.0,85.0,null,'Investigate','d26f7001-0020-4000-8000-000000000020','vyron_cost_meeting_2026',true),
('d26f8201-0003-4000-8000-000000000003','48002864-8800-4000-9000-000000000001','BDF-99410','Bidfood',12420,'price_variance',82.0,88.0,null,'Pending Review','d26f7001-0005-4000-8000-000000000005','vyron_cost_meeting_2026',true)
on conflict (id) do nothing;

  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'vyron_procurement_three_way_matches') then

-- Three-way matches
insert into public.vyron_procurement_three_way_matches (
  id, company_id, document_id, purchase_order_id, goods_receipt_id, match_status,
  po_qty, invoice_qty, grn_qty, qty_variance, po_unit_price, invoice_unit_price, price_variance,
  po_total, invoice_total, grn_total, total_variance, demo_seed_key, is_demo
) values
('d26f8301-0001-4000-8000-000000000001','48002864-8800-4000-9000-000000000001','d26f7001-0001-4000-8000-000000000001','d26f5001-0001-4000-8000-000000000001','d26f6001-0001-4000-8000-000000000001','Matched',400,400,400,0,89.00,89.00,0,49220,49220,49220,0,'vyron_cost_meeting_2026',true),
('d26f8301-0002-4000-8000-000000000002','48002864-8800-4000-9000-000000000001','d26f7001-0005-4000-8000-000000000005','d26f5001-0006-4000-8000-000000000006',null,'Price Variance',80,80,80,0,118.00,125.08,7.08,11270,12420,11270,1150,'vyron_cost_meeting_2026',true),
('d26f8301-0003-4000-8000-000000000003','48002864-8800-4000-9000-000000000001','d26f7001-0004-4000-8000-000000000004','d26f5001-0004-4000-8000-000000000004','d26f6001-0002-4000-8000-000000000002','Partial Match',160,80,78,-2,95.00,95.00,0,17480,8740,8740,0,'vyron_cost_meeting_2026',true)
on conflict (id) do nothing;

  end if;

  if public.vyron_demo_table_exists('vyron_recovery_calculations')
     and public.vyron_demo_has_columns('vyron_recovery_calculations', array[
       'tenant_id','opportunity_key','category','title','monthly_recovery','annual_recovery'
     ]) then
insert into public.vyron_recovery_calculations (
  tenant_id, opportunity_key, category, title, confidence_level, confidence_score, is_estimated,
  formula_expression, formula_inputs, products_affected, recommended_action,
  monthly_recovery, annual_recovery, estimated_recovery, status
) values
('48002864-8800-4000-9000-000000000001','demo-meeting-beef-gp','margin_erosion','Beef inflation not in Steak Pie price','High Confidence',88,false,'monthly = (new_cost - old_cost) * monthly_units','{"old_cost":89,"new_cost":99.68,"monthly_units":12000,"monthly_units_source":"production forecast"}','["Steak Pie","Pepper Steak Pie"]','Increase Steak Pie to R23.50 or renegotiate N1',18420,221040,221040,'Identified'),
('48002864-8800-4000-9000-000000000001','demo-meeting-packaging-gp','margin_erosion','Pie box increase eroding GP','High Confidence',85,false,'monthly = box_delta * units','{"delta":0.43,"units":18000}', '["Steak Pie","Chicken Pie","Mutton Pie"]','Negotiate Packaging World or change sleeve spec',6450,77400,77400,'Identified'),
('48002864-8800-4000-9000-000000000001','demo-meeting-duplicate','duplicate_prevention','Duplicate N1-INV-8842 prevented','Verified',96,false,'recovery = duplicate_total','{"invoice_total":28750}', '[]','Block second payment — AP hold',2395.83,28750,28750,'Verified'),
('48002864-8800-4000-9000-000000000001','demo-meeting-po-variance','procurement_variance','PO vs invoice cheese variance','Medium Confidence',72,true,'monthly = invoice_over_po','{"variance":1150}', '["Cheese & Onion Pie"]','Request credit note from Bidfood',1150,13800,13800,'In Progress'),
('48002864-8800-4000-9000-000000000001','demo-meeting-backorder','supply_risk','Mutton back order production risk','Medium Confidence',70,true,'risk_cost = days_delay * daily_margin','{"days":7,"daily_margin":4200}', '["Mutton Pie"]','Expedite Crown National back order',4200,50400,50400,'Identified'),
('48002864-8800-4000-9000-000000000001','demo-meeting-chicken-price','supplier_inflation','Chicken fillet +8% — review Bidfood','High Confidence',84,false,'annual = monthly_spend * pct','{"pct":8,"monthly_spend":18600}', '["Chicken Pie"]','RFQ to N1 for chicken fillets',1488,17856,17856,'Identified')
on conflict (tenant_id, opportunity_key) do update set monthly_recovery = excluded.monthly_recovery, status = excluded.status;
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'vyron_cost_recovery_opportunities') then

  if public.vyron_demo_has_columns('vyron_cost_recovery_opportunities', array['title']) then
    -- Enterprise / calculated-opportunities schema (title NOT NULL)
    if public.vyron_demo_has_columns('vyron_cost_recovery_opportunities', array[
      'opportunity_type','monthly_value','annual_value','recommended_action','data_source'
    ]) then
      insert into public.vyron_cost_recovery_opportunities (
        id, company_id, title, opportunity_type, description,
        monthly_value, annual_value, confidence, status, recommended_action, data_source,
        opportunity, category, monthly_saving, annual_saving, difficulty, action, demo_seed_key, is_demo
      ) values
      ('d26f8401-0001-4000-8000-000000000001','48002864-8800-4000-9000-000000000001',
        'Recover duplicate N1 invoice exposure','Duplicate Prevention',
        'Duplicate N1-INV-8842 uploads with identical R28,750 total',
        2395.83,28750,96,'Open','Hold AP payment on N1-INV-8842 duplicate upload','vyron_cost_meeting_2026',
        'Recover duplicate N1 invoice exposure','Duplicate Prevention',2395.83,28750,'Low',
        'Hold AP payment on N1-INV-8842 duplicate upload','vyron_cost_meeting_2026',true),
      ('d26f8401-0002-4000-8000-000000000002','48002864-8800-4000-9000-000000000001',
        'Steak Pie selling price below inflation-adjusted cost','Margin Recovery',
        'Beef inflation not fully recovered in Steak Pie shelf price',
        18420,221040,88,'Open','Model R23.50 shelf price with 60% GP target','vyron_cost_meeting_2026',
        'Steak Pie selling price below inflation-adjusted cost','Margin Recovery',18420,221040,'Medium',
        'Model R23.50 shelf price with 60% GP target','vyron_cost_meeting_2026',true)
      on conflict (id) do nothing;
    else
      insert into public.vyron_cost_recovery_opportunities (
        id, company_id, title, opportunity, category, monthly_saving, annual_saving, difficulty, status, action, demo_seed_key, is_demo
      ) values
      ('d26f8401-0001-4000-8000-000000000001','48002864-8800-4000-9000-000000000001',
        'Recover duplicate N1 invoice exposure','Recover duplicate N1 invoice exposure','Duplicate Prevention',
        2395.83,28750,'Low','Open','Hold AP payment on N1-INV-8842 duplicate upload','vyron_cost_meeting_2026',true),
      ('d26f8401-0002-4000-8000-000000000002','48002864-8800-4000-9000-000000000001',
        'Steak Pie selling price below inflation-adjusted cost','Steak Pie selling price below inflation-adjusted cost','Margin Recovery',
        18420,221040,'Medium','Open','Model R23.50 shelf price with 60% GP target','vyron_cost_meeting_2026',true)
      on conflict (id) do nothing;
    end if;
  elsif public.vyron_demo_has_columns('vyron_cost_recovery_opportunities', array['opportunity','category','monthly_saving']) then
    insert into public.vyron_cost_recovery_opportunities (
      id, company_id, opportunity, category, monthly_saving, annual_saving, difficulty, status, action, demo_seed_key, is_demo
    ) values
    ('d26f8401-0001-4000-8000-000000000001','48002864-8800-4000-9000-000000000001','Recover duplicate N1 invoice exposure','Duplicate Prevention',2395.83,28750,'Low','Open','Hold AP payment on N1-INV-8842 duplicate upload','vyron_cost_meeting_2026',true),
    ('d26f8401-0002-4000-8000-000000000002','48002864-8800-4000-9000-000000000001','Steak Pie selling price below inflation-adjusted cost','Margin Recovery',18420,221040,'Medium','Open','Model R23.50 shelf price with 60% GP target','vyron_cost_meeting_2026',true)
    on conflict (id) do nothing;
  else
    raise notice 'Skipping vyron_cost_recovery_opportunities: required columns missing';
  end if;

  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'vyron_cost_leakage_findings') then

insert into public.vyron_cost_leakage_findings (
  id, company_id, finding_type, title, description, estimated_monthly_loss, severity, status, supplier_name, demo_seed_key, is_demo
) values
('d26f8501-0001-4000-8000-000000000001','48002864-8800-4000-9000-000000000001','Duplicate Invoice','N1-INV-8842 duplicate risk','Two uploads same number and R28,750 total',28750,'Critical','Investigate','N1 Restaurant Suppliers','vyron_cost_meeting_2026',true),
('d26f8501-0002-4000-8000-000000000002','48002864-8800-4000-9000-000000000001','Supplier Inflation','Beef mince +12%','Not fully recovered in pie selling prices',18420,'High','Open','N1 Restaurant Suppliers','vyron_cost_meeting_2026',true)
on conflict (id) do nothing;

  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'vyron_procurement_recommendations') then

-- 17. AI Procurement recommendations (12)
insert into public.vyron_procurement_recommendations (
  tenant_id, recommendation_key, category, title, summary, recommended_action, why_exists,
  data_used, formula_expression, confidence_score, confidence_level,
  affected_products, affected_suppliers, potential_benefit_monthly, potential_benefit_annual,
  source_type, problem_statement, cause_statement
) values
('48002864-8800-4000-9000-000000000001','demo-meeting-rec-01','price_increase','Review N1 beef mince +12%','Beef moved R89 to R99.68/kg','Negotiate 6-month fixed price or pass through to Steak Pie','Approved invoice and price history show 12% increase','{"supplier":"N1 Restaurant Suppliers","item":"Beef Mince"}','annual = spend * 0.12',88,'High Confidence','["Steak Pie"]','["N1 Restaurant Suppliers"]',18420,221040,'price_history','Protein cost spike','Global beef feed costs'),
('48002864-8800-4000-9000-000000000001','demo-meeting-rec-02','switch_supplier','RFQ chicken fillets to N1','Bidfood chicken +8%','Request N1 quote for 240kg/week chicken','Bidfood price history vs N1 protein basket','{"current":"Bidfood","alt":"N1 Restaurant Suppliers"}','saving = volume * price_delta',75,'Medium Confidence','["Chicken Pie"]','["Bidfood","N1 Restaurant Suppliers"]',1488,17856,'price_history','Single-source poultry','Limited RFQ discipline'),
('48002864-8800-4000-9000-000000000001','demo-meeting-rec-03','selling_price','Increase Steak Pie to R23.50','GP below 62% target after beef inflation','Update price list and retailer packs','BOM cost vs selling price R22','{"product":"Steak Pie","target_gp":62}','gp_gap = target - actual',82,'High Confidence','["Steak Pie"]','[]',4200,50400,'recovery','Margin erosion','Ingredient inflation lag'),
('48002864-8800-4000-9000-000000000001','demo-meeting-rec-04','back_order','Expedite Crown mutton back order','80kg mutton outstanding on PO-004','Call Crown National — production week 23','Open back order GRN-HFP-002','{"po":"HFP-PO-2026-004","qty":80}','risk_cost = qty * unit_cost',70,'Medium Confidence','["Mutton Pie"]','["Crown National"]',4200,50400,'purchase_order','Stock-out risk','Partial GRN'),
('48002864-8800-4000-9000-000000000001','demo-meeting-rec-05','duplicate_invoice','Investigate N1-INV-8842 duplicate','Two documents same total','Block duplicate before payment run','vyron_procurement_risk_alerts duplicate_invoice','{"invoice":"N1-INV-8842"}','recovery = duplicate_total',96,'High Confidence','[]','["N1 Restaurant Suppliers"]',28750,28750,'invoice','Duplicate payment risk','Re-uploaded PDF'),
('48002864-8800-4000-9000-000000000001','demo-meeting-rec-06','overstock','Reduce pie box overstock','2500 boxes received — 18 days cover','Delay PO-010 packaging until stock < 10 days','Inventory cover vs production plan','{"item":"Pie Box","days_cover":18}','monthly = excess_cover * unit_cost',68,'Medium Confidence','[]','["Packaging World"]',2100,25200,'inventory','Working capital tie-up','Bulk PO sizing'),
('48002864-8800-4000-9000-000000000001','demo-meeting-rec-07','low_stock','Review ostrich mince low stock','25kg back order — gourmet line risk','Confirm alternate protein or pause Ostrich pie','Back order + partial GRN','{"item":"Ostrich Mince"}','short_qty * true_unit_cost',72,'Medium Confidence','[]','["Crown National"]',1800,21600,'inventory','Supply gap','Short delivery'),
('48002864-8800-4000-9000-000000000001','demo-meeting-rec-08','negotiate','Negotiate Packaging World pie boxes','+15% on pie boxes — R0.43/unit','Request 90-day price hold','Price history PW-77821','{"item":"Pie Box"}','annual = units * price_delta',80,'High Confidence','["Steak Pie","Chicken Pie"]','["Packaging World"]',6450,77400,'price_history','Packaging inflation','Raw board costs'),
('48002864-8800-4000-9000-000000000001','demo-meeting-rec-09','bom_costing','Update BOM costing — cheese +6%','Cheese & Onion Pie BOM stale','Refresh BOM from approved BDF-99410','Invoice vs ingredient master','{"product":"Cheese & Onion Pie"}','bom_delta = invoice - master',85,'High Confidence','["Cheese & Onion Pie"]','["Bidfood"]',890,10680,'invoice','Stale BOM','Delayed cost refresh'),
('48002864-8800-4000-9000-000000000001','demo-meeting-rec-10','variance','Investigate cheese PO invoice variance','Invoice R1,150 above PO','Match 3-way before approve BDF-99410','three_way_match price_variance','{"po":"HFP-PO-2026-006"}','variance = invoice - po',78,'Medium Confidence','["Cheese & Onion Pie"]','["Bidfood"]',1150,13800,'purchase_order','AP mismatch','Invoice price above PO'),
('48002864-8800-4000-9000-000000000001','demo-meeting-rec-11','link_invoice','Link CFM-22018 to PO-005','Flour invoice awaiting PO link','Match Cape Flour Mills invoice to HFP-PO-2026-005','Unlinked document in inbox','{"doc":"CFM-22018"}','match_confidence = po_link_score',90,'High Confidence','[]','["Cape Flour Mills"]',0,0,'invoice','Process delay','Missing PO link'),
('48002864-8800-4000-9000-000000000001','demo-meeting-rec-12','vat_check','Review PW-VAT-01 VAT difference','VAT R1,400 vs expected R1,312.50','Request corrected tax invoice','Invoice VAT line audit','{"invoice":"PW-VAT-01"}','vat_delta = actual - expected',74,'Medium Confidence','[]','["Packaging World"]',87.50,1050,'invoice','VAT mismatch','Supplier tax coding error')
on conflict (tenant_id, recommendation_key) do update set title = excluded.title, potential_benefit_annual = excluded.potential_benefit_annual;

  end if;
end $$;

-- 14. Inventory stock + ledger (purchases from GRNs)
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'vyron_cost_stock_items') then

insert into public.vyron_cost_stock_items (
  id, company_id, item_code, description, category, entity_type, entity_id, unit,
  supplier_id, supplier_name_snapshot, current_cost, average_cost, qty_on_hand, inventory_value,
  reorder_level, stock_status, demo_seed_key, is_demo
) values
('d26f9001-0001-4000-8000-000000000001','48002864-8800-4000-9000-000000000001','ING-BEEF','Beef Mince','Protein','ingredient','d26f2001-0001-4000-8000-000000000001','kg','d26f1001-0001-4000-8000-000000000001','N1 Restaurant Suppliers',99.68,94.20,820,77337.60,200,'In Stock','vyron_cost_meeting_2026',true),
('d26f9001-0002-4000-8000-000000000002','48002864-8800-4000-9000-000000000001','ING-CHKN','Chicken Fillets','Protein','ingredient','d26f2001-0002-4000-8000-000000000002','kg','d26f1001-0002-4000-8000-000000000002','Bidfood',77.76,74.90,180,13996.80,120,'In Stock','vyron_cost_meeting_2026',true),
('d26f9001-0003-4000-8000-000000000003','48002864-8800-4000-9000-000000000001','PKG-BOX','Pie Box','Packaging','packaging','d26f2002-0001-4000-8000-000000000001','each','d26f1001-0005-4000-8000-000000000005','Packaging World',3.28,3.05,4200,13776.00,800,'In Stock','vyron_cost_meeting_2026',true),
('d26f9001-0004-4000-8000-000000000004','48002864-8800-4000-9000-000000000001','ING-MUTTON','Mutton Legs Deboned','Protein','ingredient','d26f2001-0003-4000-8000-000000000003','kg','d26f1001-0004-4000-8000-000000000004','Crown National',103.55,99.00,95,9837.25,60,'Low Stock','vyron_cost_meeting_2026',true)
on conflict (id) do update set qty_on_hand = excluded.qty_on_hand, inventory_value = excluded.inventory_value;

insert into public.vyron_cost_stock_ledger (
  id, company_id, stock_item_id, movement_type, quantity_in, quantity_out, balance_after, unit_cost, value,
  reference_type, reference_id, reference_label, actor, demo_seed_key, is_demo
) values
('d26f9101-0001-4000-8000-000000000001','48002864-8800-4000-9000-000000000001','d26f9001-0001-4000-8000-000000000001','purchase',400,0,820,89.00,35600,'grn','d26f6001-0001-4000-8000-000000000001','GRN-HFP-001 Beef receipt','Warehouse A','vyron_cost_meeting_2026',true),
('d26f9101-0002-4000-8000-000000000002','48002864-8800-4000-9000-000000000001','d26f9001-0002-4000-8000-000000000002','purchase',240,0,180,72.00,17280,'grn','d26f6001-0001-4000-8000-000000000001','GRN chicken (prior period)','Warehouse A','vyron_cost_meeting_2026',true),
('d26f9101-0003-4000-8000-000000000003','48002864-8800-4000-9000-000000000001','d26f9001-0003-4000-8000-000000000003','purchase',2500,0,4200,2.85,7125,'grn','d26f6001-0001-4000-8000-000000000001','GRN pie boxes','Warehouse A','vyron_cost_meeting_2026',true),
('d26f9101-0004-4000-8000-000000000004','48002864-8800-4000-9000-000000000001','d26f9001-0004-4000-8000-000000000004','purchase',78,0,95,95.00,7410,'grn','d26f6001-0002-4000-8000-000000000002','GRN mutton partial','Warehouse A','vyron_cost_meeting_2026',true)
on conflict (id) do nothing;

  end if;
end $$;

-- Reports centre rows
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'vyron_cost_reports') then

insert into public.vyron_cost_reports (id, company_id, report_name, report_type, status, estimated_value, demo_seed_key, is_demo) values
('d26f9201-0001-4000-8000-000000000001','48002864-8800-4000-9000-000000000001','Open Purchase Orders','Procurement','Ready',44275,'vyron_cost_meeting_2026',true),
('d26f9201-0002-4000-8000-000000000002','48002864-8800-4000-9000-000000000001','Duplicate Invoice Risks','Finance','Ready',28750,'vyron_cost_meeting_2026',true),
('d26f9201-0003-4000-8000-000000000003','48002864-8800-4000-9000-000000000001','Supplier Price Increases (May 2026)','Procurement','Ready',77400,'vyron_cost_meeting_2026',true),
('d26f9201-0004-4000-8000-000000000004','48002864-8800-4000-9000-000000000001','GRN vs Invoice Variances','Operations','Review',8740,'vyron_cost_meeting_2026',true),
('d26f9201-0005-4000-8000-000000000005','48002864-8800-4000-9000-000000000001','Recovery Intelligence Summary','Executive','Ready',221040,'vyron_cost_meeting_2026',true)
on conflict (id) do nothing;

  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'vyron_cost_procurement_risk_findings') then

insert into public.vyron_cost_procurement_risk_findings (
  id, company_id, supplier_name, category_name, risk_type, risk_score, price_change_percent, spend_amount, action_required, demo_seed_key, is_demo
) values
('d26f8601-0001-4000-8000-000000000001','48002864-8800-4000-9000-000000000001','N1 Restaurant Suppliers','Protein','Supplier Inflation',88.0,12.0,184520.00,'Negotiate beef contract','vyron_cost_meeting_2026',true),
('d26f8601-0002-4000-8000-000000000002','48002864-8800-4000-9000-000000000001','Packaging World','Packaging','Supplier Inflation',82.0,15.1,62400.00,'Renegotiate pie box pricing','vyron_cost_meeting_2026',true),
('d26f8601-0003-4000-8000-000000000003','48002864-8800-4000-9000-000000000001','Bidfood','Dairy','Supplier Inflation',76.0,6.0,98400.00,'Review cheese alternate','vyron_cost_meeting_2026',true)
on conflict (id) do nothing;

  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'vyron_procurement_audit_log') then

insert into public.vyron_procurement_audit_log (id, company_id, event_type, entity_type, entity_id, entity_label, detail, actor, demo_seed_key, is_demo) values
('d26f9301-0001-4000-8000-000000000001','48002864-8800-4000-9000-000000000001','price_change','ingredient','d26f2001-0001-4000-8000-000000000001','Beef Mince','Purchase cost updated R89 → R99.68 (+12%) from N1-INV-4401','system','vyron_cost_meeting_2026',true),
('d26f9301-0002-4000-8000-000000000002','48002864-8800-4000-9000-000000000001','duplicate_flag','document','d26f7001-0011-4000-8000-000000000011','N1-INV-8842','Duplicate invoice risk flagged — same number and total','system','vyron_cost_meeting_2026',true)
on conflict (id) do nothing;

  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Verification (run after seed)
-- ---------------------------------------------------------------------------
select 'demo_seed_summary' as label,
  (select count(*) from public.vyron_cost_suppliers where demo_seed_key = 'vyron_cost_meeting_2026') as suppliers,
  (case when exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'vyron_cost_purchase_orders')
    then (select count(*) from public.vyron_cost_purchase_orders where demo_seed_key = 'vyron_cost_meeting_2026') else 0 end) as purchase_orders,
  (case when exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'vyron_cost_goods_receipts')
    then (select count(*) from public.vyron_cost_goods_receipts where demo_seed_key = 'vyron_cost_meeting_2026') else 0 end) as grns,
  (case when exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'vyron_documents')
    then (select count(*) from public.vyron_documents where demo_seed_key = 'vyron_cost_meeting_2026') else 0 end) as documents,
  (case when exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'vyron_procurement_three_way_matches')
    then (select count(*) from public.vyron_procurement_three_way_matches where demo_seed_key = 'vyron_cost_meeting_2026') else 0 end) as three_way_matches,
  (case when exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'vyron_procurement_recommendations')
    then (select count(*) from public.vyron_procurement_recommendations where recommendation_key like 'demo-meeting-%') else 0 end) as ai_recommendations,
  (case when exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'vyron_recovery_calculations')
    then (select count(*) from public.vyron_recovery_calculations where opportunity_key like 'demo-meeting-%') else 0 end) as recovery_calcs;
