import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  findOrCreateStockItem,
  postStockMovement,
  writeInventoryAudit,
  type LedgerMovementType,
  type StockEntityType,
} from "@/lib/vyron-inventory";
import {
  buildIngredientRequirements,
  enrichIngredientShortages,
  getStoreProductionRunDetail,
  type StoreProductionRunRow,
} from "@/lib/vyron-store-production-planning";
import type { StoreOrderRow } from "@/lib/vyron-store-orders";

export const INVENTORY_TRANSACTION_TYPES = [
  "Receipt",
  "Issue",
  "Consumption",
  "Adjustment",
  "Transfer",
  "Count",
] as const;

export type InventoryTransactionType = (typeof INVENTORY_TRANSACTION_TYPES)[number];

export type InventoryTransactionRow = {
  id: string;
  company_id: string;
  transaction_number: string;
  transaction_type: InventoryTransactionType;
  entity_type: StockEntityType;
  entity_id: string | null;
  stock_item_id: string | null;
  quantity: number;
  unit_cost: number;
  total_cost: number;
  reference_type: string | null;
  reference_id: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
};

export type InventoryLedgerEntry = InventoryTransactionRow & {
  item_name: string;
  item_code: string;
  signed_quantity: number;
  running_balance: number;
  reference_label: string | null;
};

export type InventoryTransactionDashboardStats = {
  inventoryValue: number;
  stockMovementsToday: number;
  negativeStockWarnings: number;
  stockAdjustments: number;
};

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function round4(value: number) {
  return Math.round(value * 10000) / 10000;
}

function signedQuantityForType(type: InventoryTransactionType, quantity: number): number {
  const qty = Math.abs(round4(quantity));
  if (type === "Receipt") return qty;
  if (type === "Issue" || type === "Consumption") return -qty;
  if (type === "Adjustment" || type === "Count") return round4(quantity);
  if (type === "Transfer") return -qty;
  return round4(quantity);
}

function ledgerMovementType(type: InventoryTransactionType): LedgerMovementType {
  switch (type) {
    case "Receipt":
      return "Purchase";
    case "Issue":
      return "Customer Sale";
    case "Consumption":
      return "Production Consumption";
    case "Adjustment":
      return "Adjustment";
    case "Transfer":
      return "Transfer";
    case "Count":
      return "Stock Count Variance";
    default:
      return "Manual Correction";
  }
}

async function loadProductBomMap(supabase: SupabaseClient, companyId: string) {
  const [{ data: products }, { data: boms }, { data: bomLines }] = await Promise.all([
    supabase
      .from("vyron_cost_products")
      .select("id, product_name, linked_bom_id")
      .eq("company_id", companyId),
    supabase
      .from("vyron_cost_boms")
      .select("id, product_id, yield_qty, status")
      .eq("company_id", companyId)
      .neq("status", "Archived"),
    supabase.from("vyron_cost_bom_lines").select("*").eq("company_id", companyId),
  ]);

  const bomById = new Map<string, Record<string, unknown>>();
  const bomByProduct = new Map<string, Record<string, unknown>>();
  for (const bom of boms || []) {
    bomById.set(String(bom.id), bom as Record<string, unknown>);
    if (bom.product_id) bomByProduct.set(String(bom.product_id), bom as Record<string, unknown>);
  }

  const linesByBom = new Map<string, Record<string, unknown>[]>();
  for (const line of bomLines || []) {
    const bomId = String(line.bom_id);
    const bucket = linesByBom.get(bomId) || [];
    bucket.push(line as Record<string, unknown>);
    linesByBom.set(bomId, bucket);
  }

  const productBom = new Map<string, { bom: Record<string, unknown>; lines: Record<string, unknown>[] }>();
  for (const product of products || []) {
    const productId = String(product.id);
    const linkedBomId = product.linked_bom_id ? String(product.linked_bom_id) : "";
    const bom =
      (linkedBomId ? bomById.get(linkedBomId) : undefined) || bomByProduct.get(productId);
    if (!bom) continue;
    productBom.set(productId, {
      bom,
      lines: linesByBom.get(String(bom.id)) || [],
    });
  }

  return productBom;
}

