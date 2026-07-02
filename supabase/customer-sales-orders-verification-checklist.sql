-- Customer Sales Orders migration verification checklist
-- Target migrations:
-- 1) 20260706_customer_sales_orders.sql
-- 2) 20260707_customer_sales_orders_commercial_workflow.sql
--
-- This script verifies existence and shape only. It does NOT assume migrations succeeded.

-- =====================================================
-- A. TABLES CREATED
-- =====================================================
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'vyron_customer_sales_orders',
    'vyron_customer_sales_order_lines',
    'vyron_customer_sales_order_allocations',
    'vyron_customer_sales_order_invoice_links',
    'vyron_customer_sales_order_audit',
    'vyron_customer_sales_order_production_links',
    'vyron_customer_sales_order_requisition_links'
  )
order by table_name;

-- Missing tables (should return zero rows)
with expected(name) as (
  values
    ('vyron_customer_sales_orders'),
    ('vyron_customer_sales_order_lines'),
    ('vyron_customer_sales_order_allocations'),
    ('vyron_customer_sales_order_invoice_links'),
    ('vyron_customer_sales_order_audit'),
    ('vyron_customer_sales_order_production_links'),
    ('vyron_customer_sales_order_requisition_links')
)
select e.name as missing_table
from expected e
left join information_schema.tables t
  on t.table_schema = 'public'
 and t.table_name = e.name
where t.table_name is null
order by e.name;

-- =====================================================
-- B. COLUMNS
-- =====================================================
-- Core columns for sales order header
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'vyron_customer_sales_orders'
  and column_name in (
    'id','company_id','order_number','customer_id','customer_name','delivery_address','contact_name','salesperson','warehouse',
    'status','requested_delivery_date','notes','subtotal','vat_amount','total','cost_value','gross_profit','gp_percentage',
    'approved_at','approved_by','picked_at','packed_at','dispatched_at','cancelled_at','requires_approval','approval_flags',
    'created_at','updated_at'
  )
order by column_name;

-- Core columns for lines
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'vyron_customer_sales_order_lines'
  and column_name in (
    'id','company_id','sales_order_id','product_id','description','quantity','unit','selling_price','discount_pct','tax_rate',
    'line_total','cost_per_unit','invoiced_qty','sort_order','created_at','updated_at'
  )
order by column_name;

-- Core columns for allocations
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'vyron_customer_sales_order_allocations'
  and column_name in (
    'id','company_id','sales_order_id','sales_order_line_id','product_id','reserved_qty','available_qty_snapshot','status','created_at','updated_at'
  )
order by column_name;

-- Core columns for invoice links, audit, production links, requisition links
select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and (
    (table_name = 'vyron_customer_sales_order_invoice_links' and column_name in ('id','company_id','sales_order_id','invoice_id','created_at')) or
    (table_name = 'vyron_customer_sales_order_audit' and column_name in ('id','company_id','sales_order_id','event_type','actor','from_status','to_status','detail','metadata','created_at')) or
    (table_name = 'vyron_customer_sales_order_production_links' and column_name in ('id','company_id','sales_order_id','production_run_id','created_at')) or
    (table_name = 'vyron_customer_sales_order_requisition_links' and column_name in ('id','company_id','sales_order_id','requisition_id','created_at'))
  )
order by table_name, column_name;

-- Customer credit control extension columns
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'vyron_customers'
  and column_name in ('credit_limit','on_hold')
order by column_name;

-- =====================================================
-- C. FOREIGN KEYS
-- =====================================================
select
  tc.table_name,
  kcu.column_name,
  ccu.table_name as referenced_table,
  ccu.column_name as referenced_column,
  rc.delete_rule
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
  on tc.constraint_name = kcu.constraint_name
 and tc.table_schema = kcu.table_schema
join information_schema.referential_constraints rc
  on tc.constraint_name = rc.constraint_name
 and tc.table_schema = rc.constraint_schema
join information_schema.constraint_column_usage ccu
  on ccu.constraint_name = tc.constraint_name
 and ccu.table_schema = tc.table_schema
