-- VYRON COST — product / pack photo on a Recipe/BOM
--
-- WHY
-- A pack is a physical thing. Cali Rose Combo and Caterpillar Combo can share
-- most of their ingredients yet look nothing alike, so the photograph belongs to
-- the BOM that defines the pack — not to an ingredient, and not to the product,
-- which may be made by more than one recipe.
--
-- Storage follows the pattern already used by document and product-attachment
-- uploads: the bytes live in the existing private vyron-documents bucket under a
-- tenant-prefixed path, and only the reference is kept here. No second storage
-- system, and no image data in the row.
--
-- All three columns are nullable: every existing recipe stays valid with no
-- image, and nothing about costing changes.

alter table public.vyron_cost_boms
  add column if not exists image_bucket text,
  add column if not exists image_path text,
  add column if not exists image_mime text;

comment on column public.vyron_cost_boms.image_path is
  'Object path inside image_bucket, always prefixed with the owning company id so one tenant cannot read another tenant''s photo.';
