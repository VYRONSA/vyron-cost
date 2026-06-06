-- VYRON COST — Batch E: Executive Dashboard & AI Command Centre
-- No new tables required. Uses data from Batches B–D and Document Intelligence.
-- Run after manufacturing-batch-d-production.sql (step 15).
--
-- Optional performance indexes (safe to re-run):

create index if not exists idx_vyron_po_company_created on public.vyron_cost_purchase_orders(company_id, created_at desc);
create index if not exists idx_vyron_po_company_order_date on public.vyron_cost_purchase_orders(company_id, order_date desc);
create index if not exists idx_vyron_documents_tenant_invoice on public.vyron_documents(tenant_id, invoice_date desc);
create index if not exists idx_vyron_price_history_tenant_created on public.vyron_supplier_price_history(tenant_id, created_at desc);
create index if not exists idx_vyron_prod_runs_completed on public.vyron_cost_production_runs(company_id, completed_at desc) where status = 'Completed';