export async function nextInventoryTransactionNumber(
  supabase: SupabaseClient,
  companyId: string
): Promise<string> {
  const prefix = `IT-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`;
  const { count } = await supabase
    .from("vyron_cost_inventory_transactions")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .like("transaction_number", `${prefix}%`);

  const seq = String((count || 0) + 1).padStart(4, "0");
  return `${prefix}-${seq}`;
}

async function resolveStockItemForEntity(
  supabase: SupabaseClient,
  companyId: string,
  entityType: StockEntityType,
  entityId: string | null,
  opts?: { itemCode?: string; description?: string; unitCost?: number }
) {
  if (entityId) {
    const { data: existing } = await supabase
      .from("vyron_cost_stock_items")
      .select("id, average_cost, current_cost, description, item_code, qty_on_hand")
      .eq("company_id", companyId)
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .maybeSingle();
    if (existing) return existing;
  }

  if (!opts?.itemCode || !opts?.description) {
    throw new Error("Stock item not found for entity.");
  }

  const created = await findOrCreateStockItem(supabase, companyId, {
    entityType,
    entityId: entityId || undefined,
    itemCode: opts.itemCode,
    description: opts.description,
    currentCost: opts.unitCost ?? 0,
  });
  return created;
}

export type PostInventoryTransactionInput = {
  companyId: string;
  transactionType: InventoryTransactionType;
  entityType: StockEntityType;
  entityId?: string | null;
  stockItemId?: string | null;
  quantity: number;
  unitCost?: number;
  referenceType?: string | null;
  referenceId?: string | null;
  referenceLabel?: string | null;
  notes?: string | null;
  createdBy?: string | null;
  itemCode?: string;
  itemDescription?: string;
  allowNegative?: boolean;
  skipStockMovement?: boolean;
};

export async function postInventoryTransaction(
  supabase: SupabaseClient,
  input: PostInventoryTransactionInput
): Promise<InventoryTransactionRow> {
  if (!INVENTORY_TRANSACTION_TYPES.includes(input.transactionType)) {
    throw new Error("Invalid transaction type.");
  }

  const signedQty = signedQuantityForType(input.transactionType, input.quantity);
  if (signedQty === 0) throw new Error("Quantity must be non-zero.");

  let stockItemId = input.stockItemId || null;
  let unitCost = round4(input.unitCost ?? 0);
  let entityType = input.entityType;
  let entityId = input.entityId ?? null;

  if (stockItemId) {
    const { data: item } = await supabase
      .from("vyron_cost_stock_items")
      .select("id, company_id, average_cost, current_cost, entity_type, entity_id")
      .eq("id", stockItemId)
      .maybeSingle();
    if (!item || String(item.company_id) !== String(input.companyId)) {
      throw new Error("Stock item not found.");
    }
    if (!unitCost) unitCost = round4(Number(item.average_cost || item.current_cost || 0));
    entityType = (item.entity_type as StockEntityType) || entityType;
    entityId = item.entity_id ? String(item.entity_id) : entityId;
  } else {
    const stock = await resolveStockItemForEntity(
      supabase,
      input.companyId,
      entityType,
      entityId,
      {
        itemCode: input.itemCode,
        description: input.itemDescription,
        unitCost,
      }
    );
    stockItemId = String(stock.id);
    if (!unitCost) unitCost = round4(Number(stock.average_cost || stock.current_cost || 0));
  }

  const magnitude = Math.abs(signedQty);
  const totalCost = round2(magnitude * unitCost);
  const transactionNumber = await nextInventoryTransactionNumber(supabase, input.companyId);
  const transactionId = randomUUID();
  const now = new Date().toISOString();

  const { error: insertErr } = await supabase.from("vyron_cost_inventory_transactions").insert({
    id: transactionId,
    company_id: input.companyId,
    transaction_number: transactionNumber,
    transaction_type: input.transactionType,
    entity_type: entityType,
    entity_id: entityId,
    stock_item_id: stockItemId,
    quantity: magnitude,
    unit_cost: unitCost,
    total_cost: totalCost,
    reference_type: input.referenceType || null,
    reference_id: input.referenceId || null,
    notes: input.notes || null,
    created_by: input.createdBy || "system",
    created_at: now,
  });
  if (insertErr) throw new Error(insertErr.message);

  if (!input.skipStockMovement) {
    const qtyIn = signedQty > 0 ? magnitude : 0;
    const qtyOut = signedQty < 0 ? magnitude : 0;
    await postStockMovement(supabase, {
      companyId: input.companyId,
      stockItemId,
      movementType: ledgerMovementType(input.transactionType),
      quantityIn: qtyIn,
      quantityOut: qtyOut,
      unitCost,
      referenceType: input.referenceType || "inventory_transaction",
      referenceId: transactionId,
      referenceLabel: input.referenceLabel || transactionNumber,
      actor: input.createdBy || "system",
      allowNegative: input.allowNegative,
      metadata: { transaction_type: input.transactionType, transaction_number: transactionNumber },
    });

    if (input.transactionType === "Adjustment") {
      await writeInventoryAudit(supabase, {
        companyId: input.companyId,
        stockItemId,
        eventType: "Inventory Adjustment",
        actor: input.createdBy || "system",
        detail: `ADJUST ${transactionNumber}: qty ${signedQty > 0 ? "+" : ""}${signedQty} @ ${unitCost}`,
        referenceType: input.referenceType || "inventory_transaction",
        referenceId: transactionId,
      });
    }
  }

  return {
    id: transactionId,
    company_id: input.companyId,
    transaction_number: transactionNumber,
    transaction_type: input.transactionType,
    entity_type: entityType,
    entity_id: entityId,
    stock_item_id: stockItemId,
    quantity: magnitude,
    unit_cost: unitCost,
    total_cost: totalCost,
    reference_type: input.referenceType || null,
    reference_id: input.referenceId || null,
    notes: input.notes || null,
    created_by: input.createdBy || "system",
    created_at: now,
  };
}