where tc.table_schema = 'public'
  and tc.constraint_type = 'FOREIGN KEY'
  and tc.table_name in (
    'vyron_customer_sales_orders',
    'vyron_customer_sales_order_lines',
    'vyron_customer_sales_order_allocations',
    'vyron_customer_sales_order_invoice_links',
    'vyron_customer_sales_order_audit',
    'vyron_customer_sales_order_production_links',
    'vyron_customer_sales_order_requisition_links'
  )
order by tc.table_name, kcu.column_name;

-- =====================================================
-- D. INDEXES
-- =====================================================
select schemaname, tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in (
    'vyron_customer_sales_orders',
    'vyron_customer_sales_order_lines',
    'vyron_customer_sales_order_allocations',
    'vyron_customer_sales_order_invoice_links',
    'vyron_customer_sales_order_audit',
    'vyron_customer_sales_order_production_links',
    'vyron_customer_sales_order_requisition_links'
  )
order by tablename, indexname;

-- =====================================================
-- E. RLS POLICIES
-- =====================================================
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'vyron_customer_sales_orders',
    'vyron_customer_sales_order_lines',
    'vyron_customer_sales_order_allocations',
    'vyron_customer_sales_order_invoice_links',
    'vyron_customer_sales_order_audit',
    'vyron_customer_sales_order_production_links',
    'vyron_customer_sales_order_requisition_links'
  )
order by tablename, policyname;

-- RLS enabled state
select c.relname as table_name, c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'vyron_customer_sales_orders',
    'vyron_customer_sales_order_lines',
    'vyron_customer_sales_order_allocations',
    'vyron_customer_sales_order_invoice_links',
    'vyron_customer_sales_order_audit',
    'vyron_customer_sales_order_production_links',
    'vyron_customer_sales_order_requisition_links'
  )
order by c.relname;

-- =====================================================
-- F. TRIGGERS
-- =====================================================
select event_object_table as table_name, trigger_name, event_manipulation, action_timing, action_statement
from information_schema.triggers
where trigger_schema = 'public'
  and event_object_table in (
    'vyron_customer_sales_orders',
    'vyron_customer_sales_order_lines',
    'vyron_customer_sales_order_allocations',
    'vyron_customer_sales_order_invoice_links',
    'vyron_customer_sales_order_audit',
    'vyron_customer_sales_order_production_links',
    'vyron_customer_sales_order_requisition_links'
  )
order by event_object_table, trigger_name;

-- =====================================================
-- G. DATA PATH SANITY CHECKS (safe read-only)
-- =====================================================
-- 1) Count rows by key status in sales orders
select status, count(*)
from public.vyron_customer_sales_orders
group by status
order by status;

-- 2) Check for orphan lines (should be zero rows)
select l.id as line_id
from public.vyron_customer_sales_order_lines l
left join public.vyron_customer_sales_orders h on h.id = l.sales_order_id
where h.id is null
limit 50;

-- 3) Check for orphan allocations (should be zero rows)
select a.id as allocation_id
from public.vyron_customer_sales_order_allocations a
left join public.vyron_customer_sales_orders h on h.id = a.sales_order_id
left join public.vyron_customer_sales_order_lines l on l.id = a.sales_order_line_id
where h.id is null or l.id is null
limit 50;

-- 4) Check for duplicate order numbers per company (should be zero rows)
select company_id, order_number, count(*)
from public.vyron_customer_sales_orders
group by company_id, order_number
having count(*) > 1;

-- 5) Check audit rows linked to existing orders
select count(*) as audit_rows, count(distinct sales_order_id) as audited_orders
from public.vyron_customer_sales_order_audit;

-- 6) Check traceability links presence
select
  (select count(*) from public.vyron_customer_sales_order_production_links) as production_links,
  (select count(*) from public.vyron_customer_sales_order_requisition_links) as requisition_links,
  (select count(*) from public.vyron_customer_sales_order_invoice_links) as invoice_links;
