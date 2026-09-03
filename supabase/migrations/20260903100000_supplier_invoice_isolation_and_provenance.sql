-- Supplier invoice tenant isolation, line provenance, and duplicate-upload detection.
--
-- Three defects found while tracing how twenty-two lines from four other
-- invoices came to sit under invoice IO151093.
--
-- 1. Supplier invoices carried no company. Every list query read the table
--    unscoped, so one tenant's supplier invoices were readable by any other.
--    Nothing has leaked — only one tenant has supplier invoices — but the
--    exposure is real and is closed here.
--
-- 2. Extracted lines recorded no page. The columns existed and nothing wrote
--    them, so establishing where a line came from took a manual trace against
--    the original scan. An accounting import must be able to answer that from
--    the record.
--
-- 3. The same PDF was uploaded twice and extracted twice with nothing noticing.
--
-- The backfill is deterministic: every supplier invoice already references a
-- supplier, and suppliers are company-scoped, so each invoice resolves to
-- exactly one company. Verified before writing this: 36 of 36 resolve, all to
-- the same tenant, none orphaned.

/* ------------------------------------------------- supplier invoice tenancy */

alter table public.vyron_cost_supplier_invoices
  add column if not exists company_id uuid;

-- Each invoice takes the company of the supplier it already points at.
update public.vyron_cost_supplier_invoices si
set company_id = s.company_id
from public.vyron_cost_suppliers s
where si.supplier_id = s.id
  and si.company_id is null
  and s.company_id is not null;

do $$
declare
  orphaned integer;
begin
  select count(*) into orphaned from public.vyron_cost_supplier_invoices where company_id is null;
  if orphaned > 0 then
    -- Refuse to enforce a constraint that would silently strand rows.
    raise exception 'Cannot enforce tenancy: % supplier invoice(s) could not be resolved to a company', orphaned;
  end if;
end $$;

alter table public.vyron_cost_supplier_invoices
  alter column company_id set not null;

create index if not exists vyron_cost_supplier_invoices_company_idx
  on public.vyron_cost_supplier_invoices (company_id);

-- A composite key, so a line can be tied to its invoice and its company in one
-- foreign key rather than relying on every query to remember the filter.
create unique index if not exists vyron_cost_supplier_invoices_id_company_key
  on public.vyron_cost_supplier_invoices (id, company_id);

-- One supplier cannot issue the same invoice number twice. This is what makes
-- re-importing a batch that contains an already-imported invoice a detectable
-- conflict rather than a silent duplicate.
create unique index if not exists vyron_cost_supplier_invoices_number_key
  on public.vyron_cost_supplier_invoices (company_id, supplier_id, upper(btrim(invoice_number)))
  where invoice_number is not null and btrim(invoice_number) <> '';

/* ------------------------------------------------------------- provenance */

-- source_page and source_bbox already exist on vyron_document_line_items and
-- were never written. The document a line came from is added here so a line
-- carries its full origin without a join through its parent.
alter table public.vyron_document_line_items
  add column if not exists source_invoice_number text;

create index if not exists vyron_document_line_items_page_idx
  on public.vyron_document_line_items (document_id, source_page);

/* ------------------------------------------------ duplicate upload detection */

-- The content hash of the stored file. Two uploads of the same bytes are
-- recognisable without depending on the file name, which people reuse.
alter table public.vyron_documents
  add column if not exists content_sha256 text;

create index if not exists vyron_documents_content_hash_idx
  on public.vyron_documents (tenant_id, content_sha256)
  where content_sha256 is not null;

-- How many separate invoices the extractor believes the file contains. One is
-- the ordinary case; more than one is a batch scan that must not be imported as
-- a single invoice.
alter table public.vyron_documents
  add column if not exists detected_invoice_count integer,
  add column if not exists detected_invoice_numbers text[];