export async function postInventoryTransfer(
  supabase: SupabaseClient,
  input: {
    companyId: string;
    fromStockItemId: string;
    toStockItemId: string;
    quantity: number;
    unitCost?: number;
    notes?: string | null;
    createdBy?: string | null;
    referenceType?: string | null;
    referenceId?: string | null;
  }
) {
  const transferGroupId = randomUUID();
  const qty = round4(input.quantity);
  if (qty <= 0) throw new Error("Transfer quantity must be positive.");

  const [{ data: fromItem }, { data: toItem }] = await Promise.all([
    supabase
      .from("vyron_cost_stock_items")
      .select("id, entity_type, entity_id, average_cost, current_cost, description, item_code")
      .eq("id", input.fromStockItemId)
      .eq("company_id", input.companyId)
      .maybeSingle(),
    supabase
      .from("vyron_cost_stock_items")
      .select("id, entity_type, entity_id, average_cost, current_cost, description, item_code")
      .eq("id", input.toStockItemId)
      .eq("company_id", input.companyId)
      .maybeSingle(),
  ]);

  if (!fromItem || !toItem) throw new Error("Transfer stock items not found.");
  const unitCost = round4(
    input.unitCost ?? Number(fromItem.average_cost || fromItem.current_cost || 0)
  );

  const outTxn = await postInventoryTransaction(supabase, {
    companyId: input.companyId,
    transactionType: "Transfer",
    entityType: fromItem.entity_type as StockEntityType,
    entityId: fromItem.entity_id ? String(fromItem.entity_id) : null,
    stockItemId: String(fromItem.id),
    quantity: qty,
    unitCost,
    referenceType: input.referenceType || "inventory_transfer",
    referenceId: input.referenceId || transferGroupId,
    referenceLabel: `Transfer out → ${toItem.description}`,
    notes: input.notes || null,
    createdBy: input.createdBy,
  });

  const inTxn = await postInventoryTransaction(supabase, {
    companyId: input.companyId,
    transactionType: "Receipt",
    entityType: toItem.entity_type as StockEntityType,
    entityId: toItem.entity_id ? String(toItem.entity_id) : null,
    stockItemId: String(toItem.id),
    quantity: qty,
    unitCost,
    referenceType: input.referenceType || "inventory_transfer",
    referenceId: input.referenceId || transferGroupId,
    referenceLabel: `Transfer in ← ${fromItem.description}`,
    notes: input.notes || null,
    createdBy: input.createdBy,
  });

  return { transferGroupId, outTxn, inTxn };
}

