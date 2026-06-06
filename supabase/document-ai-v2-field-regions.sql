-- VYRON COST — DOCUMENT AI V2 field / OCR overlay columns
-- Brings schema in sync with invoice preview + review overlay code.
-- Safe to re-run (IF NOT EXISTS on every column).
--
-- Code references (grep audit):
--   vyron_documents.field_regions     → review GET, vyron-document-review-client
--   vyron_documents.page_count        → review GET, viewer page navigation
--   vyron_document_line_items.source_page → review GET, line focus / scroll
--   vyron_document_line_items.source_bbox → review GET, OCR overlay boxes
--
-- Not referenced in app code yet (omit until used):
--   line_item_regions, document_dimensions, extraction_metadata, preview_metadata

-- ---------------------------------------------------------------------------
-- vyron_documents
-- ---------------------------------------------------------------------------

alter table public.vyron_documents
  add column if not exists field_regions jsonb not null default '{}'::jsonb;

alter table public.vyron_documents
  add column if not exists page_count integer;

comment on column public.vyron_documents.field_regions is
  'Header/total OCR regions for on-invoice highlights. JSON array: [{id,kind,label,page,bbox,targetId}]. Legacy empty object {} treated as no regions.';

comment on column public.vyron_documents.page_count is
  'Number of pages in source file (PDF/statement). Used by multi-page preview.';

-- ---------------------------------------------------------------------------
-- vyron_document_line_items
-- ---------------------------------------------------------------------------

alter table public.vyron_document_line_items
  add column if not exists source_page integer;

alter table public.vyron_document_line_items
  add column if not exists source_bbox jsonb;

comment on column public.vyron_document_line_items.source_page is
  '1-based page index where this line appears on the source document.';

comment on column public.vyron_document_line_items.source_bbox is
  'Normalized line bounding box on source_page: {x,y,width,height} in 0–1 coordinates.';
