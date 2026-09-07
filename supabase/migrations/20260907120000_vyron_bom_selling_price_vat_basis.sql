-- VYRON COST — the VAT basis of a BOM's selling price
--
-- WHY
-- vyron_cost_boms.selling_price has always been stored as a bare number and GP
-- measured straight against it. That is correct only when the price is already
-- VAT-exclusive, and for Northwood it is not always so. Its 33 BOMs come from
-- two families of costing sheet that treat the same field differently:
--
--   * Current Range 2026 and Summer 2026 NPD (14 BOMs) quote the Woolworths
--     supply price, which is already excluding VAT. The workbook measures GP
--     straight against it, and so does VYRON. These are right today.
--
--   * NPD Counters 2026 (19 BOMs) quote the counter shelf price including VAT.
--     The workbook divides by 1.15 before measuring GP; VYRON did not, so their
--     GP was overstated by 3.1 to 4.8 percentage points.
--
-- The rate itself is NOT added here. vyron_workspaces.default_vat_rate already
-- holds it (15 for all three workspaces) and adding a second rate would let the
-- two drift apart with no way to tell which one governs costing.
--
-- WHAT THIS IS NOT
-- This does not change any selling price or any cost. It records what the stored
-- price already means, so the engine can measure GP against revenue rather than
-- against revenue plus tax. Whether a price includes VAT is a property of the
-- commercial arrangement, so it is stated per BOM and never inferred from the
-- category, which can be renamed or reassigned.
--
-- EXISTING DATA
-- Defaults to false, which is exactly the behaviour every BOM has today, so no
-- GP moves on deploy. The 19 Counters BOMs are flagged in a separate, reported
-- data step rather than by a blind category-matching backfill here.

alter table public.vyron_cost_boms
  add column if not exists selling_price_includes_vat boolean not null default false;

comment on column public.vyron_cost_boms.selling_price_includes_vat is
  'True when selling_price is VAT-inclusive, so GP is measured against selling_price / (1 + default_vat_rate/100). False (the default) means the price is already VAT-exclusive and GP is measured against it directly. The rate comes from vyron_workspaces.default_vat_rate.';