export async function postInventoryStockCount(
  supabase: SupabaseClient,
  input: {
    companyId: string;
    stockItemId: string;
    countedQty: number;
    notes?: string | null;
    createdBy?: string | null;
  }
) {
  const { data: item } = await supabase
    .from("vyron_cost_stock_items")
    .select("id, entity_type, entity_id, qty_on_hand, average_cost, current_cost, description")
    .eq("id", input.stockItemId)
    .eq("company_id", input.companyId)
    .maybeSingle();
  if (!item) throw new Error("Stock item not found.");

  const systemQty = round4(Number(item.qty_on_hand || 0));
  const countedQty = round4(input.countedQty);
  const variance = round4(countedQty - systemQty);
  if (Math.abs(variance) < 0.0001) {
    throw new Error("No variance — counted quantity matches system stock.");
  }

  return postInventoryTransaction(supabase, {
    companyId: input.companyId,
    transactionType: "Count",
    entityType: item.entity_type as StockEntityType,
    entityId: item.entity_id ? String(item.entity_id) : null,
    stockItemId: String(item.id),
    quantity: variance,
    unitCost: round4(Number(item.average_cost || item.current_cost || 0)),
    referenceType: "stock_count",
    referenceLabel: `Count: system ${systemQty} → counted ${countedQty}`,
    notes: input.notes || null,
    createdBy: input.createdBy,
  });
}

export async function listInventoryTransactions(
  supabase: SupabaseClient,
  companyId: string,
  opts?: { entityType?: StockEntityType; entityId?: string; limit?: number }
): Promise<InventoryTransactionRow[]> {
  let query = supabase
    .from("vyron_cost_inventory_transactions")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });

  if (opts?.entityType) query = query.eq("entity_type", opts.entityType);
  if (opts?.entityId) query = query.eq("entity_id", opts.entityId);
  if (opts?.limit) query = query.limit(opts.limit);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data || []).map((row) => mapTransactionRow(row as Record<string, unknown>));
}

function mapTransactionRow(row: Record<string, unknown>): InventoryTransactionRow {
  return {
    id: String(row.id),
    company_id: String(row.company_id),
    transaction_number: String(row.transaction_number),
    transaction_type: row.transaction_type as InventoryTransactionType,
    entity_type: row.entity_type as StockEntityType,
    entity_id: row.entity_id ? String(row.entity_id) : null,
    stock_item_id: row.stock_item_id ? String(row.stock_item_id) : null,
    quantity: Number(row.quantity || 0),
    unit_cost: Number(row.unit_cost || 0),
    total_cost: Number(row.total_cost || 0),
    reference_type: row.reference_type ? String(row.reference_type) : null,
    reference_id: row.reference_id ? String(row.reference_id) : null,
    notes: row.notes ? String(row.notes) : null,
    created_by: row.created_by ? String(row.created_by) : null,
    created_at: String(row.created_at),
  };
}

export async function getInventoryLedger(
  supabase: SupabaseClient,
  companyId: string,
  opts?: { stockItemId?: string; limit?: number }
): Promise<InventoryLedgerEntry[]> {
  let query = supabase
    .from("vyron_cost_inventory_transactions")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: true });

  if (opts?.stockItemId) query = query.eq("stock_item_id", opts.stockItemId);
  if (opts?.limit) query = query.limit(opts.limit);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const stockIds = [...new Set((data || []).map((row) => row.stock_item_id).filter(Boolean))] as string[];
  const stockById = new Map<string, { item_code: string; description: string }>();
  if (stockIds.length) {
    const { data: stockItems } = await supabase
      .from("vyron_cost_stock_items")
      .select("id, item_code, description")
      .eq("company_id", companyId)
      .in("id", stockIds);
    for (const item of stockItems || []) {
      stockById.set(String(item.id), {
        item_code: String(item.item_code || ""),
        description: String(item.description || ""),
      });
    }
  }

  const balanceByItem = new Map<string, number>();
  const entries: InventoryLedgerEntry[] = [];

  for (const row of data || []) {
    const txn = mapTransactionRow(row as Record<string, unknown>);
    const stock = txn.stock_item_id ? stockById.get(txn.stock_item_id) : undefined;
    const itemKey = txn.stock_item_id || `${txn.entity_type}:${txn.entity_id || "none"}`;
    const signedQty = signedQuantityForType(txn.transaction_type, txn.quantity);
    const prior = balanceByItem.get(itemKey) || 0;
    const running = round4(prior + signedQty);
    balanceByItem.set(itemKey, running);

    entries.push({
      ...txn,
      item_name: stock?.description || "—",
      item_code: stock?.item_code || "—",
      signed_quantity: signedQty,
      running_balance: running,
      reference_label: txn.notes || txn.reference_type,
    });
  }

  return entries.reverse();
}

