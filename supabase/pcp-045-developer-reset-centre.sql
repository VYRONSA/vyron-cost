-- PCP-045 — Developer Supervisor Reset Centre
-- GENERATED FILE — produced by scripts/tmp-generate-reset-sql.mjs from the live schema.
-- Do not hand-edit; regenerate after any schema change.
--
-- Every delete is scoped to a single company. Tables without company_id are scoped
-- through their parent chain. Each function body runs in a single transaction.

set search_path = public;

-- ============================================================ audit
create table if not exists public.vyron_dev_reset_audit (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.vyron_cost_companies(id) on delete cascade,
  module text not null,
  actor_user_id text,
  actor_email text,
  reason text,
  rows_deleted jsonb not null default '{}'::jsonb,
  total_rows_deleted bigint not null default 0,
  duration_ms integer,
  backup_created boolean not null default false,
  backup_location text,
  backup_acknowledged_without boolean not null default false,
  status text not null default 'success',
  warnings text[] not null default '{}',
  created_at timestamptz not null default now()
);

-- Additive for installs that predate PCP-045A.
alter table public.vyron_dev_reset_audit add column if not exists backup_created boolean not null default false;
alter table public.vyron_dev_reset_audit add column if not exists backup_location text;
alter table public.vyron_dev_reset_audit add column if not exists backup_acknowledged_without boolean not null default false;

create index if not exists idx_vyron_dev_reset_audit_company
  on public.vyron_dev_reset_audit(company_id, created_at desc);

alter table public.vyron_dev_reset_audit enable row level security;

-- No policies: the table is reachable only through SECURITY DEFINER functions
-- and the service role. Never exposed to end users.

