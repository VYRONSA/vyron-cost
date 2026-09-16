-- Food Sock cost-precision correction — one controlled, audited transaction.
--
-- WHY
-- The Food Sock import (run e6fcb6fa-36ed-4c63-bfef-370ef2116c04) wrote two
-- ingredient costs into columns that were numeric(12,2): Date Sticker R0.05064
-- was stored as R0.05 and Insert Sleeve R0.3164 as R0.32. Separately, the
-- inventory engine stores a weighted average cost to four decimals, so the Date
-- Sticker stock item carries R0.0506 and is valued R2,844.48 against its
-- opening ledger value of R2,846.73.
--
-- WHAT
-- 1. vyron_data_corrections: an append-only record of each controlled data
--    correction (who approved it, why, the plan hash, every previous and new
--    value). One row per correction key, which makes a correction idempotent.
-- 2. apply_food_sock_cost_precision_correction(): applies exactly the approved
--    correction in one transaction, or nothing:
--      ingredient 03097405-… Date Sticker   purchase_cost, true_unit_cost 0.05 → 0.05064
--      ingredient 8a83683d-… Insert Sleeve  purchase_cost, true_unit_cost 0.32 → 0.3164
--      the Date Sticker stock item          average_cost 0.0506 → 0.05064,
--                                           inventory_value 2844.48 → 2846.73
--    The scope is fixed in the function. It refuses — before any write — a
--    different company, a missing, duplicated or foreign row, a value that is
--    not exactly the approved pre-correction value, a Date Sticker stock item
--    that is not the caller's resolved one or has any movement besides its
--    opening balance, an Insert Sleeve valuation that is not already
--    consistent, a malformed approval, or the ingredient columns still at two
--    decimals (apply 20260917090000 first). After writing it refuses — rolling
--    everything back — unless this transaction changed exactly two ingredient
--    rows and one stock item row and nothing in BOMs, BOM lines, products, the
--    stock ledger, import runs or source links.
--    Target rows are locked in a fixed order, so concurrent calls serialise:
--    the first applies, the others return already_applied.
--
-- Callable by service_role only. Changes no existing data when applied; it
-- creates one table and one function. Re-running it is safe.

create table if not exists public.vyron_data_corrections (
  id uuid primary key default gen_random_uuid(),
  correction_key text not null,
  company_id uuid not null references public.vyron_cost_companies(id) on delete cascade,
  plan_hash text not null,
  approver text not null,
  acknowledgement text not null,
  reason text not null,
  affected jsonb not null,
  previous_values jsonb not null,
  new_values jsonb not null,
  applied_at timestamptz not null default now(),
  applied_by text not null default current_user,
  constraint vyron_data_corrections_key unique (correction_key),
  constraint vyron_data_corrections_plan_hash check (plan_hash ~ '^[0-9a-f]{64}$'),
  constraint vyron_data_corrections_named check (btrim(approver) <> '' and btrim(reason) <> '' and btrim(acknowledgement) <> '')
);

create index if not exists idx_vyron_data_corrections_company
  on public.vyron_data_corrections (company_id, applied_at);

alter table public.vyron_data_corrections enable row level security;

-- Append-only: a correction record is never edited, and never deleted except
-- by the company's own cascade.
create or replace function public.vyron_data_corrections_append_only()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'vyron_data_corrections is append-only; a correction record cannot be changed.';
  end if;
  if pg_trigger_depth() <= 1 then
    raise exception 'vyron_data_corrections is append-only; a correction record is removed only with its company.';
  end if;
  return old;
end;
$$;

drop trigger if exists vyron_data_corrections_append_only on public.vyron_data_corrections;
create trigger vyron_data_corrections_append_only
  before update or delete on public.vyron_data_corrections
  for each row execute function public.vyron_data_corrections_append_only();