export async function hasInventoryTransactionsForReference(
  supabase: SupabaseClient,
  companyId: string,
  referenceType: string,
  referenceId: string
) {
  const { count } = await supabase
    .from("vyron_cost_inventory_transactions")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("reference_type", referenceType)
    .eq("reference_id", referenceId);
  return (count || 0) > 0;
}

export async function postStoreOrderDispatchInventory(
  supabase: SupabaseClient,
  companyId: string,
  order: StoreOrderRow,
  actor?: string
) {
  if (await hasInventoryTransactionsForReference(supabase, companyId, "store_order_dispatch", order.id)) {
    return [];
  }

  const lines = order.lines || [];
  const transactions: InventoryTransactionRow[] = [];

  for (const line of lines) {
    const qty = round4(Number(line.quantity || 0));
    if (qty <= 0) continue;

    const { data: stock } = await supabase
      .from("vyron_cost_stock_items")
      .select("id, average_cost, current_cost")
      .eq("company_id", companyId)
      .eq("entity_type", "finished_goods")
      .eq("entity_id", line.product_id)
      .maybeSingle();

    let stockItemId = stock?.id ? String(stock.id) : null;
    const unitCost = round4(
      Number(stock?.average_cost || stock?.current_cost || line.unit_cost || 0)
    );

    if (!stockItemId) {
      const created = await findOrCreateStockItem(supabase, companyId, {
        entityType: "finished_goods",
        entityId: line.product_id,
        itemCode: `FG-${line.product_id.slice(0, 8).toUpperCase()}`,
        description: line.product_name_snapshot || "Finished Good",
        unit: line.unit || "unit",
        currentCost: unitCost,
      });
      stockItemId = created.id;
    }

    const txn = await postInventoryTransaction(supabase, {
      companyId,
      transactionType: "Issue",
      entityType: "finished_goods",
      entityId: line.product_id,
      stockItemId,
      quantity: qty,
      unitCost,
      referenceType: "store_order_dispatch",
      referenceId: order.id,
      referenceLabel: order.order_number,
      notes: `Dispatch ${order.order_number}: ${line.product_name_snapshot}`,
      createdBy: actor || "system",
      allowNegative: true,
    });
    transactions.push(txn);
  }

  return transactions;
}

