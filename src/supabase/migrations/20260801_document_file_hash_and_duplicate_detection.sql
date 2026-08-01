-- VYRON COST — Product Gap Resolution, Phase 0
-- Master Data Integrity: deterministic duplicate invoice detection support.
--
-- Adds the content-hash column used by Layer 2 of duplicate detection
-- (src/lib/vyron-duplicate-invoice-detection.ts).
--
-- SAFE TO RE-RUN. Additive only: no column is dropped, no type is changed,
-- no data is rewritten, and every existing query continues to work.
--
-- The application degrades gracefully when this migration has NOT been applied:
-- duplicate Layers 1, 3 and 4 continue to operate, and Layer 2 is reported as
-- `hashLayerUnavailable: true` rather than silently passing. Applying this
-- migration enables Layer 2; it is not a prerequisite for the rest of Phase 0.

-- ---------------------------------------------------------------------------
-- 1. Document content hash (duplicate detection Layer 2)
-- ---------------------------------------------------------------------------
alter table if exists public.vyron_documents
  add column if not exists file_hash text;

comment on column public.vyron_documents.file_hash is
  'SHA-256 of the uploaded file bytes. Content identity for duplicate invoice detection Layer 2. Backfilled on extraction.';

-- Tenant-scoped lookup: detection always filters by tenant first.
create index if not exists idx_vyron_documents_tenant_file_hash
  on public.vyron_documents (tenant_id, file_hash)
  where file_hash is not null;

-- ---------------------------------------------------------------------------
-- 2. Supporting indexes for duplicate detection Layers 1, 3 and 4
-- ---------------------------------------------------------------------------
-- Layer 1: supplier + invoice number.
create index if not exists idx_vyron_documents_tenant_supplier_invoice
  on public.vyron_documents (tenant_id, supplier_name, invoice_number)
  where invoice_number is not null;

-- Layers 3 and 4: supplier + total, narrowed by invoice date in application code.
create index if not exists idx_vyron_documents_tenant_supplier_total
  on public.vyron_documents (tenant_id, supplier_name, total)
  where total is not null;

-- ---------------------------------------------------------------------------
-- 3. Duplicate risk alert lookup
-- ---------------------------------------------------------------------------
-- The document inbox filters risk alerts by tenant, risk_type and document_id
-- (src/lib/vyron-document-intelligence-data.ts).
create index if not exists idx_vyron_procurement_risk_alerts_duplicate_lookup
  on public.vyron_procurement_risk_alerts (tenant_id, risk_type, document_id);

-- ---------------------------------------------------------------------------
-- 4. Supplier resolution support
-- ---------------------------------------------------------------------------
-- Tier 1 of the Supplier Resolution Service matches on VAT number. The column
-- is optional in some deployments; add it so the tier is available everywhere.
alter table if exists public.vyron_cost_suppliers
  add column if not exists vat_number text;

comment on column public.vyron_cost_suppliers.vat_number is
  'Supplier VAT registration number. Tier 1 of the Supplier Resolution Service matching hierarchy.';

create index if not exists idx_vyron_cost_suppliers_company_vat
  on public.vyron_cost_suppliers (company_id, vat_number)
  where vat_number is not null;

-- Tiers 2 and 3 match on supplier name within a company.
create index if not exists idx_vyron_cost_suppliers_company_name
  on public.vyron_cost_suppliers (company_id, supplier_name);
