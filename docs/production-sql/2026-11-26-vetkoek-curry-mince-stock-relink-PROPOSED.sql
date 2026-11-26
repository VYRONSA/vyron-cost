-- =============================================================================
-- Vetkoek & Curry Mince 100g — re-link stock, pack size and BOM to the product
-- customers order. PROPOSED — NOT APPLIED. Requires explicit owner approval.
-- Production pnbstrqsrfoubdgcgimi, Handcrafted Food Products (Pty) Ltd.
--
-- Measured read-only 2026-11-26:
--   b540f483-56d9-42fd-82c7-84eecc73f3c7  original product — ARCHIVED 13 Nov; still owns
--       stock item 257f9a4f (FG-B540F483, 408 on hand), pack size (24/box), BOM 90e3a1b9.
--   81bcddb2-b529-41b3-8a29-1334285ebe05  Active, on price list "5" at R9.05 (added by staff
--       11 Nov), 5 invoices — NO stock record, NO pack size.  <- kept as THE product
--   454c2f27-e511-424f-916e-3793c134949c  Active, identical duplicate on list "5" (added
--       11 Nov, 3 min earlier), no invoices — archived here.
-- Every portal order containing either duplicate was cancelled by the stock reservation
-- (8 orders, 20–26 Nov). See docs/production-sql/2026-11-26-vetkoek-curry-mince-REPORT.md.
--
-- Changes (4 rows; no quantity, price, price list, cost or ledger row is changed):
--   1. stock item 257f9a4f: entity_id b540f483 -> 81bcddb2 (same row: balance, cost and
--      ledger history stay exactly as they are)
--   2. pack size c4730913: product_id b540f483 -> 81bcddb2 (24 per box)
--   3. BOM 90e3a1b9: product_id b540f483 -> 81bcddb2 (future production runs receive into
--      the same stock item instead of re-creating one for the archived product)
--   4. product 454c2f27: status/product_status Active -> Archived (removes the second
--      identical catalogue entry; its price-list item is left as is, like other archived
--      products on list 5 — the catalogue never shows an archived product)
-- One transaction; each statement must touch exactly one row in the measured state,
-- otherwise everything rolls back.
-- =============================================================================
begin;
set local lock_timeout = '5s';

do $$
declare
  co constant uuid := '851d2acb-b5c5-43a6-9dfb-f7df93c4ce2b';
  keep constant uuid := '81bcddb2-b529-41b3-8a29-1334285ebe05';
  orig constant uuid := 'b540f483-56d9-42fd-82c7-84eecc73f3c7';
  dup constant uuid := '454c2f27-e511-424f-916e-3793c134949c';
  n int;
begin
  -- Pre-conditions (the state measured on 2026-11-26)
  if (select count(*) from vyron_cost_products where company_id = co and id = keep and status = 'Active') <> 1 then raise exception 'kept product not Active'; end if;
  if (select count(*) from vyron_cost_products where company_id = co and id = orig and status = 'Archived') <> 1 then raise exception 'original product not Archived'; end if;
  if exists (select 1 from vyron_cost_stock_items where company_id = co and entity_type = 'finished_goods' and entity_id in (keep, dup)) then raise exception 'a duplicate already has a stock record'; end if;
  if exists (select 1 from vyron_cost_product_pack_sizes where product_id in (keep, dup)) then raise exception 'a duplicate already has a pack size'; end if;

  update vyron_cost_stock_items set entity_id = keep, updated_at = now()
   where id = '257f9a4f-fdcf-4c84-a17a-1403d2d30f25' and company_id = co and entity_type = 'finished_goods' and entity_id = orig and qty_on_hand = 408;
  get diagnostics n = row_count; if n <> 1 then raise exception 'stock item: % rows (expected 1, qty 408)', n; end if;

  update vyron_cost_product_pack_sizes set product_id = keep, updated_at = now()
   where id = 'c4730913-64c1-430c-b790-d5023b2dd51c' and company_id = co and product_id = orig and units_per_box = 24;
  get diagnostics n = row_count; if n <> 1 then raise exception 'pack size: % rows', n; end if;

  update vyron_cost_boms set product_id = keep, updated_at = now()
   where id = '90e3a1b9-3fc5-44f6-bbb0-a0b13d7ff97c' and company_id = co and product_id = orig;
  get diagnostics n = row_count; if n <> 1 then raise exception 'BOM: % rows', n; end if;

  update vyron_cost_products set status = 'Archived', product_status = 'Archived', updated_at = now()
   where id = dup and company_id = co and status = 'Active';
  get diagnostics n = row_count; if n <> 1 then raise exception 'duplicate product: % rows', n; end if;

  -- Post-conditions
  if (select qty_on_hand from vyron_cost_stock_items where id = '257f9a4f-fdcf-4c84-a17a-1403d2d30f25') <> 408 then raise exception 'stock balance changed'; end if;
  if (select count(*) from vyron_cost_stock_items where company_id = co and entity_type = 'finished_goods' and entity_id = keep) <> 1 then raise exception 'kept product has no single stock record'; end if;
  if (select count(*) from vyron_customer_price_list_items where price_list_id = 'bbb2cd1b-1cb6-4f70-9b78-ed82e03a0710' and product_id = keep and status = 'Active' and final_price = 9.05) <> 1 then raise exception 'list 5 item for kept product not Active at 9.05'; end if;
end $$;

commit;

-- ---------------------------------------------------------------------------
-- ROLLBACK (exact inverse; run only if the change above was applied)
-- ---------------------------------------------------------------------------
-- begin;
-- update vyron_cost_stock_items set entity_id = 'b540f483-56d9-42fd-82c7-84eecc73f3c7', updated_at = now()
--  where id = '257f9a4f-fdcf-4c84-a17a-1403d2d30f25' and entity_id = '81bcddb2-b529-41b3-8a29-1334285ebe05';
-- update vyron_cost_product_pack_sizes set product_id = 'b540f483-56d9-42fd-82c7-84eecc73f3c7', updated_at = now()
--  where id = 'c4730913-64c1-430c-b790-d5023b2dd51c' and product_id = '81bcddb2-b529-41b3-8a29-1334285ebe05';
-- update vyron_cost_boms set product_id = 'b540f483-56d9-42fd-82c7-84eecc73f3c7', updated_at = now()
--  where id = '90e3a1b9-3fc5-44f6-bbb0-a0b13d7ff97c' and product_id = '81bcddb2-b529-41b3-8a29-1334285ebe05';
-- update vyron_cost_products set status = 'Active', product_status = 'Active', updated_at = now()
--  where id = '454c2f27-e511-424f-916e-3793c134949c' and status = 'Archived';
-- commit;

-- ---------------------------------------------------------------------------
-- VERIFY (read-only, after applying)
-- ---------------------------------------------------------------------------
-- select p.id, p.product_name, p.status,
--        (select qty_on_hand from vyron_cost_stock_items s where s.entity_type = 'finished_goods' and s.entity_id = p.id) as qty_on_hand,
--        (select units_per_box from vyron_cost_product_pack_sizes k where k.product_id = p.id) as units_per_box,
--        (select count(*) from vyron_cost_boms b where b.product_id = p.id) as boms
--   from vyron_cost_products p
--  where p.id in ('81bcddb2-b529-41b3-8a29-1334285ebe05','454c2f27-e511-424f-916e-3793c134949c','b540f483-56d9-42fd-82c7-84eecc73f3c7');
-- Expected: 81bcddb2 Active, 408, 24, 1 BOM; the other two Archived with nothing.