export async function completeStoreProductionRunInventory(
  supabase: SupabaseClient,
  companyId: string,
  runId: string,
  actor?: string
): Promise<StoreProductionRunRow> {
  if (await hasInventoryTransactionsForReference(supabase, companyId, "store_production_run", runId)) {
    const existing = await getStoreProductionRunDetail(supabase, companyId, runId);
    if (!existing) throw new Error("Production run not found.");
    return existing;
  }

  const run = await getStoreProductionRunDetail(supabase, companyId, runId);
  if (!run) throw new Error("Production run not found.");
  if (run.status === "Completed") return run;
  if (run.status !== "Released" && run.status !== "Planned") {
    throw new Error(`Cannot complete production run from status ${run.status}.`);
  }

  const lines = (run.lines || []).map((line) => ({
    product_id: line.product_id,
    planned_qty: line.produced_qty > 0 ? line.produced_qty : line.planned_qty,
  }));

  const productBom = await loadProductBomMap(supabase, companyId);
  const ingredientBase = buildIngredientRequirements(lines, productBom);
  const requirements = await enrichIngredientShortages(supabase, companyId, ingredientBase);

  for (const req of requirements) {
    const qty = round4(req.required_qty);
    if (qty <= 0) continue;

    const { data: stock } = req.ingredient_id
      ? await supabase
          .from("vyron_cost_stock_items")
          .select("id, average_cost, current_cost")
          .eq("company_id", companyId)
          .eq("entity_type", "ingredient")
          .eq("entity_id", req.ingredient_id)
          .maybeSingle()
      : { data: null };

    let stockItemId = stock?.id ? String(stock.id) : null;
    const unitCost = round4(Number(stock?.average_cost || stock?.current_cost || 0));

    if (!stockItemId && req.ingredient_id) {
      const { data: ingredient } = await supabase
        .from("vyron_cost_ingredients")
        .select("ingredient_name, unit")
        .eq("id", req.ingredient_id)
        .eq("company_id", companyId)
        .maybeSingle();
      const created = await findOrCreateStockItem(supabase, companyId, {
        entityType: "ingredient",
        entityId: req.ingredient_id,
        itemCode: `ING-${req.ingredient_id.slice(0, 8).toUpperCase()}`,
        description: ingredient?.ingredient_name || req.ingredient_name,
        unit: ingredient?.unit || req.unit,
        currentCost: unitCost,
      });
      stockItemId = created.id;
    }

    if (!stockItemId) continue;

    await postInventoryTransaction(supabase, {
      companyId,
      transactionType: "Consumption",
      entityType: "ingredient",
      entityId: req.ingredient_id,
      stockItemId,
      quantity: qty,
      unitCost,
      referenceType: "store_production_run",
      referenceId: runId,
      referenceLabel: run.run_number,
      notes: `Production ${run.run_number}: ${req.ingredient_name}`,
      createdBy: actor || "system",
      allowNegative: true,
    });
  }

  const now = new Date().toISOString();
  const { error: runErr } = await supabase
    .from("vyron_cost_store_production_runs")
    .update({ status: "Completed", updated_at: now })
    .eq("company_id", companyId)
    .eq("id", runId);
  if (runErr) throw new Error(runErr.message);

  for (const line of run.lines || []) {
    const produced = line.produced_qty > 0 ? line.produced_qty : line.planned_qty;
    await supabase
      .from("vyron_cost_store_production_run_lines")
      .update({ produced_qty: produced, updated_at: now })
      .eq("id", line.id)
      .eq("company_id", companyId);
  }

  const detail = await getStoreProductionRunDetail(supabase, companyId, runId);
  if (!detail) throw new Error("Production run not found after completion.");
  return detail;
}

export async function getInventoryTransactionDashboardStats(
  supabase: SupabaseClient,
  companyId: string
): Promise<InventoryTransactionDashboardStats> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayIso = todayStart.toISOString();

  const [{ data: stockItems }, { count: movementsToday }, { count: adjustmentsToday }] = await Promise.all([
    supabase
      .from("vyron_cost_stock_items")
      .select("qty_on_hand, inventory_value")
      .eq("company_id", companyId),
    supabase
      .from("vyron_cost_inventory_transactions")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .gte("created_at", todayIso),
    supabase
      .from("vyron_cost_inventory_transactions")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("transaction_type", "Adjustment")
      .gte("created_at", todayIso),
  ]);

  const rows = stockItems || [];
  const inventoryValue = round2(rows.reduce((sum, row) => sum + Number(row.inventory_value || 0), 0));
  const negativeStockWarnings = rows.filter((row) => Number(row.qty_on_hand || 0) < 0).length;

  return {
    inventoryValue,
    stockMovementsToday: movementsToday || 0,
    negativeStockWarnings,
    stockAdjustments: adjustmentsToday || 0,
  };
}

export async function listStockItemsForMovements(supabase: SupabaseClient, companyId: string) {
  const { data, error } = await supabase
    .from("vyron_cost_stock_items")
    .select("id, item_code, description, entity_type, entity_id, unit, qty_on_hand, average_cost, current_cost")
    .eq("company_id", companyId)
    .order("description", { ascending: true });
  if (error) throw new Error(error.message);
  return (data || []).map((row) => ({
    id: String(row.id),
    item_code: String(row.item_code || ""),
    description: String(row.description || ""),
    entity_type: row.entity_type as StockEntityType,
    entity_id: row.entity_id ? String(row.entity_id) : null,
    unit: String(row.unit || ""),
    qty_on_hand: Number(row.qty_on_hand || 0),
    unit_cost: Number(row.average_cost || row.current_cost || 0),
  }));
}
