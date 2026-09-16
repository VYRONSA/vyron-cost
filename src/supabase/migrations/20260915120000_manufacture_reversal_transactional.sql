-- Manufacture Run reversal — transactional (single Postgres transaction) RPC.
--
-- Phase 32. The application-level reverseProductionRun used a compensation
-- pattern (not atomic) with an application-level status check (not concurrency
-- safe) and did not restore product.total_cost. This migration replaces that
-- with a database function so the ENTIRE reversal runs in one transaction:
-- any failure rolls back every row, a row lock serialises concurrent attempts,
-- and the product cost is restored from a completion-time snapshot.
--
-- Additive and idempotent: adds one nullable column and (re)creates one
-- function. No data is mutated.

-- 1. Completion-time product-cost snapshot. completeProductionRun records the
--    product.total_cost that existed immediately BEFORE it overwrote it, so the
--    reversal can restore that exact value (never a recalculation).
alter table public.vyron_cost_production_runs
  add column if not exists previous_product_total_cost numeric;

comment on column public.vyron_cost_production_runs.previous_product_total_cost is
  'product.total_cost immediately before this run completed; used to restore product cost on reversal. Set once at completion, never overwritten.';

-- 2. The transactional reversal.
create or replace function public.reverse_production_run(
  p_company_id uuid,
  p_run_id uuid,
  p_reason text,
  p_actor text
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_run           public.vyron_cost_production_runs%rowtype;
  v_reason        text := btrim(coalesce(p_reason, ''));
  v_reversal_id   uuid := gen_random_uuid();
  v_txn           public.vyron_cost_inventory_transactions%rowtype;
  v_item          public.vyron_cost_stock_items%rowtype;
  v_available     numeric;
  v_downstream    integer;
  v_new_qty       numeric;
  v_new_avg       numeric;
  v_new_txn_id    uuid;
  v_removed       integer := 0;
  v_restored      integer := 0;
  v_orig_ids      uuid[] := '{}';
  v_rev_ids       uuid[] := '{}';
  v_prev_cost     numeric;
  v_restored_cost numeric := null;
begin
  -- Mandatory, bounded reason.
  if v_reason = '' then
    raise exception 'A reversal reason is required.' using errcode = '22023';
  end if;
  if length(v_reason) > 500 then
    raise exception 'A reversal reason must be 500 characters or fewer.' using errcode = '22023';
  end if;

  -- Concurrency: lock the run row. A second concurrent reversal blocks here and,
  -- once the first commits, sees status Reversed and returns already_reversed.
  select * into v_run
    from public.vyron_cost_production_runs
    where id = p_run_id and company_id = p_company_id
    for update;
  if not found then
    raise exception 'Production run not found.' using errcode = 'P0002';
  end if;

  -- Idempotency (sequential and concurrent): a run reverses exactly once.
  if v_run.status = 'Reversed' then
    return jsonb_build_object('status', 'already_reversed', 'run_id', p_run_id, 'run_status', 'Reversed');
  end if;
  if v_run.status <> 'Completed' then
    raise exception 'Cannot reverse from status %.', v_run.status using errcode = 'P0001';
  end if;

  -- Pre-flight (BEFORE any write): every finished good produced must still be on
  -- hand. If it was sold / issued / transferred / consumed the current stock is
  -- short — block with a precise shortfall rather than driving stock negative.
  for v_txn in
    select * from public.vyron_cost_inventory_transactions
      where company_id = p_company_id and reference_type = 'production_run'
        and reference_id = p_run_id and transaction_type = 'Receipt'
  loop
    select coalesce(qty_on_hand, 0) into v_available
      from public.vyron_cost_stock_items
      where id = v_txn.stock_item_id and company_id = p_company_id;
    v_available := coalesce(v_available, 0);
    if v_available < v_txn.quantity then
      select count(*) into v_downstream
        from public.vyron_cost_inventory_transactions
        where company_id = p_company_id and stock_item_id = v_txn.stock_item_id
          and transaction_type in ('Consumption', 'Issue', 'Transfer', 'Adjustment')
          and reference_id is distinct from p_run_id;
      -- No writes have happened yet: return a structured block (the caller maps
      -- this to HTTP 409). Nothing to roll back.
      return jsonb_build_object(
        'status', 'blocked',
        'run_id', p_run_id,
        'run_number', v_run.run_number,
        'stock_item_id', v_txn.stock_item_id,
        'produced', v_txn.quantity,
        'available', v_available,
        'shortfall', v_txn.quantity - v_available,
        'downstreamIssues', v_downstream
      );
    end if;
  end loop;

  -- (H/I) Remove the finished goods first — a compensating Consumption per
  -- original Receipt, using the ORIGINAL posted quantity and cost snapshot.
  for v_txn in
    select * from public.vyron_cost_inventory_transactions
      where company_id = p_company_id and reference_type = 'production_run'
        and reference_id = p_run_id and transaction_type = 'Receipt'
  loop
    select * into v_item from public.vyron_cost_stock_items where id = v_txn.stock_item_id for update;
    if not found then
      raise exception 'Finished-good stock item % not found during reversal.', v_txn.stock_item_id using errcode = 'P0001';
    end if;
    v_new_qty := v_item.qty_on_hand - v_txn.quantity;
    if v_new_qty < 0 then
      raise exception 'Insufficient finished stock during reversal.' using errcode = 'P0001';
    end if;
    v_new_txn_id := gen_random_uuid();
    insert into public.vyron_cost_inventory_transactions
      (id, company_id, transaction_number, transaction_type, entity_type, entity_id, stock_item_id, quantity, unit_cost, total_cost, reference_type, reference_id, notes, created_by)
      values (v_new_txn_id, p_company_id, 'IT-REV-' || substr(v_new_txn_id::text, 1, 8), 'Consumption', v_txn.entity_type, v_txn.entity_id, v_txn.stock_item_id, v_txn.quantity, v_txn.unit_cost, v_txn.quantity * v_txn.unit_cost, 'production_run_reversal', p_run_id,
        jsonb_build_object('reason', v_reason, 'reversalId', v_reversal_id, 'original_transaction_id', v_txn.id, 'original_run_id', p_run_id)::text, p_actor);
    update public.vyron_cost_stock_items
      set qty_on_hand = v_new_qty, inventory_value = round(v_new_qty * average_cost, 2), last_movement_at = now(), updated_at = now()
      where id = v_txn.stock_item_id;
    insert into public.vyron_cost_stock_ledger
      (company_id, stock_item_id, movement_type, quantity_in, quantity_out, balance_after, unit_cost, value, reference_type, reference_id, reference_label, actor, metadata)
      values (p_company_id, v_txn.stock_item_id, 'Production Reversal', 0, v_txn.quantity, v_new_qty, v_txn.unit_cost, round(-(v_txn.quantity * v_txn.unit_cost), 2), 'production_run_reversal', p_run_id, v_run.run_number, p_actor,
        jsonb_build_object('reversalId', v_reversal_id, 'original_transaction_id', v_txn.id));
    v_removed := v_removed + 1;
    v_orig_ids := v_orig_ids || v_txn.id;
    v_rev_ids := v_rev_ids || v_new_txn_id;
  end loop;

  -- (H/I) Restore raw materials / packaging — a compensating Receipt per original
  -- Consumption, with weighted-average recompute (matches postStockMovement).
  for v_txn in
    select * from public.vyron_cost_inventory_transactions
      where company_id = p_company_id and reference_type = 'production_run'
        and reference_id = p_run_id and transaction_type in ('Consumption', 'Issue')
  loop
    select * into v_item from public.vyron_cost_stock_items where id = v_txn.stock_item_id for update;
    if not found then
      raise exception 'Component stock item % not found during reversal.', v_txn.stock_item_id using errcode = 'P0001';
    end if;
    v_new_qty := v_item.qty_on_hand + v_txn.quantity;
    if v_new_qty > 0 then
      v_new_avg := round((v_item.qty_on_hand * v_item.average_cost + v_txn.quantity * v_txn.unit_cost) / v_new_qty, 4);
    else
      v_new_avg := v_item.average_cost;
    end if;
    v_new_txn_id := gen_random_uuid();
    insert into public.vyron_cost_inventory_transactions
      (id, company_id, transaction_number, transaction_type, entity_type, entity_id, stock_item_id, quantity, unit_cost, total_cost, reference_type, reference_id, notes, created_by)
      values (v_new_txn_id, p_company_id, 'IT-REV-' || substr(v_new_txn_id::text, 1, 8), 'Receipt', v_txn.entity_type, v_txn.entity_id, v_txn.stock_item_id, v_txn.quantity, v_txn.unit_cost, v_txn.quantity * v_txn.unit_cost, 'production_run_reversal', p_run_id,
        jsonb_build_object('reason', v_reason, 'reversalId', v_reversal_id, 'original_transaction_id', v_txn.id, 'original_run_id', p_run_id)::text, p_actor);
    update public.vyron_cost_stock_items
      set qty_on_hand = v_new_qty, average_cost = v_new_avg, current_cost = v_txn.unit_cost, inventory_value = round(v_new_qty * v_new_avg, 2), last_movement_at = now(), updated_at = now()
      where id = v_txn.stock_item_id;
    insert into public.vyron_cost_stock_ledger
      (company_id, stock_item_id, movement_type, quantity_in, quantity_out, balance_after, unit_cost, value, reference_type, reference_id, reference_label, actor, metadata)
      values (p_company_id, v_txn.stock_item_id, 'Production Reversal', v_txn.quantity, 0, v_new_qty, v_txn.unit_cost, round(v_txn.quantity * v_txn.unit_cost, 2), 'production_run_reversal', p_run_id, v_run.run_number, p_actor,
        jsonb_build_object('reversalId', v_reversal_id, 'original_transaction_id', v_txn.id));
    v_restored := v_restored + 1;
    v_orig_ids := v_orig_ids || v_txn.id;
    v_rev_ids := v_rev_ids || v_new_txn_id;
  end loop;

  -- (J) Restore the product cost from the completion-time snapshot (authoritative;
  -- never a recalculation). Left untouched if no snapshot was captured.
  v_prev_cost := v_run.previous_product_total_cost;
  if v_run.product_id is not null and v_prev_cost is not null then
    update public.vyron_cost_products
      set total_cost = v_prev_cost, updated_at = now()
      where id = v_run.product_id and company_id = p_company_id;
    v_restored_cost := v_prev_cost;
  end if;

  -- (K) Status transition Completed -> Reversed (the row is already locked).
  update public.vyron_cost_production_runs
    set status = 'Reversed', updated_at = now()
    where id = p_run_id and company_id = p_company_id;

  -- (L) Complete, answerable audit trail.
  insert into public.vyron_cost_production_audit_log
    (company_id, production_run_id, event_type, actor, field_name, old_value, new_value, detail)
    values (p_company_id, p_run_id, 'Production Reversed', p_actor, 'status', 'Completed', 'Reversed',
      jsonb_build_object(
        'reason', v_reason, 'reversalId', v_reversal_id, 'reversedAt', now(),
        'originalQty', v_run.actual_qty, 'reversedQty', v_run.actual_qty,
        'originalCost', v_run.actual_cost, 'previousProductCost', v_prev_cost, 'restoredProductCost', v_restored_cost,
        'rawMaterialsRestored', v_restored, 'finishedGoodsRemoved', v_removed,
        'originalTransactionIds', to_jsonb(v_orig_ids), 'reversalTransactionIds', to_jsonb(v_rev_ids)
      )::text);

  -- (M) Result.
  return jsonb_build_object(
    'status', 'reversed',
    'run_id', p_run_id,
    'reversal_id', v_reversal_id,
    'transactions_reversed', v_removed + v_restored,
    'finished_goods_removed', v_removed,
    'raw_materials_restored', v_restored,
    'product_id', v_run.product_id,
    'previous_product_cost', v_prev_cost,
    'restored_product_cost', v_restored_cost,
    'run_status', 'Reversed'
  );
end;
$$;

-- (12) Security: not exposed to anon; the API route (service role) is the only
-- intended caller, and the function itself validates company/run ownership.
-- Supabase default privileges auto-grant EXECUTE on new public functions to
-- anon, authenticated AND service_role. The route (service_role) is the only
-- intended caller, so revoke anon + authenticated + public and keep service_role
-- alone — a browser session must never invoke the reversal directly and bypass
-- the route's permission / supervisor / reason gates.
revoke all on function public.reverse_production_run(uuid, uuid, text, text) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.reverse_production_run(uuid, uuid, text, text) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function public.reverse_production_run(uuid, uuid, text, text) from authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.reverse_production_run(uuid, uuid, text, text) to service_role';
  end if;
end $$;