-- ============================================================ preview
-- Read-only. Returns the row count a reset would remove, per table.
create or replace function public.vyron_dev_reset_preview(p_company_id uuid, p_module text default 'factory')
returns table(table_name text, row_count bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_company_id is null then
    raise exception 'company_id is required';
  end if;
  if not exists (select 1 from public.vyron_cost_companies c where c.id = p_company_id) then
    raise exception 'unknown company_id: %', p_company_id;
  end if;

  if p_module = 'supplier_invoices' then
    return query select 'vyron_cost_supplier_invoice_lines'::text, count(*)::bigint from public.vyron_cost_supplier_invoice_lines where invoice_id IN (SELECT id FROM public.vyron_cost_supplier_invoices WHERE supplier_id IN (SELECT id FROM public.vyron_cost_suppliers WHERE company_id = p_company_id));
    return query select 'vyron_cost_invoice_lines'::text, count(*)::bigint from public.vyron_cost_invoice_lines where invoice_id IN (SELECT id FROM public.vyron_cost_invoice_headers WHERE company_id = p_company_id);
    return query select 'vyron_document_field_corrections'::text, count(*)::bigint from public.vyron_document_field_corrections where document_id IN (SELECT id FROM public.vyron_documents WHERE tenant_id = p_company_id);
    return query select 'vyron_procurement_three_way_matches'::text, count(*)::bigint from public.vyron_procurement_three_way_matches where company_id = p_company_id;
    return query select 'vyron_procurement_risk_alerts'::text, count(*)::bigint from public.vyron_procurement_risk_alerts where tenant_id = p_company_id;
    return query select 'vyron_document_cost_audit'::text, count(*)::bigint from public.vyron_document_cost_audit where tenant_id = p_company_id;
    return query select 'vyron_supplier_contracts'::text, count(*)::bigint from public.vyron_supplier_contracts where company_id = p_company_id;
    return query select 'vyron_document_extraction_logs'::text, count(*)::bigint from public.vyron_document_extraction_logs where document_id IN (SELECT id FROM public.vyron_documents WHERE tenant_id = p_company_id);
    return query select 'vyron_supplier_price_history'::text, count(*)::bigint from public.vyron_supplier_price_history where tenant_id = p_company_id;
    return query select 'vyron_document_line_items'::text, count(*)::bigint from public.vyron_document_line_items where document_id IN (SELECT id FROM public.vyron_documents WHERE tenant_id = p_company_id);
    return query select 'vyron_cost_invoice_risk_findings'::text, count(*)::bigint from public.vyron_cost_invoice_risk_findings where company_id = p_company_id;
    return query select 'vyron_supplier_line_item_mappings'::text, count(*)::bigint from public.vyron_supplier_line_item_mappings where tenant_id = p_company_id;
    return query select 'vyron_supplier_invoice_learning'::text, count(*)::bigint from public.vyron_supplier_invoice_learning where tenant_id = p_company_id;
    return query select 'vyron_cost_supplier_invoices'::text, count(*)::bigint from public.vyron_cost_supplier_invoices where supplier_id IN (SELECT id FROM public.vyron_cost_suppliers WHERE company_id = p_company_id);
    return query select 'vyron_cost_invoice_headers'::text, count(*)::bigint from public.vyron_cost_invoice_headers where company_id = p_company_id;
    return query select 'vyron_documents'::text, count(*)::bigint from public.vyron_documents where tenant_id = p_company_id;
  end if;

  if p_module = 'raw_materials' then
    return query select 'vyron_cost_back_orders'::text, count(*)::bigint from public.vyron_cost_back_orders where company_id = p_company_id;
    return query select 'vyron_cost_goods_receipt_lines'::text, count(*)::bigint from public.vyron_cost_goods_receipt_lines where company_id = p_company_id;
    return query select 'vyron_cost_stock_count_lines'::text, count(*)::bigint from public.vyron_cost_stock_count_lines where company_id = p_company_id;
    return query select 'vyron_cost_low_stock_alerts'::text, count(*)::bigint from public.vyron_cost_low_stock_alerts where company_id = p_company_id;
    return query select 'vyron_inventory_audit_log'::text, count(*)::bigint from public.vyron_inventory_audit_log where company_id = p_company_id;
    return query select 'vyron_cost_stock_ledger'::text, count(*)::bigint from public.vyron_cost_stock_ledger where company_id = p_company_id;
    return query select 'vyron_cost_inventory_transactions'::text, count(*)::bigint from public.vyron_cost_inventory_transactions where company_id = p_company_id;
    return query select 'vyron_cost_production_run_lines'::text, count(*)::bigint from public.vyron_cost_production_run_lines where company_id = p_company_id;
    return query select 'vyron_cost_supplier_invoice_lines'::text, count(*)::bigint from public.vyron_cost_supplier_invoice_lines where invoice_id IN (SELECT id FROM public.vyron_cost_supplier_invoices WHERE supplier_id IN (SELECT id FROM public.vyron_cost_suppliers WHERE company_id = p_company_id));
    return query select 'vyron_cost_recovery_opportunities'::text, count(*)::bigint from public.vyron_cost_recovery_opportunities where company_id = p_company_id;
    return query select 'vyron_cost_production_wastage'::text, count(*)::bigint from public.vyron_cost_production_wastage where company_id = p_company_id;
    return query select 'vyron_cost_purchase_order_lines'::text, count(*)::bigint from public.vyron_cost_purchase_order_lines where company_id = p_company_id;
    return query select 'vyron_cost_price_history'::text, count(*)::bigint from public.vyron_cost_price_history where supplier_id IN (SELECT id FROM public.vyron_cost_suppliers WHERE company_id = p_company_id);
    return query select 'vyron_cost_stock_items'::text, count(*)::bigint from public.vyron_cost_stock_items where company_id = p_company_id;
    return query select 'vyron_cost_ingredients'::text, count(*)::bigint from public.vyron_cost_ingredients where company_id = p_company_id;
  end if;

  if p_module = 'finished_goods' then
    return query select 'vyron_manufacturing_batch_lines'::text, count(*)::bigint from public.vyron_manufacturing_batch_lines where batch_id IN (SELECT id FROM public.vyron_manufacturing_batches WHERE company_id = p_company_id);
    return query select 'vyron_customer_price_list_audit_log'::text, count(*)::bigint from public.vyron_customer_price_list_audit_log where company_id = p_company_id;
    return query select 'vyron_cost_bom_lines'::text, count(*)::bigint from public.vyron_cost_bom_lines where company_id = p_company_id;
    return query select 'vyron_cost_production_run_lines'::text, count(*)::bigint from public.vyron_cost_production_run_lines where company_id = p_company_id;
    return query select 'vyron_cost_production_labour'::text, count(*)::bigint from public.vyron_cost_production_labour where company_id = p_company_id;
    return query select 'vyron_customer_sales_order_production_links'::text, count(*)::bigint from public.vyron_customer_sales_order_production_links where company_id = p_company_id;
    return query select 'vyron_cost_production_overhead'::text, count(*)::bigint from public.vyron_cost_production_overhead where company_id = p_company_id;
    return query select 'vyron_cost_production_wastage'::text, count(*)::bigint from public.vyron_cost_production_wastage where company_id = p_company_id;
    return query select 'vyron_cost_production_audit_log'::text, count(*)::bigint from public.vyron_cost_production_audit_log where company_id = p_company_id;
    return query select 'vyron_manufacturing_batches'::text, count(*)::bigint from public.vyron_manufacturing_batches where company_id = p_company_id;
    return query select 'vyron_customer_invoice_lines'::text, count(*)::bigint from public.vyron_customer_invoice_lines where invoice_id IN (SELECT id FROM public.vyron_customer_invoices WHERE company_id = p_company_id);
    return query select 'vyron_customer_price_list_items'::text, count(*)::bigint from public.vyron_customer_price_list_items where company_id = p_company_id;
    return query select 'vyron_cost_recovery_opportunities'::text, count(*)::bigint from public.vyron_cost_recovery_opportunities where company_id = p_company_id;
    return query select 'vyron_customer_sales_order_allocations'::text, count(*)::bigint from public.vyron_customer_sales_order_allocations where company_id = p_company_id;
    return query select 'vyron_customer_sales_order_lines'::text, count(*)::bigint from public.vyron_customer_sales_order_lines where company_id = p_company_id;
    return query select 'vyron_cost_production_runs'::text, count(*)::bigint from public.vyron_cost_production_runs where company_id = p_company_id;
    return query select 'vyron_cost_product_recipe_links'::text, count(*)::bigint from public.vyron_cost_product_recipe_links where company_id = p_company_id;
    return query select 'vyron_customer_sales_order_items'::text, count(*)::bigint from public.vyron_customer_sales_order_items where company_id = p_company_id;
    return query select 'vyron_finished_goods'::text, count(*)::bigint from public.vyron_finished_goods where company_id = p_company_id;
    return query select 'vyron_cost_products'::text, count(*)::bigint from public.vyron_cost_products where company_id = p_company_id;
    return query select 'vyron_cost_boms'::text, count(*)::bigint from public.vyron_cost_boms where company_id = p_company_id;
  end if;

  if p_module = 'boms' then
    return query select 'vyron_customer_price_list_audit_log'::text, count(*)::bigint from public.vyron_customer_price_list_audit_log where company_id = p_company_id;
    return query select 'vyron_customer_invoice_lines'::text, count(*)::bigint from public.vyron_customer_invoice_lines where invoice_id IN (SELECT id FROM public.vyron_customer_invoices WHERE company_id = p_company_id);
    return query select 'vyron_customer_price_list_items'::text, count(*)::bigint from public.vyron_customer_price_list_items where company_id = p_company_id;
    return query select 'vyron_cost_recovery_opportunities'::text, count(*)::bigint from public.vyron_cost_recovery_opportunities where company_id = p_company_id;
    return query select 'vyron_customer_sales_order_allocations'::text, count(*)::bigint from public.vyron_customer_sales_order_allocations where company_id = p_company_id;
    return query select 'vyron_customer_sales_order_lines'::text, count(*)::bigint from public.vyron_customer_sales_order_lines where company_id = p_company_id;
    return query select 'vyron_customer_sales_order_items'::text, count(*)::bigint from public.vyron_customer_sales_order_items where company_id = p_company_id;
    return query select 'vyron_cost_production_run_lines'::text, count(*)::bigint from public.vyron_cost_production_run_lines where company_id = p_company_id;
    return query select 'vyron_cost_production_labour'::text, count(*)::bigint from public.vyron_cost_production_labour where company_id = p_company_id;
    return query select 'vyron_customer_sales_order_production_links'::text, count(*)::bigint from public.vyron_customer_sales_order_production_links where company_id = p_company_id;
    return query select 'vyron_cost_production_overhead'::text, count(*)::bigint from public.vyron_cost_production_overhead where company_id = p_company_id;
    return query select 'vyron_cost_production_wastage'::text, count(*)::bigint from public.vyron_cost_production_wastage where company_id = p_company_id;
    return query select 'vyron_cost_production_audit_log'::text, count(*)::bigint from public.vyron_cost_production_audit_log where company_id = p_company_id;
    return query select 'vyron_cost_batch_runs'::text, count(*)::bigint from public.vyron_cost_batch_runs where company_id = p_company_id;
    return query select 'vyron_cost_product_recipe_links'::text, count(*)::bigint from public.vyron_cost_product_recipe_links where company_id = p_company_id;
    return query select 'vyron_cost_bom_lines'::text, count(*)::bigint from public.vyron_cost_bom_lines where company_id = p_company_id;
    return query select 'vyron_cost_production_runs'::text, count(*)::bigint from public.vyron_cost_production_runs where company_id = p_company_id;
    return query select 'vyron_cost_recipes'::text, count(*)::bigint from public.vyron_cost_recipes where company_id = p_company_id;
    return query select 'vyron_cost_boms'::text, count(*)::bigint from public.vyron_cost_boms where company_id = p_company_id;
    return query select 'vyron_cost_products'::text, count(*)::bigint from public.vyron_cost_products where company_id = p_company_id;
  end if;

  if p_module = 'production_history' then
    return query select 'vyron_cost_store_production_run_lines'::text, count(*)::bigint from public.vyron_cost_store_production_run_lines where company_id = p_company_id;
    return query select 'vyron_cost_production_run_lines'::text, count(*)::bigint from public.vyron_cost_production_run_lines where company_id = p_company_id;
    return query select 'vyron_cost_production_labour'::text, count(*)::bigint from public.vyron_cost_production_labour where company_id = p_company_id;
    return query select 'vyron_customer_sales_order_production_links'::text, count(*)::bigint from public.vyron_customer_sales_order_production_links where company_id = p_company_id;
    return query select 'vyron_cost_production_overhead'::text, count(*)::bigint from public.vyron_cost_production_overhead where company_id = p_company_id;
    return query select 'vyron_cost_production_wastage'::text, count(*)::bigint from public.vyron_cost_production_wastage where company_id = p_company_id;
    return query select 'vyron_cost_production_audit_log'::text, count(*)::bigint from public.vyron_cost_production_audit_log where company_id = p_company_id;
    return query select 'vyron_cost_store_production_runs'::text, count(*)::bigint from public.vyron_cost_store_production_runs where company_id = p_company_id;
    return query select 'vyron_cost_production_runs'::text, count(*)::bigint from public.vyron_cost_production_runs where company_id = p_company_id;
  end if;

  if p_module = 'suppliers' then
    return query select 'vyron_document_field_corrections'::text, count(*)::bigint from public.vyron_document_field_corrections where document_id IN (SELECT id FROM public.vyron_documents WHERE tenant_id = p_company_id);
    return query select 'vyron_cost_invoice_risk_findings'::text, count(*)::bigint from public.vyron_cost_invoice_risk_findings where company_id = p_company_id;
    return query select 'vyron_document_cost_audit'::text, count(*)::bigint from public.vyron_document_cost_audit where tenant_id = p_company_id;
    return query select 'vyron_document_extraction_logs'::text, count(*)::bigint from public.vyron_document_extraction_logs where document_id IN (SELECT id FROM public.vyron_documents WHERE tenant_id = p_company_id);
    return query select 'vyron_supplier_line_item_mappings'::text, count(*)::bigint from public.vyron_supplier_line_item_mappings where tenant_id = p_company_id;
    return query select 'vyron_cost_goods_receipt_lines'::text, count(*)::bigint from public.vyron_cost_goods_receipt_lines where company_id = p_company_id;
    return query select 'vyron_cost_stock_count_lines'::text, count(*)::bigint from public.vyron_cost_stock_count_lines where company_id = p_company_id;
    return query select 'vyron_inventory_audit_log'::text, count(*)::bigint from public.vyron_inventory_audit_log where company_id = p_company_id;
    return query select 'vyron_cost_stock_ledger'::text, count(*)::bigint from public.vyron_cost_stock_ledger where company_id = p_company_id;
    return query select 'vyron_cost_inventory_transactions'::text, count(*)::bigint from public.vyron_cost_inventory_transactions where company_id = p_company_id;
    return query select 'vyron_cost_production_run_lines'::text, count(*)::bigint from public.vyron_cost_production_run_lines where company_id = p_company_id;
    return query select 'vyron_cost_supplier_invoice_lines'::text, count(*)::bigint from public.vyron_cost_supplier_invoice_lines where invoice_id IN (SELECT id FROM public.vyron_cost_supplier_invoices WHERE supplier_id IN (SELECT id FROM public.vyron_cost_suppliers WHERE company_id = p_company_id));
    return query select 'vyron_cost_production_wastage'::text, count(*)::bigint from public.vyron_cost_production_wastage where company_id = p_company_id;
    return query select 'vyron_procurement_three_way_matches'::text, count(*)::bigint from public.vyron_procurement_three_way_matches where company_id = p_company_id;
    return query select 'vyron_cost_supplier_invoices'::text, count(*)::bigint from public.vyron_cost_supplier_invoices where supplier_id IN (SELECT id FROM public.vyron_cost_suppliers WHERE company_id = p_company_id);
    return query select 'vyron_cost_goods_receipts'::text, count(*)::bigint from public.vyron_cost_goods_receipts where company_id = p_company_id;
    return query select 'vyron_cost_back_orders'::text, count(*)::bigint from public.vyron_cost_back_orders where company_id = p_company_id;
    return query select 'vyron_cost_purchase_order_lines'::text, count(*)::bigint from public.vyron_cost_purchase_order_lines where company_id = p_company_id;
    return query select 'vyron_cost_recovery_opportunities'::text, count(*)::bigint from public.vyron_cost_recovery_opportunities where company_id = p_company_id;
    return query select 'vyron_cost_low_stock_alerts'::text, count(*)::bigint from public.vyron_cost_low_stock_alerts where company_id = p_company_id;
    return query select 'vyron_cost_stock_items'::text, count(*)::bigint from public.vyron_cost_stock_items where company_id = p_company_id;
    return query select 'vyron_supplier_price_history'::text, count(*)::bigint from public.vyron_supplier_price_history where tenant_id = p_company_id;
    return query select 'vyron_procurement_risk_alerts'::text, count(*)::bigint from public.vyron_procurement_risk_alerts where tenant_id = p_company_id;
    return query select 'vyron_document_line_items'::text, count(*)::bigint from public.vyron_document_line_items where document_id IN (SELECT id FROM public.vyron_documents WHERE tenant_id = p_company_id);
    return query select 'vyron_cost_price_history'::text, count(*)::bigint from public.vyron_cost_price_history where supplier_id IN (SELECT id FROM public.vyron_cost_suppliers WHERE company_id = p_company_id);
    return query select 'vyron_cost_ingredients'::text, count(*)::bigint from public.vyron_cost_ingredients where company_id = p_company_id;
    return query select 'vyron_supplier_contracts'::text, count(*)::bigint from public.vyron_supplier_contracts where company_id = p_company_id;
    return query select 'vyron_documents'::text, count(*)::bigint from public.vyron_documents where tenant_id = p_company_id;
    return query select 'vyron_cost_purchase_orders'::text, count(*)::bigint from public.vyron_cost_purchase_orders where company_id = p_company_id;
    return query select 'vyron_supplier_profiles'::text, count(*)::bigint from public.vyron_supplier_profiles where tenant_id = p_company_id;
    return query select 'vyron_cost_suppliers'::text, count(*)::bigint from public.vyron_cost_suppliers where company_id = p_company_id;
  end if;

  if p_module = 'factory' then
    return query select 'vyron_cost_store_production_run_lines'::text, count(*)::bigint from public.vyron_cost_store_production_run_lines where company_id = p_company_id;
    return query select 'vyron_cost_production_run_lines'::text, count(*)::bigint from public.vyron_cost_production_run_lines where company_id = p_company_id;
    return query select 'vyron_cost_production_labour'::text, count(*)::bigint from public.vyron_cost_production_labour where company_id = p_company_id;
    return query select 'vyron_customer_sales_order_production_links'::text, count(*)::bigint from public.vyron_customer_sales_order_production_links where company_id = p_company_id;
    return query select 'vyron_cost_production_overhead'::text, count(*)::bigint from public.vyron_cost_production_overhead where company_id = p_company_id;
    return query select 'vyron_cost_production_wastage'::text, count(*)::bigint from public.vyron_cost_production_wastage where company_id = p_company_id;
    return query select 'vyron_cost_production_audit_log'::text, count(*)::bigint from public.vyron_cost_production_audit_log where company_id = p_company_id;
    return query select 'vyron_cost_store_production_runs'::text, count(*)::bigint from public.vyron_cost_store_production_runs where company_id = p_company_id;
    return query select 'vyron_cost_production_runs'::text, count(*)::bigint from public.vyron_cost_production_runs where company_id = p_company_id;
    return query select 'vyron_cost_supplier_invoice_lines'::text, count(*)::bigint from public.vyron_cost_supplier_invoice_lines where invoice_id IN (SELECT id FROM public.vyron_cost_supplier_invoices WHERE supplier_id IN (SELECT id FROM public.vyron_cost_suppliers WHERE company_id = p_company_id));
    return query select 'vyron_cost_invoice_lines'::text, count(*)::bigint from public.vyron_cost_invoice_lines where invoice_id IN (SELECT id FROM public.vyron_cost_invoice_headers WHERE company_id = p_company_id);
    return query select 'vyron_document_field_corrections'::text, count(*)::bigint from public.vyron_document_field_corrections where document_id IN (SELECT id FROM public.vyron_documents WHERE tenant_id = p_company_id);
    return query select 'vyron_procurement_three_way_matches'::text, count(*)::bigint from public.vyron_procurement_three_way_matches where company_id = p_company_id;
    return query select 'vyron_procurement_risk_alerts'::text, count(*)::bigint from public.vyron_procurement_risk_alerts where tenant_id = p_company_id;
    return query select 'vyron_document_cost_audit'::text, count(*)::bigint from public.vyron_document_cost_audit where tenant_id = p_company_id;
    return query select 'vyron_supplier_contracts'::text, count(*)::bigint from public.vyron_supplier_contracts where company_id = p_company_id;
    return query select 'vyron_document_extraction_logs'::text, count(*)::bigint from public.vyron_document_extraction_logs where document_id IN (SELECT id FROM public.vyron_documents WHERE tenant_id = p_company_id);
    return query select 'vyron_supplier_price_history'::text, count(*)::bigint from public.vyron_supplier_price_history where tenant_id = p_company_id;
    return query select 'vyron_document_line_items'::text, count(*)::bigint from public.vyron_document_line_items where document_id IN (SELECT id FROM public.vyron_documents WHERE tenant_id = p_company_id);
    return query select 'vyron_cost_invoice_risk_findings'::text, count(*)::bigint from public.vyron_cost_invoice_risk_findings where company_id = p_company_id;
    return query select 'vyron_supplier_line_item_mappings'::text, count(*)::bigint from public.vyron_supplier_line_item_mappings where tenant_id = p_company_id;
    return query select 'vyron_supplier_invoice_learning'::text, count(*)::bigint from public.vyron_supplier_invoice_learning where tenant_id = p_company_id;
    return query select 'vyron_cost_supplier_invoices'::text, count(*)::bigint from public.vyron_cost_supplier_invoices where supplier_id IN (SELECT id FROM public.vyron_cost_suppliers WHERE company_id = p_company_id);
    return query select 'vyron_cost_invoice_headers'::text, count(*)::bigint from public.vyron_cost_invoice_headers where company_id = p_company_id;
    return query select 'vyron_documents'::text, count(*)::bigint from public.vyron_documents where tenant_id = p_company_id;
    return query select 'vyron_customer_price_list_audit_log'::text, count(*)::bigint from public.vyron_customer_price_list_audit_log where company_id = p_company_id;
    return query select 'vyron_customer_invoice_lines'::text, count(*)::bigint from public.vyron_customer_invoice_lines where invoice_id IN (SELECT id FROM public.vyron_customer_invoices WHERE company_id = p_company_id);
    return query select 'vyron_customer_price_list_items'::text, count(*)::bigint from public.vyron_customer_price_list_items where company_id = p_company_id;
    return query select 'vyron_cost_recovery_opportunities'::text, count(*)::bigint from public.vyron_cost_recovery_opportunities where company_id = p_company_id;
    return query select 'vyron_customer_sales_order_allocations'::text, count(*)::bigint from public.vyron_customer_sales_order_allocations where company_id = p_company_id;
    return query select 'vyron_customer_sales_order_lines'::text, count(*)::bigint from public.vyron_customer_sales_order_lines where company_id = p_company_id;
    return query select 'vyron_customer_sales_order_items'::text, count(*)::bigint from public.vyron_customer_sales_order_items where company_id = p_company_id;
    return query select 'vyron_cost_batch_runs'::text, count(*)::bigint from public.vyron_cost_batch_runs where company_id = p_company_id;
    return query select 'vyron_cost_product_recipe_links'::text, count(*)::bigint from public.vyron_cost_product_recipe_links where company_id = p_company_id;
    return query select 'vyron_cost_bom_lines'::text, count(*)::bigint from public.vyron_cost_bom_lines where company_id = p_company_id;
    return query select 'vyron_cost_recipes'::text, count(*)::bigint from public.vyron_cost_recipes where company_id = p_company_id;
    return query select 'vyron_cost_boms'::text, count(*)::bigint from public.vyron_cost_boms where company_id = p_company_id;
    return query select 'vyron_cost_products'::text, count(*)::bigint from public.vyron_cost_products where company_id = p_company_id;
    return query select 'vyron_manufacturing_batch_lines'::text, count(*)::bigint from public.vyron_manufacturing_batch_lines where batch_id IN (SELECT id FROM public.vyron_manufacturing_batches WHERE company_id = p_company_id);
    return query select 'vyron_manufacturing_batches'::text, count(*)::bigint from public.vyron_manufacturing_batches where company_id = p_company_id;
    return query select 'vyron_finished_goods'::text, count(*)::bigint from public.vyron_finished_goods where company_id = p_company_id;
    return query select 'vyron_cost_back_orders'::text, count(*)::bigint from public.vyron_cost_back_orders where company_id = p_company_id;
    return query select 'vyron_cost_goods_receipt_lines'::text, count(*)::bigint from public.vyron_cost_goods_receipt_lines where company_id = p_company_id;
    return query select 'vyron_cost_stock_count_lines'::text, count(*)::bigint from public.vyron_cost_stock_count_lines where company_id = p_company_id;
    return query select 'vyron_cost_low_stock_alerts'::text, count(*)::bigint from public.vyron_cost_low_stock_alerts where company_id = p_company_id;
    return query select 'vyron_inventory_audit_log'::text, count(*)::bigint from public.vyron_inventory_audit_log where company_id = p_company_id;
    return query select 'vyron_cost_stock_ledger'::text, count(*)::bigint from public.vyron_cost_stock_ledger where company_id = p_company_id;
    return query select 'vyron_cost_inventory_transactions'::text, count(*)::bigint from public.vyron_cost_inventory_transactions where company_id = p_company_id;
    return query select 'vyron_cost_purchase_order_lines'::text, count(*)::bigint from public.vyron_cost_purchase_order_lines where company_id = p_company_id;
    return query select 'vyron_cost_price_history'::text, count(*)::bigint from public.vyron_cost_price_history where supplier_id IN (SELECT id FROM public.vyron_cost_suppliers WHERE company_id = p_company_id);
    return query select 'vyron_cost_stock_items'::text, count(*)::bigint from public.vyron_cost_stock_items where company_id = p_company_id;
    return query select 'vyron_cost_ingredients'::text, count(*)::bigint from public.vyron_cost_ingredients where company_id = p_company_id;
    return query select 'vyron_cost_goods_receipts'::text, count(*)::bigint from public.vyron_cost_goods_receipts where company_id = p_company_id;
    return query select 'vyron_cost_purchase_orders'::text, count(*)::bigint from public.vyron_cost_purchase_orders where company_id = p_company_id;
    return query select 'vyron_supplier_profiles'::text, count(*)::bigint from public.vyron_supplier_profiles where tenant_id = p_company_id;
    return query select 'vyron_cost_suppliers'::text, count(*)::bigint from public.vyron_cost_suppliers where company_id = p_company_id;
  end if;

  return;
end;
$$;

-- ============================================================ export
-- Read-only. Returns every in-scope row of one table as jsonb, for backup.
create or replace function public.vyron_dev_reset_export_table(
  p_company_id uuid,
  p_table text
)
returns setof jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_company_id is null then
    raise exception 'company_id is required';
  end if;
  if not exists (select 1 from public.vyron_cost_companies c where c.id = p_company_id) then
    raise exception 'unknown company_id: %', p_company_id;
  end if;

  if p_table = 'vyron_cost_store_production_run_lines' then
    return query select to_jsonb(t) from public.vyron_cost_store_production_run_lines t where t.company_id = p_company_id;
    return;
  end if;
  if p_table = 'vyron_cost_production_run_lines' then
    return query select to_jsonb(t) from public.vyron_cost_production_run_lines t where t.company_id = p_company_id;
    return;
  end if;
  if p_table = 'vyron_cost_production_labour' then
    return query select to_jsonb(t) from public.vyron_cost_production_labour t where t.company_id = p_company_id;
    return;
  end if;
  if p_table = 'vyron_customer_sales_order_production_links' then
    return query select to_jsonb(t) from public.vyron_customer_sales_order_production_links t where t.company_id = p_company_id;
    return;
  end if;
  if p_table = 'vyron_cost_production_overhead' then
    return query select to_jsonb(t) from public.vyron_cost_production_overhead t where t.company_id = p_company_id;
    return;
  end if;
  if p_table = 'vyron_cost_production_wastage' then
    return query select to_jsonb(t) from public.vyron_cost_production_wastage t where t.company_id = p_company_id;
    return;
  end if;
  if p_table = 'vyron_cost_production_audit_log' then
    return query select to_jsonb(t) from public.vyron_cost_production_audit_log t where t.company_id = p_company_id;
    return;
  end if;
  if p_table = 'vyron_cost_store_production_runs' then
    return query select to_jsonb(t) from public.vyron_cost_store_production_runs t where t.company_id = p_company_id;
    return;
  end if;
  if p_table = 'vyron_cost_production_runs' then
    return query select to_jsonb(t) from public.vyron_cost_production_runs t where t.company_id = p_company_id;
    return;
  end if;
  if p_table = 'vyron_cost_supplier_invoice_lines' then
    return query select to_jsonb(t) from public.vyron_cost_supplier_invoice_lines t where t.invoice_id IN (SELECT id FROM public.vyron_cost_supplier_invoices WHERE supplier_id IN (SELECT id FROM public.vyron_cost_suppliers WHERE company_id = p_company_id));
    return;
  end if;
  if p_table = 'vyron_cost_invoice_lines' then
    return query select to_jsonb(t) from public.vyron_cost_invoice_lines t where t.invoice_id IN (SELECT id FROM public.vyron_cost_invoice_headers WHERE company_id = p_company_id);
    return;
  end if;
  if p_table = 'vyron_document_field_corrections' then
    return query select to_jsonb(t) from public.vyron_document_field_corrections t where t.document_id IN (SELECT id FROM public.vyron_documents WHERE tenant_id = p_company_id);
    return;
  end if;
  if p_table = 'vyron_procurement_three_way_matches' then
    return query select to_jsonb(t) from public.vyron_procurement_three_way_matches t where t.company_id = p_company_id;
    return;
  end if;
  if p_table = 'vyron_procurement_risk_alerts' then
    return query select to_jsonb(t) from public.vyron_procurement_risk_alerts t where t.tenant_id = p_company_id;
    return;
  end if;
  if p_table = 'vyron_document_cost_audit' then
    return query select to_jsonb(t) from public.vyron_document_cost_audit t where t.tenant_id = p_company_id;
    return;
  end if;
  if p_table = 'vyron_supplier_contracts' then
    return query select to_jsonb(t) from public.vyron_supplier_contracts t where t.company_id = p_company_id;
    return;
  end if;
  if p_table = 'vyron_document_extraction_logs' then
    return query select to_jsonb(t) from public.vyron_document_extraction_logs t where t.document_id IN (SELECT id FROM public.vyron_documents WHERE tenant_id = p_company_id);
    return;
  end if;
  if p_table = 'vyron_supplier_price_history' then
    return query select to_jsonb(t) from public.vyron_supplier_price_history t where t.tenant_id = p_company_id;
    return;
  end if;
  if p_table = 'vyron_document_line_items' then
    return query select to_jsonb(t) from public.vyron_document_line_items t where t.document_id IN (SELECT id FROM public.vyron_documents WHERE tenant_id = p_company_id);
    return;
  end if;
  if p_table = 'vyron_cost_invoice_risk_findings' then
    return query select to_jsonb(t) from public.vyron_cost_invoice_risk_findings t where t.company_id = p_company_id;
    return;
  end if;
  if p_table = 'vyron_supplier_line_item_mappings' then
    return query select to_jsonb(t) from public.vyron_supplier_line_item_mappings t where t.tenant_id = p_company_id;
    return;
  end if;
  if p_table = 'vyron_supplier_invoice_learning' then
    return query select to_jsonb(t) from public.vyron_supplier_invoice_learning t where t.tenant_id = p_company_id;
    return;
  end if;
  if p_table = 'vyron_cost_supplier_invoices' then
    return query select to_jsonb(t) from public.vyron_cost_supplier_invoices t where t.supplier_id IN (SELECT id FROM public.vyron_cost_suppliers WHERE company_id = p_company_id);
    return;
  end if;
  if p_table = 'vyron_cost_invoice_headers' then
    return query select to_jsonb(t) from public.vyron_cost_invoice_headers t where t.company_id = p_company_id;
    return;
  end if;
  if p_table = 'vyron_documents' then
    return query select to_jsonb(t) from public.vyron_documents t where t.tenant_id = p_company_id;
    return;
  end if;
  if p_table = 'vyron_customer_price_list_audit_log' then
    return query select to_jsonb(t) from public.vyron_customer_price_list_audit_log t where t.company_id = p_company_id;
    return;
  end if;
  if p_table = 'vyron_customer_invoice_lines' then
    return query select to_jsonb(t) from public.vyron_customer_invoice_lines t where t.invoice_id IN (SELECT id FROM public.vyron_customer_invoices WHERE company_id = p_company_id);
    return;
  end if;
  if p_table = 'vyron_customer_price_list_items' then
    return query select to_jsonb(t) from public.vyron_customer_price_list_items t where t.company_id = p_company_id;
    return;
  end if;
  if p_table = 'vyron_cost_recovery_opportunities' then
    return query select to_jsonb(t) from public.vyron_cost_recovery_opportunities t where t.company_id = p_company_id;
    return;
  end if;
  if p_table = 'vyron_customer_sales_order_allocations' then
    return query select to_jsonb(t) from public.vyron_customer_sales_order_allocations t where t.company_id = p_company_id;
    return;
  end if;
  if p_table = 'vyron_customer_sales_order_lines' then
    return query select to_jsonb(t) from public.vyron_customer_sales_order_lines t where t.company_id = p_company_id;
    return;
  end if;
  if p_table = 'vyron_customer_sales_order_items' then
    return query select to_jsonb(t) from public.vyron_customer_sales_order_items t where t.company_id = p_company_id;
    return;
  end if;
  if p_table = 'vyron_cost_batch_runs' then
    return query select to_jsonb(t) from public.vyron_cost_batch_runs t where t.company_id = p_company_id;
    return;
  end if;
  if p_table = 'vyron_cost_product_recipe_links' then
    return query select to_jsonb(t) from public.vyron_cost_product_recipe_links t where t.company_id = p_company_id;
    return;
  end if;
  if p_table = 'vyron_cost_bom_lines' then
    return query select to_jsonb(t) from public.vyron_cost_bom_lines t where t.company_id = p_company_id;
    return;
  end if;
  if p_table = 'vyron_cost_recipes' then
    return query select to_jsonb(t) from public.vyron_cost_recipes t where t.company_id = p_company_id;
    return;
  end if;
  if p_table = 'vyron_cost_boms' then
    return query select to_jsonb(t) from public.vyron_cost_boms t where t.company_id = p_company_id;
    return;
  end if;
  if p_table = 'vyron_cost_products' then
    return query select to_jsonb(t) from public.vyron_cost_products t where t.company_id = p_company_id;
    return;
  end if;
  if p_table = 'vyron_manufacturing_batch_lines' then
    return query select to_jsonb(t) from public.vyron_manufacturing_batch_lines t where t.batch_id IN (SELECT id FROM public.vyron_manufacturing_batches WHERE company_id = p_company_id);
    return;
  end if;
  if p_table = 'vyron_manufacturing_batches' then
    return query select to_jsonb(t) from public.vyron_manufacturing_batches t where t.company_id = p_company_id;
    return;
  end if;
  if p_table = 'vyron_finished_goods' then
    return query select to_jsonb(t) from public.vyron_finished_goods t where t.company_id = p_company_id;
    return;
  end if;
  if p_table = 'vyron_cost_back_orders' then
    return query select to_jsonb(t) from public.vyron_cost_back_orders t where t.company_id = p_company_id;
    return;
  end if;
  if p_table = 'vyron_cost_goods_receipt_lines' then
    return query select to_jsonb(t) from public.vyron_cost_goods_receipt_lines t where t.company_id = p_company_id;
    return;
  end if;
  if p_table = 'vyron_cost_stock_count_lines' then
    return query select to_jsonb(t) from public.vyron_cost_stock_count_lines t where t.company_id = p_company_id;
    return;
  end if;
  if p_table = 'vyron_cost_low_stock_alerts' then
    return query select to_jsonb(t) from public.vyron_cost_low_stock_alerts t where t.company_id = p_company_id;
    return;
  end if;
  if p_table = 'vyron_inventory_audit_log' then
    return query select to_jsonb(t) from public.vyron_inventory_audit_log t where t.company_id = p_company_id;
    return;
  end if;
  if p_table = 'vyron_cost_stock_ledger' then
    return query select to_jsonb(t) from public.vyron_cost_stock_ledger t where t.company_id = p_company_id;
    return;
  end if;
  if p_table = 'vyron_cost_inventory_transactions' then
    return query select to_jsonb(t) from public.vyron_cost_inventory_transactions t where t.company_id = p_company_id;
    return;
  end if;
  if p_table = 'vyron_cost_purchase_order_lines' then
    return query select to_jsonb(t) from public.vyron_cost_purchase_order_lines t where t.company_id = p_company_id;
    return;
  end if;
  if p_table = 'vyron_cost_price_history' then
    return query select to_jsonb(t) from public.vyron_cost_price_history t where t.supplier_id IN (SELECT id FROM public.vyron_cost_suppliers WHERE company_id = p_company_id);
    return;
  end if;
  if p_table = 'vyron_cost_stock_items' then
    return query select to_jsonb(t) from public.vyron_cost_stock_items t where t.company_id = p_company_id;
    return;
  end if;
  if p_table = 'vyron_cost_ingredients' then
    return query select to_jsonb(t) from public.vyron_cost_ingredients t where t.company_id = p_company_id;
    return;
  end if;
  if p_table = 'vyron_cost_goods_receipts' then
    return query select to_jsonb(t) from public.vyron_cost_goods_receipts t where t.company_id = p_company_id;
    return;
  end if;
  if p_table = 'vyron_cost_purchase_orders' then
    return query select to_jsonb(t) from public.vyron_cost_purchase_orders t where t.company_id = p_company_id;
    return;
  end if;
  if p_table = 'vyron_supplier_profiles' then
    return query select to_jsonb(t) from public.vyron_supplier_profiles t where t.tenant_id = p_company_id;
    return;
  end if;
  if p_table = 'vyron_cost_suppliers' then
    return query select to_jsonb(t) from public.vyron_cost_suppliers t where t.company_id = p_company_id;
    return;
  end if;

  raise exception 'table not in any reset module: %', p_table;
end;
$$;

-- ============================================================ execute
-- Destructive. One transaction. Deletes children before parents.
create or replace function public.vyron_dev_reset_execute(
  p_company_id uuid,
  p_module text,
  p_actor_user_id text default null,
  p_actor_email text default null,
  p_reason text default null,
  p_backup_created boolean default false,
  p_backup_location text default null,
  p_backup_acknowledged_without boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_started timestamptz := clock_timestamp();
  v_counts jsonb := '{}'::jsonb;
  v_total bigint := 0;
  v_n bigint;
  v_warnings text[] := '{}';
begin
  if p_company_id is null then
    raise exception 'company_id is required';
  end if;
  if not exists (select 1 from public.vyron_cost_companies c where c.id = p_company_id) then
    raise exception 'unknown company_id: %', p_company_id;
  end if;
  if p_module not in ('supplier_invoices', 'raw_materials', 'finished_goods', 'boms', 'production_history', 'suppliers', 'factory') then
    raise exception 'unknown reset module: %', p_module;
  end if;

  -- PCP-045A: refuse before touching a single row unless a backup was taken
  -- or its absence was explicitly acknowledged by the operator.
  if not p_backup_created and not p_backup_acknowledged_without then
    raise exception 'refused: no backup was created and its absence was not acknowledged';
  end if;

  -- ---------------------------------------------- supplier_invoices
  if p_module = 'supplier_invoices' then
    delete from public.vyron_cost_supplier_invoice_lines where invoice_id IN (SELECT id FROM public.vyron_cost_supplier_invoices WHERE supplier_id IN (SELECT id FROM public.vyron_cost_suppliers WHERE company_id = p_company_id));
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_cost_supplier_invoice_lines', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_cost_invoice_lines where invoice_id IN (SELECT id FROM public.vyron_cost_invoice_headers WHERE company_id = p_company_id);
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_cost_invoice_lines', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_document_field_corrections where document_id IN (SELECT id FROM public.vyron_documents WHERE tenant_id = p_company_id);
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_document_field_corrections', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_procurement_three_way_matches where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_procurement_three_way_matches', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_procurement_risk_alerts where tenant_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_procurement_risk_alerts', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_document_cost_audit where tenant_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_document_cost_audit', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_supplier_contracts where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_supplier_contracts', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_document_extraction_logs where document_id IN (SELECT id FROM public.vyron_documents WHERE tenant_id = p_company_id);
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_document_extraction_logs', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_supplier_price_history where tenant_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_supplier_price_history', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_document_line_items where document_id IN (SELECT id FROM public.vyron_documents WHERE tenant_id = p_company_id);
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_document_line_items', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_cost_invoice_risk_findings where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_cost_invoice_risk_findings', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_supplier_line_item_mappings where tenant_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_supplier_line_item_mappings', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_supplier_invoice_learning where tenant_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_supplier_invoice_learning', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_cost_supplier_invoices where supplier_id IN (SELECT id FROM public.vyron_cost_suppliers WHERE company_id = p_company_id);
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_cost_supplier_invoices', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_cost_invoice_headers where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_cost_invoice_headers', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_documents where tenant_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_documents', v_n); v_total := v_total + v_n; end if;
  end if;

  -- ---------------------------------------------- raw_materials
  if p_module = 'raw_materials' then
    delete from public.vyron_cost_back_orders where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_cost_back_orders', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_cost_goods_receipt_lines where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_cost_goods_receipt_lines', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_cost_stock_count_lines where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_cost_stock_count_lines', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_cost_low_stock_alerts where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_cost_low_stock_alerts', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_inventory_audit_log where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_inventory_audit_log', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_cost_stock_ledger where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_cost_stock_ledger', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_cost_inventory_transactions where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_cost_inventory_transactions', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_cost_production_run_lines where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_cost_production_run_lines', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_cost_supplier_invoice_lines where invoice_id IN (SELECT id FROM public.vyron_cost_supplier_invoices WHERE supplier_id IN (SELECT id FROM public.vyron_cost_suppliers WHERE company_id = p_company_id));
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_cost_supplier_invoice_lines', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_cost_recovery_opportunities where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_cost_recovery_opportunities', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_cost_production_wastage where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_cost_production_wastage', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_cost_purchase_order_lines where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_cost_purchase_order_lines', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_cost_price_history where supplier_id IN (SELECT id FROM public.vyron_cost_suppliers WHERE company_id = p_company_id);
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_cost_price_history', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_cost_stock_items where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_cost_stock_items', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_cost_ingredients where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_cost_ingredients', v_n); v_total := v_total + v_n; end if;
  end if;

  -- ---------------------------------------------- finished_goods
  if p_module = 'finished_goods' then
    -- break circular FK before deleting either side
    update public.vyron_cost_products set linked_bom_id = null where company_id = p_company_id and linked_bom_id is not null;
    delete from public.vyron_manufacturing_batch_lines where batch_id IN (SELECT id FROM public.vyron_manufacturing_batches WHERE company_id = p_company_id);
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_manufacturing_batch_lines', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_customer_price_list_audit_log where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_customer_price_list_audit_log', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_cost_bom_lines where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_cost_bom_lines', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_cost_production_run_lines where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_cost_production_run_lines', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_cost_production_labour where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_cost_production_labour', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_customer_sales_order_production_links where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_customer_sales_order_production_links', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_cost_production_overhead where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_cost_production_overhead', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_cost_production_wastage where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_cost_production_wastage', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_cost_production_audit_log where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_cost_production_audit_log', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_manufacturing_batches where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_manufacturing_batches', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_customer_invoice_lines where invoice_id IN (SELECT id FROM public.vyron_customer_invoices WHERE company_id = p_company_id);
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_customer_invoice_lines', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_customer_price_list_items where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_customer_price_list_items', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_cost_recovery_opportunities where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_cost_recovery_opportunities', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_customer_sales_order_allocations where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_customer_sales_order_allocations', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_customer_sales_order_lines where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_customer_sales_order_lines', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_cost_production_runs where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_cost_production_runs', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_cost_product_recipe_links where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_cost_product_recipe_links', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_customer_sales_order_items where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_customer_sales_order_items', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_finished_goods where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_finished_goods', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_cost_products where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_cost_products', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_cost_boms where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_cost_boms', v_n); v_total := v_total + v_n; end if;
  end if;

  -- ---------------------------------------------- boms
  if p_module = 'boms' then
    -- break circular FK before deleting either side
    update public.vyron_cost_products set linked_bom_id = null where company_id = p_company_id and linked_bom_id is not null;
    delete from public.vyron_customer_price_list_audit_log where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_customer_price_list_audit_log', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_customer_invoice_lines where invoice_id IN (SELECT id FROM public.vyron_customer_invoices WHERE company_id = p_company_id);
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_customer_invoice_lines', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_customer_price_list_items where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_customer_price_list_items', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_cost_recovery_opportunities where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_cost_recovery_opportunities', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_customer_sales_order_allocations where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_customer_sales_order_allocations', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_customer_sales_order_lines where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_customer_sales_order_lines', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_customer_sales_order_items where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_customer_sales_order_items', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_cost_production_run_lines where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_cost_production_run_lines', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_cost_production_labour where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_cost_production_labour', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_customer_sales_order_production_links where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_customer_sales_order_production_links', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_cost_production_overhead where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_cost_production_overhead', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_cost_production_wastage where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_cost_production_wastage', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_cost_production_audit_log where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_cost_production_audit_log', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_cost_batch_runs where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_cost_batch_runs', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_cost_product_recipe_links where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_cost_product_recipe_links', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_cost_bom_lines where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_cost_bom_lines', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_cost_production_runs where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_cost_production_runs', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_cost_recipes where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_cost_recipes', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_cost_boms where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_cost_boms', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_cost_products where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_cost_products', v_n); v_total := v_total + v_n; end if;
  end if;

  -- ---------------------------------------------- production_history
  if p_module = 'production_history' then
    delete from public.vyron_cost_store_production_run_lines where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_cost_store_production_run_lines', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_cost_production_run_lines where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_cost_production_run_lines', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_cost_production_labour where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_cost_production_labour', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_customer_sales_order_production_links where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_customer_sales_order_production_links', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_cost_production_overhead where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_cost_production_overhead', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_cost_production_wastage where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_cost_production_wastage', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_cost_production_audit_log where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_cost_production_audit_log', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_cost_store_production_runs where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_cost_store_production_runs', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_cost_production_runs where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_cost_production_runs', v_n); v_total := v_total + v_n; end if;
  end if;

  -- ---------------------------------------------- suppliers
  if p_module = 'suppliers' then
    delete from public.vyron_document_field_corrections where document_id IN (SELECT id FROM public.vyron_documents WHERE tenant_id = p_company_id);
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_document_field_corrections', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_cost_invoice_risk_findings where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_cost_invoice_risk_findings', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_document_cost_audit where tenant_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_document_cost_audit', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_document_extraction_logs where document_id IN (SELECT id FROM public.vyron_documents WHERE tenant_id = p_company_id);
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_document_extraction_logs', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_supplier_line_item_mappings where tenant_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_supplier_line_item_mappings', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_cost_goods_receipt_lines where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_cost_goods_receipt_lines', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_cost_stock_count_lines where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_cost_stock_count_lines', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_inventory_audit_log where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_inventory_audit_log', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_cost_stock_ledger where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_cost_stock_ledger', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_cost_inventory_transactions where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_cost_inventory_transactions', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_cost_production_run_lines where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_cost_production_run_lines', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_cost_supplier_invoice_lines where invoice_id IN (SELECT id FROM public.vyron_cost_supplier_invoices WHERE supplier_id IN (SELECT id FROM public.vyron_cost_suppliers WHERE company_id = p_company_id));
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_cost_supplier_invoice_lines', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_cost_production_wastage where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_cost_production_wastage', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_procurement_three_way_matches where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_procurement_three_way_matches', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_cost_supplier_invoices where supplier_id IN (SELECT id FROM public.vyron_cost_suppliers WHERE company_id = p_company_id);
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_cost_supplier_invoices', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_cost_goods_receipts where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_cost_goods_receipts', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_cost_back_orders where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_cost_back_orders', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_cost_purchase_order_lines where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_cost_purchase_order_lines', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_cost_recovery_opportunities where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_cost_recovery_opportunities', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_cost_low_stock_alerts where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_cost_low_stock_alerts', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_cost_stock_items where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_cost_stock_items', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_supplier_price_history where tenant_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_supplier_price_history', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_procurement_risk_alerts where tenant_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_procurement_risk_alerts', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_document_line_items where document_id IN (SELECT id FROM public.vyron_documents WHERE tenant_id = p_company_id);
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_document_line_items', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_cost_price_history where supplier_id IN (SELECT id FROM public.vyron_cost_suppliers WHERE company_id = p_company_id);
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_cost_price_history', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_cost_ingredients where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_cost_ingredients', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_supplier_contracts where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_supplier_contracts', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_documents where tenant_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_documents', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_cost_purchase_orders where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_cost_purchase_orders', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_supplier_profiles where tenant_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_supplier_profiles', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_cost_suppliers where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_cost_suppliers', v_n); v_total := v_total + v_n; end if;
  end if;

  -- ---------------------------------------------- factory
  if p_module = 'factory' then
    -- break circular FK before deleting either side
    update public.vyron_cost_products set linked_bom_id = null where company_id = p_company_id and linked_bom_id is not null;
    delete from public.vyron_cost_store_production_run_lines where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_cost_store_production_run_lines', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_cost_production_run_lines where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_cost_production_run_lines', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_cost_production_labour where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_cost_production_labour', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_customer_sales_order_production_links where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_customer_sales_order_production_links', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_cost_production_overhead where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_cost_production_overhead', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_cost_production_wastage where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_cost_production_wastage', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_cost_production_audit_log where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_cost_production_audit_log', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_cost_store_production_runs where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_cost_store_production_runs', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_cost_production_runs where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_cost_production_runs', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_cost_supplier_invoice_lines where invoice_id IN (SELECT id FROM public.vyron_cost_supplier_invoices WHERE supplier_id IN (SELECT id FROM public.vyron_cost_suppliers WHERE company_id = p_company_id));
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_cost_supplier_invoice_lines', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_cost_invoice_lines where invoice_id IN (SELECT id FROM public.vyron_cost_invoice_headers WHERE company_id = p_company_id);
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_cost_invoice_lines', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_document_field_corrections where document_id IN (SELECT id FROM public.vyron_documents WHERE tenant_id = p_company_id);
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_document_field_corrections', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_procurement_three_way_matches where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_procurement_three_way_matches', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_procurement_risk_alerts where tenant_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_procurement_risk_alerts', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_document_cost_audit where tenant_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_document_cost_audit', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_supplier_contracts where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_supplier_contracts', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_document_extraction_logs where document_id IN (SELECT id FROM public.vyron_documents WHERE tenant_id = p_company_id);
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_document_extraction_logs', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_supplier_price_history where tenant_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_supplier_price_history', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_document_line_items where document_id IN (SELECT id FROM public.vyron_documents WHERE tenant_id = p_company_id);
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_document_line_items', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_cost_invoice_risk_findings where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_cost_invoice_risk_findings', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_supplier_line_item_mappings where tenant_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_supplier_line_item_mappings', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_supplier_invoice_learning where tenant_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_supplier_invoice_learning', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_cost_supplier_invoices where supplier_id IN (SELECT id FROM public.vyron_cost_suppliers WHERE company_id = p_company_id);
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_cost_supplier_invoices', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_cost_invoice_headers where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_cost_invoice_headers', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_documents where tenant_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_documents', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_customer_price_list_audit_log where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_customer_price_list_audit_log', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_customer_invoice_lines where invoice_id IN (SELECT id FROM public.vyron_customer_invoices WHERE company_id = p_company_id);
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_customer_invoice_lines', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_customer_price_list_items where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_customer_price_list_items', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_cost_recovery_opportunities where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_cost_recovery_opportunities', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_customer_sales_order_allocations where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_customer_sales_order_allocations', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_customer_sales_order_lines where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_customer_sales_order_lines', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_customer_sales_order_items where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_customer_sales_order_items', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_cost_batch_runs where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_cost_batch_runs', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_cost_product_recipe_links where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_cost_product_recipe_links', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_cost_bom_lines where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_cost_bom_lines', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_cost_recipes where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_cost_recipes', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_cost_boms where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_cost_boms', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_cost_products where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_cost_products', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_manufacturing_batch_lines where batch_id IN (SELECT id FROM public.vyron_manufacturing_batches WHERE company_id = p_company_id);
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_manufacturing_batch_lines', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_manufacturing_batches where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_manufacturing_batches', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_finished_goods where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_finished_goods', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_cost_back_orders where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_cost_back_orders', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_cost_goods_receipt_lines where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_cost_goods_receipt_lines', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_cost_stock_count_lines where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_cost_stock_count_lines', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_cost_low_stock_alerts where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_cost_low_stock_alerts', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_inventory_audit_log where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_inventory_audit_log', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_cost_stock_ledger where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_cost_stock_ledger', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_cost_inventory_transactions where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_cost_inventory_transactions', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_cost_purchase_order_lines where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_cost_purchase_order_lines', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_cost_price_history where supplier_id IN (SELECT id FROM public.vyron_cost_suppliers WHERE company_id = p_company_id);
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_cost_price_history', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_cost_stock_items where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_cost_stock_items', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_cost_ingredients where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_cost_ingredients', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_cost_goods_receipts where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_cost_goods_receipts', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_cost_purchase_orders where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_cost_purchase_orders', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_supplier_profiles where tenant_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_supplier_profiles', v_n); v_total := v_total + v_n; end if;
    delete from public.vyron_cost_suppliers where company_id = p_company_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object('vyron_cost_suppliers', v_n); v_total := v_total + v_n; end if;
  end if;

  insert into public.vyron_dev_reset_audit(
    company_id, module, actor_user_id, actor_email, reason,
    rows_deleted, total_rows_deleted, duration_ms, status, warnings,
    backup_created, backup_location, backup_acknowledged_without
  ) values (
    p_company_id, p_module, p_actor_user_id, p_actor_email, p_reason,
    v_counts, v_total,
    (extract(epoch from (clock_timestamp() - v_started)) * 1000)::int,
    'success', v_warnings,
    p_backup_created, p_backup_location, p_backup_acknowledged_without
  );

  return jsonb_build_object(
    'ok', true,
    'module', p_module,
    'company_id', p_company_id,
    'rows_deleted', v_counts,
    'total_rows_deleted', v_total,
    'duration_ms', (extract(epoch from (clock_timestamp() - v_started)) * 1000)::int
  );
end;
$$;

-- Only the service role may call these. Never grant to anon or authenticated.
revoke all on function public.vyron_dev_reset_preview(uuid, text) from public, anon, authenticated;
revoke all on function public.vyron_dev_reset_export_table(uuid, text) from public, anon, authenticated;
revoke all on function public.vyron_dev_reset_execute(uuid, text, text, text, text, boolean, text, boolean) from public, anon, authenticated;
grant execute on function public.vyron_dev_reset_preview(uuid, text) to service_role;
grant execute on function public.vyron_dev_reset_export_table(uuid, text) to service_role;
grant execute on function public.vyron_dev_reset_execute(uuid, text, text, text, text, boolean, text, boolean) to service_role;