create or replace function public.apply_food_sock_cost_precision_correction(
  p_company_id uuid,
  p_stock_item_id uuid,
  p_plan_hash text,
  p_approver text,
  p_acknowledgement text,
  p_reason text
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  c_key constant text := 'food-sock-cost-precision-2026-09';
  c_company constant uuid := 'e920c747-1d27-4d01-9e7c-182f9a7d0aa3';
  c_sticker constant uuid := '03097405-22d1-42a5-bbcf-7162910848d4';
  c_sleeve constant uuid := '8a83683d-0475-42db-bb1c-2758b08ec2c2';
  c_sticker_old constant numeric := 0.05;
  c_sticker_new constant numeric := 0.05064;
  c_sleeve_old constant numeric := 0.32;
  c_sleeve_new constant numeric := 0.3164;
  c_sticker_qty constant numeric := 56215;
  c_sticker_avg_old constant numeric := 0.0506;
  c_sticker_value_old constant numeric := 2844.48;
  c_sticker_value_new constant numeric := 2846.73;
  c_sleeve_qty constant numeric := 24058.75;
  c_sleeve_value constant numeric := 7612.19;
  v_ack text;
  v_count integer;
  v_sticker public.vyron_cost_ingredients%rowtype;
  v_sleeve public.vyron_cost_ingredients%rowtype;
  v_stock public.vyron_cost_stock_items%rowtype;
  v_sleeve_stock public.vyron_cost_stock_items%rowtype;
  v_existing public.vyron_data_corrections%rowtype;
  v_id uuid;
  v_affected jsonb;
  v_previous jsonb;
  v_new jsonb;
begin
  /* ---- 1. the approval itself ---------------------------------------- */
  if p_company_id is distinct from c_company then
    raise exception 'REFUSED: correction % is bound to company %, not %.', c_key, c_company, p_company_id;
  end if;
  if p_plan_hash is null or p_plan_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'REFUSED: a 64-character lowercase hex plan hash is required.';
  end if;
  if coalesce(btrim(p_approver), '') = '' then
    raise exception 'REFUSED: a named approver is required.';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'REFUSED: a reason is required.';
  end if;
  v_ack := 'CORRECT FOOD SOCK COST PRECISION ' || left(p_plan_hash, 12) || ' IN ' || c_company::text;
  if p_acknowledgement is distinct from v_ack then
    raise exception 'REFUSED: the acknowledgement must be exactly "%".', v_ack;
  end if;

  /* ---- 2. the columns must be able to hold the corrected values -------- */
  select count(*) into v_count
    from information_schema.columns
   where table_schema = 'public' and table_name = 'vyron_cost_ingredients'
     and column_name in ('purchase_cost', 'true_unit_cost') and numeric_scale >= 8;
  if v_count <> 2 then
    raise exception 'REFUSED: vyron_cost_ingredients cost columns cannot hold 0.05064; apply migration 20260917090000 first.';
  end if;

  /* ---- 3. lock and verify the ingredients ------------------------------ */
  perform 1 from public.vyron_cost_ingredients where id in (c_sticker, c_sleeve) order by id for update;
  select * into v_sticker from public.vyron_cost_ingredients where id = c_sticker;
  if not found then raise exception 'REFUSED: target ingredient % (Date Sticker) does not exist.', c_sticker; end if;
  select * into v_sleeve from public.vyron_cost_ingredients where id = c_sleeve;
  if not found then raise exception 'REFUSED: target ingredient % (Insert Sleeve) does not exist.', c_sleeve; end if;
  if v_sticker.company_id is distinct from c_company or v_sleeve.company_id is distinct from c_company then
    raise exception 'REFUSED: a target ingredient does not belong to company %.', c_company;
  end if;
  if v_sticker.ingredient_name is distinct from 'Date Sticker' or v_sleeve.ingredient_name is distinct from 'Insert Sleeve' then
    raise exception 'REFUSED: target ingredient names are not Date Sticker and Insert Sleeve.';
  end if;
  select count(*) into v_count from public.vyron_cost_ingredients
   where company_id = c_company and lower(btrim(ingredient_name)) in ('date sticker', 'insert sleeve');
  if v_count <> 2 then
    raise exception 'REFUSED: the company holds % ingredients named Date Sticker or Insert Sleeve; exactly 2 are required.', v_count;
  end if;
  select count(*) into v_count from public.vyron_import_source_links
   where company_id = c_company and source_system = 'inflow' and source_entity = 'product'
     and ((source_key = 'product:name:date sticker' and entity_id = c_sticker)
       or (source_key = 'product:name:insert sleeve' and entity_id = c_sleeve));
  if v_count <> 2 then
    raise exception 'REFUSED: the target ingredients are not the ones the Food Sock import linked to its source rows.';
  end if;

  /* ---- 4. lock and verify the stock items and their ledgers ------------ */
  perform 1 from public.vyron_cost_stock_items where entity_id in (c_sticker, c_sleeve) order by id for update;
  select count(*) into v_count from public.vyron_cost_stock_items where entity_id = c_sticker;
  if v_count <> 1 then
    raise exception 'REFUSED: expected exactly one stock item for Date Sticker, found %.', v_count;
  end if;
  select * into v_stock from public.vyron_cost_stock_items where entity_id = c_sticker;
  if v_stock.company_id is distinct from c_company then
    raise exception 'REFUSED: the Date Sticker stock item does not belong to company %.', c_company;
  end if;
  if v_stock.id is distinct from p_stock_item_id then
    raise exception 'REFUSED: the Date Sticker stock item is %, not the resolved %.', v_stock.id, p_stock_item_id;
  end if;
  select count(*) into v_count from public.vyron_cost_stock_items where entity_id = c_sleeve;
  if v_count <> 1 then
    raise exception 'REFUSED: expected exactly one stock item for Insert Sleeve, found %.', v_count;
  end if;
  select * into v_sleeve_stock from public.vyron_cost_stock_items where entity_id = c_sleeve;
  if v_sleeve_stock.company_id is distinct from c_company then
    raise exception 'REFUSED: the Insert Sleeve stock item does not belong to company %.', c_company;
  end if;

  select count(*) into v_count from public.vyron_cost_stock_ledger where stock_item_id = v_stock.id;
  if v_count <> 1 then
    raise exception 'REFUSED: the Date Sticker stock item has % ledger rows; the correction applies only while its opening balance is the only one.', v_count;
  end if;
  select count(*) into v_count from public.vyron_cost_stock_ledger
   where stock_item_id = v_stock.id and company_id = c_company and movement_type = 'Opening Balance'
     and quantity_in = c_sticker_qty and coalesce(quantity_out, 0) = 0 and balance_after = c_sticker_qty
     and unit_cost = c_sticker_new and value = c_sticker_value_new;
  if v_count <> 1 then
    raise exception 'REFUSED: the Date Sticker opening balance is not % at % (value %).', c_sticker_qty, c_sticker_new, c_sticker_value_new;
  end if;

  select count(*) into v_count from public.vyron_cost_stock_ledger where stock_item_id = v_sleeve_stock.id;
  if v_count <> 1 then
    raise exception 'REFUSED: the Insert Sleeve stock item has % ledger rows; its valuation is no longer the imported one.', v_count;
  end if;
  select count(*) into v_count from public.vyron_cost_stock_ledger
   where stock_item_id = v_sleeve_stock.id and company_id = c_company and movement_type = 'Opening Balance'
     and quantity_in = c_sleeve_qty and unit_cost = c_sleeve_new and value = c_sleeve_value;
  if v_count <> 1
     or v_sleeve_stock.qty_on_hand <> c_sleeve_qty
     or v_sleeve_stock.average_cost <> c_sleeve_new
     or v_sleeve_stock.current_cost <> c_sleeve_new
     or v_sleeve_stock.inventory_value <> c_sleeve_value then
    raise exception 'REFUSED: the Insert Sleeve valuation is not the consistent % × % = %; correcting it is outside the approved scope.', c_sleeve_qty, c_sleeve_new, c_sleeve_value;
  end if;

  /* ---- 5. already applied? --------------------------------------------- */
  select * into v_existing from public.vyron_data_corrections where correction_key = c_key;
  if found then
    if v_sticker.purchase_cost = c_sticker_new and v_sticker.true_unit_cost = c_sticker_new
       and v_sleeve.purchase_cost = c_sleeve_new and v_sleeve.true_unit_cost = c_sleeve_new
       and v_stock.average_cost = c_sticker_new and v_stock.inventory_value = c_sticker_value_new then
      return jsonb_build_object('status', 'already_applied', 'correction_id', v_existing.id, 'plan_hash', v_existing.plan_hash, 'applied_at', v_existing.applied_at);
    end if;
    raise exception 'REFUSED: correction % was applied (%), but the values have changed since; review before any further change.', c_key, v_existing.id;
  end if;

  /* ---- 6. exact pre-correction values ----------------------------------- */
  if v_sticker.purchase_cost <> c_sticker_old or v_sticker.true_unit_cost <> c_sticker_old then
    raise exception 'REFUSED: Date Sticker costs are % / %, not the expected % / %.', v_sticker.purchase_cost, v_sticker.true_unit_cost, c_sticker_old, c_sticker_old;
  end if;
  if v_sleeve.purchase_cost <> c_sleeve_old or v_sleeve.true_unit_cost <> c_sleeve_old then
    raise exception 'REFUSED: Insert Sleeve costs are % / %, not the expected % / %.', v_sleeve.purchase_cost, v_sleeve.true_unit_cost, c_sleeve_old, c_sleeve_old;
  end if;
  if v_stock.qty_on_hand <> c_sticker_qty or v_stock.current_cost <> c_sticker_new
     or v_stock.average_cost <> c_sticker_avg_old or v_stock.inventory_value <> c_sticker_value_old then
    raise exception 'REFUSED: the Date Sticker stock item is qty % / current % / average % / value %, not the expected % / % / % / %.',
      v_stock.qty_on_hand, v_stock.current_cost, v_stock.average_cost, v_stock.inventory_value,
      c_sticker_qty, c_sticker_new, c_sticker_avg_old, c_sticker_value_old;
  end if;
  if round(c_sticker_qty * c_sticker_new, 2) <> c_sticker_value_new then
    raise exception 'REFUSED: % × % does not round to %.', c_sticker_qty, c_sticker_new, c_sticker_value_new;
  end if;

  /* ---- 7. the correction ------------------------------------------------ */
  update public.vyron_cost_ingredients
     set purchase_cost = c_sticker_new, true_unit_cost = c_sticker_new, updated_at = now()
   where id = c_sticker and company_id = c_company and purchase_cost = c_sticker_old and true_unit_cost = c_sticker_old;
  get diagnostics v_count = row_count;
  if v_count <> 1 then raise exception 'REFUSED: Date Sticker update touched % rows.', v_count; end if;

  update public.vyron_cost_ingredients
     set purchase_cost = c_sleeve_new, true_unit_cost = c_sleeve_new, updated_at = now()
   where id = c_sleeve and company_id = c_company and purchase_cost = c_sleeve_old and true_unit_cost = c_sleeve_old;
  get diagnostics v_count = row_count;
  if v_count <> 1 then raise exception 'REFUSED: Insert Sleeve update touched % rows.', v_count; end if;

  update public.vyron_cost_stock_items
     set average_cost = c_sticker_new, inventory_value = c_sticker_value_new, updated_at = now()
   where id = v_stock.id and company_id = c_company
     and average_cost = c_sticker_avg_old and inventory_value = c_sticker_value_old;
  get diagnostics v_count = row_count;
  if v_count <> 1 then raise exception 'REFUSED: Date Sticker stock item update touched % rows.', v_count; end if;

  /* ---- 8. exactly these rows, exactly these values ---------------------- */
  select count(*) into v_count from public.vyron_cost_ingredients
   where (id = c_sticker and purchase_cost = c_sticker_new and true_unit_cost = c_sticker_new)
      or (id = c_sleeve and purchase_cost = c_sleeve_new and true_unit_cost = c_sleeve_new);
  if v_count <> 2 then raise exception 'REFUSED: the corrected ingredient costs did not read back exactly.'; end if;
  select count(*) into v_count from public.vyron_cost_stock_items
   where id = v_stock.id and average_cost = c_sticker_new and inventory_value = c_sticker_value_new;
  if v_count <> 1 then raise exception 'REFUSED: the corrected stock valuation did not read back exactly.'; end if;

  -- age(xmin) = 0 marks a row version written by this transaction.
  select count(*) into v_count from public.vyron_cost_ingredients where age(xmin) = 0;
  if v_count <> 2 then raise exception 'REFUSED: % ingredient rows changed; exactly 2 are approved.', v_count; end if;
  select count(*) into v_count from public.vyron_cost_stock_items where age(xmin) = 0;
  if v_count <> 1 then raise exception 'REFUSED: % stock item rows changed; exactly 1 is approved.', v_count; end if;
  if exists (select 1 from public.vyron_cost_bom_lines where age(xmin) = 0)
     or exists (select 1 from public.vyron_cost_boms where age(xmin) = 0)
     or exists (select 1 from public.vyron_cost_products where age(xmin) = 0)
     or exists (select 1 from public.vyron_cost_stock_ledger where age(xmin) = 0)
     or exists (select 1 from public.vyron_import_runs where age(xmin) = 0)
     or exists (select 1 from public.vyron_import_source_links where age(xmin) = 0) then
    raise exception 'REFUSED: the correction changed rows outside its approved scope.';
  end if;

  /* ---- 9. the audit record ---------------------------------------------- */
  v_affected := jsonb_build_object(
    'ingredient_ids', jsonb_build_array(c_sticker, c_sleeve),
    'stock_item_id', v_stock.id,
    'unchanged_verified', jsonb_build_object('insert_sleeve_stock_item_id', v_sleeve_stock.id, 'inventory_value', c_sleeve_value)
  );
  v_previous := jsonb_build_object(
    'ingredients', jsonb_build_object(
      c_sticker::text, jsonb_build_object('name', 'Date Sticker', 'purchase_cost', v_sticker.purchase_cost, 'true_unit_cost', v_sticker.true_unit_cost),
      c_sleeve::text, jsonb_build_object('name', 'Insert Sleeve', 'purchase_cost', v_sleeve.purchase_cost, 'true_unit_cost', v_sleeve.true_unit_cost)),
    'stock_item', jsonb_build_object('id', v_stock.id, 'qty_on_hand', v_stock.qty_on_hand, 'average_cost', v_stock.average_cost, 'inventory_value', v_stock.inventory_value)
  );
  v_new := jsonb_build_object(
    'ingredients', jsonb_build_object(
      c_sticker::text, jsonb_build_object('name', 'Date Sticker', 'purchase_cost', c_sticker_new, 'true_unit_cost', c_sticker_new),
      c_sleeve::text, jsonb_build_object('name', 'Insert Sleeve', 'purchase_cost', c_sleeve_new, 'true_unit_cost', c_sleeve_new)),
    'stock_item', jsonb_build_object('id', v_stock.id, 'qty_on_hand', v_stock.qty_on_hand, 'average_cost', c_sticker_new, 'inventory_value', c_sticker_value_new)
  );
  insert into public.vyron_data_corrections (correction_key, company_id, plan_hash, approver, acknowledgement, reason, affected, previous_values, new_values)
  values (c_key, c_company, p_plan_hash, btrim(p_approver), p_acknowledgement, btrim(p_reason), v_affected, v_previous, v_new)
  returning id into v_id;

  return jsonb_build_object('status', 'applied', 'correction_id', v_id, 'plan_hash', p_plan_hash,
    'affected', v_affected, 'previous_values', v_previous, 'new_values', v_new);
end;
$$;

-- Service role only: Supabase grants new public objects to anon and
-- authenticated by default, and a browser session must never reach this.
revoke all on function public.apply_food_sock_cost_precision_correction(uuid, uuid, text, text, text, text) from public;
revoke all on function public.vyron_data_corrections_append_only() from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.apply_food_sock_cost_precision_correction(uuid, uuid, text, text, text, text) from anon';
    execute 'revoke all on table public.vyron_data_corrections from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function public.apply_food_sock_cost_precision_correction(uuid, uuid, text, text, text, text) from authenticated';
    execute 'revoke all on table public.vyron_data_corrections from authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.apply_food_sock_cost_precision_correction(uuid, uuid, text, text, text, text) to service_role';
    execute 'grant select, insert on table public.vyron_data_corrections to service_role';
  end if;
end $$;
